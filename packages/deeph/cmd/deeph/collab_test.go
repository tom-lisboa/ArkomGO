package main

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestExecuteDaemonCollabCloseRemovesPersistedState(t *testing.T) {
	ws := t.TempDir()
	state := collabSessionState{
		ID:        "close-persisted",
		Workspace: ws,
		Goal:      "smoke",
		Spec:      "guide",
		Lanes: []collabLaneSpec{
			{Name: "planner", Agent: "planner"},
		},
		Inbox: map[string][]collabInboxItem{
			"planner": nil,
		},
		NextSeq:   1,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := collabSaveState(state); err != nil {
		t.Fatalf("save collab state: %v", err)
	}

	key := collabSessionKey(ws, state.ID)
	collabDaemonSessions.mu.Lock()
	delete(collabDaemonSessions.sessions, key)
	collabDaemonSessions.mu.Unlock()

	resp, err := executeDaemonCollabClose(context.Background(), collabCloseRequest{
		Workspace: ws,
		SessionID: state.ID,
	})
	if err != nil {
		t.Fatalf("close collab session: %v", err)
	}
	if !resp.Closed {
		t.Fatalf("expected closed=true when state exists on disk")
	}

	_, err = collabReadState(ws, state.ID)
	if !os.IsNotExist(err) {
		t.Fatalf("state file should be removed, got err=%v", err)
	}
}

func TestExecuteDaemonCollabCloseRemovesInMemoryState(t *testing.T) {
	ws := t.TempDir()
	state := collabSessionState{
		ID:        "close-memory",
		Workspace: ws,
		Goal:      "smoke",
		Spec:      "guide",
		Lanes: []collabLaneSpec{
			{Name: "coder", Agent: "coder"},
		},
		Inbox: map[string][]collabInboxItem{
			"coder": nil,
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	key := collabSessionKey(ws, state.ID)
	collabDaemonSessions.mu.Lock()
	collabDaemonSessions.sessions[key] = &collabDaemonSession{state: state}
	collabDaemonSessions.mu.Unlock()

	resp, err := executeDaemonCollabClose(context.Background(), collabCloseRequest{
		Workspace: ws,
		SessionID: state.ID,
	})
	if err != nil {
		t.Fatalf("close collab session: %v", err)
	}
	if !resp.Closed {
		t.Fatalf("expected closed=true when state exists in memory")
	}

	collabDaemonSessions.mu.Lock()
	_, stillLoaded := collabDaemonSessions.sessions[key]
	collabDaemonSessions.mu.Unlock()
	if stillLoaded {
		t.Fatalf("session key %q should be removed from daemon memory", key)
	}
}

func TestExecuteDaemonCollabCloseReturnsFalseWhenMissing(t *testing.T) {
	ws := t.TempDir()
	sessionID := "close-missing"
	key := collabSessionKey(ws, sessionID)
	collabDaemonSessions.mu.Lock()
	delete(collabDaemonSessions.sessions, key)
	collabDaemonSessions.mu.Unlock()

	resp, err := executeDaemonCollabClose(context.Background(), collabCloseRequest{
		Workspace: ws,
		SessionID: sessionID,
	})
	if err != nil {
		t.Fatalf("close collab session: %v", err)
	}
	if resp.Closed {
		t.Fatalf("expected closed=false when session does not exist")
	}
}

func TestCollabSuggestedLanePrefersExplicitLane(t *testing.T) {
	snapshot := collabSessionSnapshot{
		Lanes: []collabLaneSnapshot{
			{Name: "planner", Inbox: 0},
			{Name: "coder", Inbox: 2},
		},
	}
	got, ok := collabSuggestedLane(snapshot, "planner")
	if !ok {
		t.Fatalf("expected lane suggestion to be available")
	}
	if got != "planner" {
		t.Fatalf("lane=%q want planner", got)
	}
}

func TestCollabSuggestedLanePrefersInboxWhenPreferredMissing(t *testing.T) {
	snapshot := collabSessionSnapshot{
		Lanes: []collabLaneSnapshot{
			{Name: "planner", Inbox: 0},
			{Name: "coder", Inbox: 3},
			{Name: "reviewer", Inbox: 1},
		},
	}
	got, ok := collabSuggestedLane(snapshot, "")
	if !ok {
		t.Fatalf("expected lane suggestion to be available")
	}
	if got != "coder" {
		t.Fatalf("lane=%q want coder", got)
	}
}

func TestCollabSuggestedLaneReturnsFalseWhenEmpty(t *testing.T) {
	got, ok := collabSuggestedLane(collabSessionSnapshot{}, "")
	if ok {
		t.Fatalf("expected no lane suggestion, got=%q", got)
	}
}
