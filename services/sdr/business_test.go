package main

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func coreDraft(t *testing.T, a *App, tok string, p BusinessProfile, rev int, key string) map[string]any {
	t.Helper()
	code, b := req(a, "POST", "/v1/core/business/draft", tok, key, map[string]any{"profile": p, "expected_revision": rev, "reason": "Teste de alteração do negócio"})
	if code != 200 {
		t.Fatal("save", code, b)
	}
	return b
}
func corePublish(t *testing.T, a *App, tok string, rev int, key string) map[string]any {
	t.Helper()
	code, b := req(a, "POST", "/v1/core/business/publish", tok, key, map[string]any{"expected_revision": rev, "reason": "Publicação de homologação"})
	if code != 200 {
		t.Fatal("publish", code, b)
	}
	return b
}
func getCore(t *testing.T, a *App, tok, solution string) map[string]any {
	t.Helper()
	code, b := req(a, "GET", "/v1/core/solutions/"+solution+"/context", tok, "", nil)
	if code != 200 {
		t.Fatal(code, b)
	}
	return b
}
func TestCoreTenantIsolationAndPermissions(t *testing.T) {
	a, creds, _ := storedApp(t)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	viewer := login(t, a, creds, "alfa.viewer")
	op := login(t, a, creds, "alfa.operator")
	ctx := getCore(t, a, admin, "sdr")
	raw, _ := json.Marshal(ctx)
	if strings.Contains(string(raw), "Beta Escola") || strings.Contains(string(raw), "credentials") || ctx["organization_id"] != "org_demo_alfa" {
		t.Fatal("context isolation")
	}
	bctx := getCore(t, a, beta, "sdr")
	braw, _ := json.Marshal(bctx)
	if strings.Contains(string(braw), "Alfa Automação") || strings.Contains(string(braw), "49000") {
		t.Fatal("business leaked")
	}
	for _, role := range []string{viewer, op} {
		code, _ := req(a, "POST", "/v1/core/business/publish", role, "denied", map[string]any{"expected_revision": 1, "reason": "teste"})
		if code != 403 {
			t.Fatal("permission", code)
		}
	}
	code, _ := req(a, "POST", "/v1/core/business/preview", viewer, "", map[string]any{"target": "draft", "solution": "sdr"})
	if code != 403 {
		t.Fatal("viewer preview", code)
	}
	code, _ = req(a, "GET", "/v1/core/business", viewer, "", nil)
	if code != 200 {
		t.Fatal("viewer read", code)
	}
	code, _ = req(a, "GET", "/v1/sdr/conversations/conv_demo_alfa/context", beta, "", nil)
	if code != 404 {
		t.Fatal("conversation context leak")
	}
	code, out := req(a, "GET", "/v1/core/business?organization_id=org_demo_beta", admin, "", nil)
	if code != 200 || out["organization_id"] != "org_demo_alfa" {
		t.Fatal("caller controlled organization")
	}
}
func TestCoreDraftPublicationAndSolutionScope(t *testing.T) {
	a, creds, _ := storedApp(t)
	tok := login(t, a, creds, "alfa.admin")
	p := cloneProfile(a.state.Business["org_demo_alfa"].Draft)
	p.Offers[0].AmountCents = 59000
	coreDraft(t, a, tok, p, 1, "draft")
	if got := getCore(t, a, tok, "sdr")["offers"].([]any)[0].(map[string]any)["amount_cents"]; got != float64(49000) {
		t.Fatal("draft changed active price", got)
	}
	code, preview := req(a, "POST", "/v1/core/business/preview", tok, "", map[string]any{"target": "draft", "solution": "sdr"})
	if code != 200 || preview["ready_to_publish"] != true {
		t.Fatal("preview", code, preview)
	}
	if preview["context"].(map[string]any)["offers"].([]any)[0].(map[string]any)["amount_cents"] != float64(59000) {
		t.Fatal("preview did not reflect draft")
	}
	corePublish(t, a, tok, 2, "publish")
	for _, sol := range []string{"sdr", "atendimento", "marketing"} {
		ctx := getCore(t, a, tok, sol)
		if ctx["business_version"] != float64(2) || ctx["offers"].([]any)[0].(map[string]any)["amount_cents"] != float64(59000) {
			t.Fatal("consumers disagree", sol, ctx)
		}
		raw, _ := json.Marshal(ctx)
		if sol != "sdr" && strings.Contains(string(raw), "roteiro-sdr") {
			t.Fatal("SDR-private source leaked", sol)
		}
	}
	if a.state.Business["org_demo_alfa"].Versions[0].Profile.Offers[0].AmountCents != 49000 {
		t.Fatal("published history changed")
	}
	if a.state.Business["org_demo_beta"].Versions[0].Profile.Offers[0].AmountCents != 28000 {
		t.Fatal("beta modified")
	}
}
func TestCoreIdempotencyConcurrencyAndSourceValidation(t *testing.T) {
	a, creds, _ := storedApp(t)
	tok := login(t, a, creds, "alfa.admin")
	p := cloneProfile(a.state.Business["org_demo_alfa"].Draft)
	p.Sources[0].Status = "draft"
	first := coreDraft(t, a, tok, p, 1, "save-once")
	replay := coreDraft(t, a, tok, p, 1, "save-once")
	if replay["duplicate"] != true || replay["operation_id"] != first["operation_id"] || a.state.Business["org_demo_alfa"].Revision != 2 {
		t.Fatal("idempotency")
	}
	code, _ := req(a, "POST", "/v1/core/business/publish", tok, "pub", map[string]any{"expected_revision": 2, "reason": "tentativa"})
	if code != 422 {
		t.Fatal("unapproved source was published", code)
	}
	p.Name = "Concorrente"
	code, _ = req(a, "POST", "/v1/core/business/draft", tok, "conflict", map[string]any{"profile": p, "expected_revision": 1, "reason": "edição atrasada"})
	if code != 409 {
		t.Fatal("lost update")
	}
	p.Sources[0].Status = "approved"
	p.Facts[0].SourceID = "absent"
	code, _ = req(a, "POST", "/v1/core/business/draft", tok, "bad-ref", map[string]any{"profile": p, "expected_revision": 2, "reason": "teste"})
	if code != 422 {
		t.Fatal("dangling source")
	}
	p.Facts[0].SourceID = "operacao-alfa"
	p.Facts[0].Solutions = []string{"all", "sdr"}
	code, _ = req(a, "POST", "/v1/core/business/draft", tok, "bad-scope", map[string]any{"profile": p, "expected_revision": 2, "reason": "teste"})
	if code != 422 {
		t.Fatal("ambiguous scope")
	}
	code, _ = req(a, "POST", "/v1/core/business/draft", tok, "unknown", map[string]any{"profile": p, "expected_revision": 2, "reason": "teste", "organization_id": "org_demo_beta"})
	if code != 400 {
		t.Fatal("unknown fields accepted")
	}
}
func TestCoreAtomicAuditFailureAndRestartPreserveEdits(t *testing.T) {
	a, creds, path := storedApp(t)
	tok := login(t, a, creds, "alfa.admin")
	p := cloneProfile(a.state.Business["org_demo_alfa"].Draft)
	p.Name = "Alfa personalizada"
	coreDraft(t, a, tok, p, 1, "draft")
	_, err := a.db.Exec(`CREATE TRIGGER fail_core BEFORE INSERT ON audit WHEN NEW.action='business.version.published' BEGIN SELECT RAISE(ABORT,'test'); END`)
	if err != nil {
		t.Fatal(err)
	}
	code, _ := req(a, "POST", "/v1/core/business/publish", tok, "pub", map[string]any{"expected_revision": 2, "reason": "teste"})
	if code != 503 {
		t.Fatal("audit failure did not fail closed", code)
	}
	if len(a.state.Business["org_demo_alfa"].Versions) != 1 || a.state.Business["org_demo_alfa"].Revision != 2 {
		t.Fatal("partial commit")
	}
	a.db.Exec("DROP TRIGGER fail_core")
	corePublish(t, a, tok, 2, "pub")
	a.Close()
	b, _, err := newApp(path)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	if b.state.Business["org_demo_alfa"].Draft.Name != "Alfa personalizada" || len(b.state.Business["org_demo_alfa"].Versions) != 2 {
		t.Fatal("seed overwrote customization")
	}
	var n int
	if err = b.db.QueryRow("SELECT count(*) FROM audit WHERE action='business.version.published'").Scan(&n); err != nil || n != 1 {
		t.Fatal("publish audit", n, err)
	}
}
func TestCoreRestoreCreatesVersionAndPreservesHistory(t *testing.T) {
	a, creds, _ := storedApp(t)
	tok := login(t, a, creds, "alfa.admin")
	p := cloneProfile(a.state.Business["org_demo_alfa"].Draft)
	p.Offers[0].AmountCents = 69000
	coreDraft(t, a, tok, p, 1, "save")
	corePublish(t, a, tok, 2, "pub")
	code, b := req(a, "POST", "/v1/core/business/restore", tok, "restore", map[string]any{"expected_revision": 3, "version": 1, "reason": "Recuperar preço anterior"})
	if code != 200 {
		t.Fatal(code, b)
	}
	ctx := getCore(t, a, tok, "sdr")
	if ctx["business_version"] != float64(3) || ctx["offers"].([]any)[0].(map[string]any)["amount_cents"] != float64(49000) {
		t.Fatal("restore lost version lineage")
	}
	ws := a.state.Business["org_demo_alfa"]
	if len(ws.Versions) != 3 || ws.Versions[2].RestoredFrom != 1 || ws.Versions[1].Profile.Offers[0].AmountCents != 69000 {
		t.Fatal("destructive recovery")
	}
}
func TestCoreInboundReceiptAndStaleDraftCancellation(t *testing.T) {
	a, creds, _ := storedApp(t)
	tok := login(t, a, creds, "alfa.admin")
	code, out := req(a, "POST", "/__test/ui/inbound", tok, "", map[string]any{"provider_event_id": "core-input", "conversation_id": "conv_demo_alfa", "text": "Somos uma empresa com dois vendedores."})
	if code != 202 || out["business_version"] != float64(1) {
		t.Fatal("not connected", code, out)
	}
	receipt := a.state.ContextReceipts["conv_demo_alfa"]
	if receipt.BusinessVersion != 1 || receipt.AIEnabled || len(receipt.MessageIDs) != 1 {
		t.Fatal("invalid context receipt", receipt)
	}
	p := cloneProfile(a.state.Business["org_demo_alfa"].Draft)
	p.Offers[0].AmountCents = 59000
	coreDraft(t, a, tok, p, 1, "draft")
	corePublish(t, a, tok, 2, "pub")
	if a.state.Messages["conv_demo_alfa"][1].Status != "cancelled" {
		t.Fatal("stale automatic reply survived publication")
	}
	a.Drain()
	if a.state.Messages["conv_demo_alfa"][1].Status != "cancelled" {
		t.Fatal("stale draft delivered")
	}
	code, ctx := req(a, "GET", "/v1/sdr/conversations/conv_demo_alfa/context", tok, "", nil)
	if code != 200 {
		t.Fatal(code)
	}
	prepared := ctx["last_prepared"].(map[string]any)
	if prepared["superseded"] != true || prepared["business"].(map[string]any)["business_version"] != float64(1) {
		t.Fatal("historical context could not be reconstructed")
	}
	_, out = req(a, "POST", "/__test/ui/inbound", tok, "", map[string]any{"provider_event_id": "core-input-2", "conversation_id": "conv_demo_alfa", "text": "Qual o valor?"})
	if out["business_version"] != float64(2) {
		t.Fatal("next turn used old rules")
	}
	if len(a.state.ContextReceipts["conv_demo_alfa"].MessageIDs) != 2 {
		t.Fatal("cancelled reply entered history")
	}
}
func TestCorePublicationPreservesHumanPauseAndQueuedHumanMessage(t *testing.T) {
	a, creds, _ := storedApp(t)
	tok := login(t, a, creds, "alfa.admin")
	req(a, "POST", "/v1/sdr/conversations/conv_demo_alfa/actions", tok, "pause", map[string]any{"kind": "takeover", "reason": "equipe", "expected_revision": 0})
	req(a, "POST", "/v1/sdr/conversations/conv_demo_alfa/messages", tok, "human", map[string]any{"text": "Equipe em atendimento", "expected_revision": 1})
	corePublish(t, a, tok, 1, "pub")
	if a.state.Conversations["conv_demo_alfa"].Automation != "human" {
		t.Fatal("publication resumed automation")
	}
	if a.state.Messages["conv_demo_alfa"][0].Status != "queued" {
		t.Fatal("human message cancelled")
	}
	a.Drain()
	if a.state.Messages["conv_demo_alfa"][0].Status != "sent" {
		t.Fatal("human work lost")
	}
	code, out := req(a, "POST", "/__test/ui/inbound", tok, "", map[string]any{"provider_event_id": "paused-input", "conversation_id": "conv_demo_alfa", "text": "Oi"})
	if code != 202 || out["business_version"] != nil || len(a.state.ContextReceipts) != 0 {
		t.Fatal("human pause ignored")
	}
}
func TestCoreDisabledSolutionStopsPreparationAndSourceNarrowing(t *testing.T) {
	a, creds, _ := storedApp(t)
	tok := login(t, a, creds, "alfa.admin")
	p := cloneProfile(a.state.Business["org_demo_alfa"].Draft)
	p.Sources[0].Solutions = []string{"marketing"}
	coreDraft(t, a, tok, p, 1, "save")
	corePublish(t, a, tok, 2, "publish")
	if len(getCore(t, a, tok, "sdr")["offers"].([]any)) != 0 {
		t.Fatal("source scope bypassed by offer scope")
	}
	p.EnabledSolutions = []string{"marketing"}
	coreDraft(t, a, tok, p, 3, "disable")
	corePublish(t, a, tok, 4, "publish-2")
	code, _ := req(a, "GET", "/v1/core/solutions/sdr/context", tok, "", nil)
	if code != 404 {
		t.Fatal("disabled solution read context")
	}
	_, out := req(a, "POST", "/__test/ui/inbound", tok, "", map[string]any{"provider_event_id": "disabled-input", "conversation_id": "conv_demo_alfa", "text": "Oi"})
	if out["automation_blocked_reason"] != "solution_unavailable" || len(a.state.Messages["conv_demo_alfa"]) != 1 {
		t.Fatal("disabled solution generated reply")
	}
	code, preview := req(a, "POST", "/v1/core/business/preview", tok, "", map[string]any{"target": "draft", "solution": "sdr"})
	if code != 200 || preview["ready_to_publish"] != false || preview["context"].(map[string]any)["offers"] == nil {
		t.Fatal("disabled preview is not renderable")
	}
}
func TestCoreLegacySnapshotMigrationOnlySeedsMissingWorkspace(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.sqlite")
	a, _, err := newApp(path)
	if err != nil {
		t.Fatal(err)
	}
	delete(a.state.Business, "org_demo_beta")
	a.state.Business["org_demo_alfa"].Draft.Name = "Rascunho preservado"
	a.save()
	a.Close()
	a, _, err = newApp(path)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	if a.state.Business["org_demo_alfa"].Draft.Name != "Rascunho preservado" || a.state.Business["org_demo_beta"] == nil {
		t.Fatal("migration reset existing workspace")
	}
}

func TestBiaPresetUsesPublishedCompanyProfile(t *testing.T) {
	a, creds, contextClient, execution, now := pipelineApp(t)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	profile := cloneProfile(a.state.Business["org_demo_alfa"].Draft)

	profile.BiaPreset = "../clinica-v1"
	code, _ := req(a, "POST", "/v1/core/business/draft", admin, "invalid-bia", map[string]any{
		"profile": profile, "expected_revision": 1, "reason": "Teste de perfil inválido",
	})
	if code != 422 {
		t.Fatal("unknown preset accepted", code)
	}
	profile.BiaPreset = "clinica-v1"
	coreDraft(t, a, admin, profile, 1, "choose-clinic")
	if got := getCore(t, a, admin, "sdr")["bia_preset"]; got != nil {
		t.Fatal("draft changed the published preset", got)
	}

	profile.BiaPreset = ""
	coreDraft(t, a, admin, profile, 2, "legacy-editor")
	corePublish(t, a, admin, 3, "publish-clinic")
	if got := getCore(t, a, admin, "sdr")["bia_preset"]; got != "clinica-v1" {
		t.Fatal("legacy editor lost the selected preset", got)
	}
	if getCore(t, a, beta, "sdr")["bia_preset"] != nil || getCore(t, a, admin, "atendimento")["bia_preset"] != nil {
		t.Fatal("preset leaked across tenant or solution")
	}
	input(t, a, admin, "bia-preset-turn", "Quero marcar um horário")
	*now = now.Add(6 * time.Second)
	prepare(t, contextClient)
	job, ok, err := execution.ClaimExecution(context.Background())
	if err != nil || !ok || job.Context.PromptVersion != "sdr-next-multicompany-v1/clinica-v1" {
		t.Fatal("execution worker did not receive the selected prompt", ok, err, job.Context.PromptVersion)
	}
}
