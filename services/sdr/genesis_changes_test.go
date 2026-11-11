package main

import (
	"context"
	"deeph/pkg/arkom"
	"encoding/json"
	"path/filepath"
	"sdr-next-pilot/pkg/sdrsdk"
	"testing"
	"time"
)

func genesisApp(t *testing.T) (*App, map[string]string, string) {
	t.Helper()
	t.Setenv("SDR_GENESIS_DEMO", "true")
	t.Setenv("SDR_CRM_DEV_ENABLED", "true")
	db := filepath.Join(t.TempDir(), "state.sqlite")
	a, c, err := newApp(db)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { a.Close() })
	return a, c, db
}
func prepareChange(t *testing.T, a *App, org string) string {
	t.Helper()
	s := arkom.Default()
	s.RequiredFields = append(s.RequiredFields, "sellers")
	s.Title = "Interessado com equipe identificada"
	raw, _ := json.Marshal(arkom.Review{Summary: "Exigir também a quantidade de vendedores", Change: &s})
	id, err := a.finishGenesisChange(context.Background(), org, "run-test", string(raw), a.qualification(org))
	if err != nil {
		t.Fatal(err)
	}
	return id
}
func changeCall(a *App, tok, id, action string, body any) (int, map[string]any) {
	return req(a, "POST", "/v1/sdr/genesis-demo/changes/"+id+"/"+action, tok, "", body)
}
func TestGenesisChangeApprovalIsolationAndRealQualification(t *testing.T) {
	a, c, _ := genesisApp(t)
	admin := login(t, a, c, "alfa.admin")
	operator := login(t, a, c, "alfa.operator")
	viewer := login(t, a, c, "alfa.viewer")
	beta := login(t, a, c, "beta.admin")
	id := prepareChange(t, a, "org_demo_alfa")
	approve := map[string]any{"expected_version": 1, "reason": "Aprovo a prévia"}
	if code, _ := changeCall(a, admin, id, "publish", approve); code != 409 {
		t.Fatal("published without preview", code)
	}
	if code, _ := changeCall(a, beta, id, "preview", nil); code != 404 {
		t.Fatal("cross tenant", code)
	}
	if code, _ := changeCall(a, viewer, id, "preview", nil); code != 403 {
		t.Fatal("viewer", code)
	}
	if code, _ := changeCall(a, admin, id, "publish", map[string]any{"expected_version": 1, "reason": "ok", "spec": arkom.Default()}); code != 400 {
		t.Fatal("client replaced server spec")
	}
	preview := map[string]any{"facts": map[string]string{"company": "Oficina", "goal": "Organizar vendas"}}
	code, out := changeCall(a, operator, id, "preview", preview)
	if code != 200 || out["before_qualified"] != true || out["after_qualified"] != false || out["effects_applied"] != false {
		t.Fatal(code, out)
	}
	if len(a.state.CRMOutbox) != 0 || a.qualification("org_demo_alfa").Version != 1 {
		t.Fatal("preview changed runtime")
	}
	if code, _ := changeCall(a, operator, id, "publish", approve); code != 403 {
		t.Fatal("operator publish", code)
	}
	if code, _ := changeCall(a, admin, id, "publish", approve); code != 200 {
		t.Fatal("publish", code)
	}
	if code, out := changeCall(a, admin, id, "publish", approve); code != 200 || out["duplicate"] != true {
		t.Fatal("retry", code, out)
	}
	if a.qualification("org_demo_alfa").Version != 2 || a.qualification("org_demo_beta").Version != 1 {
		t.Fatal("tenant/version corruption")
	}
	conv := a.state.Conversations["conv_demo_alfa"]
	a.crmRoutes = map[string]crmRoute{conv.Org: {Installation: "test", Organization: "dev", Contacts: map[string]string{conv.Contact: "lead"}}}
	facts := map[string]sdrsdk.Fact{"company": {Value: "Oficina", ExpiresAt: a.now().Add(time.Hour)}, "goal": {Value: "Organizar vendas", ExpiresAt: a.now().Add(time.Hour)}}
	a.state.Pipeline.Memory[conv.ID] = facts
	a.queueQualifiedCRM(conv)
	if len(a.state.CRMOutbox) != 0 {
		t.Fatal("missing sellers qualified")
	}
	facts["sellers"] = sdrsdk.Fact{Value: "2", ExpiresAt: a.now().Add(-time.Second)}
	a.queueQualifiedCRM(conv)
	if len(a.state.CRMOutbox) != 0 {
		t.Fatal("expired evidence qualified")
	}
	facts["sellers"] = sdrsdk.Fact{Value: "2", ExpiresAt: a.now().Add(time.Hour)}
	a.queueQualifiedCRM(conv)
	a.queueQualifiedCRM(conv)
	if len(a.state.CRMOutbox) != 1 {
		t.Fatal("qualification should enqueue once")
	}
	for _, event := range a.state.CRMOutbox {
		if event.Data["title"] != "Interessado com equipe identificada" {
			t.Fatal("wrong title")
		}
	}
	if code, _ := changeCall(a, admin, id, "restore", map[string]any{"expected_version": 2, "reason": "Voltar à regra anterior"}); code != 200 {
		t.Fatal("restore", code)
	}
	if len(a.qualification(conv.Org).Spec.RequiredFields) != 2 || a.qualification(conv.Org).Version != 3 {
		t.Fatal("restore not applied")
	}
	if len(a.state.CRMOutbox) != 1 {
		t.Fatal("restore must not undo delivered/queued events")
	}
}
func TestGenesisChangeDurabilityConflictAndStorageFailure(t *testing.T) {
	a, c, db := genesisApp(t)
	tok := login(t, a, c, "alfa.admin")
	id := prepareChange(t, a, "org_demo_alfa")
	stale := prepareChange(t, a, "org_demo_alfa")
	for _, id := range []string{id, stale} {
		if code, _ := changeCall(a, tok, id, "preview", map[string]any{}); code != 200 {
			t.Fatal(code)
		}
	}
	a.failSave = true
	if code, _ := changeCall(a, tok, id, "publish", map[string]any{"expected_version": 1, "reason": "test"}); code != 503 {
		t.Fatal(code)
	}
	a.failSave = false
	if a.qualification("org_demo_alfa").Version != 1 {
		t.Fatal("failed save changed policy")
	}
	if code, _ := changeCall(a, tok, id, "publish", map[string]any{"expected_version": 1, "reason": "test"}); code != 200 {
		t.Fatal(code)
	}
	if code, _ := changeCall(a, tok, stale, "publish", map[string]any{"expected_version": 2, "reason": "test"}); code != 409 {
		t.Fatal("stale proposal accepted")
	}
	a.Close()
	restored, creds, err := newApp(db)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	if restored.qualification("org_demo_alfa").Version != 2 || restored.state.Platform.GenesisChanges[id].Status != "published" {
		t.Fatal("lost durable state")
	}
	tok = login(t, restored, creds, "alfa.admin")
	if code, _ := changeCall(restored, tok, id, "restore", map[string]any{"expected_version": 2, "reason": "Voltar"}); code != 200 {
		t.Fatal(code)
	}
	// A second published proposal prevents an older rollback from clobbering it.
	newer := prepareChange(t, restored, "org_demo_alfa")
	changeCall(restored, tok, newer, "preview", map[string]any{})
	if code, _ := changeCall(restored, tok, newer, "publish", map[string]any{"expected_version": 3, "reason": "Nova regra"}); code != 200 {
		t.Fatal(code)
	}
	if code, out := changeCall(restored, tok, id, "restore", map[string]any{"expected_version": 4, "reason": "Repetição"}); code != 200 || out["duplicate"] != true {
		t.Fatal("restore replay")
	}
	if restored.qualification("org_demo_alfa").Version != 4 {
		t.Fatal("old restore overwrote new policy")
	}
}

func TestGenesisUnverifiedAndUnsupportedNeverPublish(t *testing.T) {
	a, c, _ := genesisApp(t)
	tok := login(t, a, c, "alfa.admin")
	if id, err := a.finishGenesisChange(context.Background(), "org_demo_alfa", "outside", `{"summary":"Construção de pagamentos fora deste recorte","change":null}`, a.qualification("org_demo_alfa")); err != nil || id != "" {
		t.Fatal(id, err)
	}
	s := arkom.Default()
	s.Backend = "python"
	raw, _ := json.Marshal(arkom.Review{Summary: "Inválido", Change: &s})
	if _, err := a.finishGenesisChange(context.Background(), "org_demo_alfa", "bad", string(raw), a.qualification("org_demo_alfa")); err == nil {
		t.Fatal("non-Go accepted")
	}
	id := prepareChange(t, a, "org_demo_alfa")
	changeCall(a, tok, id, "preview", map[string]any{})
	p := a.state.Platform.GenesisChanges[id]
	p.Artifact.Digest = "invalid"
	if code, _ := changeCall(a, tok, id, "publish", map[string]any{"expected_version": 1, "reason": "Teste"}); code != 409 {
		t.Fatal("tampered artifact", code)
	}
	if a.qualification("org_demo_alfa").Version != 1 {
		t.Fatal("invalid build applied")
	}
	s = arkom.Default()
	raw, _ = json.Marshal(arkom.Review{Summary: "Válido mas sem compilador", Change: &s})
	t.Setenv("PATH", t.TempDir())
	if _, err := a.finishGenesisChange(context.Background(), "org_demo_alfa", "no-go", string(raw), a.qualification("org_demo_alfa")); err == nil {
		t.Fatal("missing compiler accepted")
	}
	if len(a.state.Platform.GenesisChanges) != 1 {
		t.Fatal("failed build created proposal")
	}
}

func TestGenesisRollbackCannotClobberNewVersion(t *testing.T) {
	a, c, _ := genesisApp(t)
	tok := login(t, a, c, "alfa.admin")
	first := prepareChange(t, a, "org_demo_alfa")
	changeCall(a, tok, first, "preview", map[string]any{})
	if code, _ := changeCall(a, tok, first, "publish", map[string]any{"expected_version": 1, "reason": "Primeira"}); code != 200 {
		t.Fatal(code)
	}
	second := prepareChange(t, a, "org_demo_alfa")
	changeCall(a, tok, second, "preview", map[string]any{})
	if code, _ := changeCall(a, tok, second, "publish", map[string]any{"expected_version": 2, "reason": "Segunda"}); code != 200 {
		t.Fatal(code)
	}
	if code, _ := changeCall(a, tok, first, "restore", map[string]any{"expected_version": 3, "reason": "Antiga"}); code != 409 {
		t.Fatal("old rollback accepted", code)
	}
}
