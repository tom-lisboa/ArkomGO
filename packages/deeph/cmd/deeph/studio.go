package main

import (
	"bufio"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"deeph/internal/reviewscope"
)

func cmdStudio(args []string) error {
	fs := flag.NewFlagSet("studio", flag.ContinueOnError)
	workspace := fs.String("workspace", ".", "default workspace path")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if len(fs.Args()) != 0 {
		return errors.New("studio does not accept positional arguments")
	}

	abs, err := filepath.Abs(*workspace)
	if err != nil {
		return err
	}
	state := loadStudioState()
	currentWorkspace := resolveInitialStudioWorkspace(abs, hasExplicitWorkspaceArg(args), state)
	reader := bufio.NewReader(os.Stdin)
	currentWorkspace, exitNow, err := maybeRunStudioLauncher(reader, state, currentWorkspace)
	if err != nil {
		return err
	}
	if exitNow {
		fmt.Println("Bye.")
		return nil
	}

	for {
		printStudioScreen(currentWorkspace, state)
		choice, err := promptLine(reader, "Select option", "")
		if err != nil {
			return err
		}
		choice = strings.ToLower(strings.TrimSpace(choice))

		var runErr error
		switch choice {
		case "1", "r", "resume":
			currentWorkspace, runErr = studioQuickResume(reader, state, currentWorkspace)
		case "2":
			currentWorkspace, runErr = studioQuickstart(reader, state, currentWorkspace, true)
		case "3":
			currentWorkspace, runErr = studioQuickstart(reader, state, currentWorkspace, false)
		case "4":
			currentWorkspace, runErr = studioProviderAdd(reader, currentWorkspace)
		case "5":
			currentWorkspace, runErr = studioAgentCreate(reader, state, currentWorkspace)
		case "6":
			currentWorkspace, runErr = studioValidate(reader, currentWorkspace)
		case "7":
			currentWorkspace, runErr = studioReview(reader, currentWorkspace)
		case "8":
			currentWorkspace, runErr = studioRun(reader, state, currentWorkspace)
		case "9":
			currentWorkspace, runErr = studioChat(reader, state, currentWorkspace)
		case "10":
			currentWorkspace, runErr = studioCollaborative(reader, state, currentWorkspace)
		case "11":
			currentWorkspace, runErr = studioSwitchWorkspace(reader, state, currentWorkspace)
		case "12":
			printStudioDoctor(currentWorkspace)
		case "13":
			runErr = studioCommandList(reader)
		case "14":
			runErr = studioUpdate(reader)
		case "15":
			currentWorkspace, runErr = studioCalculatorStarter(reader, state, currentWorkspace)
		case "16":
			printUsage()
		case "doctor":
			printStudioDoctor(currentWorkspace)
		case "review":
			currentWorkspace, runErr = studioReview(reader, currentWorkspace)
		case "chat":
			currentWorkspace, runErr = studioChat(reader, state, currentWorkspace)
		case "run":
			currentWorkspace, runErr = studioRun(reader, state, currentWorkspace)
		case "collab", "collaborative", "colaborativo":
			currentWorkspace, runErr = studioCollaborative(reader, state, currentWorkspace)
		case "switch", "workspace":
			currentWorkspace, runErr = studioSwitchWorkspace(reader, state, currentWorkspace)
		case "update":
			runErr = studioUpdate(reader)
		case "commands", "command":
			runErr = studioCommandList(reader)
		case "calc", "calculator":
			currentWorkspace, runErr = studioCalculatorStarter(reader, state, currentWorkspace)
		case "help":
			printUsage()
		case "0", "q", "quit", "exit":
			fmt.Println("Bye.")
			return nil
		default:
			runErr = fmt.Errorf("unknown option %q", choice)
		}

		if workspaceInitialized(currentWorkspace) {
			state.LastWorkspace = currentWorkspace
			if err := saveStudioState(state); err != nil {
				fmt.Printf("warning: failed to save studio state: %v\n", err)
			}
		}
		if runErr != nil {
			fmt.Printf("error: %v\n", runErr)
		}
		if err := waitEnter(reader); err != nil {
			return err
		}
	}
}

func printStudioScreen(workspace string, state *studioState) {
	status := collectStudioStatus(workspace)
	resume := buildStudioQuickResumePlan(status, state)
	fmt.Print("\033[2J\033[H")
	printStudioTitle()

	chips := []string{}
	if !status.Initialized {
		chips = append(chips, uiBadge("setup-needed", "warn"))
	} else if strings.TrimSpace(status.LoadError) != "" {
		chips = append(chips, uiBadge("load-error", "error"))
	} else {
		chips = append(chips, uiBadge("ready", "success"))
	}
	providerName := strings.TrimSpace(status.DefaultProvider)
	if providerName == "" {
		providerName = "none"
	}
	chips = append(chips, uiBadge("provider:"+providerName, "accent"))
	chips = append(chips, uiBadge(fmt.Sprintf("agents:%d", status.Agents), "muted"))
	chips = append(chips, uiBadge(fmt.Sprintf("sessions:%d", status.Sessions), "muted"))
	fmt.Println(strings.Join(chips, "  "))
	fmt.Println("")

	fmt.Println(uiSectionTitle("Workspace"))
	fmt.Printf("%s %s\n", uiMuted("path:"), status.Workspace)
	if status.LatestSession != "" {
		fmt.Printf("%s %s (%s)\n", uiMuted("latest session:"), status.LatestSession, status.LatestAgentSpec)
	}
	fmt.Println("")

	fmt.Println(uiSectionTitle("Health"))
	if !status.Initialized {
		fmt.Printf("%s %s | binary in PATH: %s | sessions: %d\n", uiMuted("status:"), uiWarn("setup needed"), yesNo(status.BinaryDirOnPath), status.Sessions)
	} else if status.LoadError != "" {
		fmt.Printf("%s %s | binary in PATH: %s\n", uiMuted("status:"), uiErrorText("load error"), yesNo(status.BinaryDirOnPath))
	} else {
		keyStatus := "n/a"
		providerLabel := status.DefaultProvider
		if strings.TrimSpace(providerLabel) == "" {
			providerLabel = "(none)"
		}
		if status.APIKeyEnv != "" {
			keyStatus = status.APIKeyEnv + "=" + yesNo(status.APIKeySet)
		}
		fmt.Printf("%s %s | provider: %s | key: %s\n", uiMuted("status:"), uiSuccess("ready"), providerLabel, keyStatus)
		fmt.Printf("%s %d | %s %d | %s %d | %s %d\n", uiMuted("agents:"), status.Agents, uiMuted("skills:"), status.Skills, uiMuted("sessions:"), status.Sessions, uiMuted("validation:"), status.ValidationIssues)
	}
	fmt.Println("")
	fmt.Println(uiSectionTitle("Quick Resume"))
	fmt.Println(formatStudioOption("1", "Quick Resume (recommended)"))
	if resume.Available {
		fmt.Printf("%s %s\n", uiMuted("next:"), resume.Detail)
	} else {
		fmt.Printf("%s %s\n", uiMuted("next:"), resume.Reason)
	}
	fmt.Printf("%s %s\n", uiMuted("recommended:"), studioRecommendedAction(status, resume))
	fmt.Println("")
	fmt.Println(uiSectionTitle("Bootstrap"))
	fmt.Println(formatStudioOption("2", "Quickstart (DeepSeek)"))
	fmt.Println(formatStudioOption("3", "Quickstart (local mock)"))
	fmt.Println("")
	fmt.Println(uiSectionTitle("Configure"))
	fmt.Println(formatStudioOption("4", "Provider add (DeepSeek)"))
	fmt.Println(formatStudioOption("5", "Agent create"))
	fmt.Println(formatStudioOption("6", "Validate workspace"))
	fmt.Println("")
	fmt.Println(uiSectionTitle("Review"))
	fmt.Println(formatStudioOption("7", "Review current changes"))
	fmt.Println("")
	fmt.Println(uiSectionTitle("Run"))
	fmt.Println(formatStudioOption("8", "Run once"))
	fmt.Println(formatStudioOption("9", "Chat"))
	fmt.Println(formatStudioOption("10", "Collaborative mode (1-click)"))
	fmt.Println(formatStudioOption("11", "Switch workspace"))
	fmt.Println("")
	fmt.Println(uiSectionTitle("Tools"))
	fmt.Println(formatStudioOption("12", "Studio doctor"))
	fmt.Println(formatStudioOption("13", "Command dictionary"))
	fmt.Println(formatStudioOption("14", "Update deeph"))
	fmt.Println(formatStudioOption("15", "Calculator workspace"))
	fmt.Println(formatStudioOption("16", "Help"))
	fmt.Println(formatStudioOption("0", "Exit"))
	fmt.Println("")
	fmt.Println(uiSectionTitle("Tips"))
	fmt.Printf("%s %s\n", uiMuted("-"), "Use option 1 to jump back into the last chat, or option 7 to review the current diff.")
	fmt.Printf("%s %s\n", uiMuted("-"), "Option 10 starts collaborative mode instantly with your last defaults.")
	fmt.Printf("%s %s\n", uiMuted("-"), "Keep providers and agents clean with option 6 before larger runs.")
	fmt.Printf("%s %s\n", uiMuted("-"), "From chat, type `deeph <command>` directly for operational actions.")
	fmt.Println("")
}

type studioQuickResumePlan struct {
	Workspace string
	Spec      string
	SessionID string
	Detail    string
	Reason    string
	Available bool
}

func buildStudioQuickResumePlan(status studioStatus, state *studioState) studioQuickResumePlan {
	plan := studioQuickResumePlan{Workspace: status.Workspace}
	if !status.Initialized {
		plan.Reason = "Workspace is not initialized yet."
		return plan
	}
	if strings.TrimSpace(status.LoadError) != "" {
		plan.Reason = "Workspace has a load error. Run Studio doctor."
		return plan
	}
	sameWorkspace := state != nil && samePath(strings.TrimSpace(state.LastWorkspace), status.Workspace)
	spec := strings.TrimSpace(status.LatestAgentSpec)
	if spec == "" && sameWorkspace {
		spec = strings.TrimSpace(state.LastAgentSpec)
	}
	if spec == "" {
		spec = "guide"
	}
	sessionID := strings.TrimSpace(status.LatestSession)
	if sessionID == "" && sameWorkspace {
		sessionID = strings.TrimSpace(state.LastSessionID)
	}
	plan.Spec = spec
	plan.SessionID = sessionID
	plan.Available = true
	if sessionID != "" {
		plan.Detail = fmt.Sprintf("Resume chat `%s` with `%s`.", sessionID, spec)
		return plan
	}
	plan.Detail = fmt.Sprintf("Start chat with `%s` in `%s`.", spec, filepath.Base(status.Workspace))
	return plan
}

func studioRecommendedAction(status studioStatus, resume studioQuickResumePlan) string {
	switch {
	case !status.Initialized:
		return "Create a DeepSeek workspace."
	case strings.TrimSpace(status.LoadError) != "":
		return "Run Studio doctor."
	case status.DefaultProvider == "":
		return "Add a provider."
	case status.APIKeyEnv != "" && !status.APIKeySet:
		return "Set " + status.APIKeyEnv + " in this shell."
	case status.ValidationErrors > 0:
		return "Validate and fix workspace errors."
	case resume.Available:
		return resume.Detail
	case status.Sessions == 0:
		return "Start the first chat."
	default:
		return "Review current changes."
	}
}

func studioQuickResume(reader *bufio.Reader, state *studioState, defaultWorkspace string) (string, error) {
	ws := defaultWorkspace
	var err error
	if !workspaceInitialized(ws) {
		ws, err = promptWorkspace(reader, defaultWorkspace)
		if err != nil {
			return defaultWorkspace, err
		}
	}
	if err := requireInitializedWorkspace(ws); err != nil {
		return defaultWorkspace, err
	}
	plan := buildStudioQuickResumePlan(collectStudioStatus(ws), state)
	if !plan.Available {
		return ws, errors.New(plan.Reason)
	}
	args := []string{"--workspace", ws}
	if strings.TrimSpace(plan.SessionID) != "" {
		args = append(args, "--session", plan.SessionID)
	}
	args = append(args, plan.Spec)
	printStudioCommandPreview(append([]string{"chat"}, args...)...)
	if err := cmdChat(args); err != nil {
		return ws, err
	}
	if state != nil {
		state.LastAgentSpec = plan.Spec
		if strings.TrimSpace(plan.SessionID) != "" {
			state.LastSessionID = plan.SessionID
		}
	}
	return ws, nil
}

func studioQuickstart(reader *bufio.Reader, state *studioState, defaultWorkspace string, deepseek bool) (string, error) {
	ws, err := promptWorkspace(reader, defaultWorkspace)
	if err != nil {
		return defaultWorkspace, err
	}
	agentDefault := "guide"
	if strings.TrimSpace(state.LastAgentSpec) != "" {
		agentDefault = state.LastAgentSpec
	}
	agent, err := promptLine(reader, "Starter agent", agentDefault)
	if err != nil {
		return ws, err
	}
	args := []string{"--workspace", ws, "--agent", agent}
	if deepseek {
		args = append(args, "--deepseek")
	} else {
		args = append(args, "--provider", "local_mock", "--model", "mock-small")
	}
	printStudioCommandPreview(append([]string{"quickstart"}, args...)...)
	if err := cmdQuickstart(args); err != nil {
		return ws, err
	}
	state.LastAgentSpec = agent
	return ws, nil
}

func studioProviderAdd(reader *bufio.Reader, defaultWorkspace string) (string, error) {
	ws, err := promptWorkspace(reader, defaultWorkspace)
	if err != nil {
		return defaultWorkspace, err
	}
	if err := requireInitializedWorkspace(ws); err != nil {
		return defaultWorkspace, err
	}
	name, err := promptLine(reader, "Provider name", "deepseek")
	if err != nil {
		return ws, err
	}
	model, err := promptLine(reader, "Model", "deepseek-chat")
	if err != nil {
		return ws, err
	}
	args := []string{
		"--workspace", ws,
		"--name", name,
		"--model", model,
		"--set-default",
		"deepseek",
	}
	printStudioCommandPreview(append([]string{"provider", "add"}, args...)...)
	return ws, cmdProviderAdd(args)
}

func studioAgentCreate(reader *bufio.Reader, state *studioState, defaultWorkspace string) (string, error) {
	ws, err := promptWorkspace(reader, defaultWorkspace)
	if err != nil {
		return defaultWorkspace, err
	}
	if err := requireInitializedWorkspace(ws); err != nil {
		return defaultWorkspace, err
	}
	nameDefault := "planner"
	if strings.TrimSpace(state.LastAgentSpec) != "" {
		nameDefault = state.LastAgentSpec
	}
	name, err := promptLine(reader, "Agent name", nameDefault)
	if err != nil {
		return ws, err
	}
	provider, err := promptLine(reader, "Provider (optional)", "")
	if err != nil {
		return ws, err
	}
	model, err := promptLine(reader, "Model", "deepseek-chat")
	if err != nil {
		return ws, err
	}
	args := []string{"--workspace", ws}
	if strings.TrimSpace(provider) != "" {
		args = append(args, "--provider", provider)
	}
	if strings.TrimSpace(model) != "" {
		args = append(args, "--model", model)
	}
	args = append(args, name)
	printStudioCommandPreview(append([]string{"agent", "create"}, args...)...)
	if err := cmdAgentCreate(args); err != nil {
		return ws, err
	}
	state.LastAgentSpec = name
	return ws, nil
}

func studioValidate(reader *bufio.Reader, defaultWorkspace string) (string, error) {
	ws, err := promptWorkspace(reader, defaultWorkspace)
	if err != nil {
		return defaultWorkspace, err
	}
	if err := requireInitializedWorkspace(ws); err != nil {
		return defaultWorkspace, err
	}
	args := []string{"--workspace", ws}
	printStudioCommandPreview(append([]string{"validate"}, args...)...)
	return ws, cmdValidate(args)
}

func studioRun(reader *bufio.Reader, state *studioState, defaultWorkspace string) (string, error) {
	ws, err := promptWorkspace(reader, defaultWorkspace)
	if err != nil {
		return defaultWorkspace, err
	}
	if err := requireInitializedWorkspace(ws); err != nil {
		return defaultWorkspace, err
	}
	specDefault := "guide"
	if strings.TrimSpace(state.LastAgentSpec) != "" {
		specDefault = state.LastAgentSpec
	}
	wsStatus := collectStudioStatus(ws)
	if strings.TrimSpace(wsStatus.LatestAgentSpec) != "" {
		specDefault = wsStatus.LatestAgentSpec
	}
	spec, err := promptAgentSpec(reader, ws, "Agent spec", specDefault)
	if err != nil {
		return ws, err
	}
	input, err := promptLine(reader, "Input", "hello")
	if err != nil {
		return ws, err
	}
	args := []string{"--workspace", ws, spec}
	if strings.TrimSpace(input) != "" {
		args = append(args, input)
	}
	printStudioCommandPreview(append([]string{"run"}, args...)...)
	if err := cmdRun(args); err != nil {
		return ws, err
	}
	state.LastAgentSpec = spec
	return ws, nil
}

func studioChat(reader *bufio.Reader, state *studioState, defaultWorkspace string) (string, error) {
	ws, err := promptWorkspace(reader, defaultWorkspace)
	if err != nil {
		return defaultWorkspace, err
	}
	if err := requireInitializedWorkspace(ws); err != nil {
		return defaultWorkspace, err
	}
	specDefault := "guide"
	if strings.TrimSpace(state.LastAgentSpec) != "" {
		specDefault = state.LastAgentSpec
	}
	wsStatus := collectStudioStatus(ws)
	if strings.TrimSpace(wsStatus.LatestAgentSpec) != "" {
		specDefault = wsStatus.LatestAgentSpec
	}
	spec, err := promptAgentSpec(reader, ws, "Agent spec", specDefault)
	if err != nil {
		return ws, err
	}
	sessionDefault := wsStatus.LatestSession
	if strings.TrimSpace(sessionDefault) == "" {
		sessionDefault = state.LastSessionID
	}
	sessionID, err := promptSessionID(reader, ws, "Session id (optional)", sessionDefault)
	if err != nil {
		return ws, err
	}
	args := []string{"--workspace", ws}
	if strings.TrimSpace(sessionID) != "" {
		args = append(args, "--session", sessionID)
	}
	args = append(args, spec)
	printStudioCommandPreview(append([]string{"chat"}, args...)...)
	if err := cmdChat(args); err != nil {
		return ws, err
	}
	state.LastAgentSpec = spec
	if strings.TrimSpace(sessionID) != "" {
		state.LastSessionID = sessionID
	}
	return ws, nil
}

type studioCollaborativePreset string

const (
	studioCollaborativePresetBuild  studioCollaborativePreset = "build_feature"
	studioCollaborativePresetDebug  studioCollaborativePreset = "debug_issue"
	studioCollaborativePresetReview studioCollaborativePreset = "review_changes"
)

type studioCollaborativeDepth string

const (
	studioCollaborativeDepthQuick    studioCollaborativeDepth = "quick"
	studioCollaborativeDepthComplete studioCollaborativeDepth = "complete"
	studioCollaborativeDepthDeep     studioCollaborativeDepth = "deep"
)

const (
	studioCollaborativeDefaultGoal  = "implement feature safely and review before shipping"
	studioCollaborativeContinueText = "Continue from inbox and produce only the next concrete handoff."
	studioCollaborativeKickoffText  = "Start the next collaborative step for the goal and produce one concrete handoff."
	studioCollaborativeAutoRunMax   = 12
)

type studioCollaborativeStage struct {
	Roles  []string
	Agents []string
}

type studioCollaborativeLane struct {
	Name  string
	Role  string
	Agent string
}

type studioCollaborativePlan struct {
	Workspace string
	Goal      string
	Preset    studioCollaborativePreset
	Depth     studioCollaborativeDepth
	SessionID string
	Spec      string
	Stages    []studioCollaborativeStage
	Lanes     []studioCollaborativeLane
	Edges     []collabEdgeSpec
	FocusLane string
}

func studioCollaborative(reader *bufio.Reader, state *studioState, defaultWorkspace string) (string, error) {
	ws := strings.TrimSpace(defaultWorkspace)
	if ws == "" {
		ws = "."
	}
	if abs, err := filepath.Abs(ws); err == nil {
		ws = abs
	}
	if err := requireInitializedWorkspace(ws); err != nil {
		selected, pickErr := promptWorkspace(reader, ws)
		if pickErr != nil {
			return defaultWorkspace, pickErr
		}
		if err := requireInitializedWorkspace(selected); err != nil {
			return defaultWorkspace, err
		}
		ws = selected
	}

	goal := strings.TrimSpace(state.LastCollabGoal)
	if goal == "" {
		goal = studioCollaborativeDefaultGoal
	}
	preset := normalizeStudioCollaborativePreset(state.LastCollabPreset)
	depth := normalizeStudioCollaborativeDepth(state.LastCollabDepth)

	plan := buildStudioCollaborativePlan(ws, goal, preset, depth)
	startResp, err := collabStartWithFallback(collabStartRequest{
		Workspace: plan.Workspace,
		SessionID: plan.SessionID,
		Goal:      plan.Goal,
		Spec:      plan.Spec,
		Lanes:     studioLanesToCollabLanes(plan.Lanes),
		Edges:     append([]collabEdgeSpec{}, plan.Edges...),
	}, false, deephDaemonDefaultTarget())
	if err != nil {
		return ws, err
	}
	plan.SessionID = startResp.Session.ID
	plan.Spec = startResp.Session.Spec
	preferredFocus := ""
	if len(plan.Lanes) > 0 {
		preferredFocus = plan.Lanes[0].Name
	}
	if focus, ok := studioCollaborativeSuggestedLane(startResp.Session, preferredFocus); ok {
		plan.FocusLane = focus
	}
	printStudioCollaborativePlan(plan)

	state.LastCollabGoal = goal
	state.LastCollabPreset = string(preset)
	state.LastCollabDepth = string(depth)
	state.LastCollabSessionID = plan.SessionID
	return studioCollaborativeHub(reader, state, plan)
}

func studioCollaborativeHub(reader *bufio.Reader, state *studioState, plan studioCollaborativePlan) (string, error) {
	if lane := strings.TrimSpace(strings.ToLower(plan.FocusLane)); lane != "" {
		plan.FocusLane = lane
	}
	if plan.FocusLane == "" && len(plan.Lanes) > 0 {
		plan.FocusLane = strings.ToLower(strings.TrimSpace(plan.Lanes[0].Name))
	}
	for {
		printStudioCollaborativeHub(plan)
		choice, err := promptLine(reader, "Action", "3")
		if err != nil {
			return plan.Workspace, err
		}
		switch strings.ToLower(strings.TrimSpace(choice)) {
		case "1", "chat":
			args := []string{"--workspace", plan.Workspace, "--session", plan.SessionID, "--lane", plan.FocusLane, "--daemon=false"}
			if err := cmdCollabChat(args); err != nil {
				return plan.Workspace, err
			}
			state.LastAgentSpec = plan.Spec
			state.LastSessionID = plan.SessionID
			state.LastCollabSessionID = plan.SessionID
		case "2", "run":
			lane := plan.FocusLane
			if lane == "" {
				lane, err = promptStudioCollaborativeLane(reader, plan)
				if err != nil {
					return plan.Workspace, err
				}
				plan.FocusLane = lane
			}
			defaultInput := plan.Goal
			if strings.TrimSpace(defaultInput) == "" {
				defaultInput = "Continue from your inbox and advance the goal."
			}
			input, err := promptLine(reader, "Message for "+lane, defaultInput)
			if err != nil {
				return plan.Workspace, err
			}
			resp, err := collabTurnWithFallback(collabTurnRequest{
				Workspace: plan.Workspace,
				SessionID: plan.SessionID,
				Lane:      lane,
				Text:      input,
			}, false, deephDaemonDefaultTarget())
			if err != nil {
				return plan.Workspace, err
			}
			if strings.TrimSpace(resp.Error) != "" {
				fmt.Printf("step manual | lane=%s | error=%s\n", lane, clipLine(resp.Error, 160))
				continue
			}
			plan.FocusLane = studioCollaborativeSelectNextLane(resp, plan.FocusLane)
			printStudioCollaborativeStepSummary("manual", lane, input, resp)
			state.LastAgentSpec = plan.Spec
			state.LastSessionID = plan.SessionID
			state.LastCollabSessionID = plan.SessionID
		case "3", "continue", "next":
			lane, input, resp, err := studioCollaborativeRunContinueStep(plan)
			if err != nil {
				return plan.Workspace, err
			}
			if strings.TrimSpace(resp.Error) != "" {
				fmt.Printf("step continue | lane=%s | error=%s\n", lane, clipLine(resp.Error, 160))
				continue
			}
			plan.FocusLane = studioCollaborativeSelectNextLane(resp, plan.FocusLane)
			printStudioCollaborativeStepSummary("continue", lane, input, resp)
			state.LastAgentSpec = plan.Spec
			state.LastSessionID = plan.SessionID
			state.LastCollabSessionID = plan.SessionID
		case "4", "status", "review":
			statusResp, err := collabStatusWithFallback(collabStatusRequest{
				Workspace: plan.Workspace,
				SessionID: plan.SessionID,
			}, false, deephDaemonDefaultTarget())
			if err != nil {
				return plan.Workspace, err
			}
			if focus, ok := studioCollaborativeSuggestedLane(statusResp.Session, plan.FocusLane); ok {
				plan.FocusLane = focus
			}
			printStudioCollaborativeStatus(statusResp.Session, plan.FocusLane)
			if err := waitEnter(reader); err != nil {
				return plan.Workspace, err
			}
		case "5", "switch":
			lane, err := promptStudioCollaborativeLane(reader, plan)
			if err != nil {
				return plan.Workspace, err
			}
			plan.FocusLane = lane
		case "6", "summary":
			printStudioCollaborativeSummary(plan)
			if err := waitEnter(reader); err != nil {
				return plan.Workspace, err
			}
		case "7", "auto", "autorun":
			if err := studioCollaborativeAutoRun(&plan); err != nil {
				return plan.Workspace, err
			}
			if err := waitEnter(reader); err != nil {
				return plan.Workspace, err
			}
		case "0", "q", "quit", "back":
			return plan.Workspace, nil
		default:
			fmt.Printf("error: unknown action %q\n", strings.TrimSpace(choice))
			if err := waitEnter(reader); err != nil {
				return plan.Workspace, err
			}
		}
	}
}

func promptStudioCollaborativePreset(reader *bufio.Reader, def studioCollaborativePreset) (studioCollaborativePreset, error) {
	fmt.Println("")
	fmt.Println("Preset")
	fmt.Println("1) Build feature")
	fmt.Println("2) Debug issue")
	fmt.Println("3) Review changes")
	defaultChoice := "1"
	switch def {
	case studioCollaborativePresetDebug:
		defaultChoice = "2"
	case studioCollaborativePresetReview:
		defaultChoice = "3"
	}
	answer, err := promptLine(reader, "Choose preset", defaultChoice)
	if err != nil {
		return studioCollaborativePresetBuild, err
	}
	return normalizeStudioCollaborativePreset(answer), nil
}

func promptStudioCollaborativeDepth(reader *bufio.Reader, def studioCollaborativeDepth) (studioCollaborativeDepth, error) {
	fmt.Println("")
	fmt.Println("Collaboration depth")
	fmt.Println("1) Quick (2 roles)")
	fmt.Println("2) Complete (recommended)")
	fmt.Println("3) Deep (max coverage)")
	defaultChoice := "2"
	switch def {
	case studioCollaborativeDepthQuick:
		defaultChoice = "1"
	case studioCollaborativeDepthDeep:
		defaultChoice = "3"
	}
	answer, err := promptLine(reader, "Choose depth", defaultChoice)
	if err != nil {
		return studioCollaborativeDepthComplete, err
	}
	return normalizeStudioCollaborativeDepth(answer), nil
}

func buildStudioCollaborativePlan(workspace, goal string, preset studioCollaborativePreset, depth studioCollaborativeDepth) studioCollaborativePlan {
	available := listWorkspaceAgentNames(workspace)
	resolve := func(candidates ...string) string {
		for _, candidate := range candidates {
			for _, existing := range available {
				if strings.EqualFold(strings.TrimSpace(existing), strings.TrimSpace(candidate)) {
					return existing
				}
			}
		}
		if len(available) > 0 {
			return available[0]
		}
		return "guide"
	}
	roleCandidates := map[string][]string{
		"planner":   {"planner", "guide"},
		"coder":     {"coder", "guide"},
		"reviewer":  {"reviewer", "guide"},
		"diagnoser": {"diagnoser", "reviewer", "guide"},
		"synth":     {"review_synth", "reviewer", "guide"},
	}
	stageRoles := collaborativeStageRoles(preset, depth)
	stages := make([]studioCollaborativeStage, 0, len(stageRoles))
	lanes := make([]studioCollaborativeLane, 0, 6)
	roleSeen := map[string]struct{}{}
	specParts := make([]string, 0, len(stageRoles))

	for _, roles := range stageRoles {
		stage := studioCollaborativeStage{
			Roles: append([]string{}, roles...),
		}
		seenAgent := map[string]struct{}{}
		for _, role := range roles {
			candidates := roleCandidates[role]
			agent := resolve(candidates...)
			if strings.TrimSpace(agent) == "" {
				continue
			}
			key := strings.ToLower(strings.TrimSpace(agent))
			if _, ok := seenAgent[key]; !ok {
				seenAgent[key] = struct{}{}
				stage.Agents = append(stage.Agents, agent)
			}
			if _, ok := roleSeen[role]; !ok {
				roleSeen[role] = struct{}{}
				lanes = append(lanes, studioCollaborativeLane{
					Name:  role,
					Role:  collaborativeRoleLabel(role),
					Agent: agent,
				})
			}
		}
		if len(stage.Agents) == 0 {
			continue
		}
		stages = append(stages, stage)
		part := strings.Join(stage.Agents, "+")
		if len(specParts) == 0 || specParts[len(specParts)-1] != part {
			specParts = append(specParts, part)
		}
	}
	spec := strings.Join(specParts, ">")
	if strings.TrimSpace(spec) == "" {
		spec = "guide"
	}

	plan := studioCollaborativePlan{
		Workspace: workspace,
		Goal:      strings.TrimSpace(goal),
		Preset:    preset,
		Depth:     depth,
		SessionID: generateStudioCollaborativeSessionID(preset),
		Spec:      spec,
		Stages:    stages,
		Lanes:     lanes,
	}
	plan.Edges = deriveStudioCollaborativeEdges(stageRoles, lanes)
	return plan
}

func collaborativeStageRoles(preset studioCollaborativePreset, depth studioCollaborativeDepth) [][]string {
	switch preset {
	case studioCollaborativePresetDebug:
		switch depth {
		case studioCollaborativeDepthQuick:
			return [][]string{{"diagnoser"}, {"coder"}}
		case studioCollaborativeDepthDeep:
			return [][]string{{"diagnoser", "reviewer"}, {"coder"}, {"synth"}}
		default:
			return [][]string{{"diagnoser"}, {"coder"}, {"reviewer"}}
		}
	case studioCollaborativePresetReview:
		switch depth {
		case studioCollaborativeDepthQuick:
			return [][]string{{"reviewer"}}
		case studioCollaborativeDepthDeep:
			return [][]string{{"diagnoser", "reviewer"}, {"synth"}}
		default:
			return [][]string{{"reviewer"}, {"synth"}}
		}
	default:
		switch depth {
		case studioCollaborativeDepthQuick:
			return [][]string{{"planner"}, {"coder"}}
		case studioCollaborativeDepthDeep:
			return [][]string{{"planner", "reviewer"}, {"coder"}, {"synth"}}
		default:
			return [][]string{{"planner"}, {"coder"}, {"reviewer"}}
		}
	}
}

func collaborativeRoleLabel(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "planner":
		return "Planner"
	case "coder":
		return "Coder"
	case "reviewer":
		return "Reviewer"
	case "diagnoser":
		return "Diagnoser"
	case "synth":
		return "Synth"
	default:
		role = strings.TrimSpace(role)
		if role == "" {
			return "Role"
		}
		return strings.ToUpper(role[:1]) + role[1:]
	}
}

func normalizeStudioCollaborativePreset(raw string) studioCollaborativePreset {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "2", "debug", "debug issue", "diagnose", "diagnoser":
		return studioCollaborativePresetDebug
	case "3", "review", "review changes":
		return studioCollaborativePresetReview
	default:
		return studioCollaborativePresetBuild
	}
}

func normalizeStudioCollaborativeDepth(raw string) studioCollaborativeDepth {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "quick":
		return studioCollaborativeDepthQuick
	case "3", "deep":
		return studioCollaborativeDepthDeep
	default:
		return studioCollaborativeDepthComplete
	}
}

func collaborativePresetLabel(preset studioCollaborativePreset) string {
	switch preset {
	case studioCollaborativePresetDebug:
		return "Debug issue"
	case studioCollaborativePresetReview:
		return "Review changes"
	default:
		return "Build feature"
	}
}

func collaborativeDepthLabel(depth studioCollaborativeDepth) string {
	switch depth {
	case studioCollaborativeDepthQuick:
		return "Quick"
	case studioCollaborativeDepthDeep:
		return "Deep"
	default:
		return "Complete"
	}
}

func printStudioCollaborativePlan(plan studioCollaborativePlan) {
	fmt.Println("")
	fmt.Println(uiSectionTitle("Collaboration Plan"))
	fmt.Printf("%s %s\n", uiMuted("goal:"), plan.Goal)
	fmt.Printf("%s %s\n", uiMuted("preset:"), collaborativePresetLabel(plan.Preset))
	fmt.Printf("%s %s\n", uiMuted("depth:"), collaborativeDepthLabel(plan.Depth))
	fmt.Printf("%s %s\n", uiMuted("session:"), plan.SessionID)
	fmt.Printf("%s %s\n", uiMuted("workflow:"), plan.Spec)
	fmt.Println(uiMuted("windows:"))
	for _, lane := range plan.Lanes {
		fmt.Printf("  - %s [%s] (%s)\n", lane.Role, lane.Name, lane.Agent)
	}
	if len(plan.Edges) > 0 {
		fmt.Println(uiMuted("handoffs:"))
		for _, edge := range plan.Edges {
			fmt.Printf("  - %s -> %s (%s)\n", edge.From, edge.To, edge.Kind)
		}
	}
	fmt.Println("")
}

func printStudioCollaborativeHub(plan studioCollaborativePlan) {
	fmt.Print("\033[2J\033[H")
	printStudioTitle()
	fmt.Println(uiSectionTitle("Collaborative Session"))
	fmt.Printf("%s %s\n", uiMuted("goal:"), plan.Goal)
	fmt.Printf("%s %s\n", uiMuted("preset:"), collaborativePresetLabel(plan.Preset))
	fmt.Printf("%s %s\n", uiMuted("depth:"), collaborativeDepthLabel(plan.Depth))
	fmt.Printf("%s %s\n", uiMuted("session:"), plan.SessionID)
	fmt.Printf("%s %s\n", uiMuted("workflow:"), plan.Spec)
	if strings.TrimSpace(plan.FocusLane) != "" {
		fmt.Printf("%s %s\n", uiMuted("focus lane:"), plan.FocusLane)
	}
	fmt.Println("")
	for i, lane := range plan.Lanes {
		marker := " "
		if strings.EqualFold(strings.TrimSpace(lane.Name), strings.TrimSpace(plan.FocusLane)) {
			marker = "*"
		}
		fmt.Printf("%d) %s%s [%s] - agent `%s`\n", i+1, marker, lane.Role, lane.Name, lane.Agent)
	}
	fmt.Println("")
	fmt.Println(formatStudioOption("1", "Open chat (focus lane)"))
	fmt.Println(formatStudioOption("2", "Send turn (focus lane)"))
	fmt.Println(formatStudioOption("3", "Continue pipeline (recommended)"))
	fmt.Println(formatStudioOption("4", "Show collaborative status"))
	fmt.Println(formatStudioOption("5", "Switch focus lane"))
	fmt.Println(formatStudioOption("6", "Show summary"))
	fmt.Println(formatStudioOption("7", "Auto-run until queue empty"))
	fmt.Println(formatStudioOption("0", "Back"))
	fmt.Println("")
}

func printStudioCollaborativeSummary(plan studioCollaborativePlan) {
	fmt.Println("")
	fmt.Println(uiSectionTitle("Collaboration Summary"))
	fmt.Printf("%s %s\n", uiMuted("goal:"), plan.Goal)
	fmt.Printf("%s %s\n", uiMuted("session:"), plan.SessionID)
	fmt.Printf("%s %s\n", uiMuted("workflow:"), plan.Spec)
	if strings.TrimSpace(plan.FocusLane) != "" {
		fmt.Printf("%s %s\n", uiMuted("focus lane:"), plan.FocusLane)
	}
	fmt.Printf("%s %d\n", uiMuted("roles:"), len(plan.Lanes))
	for _, lane := range plan.Lanes {
		fmt.Printf("  - %s [%s] using `%s`\n", lane.Role, lane.Name, lane.Agent)
	}
	if len(plan.Edges) > 0 {
		fmt.Println("handoffs:")
		for _, edge := range plan.Edges {
			fmt.Printf("  - %s -> %s (%s)\n", edge.From, edge.To, edge.Kind)
		}
	}
	fmt.Println("")
}

func printStudioCollaborativeStatus(snapshot collabSessionSnapshot, focusLane string) {
	fmt.Println("")
	fmt.Println(uiSectionTitle("Collaborative Status"))
	fmt.Printf("%s %s\n", uiMuted("session:"), snapshot.ID)
	fmt.Printf("%s %d\n", uiMuted("turns:"), snapshot.TurnCount)
	fmt.Printf("%s %d\n", uiMuted("artifacts:"), snapshot.ArtifactCount)
	if strings.TrimSpace(focusLane) != "" {
		fmt.Printf("%s %s\n", uiMuted("focus lane:"), focusLane)
	}
	if len(snapshot.Lanes) > 0 {
		fmt.Println(uiMuted("lanes:"))
		for _, lane := range snapshot.Lanes {
			marker := " "
			if strings.EqualFold(strings.TrimSpace(lane.Name), strings.TrimSpace(focusLane)) {
				marker = "*"
			}
			fmt.Printf("  - %s%s inbox=%d agent=%s\n", marker, lane.Name, lane.Inbox, lane.Agent)
		}
	}
	if len(snapshot.RecentTurns) > 0 {
		fmt.Println(uiMuted("recent turns:"))
		for _, turn := range snapshot.RecentTurns {
			fmt.Printf("  - #%d %s %q\n", turn.Seq, turn.Lane, clipLine(turn.Input, 72))
		}
	}
	fmt.Println("")
}

func studioCollaborativeRunContinueStep(plan studioCollaborativePlan) (string, string, collabTurnResponse, error) {
	statusResp, err := collabStatusWithFallback(collabStatusRequest{
		Workspace: plan.Workspace,
		SessionID: plan.SessionID,
	}, false, deephDaemonDefaultTarget())
	if err != nil {
		return "", "", collabTurnResponse{}, err
	}
	lane, ok := studioCollaborativeSuggestedLane(statusResp.Session, plan.FocusLane)
	if !ok {
		return "", "", collabTurnResponse{}, errors.New("collaborative session has no lanes")
	}
	input := studioCollaborativeContinueText
	if !studioCollaborativeHasAnyInbox(statusResp.Session) {
		input = studioCollaborativeKickoffText
	}
	resp, err := collabTurnWithFallback(collabTurnRequest{
		Workspace: plan.Workspace,
		SessionID: plan.SessionID,
		Lane:      lane,
		Text:      input,
	}, false, deephDaemonDefaultTarget())
	if err != nil {
		return lane, input, collabTurnResponse{}, err
	}
	return lane, input, resp, nil
}

func studioCollaborativeAutoRun(plan *studioCollaborativePlan) error {
	if plan == nil {
		return errors.New("collaborative plan is required")
	}
	fmt.Printf("auto-run: starting (max=%d)\n", studioCollaborativeAutoRunMax)
	steps := 0
	for steps < studioCollaborativeAutoRunMax {
		lane, input, resp, err := studioCollaborativeRunContinueStep(*plan)
		if err != nil {
			return err
		}
		if strings.TrimSpace(resp.Error) != "" {
			fmt.Printf("step auto | lane=%s | error=%s\n", lane, clipLine(resp.Error, 160))
			fmt.Printf("auto-run: stopped after %d step(s)\n", steps)
			return nil
		}
		steps++
		plan.FocusLane = studioCollaborativeSelectNextLane(resp, plan.FocusLane)
		printStudioCollaborativeStepSummary(fmt.Sprintf("auto#%d", steps), lane, input, resp)
		if !studioCollaborativeHasAnyInbox(resp.Session) {
			fmt.Printf("auto-run: queue empty after %d step(s)\n", steps)
			return nil
		}
	}
	fmt.Printf("auto-run: stopped at safety limit (%d)\n", studioCollaborativeAutoRunMax)
	return nil
}

func studioCollaborativeSelectNextLane(resp collabTurnResponse, preferred string) string {
	targets := studioCollaborativePublishedTargets(resp.Published)
	if len(targets) > 0 {
		return strings.ToLower(strings.TrimSpace(targets[0]))
	}
	if focus, ok := studioCollaborativeSuggestedLane(resp.Session, preferred); ok {
		return strings.ToLower(strings.TrimSpace(focus))
	}
	return strings.ToLower(strings.TrimSpace(preferred))
}

func printStudioCollaborativeStepSummary(mode, lane, input string, resp collabTurnResponse) {
	done := studioCollaborativeDoneSummary(input, len(resp.Published))
	targets := studioCollaborativePublishedTargets(resp.Published)
	next := "(none)"
	if len(targets) > 0 {
		next = strings.Join(targets, ", ")
	}
	fmt.Printf("step %s | lane=%s\n", mode, lane)
	fmt.Printf("done: %s\n", done)
	fmt.Printf("next: %s\n", next)
}

func studioCollaborativeDoneSummary(input string, handoffCount int) string {
	normalized := strings.ToLower(strings.TrimSpace(input))
	switch {
	case strings.HasPrefix(normalized, "continue from inbox"):
		if handoffCount > 0 {
			return fmt.Sprintf("processed inbox and generated %d handoff(s)", handoffCount)
		}
		return "processed inbox"
	case strings.HasPrefix(normalized, "start the next collaborative step"):
		if handoffCount > 0 {
			return fmt.Sprintf("started pipeline and generated %d handoff(s)", handoffCount)
		}
		return "started pipeline"
	}
	if strings.TrimSpace(input) == "" {
		if handoffCount > 0 {
			return fmt.Sprintf("completed step and generated %d handoff(s)", handoffCount)
		}
		return "completed step"
	}
	return clipLine(strings.TrimSpace(input), 96)
}

func studioCollaborativePublishedTargets(published []collabPublishedHandoff) []string {
	if len(published) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(published))
	for _, pub := range published {
		target := strings.ToLower(strings.TrimSpace(pub.To))
		if target == "" {
			continue
		}
		if _, ok := seen[target]; ok {
			continue
		}
		seen[target] = struct{}{}
		out = append(out, target)
	}
	return out
}

func studioCollaborativeHasAnyInbox(snapshot collabSessionSnapshot) bool {
	for _, lane := range snapshot.Lanes {
		if lane.Inbox > 0 {
			return true
		}
	}
	return false
}

func studioCollaborativeSuggestedLane(snapshot collabSessionSnapshot, preferred string) (string, bool) {
	if len(snapshot.Lanes) == 0 {
		return "", false
	}
	maxInbox := -1
	bestInboxLane := ""
	for _, lane := range snapshot.Lanes {
		if lane.Inbox > maxInbox {
			maxInbox = lane.Inbox
			bestInboxLane = lane.Name
		}
	}
	if maxInbox > 0 {
		return bestInboxLane, true
	}
	preferred = strings.ToLower(strings.TrimSpace(preferred))
	if preferred != "" {
		for _, lane := range snapshot.Lanes {
			if strings.EqualFold(strings.TrimSpace(lane.Name), preferred) {
				return lane.Name, true
			}
		}
	}
	return snapshot.Lanes[0].Name, true
}

func deriveStudioCollaborativeEdges(stageRoles [][]string, lanes []studioCollaborativeLane) []collabEdgeSpec {
	if len(stageRoles) < 2 {
		return nil
	}
	allowed := map[string]struct{}{}
	for _, lane := range lanes {
		allowed[lane.Name] = struct{}{}
	}
	out := make([]collabEdgeSpec, 0)
	seen := map[string]struct{}{}
	for i := 0; i+1 < len(stageRoles); i++ {
		for _, from := range stageRoles[i] {
			if _, ok := allowed[from]; !ok {
				continue
			}
			for _, to := range stageRoles[i+1] {
				if _, ok := allowed[to]; !ok || from == to {
					continue
				}
				key := from + "->" + to
				if _, ok := seen[key]; ok {
					continue
				}
				seen[key] = struct{}{}
				out = append(out, collabEdgeSpec{
					From: from,
					To:   to,
					Kind: collabDefaultKind,
				})
			}
		}
	}
	return out
}

func studioLanesToCollabLanes(in []studioCollaborativeLane) []collabLaneSpec {
	out := make([]collabLaneSpec, 0, len(in))
	for _, lane := range in {
		name := strings.TrimSpace(strings.ToLower(lane.Name))
		agent := strings.TrimSpace(lane.Agent)
		if name == "" || agent == "" {
			continue
		}
		out = append(out, collabLaneSpec{
			Name:  name,
			Agent: agent,
		})
	}
	return out
}

func promptStudioCollaborativeLane(reader *bufio.Reader, plan studioCollaborativePlan) (string, error) {
	if len(plan.Lanes) == 0 {
		return "", errors.New("collaborative plan has no lanes")
	}
	fmt.Println("Lanes:")
	options := make([]string, 0, len(plan.Lanes))
	for i, lane := range plan.Lanes {
		fmt.Printf("  %d) %s [%s] (%s)\n", i+1, lane.Role, lane.Name, lane.Agent)
		options = append(options, lane.Name)
	}
	def := plan.Lanes[0].Name
	if strings.TrimSpace(plan.FocusLane) != "" {
		def = strings.ToLower(strings.TrimSpace(plan.FocusLane))
	}
	answer, err := promptLine(reader, "Lane (name or number)", def)
	if err != nil {
		return "", err
	}
	choice := strings.TrimSpace(resolvePickerInput(answer, options, def))
	if choice == "" {
		return "", errors.New("lane cannot be empty")
	}
	return strings.ToLower(choice), nil
}

func generateStudioCollaborativeSessionID(preset studioCollaborativePreset) string {
	tag := "build"
	switch preset {
	case studioCollaborativePresetDebug:
		tag = "debug"
	case studioCollaborativePresetReview:
		tag = "review"
	}
	return fmt.Sprintf("collab-%s-%s", tag, time.Now().Format("20060102-150405"))
}

func studioReview(reader *bufio.Reader, defaultWorkspace string) (string, error) {
	ws, err := promptWorkspace(reader, defaultWorkspace)
	if err != nil {
		return defaultWorkspace, err
	}
	if err := requireInitializedWorkspace(ws); err != nil {
		return defaultWorkspace, err
	}
	fmt.Println("")
	fmt.Println("Review")
	fmt.Println("1) Run review")
	fmt.Println("2) Trace review flow")
	fmt.Println("3) Show working set")
	action, err := promptLine(reader, "Review action", "1")
	if err != nil {
		return ws, err
	}
	action = strings.ToLower(strings.TrimSpace(action))
	baseRef, err := promptLine(reader, "Base ref", "HEAD")
	if err != nil {
		return ws, err
	}
	focus, err := promptLine(reader, "Review focus (optional)", "")
	if err != nil {
		return ws, err
	}
	args := []string{"--workspace", ws, "--base", strings.TrimSpace(baseRef)}
	if strings.TrimSpace(focus) != "" {
		args = append(args, focus)
	}
	switch action {
	case "1", "run":
		printStudioCommandPreview(append([]string{"review"}, args...)...)
		return ws, cmdReview(args)
	case "2", "trace":
		traceArgs := []string{"--workspace", ws, "--base", strings.TrimSpace(baseRef), "--trace"}
		if strings.TrimSpace(focus) != "" {
			traceArgs = append(traceArgs, focus)
		}
		printStudioCommandPreview(append([]string{"review"}, traceArgs...)...)
		return ws, cmdReview(traceArgs)
	case "3", "scope", "working", "working-set":
		scopePreview := []string{"review", "--workspace", ws, "--base", strings.TrimSpace(baseRef), "--json"}
		if strings.TrimSpace(focus) != "" {
			scopePreview = append(scopePreview, focus)
		}
		printStudioCommandPreview(scopePreview...)
		return ws, studioShowReviewWorkingSet(ws, strings.TrimSpace(baseRef), focus)
	default:
		return ws, fmt.Errorf("unknown review action %q", action)
	}
}

func studioCommandList(reader *bufio.Reader) error {
	category, err := promptLine(reader, "Category (optional)", "")
	if err != nil {
		return err
	}
	args := []string{"list"}
	if strings.TrimSpace(category) != "" {
		args = append(args, "--category", category)
	}
	printStudioCommandPreview(append([]string{"command"}, args...)...)
	return cmdCommand(args)
}

func studioUpdate(reader *bufio.Reader) error {
	tag, err := promptLine(reader, "Release tag (latest or vX.Y.Z)", "latest")
	if err != nil {
		return err
	}
	checkOnlyText, err := promptLine(reader, "Check only? (y/N)", "N")
	if err != nil {
		return err
	}
	args := []string{"--tag", strings.TrimSpace(tag)}
	if strings.EqualFold(strings.TrimSpace(checkOnlyText), "y") || strings.EqualFold(strings.TrimSpace(checkOnlyText), "yes") {
		args = append(args, "--check")
	}
	printStudioCommandPreview(append([]string{"update"}, args...)...)
	return cmdUpdate(args)
}

func maybeRunStudioLauncher(reader *bufio.Reader, state *studioState, currentWorkspace string) (string, bool, error) {
	if workspaceInitialized(currentWorkspace) {
		return currentWorkspace, false, nil
	}

	fmt.Print("\033[2J\033[H")
	printStudioTitle()
	fmt.Printf("No workspace found at %s\n", currentWorkspace)
	fmt.Println("")
	fmt.Println(formatStudioOption("1", "Create workspace (DeepSeek)"))
	fmt.Println(formatStudioOption("2", "Create workspace (local mock)"))
	fmt.Println(formatStudioOption("3", "Open existing workspace"))
	fmt.Println(formatStudioOption("4", "Calculator workspace"))
	fmt.Println(formatStudioOption("0", "Exit"))
	fmt.Println("")

	choice, err := promptLine(reader, "Select option", "1")
	if err != nil {
		return currentWorkspace, false, err
	}

	switch strings.ToLower(strings.TrimSpace(choice)) {
	case "1":
		ws, err := studioQuickstart(reader, state, currentWorkspace, true)
		return ws, false, err
	case "2":
		ws, err := studioQuickstart(reader, state, currentWorkspace, false)
		return ws, false, err
	case "3":
		ws, err := promptWorkspaceChoice(reader, currentWorkspace, state.LastWorkspace)
		if err != nil {
			return currentWorkspace, false, err
		}
		if !workspaceInitialized(ws) {
			return currentWorkspace, false, fmt.Errorf("workspace not initialized: %s not found", filepath.Join(ws, "deeph.yaml"))
		}
		state.LastWorkspace = ws
		return ws, false, nil
	case "4":
		ws, err := studioCalculatorStarter(reader, state, currentWorkspace)
		return ws, false, err
	case "0", "q", "quit", "exit":
		return currentWorkspace, true, nil
	default:
		return currentWorkspace, false, fmt.Errorf("unknown option %q", choice)
	}
}

func studioCalculatorStarter(reader *bufio.Reader, state *studioState, defaultWorkspace string) (string, error) {
	ws, err := promptWorkspace(reader, defaultCalculatorWorkspace(defaultWorkspace))
	if err != nil {
		return defaultWorkspace, err
	}
	if !workspaceInitialized(ws) {
		fmt.Println("Bootstrapping calculator workspace...")
		quickstartArgs := []string{"--workspace", ws, "--agent", "guide", "--deepseek"}
		printStudioCommandPreview(append([]string{"quickstart"}, quickstartArgs...)...)
		if err := cmdQuickstart(quickstartArgs); err != nil {
			return ws, err
		}
	}
	fmt.Println("Configuring DeepSeek provider...")
	providerArgs := []string{
		"--workspace", ws,
		"--name", "deepseek",
		"--model", "deepseek-chat",
		"--timeout-ms", "120000",
		"--set-default",
		"--force",
		"deepseek",
	}
	printStudioCommandPreview(append([]string{"provider", "add"}, providerArgs...)...)
	if err := cmdProviderAdd(providerArgs); err != nil {
		return ws, err
	}
	fmt.Println("Installing calculator kit...")
	kitArgs := []string{
		"--workspace", ws,
		"--provider-name", "deepseek",
		"--model", "deepseek-chat",
		"--set-default-provider",
		"crud-next-multiverse",
	}
	printStudioCommandPreview(append([]string{"kit", "add"}, kitArgs...)...)
	if err := cmdKitAdd(kitArgs); err != nil {
		return ws, err
	}
	runNow, err := promptYesNo(reader, "Generate calculator now?", false)
	if err != nil {
		return ws, err
	}
	state.LastAgentSpec = "@crud_fullstack_multiverse"
	if !runNow {
		fmt.Println("Workspace ready.")
		fmt.Printf("Next: deeph run --workspace %q --multiverse 0 @crud_fullstack_multiverse \"Crie uma calculadora fullstack com frontend Next.js, rotas API, controller/service, operacoes soma/subtracao/multiplicacao/divisao e testes basicos\"\n", ws)
		return ws, nil
	}
	prompt := "Crie uma calculadora fullstack com frontend Next.js, rotas API, controller/service, operacoes soma/subtracao/multiplicacao/divisao e testes basicos"
	runArgs := []string{"--workspace", ws, "--multiverse", "0", "@crud_fullstack_multiverse", prompt}
	printStudioCommandPreview(append([]string{"run"}, runArgs...)...)
	if err := cmdRun(runArgs); err != nil {
		return ws, err
	}
	return ws, nil
}

func studioSwitchWorkspace(reader *bufio.Reader, state *studioState, defaultWorkspace string) (string, error) {
	ws, err := promptWorkspace(reader, defaultWorkspace)
	if err != nil {
		return defaultWorkspace, err
	}
	if err := requireInitializedWorkspace(ws); err != nil {
		return defaultWorkspace, err
	}
	state.LastWorkspace = ws
	fmt.Printf("Workspace switched to %s\n", ws)
	return ws, nil
}

func requireInitializedWorkspace(workspace string) error {
	if workspaceInitialized(workspace) {
		return nil
	}
	return fmt.Errorf("workspace not initialized: %s not found. Use Quickstart or `deeph quickstart --workspace %q --deepseek` first", filepath.Join(workspace, "deeph.yaml"), workspace)
}

func promptLine(reader *bufio.Reader, label, def string) (string, error) {
	if strings.TrimSpace(def) != "" {
		fmt.Printf("%s %s [%s]: ", uiMuted(">"), label, def)
	} else {
		fmt.Printf("%s %s: ", uiMuted(">"), label)
	}
	raw, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	v := strings.TrimSpace(raw)
	if v == "" {
		return def, nil
	}
	return v, nil
}

func promptWorkspace(reader *bufio.Reader, defaultWorkspace string) (string, error) {
	state := loadStudioState()
	ws, err := promptWorkspaceChoice(reader, defaultWorkspace, state.LastWorkspace)
	if err != nil {
		return "", err
	}
	return ws, nil
}

func promptYesNo(reader *bufio.Reader, label string, def bool) (bool, error) {
	defaultText := "N"
	if def {
		defaultText = "Y"
	}
	answer, err := promptLine(reader, label+" (y/N)", defaultText)
	if err != nil {
		return false, err
	}
	switch strings.ToLower(strings.TrimSpace(answer)) {
	case "y", "yes":
		return true, nil
	default:
		return false, nil
	}
}

func hasExplicitWorkspaceArg(args []string) bool {
	for i := 0; i < len(args); i++ {
		if args[i] == "--workspace" {
			return true
		}
		if strings.HasPrefix(args[i], "--workspace=") {
			return true
		}
	}
	return false
}

func waitEnter(reader *bufio.Reader) error {
	fmt.Print("\nPress Enter to continue...")
	_, err := reader.ReadString('\n')
	return err
}

func printStudioCommandPreview(args ...string) {
	if len(args) == 0 {
		return
	}
	line := "deeph " + renderChatExecArgs(args)
	fmt.Printf("%s %s\n", uiMuted("about to run:"), uiAccent(line))
}

func studioShowReviewWorkingSet(workspace, baseRef, focus string) error {
	p, abs, verr, err := loadAndValidate(workspace)
	if err != nil {
		return err
	}
	printValidation(verr)
	if verr != nil && verr.HasErrors() {
		return verr
	}
	cfg := reviewscope.DefaultConfig()
	scope, err := reviewscope.BuildScope(abs, baseRef, cfg)
	if err != nil {
		return err
	}
	input := reviewscope.BuildInput(scope, focus, cfg)
	promptTokens := reviewscope.EstimateTokens(input)
	baseSpec := defaultReviewAgentSpec(p)
	synthSpec := defaultReviewSynthSpec(p)
	selectedSpecArg, useBuiltinFlow := resolveDefaultReviewTarget(abs, p, "")
	displaySpec := reviewDisplaySpec(selectedSpecArg, baseSpec, synthSpec, useBuiltinFlow)

	printReviewScope(scope, displaySpec, promptTokens)
	if len(scope.WorkingSet) == 0 {
		fmt.Println("  working_set_detail: (none)")
		return nil
	}
	fmt.Println("  working_set_detail:")
	for _, file := range scope.WorkingSet {
		fmt.Printf("  - %s reason=%s\n", file.Path, file.Reason)
	}
	return nil
}
