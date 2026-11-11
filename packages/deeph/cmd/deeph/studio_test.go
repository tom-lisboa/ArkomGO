package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBuildStudioQuickResumePlanPrefersLatestWorkspaceSession(t *testing.T) {
	ws := t.TempDir()
	writeStudioRootConfig(t, ws)
	if err := saveChatSessionMeta(ws, &chatSessionMeta{
		ID:        "sess-latest",
		AgentSpec: "guide",
		CreatedAt: time.Now().Add(-time.Minute),
		UpdatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("save session meta: %v", err)
	}

	status := collectStudioStatus(ws)
	plan := buildStudioQuickResumePlan(status, &studioState{
		LastWorkspace: ws,
		LastAgentSpec: "planner",
		LastSessionID: "older",
	})

	if !plan.Available {
		t.Fatalf("expected available quick resume plan: %+v", plan)
	}
	if plan.SessionID != "sess-latest" {
		t.Fatalf("session_id=%q", plan.SessionID)
	}
	if plan.Spec != "guide" {
		t.Fatalf("spec=%q", plan.Spec)
	}
}

func TestBuildStudioQuickResumePlanFallsBackToGuideWithoutSession(t *testing.T) {
	ws := t.TempDir()
	writeStudioRootConfig(t, ws)

	status := collectStudioStatus(ws)
	plan := buildStudioQuickResumePlan(status, &studioState{
		LastWorkspace: filepath.Join(ws, "other"),
		LastAgentSpec: "planner",
		LastSessionID: "sess-other",
	})

	if !plan.Available {
		t.Fatalf("expected available quick resume plan: %+v", plan)
	}
	if plan.SessionID != "" {
		t.Fatalf("session_id=%q", plan.SessionID)
	}
	if plan.Spec != "guide" {
		t.Fatalf("spec=%q", plan.Spec)
	}
}

func TestStudioRecommendedActionPrioritizesValidationAndProviderSetup(t *testing.T) {
	status := studioStatus{
		Initialized:      true,
		DefaultProvider:  "",
		ValidationErrors: 2,
	}
	if got := studioRecommendedAction(status, studioQuickResumePlan{Available: true, Detail: "Resume chat"}); got != "Add a provider." {
		t.Fatalf("recommended=%q", got)
	}

	status.DefaultProvider = "deepseek"
	status.APIKeyEnv = "DEEPSEEK_API_KEY"
	if got := studioRecommendedAction(status, studioQuickResumePlan{Available: true, Detail: "Resume chat"}); got != "Set DEEPSEEK_API_KEY in this shell." {
		t.Fatalf("recommended=%q", got)
	}

	status.APIKeySet = true
	if got := studioRecommendedAction(status, studioQuickResumePlan{Available: true, Detail: "Resume chat"}); got != "Validate and fix workspace errors." {
		t.Fatalf("recommended=%q", got)
	}
}

func TestNormalizeStudioCollaborativePreset(t *testing.T) {
	cases := []struct {
		in   string
		want studioCollaborativePreset
	}{
		{in: "", want: studioCollaborativePresetBuild},
		{in: "1", want: studioCollaborativePresetBuild},
		{in: "debug", want: studioCollaborativePresetDebug},
		{in: "2", want: studioCollaborativePresetDebug},
		{in: "review", want: studioCollaborativePresetReview},
		{in: "3", want: studioCollaborativePresetReview},
	}
	for _, tc := range cases {
		if got := normalizeStudioCollaborativePreset(tc.in); got != tc.want {
			t.Fatalf("normalize preset(%q)=%q want=%q", tc.in, got, tc.want)
		}
	}
}

func TestNormalizeStudioCollaborativeDepth(t *testing.T) {
	cases := []struct {
		in   string
		want studioCollaborativeDepth
	}{
		{in: "", want: studioCollaborativeDepthComplete},
		{in: "1", want: studioCollaborativeDepthQuick},
		{in: "quick", want: studioCollaborativeDepthQuick},
		{in: "2", want: studioCollaborativeDepthComplete},
		{in: "3", want: studioCollaborativeDepthDeep},
		{in: "deep", want: studioCollaborativeDepthDeep},
	}
	for _, tc := range cases {
		if got := normalizeStudioCollaborativeDepth(tc.in); got != tc.want {
			t.Fatalf("normalize depth(%q)=%q want=%q", tc.in, got, tc.want)
		}
	}
}

func TestBuildStudioCollaborativePlanFallsBackToGuide(t *testing.T) {
	ws := t.TempDir()
	writeStudioRootConfig(t, ws)

	plan := buildStudioCollaborativePlan(ws, "ship login", studioCollaborativePresetBuild, studioCollaborativeDepthComplete)
	if plan.Spec != "guide" {
		t.Fatalf("spec=%q want guide", plan.Spec)
	}
	if len(plan.Lanes) != 3 {
		t.Fatalf("lanes=%d want=3", len(plan.Lanes))
	}
	for _, lane := range plan.Lanes {
		if lane.Agent != "guide" {
			t.Fatalf("lane %q agent=%q want guide", lane.Role, lane.Agent)
		}
	}
}

func TestStudioCollaborativeSuggestedLanePrefersInbox(t *testing.T) {
	snapshot := collabSessionSnapshot{
		Lanes: []collabLaneSnapshot{
			{Name: "planner", Inbox: 0},
			{Name: "coder", Inbox: 2},
			{Name: "reviewer", Inbox: 1},
		},
	}
	got, ok := studioCollaborativeSuggestedLane(snapshot, "planner")
	if !ok {
		t.Fatalf("expected lane suggestion")
	}
	if got != "coder" {
		t.Fatalf("lane=%q want coder", got)
	}
}

func TestStudioCollaborativeSuggestedLaneUsesPreferredWithoutInbox(t *testing.T) {
	snapshot := collabSessionSnapshot{
		Lanes: []collabLaneSnapshot{
			{Name: "planner", Inbox: 0},
			{Name: "coder", Inbox: 0},
		},
	}
	got, ok := studioCollaborativeSuggestedLane(snapshot, "planner")
	if !ok {
		t.Fatalf("expected lane suggestion")
	}
	if got != "planner" {
		t.Fatalf("lane=%q want planner", got)
	}
}

func TestStudioCollaborativeSuggestedLaneFallsBackToFirst(t *testing.T) {
	snapshot := collabSessionSnapshot{
		Lanes: []collabLaneSnapshot{
			{Name: "planner", Inbox: 0},
			{Name: "coder", Inbox: 0},
		},
	}
	got, ok := studioCollaborativeSuggestedLane(snapshot, "")
	if !ok {
		t.Fatalf("expected lane suggestion")
	}
	if got != "planner" {
		t.Fatalf("lane=%q want planner", got)
	}
}

func TestStudioCollaborativePublishedTargetsDeduplicates(t *testing.T) {
	got := studioCollaborativePublishedTargets([]collabPublishedHandoff{
		{To: "Coder"},
		{To: "coder"},
		{To: "reviewer"},
	})
	if len(got) != 2 {
		t.Fatalf("targets=%v", got)
	}
	if got[0] != "coder" || got[1] != "reviewer" {
		t.Fatalf("targets=%v", got)
	}
}

func TestStudioCollaborativeDoneSummaryForAutoInputs(t *testing.T) {
	if got := studioCollaborativeDoneSummary(studioCollaborativeContinueText, 2); got != "processed inbox and generated 2 handoff(s)" {
		t.Fatalf("done=%q", got)
	}
	if got := studioCollaborativeDoneSummary(studioCollaborativeKickoffText, 0); got != "started pipeline" {
		t.Fatalf("done=%q", got)
	}
}

func TestStudioCollaborativeSelectNextLanePrefersPublishedTarget(t *testing.T) {
	resp := collabTurnResponse{
		Published: []collabPublishedHandoff{{To: "Reviewer"}},
		Session: collabSessionSnapshot{
			Lanes: []collabLaneSnapshot{
				{Name: "planner", Inbox: 0},
				{Name: "reviewer", Inbox: 0},
			},
		},
	}
	if got := studioCollaborativeSelectNextLane(resp, "planner"); got != "reviewer" {
		t.Fatalf("next=%q want reviewer", got)
	}
}

func TestStudioCollaborativeHasAnyInbox(t *testing.T) {
	if studioCollaborativeHasAnyInbox(collabSessionSnapshot{
		Lanes: []collabLaneSnapshot{{Name: "planner", Inbox: 0}},
	}) {
		t.Fatalf("expected no inbox")
	}
	if !studioCollaborativeHasAnyInbox(collabSessionSnapshot{
		Lanes: []collabLaneSnapshot{{Name: "planner", Inbox: 1}},
	}) {
		t.Fatalf("expected inbox=true")
	}
}

func writeStudioRootConfig(t *testing.T, ws string) {
	t.Helper()
	if err := os.MkdirAll(ws, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	body := "version: 1\n" +
		"default_provider: local_mock\n" +
		"providers:\n" +
		"  - name: local_mock\n" +
		"    type: mock\n" +
		"    model: mock-small\n"
	if err := os.WriteFile(filepath.Join(ws, "deeph.yaml"), []byte(body), 0o644); err != nil {
		t.Fatalf("write deeph.yaml: %v", err)
	}
}
