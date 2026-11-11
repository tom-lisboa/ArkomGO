package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"net/http/httptest"
	"sdr-next-pilot/internal/contextworker"
	"sdr-next-pilot/internal/executionworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"testing"
	"time"
)

type mockPlanner struct {
	Call func(sdrsdk.Prepared) sdrsdk.Outcome
}

func (p mockPlanner) Generate(_ context.Context, c sdrsdk.Prepared) (sdrsdk.Outcome, error) {
	return p.Call(c), nil
}
func pipelineApp(t *testing.T) (*App, map[string]string, *sdrsdk.Client, *sdrsdk.Client, *time.Time) {
	t.Helper()
	a, creds, _ := storedApp(t)
	a.pipelineEnabled = true
	a.executionModel = "test-model"
	a.workerSecrets = map[string][32]byte{"context": sha256.Sum256([]byte("context-secret")), "execution": sha256.Sum256([]byte("execution-secret"))}
	now := time.Date(2026, 11, 3, 16, 0, 0, 0, time.UTC)
	a.now = func() time.Time { return now }
	srv := httptest.NewServer(a.privateWorkers())
	t.Cleanup(srv.Close)
	contextClient := &sdrsdk.Client{Base: srv.URL, Token: "context-secret", HTTP: srv.Client()}
	executionClient := &sdrsdk.Client{Base: srv.URL, Token: "execution-secret", Model: "test-model", HTTP: srv.Client()}
	return a, creds, contextClient, executionClient, &now
}
func input(t *testing.T, a *App, tok, id, text string) {
	t.Helper()
	code, out := req(a, "POST", "/__test/ui/inbound", tok, "", map[string]any{"provider_event_id": id, "conversation_id": "conv_demo_alfa", "text": text})
	if code != 202 {
		t.Fatal(code, out)
	}
}
func prepare(t *testing.T, c *sdrsdk.Client) {
	t.Helper()
	w := contextworker.Worker{Queue: c, Policy: sdrsdk.DefaultPolicy()}
	worked, e := w.Once(context.Background())
	if e != nil || !worked {
		t.Fatal("context worker", worked, e)
	}
}
func answer() sdrsdk.Outcome {
	return sdrsdk.Outcome{Decision: sdrsdk.Decision{Action: "reply", Message: "O Essencial custa R$ 490 por mês.", Facts: []sdrsdk.ExtractedFact{{Key: "name", Value: "Ana", MessageID: ""}}, KnowledgeIDs: []string{"essencial"}}, ResponseID: "response-test", Model: "test-model", InputTokens: 100, OutputTokens: 20}
}
func TestPipelineSeparateWorkersGroupAndPersistMemory(t *testing.T) {
	a, creds, cq, eq, now := pipelineApp(t)
	tok := login(t, a, creds, "alfa.admin")
	input(t, a, tok, "p1", "Sou Ana")
	*now = now.Add(2 * time.Second)
	input(t, a, tok, "p2", "Somos uma oficina com dois vendedores. Qual o preço?")
	if len(a.state.Messages["conv_demo_alfa"]) != 2 {
		t.Fatal("API generated fake reply")
	}
	cw := contextworker.Worker{Queue: cq, Policy: sdrsdk.DefaultPolicy()}
	if worked, e := cw.Once(context.Background()); worked || e != nil {
		t.Fatal("quiet window not respected")
	}
	*now = now.Add(6 * time.Second)
	prepare(t, cq)
	ew := executionworker.Worker{Queue: eq, Planner: mockPlanner{Call: func(c sdrsdk.Prepared) sdrsdk.Outcome {
		if len(c.InputIDs) != 2 || len(c.History) != 2 || c.Organization != "org_demo_alfa" {
			t.Error("bad snapshot")
		}
		o := answer()
		o.Decision.Facts[0].MessageID = c.History[0].ID
		return o
	}}}
	if worked, e := ew.Once(context.Background()); !worked || e != nil {
		t.Fatal("execution", worked, e)
	}
	if len(a.state.Messages["conv_demo_alfa"]) != 3 || a.state.Pipeline.Memory["conv_demo_alfa"]["name"].Value != "Ana" {
		t.Fatal("reply or memory missing")
	}
	a.Drain()
	m := a.state.Messages["conv_demo_alfa"][2]
	if m.Status != "sent" || !m.AIGenerated || m.BusinessVersion != 1 {
		t.Fatal("reply trace")
	}
	if len(a.state.Messages["conv_demo_beta"]) != 0 {
		t.Fatal("cross-tenant output")
	}
	raw, _ := json.Marshal(a.pipelineStatus(a.users["alfa.admin"], a.state.Conversations["conv_demo_alfa"]))
	if strings.Contains(string(raw), "execution-secret") || strings.Contains(string(raw), "Lease") {
		t.Fatal("private lease leaked")
	}
}
func TestPipelineNewInputAndHumanPauseRejectInFlightReply(t *testing.T) {
	for _, pause := range []bool{false, true} {
		t.Run(map[bool]string{false: "new-input", true: "human-pause"}[pause], func(t *testing.T) {
			a, creds, cq, eq, now := pipelineApp(t)
			tok := login(t, a, creds, "alfa.admin")
			input(t, a, tok, "a", "Sou Ana")
			*now = now.Add(6 * time.Second)
			prepare(t, cq)
			j, ok, e := eq.ClaimExecution(context.Background())
			if !ok || e != nil {
				t.Fatal(e)
			}
			if pause {
				c := a.state.Conversations["conv_demo_alfa"]
				code, _ := req(a, "POST", "/v1/sdr/conversations/conv_demo_alfa/actions", tok, "pause", map[string]any{"kind": "pause", "reason": "Equipe", "expected_revision": c.Revision})
				if code != 200 {
					t.Fatal(code)
				}
			} else {
				input(t, a, tok, "b", "Na verdade sou Beatriz")
			}
			o := answer()
			o.Decision.Facts = nil
			if e = eq.CompleteExecution(context.Background(), j, o); e != sdrsdk.ErrStale {
				t.Fatal("stale result accepted", e)
			}
			for _, m := range a.state.Messages["conv_demo_alfa"] {
				if m.Author == "assistant" {
					t.Fatal("stale reply committed")
				}
			}
		})
	}
}
func TestPipelineBusinessPublicationRequeuesLatestRules(t *testing.T) {
	a, creds, cq, eq, now := pipelineApp(t)
	tok := login(t, a, creds, "alfa.admin")
	input(t, a, tok, "one", "Qual o preço?")
	*now = now.Add(6 * time.Second)
	prepare(t, cq)
	old, _, _ := eq.ClaimExecution(context.Background())
	p := cloneProfile(a.state.Business["org_demo_alfa"].Draft)
	p.Offers[0].AmountCents = 59000
	coreDraft(t, a, tok, p, 1, "draft")
	corePublish(t, a, tok, 2, "publish")
	o := answer()
	o.Decision.Facts = nil
	if e := eq.CompleteExecution(context.Background(), old, o); e != sdrsdk.ErrStale {
		t.Fatal("old rules accepted")
	}
	*now = now.Add(6 * time.Second)
	prepare(t, cq)
	j, ok, e := eq.ClaimExecution(context.Background())
	if !ok || e != nil || j.Context.BusinessVersion != 2 || !strings.Contains(string(j.Context.Business), "59000") {
		t.Fatal("new business not consumed", e)
	}
}
func TestPipelineLeaseRecoveryAndCommitIdempotency(t *testing.T) {
	a, creds, cq, eq, now := pipelineApp(t)
	tok := login(t, a, creds, "alfa.admin")
	input(t, a, tok, "one", "Qual o preço?")
	*now = now.Add(6 * time.Second)
	prepare(t, cq)
	j, _, _ := eq.ClaimExecution(context.Background())
	*now = now.Add(91 * time.Second)
	retry, ok, e := eq.ClaimExecution(context.Background())
	if !ok || e != nil || j.Lease == retry.Lease {
		t.Fatal("lease not recovered")
	}
	o := answer()
	o.Decision.Facts = nil
	if eq.CompleteExecution(context.Background(), j, o) != sdrsdk.ErrStale {
		t.Fatal("expired worker accepted")
	}
	if e = eq.CompleteExecution(context.Background(), retry, o); e != nil {
		t.Fatal(e)
	}
	if e = eq.CompleteExecution(context.Background(), retry, o); e != nil {
		t.Fatal("completion replay failed", e)
	}
	if len(a.state.Messages["conv_demo_alfa"]) != 2 {
		t.Fatal("duplicate reply")
	}
}
func TestPipelineBurstBoundOptoutAndPrivateRole(t *testing.T) {
	a, creds, cq, eq, now := pipelineApp(t)
	tok := login(t, a, creds, "alfa.admin")
	first := *now
	for i := 0; i < 7; i++ {
		input(t, a, tok, time.Duration(i).String(), "Uma parte da mensagem")
		*now = now.Add(4 * time.Second)
	}
	w := a.state.Pipeline.Windows["conv_demo_alfa"]
	if w.DueAt.After(first.Add(30 * time.Second)) {
		t.Fatal("sustained traffic never closes window")
	}
	*now = first.Add(31 * time.Second)
	prepare(t, cq)
	j, _, _ := eq.ClaimExecution(context.Background())
	input(t, a, tok, "stop", "Não me envie mais mensagens")
	o := answer()
	o.Decision.Facts = nil
	if eq.CompleteExecution(context.Background(), j, o) != sdrsdk.ErrStale || !a.state.Conversations["conv_demo_alfa"].OptedOut {
		t.Fatal("opt-out ignored")
	}
	wrong := *eq
	wrong.Token = "context-secret"
	if _, _, e := wrong.ClaimExecution(context.Background()); e == nil {
		t.Fatal("worker role escalation")
	}
	code, _ := req(a, "POST", "/internal/workers/context/claim", tok, "", map[string]any{})
	if code != 404 {
		t.Fatal("private API exposed publicly")
	}
}
func TestPipelineAtomicFailureAndRestartKeepQueues(t *testing.T) {
	a, creds, cq, eq, now := pipelineApp(t)
	tok := login(t, a, creds, "alfa.admin")
	input(t, a, tok, "one", "Qual o preço?")
	*now = now.Add(6 * time.Second)
	prepare(t, cq)
	j, _, _ := eq.ClaimExecution(context.Background())
	_, e := a.db.Exec(`CREATE TRIGGER fail_execution BEFORE INSERT ON audit WHEN NEW.action='execution.reply' BEGIN SELECT RAISE(ABORT,'test'); END`)
	if e != nil {
		t.Fatal(e)
	}
	o := answer()
	o.Decision.Facts = nil
	if e = eq.CompleteExecution(context.Background(), j, o); e == nil {
		t.Fatal("audit failure accepted")
	}
	if len(a.state.Messages["conv_demo_alfa"]) != 1 {
		t.Fatal("partial execution committed")
	}
	a.db.Exec("DROP TRIGGER fail_execution")
	if e = eq.CompleteExecution(context.Background(), j, o); e != nil {
		t.Fatal(e)
	}
	file := a.file
	a.Close()
	b, _, e := newApp(file)
	if e != nil {
		t.Fatal(e)
	}
	defer b.Close()
	if len(b.state.Pipeline.Runs) != 1 || !b.state.Messages["conv_demo_alfa"][1].AIGenerated {
		t.Fatal("pipeline not durable")
	}
}
