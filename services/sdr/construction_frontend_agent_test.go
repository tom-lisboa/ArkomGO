package main

import (
	"context"
	"deeph/pkg/construction"
	"testing"
	"time"
)

type frontendAgentProvider struct{ stepProvider }

func (p *frontendAgentProvider) Next(ctx context.Context, r construction.Request) (construction.Turn, error) {
	turn, err := p.stepProvider.Next(ctx, r)
	actions := turn.Actions[:0]
	for _, action := range turn.Actions {
		if action.Path != "application.json" {
			actions = append(actions, action)
		}
	}
	turn.Actions = actions
	return turn, err
}

func TestFrontendChatAutomaticallyCompletesAndRevisesWithoutBackend(t *testing.T) {
	a, creds, _ := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	p, tt := &frontendAgentProvider{}, &stepTester{}
	stepSetup(a, p, tt)
	base := "/v1/sdr/genesis-demo/construction"
	code, start := req(a, "POST", base, admin, "", map[string]any{"mode": "frontend", "goal": "Oi!"})
	if code != 202 {
		t.Fatal(code, start)
	}
	id := start["id"].(string)
	out := stepCheckpoint(t, a, admin, id, "ready")
	for _, stage := range []string{"architect", "ux", "designer", "interface", "reviewer"} {
		assertStepEvidence(t, out, stage, "completed")
	}
	if len(out["build"].(map[string]any)["steps"].([]any)) != 5 {
		t.Fatal("unexpected backend phase")
	}
	if code, _ = req(a, "GET", base+"/"+id, beta, "", nil); code != 404 {
		t.Fatal("tenant isolation", code)
	}
	files := out["files"].(map[string]any)
	code, start = req(a, "POST", base, admin, "", map[string]any{"mode": "frontend", "goal": "Mude a composição inteira para editorial", "parent_id": id})
	if code != 202 {
		t.Fatal(code, start)
	}
	revised := stepCheckpoint(t, a, admin, start["id"].(string), "ready")
	for path, content := range files {
		if len(path) >= 8 && path[:8] == "backend/" {
			if revised["files"].(map[string]any)[path] != content {
				t.Fatal("changed existing backend", path)
			}
		}
	}
	tt.mu.Lock()
	defer tt.mu.Unlock()
	if tt.calls != 0 {
		t.Fatal("frontend called Go tests", tt.calls)
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	for _, agent := range p.agents {
		if agent == "backend" {
			t.Fatal("backend agent was called")
		}
	}
}

type frontendWaitProvider struct {
	started chan struct{}
	exited  chan struct{}
}

func (p *frontendWaitProvider) Next(ctx context.Context, _ construction.Request) (construction.Turn, error) {
	close(p.started)
	<-ctx.Done()
	close(p.exited)
	return construction.Turn{}, ctx.Err()
}
func TestFrontendCancellationStopsAutomaticHandoff(t *testing.T) {
	a, creds, _ := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	p := &frontendWaitProvider{make(chan struct{}), make(chan struct{})}
	stepSetup(a, p, &stepTester{})
	base := "/v1/sdr/genesis-demo/construction"
	code, start := req(a, "POST", base, admin, "", map[string]any{"mode": "frontend", "goal": "Crie uma página"})
	if code != 202 {
		t.Fatal(code, start)
	}
	select {
	case <-p.started:
	case <-time.After(time.Second):
		t.Fatal("provider never started")
	}
	id := start["id"].(string)
	if code, out := req(a, "POST", base+"/"+id+"/cancel", admin, "", map[string]any{}); code != 200 {
		t.Fatal(code, out)
	}
	select {
	case <-p.exited:
	case <-time.After(time.Second):
		t.Fatal("provider did not stop")
	}
	out := stepCheckpoint(t, a, admin, id, "cancelled")
	for _, raw := range out["traces"].([]any) {
		e := raw.(map[string]any)
		if e["kind"] == "step.started" && e["step_id"] != "architect" {
			t.Fatal("cancelled build continued", e)
		}
	}
}
