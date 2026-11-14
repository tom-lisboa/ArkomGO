package construction

import (
	"context"
	"strings"
	"testing"
)

func TestFrontendAgentCompilesProgressivelyAndCannotChangeBackend(t *testing.T) {
	files := navigationFixture(t)
	delete(files, "frontend/src/App.svelte")
	files["application.json"] = testManifest
	files["backend/keep.go"] = "package solution\n// preserved custom backend\n"
	original := clone(files)
	round, rejected, previews := 0, 0, 0
	tester := &frontendTester{}
	e := Engine{StepsVersion: 4, Tester: tester, References: map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}}
	e.Emit = func(v Event) error {
		if v.Kind == "tool.rejected" {
			rejected++
		}
		if v.Kind == "frontend.build.passed" {
			previews++
		}
		return nil
	}
	e.Provider = fakeProvider{func(r Request) Turn {
		round++
		if strings.Contains(r.Instruction, RuntimeReference) {
			t.Error("Go runtime rules leaked into frontend request")
		}
		for path := range r.Files {
			if frontendArtifact(path) {
				t.Error("compiled artifacts leaked into provider input", path)
			}
		}
		if round == 1 {
			return Turn{Actions: []Action{{Tool: "read", Path: "reference/catalog.json"}, {Tool: "read", Path: "reference/platform-contracts.go"}}, Verdict: "continue"}
		}
		if round == 2 {
			return Turn{Actions: []Action{{Tool: "write", Path: "frontend/src/App.svelte", Content: "<h1>First real region</h1>"}}, Verdict: "continue"}
		}
		if round == 3 && previews != 1 {
			t.Errorf("first usable preview was not compiled before next round: %d", previews)
		}
		if round > 3 {
			return Turn{Verdict: "ready"}
		}
		return Turn{Actions: []Action{{Tool: "write", Path: "backend/keep.go", Content: "corrupted"}, {Tool: "write", Path: "application.json", Content: "{}"}, {Tool: "write", Path: "frontend/src/App.svelte", Content: "<h1>Finished page</h1>"}}, Verdict: "ready"}
	}}
	out, err := e.RunStep(context.Background(), "Create an original page", files, "interface")
	if err != nil || previews != 2 || rejected != 2 || tester.calls != 0 || !FrontendCurrent(out) {
		t.Fatal(err, previews, rejected, tester)
	}
	for path, content := range original {
		if strings.HasPrefix(path, "backend/") || path == "application.json" {
			if out[path] != content {
				t.Fatal("frontend changed existing backend", path)
			}
		}
	}
	e.Provider = fakeProvider{func(r Request) Turn {
		if len(r.Feedback) == 0 {
			return Turn{Actions: []Action{{Tool: "read", Path: "reference/catalog.json"}, {Tool: "read", Path: "reference/platform-contracts.go"}}, Verdict: "continue"}
		}
		return Turn{Actions: []Action{{Tool: "test"}}, Verdict: "ready"}
	}}
	out, err = e.RunStep(context.Background(), "Review page", out, "reviewer")
	if err != nil || tester.calls != 0 || !FrontendCurrent(out) {
		t.Fatal("reviewer ran backend tests or lost valid frontend", err, tester)
	}
}

type progressiveFrontendProvider struct {
	t        *testing.T
	previews *int
	writes   *int
	actions  []Action
}

func (p progressiveFrontendProvider) Next(context.Context, Request) (Turn, error) {
	p.t.Fatal("blocking provider used for live interface")
	return Turn{}, nil
}
func (p progressiveFrontendProvider) NextProgressive(ctx context.Context, r Request, emit func(Progress) error) (Turn, error) {
	for _, action := range p.actions {
		if err := emit(Progress{Path: action.Path}); err != nil {
			return Turn{}, err
		}
		if err := emit(Progress{Action: &action}); err != nil {
			return Turn{}, err
		}
	}
	if *p.previews != 1 || *p.writes != 1 {
		p.t.Fatal("preview was not published while the provider was still responding", *p.previews, *p.writes)
	}
	return Turn{Actions: p.actions, Verdict: "ready"}, nil
}
func TestStreamingFrontendPublishesBeforeProviderCompletesAndSealsOnlyFinalBuild(t *testing.T) {
	files := navigationFixture(t)
	files["application.json"] = testManifest
	previews, writes := 0, 0
	e := Engine{StepsVersion: 4, Tester: &frontendTester{}, References: map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}}
	e.Provider = progressiveFrontendProvider{t, &previews, &writes, []Action{{Tool: "write", Path: "frontend/src/App.svelte", Content: "<h1>Primeira seção</h1>"}}}
	var partialReceipt string
	e.Emit = func(v Event) error {
		if v.Kind == "file.written" && v.Agent == "interface" {
			writes++
		}
		if v.Kind == "frontend.build.passed" {
			previews++
		}
		if v.Path == "frontend/build.json" && v.After != "" && partialReceipt == "" {
			partialReceipt = v.After
		}
		return nil
	}
	out, err := e.RunStep(context.Background(), "Build live", files, "interface")
	if err != nil || writes != 1 || previews != 2 || !FrontendCurrent(out) {
		t.Fatal(err, writes, previews)
	}
	copy := clone(out)
	copy["frontend/build.json"] = partialReceipt
	if FrontendCurrent(copy) {
		t.Fatal("partial preview was accepted as final delivery")
	}
}
