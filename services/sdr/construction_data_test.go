package main

import (
	"context"
	"deeph/pkg/application"
	"deeph/pkg/construction"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type dataProcess struct {
	*fakePreviewProcess
	reply func(construction.RuntimeRequest) construction.RuntimeReply
}

func (p *dataProcess) Call(_ context.Context, in construction.RuntimeRequest) (construction.RuntimeReply, error) {
	if p.reply != nil {
		return p.reply(in), nil
	}
	if in.Method == "POST" {
		return construction.RuntimeReply{Status: 200, Body: `{"saved":true}`, ContentType: "application/json", DataWrite: &construction.DataWrite{Value: json.RawMessage(in.Body)}}, nil
	}
	if in.Data == nil || !in.Data.Found {
		return construction.RuntimeReply{Status: 404, Body: "missing"}, nil
	}
	return construction.RuntimeReply{Status: 200, Body: string(in.Data.Value), ContentType: "application/json"}, nil
}
func dataStarter(a *App, reply func(construction.RuntimeRequest) construction.RuntimeReply) {
	a.runtimeStart = func(context.Context, string, *application.Contract, map[string]string) (construction.Runtime, error) {
		return &dataProcess{fakePreviewProcess: &fakePreviewProcess{done: make(chan struct{})}, reply: reply}, nil
	}
}
func startData(t *testing.T, a *App, key, id string) {
	t.Helper()
	if code, out := req(a, "POST", dataBase(id)+"/start", key, "", map[string]any{}); code != 202 {
		t.Fatal(code, out)
	}
	waitPreview(t, a, key, id)
}
func dataBase(id string) string { return "/v1/sdr/genesis-demo/construction/" + id + "/runtime" }
func dataCall(a *App, key, id, method, body string) (int, map[string]any) {
	path := "/api/history"
	if method == "POST" {
		path = "/api/calculate"
	}
	return req(a, "POST", dataBase(id)+"/request", key, "", construction.RuntimeRequest{Method: method, Path: path, Body: body})
}
func stopData(t *testing.T, a *App, key, id string) {
	t.Helper()
	if code, out := req(a, "POST", dataBase(id)+"/stop", key, "", map[string]any{}); code != 200 {
		t.Fatal(code, out)
	}
}
func cloneDataBuild(t *testing.T, a *App, original *ConstructionBuild, id, org, appID string, revision int) {
	t.Helper()
	b := *original
	b.ID = id
	b.Org = org
	b.ApplicationID = appID
	b.Revision = revision
	var err error
	b.Contract, err = application.Seal(appID, revision, b.Files)
	if err != nil {
		t.Fatal(err)
	}
	a.state.Platform.Constructions[id] = &b
}
func TestPreviewDataSurvivesRestartAndIsScopedByCompanyAndApplication(t *testing.T) {
	a, creds, db := genesisApp(t)
	b := previewBuild(t, a)
	dataStarter(a, nil)
	cloneDataBuild(t, a, b, "beta", "org_demo_beta", b.ApplicationID, 1)
	cloneDataBuild(t, a, b, "other", b.Org, "app_other", 1)
	cloneDataBuild(t, a, b, "revision2", b.Org, b.ApplicationID, 2)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	viewer := login(t, a, creds, "alfa.viewer")
	startData(t, a, admin, b.ID)
	marker := `{"note":"private-alpha-note","organization_id":"org_demo_beta","application_id":"app_other"}`
	if code, out := dataCall(a, admin, b.ID, "POST", marker); code != 200 || out["data_write"] != nil {
		t.Fatal(code, out)
	}
	if code, out := dataCall(a, admin, b.ID, "GET", ""); code != 200 || out["body"] != marker {
		t.Fatal(code, out)
	}
	if code, _ := dataCall(a, viewer, b.ID, "POST", `{}`); code != 403 {
		t.Fatal("viewer write", code)
	}
	if code, _ := dataCall(a, beta, b.ID, "GET", ""); code != 404 {
		t.Fatal("tenant leak", code)
	}
	if code, _ := req(a, "POST", dataBase(b.ID)+"/request", admin, "", map[string]any{"method": "GET", "path": "/api/history", "body": "", "data": map[string]any{"found": true, "value": "forged"}}); code != 400 {
		t.Fatal("browser supplied internal snapshot", code)
	}
	_, project := req(a, "GET", "/v1/sdr/genesis-demo/construction/"+b.ID, admin, "", nil)
	raw, _ := json.Marshal(project)
	if strings.Contains(string(raw), "private-alpha-note") {
		t.Fatal("data leaked to construction/model context")
	}
	startData(t, a, beta, "beta")
	if code, out := dataCall(a, beta, "beta", "GET", ""); code != 200 || out["status"] != float64(404) {
		t.Fatal("same app ID crossed tenants", code, out)
	}
	if code, out := dataCall(a, beta, "beta", "POST", `{"note":"beta"}`); code != 200 {
		t.Fatal(code, out)
	}
	stopData(t, a, admin, b.ID)
	startData(t, a, admin, "other")
	if code, out := dataCall(a, admin, "other", "GET", ""); code != 200 || out["status"] != float64(404) {
		t.Fatal("cross-application read", code, out)
	}
	if code, out := dataCall(a, admin, "other", "POST", `{"note":"other"}`); code != 200 {
		t.Fatal(code, out)
	}
	stopData(t, a, admin, "other")
	startData(t, a, admin, "revision2")
	if code, out := dataCall(a, admin, "revision2", "GET", ""); code != 200 || out["body"] != marker {
		t.Fatal("revision lost application data", code, out)
	}
	var audits int
	if err := a.db.QueryRow("SELECT COUNT(*) FROM audit WHERE action='preview.data_saved'").Scan(&audits); err != nil || audits != 3 {
		t.Fatal("missing commit receipts", audits, err)
	}
	if err := a.Close(); err != nil {
		t.Fatal(err)
	}
	restored, nextCreds, err := newApp(db)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	dataStarter(restored, nil)
	admin = login(t, restored, nextCreds, "alfa.admin")
	startData(t, restored, admin, "revision2")
	if code, out := dataCall(restored, admin, "revision2", "GET", ""); code != 200 || out["body"] != marker {
		t.Fatal("restart lost data", code, out)
	}
}
func TestPreviewDataDoesNotAcknowledgeFailedOrInvalidWrites(t *testing.T) {
	for _, kind := range []string{"commit_failure", "oversize", "invalid_json", "handler_failure", "no_database"} {
		t.Run(kind, func(t *testing.T) {
			a, creds, _ := genesisApp(t)
			b := previewBuild(t, a)
			dataStarter(a, nil)
			admin := login(t, a, creds, "alfa.admin")
			startData(t, a, admin, b.ID)
			if code, _ := dataCall(a, admin, b.ID, "POST", `{"saved":"original"}`); code != 200 {
				t.Fatal(code)
			}
			stopData(t, a, admin, b.ID)
			body := `{"saved":"replacement"}`
			status := 200
			expected := 503
			switch kind {
			case "oversize":
				body = `"` + strings.Repeat("a", construction.MaxDataBytes) + `"`
				expected = 502
			case "invalid_json":
				body = `{`
				expected = 502
			case "handler_failure":
				status = 500
				expected = 200
			}
			dataStarter(a, func(construction.RuntimeRequest) construction.RuntimeReply {
				return construction.RuntimeReply{Status: status, Body: "result", DataWrite: &construction.DataWrite{Value: json.RawMessage(body)}}
			})
			startData(t, a, admin, b.ID)
			if kind == "commit_failure" {
				a.failSave = true
			}
			if kind == "no_database" {
				a.db.Close()
				a.db = nil
			}
			code, out := dataCall(a, admin, b.ID, "POST", `{}`)
			a.failSave = false
			if code != expected || out["data_write"] != nil {
				t.Fatal(code, out)
			}
			doc := a.state.Platform.PreviewData[b.Org][b.ApplicationID]
			if doc.Version != 1 || string(doc.Value) != `{"saved":"original"}` {
				t.Fatal("failed write changed state", doc)
			}
			if a.db != nil {
				var count int
				if err := a.db.QueryRow("SELECT COUNT(*) FROM audit WHERE action='preview.data_saved'").Scan(&count); err != nil || count != 1 {
					t.Fatal("failed write published audit", count, err)
				}
			}
		})
	}
}
func TestPreviewDataRejectsLateAndConflictingWrites(t *testing.T) {
	for _, kind := range []string{"stopped", "restarted", "conflict"} {
		t.Run(kind, func(t *testing.T) {
			a, creds, _ := genesisApp(t)
			b := previewBuild(t, a)
			admin := login(t, a, creds, "alfa.admin")
			entered, release := make(chan struct{}), make(chan struct{})
			dataStarter(a, func(construction.RuntimeRequest) construction.RuntimeReply {
				close(entered)
				<-release
				return construction.RuntimeReply{Status: 200, Body: "saved", DataWrite: &construction.DataWrite{Value: json.RawMessage(`"late"`)}}
			})
			startData(t, a, admin, b.ID)
			result := make(chan int, 1)
			go func() { code, _ := dataCall(a, admin, b.ID, "POST", `{}`); result <- code }()
			<-entered
			if kind == "conflict" {
				a.mu.Lock()
				err := a.savePreviewData(User{Org: b.Org, ID: "admin"}, b.ApplicationID, 0, json.RawMessage(`"newer"`))
				a.mu.Unlock()
				if err != nil {
					t.Fatal(err)
				}
			} else {
				stopData(t, a, admin, b.ID)
			}
			if kind == "restarted" {
				dataStarter(a, nil)
				startData(t, a, admin, b.ID)
				if code, _ := dataCall(a, admin, b.ID, "POST", `"newer"`); code != 200 {
					t.Fatal(code)
				}
			}
			close(release)
			select {
			case code := <-result:
				if code != 409 {
					t.Fatal("late write accepted", code)
				}
			case <-time.After(time.Second):
				t.Fatal("request stuck")
			}
			doc := a.state.Platform.PreviewData[b.Org][b.ApplicationID]
			if kind == "stopped" {
				if doc != nil {
					t.Fatal("stopped process wrote data")
				}
			} else if doc == nil || string(doc.Value) != `"newer"` || doc.Version != 1 {
				t.Fatal("stale snapshot overwrote newer data", doc)
			}
		})
	}
}
func noteBuild(t *testing.T, a *App) *ConstructionBuild {
	return dataFixtureBuild(t, a, "note")
}
func dataFixtureBuild(t *testing.T, a *App, fixture string) *ConstructionBuild {
	t.Helper()
	files := construction.Seed()
	root := "../../packages/deeph/pkg/construction/testdata/" + fixture
	if err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		name, _ := filepath.Rel(root, p)
		raw, err := os.ReadFile(p)
		files[filepath.ToSlash(name)] = string(raw)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	contract, err := application.Seal("app_"+fixture, 1, files)
	if err != nil {
		t.Fatal(err)
	}
	b := &ConstructionBuild{ID: fixture, ApplicationID: "app_" + fixture, Revision: 1, Org: "org_demo_alfa", Status: "ready", Files: files, Contract: contract}
	a.state.Platform.Constructions = map[string]*ConstructionBuild{b.ID: b}
	return b
}
func TestRuntimeIntegrationDocumentPersistence(t *testing.T) {
	if os.Getenv("ARKOM_RUNTIME_INTEGRATION") != "true" {
		t.Skip("requires isolated executor; enabled in CI")
	}
	a, creds, db := genesisApp(t)
	b := noteBuild(t, a)
	admin := login(t, a, creds, "alfa.admin")
	startData(t, a, admin, b.ID)
	code, out := req(a, "POST", dataBase(b.ID)+"/request", admin, "", construction.RuntimeRequest{Method: "POST", Path: "/api/note", Body: `{"text":"continue depois do reinício","organization_id":"forged"}`})
	if code != 200 || out["status"] != float64(200) || out["data_write"] != nil {
		t.Fatal(code, out)
	}
	var saved map[string]any
	if json.Unmarshal([]byte(out["body"].(string)), &saved) != nil || saved["saved"] != true {
		t.Fatal("write not acknowledged", out)
	}
	a.runtimeMu.Lock()
	proc := a.runtimes[b.ID].process
	a.runtimeMu.Unlock()
	stopData(t, a, admin, b.ID)
	select {
	case <-proc.Done():
	case <-time.After(10 * time.Second):
		t.Fatal("old process did not stop")
	}
	a.Close()
	restored, nextCreds, err := newApp(db)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	admin = login(t, restored, nextCreds, "alfa.admin")
	startData(t, restored, admin, b.ID)
	code, out = req(restored, "POST", dataBase(b.ID)+"/request", admin, "", construction.RuntimeRequest{Method: "GET", Path: "/api/note"})
	if code != 200 || out["status"] != float64(200) {
		t.Fatal(code, out)
	}
	var value struct {
		Note struct {
			Text string `json:"text"`
		} `json:"note"`
		Org string `json:"organization_id"`
	}
	if json.Unmarshal([]byte(fmt.Sprint(out["body"])), &value) != nil || value.Note.Text != "continue depois do reinício" || value.Org != "org_demo_alfa" {
		t.Fatal("persistent document/identity mismatch", out)
	}
}
