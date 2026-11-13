package construction

import (
	"context"
	"encoding/json"
	"os"
	"testing"
)

func navigationFixture(t *testing.T) map[string]string {
	t.Helper()
	files := designFixtures(t)
	data, err := os.ReadFile("../../../genesis-frontend/testdata/navigation.json")
	if err != nil {
		t.Fatal(err)
	}
	files[NavigationPath] = string(data)
	plan, err := ValidateNavigation(files, false)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range plan.Routes {
		files[r.Component] = "<h1>Page</h1>"
	}
	files["frontend/src/App.svelte"] = "<h1>Layout</h1>"
	return files
}
func TestNavigationPlanRejectsAmbiguityAndMissingPages(t *testing.T) {
	files := navigationFixture(t)
	plan, _ := ValidateNavigation(files, true)
	copyPlan := *plan
	copyPlan.Routes = append(copyPlan.Routes, NavigationRoute{Path: "/clientes/:another", Title: "Detail", Component: plan.Routes[1].Component, Menu: plan.Routes[1].Menu})
	data, _ := json.Marshal(copyPlan)
	files[NavigationPath] = string(data)
	if _, err := ValidateNavigation(files, false); err == nil {
		t.Fatal("ambiguous routes accepted")
	}
	files = navigationFixture(t)
	delete(files, plan.Routes[0].Component)
	if _, err := ValidateNavigation(files, false); err != nil {
		t.Fatal("UX requires implementation prematurely", err)
	}
	if _, err := ValidateNavigation(files, true); err == nil {
		t.Fatal("missing page accepted")
	}
}
func TestNavigationRequiredOnlyForNewWorkflowAndBoundToBuild(t *testing.T) {
	files := designFixtures(t)
	provider := fakeProvider{func(Request) Turn { return Turn{Verdict: "ready"} }}
	var rejected, finished int
	e := Engine{StepsVersion: 3, Provider: provider, Tester: &frontendTester{}, Emit: func(v Event) error {
		if v.Kind == "navigation.rejected" {
			rejected++
		}
		if v.Kind == "agent.finished" {
			finished++
		}
		return nil
	}}
	if _, err := e.RunStep(context.Background(), "Existing UX", files, "ux"); err == nil || rejected == 0 || finished != 0 {
		t.Fatal("missing route map accepted", err, rejected, finished)
	}
	e.StepsVersion = 2
	if _, err := e.RunStep(context.Background(), "Legacy UX", files, "ux"); err != nil {
		t.Fatal(err)
	}
	files = navigationFixture(t)
	e.StepsVersion = 3
	if err := e.compileFrontend(context.Background(), files, "interface", func(Event) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if !FrontendCurrent(files) {
		t.Fatal("missing receipt")
	}
	plan, _ := ValidateNavigation(files, true)
	plan.Routes[0].Title = "Renamed"
	raw, _ := json.Marshal(plan)
	files[NavigationPath] = string(raw)
	if FrontendCurrent(files) {
		t.Fatal("route-map edit did not invalidate build")
	}
}

func TestInterfaceRevisionProtectsReadyBackendAndPlanEvenFromReviewer(t *testing.T) {
	for _, stage := range []string{"interface", "reviewer"} {
		files := designFixtures(t)
		files["application.json"] = testManifest
		files["backend/keep.go"] = "package solution\n"
		files["DESIGN.md"] = "Existing product plan"
		p := fakeProvider{func(r Request) Turn {
			if len(r.Feedback) == 0 {
				return Turn{Actions: []Action{{Tool: "read", Path: "reference/catalog.json"}, {Tool: "read", Path: "reference/platform-contracts.go"}}, Verdict: "continue"}
			}
			return Turn{Actions: []Action{{Tool: "write", Path: "backend/keep.go", Content: "replaced"}, {Tool: "write", Path: "DESIGN.md", Content: "replanned"}, {Tool: "write", Path: UIPath, Content: "{}"}}, Verdict: "ready"}
		}}
		rejected := 0
		e := Engine{StepsVersion: 2, RevisionScope: "interface", Provider: p, Tester: &frontendTester{}, References: map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}, Emit: func(e Event) error {
			if e.Kind == "tool.rejected" {
				rejected++
			}
			return nil
		}}
		out, err := e.RunStep(context.Background(), "small visual change", files, stage)
		if err == nil || rejected == 0 || out["backend/keep.go"] != files["backend/keep.go"] || out["DESIGN.md"] != files["DESIGN.md"] || out[UIPath] != files[UIPath] {
			t.Fatal("incremental scope escaped", stage, err)
		}
	}
}
