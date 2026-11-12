package construction

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

type fakeProvider struct{ next func(Request) Turn }

func (f fakeProvider) Next(_ context.Context, r Request) (Turn, error) { return f.next(r), nil }

type fakeTester struct {
	fail  bool
	calls int
}

func (f *fakeTester) Test(_ context.Context, _ map[string]string) (string, error) {
	f.calls++
	if f.fail {
		return "compile failed", errors.New("compile")
	}
	return "tests passed", nil
}

type transientProvider struct {
	Provider
	failures, calls int
}

func (p *transientProvider) Next(ctx context.Context, r Request) (Turn, error) {
	p.calls++
	if p.failures > 0 {
		p.failures--
		return Turn{}, ErrProviderUnavailable
	}
	return p.Provider.Next(ctx, r)
}
func TestProviderRetryIsBounded(t *testing.T) {
	p := &transientProvider{failures: 5}
	_, err := (&Engine{Provider: p, Tester: &fakeTester{}}).Run(context.Background(), "new application", nil)
	if !errors.Is(err, ErrProviderUnavailable) || p.calls != 2 {
		t.Fatal("retry budget", p.calls, err)
	}
}

const testManifest = `{"schema_version":"arkom.application.v1","catalog_version":"arkom-capabilities-v1","name":"Teste","backend":"go","entrypoint":"frontend/index.html","routes":[],"capabilities":[]}`

func TestCodeActionsAndTraceProvenance(t *testing.T) {
	tester := &fakeTester{}
	events := []Event{}
	p := fakeProvider{func(r Request) Turn {
		switch r.Agent {
		case "architect":
			if len(r.Feedback) == 0 {
				return Turn{Actions: []Action{{"read", "reference/catalog.json", ""}, {"read", "reference/platform-contracts.go", ""}}, Verdict: "continue"}
			}
			return Turn{Summary: "Desenho", Actions: []Action{{"write", "DESIGN.md", "Plano específico"}, {"write", "application.json", testManifest}}, Verdict: "ready"}
		case "backend":
			if len(r.Feedback) > 0 {
				return Turn{Verdict: "ready"}
			}
			return Turn{Actions: []Action{{"write", "../../outside.go", "bad"}, {"write", "backend/platform/contracts.go", "bad"}, {"write", "backend/domain.go", "package solution\nfunc Value() int { return 42 }"}}, Verdict: "ready"}
		case "interface":
			return Turn{Actions: []Action{{"write", "frontend/index.html", "<h1>Produto novo</h1>"}}, Verdict: "ready"}
		default:
			return Turn{Verdict: "ready"}
		}
	}}
	provider := &transientProvider{Provider: p, failures: 1}
	engine := Engine{Provider: provider, Tester: tester, References: map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}, Emit: func(e Event) error { events = append(events, e); return nil }}
	files, err := engine.Run(context.Background(), "Crie produto novo", nil)
	if err != nil {
		t.Fatal(err)
	}
	if files["backend/platform/contracts.go"] != Contracts || files["../../outside.go"] != "" || !strings.Contains(files["backend/domain.go"], "42") {
		t.Fatal("scope or code corruption")
	}
	reads, writes, rejected, retries := 0, 0, 0, 0
	for _, e := range events {
		switch e.Kind {
		case "agent.retry":
			retries++
		case "file.read":
			reads++
		case "file.written":
			writes++
			if files[e.Path] != e.After {
				t.Fatal("trace does not match file")
			}
		case "tool.rejected":
			rejected++
		}
	}
	if reads != 2 || writes != 4 || rejected != 2 || tester.calls != 2 || retries != 1 {
		t.Fatal(reads, writes, rejected, tester.calls)
	}
}
func TestFailedTestsCannotProduceReady(t *testing.T) {
	p := fakeProvider{func(r Request) Turn {
		if r.Agent == "architect" {
			if len(r.Feedback) == 0 {
				return Turn{Actions: []Action{{"read", "reference/catalog.json", ""}, {"read", "reference/platform-contracts.go", ""}}, Verdict: "continue"}
			}
			return Turn{Actions: []Action{{"write", "DESIGN.md", "plan"}, {"write", "application.json", testManifest}}, Verdict: "ready"}
		}
		return Turn{Verdict: "ready"}
	}}
	_, err := (&Engine{Provider: p, References: map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}, Tester: &fakeTester{fail: true}}).Run(context.Background(), "test", nil)
	if err == nil || !strings.Contains(err.Error(), "agent_round_limit") {
		t.Fatal("false ready", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = (&Engine{Provider: p, Tester: &fakeTester{}}).Run(ctx, "test", nil); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}
func TestPathsAndHostOwnedSources(t *testing.T) {
	for _, p := range []string{"/tmp/x.go", "backend/../../x.go", "backend/.env.go", "backend/a.py", "frontend/../backend/x.go", "backend/a\\b.go", ".env", "backend/go.mod", "application-contract.json"} {
		if ValidPath(p) {
			t.Fatal(p)
		}
	}
	for _, p := range []string{"backend/domain.go", "backend/domain_test.go", "frontend/index.html", "frontend/app.js"} {
		if !ValidPath(p) {
			t.Fatal(p)
		}
	}
}
func TestSandboxDeniesHostDataNetworkAndExternalWrites(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("macOS sandbox integration; Linux runner is Docker")
	}
	dir := t.TempDir()
	secret := filepath.Join(dir, "private.txt")
	os.WriteFile(secret, []byte("private-marker"), 0600)
	files := Seed()
	files["backend/domain.go"] = "package solution\nfunc Add(a,b int)int{return a+b}"
	files["backend/domain_test.go"] = fmt.Sprintf(`package solution
import("testing";"os";"net")
func TestDomain(t *testing.T){if Add(2,3)!=5{t.Fatal("domain")}}
func TestIsolation(t *testing.T){if _,e:=os.ReadFile(%s);e==nil{t.Fatal("host data readable")};if e:=os.WriteFile(%s,[]byte("oops"),0600);e==nil{t.Fatal("external write")};if os.Getenv("OPENAI_API_KEY")!=""{t.Fatal("inherited key")};if l,e:=net.Listen("tcp","127.0.0.1:0");e==nil{l.Close();t.Fatal("network")}}
`, strconv.Quote(secret), strconv.Quote(filepath.Join(dir, "outside.txt")))
	output, err := (Sandbox{}).Test(context.Background(), files)
	if err != nil {
		t.Fatal(err, output)
	}
	files["backend/domain_test.go"] = "package solution\nimport \"testing\"\nfunc TestFailure(t *testing.T){t.Fatal(\"expected failure\")}"
	if _, err = (Sandbox{}).Test(context.Background(), files); err == nil {
		t.Fatal("failed tests accepted")
	}
}

func TestManifestMustBeCorrectedBeforeReady(t *testing.T) {
	for _, repair := range []bool{false, true} {
		t.Run(fmt.Sprint(repair), func(t *testing.T) {
			attempts := 0
			p := fakeProvider{func(r Request) Turn {
				switch r.Agent {
				case "architect":
					if len(r.Feedback) == 0 {
						return Turn{Actions: []Action{{"read", "reference/catalog.json", ""}, {"read", "reference/platform-contracts.go", ""}}, Verdict: "continue"}
					}
					return Turn{Actions: []Action{{"write", "DESIGN.md", "plan"}, {"write", "application.json", testManifest}}, Verdict: "ready"}
				case "backend":
					return Turn{Actions: []Action{{"write", "backend/domain.go", "package solution"}}, Verdict: "ready"}
				case "interface":
					return Turn{Actions: []Action{{"write", "frontend/index.html", "<h1>App</h1>"}, {"write", "application.json", strings.Replace(testManifest, `"capabilities":[]`, `"capabilities":["fake.v1"]`, 1)}}, Verdict: "ready"}
				default:
					attempts++
					if repair && attempts > 1 {
						return Turn{Actions: []Action{{"write", "application.json", testManifest}}, Verdict: "ready"}
					}
					return Turn{Verdict: "ready"}
				}
			}}
			rejected := 0
			engine := Engine{Provider: p, Tester: &fakeTester{}, References: map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}, Emit: func(e Event) error {
				if e.Kind == "contract.rejected" {
					rejected++
				}
				return nil
			}}
			_, err := engine.Run(context.Background(), "new app", nil)
			if repair && err != nil {
				t.Fatal(err)
			}
			if !repair && (err == nil || !strings.Contains(err.Error(), "agent_round_limit: reviewer")) {
				t.Fatal("invalid contract became ready", err)
			}
			if rejected == 0 {
				t.Fatal("missing rejection trace")
			}
		})
	}
}

func TestRunStepStopsAtCheckpointAndRestrictsPlanning(t *testing.T) {
	tester := &fakeTester{}
	calls := 0
	rejected := 0
	engine := Engine{Tester: tester, References: map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}}
	engine.Provider = fakeProvider{func(r Request) Turn {
		calls++
		if r.Agent != "architect" {
			t.Fatalf("advanced automatically to %s", r.Agent)
		}
		if len(r.Feedback) == 0 {
			return Turn{Actions: []Action{{"read", "reference/catalog.json", ""}, {"read", "reference/platform-contracts.go", ""}}, Verdict: "continue"}
		}
		if calls == 3 {
			return Turn{Verdict: "ready"}
		}
		return Turn{Actions: []Action{{"write", "DESIGN.md", "Primeira entrega: somar dois valores; histórico fica para depois."}, {"write", "application.json", testManifest}, {"write", "backend/premature.go", "package solution"}, {"write", "frontend/index.html", "<h1>Too early</h1>"}, {"test", "", ""}}, Verdict: "ready"}
	}}
	engine.Emit = func(e Event) error {
		if e.Kind == "tool.rejected" {
			rejected++
		}
		return nil
	}
	files, err := engine.RunStep(context.Background(), "Criar calculadora", nil, "architect")
	if err != nil || calls != 3 || tester.calls != 0 || rejected != 3 || files["backend/premature.go"] != "" || files["frontend/index.html"] != "" {
		t.Fatal(err, calls, tester.calls, rejected, files)
	}
	if _, err := engine.RunStep(context.Background(), "idea", nil, "not-a-step"); err == nil {
		t.Fatal("accepted arbitrary step")
	}
}
