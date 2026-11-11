package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"sdr-next-pilot/internal/executionworker"
	"sdr-next-pilot/internal/metricsworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"testing"
	"time"
)

func metricClient(t *testing.T, a *App) *sdrsdk.Client {
	t.Helper()
	a.workerSecrets["metrics"] = sha256.Sum256([]byte("metrics-test-secret"))
	server := httptest.NewServer(a.privateWorkers())
	t.Cleanup(server.Close)
	return &sdrsdk.Client{Base: server.URL, Token: "metrics-test-secret", HTTP: server.Client()}
}
func projectMetrics(t *testing.T, a *App, source *sdrsdk.Client) *metricsworker.Store {
	t.Helper()
	store, e := metricsworker.Open(filepath.Join(t.TempDir(), "metrics.sqlite"))
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { _ = store.Close() })
	for i := 0; i < 10; i++ {
		cursor, _ := store.Cursor()
		batch, err := source.ReadMetricEvents(context.Background(), cursor)
		if err != nil {
			t.Fatal(err)
		}
		if err = store.Apply(batch, a.now()); err != nil {
			t.Fatal(err)
		}
		if len(batch.Events) < 500 {
			return store
		}
	}
	t.Fatal("metric batch did not settle")
	return nil
}
func TestMetricsCountAssignedWorkRetriesAndCausalSequence(t *testing.T) {
	a, creds, cq, eq, now := pipelineApp(t)
	metrics := metricClient(t, a)
	admin := login(t, a, creds, "alfa.admin")
	for i := 0; i < 4; i++ {
		if _, ok, err := eq.ClaimExecution(context.Background()); ok || err != nil {
			t.Fatal(err)
		}
	}
	batch, err := metrics.ReadMetricEvents(context.Background(), 0)
	if err != nil || len(batch.Events) != 0 {
		t.Fatal("empty polling was counted", err)
	}
	input(t, a, admin, "metric-input", "Sou Ana e quero o plano Essencial; segredo: nao-copiar-conteudo")
	*now = now.Add(6 * time.Second)
	prepare(t, cq)
	job, ok, err := eq.ClaimExecution(context.Background())
	if err != nil || !ok {
		t.Fatal(err)
	}
	if err = eq.FailExecution(context.Background(), job, "openai_http_429"); err != nil {
		t.Fatal(err)
	}
	*now = now.Add(4 * time.Second)
	worker := executionworker.Worker{Queue: eq, Planner: mockPlanner{Call: func(c sdrsdk.Prepared) sdrsdk.Outcome {
		o := answer()
		o.Decision.Facts[0].MessageID = c.History[0].ID
		return o
	}}}
	if _, err = worker.Once(context.Background()); err != nil {
		t.Fatal(err)
	}
	store := projectMetrics(t, a, metrics)
	report, err := store.Report(a.now(), 1, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Workers) != 2 || report.Workers[0].ID != "execution" || report.Workers[0].Starts != 2 || report.Workers[0].Jobs != 1 || report.Workers[0].Failed != 1 || report.Workers[0].Completed != 1 {
		t.Fatal("retry counters incorrect", report.Workers)
	}
	if len(report.Chains) != 1 || strings.Join(report.Chains[0].Workers, ",") != "context,execution" || report.Chains[0].Count != 1 {
		t.Fatal("sequence inferred incorrectly", report.Chains)
	}
	batch, err = metrics.ReadMetricEvents(context.Background(), 0)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(batch)
	for _, secret := range []string{"nao-copiar-conteudo", "Ana", job.Lease, "metrics-test-secret"} {
		if strings.Contains(string(raw), secret) {
			t.Fatal("content or authority leaked")
		}
	}
	before := report.Monitor.Events
	if err = store.Apply(batch, a.now()); err != nil {
		t.Fatal(err)
	}
	report, _ = store.Report(a.now(), 1, "")
	if report.Monitor.Events != before || report.Workers[0].Starts != 2 {
		t.Fatal("replayed feed counted twice")
	}
	beta, _ := store.Report(a.now(), 1, "org_demo_beta")
	if len(beta.Workers) != 0 || len(beta.Heat) != 0 || len(beta.Chains) != 0 {
		t.Fatal("company filter leaked")
	}
}

func TestMetricsAtomicJournalAndReadOnlyAuthority(t *testing.T) {
	a, creds, cq, _, now := pipelineApp(t)
	source := metricClient(t, a)
	admin := login(t, a, creds, "alfa.admin")
	input(t, a, admin, "metric-rollback", "Quero conhecer o plano")
	*now = now.Add(6 * time.Second)
	a.failSave = true
	if _, _, err := cq.ClaimContext(context.Background()); err == nil {
		t.Fatal("injected commit failure ignored")
	}
	a.failSave = false
	batch, err := source.ReadMetricEvents(context.Background(), 0)
	if err != nil || len(batch.Events) != 0 {
		t.Fatal("rolled-back task counted", err)
	}
	job, ok, err := cq.ClaimContext(context.Background())
	if !ok || err != nil {
		t.Fatal(err)
	}
	if _, ok, err = cq.ClaimContext(context.Background()); ok || err != nil {
		t.Fatal("leased task double claimed", err)
	}
	batch, _ = source.ReadMetricEvents(context.Background(), 0)
	if len(batch.Events) != 1 || batch.Events[0].Phase != "start" {
		t.Fatal("claim not counted exactly once")
	}
	// Metrics role cannot claim/finish a business worker, even with its own token.
	bad := *cq
	bad.Token = source.Token
	if _, _, err = bad.ClaimContext(context.Background()); err == nil {
		t.Fatal("observer claimed context work")
	}
	bad = *source
	bad.Token = cq.Token
	if _, err = bad.ReadMetricEvents(context.Background(), 0); err == nil {
		t.Fatal("context worker read global customer metrics")
	}
	// Human takeover closes the current attempt; no model/transport calls.
	c := a.state.Conversations["conv_demo_alfa"]
	code, _ := req(a, "POST", "/v1/sdr/conversations/"+c.ID+"/actions", admin, token(), map[string]any{"kind": "takeover", "reason": "Controle humano", "expected_revision": c.Revision})
	if code != 200 {
		t.Fatal(code)
	}
	batch, _ = source.ReadMetricEvents(context.Background(), 0)
	if len(batch.Events) != 2 || batch.Events[1].Outcome != "cancelled" {
		t.Fatal("takeover not observed", batch.Events)
	}
	if strings.Contains(string(mustJSON(batch)), job.Lease) {
		t.Fatal("private lease leaked")
	}
}
func mustJSON(v any) []byte { b, _ := json.Marshal(v); return b }

func TestMetricsMediaOperationAndWhatsAppLineage(t *testing.T) {
	a, _, f, _, eq, _, admin := realSetup(t)
	source := metricClient(t, a)
	mq := enableMediaTest(t, a)
	mediaID := preparedLibraryVideo(t, a, admin, mq)
	f.inbox = []realInbound{realEvent(a)}
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	f.inbox = nil
	var c *Conversation
	for _, candidate := range a.state.Conversations {
		if candidate.Channel == "whatsapp" {
			c = candidate
		}
	}
	publishPlatform(t, a, admin, mediaFlow("automatic"))
	id := createOp(t, a, admin, "video_cliente", "apply", map[string]string{"conversation_id": c.ID, "media_id": mediaID})
	driveOps(t, a, eq, id)
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	m := a.state.Messages[c.ID][1]
	env := f.out[m.ID]
	if permit(t, a, env, "metric-transport-claim") != 200 {
		t.Fatal("permit failed")
	}
	a.mu.Lock()
	err := a.transact(func() { a.realStatus(a.state.Transport.Deliveries[m.ID], "sent", "provider-test") })
	a.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	store := projectMetrics(t, a, source)
	report, err := store.Report(a.now(), 1, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Workers) != 3 {
		t.Fatal("missing worker activation", report.Workers)
	}
	if len(report.Chains) != 1 {
		t.Fatal("unexpected independent chains", report.Chains)
	}
	found := false
	for _, chain := range report.Chains {
		if strings.Join(chain.Workers, ",") == "media,execution,whatsapp" {
			found = true
		}
	}
	if !found {
		t.Fatal("workflow did not parent actual transport", report.Chains)
	}
}

func TestMetricsOpsAuthorityIsSeparateFromCustomers(t *testing.T) {
	a, creds, _, _, _ := pipelineApp(t)
	source := metricClient(t, a)
	store := projectMetrics(t, a, source)
	secret := strings.Repeat("o", 48)
	private := httptest.NewServer(store.Handler("Bearer private-metrics-role"))
	defer private.Close()
	a.ops = newMetricsOps(secret, "private-metrics-role", private.URL)
	admin := login(t, a, creds, "alfa.admin")
	if code, _ := req(a, "GET", "/v1/ops/metrics/report", admin, "", nil); code != 401 {
		t.Fatal("customer admin accessed all customers", code)
	}
	code, result := req(a, "POST", "/v1/ops/metrics/login", "", "", map[string]any{"access_code": secret})
	if code != 200 {
		t.Fatal(code, result)
	}
	operator := result["access_token"].(string)
	if code, result = req(a, "GET", "/v1/ops/metrics/report?days=7", operator, "", nil); code != 200 || result["workers"] == nil {
		t.Fatal(code, result)
	}
	if code, _ = req(a, "GET", "/v1/sdr/conversations", operator, "", nil); code != 401 {
		t.Fatal("metrics session became customer authority", code)
	}
	if code, _ = req(a, "GET", "/v1/ops/metrics/report?days=900", operator, "", nil); code != 422 {
		t.Fatal("unbounded query", code)
	}
}
