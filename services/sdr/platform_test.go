package main

import (
	"context"
	"encoding/json"
	"sdr-next-pilot/internal/executionworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"testing"
	"time"
)

func createOp(t *testing.T, a *App, tok, flow, mode string, input map[string]string) string {
	t.Helper()
	code, b := req(a, "POST", "/v1/platform/executions", tok, token(), map[string]any{"workflow_id": flow, "mode": mode, "source": "published", "input": input})
	if code != 202 {
		t.Fatal("create", code, b)
	}
	return b["execution"].(map[string]any)["id"].(string)
}
func opView(t *testing.T, a *App, tok, id string) map[string]any {
	t.Helper()
	code, b := req(a, "GET", "/v1/platform/executions/"+id, tok, "", nil)
	if code != 200 {
		t.Fatal(code, b)
	}
	return b
}
func driveOps(t *testing.T, a *App, q *sdrsdk.Client, id string) {
	t.Helper()
	w := executionworker.Worker{Queue: q}
	for i := 0; i < 20; i++ {
		s := a.state.Platform.Executions[id].Status
		if terminalOperation(s) || s == "waiting_approval" || s == "paused" {
			return
		}
		if _, err := w.OnceOperation(context.Background()); err != nil {
			t.Fatal("worker", err)
		}
	}
	t.Fatal("operation did not settle")
}
func commandOp(t *testing.T, a *App, tok, id, kind string) int {
	t.Helper()
	v := opView(t, a, tok, id)
	code, _ := req(a, "POST", "/v1/platform/executions/"+id+"/actions", tok, token(), map[string]any{"kind": kind, "expected_revision": v["revision"], "reason": "Homologação do controle do cliente"})
	return code
}
func publishPlatform(t *testing.T, a *App, tok string, c PlatformConfig) {
	t.Helper()
	ws := a.state.Platform.Workspaces["org_demo_alfa"]
	code, b := req(a, "POST", "/v1/platform/configuration/draft", tok, token(), map[string]any{"config": c, "expected_revision": ws.Revision, "reason": "Ajuste pelo cliente"})
	if code != 200 {
		t.Fatal("save", code, b)
	}
	ws = a.state.Platform.Workspaces["org_demo_alfa"]
	code, b = req(a, "POST", "/v1/platform/configuration/publish", tok, token(), map[string]any{"expected_revision": ws.Revision, "reason": "Publicar fluxo"})
	if code != 200 {
		t.Fatal("publish", code, b)
	}
}
func TestPlatformPermissionsAndTenantIsolation(t *testing.T) {
	a, creds, _, q, _ := pipelineApp(t)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	viewer := login(t, a, creds, "alfa.viewer")
	operator := login(t, a, creds, "alfa.operator")
	for _, tok := range []string{viewer, operator} {
		code, _ := req(a, "POST", "/v1/platform/configuration/publish", tok, "denied", map[string]any{"expected_revision": 1, "reason": "test"})
		if code != 403 {
			t.Fatal("configuration privilege", code)
		}
	}
	code, _ := req(a, "POST", "/v1/platform/executions", viewer, "no", map[string]any{"workflow_id": "preparar_proposta", "mode": "preview", "source": "published", "input": map[string]string{}})
	if code != 403 {
		t.Fatal("viewer execute")
	}
	id := createOp(t, a, admin, "preparar_proposta", "apply", map[string]string{})
	driveOps(t, a, q, id)
	for _, suffix := range []string{"", "/events", "/export"} {
		code, _ := req(a, "GET", "/v1/platform/executions/"+id+suffix, beta, "", nil)
		if code != 404 {
			t.Fatal("cross company", suffix, code)
		}
	}
	raw, _ := json.Marshal(opView(t, a, admin, id))
	if strings.Contains(string(raw), "lease") || strings.Contains(string(raw), "execution-secret") {
		t.Fatal("private authority exposed")
	}
	code, _ = req(a, "POST", "/v1/platform/executions", admin, "cross", map[string]any{"workflow_id": "registrar_pausa", "mode": "apply", "source": "published", "input": map[string]string{"conversation_id": "conv_demo_beta", "reason": "test"}})
	if code != 404 {
		t.Fatal("cross company target", code)
	}
}

func TestPlatformTriggeredWorkRejectsLaterHumanControl(t *testing.T) {
	for _, kind := range []string{"pause", "takeover", "opt_out"} {
		t.Run(kind, func(t *testing.T) {
			a, creds, _, q, _ := pipelineApp(t)
			tok := login(t, a, creds, "alfa.admin")
			id := createOp(t, a, tok, "preparar_proposta", "apply", map[string]string{})
			e := a.state.Platform.Executions[id]
			e.Origin = "automation"
			e.TriggerConversation = "conv_demo_alfa"
			e.TriggerGeneration = a.state.Generation[e.TriggerConversation]
			job, ok, err := q.ClaimOperation(context.Background())
			if err != nil || !ok {
				t.Fatal("claim", err)
			}
			if kind == "opt_out" {
				a.state.Conversations[e.TriggerConversation].OptedOut = true
			} else {
				c := a.state.Conversations[e.TriggerConversation]
				code, _ := req(a, "POST", "/v1/sdr/conversations/"+c.ID+"/actions", tok, token(), map[string]any{"kind": kind, "reason": "Equipe assumiu a operação", "expected_revision": c.Revision})
				if code != 200 {
					t.Fatal("human control", code)
				}
			}
			result, _ := sdrsdk.ComputeAction(job.Plan)
			if err := q.CompleteOperation(context.Background(), job, result); err == nil {
				t.Fatal("old automatic result accepted")
			}
			if len(e.Steps) != 0 {
				t.Fatal("old result persisted")
			}
		})
	}
}
func TestPlatformPreviewHasNoEffects(t *testing.T) {
	a, creds, _, q, _ := pipelineApp(t)
	tok := login(t, a, creds, "alfa.admin")
	id := createOp(t, a, tok, "registrar_pausa", "preview", map[string]string{"conversation_id": "conv_demo_alfa"})
	driveOps(t, a, q, id)
	e := a.state.Platform.Executions[id]
	if e.Status != "completed" || len(e.Steps) != 2 || len(a.state.Platform.Notes) != 0 || a.state.Conversations["conv_demo_alfa"].Automation != "active" {
		t.Fatal("simulation affected operation", e.Status)
	}
	if !strings.Contains(string(e.Steps[0].Output), "would_pause") {
		t.Fatal("preview falsely claimed pause")
	}
}
func TestPlatformApprovalAndExactlyOnceEffects(t *testing.T) {
	a, creds, _, q, _ := pipelineApp(t)
	admin := login(t, a, creds, "alfa.admin")
	op := login(t, a, creds, "alfa.operator")
	id := createOp(t, a, op, "registrar_pausa", "apply", map[string]string{"conversation_id": "conv_demo_alfa", "reason": "Equipe assumirá"})
	driveOps(t, a, q, id)
	if a.state.Platform.Executions[id].Status != "waiting_approval" || a.state.Conversations["conv_demo_alfa"].Automation != "active" {
		t.Fatal("approval bypassed")
	}
	if commandOp(t, a, op, id, "approve") != 403 {
		t.Fatal("operator approved admin-only tool")
	}
	if commandOp(t, a, admin, id, "approve") != 200 {
		t.Fatal("approval failed")
	}
	j, ok, err := q.ClaimOperation(context.Background())
	if !ok || err != nil {
		t.Fatal(err)
	}
	r, _ := sdrsdk.ComputeAction(j.Plan)
	if q.CompleteOperation(context.Background(), j, r) != nil || q.CompleteOperation(context.Background(), j, r) != nil {
		t.Fatal("repeat confirmation")
	}
	driveOps(t, a, q, id)
	if len(a.state.Platform.Notes) != 1 || a.state.Conversations["conv_demo_alfa"].Automation != "paused" || a.state.Platform.Executions[id].Status != "completed" {
		t.Fatal("effects not persisted")
	}
	for _, s := range a.state.Platform.Executions[id].Steps {
		if s.StepID == "pausa" && s.ApprovedBy != "user_alfa_admin" {
			t.Fatal("approval attribution lost")
		}
	}
}
func TestPlatformCancelAndPauseRejectOldWorker(t *testing.T) {
	for _, action := range []string{"cancel", "pause"} {
		t.Run(action, func(t *testing.T) {
			a, creds, _, q, _ := pipelineApp(t)
			tok := login(t, a, creds, "alfa.admin")
			id := createOp(t, a, tok, "preparar_proposta", "apply", map[string]string{})
			j, ok, e := q.ClaimOperation(context.Background())
			if !ok || e != nil {
				t.Fatal(e)
			}
			if commandOp(t, a, tok, id, action) != 200 {
				t.Fatal(action)
			}
			r, _ := sdrsdk.ComputeAction(j.Plan)
			if q.CompleteOperation(context.Background(), j, r) != sdrsdk.ErrStale {
				t.Fatal("old worker committed")
			}
			if len(a.state.Platform.Executions[id].Steps) != 0 {
				t.Fatal("cancelled work applied")
			}
			if action == "pause" {
				if commandOp(t, a, tok, id, "resume") != 200 {
					t.Fatal("resume")
				}
				driveOps(t, a, q, id)
				if a.state.Platform.Executions[id].Status != "completed" {
					t.Fatal("resumption failed")
				}
			}
		})
	}
}
func TestPlatformLeaseExpiryAndApprovalExpiry(t *testing.T) {
	a, creds, _, q, now := pipelineApp(t)
	tok := login(t, a, creds, "alfa.admin")
	id := createOp(t, a, tok, "registrar_pausa", "apply", map[string]string{"conversation_id": "conv_demo_alfa"})
	driveOps(t, a, q, id)
	commandOp(t, a, tok, id, "approve")
	*now = now.Add(16 * time.Minute)
	w := executionworker.Worker{Queue: q}
	w.OnceOperation(context.Background())
	if a.state.Platform.Executions[id].Status != "waiting_approval" || a.state.Conversations["conv_demo_alfa"].Automation != "active" {
		t.Fatal("expired approval used")
	}
	commandOp(t, a, tok, id, "approve")
	j, _, _ := q.ClaimOperation(context.Background())
	*now = now.Add(91 * time.Second)
	newJob, ok, e := q.ClaimOperation(context.Background())
	if !ok || e != nil || newJob.Lease == j.Lease {
		t.Fatal("lease not recovered")
	}
	r, _ := sdrsdk.ComputeAction(j.Plan)
	if q.CompleteOperation(context.Background(), j, r) != sdrsdk.ErrStale {
		t.Fatal("expired worker accepted")
	}
}
func TestPlatformSourceVersionAndRevocation(t *testing.T) {
	a, creds, _, q, _ := pipelineApp(t)
	tok := login(t, a, creds, "alfa.admin")
	id := createOp(t, a, tok, "preparar_proposta", "apply", map[string]string{})
	j, _, _ := q.ClaimOperation(context.Background())
	c := clonePlatform(currentPlatform(a.state.Platform.Workspaces["org_demo_alfa"]).Config)
	c.Workflows[0].Enabled = false
	publishPlatform(t, a, tok, c)
	if a.state.Platform.Executions[id].Status != "cancelled" {
		t.Fatal("revocation did not cancel")
	}
	r, _ := sdrsdk.ComputeAction(j.Plan)
	if q.CompleteOperation(context.Background(), j, r) != sdrsdk.ErrStale {
		t.Fatal("revoked action committed")
	}
	code, _ := req(a, "POST", "/v1/platform/executions", tok, "old-version", map[string]any{"workflow_id": "preparar_proposta", "mode": "apply", "source": "published", "expected_configuration_version": 1, "input": map[string]string{}})
	if code != 409 {
		t.Fatal("stale configuration accepted", code)
	}
}
func TestPlatformInvalidBindingsAndDraftIsolation(t *testing.T) {
	a, creds, _, _, _ := pipelineApp(t)
	tok := login(t, a, creds, "alfa.admin")
	ws := a.state.Platform.Workspaces["org_demo_alfa"]
	c := clonePlatform(ws.Draft)
	c.Workflows[0].Steps[0].Inputs["query"] = ValueBinding{From: "step", StepID: "proposta", Key: "summary"}
	if len(validatePlatform(c)) == 0 {
		t.Fatal("forward dependency accepted")
	}
	c = clonePlatform(ws.Draft)
	c.Tools[0].Handler = "arbitrary.http"
	if len(validatePlatform(c)) == 0 {
		t.Fatal("unregistered handler accepted")
	}
	c = clonePlatform(ws.Draft)
	c.Workflows[0].Name = "Novo nome"
	code, _ := req(a, "POST", "/v1/platform/configuration/draft", tok, "draft", map[string]any{"config": c, "expected_revision": 1, "reason": "teste"})
	if code != 200 || currentPlatform(a.state.Platform.Workspaces["org_demo_alfa"]).Config.Workflows[0].Name == "Novo nome" {
		t.Fatal("draft leaked into published")
	}
}
func TestPlatformAtomicCommitAndRestart(t *testing.T) {
	a, creds, _, q, _ := pipelineApp(t)
	tok := login(t, a, creds, "alfa.admin")
	c := clonePlatform(currentPlatform(a.state.Platform.Workspaces["org_demo_alfa"]).Config)
	c.Workflows[1].Steps = c.Workflows[1].Steps[1:]
	publishPlatform(t, a, tok, c)
	id := createOp(t, a, tok, "registrar_pausa", "apply", map[string]string{"conversation_id": "conv_demo_alfa"})
	j, _, _ := q.ClaimOperation(context.Background())
	r, _ := sdrsdk.ComputeAction(j.Plan)
	_, err := a.db.Exec(`CREATE TRIGGER fail_platform BEFORE INSERT ON audit WHEN NEW.action='platform.step.completed' BEGIN SELECT RAISE(ABORT,'test'); END`)
	if err != nil {
		t.Fatal(err)
	}
	if q.CompleteOperation(context.Background(), j, r) == nil {
		t.Fatal("audit failure accepted")
	}
	if len(a.state.Platform.Notes) != 0 || len(a.state.Platform.Executions[id].Steps) != 0 {
		t.Fatal("partial action committed")
	}
	a.db.Exec("DROP TRIGGER fail_platform")
	if q.CompleteOperation(context.Background(), j, r) != nil {
		t.Fatal("retry commit")
	}
	file := a.file
	a.Close()
	b, _, err := newApp(file)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	if len(b.state.Platform.Notes) != 1 || b.state.Platform.Executions[id].Status != "completed" || currentPlatform(b.state.Platform.Workspaces["org_demo_alfa"]).Version != 2 {
		t.Fatal("restart lost platform")
	}
}
func TestPlatformBusinessChangeInvalidatesPendingExecution(t *testing.T) {
	a, creds, _, q, _ := pipelineApp(t)
	tok := login(t, a, creds, "alfa.admin")
	id := createOp(t, a, tok, "preparar_proposta", "apply", map[string]string{})
	j, _, _ := q.ClaimOperation(context.Background())
	corePublish(t, a, tok, 1, "business-new")
	r, _ := sdrsdk.ComputeAction(j.Plan)
	if a.state.Platform.Executions[id].Status != "cancelled" || q.CompleteOperation(context.Background(), j, r) != sdrsdk.ErrStale {
		t.Fatal("old business execution survived")
	}
}
func TestPlatformAutomationFromKnownFactRunsOnce(t *testing.T) {
	a, creds, cq, q, now := pipelineApp(t)
	tok := login(t, a, creds, "alfa.admin")
	c := clonePlatform(currentPlatform(a.state.Platform.Workspaces["org_demo_alfa"]).Config)
	c.Workflows[0].Automation.Enabled = true
	publishPlatform(t, a, tok, c)
	input(t, a, tok, "auto1", "Sou Ana")
	*now = now.Add(6 * time.Second)
	prepare(t, cq)
	w := executionworker.Worker{Queue: q, Planner: mockPlanner{Call: func(p sdrsdk.Prepared) sdrsdk.Outcome {
		o := answer()
		o.Decision.Facts[0].MessageID = p.History[0].ID
		return o
	}}}
	if _, e := w.Once(context.Background()); e != nil {
		t.Fatal(e)
	}
	if len(a.state.Platform.Executions) != 1 {
		t.Fatal("automatic workflow not queued")
	}
	a.Drain()
	input(t, a, tok, "auto2", "Olá novamente")
	*now = now.Add(6 * time.Second)
	prepare(t, cq)
	w.Once(context.Background())
	if len(a.state.Platform.Executions) != 1 {
		t.Fatal("automatic workflow repeated for same condition")
	}
	for id, e := range a.state.Platform.Executions {
		if e.Origin != "automation" || e.Input["customer_name"] != "Ana" {
			t.Fatal("automatic input wrong")
		}
		driveOps(t, a, q, id)
	}
}
