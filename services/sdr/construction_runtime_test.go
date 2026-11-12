package main

import (
	"context"
	"deeph/pkg/application"
	"deeph/pkg/construction"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakePreviewProcess struct {
	done  chan struct{}
	once  sync.Once
	calls int
}

func (p *fakePreviewProcess) Close()                { p.once.Do(func() { close(p.done) }) }
func (p *fakePreviewProcess) Done() <-chan struct{} { return p.done }
func (p *fakePreviewProcess) Call(_ context.Context, in construction.RuntimeRequest) (construction.RuntimeReply, error) {
	p.calls++
	return construction.RuntimeReply{Status: 200, Body: `{"result":42}`, ContentType: "application/json"}, nil
}
func previewBuild(t *testing.T, a *App) *ConstructionBuild {
	t.Helper()
	files := construction.Seed()
	root := "../../packages/deeph/pkg/construction/testdata/calculator"
	err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
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
	})
	if err != nil {
		t.Fatal(err)
	}
	c, err := application.Seal("app_calculator", 1, files)
	if err != nil {
		t.Fatal(err)
	}
	b := &ConstructionBuild{ID: "calculator", ApplicationID: "app_calculator", Revision: 1, Org: "org_demo_alfa", Status: "ready", Files: files, Contract: c}
	a.state.Platform.Constructions = map[string]*ConstructionBuild{b.ID: b}
	return b
}
func waitPreview(t *testing.T, a *App, key string) {
	t.Helper()
	deadline := time.Now().Add(110 * time.Second)
	for time.Now().Before(deadline) {
		code, out := req(a, "GET", "/v1/sdr/genesis-demo/construction/calculator/runtime", key, "", nil)
		if code != 200 {
			t.Fatal(code, out)
		}
		if out["status"] == "running" {
			return
		}
		if out["status"] == "failed" {
			t.Fatal(out)
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("runtime did not start")
}
func TestPreviewRuntimeAuthorizationAndLifecycle(t *testing.T) {
	a, creds, _ := genesisApp(t)
	b := previewBuild(t, a)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	viewer := login(t, a, creds, "alfa.viewer")
	proc := &fakePreviewProcess{done: make(chan struct{})}
	a.runtimeStart = func(ctx context.Context, org string, c *application.Contract, f map[string]string) (construction.Runtime, error) {
		if org != b.Org || !c.Matches(b.ApplicationID, b.Revision, f) {
			t.Error("untrusted runtime identity")
		}
		return proc, nil
	}
	base := "/v1/sdr/genesis-demo/construction/calculator/runtime"
	for _, action := range []string{"start", "request", "stop"} {
		if code, _ := req(a, "POST", base+"/"+action, beta, "", map[string]any{}); code != 404 {
			t.Fatal("tenant leak", code)
		}
		if code, _ := req(a, "POST", base+"/"+action, viewer, "", map[string]any{}); code != 403 {
			t.Fatal("viewer execution", code)
		}
	}
	if code, _ := req(a, "POST", base+"/start", admin, "", map[string]any{}); code != 202 {
		t.Fatal(code)
	}
	waitPreview(t, a, admin)
	for _, in := range []construction.RuntimeRequest{{"POST", "/api/not-declared", ""}, {"POST", "http://127.0.0.1:8080/api/calculate", ""}, {"POST", "/api/a/../calculate", ""}, {"GET", "/api/calculate", ""}, {"HEAD", "/api/history", ""}, {"POST", "/api/%63alculate", ""}} {
		if code, _ := req(a, "POST", base+"/request", admin, "", in); code != 422 {
			t.Fatal("route bypass", in, code)
		}
	}
	in := construction.RuntimeRequest{Method: "POST", Path: "/api/calculate", Body: `{"a":12,"b":30,"op":"+"}`}
	if code, out := req(a, "POST", base+"/request", admin, "", in); code != 200 || out["status"] != float64(200) {
		t.Fatal(code, out)
	}
	if proc.calls != 1 {
		t.Fatal("unexpected calls", proc.calls)
	}
	b.Files["backend/calculator.go"] += "\n//tampered"
	if code, _ := req(a, "POST", base+"/request", admin, "", in); code != 409 {
		t.Fatal("tampered code executed")
	}
	if code, _ := req(a, "POST", base+"/stop", admin, "", map[string]any{}); code != 200 {
		t.Fatal(code)
	}
	select {
	case <-proc.Done():
	default:
		t.Fatal("process not stopped")
	}
}
func TestPreviewRuntimeRequiresCapabilitiesAndEntrypoint(t *testing.T) {
	a, creds, _ := genesisApp(t)
	b := previewBuild(t, a)
	admin := login(t, a, creds, "alfa.admin")
	b.Files[application.ManifestPath] = strings.Replace(b.Files[application.ManifestPath], `"capabilities":[]`, `"capabilities":["crm.opportunity.v1"]`, 1)
	var err error
	b.Contract, err = application.Seal(b.ApplicationID, b.Revision, b.Files)
	if err != nil {
		t.Fatal(err)
	}
	if code, out := req(a, "POST", "/v1/sdr/genesis-demo/construction/calculator/runtime/start", admin, "", map[string]any{}); code != 409 || out["error"] != "runtime_capabilities_unavailable" {
		t.Fatal(code, out)
	}
	b = previewBuild(t, a)
	delete(b.Files, "backend/calculator.go")
	b.Contract, err = application.Seal(b.ApplicationID, b.Revision, b.Files)
	if err != nil {
		t.Fatal(err)
	}
	if code, out := req(a, "POST", "/v1/sdr/genesis-demo/construction/calculator/runtime/start", admin, "", map[string]any{}); code != 409 || out["error"] != "runtime_entrypoint_missing" {
		t.Fatal(code, out)
	}
}
func TestRuntimeIntegrationCalculator(t *testing.T) {
	if os.Getenv("ARKOM_RUNTIME_INTEGRATION") != "true" {
		t.Skip("requires isolated executor; enabled in CI runtime job")
	}
	a, creds, _ := genesisApp(t)
	b := previewBuild(t, a)
	// Inject test-only probes; the reference calculator stays simple.
	b.Files["backend/calculator.go"] = strings.Replace(b.Files["backend/calculator.go"], "http.NewServeMux()", `http.NewServeMux()
 mux.HandleFunc("POST /api/probe", probe)
 mux.HandleFunc("POST /api/hang", func(http.ResponseWriter,*http.Request){for{}})`, 1)
	b.Files["backend/probe.go"] = `package solution
 import("encoding/json";"net";"net/http";"os";"time")
 func probe(w http.ResponseWriter,r *http.Request){var in struct{Secret,Outside,Address string};json.NewDecoder(r.Body).Decode(&in);_,read:=os.ReadFile(in.Secret);write:=os.WriteFile(in.Outside,[]byte("escape"),0600);conn,network:=net.DialTimeout("tcp",in.Address,time.Second);if conn!=nil{conn.Close()};w.Header().Set("Content-Type","application/json");json.NewEncoder(w).Encode(map[string]bool{"read":read==nil,"write":write==nil,"network":network==nil,"environment":os.Getenv("ARKOM_TEST_SECRET")!=""})}`
	manifest, err := application.Decode(b.Files[application.ManifestPath])
	if err != nil {
		t.Fatal(err)
	}
	manifest.Routes = append(manifest.Routes, application.Route{Method: "POST", Path: "/api/probe", OperationID: "probe"}, application.Route{Method: "POST", Path: "/api/hang", OperationID: "hang"})
	raw, _ := json.Marshal(manifest)
	b.Files[application.ManifestPath] = string(raw)
	b.Contract, err = application.Seal(b.ApplicationID, b.Revision, b.Files)
	if err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(t.TempDir(), "secret")
	if err := os.WriteFile(secret, []byte("host-private-marker"), 0600); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(filepath.Dir(secret), "escaped")
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	t.Setenv("ARKOM_TEST_SECRET", "host-private-marker")
	admin := login(t, a, creds, "alfa.admin")
	base := "/v1/sdr/genesis-demo/construction/calculator/runtime"
	if code, out := req(a, "POST", base+"/start", admin, "", map[string]any{}); code != 202 {
		t.Fatal(code, out)
	}
	waitPreview(t, a, admin)
	in := construction.RuntimeRequest{Method: "POST", Path: "/api/calculate", Body: `{"a":12,"b":30,"op":"+","organization_id":"forged"}`}
	code, out := req(a, "POST", base+"/request", admin, "", in)
	if code != 200 {
		t.Fatal(code, out)
	}
	var body map[string]any
	if json.Unmarshal([]byte(out["body"].(string)), &body) != nil || body["result"] != float64(42) || body["organization_id"] != "org_demo_alfa" {
		t.Fatal(out)
	}
	code, out = req(a, "POST", base+"/request", admin, "", construction.RuntimeRequest{Method: "GET", Path: "/api/history"})
	if code != 200 || strings.TrimSpace(out["body"].(string)) != "[42]" {
		t.Fatal("state lost", code, out)
	}
	a.runtimeMu.Lock()
	proc := a.runtimes["calculator"].process
	a.runtimeMu.Unlock()
	probeJSON, _ := json.Marshal(map[string]string{"Secret": secret, "Outside": outside, "Address": listener.Addr().String()})
	code, out = req(a, "POST", base+"/request", admin, "", construction.RuntimeRequest{Method: "POST", Path: "/api/probe", Body: string(probeJSON)})
	if code != 200 {
		t.Fatal(code, out)
	}
	var access map[string]bool
	if err := json.Unmarshal([]byte(out["body"].(string)), &access); err != nil || len(access) != 4 {
		t.Fatal(out)
	}
	for resource, allowed := range access {
		if allowed {
			t.Fatalf("isolation failed: %s", resource)
		}
	}
	if _, err := os.Stat(outside); !os.IsNotExist(err) {
		t.Fatal("external write escaped isolation", err)
	}
	hangStarted := time.Now()
	code, out = req(a, "POST", base+"/request", admin, "", construction.RuntimeRequest{Method: "POST", Path: "/api/hang"})
	if code != 502 {
		t.Fatal("hung handler not terminated", code, out)
	}
	if elapsed := time.Since(hangStarted); elapsed < 4*time.Second || elapsed > 15*time.Second {
		t.Fatalf("expected enforced five-second timeout, got %s", elapsed)
	}
	select {
	case <-proc.Done():
	case <-time.After(10 * time.Second):
		t.Fatal("process survived timeout")
	}
	req(a, "POST", base+"/stop", admin, "", map[string]any{})
}

func TestPreviewRuntimeCancelDuringStartup(t *testing.T) {
	a, creds, _ := genesisApp(t)
	previewBuild(t, a)
	admin := login(t, a, creds, "alfa.admin")
	started, cancelled := make(chan struct{}), make(chan struct{})
	a.runtimeStart = func(ctx context.Context, _ string, _ *application.Contract, _ map[string]string) (construction.Runtime, error) {
		close(started)
		<-ctx.Done()
		close(cancelled)
		return nil, ctx.Err()
	}
	base := "/v1/sdr/genesis-demo/construction/calculator/runtime"
	code, out := req(a, "POST", base+"/start", admin, "", map[string]any{})
	if code != 202 {
		t.Fatal(code, out)
	}
	<-started
	if code, _ := req(a, "POST", base+"/start", admin, "", map[string]any{}); code != 200 {
		t.Fatal("start must be idempotent", code)
	}
	a.closeRuntimes()
	select {
	case <-cancelled:
	case <-time.After(time.Second):
		t.Fatal("startup survived service shutdown")
	}
}
