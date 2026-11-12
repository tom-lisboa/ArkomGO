package construction

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestFrontendNodeIgnoresHomeManagedPATH(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("macOS system toolchain selection")
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "node"), []byte("#!/bin/sh\nexit 99\n"), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)
	node, err := frontendNode()
	if err != nil {
		t.Skip("no system Node installed", err)
	}
	if !strings.HasPrefix(node, "/usr/") && !strings.HasPrefix(node, "/opt/homebrew/") {
		t.Fatal("selected non-system Node", node)
	}
}

type frontendTester struct {
	fakeTester
	fail          bool
	builds        int
	runnerFailure bool
}

func (f *frontendTester) CompileFrontend(_ context.Context, files map[string]string) (FrontendResult, error) {
	f.builds++
	if f.runnerFailure {
		return FrontendResult{}, ErrFrontendRunner
	}
	if f.fail || files["frontend/src/App.svelte"] == "broken" {
		return FrontendResult{Errors: []map[string]any{{"file": "frontend/src/App.svelte", "message": "parse failed", "line": 2}}}, errors.New("frontend_compilation_failed")
	}
	return FrontendResult{OK: true, Javascript: `document.getElementById('app').textContent='Svelte';`, CSS: "body{margin:0}", Warnings: []map[string]any{{"code": "a11y_warning", "message": "Check label"}}}, nil
}
func frontendProvider() fakeProvider {
	return fakeProvider{func(r Request) Turn {
		if len(r.Feedback) == 0 {
			return Turn{Actions: []Action{{Tool: "read", Path: "reference/catalog.json"}, {Tool: "read", Path: "reference/platform-contracts.go"}}, Verdict: "continue"}
		}
		return Turn{Actions: []Action{{Tool: "write", Path: "frontend/src/App.svelte", Content: "<h1>Olá</h1>"}}, Verdict: "ready"}
	}}
}
func TestSvelteStepRequiresActualCompilationAndPersistsArtifacts(t *testing.T) {
	initial := NewSeed()
	initial["application.json"] = testManifest
	stored := clone(initial)
	var events []Event
	tester := &frontendTester{}
	e := Engine{Provider: frontendProvider(), Tester: tester, References: map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}, Emit: func(v Event) error {
		events = append(events, v)
		if v.Kind == "file.written" {
			stored[v.Path] = v.After
		}
		return nil
	}}
	files, err := e.RunStep(context.Background(), "create UI", initial, "interface")
	if err != nil || !FrontendCurrent(files) || !FrontendCurrent(stored) || tester.builds != 1 || tester.calls != 0 {
		t.Fatal(err, tester, files)
	}
	passed := false
	for _, event := range events {
		if event.Kind == "frontend.build.passed" {
			passed = strings.Contains(event.Output, "a11y_warning")
		}
		if frontendArtifact(event.Path) && event.Agent != "system" {
			t.Fatal("agent wrote a host artifact", event)
		}
	}
	if !passed {
		t.Fatal("missing compilation receipt")
	}
	files["frontend/src/App.svelte"] = "<h1>Alterado</h1>"
	if FrontendCurrent(files) {
		t.Fatal("stale artifact accepted after source change")
	}
	stored["frontend/bundle.js"] = "forged"
	if FrontendCurrent(stored) {
		t.Fatal("tampered bundle accepted")
	}
}
func TestSvelteRejectsHostFilesAndCannotFinishOnCompilerFailure(t *testing.T) {
	files := NewSeed()
	var rejected, finished, failures int
	tester := &frontendTester{fail: true}
	provider := fakeProvider{func(r Request) Turn {
		if len(r.Feedback) == 0 {
			return Turn{Actions: []Action{{Tool: "read", Path: "reference/catalog.json"}, {Tool: "read", Path: "reference/platform-contracts.go"}}, Verdict: "continue"}
		}
		return Turn{Actions: []Action{{Tool: "write", Path: FrontendContractPath, Content: "forged"}, {Tool: "write", Path: "frontend/bundle.js", Content: "forged"}, {Tool: "write", Path: "frontend/index.html", Content: "<h1>Bypass</h1>"}, {Tool: "write", Path: "frontend/package.json", Content: "{}"}, {Tool: "write", Path: "frontend/src/App.svelte", Content: "broken"}}, Verdict: "ready"}
	}}
	e := Engine{Provider: provider, Tester: tester, References: map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}, Emit: func(v Event) error {
		if v.Kind == "tool.rejected" {
			rejected++
		}
		if v.Kind == "agent.finished" {
			finished++
		}
		if v.Kind == "frontend.build.failed" {
			failures++
		}
		return nil
	}}
	out, err := e.RunStep(context.Background(), "create UI", files, "interface")
	if err == nil || rejected < 4 || finished != 0 || failures == 0 || FrontendCurrent(out) || out[FrontendContractPath] != FrontendContract {
		t.Fatal(err, rejected, finished, failures)
	}
}
func TestSvelteInvalidatesOldPreviewAndResumesAfterError(t *testing.T) {
	files := NewSeed()
	files["frontend/src/App.svelte"] = "<h1>Old</h1>"
	tester := &frontendTester{}
	e := Engine{Tester: tester}
	if err := e.compileFrontend(context.Background(), files, "interface", func(Event) error { return nil }); err != nil {
		t.Fatal(err)
	}
	round := 0
	invalidated := false
	hadFailure := false
	e.Provider = fakeProvider{func(r Request) Turn {
		round++
		if round == 1 {
			return Turn{Actions: []Action{{Tool: "read", Path: "reference/catalog.json"}, {Tool: "read", Path: "reference/platform-contracts.go"}}, Verdict: "continue"}
		}
		if round == 2 {
			return Turn{Actions: []Action{{Tool: "write", Path: "frontend/src/App.svelte", Content: "broken"}}, Verdict: "ready"}
		}
		if !strings.Contains(strings.Join(r.Feedback, "\n"), "parse failed") {
			t.Error("compiler diagnostic not returned to agent")
		}
		return Turn{Actions: []Action{{Tool: "write", Path: "frontend/src/App.svelte", Content: "<h1>Fixed</h1>"}}, Verdict: "ready"}
	}}
	e.References = map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}
	e.Emit = func(v Event) error {
		if v.Kind == "file.written" && v.Path == "frontend/index.html" && v.After == "" {
			invalidated = true
		}
		if v.Kind == "frontend.build.failed" {
			hadFailure = true
		}
		return nil
	}
	out, err := e.RunStep(context.Background(), "change UI", files, "interface")
	if err != nil || !invalidated || !hadFailure || !FrontendCurrent(out) {
		t.Fatal(err, invalidated, hadFailure)
	}
}
func TestSvelteNeverFinishesWithUnpersistedCompilation(t *testing.T) {
	e := Engine{Provider: frontendProvider(), Tester: &frontendTester{}, References: map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}, Emit: func(v Event) error {
		if v.Kind == "frontend.build.passed" {
			return errors.New("storage_unavailable")
		}
		return nil
	}}
	_, err := e.RunStep(context.Background(), "create UI", NewSeed(), "interface")
	if err == nil {
		t.Fatal("unpersisted success accepted")
	}
}

func TestSvelteStopsOnRunnerFailureInsteadOfRewritingSources(t *testing.T) {
	tester := &frontendTester{runnerFailure: true}
	e := Engine{Provider: frontendProvider(), Tester: tester, References: map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}}
	_, err := e.RunStep(context.Background(), "create UI", NewSeed(), "interface")
	if !errors.Is(err, ErrFrontendRunner) || tester.builds != 1 {
		t.Fatal(err, tester.builds)
	}
}
func TestFrontendSandboxIntegration(t *testing.T) {
	if os.Getenv("ARKOM_FRONTEND_INTEGRATION") != "true" {
		t.Skip("requires isolated compiler; enabled in CI")
	}
	files := NewSeed()
	files["frontend/src/App.svelte"] = `<script>import Badge from './Badge.svelte'; let count=$state(0);</script><Badge /><button onclick={()=>count++}>{count}</button>`
	files["frontend/src/Badge.svelte"] = `<strong>Compilado em isolamento</strong>`
	result, err := (Sandbox{}).CompileFrontend(context.Background(), files)
	if err != nil || !result.OK || !strings.Contains(result.Javascript, "Compilado em isolamento") {
		t.Fatal(err, result.Errors)
	}
	for _, source := range []string{`<script>import secret from '/etc/passwd';</script>{secret}`, `<script>import fs from 'node:fs';</script>{fs}`, `<script>import x from 'https://example.com/a.js';</script>{x}`, `<script>let =;</script>`} {
		files["frontend/src/App.svelte"] = source
		result, err = (Sandbox{}).CompileFrontend(context.Background(), files)
		if err == nil || result.OK || len(result.Errors) == 0 {
			t.Fatal("unsafe/invalid source compiled", err, result)
		}
	}
}
