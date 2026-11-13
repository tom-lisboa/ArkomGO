package construction

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func designFixtures(t *testing.T) map[string]string {
	t.Helper()
	files := NewSeed()
	for _, name := range []string{"ux", "ui"} {
		raw, err := os.ReadFile("testdata/" + name + ".json")
		if err != nil {
			t.Fatal(err)
		}
		files["design/"+name+".json"] = string(raw)
	}
	return files
}
func TestDesignSpecificationsRejectMissingDecisions(t *testing.T) {
	files := designFixtures(t)
	if err := ValidateDesign(files, "designer"); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ path, field string }{{UXPath, "audience"}, {UXPath, "states"}, {UXPath, "acceptance"}, {UIPath, "colors"}, {UIPath, "responsive"}, {UIPath, "components"}} {
		bad := clone(files)
		var data map[string]any
		json.Unmarshal([]byte(bad[tc.path]), &data)
		delete(data, tc.field)
		raw, _ := json.Marshal(data)
		bad[tc.path] = string(raw)
		if ValidateDesign(bad, "reviewer") == nil {
			t.Fatal("missing decision accepted", tc)
		}
	}
	files[UXPath] += "{}"
	if ValidateDesign(files, "ux") == nil {
		t.Fatal("multiple JSON objects accepted")
	}
}
func TestDesignAgentsWriteOnlyTheirArtifactsAndRequireEvidence(t *testing.T) {
	for _, stage := range []string{"ux", "designer"} {
		t.Run(stage, func(t *testing.T) {
			expected := designFixtures(t)
			initial := NewSeed()
			name := UXPath
			if stage == "designer" {
				initial[UXPath] = expected[UXPath]
				name = UIPath
			}
			rounds := 0
			tester := &frontendTester{}
			var rejected, validated, finished int
			provider := fakeProvider{func(r Request) Turn {
				rounds++
				if !strings.Contains(r.Instruction, DesignReference) {
					t.Error("missing design handoff")
				}
				if rounds == 1 {
					return Turn{Actions: []Action{{Tool: "read", Path: "reference/catalog.json"}, {Tool: "read", Path: "reference/platform-contracts.go"}}, Verdict: "continue"}
				}
				if rounds == 2 {
					return Turn{Actions: []Action{{Tool: "write", Path: "frontend/src/App.svelte", Content: "<h1>Premature</h1>"}, {Tool: "test"}}, Verdict: "ready"}
				}
				if rounds == 3 {
					return Turn{Actions: []Action{{Tool: "write", Path: name, Content: "{}"}}, Verdict: "ready"}
				}
				return Turn{Actions: []Action{{Tool: "write", Path: name, Content: expected[name]}}, Verdict: "ready"}
			}}
			e := Engine{StepsVersion: 2, Provider: provider, Tester: tester, References: map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}, Emit: func(v Event) error {
				switch v.Kind {
				case "tool.rejected", "design.rejected":
					rejected++
				case "design.validated":
					validated++
				case "agent.finished":
					finished++
				}
				return nil
			}}
			out, err := e.RunStep(context.Background(), "small product", initial, stage)
			if err != nil || rejected != 3 || validated != 1 || finished != 1 || tester.calls != 0 || tester.builds != 0 || out[name] != expected[name] || out["frontend/src/App.svelte"] != "" {
				t.Fatal(err, rejected, validated, finished, tester)
			}
		})
	}
}
func TestDesignWorkflowVersionAndInterfaceGate(t *testing.T) {
	if len(StepsForVersion(1)) != 4 || len(StepsForVersion(2)) != 6 || len(StepsForVersion(99)) != 0 {
		t.Fatal("unexpected plan")
	}
	e := Engine{StepsVersion: 1, Provider: frontendProvider(), Tester: &frontendTester{}}
	if _, err := e.RunStep(context.Background(), "legacy", NewSeed(), "ux"); err == nil {
		t.Fatal("injected UX into old workflow")
	}
	e.StepsVersion = 2
	e.References = map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}
	if _, err := e.RunStep(context.Background(), "missing specs", NewSeed(), "interface"); err == nil {
		t.Fatal("interface finished without UX/UI")
	}
}
