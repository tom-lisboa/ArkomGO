package main

import (
	"context"
	"deeph/pkg/application"
	"deeph/pkg/construction"
	"testing"
)

func TestFrontendEditsCompilePersistAndKeepBackendUntouched(t *testing.T) {
	a, creds, db := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	viewer := login(t, a, creds, "alfa.viewer")
	tt := &stepTester{}
	stepSetup(a, &stepProvider{}, tt)
	files := contractFiles()
	files[construction.FrontendContractPath] = construction.FrontendContract
	files["frontend/src/App.svelte"] = "<h1>Original</h1>"
	compiled, _, err := construction.CompileFrontendFiles(context.Background(), files, tt)
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := application.Seal("app_editor", 1, compiled)
	if err != nil {
		t.Fatal(err)
	}
	b := &ConstructionBuild{ID: "editor-test", Org: "org_demo_alfa", ApplicationID: "app_editor", Revision: 1, Status: "ready", Contract: sealed, Files: compiled}
	a.state.Platform.Constructions = map[string]*ConstructionBuild{b.ID: b}
	path := "/v1/sdr/genesis-demo/construction/" + b.ID + "/frontend"
	payload := func(seq int, p, s string) map[string]any {
		return map[string]any{"sequence": seq, "files": map[string]string{p: s}}
	}
	input := payload(0, "frontend/src/App.svelte", "<h1>Minha página</h1>")
	for _, test := range []struct {
		key    string
		status int
	}{{beta, 404}, {viewer, 403}, {"", 401}} {
		if code, _ := req(a, "POST", path, test.key, "", input); code != test.status {
			t.Fatal("authorization", code)
		}
	}
	for _, p := range []string{"backend/calculate.go", "application.json", "frontend/bundle.js", "frontend/svelte.json", "frontend/src/../escape.js"} {
		if code, _ := req(a, "POST", path, admin, "", payload(0, p, "bad")); code != 422 {
			t.Fatal("non-source write", p, code)
		}
	}
	before := application.Digest(b.Files)
	tt.frontendFail = true
	if code, _ := req(a, "POST", path, admin, "", input); code != 422 || application.Digest(b.Files) != before {
		t.Fatal("failed compile changed project", code)
	}
	tt.frontendFail = false
	a.failSave = true
	if code, _ := req(a, "POST", path, admin, "", input); code != 503 {
		t.Fatal("persistence failure", code)
	}
	a.failSave = false
	b = a.state.Platform.Constructions[b.ID]
	if application.Digest(b.Files) != before || len(b.Traces) != 0 {
		t.Fatal("uncommitted edit visible")
	}
	if code, out := req(a, "POST", path, admin, "", input); code != 200 {
		t.Fatal(code, out)
	}
	b = a.state.Platform.Constructions[b.ID]
	if b.Files["frontend/src/App.svelte"] != "<h1>Minha página</h1>" || b.Files["backend/calculate.go"] != files["backend/calculate.go"] || !construction.FrontendCurrent(b.Files) || b.contractStatus() != "validated" || b.Revision != 2 {
		t.Fatal("invalid saved revision", b.summary())
	}
	savedDigest := application.Digest(b.Files)
	if code, _ := req(a, "POST", path, admin, "", input); code != 409 || application.Digest(b.Files) != savedDigest {
		t.Fatal("stale editor overwrote source", code)
	}
	b.Status = "running"
	if code, _ := req(a, "POST", path, admin, "", payload(len(b.Traces), "frontend/src/App.svelte", "other")); code != 409 {
		t.Fatal("edit raced generation", code)
	}
	b.Status = "ready"
	if err := a.save(); err != nil {
		t.Fatal(err)
	}
	a.Close()
	restored, _, err := newApp(db)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	got := restored.state.Platform.Constructions[b.ID]
	if got.Files["frontend/src/App.svelte"] != b.Files["frontend/src/App.svelte"] || got.contractStatus() != "validated" {
		t.Fatal("lost edit after restart")
	}
}

func TestBlankFrontendIsOwnedIdempotentAndDoesNotRunModel(t *testing.T) {
	a, c, _ := genesisApp(t)
	admin := login(t, a, c, "alfa.admin")
	beta := login(t, a, c, "beta.admin")
	viewer := login(t, a, c, "alfa.viewer")
	stepSetup(a, &stepProvider{}, &stepTester{})
	path := "/v1/sdr/genesis-demo/construction/blank"
	body := map[string]string{"name": "Página livre"}
	if code, _ := req(a, "POST", path, viewer, "new-page", body); code != 403 {
		t.Fatal(code)
	}
	code, created := req(a, "POST", path, admin, "new-page", body)
	if code != 201 {
		t.Fatal(code, created)
	}
	id := created["id"].(string)
	b := a.state.Platform.Constructions[id]
	if created["runtime_compatible"] != false || created["contract_status"] != "validated" || !construction.FrontendCurrent(b.Files) || len(b.Contract.Manifest.Routes) != 0 || len(b.Traces) != 1 {
		t.Fatal("blank executed an application stage", created)
	}
	if code, replay := req(a, "POST", path, admin, "new-page", body); code != 201 || replay["id"] != id {
		t.Fatal("duplicate blank page", code)
	}
	if code, _ := req(a, "GET", "/v1/sdr/genesis-demo/construction/"+id, beta, "", nil); code != 404 {
		t.Fatal("tenant leak", code)
	}
}
