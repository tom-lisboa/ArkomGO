package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"deeph/internal/runtime"
)

const (
	collabDefaultKind = "summary/text"
	collabStateSuffix = ".collab.json"
)

type collabLaneSpec struct {
	Name  string `json:"name"`
	Agent string `json:"agent"`
}

type collabEdgeSpec struct {
	From string `json:"from"`
	To   string `json:"to"`
	Kind string `json:"kind,omitempty"`
}

type collabStartRequest struct {
	Workspace string           `json:"workspace"`
	SessionID string           `json:"session_id"`
	Goal      string           `json:"goal"`
	Spec      string           `json:"spec"`
	Lanes     []collabLaneSpec `json:"lanes,omitempty"`
	Edges     []collabEdgeSpec `json:"edges,omitempty"`
}

type collabStatusRequest struct {
	Workspace string `json:"workspace"`
	SessionID string `json:"session_id"`
	Lane      string `json:"lane,omitempty"`
}

type collabTurnRequest struct {
	Workspace string `json:"workspace"`
	SessionID string `json:"session_id"`
	Lane      string `json:"lane"`
	Text      string `json:"text"`
}

type collabCloseRequest struct {
	Workspace string `json:"workspace"`
	SessionID string `json:"session_id"`
}

type collabStartResponse struct {
	Created bool                  `json:"created"`
	Session collabSessionSnapshot `json:"session"`
}

type collabStatusResponse struct {
	Session collabSessionSnapshot `json:"session"`
}

type collabTurnResponse struct {
	Reply     string                   `json:"reply,omitempty"`
	Error     string                   `json:"error,omitempty"`
	Published []collabPublishedHandoff `json:"published,omitempty"`
	Session   collabSessionSnapshot    `json:"session"`
}

type collabCloseResponse struct {
	Closed bool `json:"closed"`
}

type collabPublishedHandoff struct {
	ArtifactID string `json:"artifact_id"`
	To         string `json:"to"`
	Kind       string `json:"kind"`
	Summary    string `json:"summary,omitempty"`
}

type collabLaneSnapshot struct {
	Name  string `json:"name"`
	Agent string `json:"agent"`
	Inbox int    `json:"inbox"`
}

type collabTurnRecord struct {
	Seq       int       `json:"seq"`
	Lane      string    `json:"lane"`
	Agent     string    `json:"agent"`
	Input     string    `json:"input"`
	Reply     string    `json:"reply,omitempty"`
	Error     string    `json:"error,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type collabArtifactRecord struct {
	ID        string    `json:"id"`
	Seq       int       `json:"seq"`
	FromLane  string    `json:"from_lane"`
	ToLane    string    `json:"to_lane"`
	Kind      string    `json:"kind"`
	Summary   string    `json:"summary,omitempty"`
	Text      string    `json:"text,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type collabInboxItem struct {
	ArtifactID string    `json:"artifact_id"`
	FromLane   string    `json:"from_lane"`
	Kind       string    `json:"kind"`
	Summary    string    `json:"summary,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type collabSessionSnapshot struct {
	ID            string               `json:"id"`
	Workspace     string               `json:"workspace"`
	Goal          string               `json:"goal"`
	Spec          string               `json:"spec"`
	CreatedAt     time.Time            `json:"created_at"`
	UpdatedAt     time.Time            `json:"updated_at"`
	TurnCount     int                  `json:"turn_count"`
	ArtifactCount int                  `json:"artifact_count"`
	Lanes         []collabLaneSnapshot `json:"lanes,omitempty"`
	Edges         []collabEdgeSpec     `json:"edges,omitempty"`
	RecentTurns   []collabTurnRecord   `json:"recent_turns,omitempty"`
	LaneInbox     []collabInboxItem    `json:"lane_inbox,omitempty"`
}

type collabSessionState struct {
	ID        string                       `json:"id"`
	Workspace string                       `json:"workspace"`
	Goal      string                       `json:"goal"`
	Spec      string                       `json:"spec"`
	Lanes     []collabLaneSpec             `json:"lanes"`
	Edges     []collabEdgeSpec             `json:"edges,omitempty"`
	Turns     []collabTurnRecord           `json:"turns,omitempty"`
	Artifacts []collabArtifactRecord       `json:"artifacts,omitempty"`
	Inbox     map[string][]collabInboxItem `json:"inbox,omitempty"`
	NextSeq   int                          `json:"next_seq"`
	CreatedAt time.Time                    `json:"created_at"`
	UpdatedAt time.Time                    `json:"updated_at"`
}

type collabDaemonSession struct {
	mu    sync.Mutex
	state collabSessionState
}

var collabDaemonSessions = struct {
	mu       sync.Mutex
	sessions map[string]*collabDaemonSession
}{
	sessions: map[string]*collabDaemonSession{},
}

var collabFallbackWarnings = struct {
	mu   sync.Mutex
	seen map[string]struct{}
}{
	seen: map[string]struct{}{},
}

func cmdCollab(args []string) error {
	if len(args) == 0 {
		return errors.New("collab requires a subcommand: start, status, turn, chat or close")
	}
	switch args[0] {
	case "start":
		return cmdCollabStart(args[1:])
	case "status":
		return cmdCollabStatus(args[1:])
	case "turn":
		return cmdCollabTurn(args[1:])
	case "chat":
		return cmdCollabChat(args[1:])
	case "close":
		return cmdCollabClose(args[1:])
	default:
		return fmt.Errorf("unknown collab subcommand %q", args[0])
	}
}

func cmdCollabStart(args []string) error {
	fs := flag.NewFlagSet("collab start", flag.ContinueOnError)
	workspace := fs.String("workspace", ".", "workspace path")
	sessionID := fs.String("session", "", "collab session id")
	goal := fs.String("goal", "", "collaboration goal (required)")
	spec := fs.String("spec", "guide", "default workflow spec for the session")
	lanesRaw := fs.String("lanes", "", "lane list, ex.: planner:planner,coder:coder,reviewer:reviewer")
	edgesRaw := fs.String("edges", "", "edge list, ex.: planner>coder,coder>reviewer")
	useDaemon := fs.Bool("daemon", true, "execute via deephd (local daemon, default=true)")
	daemonTarget := fs.String("daemon-target", deephDaemonDefaultTarget(), "deephd target (host:port)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*goal) == "" {
		return errors.New("collab start requires --goal")
	}
	lanes, err := parseCollabLanesCSV(*lanesRaw)
	if err != nil {
		return err
	}
	edges, err := parseCollabEdgesCSV(*edgesRaw)
	if err != nil {
		return err
	}
	req := collabStartRequest{
		Workspace: strings.TrimSpace(*workspace),
		SessionID: strings.TrimSpace(*sessionID),
		Goal:      strings.TrimSpace(*goal),
		Spec:      strings.TrimSpace(*spec),
		Lanes:     lanes,
		Edges:     edges,
	}
	resp, err := collabStartWithFallback(req, *useDaemon, strings.TrimSpace(*daemonTarget))
	if err != nil {
		return err
	}
	printCollabSessionSnapshot(resp.Session)
	if resp.Created {
		fmt.Printf("collab session created: %s\n", resp.Session.ID)
	} else {
		fmt.Printf("collab session resumed: %s\n", resp.Session.ID)
	}
	saveStudioRecent(resp.Session.Workspace, resp.Session.Spec, resp.Session.ID)
	return nil
}

func cmdCollabStatus(args []string) error {
	fs := flag.NewFlagSet("collab status", flag.ContinueOnError)
	workspace := fs.String("workspace", ".", "workspace path")
	lane := fs.String("lane", "", "lane to inspect inbox")
	useDaemon := fs.Bool("daemon", true, "execute via deephd (local daemon, default=true)")
	daemonTarget := fs.String("daemon-target", deephDaemonDefaultTarget(), "deephd target (host:port)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	rest := fs.Args()
	if len(rest) != 1 {
		return errors.New("collab status requires <session-id>")
	}
	req := collabStatusRequest{
		Workspace: strings.TrimSpace(*workspace),
		SessionID: strings.TrimSpace(rest[0]),
		Lane:      strings.TrimSpace(*lane),
	}
	resp, err := collabStatusWithFallback(req, *useDaemon, strings.TrimSpace(*daemonTarget))
	if err != nil {
		return err
	}
	printCollabSessionSnapshot(resp.Session)
	return nil
}

func cmdCollabTurn(args []string) error {
	fs := flag.NewFlagSet("collab turn", flag.ContinueOnError)
	workspace := fs.String("workspace", ".", "workspace path")
	lane := fs.String("lane", "", "lane name (required)")
	useDaemon := fs.Bool("daemon", true, "execute via deephd (local daemon, default=true)")
	daemonTarget := fs.String("daemon-target", deephDaemonDefaultTarget(), "deephd target (host:port)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	rest := fs.Args()
	if len(rest) < 2 {
		return errors.New("collab turn requires <session-id> <text>")
	}
	if strings.TrimSpace(*lane) == "" {
		return errors.New("collab turn requires --lane")
	}
	req := collabTurnRequest{
		Workspace: strings.TrimSpace(*workspace),
		SessionID: strings.TrimSpace(rest[0]),
		Lane:      strings.TrimSpace(*lane),
		Text:      strings.TrimSpace(strings.Join(rest[1:], " ")),
	}
	resp, err := collabTurnWithFallback(req, *useDaemon, strings.TrimSpace(*daemonTarget))
	if err != nil {
		return err
	}
	if strings.TrimSpace(resp.Error) != "" {
		fmt.Printf("%s\n", uiErrorText(resp.Error))
		return nil
	}
	fmt.Printf("%s\n", renderChatReplyBody(resp.Reply))
	if len(resp.Published) > 0 {
		for _, pub := range resp.Published {
			fmt.Printf("handoff -> %s (%s) %s\n", pub.To, pub.Kind, pub.Summary)
		}
	}
	return nil
}

func cmdCollabChat(args []string) error {
	fs := flag.NewFlagSet("collab chat", flag.ContinueOnError)
	workspace := fs.String("workspace", ".", "workspace path")
	sessionID := fs.String("session", "", "collab session id")
	lane := fs.String("lane", "", "lane name")
	useDaemon := fs.Bool("daemon", true, "execute via deephd (local daemon, default=true)")
	daemonTarget := fs.String("daemon-target", deephDaemonDefaultTarget(), "deephd target (host:port)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*sessionID) == "" {
		return errors.New("collab chat requires --session")
	}
	statusReq := collabStatusRequest{
		Workspace: strings.TrimSpace(*workspace),
		SessionID: strings.TrimSpace(*sessionID),
	}
	statusResp, err := collabStatusWithFallback(statusReq, *useDaemon, strings.TrimSpace(*daemonTarget))
	if err != nil {
		return err
	}
	chosenLane, ok := collabSuggestedLane(statusResp.Session, strings.TrimSpace(*lane))
	if !ok {
		return errors.New("collab session has no lanes")
	}

	fmt.Printf("collab chat session=%s lane=%s\n", statusResp.Session.ID, chosenLane)
	fmt.Println("type /status, /inbox or /exit")
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 64*1024), 2*1024*1024)
	for {
		fmt.Printf("%s[%s]> ", chosenLane, statusResp.Session.ID)
		if !scanner.Scan() {
			if err := scanner.Err(); err != nil {
				return err
			}
			fmt.Println("")
			return nil
		}
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		switch strings.ToLower(line) {
		case "/exit", "/quit":
			return nil
		case "/status":
			resp, err := collabStatusWithFallback(collabStatusRequest{
				Workspace: strings.TrimSpace(*workspace),
				SessionID: strings.TrimSpace(*sessionID),
				Lane:      chosenLane,
			}, *useDaemon, strings.TrimSpace(*daemonTarget))
			if err != nil {
				fmt.Printf("error: %v\n", err)
				continue
			}
			printCollabSessionSnapshot(resp.Session)
			continue
		case "/inbox":
			resp, err := collabStatusWithFallback(collabStatusRequest{
				Workspace: strings.TrimSpace(*workspace),
				SessionID: strings.TrimSpace(*sessionID),
				Lane:      chosenLane,
			}, *useDaemon, strings.TrimSpace(*daemonTarget))
			if err != nil {
				fmt.Printf("error: %v\n", err)
				continue
			}
			if len(resp.Session.LaneInbox) == 0 {
				fmt.Println("(inbox empty)")
				continue
			}
			fmt.Println("inbox:")
			for _, item := range resp.Session.LaneInbox {
				fmt.Printf("- from=%s kind=%s summary=%s\n", item.FromLane, item.Kind, item.Summary)
			}
			continue
		}

		turnResp, err := collabTurnWithFallback(collabTurnRequest{
			Workspace: strings.TrimSpace(*workspace),
			SessionID: strings.TrimSpace(*sessionID),
			Lane:      chosenLane,
			Text:      line,
		}, *useDaemon, strings.TrimSpace(*daemonTarget))
		if err != nil {
			fmt.Printf("error: %v\n", err)
			continue
		}
		if strings.TrimSpace(turnResp.Error) != "" {
			fmt.Printf("%s\n", uiErrorText(turnResp.Error))
			continue
		}
		fmt.Printf("%s\n", renderChatReplyBody(turnResp.Reply))
		if len(turnResp.Published) > 0 {
			for _, pub := range turnResp.Published {
				fmt.Printf("handoff -> %s (%s)\n", pub.To, pub.Kind)
			}
		}
	}
}

func cmdCollabClose(args []string) error {
	fs := flag.NewFlagSet("collab close", flag.ContinueOnError)
	workspace := fs.String("workspace", ".", "workspace path")
	useDaemon := fs.Bool("daemon", true, "execute via deephd (local daemon, default=true)")
	daemonTarget := fs.String("daemon-target", deephDaemonDefaultTarget(), "deephd target (host:port)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	rest := fs.Args()
	if len(rest) != 1 {
		return errors.New("collab close requires <session-id>")
	}
	resp, err := collabCloseWithFallback(collabCloseRequest{
		Workspace: strings.TrimSpace(*workspace),
		SessionID: strings.TrimSpace(rest[0]),
	}, *useDaemon, strings.TrimSpace(*daemonTarget))
	if err != nil {
		return err
	}
	if resp.Closed {
		fmt.Printf("collab session closed: %s\n", strings.TrimSpace(rest[0]))
		return nil
	}
	fmt.Printf("collab session not loaded: %s\n", strings.TrimSpace(rest[0]))
	return nil
}

func collabStartWithFallback(req collabStartRequest, useDaemon bool, target string) (collabStartResponse, error) {
	if useDaemon {
		if resp, err := deephDaemonCollabStart(target, req); err == nil {
			return resp, nil
		} else if !isDaemonUnavailableError(err) {
			return collabStartResponse{}, err
		}
		if _, _, err := startDaemonBackground(target); err == nil {
			if resp, err := deephDaemonCollabStart(target, req); err == nil {
				return resp, nil
			} else if !isDaemonUnavailableError(err) {
				return collabStartResponse{}, err
			}
		}
		collabWarnFallbackOnce(target, "start")
	}
	return executeDaemonCollabStart(context.Background(), req)
}

func collabStatusWithFallback(req collabStatusRequest, useDaemon bool, target string) (collabStatusResponse, error) {
	if useDaemon {
		if resp, err := deephDaemonCollabStatus(target, req); err == nil {
			return resp, nil
		} else if !isDaemonUnavailableError(err) {
			return collabStatusResponse{}, err
		}
		if _, _, err := startDaemonBackground(target); err == nil {
			if resp, err := deephDaemonCollabStatus(target, req); err == nil {
				return resp, nil
			} else if !isDaemonUnavailableError(err) {
				return collabStatusResponse{}, err
			}
		}
		collabWarnFallbackOnce(target, "status")
	}
	return executeDaemonCollabStatus(context.Background(), req)
}

func collabTurnWithFallback(req collabTurnRequest, useDaemon bool, target string) (collabTurnResponse, error) {
	if useDaemon {
		if resp, err := deephDaemonCollabTurn(target, req); err == nil {
			return resp, nil
		} else if !isDaemonUnavailableError(err) {
			return collabTurnResponse{}, err
		}
		if _, _, err := startDaemonBackground(target); err == nil {
			if resp, err := deephDaemonCollabTurn(target, req); err == nil {
				return resp, nil
			} else if !isDaemonUnavailableError(err) {
				return collabTurnResponse{}, err
			}
		}
		collabWarnFallbackOnce(target, "turn")
	}
	return executeDaemonCollabTurn(context.Background(), req)
}

func collabCloseWithFallback(req collabCloseRequest, useDaemon bool, target string) (collabCloseResponse, error) {
	if useDaemon {
		if resp, err := deephDaemonCollabClose(target, req); err == nil {
			return resp, nil
		} else if !isDaemonUnavailableError(err) {
			return collabCloseResponse{}, err
		}
		if _, _, err := startDaemonBackground(target); err == nil {
			if resp, err := deephDaemonCollabClose(target, req); err == nil {
				return resp, nil
			} else if !isDaemonUnavailableError(err) {
				return collabCloseResponse{}, err
			}
		}
		collabWarnFallbackOnce(target, "close")
	}
	return executeDaemonCollabClose(context.Background(), req)
}

func collabWarnFallbackOnce(target, operation string) {
	if strings.TrimSpace(os.Getenv("DEEPH_COLLAB_SILENT_FALLBACK")) != "" {
		return
	}
	key := strings.TrimSpace(target)
	if key == "" {
		key = deephDaemonDefaultTarget()
	}
	collabFallbackWarnings.mu.Lock()
	if _, ok := collabFallbackWarnings.seen[key]; ok {
		collabFallbackWarnings.mu.Unlock()
		return
	}
	collabFallbackWarnings.seen[key] = struct{}{}
	collabFallbackWarnings.mu.Unlock()
	fmt.Fprintf(os.Stderr, "info: deephd unavailable at %s; using local collaborative mode (%s)\n", key, operation)
}

func executeDaemonCollabStart(_ context.Context, req collabStartRequest) (collabStartResponse, error) {
	normalized, err := normalizeCollabStartRequest(req)
	if err != nil {
		return collabStartResponse{}, err
	}
	if _, abs, verr, err := loadAndValidate(normalized.Workspace); err != nil {
		return collabStartResponse{}, err
	} else if verr != nil && verr.HasErrors() {
		return collabStartResponse{}, verr
	} else {
		normalized.Workspace = abs
	}

	session, created, err := collabLoadOrCreateSession(normalized)
	if err != nil {
		return collabStartResponse{}, err
	}
	session.mu.Lock()
	defer session.mu.Unlock()
	return collabStartResponse{
		Created: created,
		Session: collabSnapshotFromState(session.state, ""),
	}, nil
}

func executeDaemonCollabStatus(_ context.Context, req collabStatusRequest) (collabStatusResponse, error) {
	workspace := strings.TrimSpace(req.Workspace)
	if workspace == "" {
		workspace = "."
	}
	abs, err := filepath.Abs(workspace)
	if err != nil {
		abs = workspace
	}
	sessionID := strings.TrimSpace(req.SessionID)
	if sessionID == "" {
		return collabStatusResponse{}, errors.New("collab status requires session id")
	}
	session, err := collabLoadSession(abs, sessionID)
	if err != nil {
		return collabStatusResponse{}, err
	}
	lane := strings.ToLower(strings.TrimSpace(req.Lane))
	session.mu.Lock()
	defer session.mu.Unlock()
	return collabStatusResponse{
		Session: collabSnapshotFromState(session.state, lane),
	}, nil
}

func executeDaemonCollabTurn(ctx context.Context, req collabTurnRequest) (collabTurnResponse, error) {
	workspace := strings.TrimSpace(req.Workspace)
	if workspace == "" {
		workspace = "."
	}
	if strings.TrimSpace(req.SessionID) == "" {
		return collabTurnResponse{}, errors.New("collab turn requires session id")
	}
	if strings.TrimSpace(req.Lane) == "" {
		return collabTurnResponse{}, errors.New("collab turn requires lane")
	}
	inputText := strings.TrimSpace(req.Text)
	if inputText == "" {
		return collabTurnResponse{}, errors.New("collab turn requires text")
	}
	p, abs, verr, err := loadAndValidate(workspace)
	if err != nil {
		return collabTurnResponse{}, err
	}
	if verr != nil && verr.HasErrors() {
		return collabTurnResponse{}, verr
	}
	session, err := collabLoadSession(abs, req.SessionID)
	if err != nil {
		return collabTurnResponse{}, err
	}

	laneName := strings.ToLower(strings.TrimSpace(req.Lane))
	session.mu.Lock()
	defer session.mu.Unlock()

	lane, ok := collabFindLane(session.state, laneName)
	if !ok {
		return collabTurnResponse{}, fmt.Errorf("unknown lane %q", req.Lane)
	}
	laneInbox := append([]collabInboxItem{}, session.state.Inbox[laneName]...)
	engine, err := runtime.New(abs, p)
	if err != nil {
		return collabTurnResponse{}, err
	}
	compiledInput := buildCollabTurnInput(session.state, lane, laneInbox, inputText)
	report, runErr := engine.RunSpec(ctx, lane.Agent, compiledInput)
	reply := collabReplyFromReport(report)
	turnErr := ""
	if runErr != nil {
		turnErr = runErr.Error()
	}

	seq := session.state.NextSeq
	if seq <= 0 {
		seq = len(session.state.Turns) + 1
	}
	session.state.NextSeq = seq + 1
	turn := collabTurnRecord{
		Seq:       seq,
		Lane:      laneName,
		Agent:     lane.Agent,
		Input:     clipLine(inputText, 500),
		Reply:     clipLine(reply, 2000),
		Error:     turnErr,
		CreatedAt: time.Now(),
	}
	session.state.Turns = append(session.state.Turns, turn)
	if runErr == nil {
		// Once the lane has used its inbox for this turn, clear it.
		session.state.Inbox[laneName] = nil
	}

	published := make([]collabPublishedHandoff, 0)
	if runErr == nil && strings.TrimSpace(reply) != "" {
		targets := collabTargetsForLane(session.state, laneName)
		now := time.Now()
		summary := clipLine(firstSentence(reply), 180)
		for i, target := range targets {
			aid := fmt.Sprintf("%s-a%04d-%d", session.state.ID, seq, i+1)
			artifact := collabArtifactRecord{
				ID:        aid,
				Seq:       seq,
				FromLane:  laneName,
				ToLane:    target.To,
				Kind:      target.Kind,
				Summary:   summary,
				Text:      clipLine(strings.TrimSpace(reply), 3000),
				CreatedAt: now,
			}
			session.state.Artifacts = append(session.state.Artifacts, artifact)
			session.state.Inbox[target.To] = append(session.state.Inbox[target.To], collabInboxItem{
				ArtifactID: aid,
				FromLane:   laneName,
				Kind:       target.Kind,
				Summary:    summary,
				CreatedAt:  now,
			})
			published = append(published, collabPublishedHandoff{
				ArtifactID: aid,
				To:         target.To,
				Kind:       target.Kind,
				Summary:    summary,
			})
		}
	}
	session.state.UpdatedAt = time.Now()
	if err := collabSaveState(session.state); err != nil {
		return collabTurnResponse{}, err
	}
	return collabTurnResponse{
		Reply:     reply,
		Error:     turnErr,
		Published: published,
		Session:   collabSnapshotFromState(session.state, laneName),
	}, nil
}

func executeDaemonCollabClose(_ context.Context, req collabCloseRequest) (collabCloseResponse, error) {
	workspace := strings.TrimSpace(req.Workspace)
	if workspace == "" {
		workspace = "."
	}
	abs, err := filepath.Abs(workspace)
	if err != nil {
		abs = workspace
	}
	sessionID := strings.TrimSpace(req.SessionID)
	if sessionID == "" {
		return collabCloseResponse{}, errors.New("collab close requires session id")
	}
	key := collabSessionKey(abs, sessionID)
	closed := false
	collabDaemonSessions.mu.Lock()
	if _, ok := collabDaemonSessions.sessions[key]; ok {
		delete(collabDaemonSessions.sessions, key)
		closed = true
	}
	collabDaemonSessions.mu.Unlock()
	if removed, err := collabDeleteState(abs, sessionID); err != nil {
		return collabCloseResponse{}, err
	} else if removed {
		closed = true
	}
	return collabCloseResponse{Closed: closed}, nil
}

func collabLoadOrCreateSession(req collabStartRequest) (*collabDaemonSession, bool, error) {
	key := collabSessionKey(req.Workspace, req.SessionID)
	collabDaemonSessions.mu.Lock()
	if existing := collabDaemonSessions.sessions[key]; existing != nil {
		collabDaemonSessions.mu.Unlock()
		return existing, false, nil
	}
	collabDaemonSessions.mu.Unlock()

	loaded, err := collabReadState(req.Workspace, req.SessionID)
	if err != nil && !os.IsNotExist(err) {
		return nil, false, err
	}
	created := false
	state := collabSessionState{}
	if loaded != nil {
		state = *loaded
	} else {
		created = true
		now := time.Now()
		state = collabSessionState{
			ID:        req.SessionID,
			Workspace: req.Workspace,
			Goal:      req.Goal,
			Spec:      req.Spec,
			Lanes:     append([]collabLaneSpec{}, req.Lanes...),
			Edges:     append([]collabEdgeSpec{}, req.Edges...),
			Inbox:     map[string][]collabInboxItem{},
			NextSeq:   1,
			CreatedAt: now,
			UpdatedAt: now,
		}
		for _, lane := range state.Lanes {
			state.Inbox[lane.Name] = nil
		}
		if err := collabSaveState(state); err != nil {
			return nil, false, err
		}
	}
	session := &collabDaemonSession{state: state}
	collabDaemonSessions.mu.Lock()
	if existing := collabDaemonSessions.sessions[key]; existing != nil {
		collabDaemonSessions.mu.Unlock()
		return existing, false, nil
	}
	collabDaemonSessions.sessions[key] = session
	collabDaemonSessions.mu.Unlock()
	return session, created, nil
}

func collabLoadSession(workspace, sessionID string) (*collabDaemonSession, error) {
	key := collabSessionKey(workspace, sessionID)
	collabDaemonSessions.mu.Lock()
	if existing := collabDaemonSessions.sessions[key]; existing != nil {
		collabDaemonSessions.mu.Unlock()
		return existing, nil
	}
	collabDaemonSessions.mu.Unlock()

	state, err := collabReadState(workspace, sessionID)
	if err != nil {
		return nil, err
	}
	if state == nil {
		return nil, os.ErrNotExist
	}
	session := &collabDaemonSession{state: *state}
	collabDaemonSessions.mu.Lock()
	if existing := collabDaemonSessions.sessions[key]; existing != nil {
		collabDaemonSessions.mu.Unlock()
		return existing, nil
	}
	collabDaemonSessions.sessions[key] = session
	collabDaemonSessions.mu.Unlock()
	return session, nil
}

func collabSessionKey(workspace, sessionID string) string {
	return strings.TrimSpace(filepath.Clean(workspace)) + "::" + strings.TrimSpace(strings.ToLower(sessionID))
}

func collabStatePath(workspace, sessionID string) string {
	return filepath.Join(chatSessionsDir(workspace), sessionID+collabStateSuffix)
}

func collabReadState(workspace, sessionID string) (*collabSessionState, error) {
	path := collabStatePath(workspace, sessionID)
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var state collabSessionState
	if err := json.Unmarshal(b, &state); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	if state.Inbox == nil {
		state.Inbox = map[string][]collabInboxItem{}
	}
	return &state, nil
}

func collabSaveState(state collabSessionState) error {
	if strings.TrimSpace(state.Workspace) == "" || strings.TrimSpace(state.ID) == "" {
		return errors.New("collab state requires workspace and id")
	}
	if err := os.MkdirAll(chatSessionsDir(state.Workspace), 0o755); err != nil {
		return err
	}
	path := collabStatePath(state.Workspace, state.ID)
	b, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, b, 0o644); err != nil {
		return err
	}
	return nil
}

func collabDeleteState(workspace, sessionID string) (bool, error) {
	path := collabStatePath(workspace, sessionID)
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func normalizeCollabStartRequest(req collabStartRequest) (collabStartRequest, error) {
	workspace := strings.TrimSpace(req.Workspace)
	if workspace == "" {
		workspace = "."
	}
	abs, err := filepath.Abs(workspace)
	if err != nil {
		abs = workspace
	}
	spec := strings.TrimSpace(req.Spec)
	if spec == "" {
		spec = "guide"
	}
	goal := strings.TrimSpace(req.Goal)
	if goal == "" {
		return collabStartRequest{}, errors.New("collab start requires goal")
	}
	sessionID := strings.TrimSpace(req.SessionID)
	if sessionID == "" {
		sessionID = "collab-" + generateChatSessionID(spec)
	}
	if !validSessionID(sessionID) {
		return collabStartRequest{}, fmt.Errorf("invalid collab session id %q", sessionID)
	}

	lanes := append([]collabLaneSpec{}, req.Lanes...)
	edges := append([]collabEdgeSpec{}, req.Edges...)
	if len(lanes) == 0 {
		var derr error
		lanes, edges, derr = deriveCollabLayoutFromSpec(spec)
		if derr != nil {
			return collabStartRequest{}, derr
		}
	} else {
		normalizedLanes := make([]collabLaneSpec, 0, len(lanes))
		seen := map[string]struct{}{}
		for _, lane := range lanes {
			name := strings.ToLower(strings.TrimSpace(lane.Name))
			agent := strings.TrimSpace(lane.Agent)
			if name == "" || agent == "" {
				continue
			}
			if strings.ContainsAny(name, " \t") {
				return collabStartRequest{}, fmt.Errorf("invalid lane name %q", lane.Name)
			}
			if _, ok := seen[name]; ok {
				continue
			}
			seen[name] = struct{}{}
			normalizedLanes = append(normalizedLanes, collabLaneSpec{Name: name, Agent: agent})
		}
		lanes = normalizedLanes
	}
	if len(lanes) == 0 {
		return collabStartRequest{}, errors.New("collab requires at least one lane")
	}
	if len(edges) == 0 {
		edges = deriveCollabLinearEdges(lanes)
	}
	allowed := map[string]struct{}{}
	for _, lane := range lanes {
		allowed[lane.Name] = struct{}{}
	}
	normalizedEdges := make([]collabEdgeSpec, 0, len(edges))
	seenEdge := map[string]struct{}{}
	for _, edge := range edges {
		from := strings.ToLower(strings.TrimSpace(edge.From))
		to := strings.ToLower(strings.TrimSpace(edge.To))
		if from == "" || to == "" || from == to {
			continue
		}
		if _, ok := allowed[from]; !ok {
			continue
		}
		if _, ok := allowed[to]; !ok {
			continue
		}
		kind := strings.TrimSpace(edge.Kind)
		if kind == "" {
			kind = collabDefaultKind
		}
		key := from + "->" + to + "#" + kind
		if _, ok := seenEdge[key]; ok {
			continue
		}
		seenEdge[key] = struct{}{}
		normalizedEdges = append(normalizedEdges, collabEdgeSpec{
			From: from,
			To:   to,
			Kind: kind,
		})
	}
	return collabStartRequest{
		Workspace: abs,
		SessionID: sessionID,
		Goal:      goal,
		Spec:      spec,
		Lanes:     lanes,
		Edges:     normalizedEdges,
	}, nil
}

func deriveCollabLayoutFromSpec(spec string) ([]collabLaneSpec, []collabEdgeSpec, error) {
	graph, err := runtime.ParseAgentSpecGraph(spec)
	if err != nil {
		return nil, nil, err
	}
	lanes := make([]collabLaneSpec, 0, len(graph.Flatten()))
	for _, agent := range graph.Flatten() {
		name := strings.ToLower(strings.TrimSpace(agent))
		if name == "" {
			continue
		}
		lanes = append(lanes, collabLaneSpec{Name: name, Agent: agent})
	}
	edges := make([]collabEdgeSpec, 0)
	for i := 0; i+1 < len(graph.Stages); i++ {
		fromStage := graph.Stages[i]
		toStage := graph.Stages[i+1]
		for _, from := range fromStage {
			for _, to := range toStage {
				edges = append(edges, collabEdgeSpec{
					From: strings.ToLower(strings.TrimSpace(from)),
					To:   strings.ToLower(strings.TrimSpace(to)),
					Kind: collabDefaultKind,
				})
			}
		}
	}
	return lanes, edges, nil
}

func deriveCollabLinearEdges(lanes []collabLaneSpec) []collabEdgeSpec {
	if len(lanes) < 2 {
		return nil
	}
	out := make([]collabEdgeSpec, 0, len(lanes)-1)
	for i := 0; i+1 < len(lanes); i++ {
		out = append(out, collabEdgeSpec{
			From: lanes[i].Name,
			To:   lanes[i+1].Name,
			Kind: collabDefaultKind,
		})
	}
	return out
}

func collabFindLane(state collabSessionState, lane string) (collabLaneSpec, bool) {
	lane = strings.ToLower(strings.TrimSpace(lane))
	for _, item := range state.Lanes {
		if strings.EqualFold(item.Name, lane) {
			return item, true
		}
	}
	return collabLaneSpec{}, false
}

func collabTargetsForLane(state collabSessionState, lane string) []collabEdgeSpec {
	lane = strings.ToLower(strings.TrimSpace(lane))
	out := make([]collabEdgeSpec, 0, len(state.Edges))
	for _, edge := range state.Edges {
		if strings.EqualFold(strings.TrimSpace(edge.From), lane) {
			out = append(out, edge)
		}
	}
	if len(out) > 0 {
		return out
	}
	for _, candidate := range state.Lanes {
		if strings.EqualFold(candidate.Name, lane) {
			continue
		}
		out = append(out, collabEdgeSpec{
			From: lane,
			To:   candidate.Name,
			Kind: collabDefaultKind,
		})
	}
	return out
}

func collabReplyFromReport(report runtime.ExecutionReport) string {
	if len(report.Results) == 0 {
		return ""
	}
	for i := len(report.Results) - 1; i >= 0; i-- {
		item := report.Results[i]
		if strings.TrimSpace(item.Output) != "" {
			return strings.TrimSpace(item.Output)
		}
	}
	last := report.Results[len(report.Results)-1]
	if strings.TrimSpace(last.Error) != "" {
		return "error: " + strings.TrimSpace(last.Error)
	}
	return ""
}

func buildCollabTurnInput(state collabSessionState, lane collabLaneSpec, inbox []collabInboxItem, userText string) string {
	lines := []string{
		"[collab_session]",
		"session: " + state.ID,
		"lane: " + lane.Name,
		"agent: " + lane.Agent,
		"workflow: " + state.Spec,
		"",
		"[goal]",
		state.Goal,
	}
	if len(inbox) > 0 {
		lines = append(lines, "", "[lane_inbox]")
		for _, item := range inbox {
			lines = append(lines, fmt.Sprintf("- from=%s kind=%s summary=%s", item.FromLane, item.Kind, item.Summary))
		}
	}
	lines = append(lines, "", "[user]", strings.TrimSpace(userText))
	return strings.Join(lines, "\n")
}

func collabSnapshotFromState(state collabSessionState, lane string) collabSessionSnapshot {
	out := collabSessionSnapshot{
		ID:            state.ID,
		Workspace:     state.Workspace,
		Goal:          state.Goal,
		Spec:          state.Spec,
		CreatedAt:     state.CreatedAt,
		UpdatedAt:     state.UpdatedAt,
		TurnCount:     len(state.Turns),
		ArtifactCount: len(state.Artifacts),
		Edges:         append([]collabEdgeSpec{}, state.Edges...),
	}
	out.Lanes = make([]collabLaneSnapshot, 0, len(state.Lanes))
	for _, laneCfg := range state.Lanes {
		out.Lanes = append(out.Lanes, collabLaneSnapshot{
			Name:  laneCfg.Name,
			Agent: laneCfg.Agent,
			Inbox: len(state.Inbox[laneCfg.Name]),
		})
	}
	sort.Slice(out.Lanes, func(i, j int) bool { return out.Lanes[i].Name < out.Lanes[j].Name })
	if len(state.Turns) > 0 {
		start := len(state.Turns) - 5
		if start < 0 {
			start = 0
		}
		out.RecentTurns = append([]collabTurnRecord{}, state.Turns[start:]...)
	}
	lane = strings.ToLower(strings.TrimSpace(lane))
	if lane != "" {
		out.LaneInbox = append([]collabInboxItem{}, state.Inbox[lane]...)
	}
	return out
}

func collabSuggestedLane(snapshot collabSessionSnapshot, preferred string) (string, bool) {
	preferred = strings.ToLower(strings.TrimSpace(preferred))
	if preferred != "" {
		for _, lane := range snapshot.Lanes {
			if strings.EqualFold(strings.TrimSpace(lane.Name), preferred) {
				return lane.Name, true
			}
		}
	}
	if len(snapshot.Lanes) == 0 {
		return "", false
	}
	bestLane := snapshot.Lanes[0].Name
	bestInbox := snapshot.Lanes[0].Inbox
	for _, lane := range snapshot.Lanes[1:] {
		if lane.Inbox > bestInbox {
			bestLane = lane.Name
			bestInbox = lane.Inbox
		}
	}
	if bestInbox > 0 {
		return bestLane, true
	}
	return snapshot.Lanes[0].Name, true
}

func parseCollabLanesCSV(raw string) ([]collabLaneSpec, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	parts := splitCSVLike(raw)
	out := make([]collabLaneSpec, 0, len(parts))
	for _, part := range parts {
		token := strings.TrimSpace(part)
		if token == "" {
			continue
		}
		lane := token
		agent := token
		if strings.Contains(token, ":") {
			pair := strings.SplitN(token, ":", 2)
			lane = strings.TrimSpace(pair[0])
			agent = strings.TrimSpace(pair[1])
		}
		lane = strings.ToLower(strings.TrimSpace(lane))
		if lane == "" || strings.TrimSpace(agent) == "" {
			return nil, fmt.Errorf("invalid lane definition %q", token)
		}
		out = append(out, collabLaneSpec{
			Name:  lane,
			Agent: strings.TrimSpace(agent),
		})
	}
	return out, nil
}

func parseCollabEdgesCSV(raw string) ([]collabEdgeSpec, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	parts := splitCSVLike(raw)
	out := make([]collabEdgeSpec, 0, len(parts))
	for _, part := range parts {
		token := strings.TrimSpace(part)
		if token == "" {
			continue
		}
		kind := collabDefaultKind
		if strings.Contains(token, "#") {
			sides := strings.SplitN(token, "#", 2)
			token = strings.TrimSpace(sides[0])
			kind = strings.TrimSpace(sides[1])
		}
		if kind == "" {
			kind = collabDefaultKind
		}
		sides := strings.Split(token, ">")
		if len(sides) != 2 {
			return nil, fmt.Errorf("invalid edge %q (expected from>to)", token)
		}
		from := strings.ToLower(strings.TrimSpace(sides[0]))
		to := strings.ToLower(strings.TrimSpace(sides[1]))
		if from == "" || to == "" {
			return nil, fmt.Errorf("invalid edge %q", token)
		}
		out = append(out, collabEdgeSpec{
			From: from,
			To:   to,
			Kind: kind,
		})
	}
	return out, nil
}

func printCollabSessionSnapshot(s collabSessionSnapshot) {
	fmt.Printf("collab session: %s\n", s.ID)
	fmt.Printf("workspace: %s\n", s.Workspace)
	fmt.Printf("goal: %s\n", s.Goal)
	fmt.Printf("workflow: %s\n", s.Spec)
	fmt.Printf("created_at: %s\n", s.CreatedAt.Format(time.RFC3339))
	fmt.Printf("updated_at: %s\n", s.UpdatedAt.Format(time.RFC3339))
	fmt.Printf("turns: %d\n", s.TurnCount)
	fmt.Printf("artifacts: %d\n", s.ArtifactCount)
	if len(s.Lanes) > 0 {
		fmt.Println("lanes:")
		for _, lane := range s.Lanes {
			fmt.Printf("  - %s agent=%s inbox=%d\n", lane.Name, lane.Agent, lane.Inbox)
		}
	}
	if len(s.Edges) > 0 {
		fmt.Println("edges:")
		for _, edge := range s.Edges {
			fmt.Printf("  - %s -> %s (%s)\n", edge.From, edge.To, edge.Kind)
		}
	}
	if len(s.LaneInbox) > 0 {
		fmt.Println("lane inbox:")
		for _, item := range s.LaneInbox {
			fmt.Printf("  - from=%s kind=%s summary=%s\n", item.FromLane, item.Kind, item.Summary)
		}
	}
	if len(s.RecentTurns) > 0 {
		fmt.Println("recent turns:")
		for _, turn := range s.RecentTurns {
			suffix := ""
			if strings.TrimSpace(turn.Error) != "" {
				suffix = " error=" + clipLine(turn.Error, 120)
			}
			fmt.Printf("  - #%d lane=%s input=%q%s\n", turn.Seq, turn.Lane, clipLine(turn.Input, 100), suffix)
		}
	}
}
