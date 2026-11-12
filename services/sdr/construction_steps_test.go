package main

import (
	"context"
	"deeph/pkg/application"
	"deeph/pkg/construction"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"
)

const stepManifest = `{"schema_version":"arkom.application.v1","catalog_version":"arkom-capabilities-v1","name":"Calculadora","backend":"go","entrypoint":"frontend/index.html","routes":[],"capabilities":[]}`

type stepProvider struct {
	mu     sync.Mutex
	agents []string
}

func (p *stepProvider) Next(_ context.Context, r construction.Request) (construction.Turn, error) {
	p.mu.Lock()
	p.agents = append(p.agents, r.Agent)
	p.mu.Unlock()
	if len(r.Feedback) == 0 {
		return construction.Turn{Actions: []construction.Action{{Tool: "read", Path: "reference/catalog.json"}, {Tool: "read", Path: "reference/platform-contracts.go"}}, Verdict: "continue"}, nil
	}
	var actions []construction.Action
	switch r.Agent {
	case "architect":
		actions = []construction.Action{{Tool: "write", Path: "DESIGN.md", Content: "Primeira entrega: soma; histórico fica para depois."}, {Tool: "write", Path: application.ManifestPath, Content: stepManifest}}
	case "backend":
		actions = []construction.Action{{Tool: "write", Path: "backend/add.go", Content: "package solution\nfunc Add(a,b int)int{return a+b}"}, {Tool: "write", Path: "backend/add_test.go", Content: "package solution\nimport \"testing\"\nfunc TestAdd(t *testing.T){if Add(12,30)!=42{t.Fatal(\"sum\")}}"}}
	case "interface":
		if construction.IsSvelte(r.Files) {
			return construction.Turn{Actions: []construction.Action{{Tool: "write", Path: "frontend/src/App.svelte", Content: "<h1>Calculadora</h1>"}}, Verdict: "ready"}, nil
		}
		actions = []construction.Action{{Tool: "write", Path: "frontend/index.html", Content: "<h1>Calculadora</h1>"}}
	}
	return construction.Turn{Actions: actions, Verdict: "ready"}, nil
}

type stepTester struct {
	mu           sync.Mutex
	fail         bool
	calls        int
	frontendFail bool
}

func (t *stepTester) Test(context.Context, map[string]string) (string, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.calls++
	if t.fail {
		return "addition failed", errors.New("test_failed")
	}
	return "TestAdd passed", nil
}
func stepSetup(a *App, p construction.Provider, tt construction.Tester) {
	a.constructionSetup = func() (construction.Provider, construction.Tester, error) { return p, tt, nil }
}
func stepCheckpoint(t *testing.T, a *App, key, id, want string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		code, out := req(a, "GET", "/v1/sdr/genesis-demo/construction/"+id, key, "", nil)
		if code != 200 {
			t.Fatal(code, out)
		}
		b := out["build"].(map[string]any)
		if b["status"] == want {
			return out
		}
		if b["status"] != "running" {
			t.Fatal("unexpected checkpoint", out)
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("checkpoint did not arrive")
	return nil
}
func startSteps(t *testing.T, a *App, key string) string {
	t.Helper()
	code, out := req(a, "POST", "/v1/sdr/genesis-demo/construction", key, "", map[string]any{"goal": "Criar calculadora em entregas pequenas"})
	if code != 202 {
		t.Fatal(code, out)
	}
	return out["id"].(string)
}
func stepInput(out map[string]any) map[string]any {
	b := out["build"].(map[string]any)
	return map[string]any{"step_id": b["next_step_id"], "sequence": b["sequence"]}
}
func TestConstructionStepsFollowCommittedTracesAndRequireExplicitAdvance(t *testing.T) {
	a, creds, db := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	viewer := login(t, a, creds, "alfa.viewer")
	beta := login(t, a, creds, "beta.admin")
	p, tt := &stepProvider{}, &stepTester{}
	stepSetup(a, p, tt)
	id := startSteps(t, a, admin)
	base := "/v1/sdr/genesis-demo/construction/" + id
	out := stepCheckpoint(t, a, admin, id, "awaiting_step")
	input := stepInput(out)
	if input["step_id"] != "backend" {
		t.Fatal(input)
	}
	if len(out["files"].(map[string]any)) != len(construction.NewSeed())+2 {
		t.Fatal("planning wrote implementation", out["files"])
	}
	p.mu.Lock()
	for _, agent := range p.agents {
		if agent != "architect" {
			t.Error("automatic execution", agent)
		}
	}
	p.mu.Unlock()
	assertStepEvidence(t, out, "architect", "completed")
	if code, _ := req(a, "POST", base+"/advance", viewer, "", input); code != 403 {
		t.Fatal("viewer advanced", code)
	}
	if code, _ := req(a, "POST", base+"/advance", beta, "", input); code != 404 {
		t.Fatal("tenant leak", code)
	}
	if code, _ := req(a, "POST", base+"/advance", admin, "", map[string]any{"step_id": "reviewer", "sequence": input["sequence"]}); code != 409 {
		t.Fatal("skipped steps", code)
	}
	a.failSave = true
	if code, _ := req(a, "POST", base+"/advance", admin, "", input); code != 503 {
		t.Fatal("uncommitted start accepted", code)
	}
	a.failSave = false
	unchanged := stepCheckpoint(t, a, admin, id, "awaiting_step")
	if unchanged["build"].(map[string]any)["sequence"] != input["sequence"] {
		t.Fatal("uncommitted progress visible")
	}
	// Close/reopen preserves the checkpoint without any provider invocation.
	if err := a.Close(); err != nil {
		t.Fatal(err)
	}
	restored, restoredCreds, err := newApp(db)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	admin = login(t, restored, restoredCreds, "alfa.admin")
	stepSetup(restored, p, tt)
	out = stepCheckpoint(t, restored, admin, id, "awaiting_step")
	assertStepEvidence(t, out, "architect", "completed")
	for _, stage := range []string{"backend", "interface", "reviewer"} {
		input = stepInput(out)
		if input["step_id"] != stage {
			t.Fatal(input)
		}
		if code, reply := req(restored, "POST", base+"/advance", admin, "", input); code != 202 {
			t.Fatal(code, reply)
		}
		want := "awaiting_step"
		if stage == "reviewer" {
			want = "ready"
		}
		out = stepCheckpoint(t, restored, admin, id, want)
		assertStepEvidence(t, out, stage, "completed")
		if code, _ := req(restored, "POST", base+"/advance", admin, "", input); code != 409 {
			t.Fatal("replayed checkpoint executed twice", code)
		}
	}
	if out["build"].(map[string]any)["contract_status"] != "validated" {
		t.Fatal(out)
	}
	tt.mu.Lock()
	defer tt.mu.Unlock()
	if tt.calls != 2 {
		t.Fatal("validation missing", tt.calls)
	}
}
func assertStepEvidence(t *testing.T, out map[string]any, id, status string) {
	t.Helper()
	traces := out["traces"].([]any)
	var count int
	var first, last float64
	var completed map[string]any
	for _, raw := range traces {
		e := raw.(map[string]any)
		if e["step_id"] != id {
			continue
		}
		count++
		if first == 0 {
			first = e["sequence"].(float64)
		}
		last = e["sequence"].(float64)
		if e["execution_id"] == "" {
			t.Fatal("missing attempt identity")
		}
		if e["kind"] == "step.completed" {
			completed = e
		}
	}
	for _, raw := range out["build"].(map[string]any)["steps"].([]any) {
		s := raw.(map[string]any)
		if s["id"] != id {
			continue
		}
		if s["status"] != status || s["trace_count"] != float64(count) || s["first_sequence"] != first || s["last_sequence"] != last {
			t.Fatal("step differs from trace evidence", s, count, first, last)
		}
		if status == "completed" {
			if completed == nil {
				t.Fatal("invented completion")
			}
			var evidence map[string]any
			if json.Unmarshal([]byte(completed["output"].(string)), &evidence) != nil || evidence["source_digest"] == "" {
				t.Fatal("missing checkpoint snapshot")
			}
		}
		return
	}
	t.Fatal("missing step")
}
func TestFailedConstructionStepCannotAdvanceAndOldAttemptsCannotWrite(t *testing.T) {
	a, creds, _ := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	p, tt := &stepProvider{}, &stepTester{fail: true}
	stepSetup(a, p, tt)
	id := startSteps(t, a, admin)
	out := stepCheckpoint(t, a, admin, id, "awaiting_step")
	base := "/v1/sdr/genesis-demo/construction/" + id
	if code, _ := req(a, "POST", base+"/advance", admin, "", stepInput(out)); code != 202 {
		t.Fatal(code)
	}
	out = stepCheckpoint(t, a, admin, id, "failed")
	assertStepEvidence(t, out, "backend", "failed")
	a.mu.Lock()
	old := a.state.Platform.Constructions[id].ExecutionID
	a.mu.Unlock()
	if stepInput(out)["step_id"] != "backend" {
		t.Fatal("failure skipped backend")
	}
	tt.mu.Lock()
	tt.fail = false
	tt.mu.Unlock()
	if code, _ := req(a, "POST", base+"/advance", admin, "", stepInput(out)); code != 202 {
		t.Fatal(code)
	}
	if err := a.constructionRunTrace(id, old, construction.Event{Kind: "file.written", Path: "backend/stale.go", After: "stale"}); err == nil {
		t.Fatal("old attempt wrote into new one")
	}
	a.finishConstructionStep(id, old, "backend", nil, nil)
	out = stepCheckpoint(t, a, admin, id, "awaiting_step")
	assertStepEvidence(t, out, "backend", "completed")
	if stepInput(out)["step_id"] != "interface" || out["files"].(map[string]any)["backend/stale.go"] != nil {
		t.Fatal(out)
	}
}

func TestConstructionStepCompletionIsAtomicWithEvidence(t *testing.T) {
	a, _, _ := genesisApp(t)
	b := &ConstructionBuild{ID: "checkpoint", Org: "org_demo_alfa", StepsVersion: 1, ExecutionID: "attempt", Status: "running", Files: construction.Seed()}
	b.appendStepEvent("step.started", "architect", "Started", "", a.now().UTC())
	b.Traces = append(b.Traces, ConstructionTrace{construction.Event{Kind: "agent.finished", Agent: "architect", StepID: "architect", ExecutionID: "attempt"}, 2, a.now().UTC()})
	a.state.Platform.Constructions = map[string]*ConstructionBuild{b.ID: b}
	a.failSave = true
	a.finishConstructionStep(b.ID, "attempt", "architect", nil, nil)
	saved := a.state.Platform.Constructions[b.ID]
	if saved.Status != "running" || saved.nextStepID() != "architect" || len(saved.Traces) != 2 || saved.steps()[0].Status != "running" {
		t.Fatal("uncommitted completion escaped rollback", saved)
	}
	a.failSave = false
	a.finishConstructionStep(b.ID, "attempt", "architect", nil, nil)
	saved = a.state.Platform.Constructions[b.ID]
	if saved.Status != "awaiting_step" || saved.nextStepID() != "backend" || saved.steps()[0].Status != "completed" {
		t.Fatal(saved)
	}
	var evidence map[string]any
	if json.Unmarshal([]byte(saved.Traces[2].Output), &evidence) != nil || evidence["source_digest"] != application.Digest(saved.Files) {
		t.Fatal("checkpoint did not identify saved files")
	}
}
func TestConstructionStepRecoveryAddsInterruptedEvidence(t *testing.T) {
	a, _, db := genesisApp(t)
	b := &ConstructionBuild{ID: "interrupted-step", Org: "org_demo_alfa", StepsVersion: 1, ExecutionID: "original", Status: "running", Files: construction.Seed()}
	b.appendStepEvent("step.started", "architect", "Started", "", a.now().UTC())
	if err := a.transact(func() { a.state.Platform.Constructions = map[string]*ConstructionBuild{b.ID: b} }); err != nil {
		t.Fatal(err)
	}
	a.Close()
	restored, _, err := newApp(db)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	saved := restored.state.Platform.Constructions[b.ID]
	if saved.Status != "interrupted" || saved.nextStepID() != "architect" || saved.steps()[0].Status != "interrupted" || len(saved.Traces) != 2 || saved.Traces[1].Kind != "step.interrupted" || saved.Traces[1].StepID != "architect" {
		t.Fatal("recovered progress differs from evidence", saved)
	}
}

func TestConstructionStepCannotFinishWithoutEngineReceipt(t *testing.T) {
	a, _, _ := genesisApp(t)
	b := &ConstructionBuild{ID: "no-receipt", Org: "org_demo_alfa", StepsVersion: 1, ExecutionID: "attempt", Status: "running", Files: construction.Seed()}
	b.appendStepEvent("step.started", "architect", "Started", "", a.now().UTC())
	a.state.Platform.Constructions = map[string]*ConstructionBuild{b.ID: b}
	a.finishConstructionStep(b.ID, "attempt", "architect", nil, nil)
	if b.Status != "failed" || b.nextStepID() != "architect" || b.steps()[0].Status != "failed" {
		t.Fatal("completion without persisted evidence", b)
	}
}

func (t *stepTester) CompileFrontend(context.Context, map[string]string) (construction.FrontendResult, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.frontendFail {
		return construction.FrontendResult{Errors: []map[string]any{{"message": "invalid component", "line": 2}}}, errors.New("frontend_compilation_failed")
	}
	return construction.FrontendResult{OK: true, Javascript: `document.getElementById("app").textContent="Calculadora"`}, nil
}

func TestSvelteFailureStaysAtInterfaceAndRetryPersistsBuildEvidence(t *testing.T) {
	a, creds, _ := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	p, tt := &stepProvider{}, &stepTester{frontendFail: true}
	stepSetup(a, p, tt)
	id := startSteps(t, a, admin)
	base := "/v1/sdr/genesis-demo/construction/" + id
	out := stepCheckpoint(t, a, admin, id, "awaiting_step")
	if out["build"].(map[string]any)["frontend_framework"] != "svelte" {
		t.Fatal("new project is not Svelte")
	}
	for _, stage := range []string{"backend", "interface"} {
		if stepInput(out)["step_id"] != stage {
			t.Fatal(out)
		}
		if code, reply := req(a, "POST", base+"/advance", admin, "", stepInput(out)); code != 202 {
			t.Fatal(code, reply)
		}
		want := "awaiting_step"
		if stage == "interface" {
			want = "failed"
		}
		out = stepCheckpoint(t, a, admin, id, want)
	}
	assertStepEvidence(t, out, "interface", "failed")
	if stepInput(out)["step_id"] != "interface" || out["files"].(map[string]any)["frontend/index.html"] != nil {
		t.Fatal("failed build advanced or published a preview")
	}
	tt.mu.Lock()
	tt.frontendFail = false
	tt.mu.Unlock()
	if code, reply := req(a, "POST", base+"/advance", admin, "", stepInput(out)); code != 202 {
		t.Fatal(code, reply)
	}
	out = stepCheckpoint(t, a, admin, id, "awaiting_step")
	if stepInput(out)["step_id"] != "reviewer" {
		t.Fatal(out)
	}
	var failed, passed bool
	for _, raw := range out["traces"].([]any) {
		e := raw.(map[string]any)
		if e["kind"] == "frontend.build.failed" {
			failed = true
		}
		if e["kind"] == "frontend.build.passed" {
			passed = true
		}
	}
	files := map[string]string{}
	for name, value := range out["files"].(map[string]any) {
		files[name] = value.(string)
	}
	if !failed || !passed || !construction.FrontendCurrent(files) {
		t.Fatal("missing persisted compiler evidence")
	}
}

func TestLegacyRevisionPreservesHTMLFrontend(t *testing.T) {
	a, creds, _ := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	stepSetup(a, &stepProvider{}, &stepTester{})
	files := construction.Seed()
	files["frontend/index.html"] = "<h1>Original</h1>"
	parent := &ConstructionBuild{ID: "legacy-html", ApplicationID: "app_legacy", Revision: 1, Org: "org_demo_alfa", Status: "ready", Files: files}
	if err := a.transact(func() { a.state.Platform.Constructions = map[string]*ConstructionBuild{parent.ID: parent} }); err != nil {
		t.Fatal(err)
	}
	code, reply := req(a, "POST", "/v1/sdr/genesis-demo/construction", admin, "", map[string]any{"goal": "Revisar aplicação antiga", "parent_id": parent.ID})
	if code != 202 {
		t.Fatal(code, reply)
	}
	out := stepCheckpoint(t, a, admin, reply["id"].(string), "awaiting_step")
	saved := out["files"].(map[string]any)
	if out["build"].(map[string]any)["frontend_framework"] != "html" || saved[construction.FrontendContractPath] != nil || saved["frontend/index.html"] != files["frontend/index.html"] {
		t.Fatal("legacy revision silently migrated", out)
	}
}
