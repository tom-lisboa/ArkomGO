package main

import (
	"deeph/pkg/construction"
	"testing"
	"time"
)

func TestConstructionIsolationDurabilityAndCancellation(t *testing.T) {
	a, creds, db := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	viewer := login(t, a, creds, "alfa.viewer")
	b := &ConstructionBuild{ID: "build-test", Org: "org_demo_alfa", Goal: "Criar produto", Status: "running", CreatedAt: time.Now(), Files: construction.Seed()}
	if err := a.transact(func() { a.state.Platform.Constructions = map[string]*ConstructionBuild{b.ID: b} }); err != nil {
		t.Fatal(err)
	}
	for _, suffix := range []string{"", "/export"} {
		if code, _ := req(a, "GET", "/v1/sdr/genesis-demo/construction/"+b.ID+suffix, beta, "", nil); code != 404 {
			t.Fatal("cross org", code)
		}
	}
	if code, _ := req(a, "POST", "/v1/sdr/genesis-demo/construction/"+b.ID+"/cancel", viewer, "", nil); code != 403 {
		t.Fatal(code)
	}
	ev := construction.Event{Kind: "file.written", Agent: "backend", Path: "backend/app.go", After: "package app", Summary: "Arquivo escrito"}
	if err := a.constructionTrace(b.ID, ev); err != nil {
		t.Fatal(err)
	}
	code, out := req(a, "GET", "/v1/sdr/genesis-demo/construction/"+b.ID+"?after=0", admin, "", nil)
	if code != 200 || len(out["traces"].([]any)) != 1 || out["files"].(map[string]any)[ev.Path] != ev.After {
		t.Fatal(code, out)
	}
	_, out = req(a, "GET", "/v1/sdr/genesis-demo/construction/"+b.ID+"?after=1", admin, "", nil)
	if len(out["traces"].([]any)) != 0 {
		t.Fatal("duplicate cursor")
	}
	a.failSave = true
	if err := a.constructionTrace(b.ID, construction.Event{Kind: "file.written", Path: "backend/fail.go", After: "bad"}); err == nil {
		t.Fatal("failed persistence")
	}
	a.failSave = false
	if a.state.Platform.Constructions[b.ID].Files["backend/fail.go"] != "" {
		t.Fatal("uncommitted file visible")
	}
	if code, _ := req(a, "POST", "/v1/sdr/genesis-demo/construction/"+b.ID+"/cancel", admin, "", nil); code != 200 {
		t.Fatal(code)
	}
	if err := a.constructionTrace(b.ID, ev); err == nil {
		t.Fatal("cancelled build still writable")
	}
	// Startup recovery marks unfinished runs interrupted and preserves source/traces.
	a.state.Platform.Constructions[b.ID].Status = "running"
	if err := a.save(); err != nil {
		t.Fatal(err)
	}
	a.Close()
	restored, _, err := newApp(db)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	saved := restored.state.Platform.Constructions[b.ID]
	if saved.Status != "interrupted" || saved.Files[ev.Path] != ev.After || len(saved.Traces) < 1 {
		t.Fatal("recovery lost artifacts")
	}
}
func TestConstructionStartRequiresRoleAndScopedParent(t *testing.T) {
	a, c, _ := genesisApp(t)
	viewer := login(t, a, c, "alfa.viewer")
	admin := login(t, a, c, "alfa.admin")
	if code, _ := req(a, "POST", "/v1/sdr/genesis-demo/construction", viewer, "", map[string]any{"goal": "Criar novo projeto de teste"}); code != 403 {
		t.Fatal(code)
	}
	if code, _ := req(a, "POST", "/v1/sdr/genesis-demo/construction", admin, "", map[string]any{"goal": "Criar novo projeto de teste", "parent_id": "other"}); code != 404 {
		t.Fatal(code)
	}
}
