package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sdr-next-pilot/internal/dataworker"
	"sdr-next-pilot/internal/metricsworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"testing"
	"time"
)

func dataApp(t *testing.T) (*App, map[string]string) {
	t.Helper()
	a, creds, e := newApp(filepath.Join(t.TempDir(), "state.sqlite"))
	if e != nil {
		t.Fatal(e)
	}
	if e = a.configureCustomerData(); e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { _ = a.Close() })
	return a, creds
}
func dataQuery(a *App, tok, query string, vars map[string]any) (int, map[string]any) {
	return req(a, "POST", "/v1/customer/graphql", tok, "", map[string]any{"query": query, "variables": vars})
}

func TestCustomerGraphQLUsesSessionScopePaginationAndBudgets(t *testing.T) {
	a, creds := dataApp(t)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	operator := login(t, a, creds, "alfa.operator")
	for _, company := range []string{"alfa", "beta"} {
		c := a.state.Conversations["conv_demo_"+company]
		a.message(c, "private-message-"+company, "lead")
		a.message(c, "second-message-"+company, "lead")
	}
	q := `query($after:String){customer{organizationId records(collection:"messages",first:1,after:$after){items{id data} nextCursor hasMore}}}`
	code, body := dataQuery(a, admin, q, nil)
	if code != 200 || body["errors"] != nil {
		t.Fatal(code, body)
	}
	raw, _ := json.Marshal(body)
	if strings.Contains(string(raw), "private-message-beta") || strings.Contains(string(raw), "org_demo_beta") {
		t.Fatal("tenant leaked", string(raw))
	}
	customer := body["data"].(map[string]any)["customer"].(map[string]any)
	page := customer["records"].(map[string]any)
	if page["hasMore"] != true || len(page["items"].([]any)) != 1 {
		t.Fatal("pagination", body)
	}
	cursor := page["nextCursor"].(string)
	_, next := dataQuery(a, admin, q, map[string]any{"after": cursor})
	if next["errors"] != nil {
		t.Fatal(next)
	}
	_, cross := dataQuery(a, beta, q, map[string]any{"after": cursor})
	if cross["errors"] == nil {
		t.Fatal("cross tenant cursor accepted")
	}
	_, spoof := dataQuery(a, admin, `{customer(organizationId:"org_demo_beta"){organizationId}}`, nil)
	if spoof["errors"] == nil {
		t.Fatal("arbitrary company argument accepted")
	}
	_, large := dataQuery(a, admin, `{customer{records(collection:"messages",first:1000){items{id}}}}`, nil)
	if large["errors"] == nil {
		t.Fatal("unbounded page")
	}
	_, aliases := dataQuery(a, admin, `{customer{a:records(collection:"messages",first:100){hasMore} b:records(collection:"messages",first:100){hasMore} c:records(collection:"messages",first:100){hasMore} d:records(collection:"messages",first:100){hasMore} e:records(collection:"messages",first:100){hasMore} f:records(collection:"messages",first:100){hasMore}}}`, nil)
	if aliases["errors"] == nil {
		t.Fatal("query row budget missing")
	}
	if code, _ = dataQuery(a, operator, q, nil); code != 403 {
		t.Fatal("operator bulk access", code)
	}
	if code, _ = dataQuery(a, "", q, nil); code != 401 {
		t.Fatal("anonymous bulk access", code)
	}
}

func TestCustomerExportRetainedDataFilesAuditAndCrossTenant(t *testing.T) {
	a, creds := dataApp(t)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	for _, company := range []string{"alfa", "beta"} {
		c := a.state.Conversations["conv_demo_"+company]
		a.message(c, "export-secret-"+company, "lead")
	}
	a.state.Pipeline.Runs["run-alfa"] = &ExecutionRun{ID: "run-alfa", Org: "org_demo_alfa", Conversation: "conv_demo_alfa", Lease: "WORKER-LEASE-NEVER-EXPORT", ResponseID: "PRIVATE-PROVIDER-RESPONSE", CreatedAt: a.now(), Status: "completed"}
	content := []byte("only alfa file bytes")
	hash := sha256.Sum256(content)
	id := strings.Repeat("a", 48)
	a.state.Media.Assets[id] = &MediaAsset{ID: id, Organization: "org_demo_alfa", Conversation: "conv_demo_alfa", Direction: "inbound", File: sdrsdk.MediaFile{Name: "../../name.txt", Kind: "document", MIME: "application/pdf", Size: len(content), SHA256: hex.EncodeToString(hash[:])}, Status: "ready", Created: a.now(), Expires: a.now().Add(time.Hour)}
	if e := a.putMediaBlob(id, "org_demo_alfa", content, a.now().Add(time.Hour)); e != nil {
		t.Fatal(e)
	}
	expired := strings.Repeat("b", 48)
	a.state.Media.Assets[expired] = &MediaAsset{ID: expired, Organization: "org_demo_alfa", Direction: "inbound", Expires: a.now().Add(-time.Hour)}
	code, created := req(a, "POST", "/v1/customer/exports", admin, "download-one", map[string]any{})
	if code != 202 {
		t.Fatal(code, created)
	}
	jobID := created["id"].(string)
	code, replayed := req(a, "POST", "/v1/customer/exports", admin, "download-one", map[string]any{})
	if code != 202 || replayed["id"] != jobID {
		t.Fatal("idempotency", code, replayed)
	}
	if code, _ = req(a, "POST", "/v1/customer/exports", admin, "other", map[string]any{}); code != 409 {
		t.Fatal("parallel export", code)
	}
	if ok, e := a.dataExportOnce(context.Background()); !ok || e != nil {
		t.Fatal(ok, e)
	}
	if a.state.CustomerExports[jobID].Status != "ready" {
		t.Fatal(a.state.CustomerExports[jobID])
	}
	path := "/v1/customer/exports/" + jobID + "/content"
	if code, _ = req(a, "GET", path, beta, "", nil); code != 404 {
		t.Fatal("cross-company download", code)
	}
	r := httptest.NewRequest("GET", path, nil)
	r.Header.Set("Authorization", "Bearer "+admin)
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(w.Code, w.Body.String())
	}
	archive, e := zip.NewReader(bytes.NewReader(w.Body.Bytes()), int64(w.Body.Len()))
	if e != nil {
		t.Fatal(e)
	}
	var all strings.Builder
	mediaCount := 0
	var manifest map[string]any
	for _, f := range archive.File {
		if strings.Contains(f.Name, "..") || strings.HasPrefix(f.Name, "/") {
			t.Fatal("unsafe path", f.Name)
		}
		reader, _ := f.Open()
		b, _ := io.ReadAll(reader)
		reader.Close()
		all.Write(b)
		if strings.HasPrefix(f.Name, "media/") {
			mediaCount++
		}
		if f.Name == "manifest.json" {
			_ = json.Unmarshal(b, &manifest)
		}
	}
	for _, secret := range []string{"export-secret-beta", "WORKER-LEASE-NEVER-EXPORT", "PRIVATE-PROVIDER-RESPONSE", creds["alfa.admin"], creds["beta.admin"]} {
		if strings.Contains(all.String(), secret) {
			t.Fatal("archive leaked private data")
		}
	}
	if !strings.Contains(all.String(), "export-secret-alfa") || !strings.Contains(all.String(), "only alfa file bytes") || mediaCount != 1 || manifest["unavailable_files"] != float64(1) {
		t.Fatal("missing customer data or expiry metadata", manifest)
	}
	if !strings.Contains(manifest["coverage"].(map[string]any)["worker_usage"].(string), "Unavailable") {
		t.Fatal("metrics outage hidden")
	}
	code, audit := req(a, "GET", "/v1/sdr/audit?limit=100", admin, "", nil)
	if code != 200 || !strings.Contains(string(customerTestJSON(audit)), "customer.export.downloaded") {
		t.Fatal("download not audited")
	}
	a.state.CustomerExports[jobID].ExpiresAt = a.now().Add(-time.Second)
	if code, _ = req(a, "GET", path, admin, "", nil); code != 410 {
		t.Fatal("expired download", code)
	}
}
func customerTestJSON(v any) []byte { b, _ := json.Marshal(v); return b }

func TestCustomerExportPersistsAndRollsBack(t *testing.T) {
	a, creds := dataApp(t)
	admin := login(t, a, creds, "alfa.admin")
	a.failSave = true
	if code, _ := req(a, "POST", "/v1/customer/exports", admin, "rollback", map[string]any{}); code != 503 || len(a.state.CustomerExports) != 0 {
		t.Fatal("export create not atomic")
	}
	a.failSave = false
	code, body := req(a, "POST", "/v1/customer/exports", admin, "persist", map[string]any{})
	if code != 202 {
		t.Fatal(code, body)
	}
	id := body["id"].(string)
	file := a.file
	if e := a.Close(); e != nil {
		t.Fatal(e)
	}
	restarted, newCreds, e := newApp(file)
	if e != nil {
		t.Fatal(e)
	}
	defer restarted.Close()
	if e = restarted.configureCustomerData(); e != nil {
		t.Fatal(e)
	}
	if restarted.state.CustomerExports[id] == nil {
		t.Fatal("job lost on restart")
	}
	if ok, e := restarted.dataExportOnce(context.Background()); !ok || e != nil {
		t.Fatal(ok, e)
	}
	tok := login(t, restarted, newCreds, "alfa.admin")
	if code, _ := req(restarted, "GET", "/v1/customer/exports/"+id, tok, "", nil); code != 200 {
		t.Fatal("persisted export unavailable", code)
	}
	if _, e = os.Stat(filepath.Join(restarted.customerDirectory, id+".zip")); e != nil {
		t.Fatal(e)
	}
}

func TestCustomerMetricsProjectionContainsOnlyItsCompany(t *testing.T) {
	a, creds := dataApp(t)
	store, e := metricsworker.Open(filepath.Join(t.TempDir(), "metrics.sqlite"))
	if e != nil {
		t.Fatal(e)
	}
	defer store.Close()
	now := a.now()
	events := []sdrsdk.WorkerMetricEvent{}
	for i, org := range []string{"org_demo_alfa", "org_demo_beta"} {
		attempt := sdrsdk.Digest(org)
		events = append(events, sdrsdk.WorkerMetricEvent{SchemaVersion: 1, Sequence: int64(i + 1), ID: attempt + ":start", Organization: org, Worker: "context", Job: sdrsdk.MetricJob(org, "context", "job"), Attempt: attempt, Phase: "start", Kind: "conversation", Mode: "real", Parents: []string{}, At: now})
	}
	if e = store.Apply(sdrsdk.WorkerMetricBatch{Source: "data-test", CollectedSince: now, Head: 2, Floor: 1, Events: events}, now); e != nil {
		t.Fatal(e)
	}
	server := httptest.NewServer(store.Handler("Bearer internal-only"))
	defer server.Close()
	a.ops = newMetricsOps(strings.Repeat("a", 48), "internal-only", server.URL)
	tok := login(t, a, creds, "alfa.admin")
	code, body := dataQuery(a, tok, `{customer{workerUsage(days:1){available report}}}`, nil)
	if code != 200 || body["errors"] != nil {
		t.Fatal(code, body)
	}
	raw := string(customerTestJSON(body))
	if strings.Contains(raw, "org_demo_beta") || strings.Contains(raw, "monitor") || strings.Contains(raw, "internal-only") {
		t.Fatal("metrics tenant leak", raw)
	}
	if !strings.Contains(raw, `"available":true`) || !strings.Contains(raw, `"starts":1`) {
		t.Fatal(raw)
	}
}

func TestDataWorkerDoesNotTrustPathsAndDetectsCorruption(t *testing.T) {
	var dst bytes.Buffer
	b := []byte("original")
	sum := sha256.Sum256(b)
	s := dataworker.Snapshot{Organization: "org_demo_alfa", CapturedAt: time.Now(), Files: []dataworker.File{{ID: "file", AssetID: "asset", Name: "../../escape", Path: "../../escape", Status: "available", Size: int64(len(b)), SHA256: hex.EncodeToString(sum[:])}}}
	_, e := dataworker.Build(context.Background(), &dst, s, func(context.Context, dataworker.File) ([]byte, error) { return []byte("tampered"), nil })
	if e == nil {
		t.Fatal("corrupt media accepted")
	}
	dst.Reset()
	_, e = dataworker.Build(context.Background(), &dst, s, func(context.Context, dataworker.File) ([]byte, error) { return b, nil })
	if e != nil {
		t.Fatal(e)
	}
	z, _ := zip.NewReader(bytes.NewReader(dst.Bytes()), int64(dst.Len()))
	for _, f := range z.File {
		if strings.Contains(f.Name, "..") {
			t.Fatal("path injection")
		}
	}
}

func TestCustomerEveryProjectionExcludesOtherCompanyAndWorkerSecrets(t *testing.T) {
	a, _ := dataApp(t)
	for _, company := range []string{"alfa", "beta"} {
		org := "org_demo_" + company
		conv := "conv_demo_" + company
		text := "CUSTOMER-SECRET-" + company
		c := a.state.Conversations[conv]
		c.Label = text
		a.message(c, text, "lead")
		a.state.Pipeline.Memory[conv] = map[string]sdrsdk.Fact{"name": {Key: "name", Value: text}}
		a.state.Business[org].Draft.Description = text
		a.state.Platform.Workspaces[org].Draft.Workflows[0].Description = text
		a.state.Pipeline.Windows[conv] = &ContextWindow{ID: "context-" + company, Org: org, Conversation: conv, Lease: "PRIVATE-WORKER-LEASE", Error: text}
		a.state.Pipeline.Runs[company] = &ExecutionRun{ID: company, Org: org, Conversation: conv, Lease: "PRIVATE-WORKER-LEASE", SuggestedResponse: text}
		a.state.ContextReceipts[company] = ContextReceipt{ID: company, Organization: org, Conversation: conv, Solution: text}
		a.state.Media.Assets[company] = &MediaAsset{ID: company, Organization: org, Conversation: conv, File: sdrsdk.MediaFile{Name: text}}
		a.state.Media.Jobs[company] = &mediaTask{ID: company, Org: org, Conversation: conv, Lease: "PRIVATE-WORKER-LEASE", File: sdrsdk.MediaFile{Name: text}}
		a.state.Platform.Notes[company] = InternalNote{ID: company, Org: org, Conversation: conv, Text: text}
		a.state.Transport.Deliveries[company] = &realDelivery{Envelope: realEnvelope{ID: company, Organization: org, Conversation: conv, Text: text, Epoch: "PRIVATE-WHATS-EPOCH"}, Claim: "PRIVATE-WORKER-LEASE"}
		a.state.Platform.Executions[company] = &PlatformExecution{ID: company, Org: org, Lease: "PRIVATE-WORKER-LEASE", Input: map[string]string{"given": text}, Config: clonePlatform(a.state.Platform.Workspaces[org].Draft)}
		a.record(AuditEntry{Org: org, Actor: "test", Action: "test", Reason: text})
		_, e := a.db.Exec("INSERT INTO whatsapp_channels(organization_id,provisioning,view) VALUES(?,?,?)", org, "ready", `{"status":"connected","pairing_code":"PRIVATE-PAIRING-CODE","qr_data_url":"PRIVATE-QR"}`)
		if e != nil {
			t.Fatal(e)
		}
	}
	if e := a.save(); e != nil {
		t.Fatal(e)
	}
	for _, collection := range customerCollections {
		records, e := a.customerRecords("org_demo_alfa", collection)
		if e != nil {
			t.Fatal(collection, e)
		}
		raw := string(customerTestJSON(records))
		for _, secret := range []string{"CUSTOMER-SECRET-beta", "org_demo_beta", "PRIVATE-WORKER-LEASE", "PRIVATE-WHATS-EPOCH", "PRIVATE-PAIRING-CODE", "PRIVATE-QR"} {
			if strings.Contains(raw, secret) {
				t.Fatal("projection leak", collection, secret)
			}
		}
	}
}

func TestCustomerExportRecoversFinalCommitFailure(t *testing.T) {
	a, creds := dataApp(t)
	admin := login(t, a, creds, "alfa.admin")
	_, body := req(a, "POST", "/v1/customer/exports", admin, "retry-after-commit", map[string]any{})
	id := body["id"].(string)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		a.failSave = true
		a.mu.Unlock()
		w.WriteHeader(503)
	}))
	defer server.Close()
	a.ops = newMetricsOps(strings.Repeat("a", 48), "metrics-only", server.URL)
	if _, e := a.dataExportOnce(context.Background()); e == nil {
		t.Fatal("expected final commit failure")
	}
	if a.state.CustomerExports[id].Status != "running" {
		t.Fatal("failed transaction not rolled back")
	}
	a.failSave = false
	a.ops = nil
	if _, e := a.dataExportOnce(context.Background()); e != nil {
		t.Fatal(e)
	}
	if a.state.CustomerExports[id].Status != "ready" {
		t.Fatal("stalled export was not recovered")
	}
}
