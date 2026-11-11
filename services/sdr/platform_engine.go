package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sdr-next-pilot/pkg/sdrsdk"
	"slices"
	"sort"
	"strings"
	"time"
)

func resolveBinding(e *PlatformExecution, b ValueBinding) (string, bool) {
	switch b.From {
	case "literal":
		return b.Value, true
	case "input":
		v, ok := e.Input[b.Key]
		return v, ok
	case "step":
		for _, s := range e.Steps {
			if s.StepID != b.StepID || s.Status != "completed" {
				continue
			}
			var out map[string]any
			if json.Unmarshal(s.Output, &out) != nil {
				return "", false
			}
			v, ok := out[b.Key]
			if !ok {
				return "", false
			}
			switch x := v.(type) {
			case string:
				return x, true
			case float64:
				return fmt.Sprintf("%v", x), true
			case bool:
				return fmt.Sprintf("%v", x), true
			}
			return "", false
		}
	}
	return "", false
}
func conditionMatches(e *PlatformExecution, c *StepCondition) bool {
	if c == nil {
		return true
	}
	v, ok := resolveBinding(e, c.Binding)
	if !ok {
		return false
	}
	if c.Operator == "not_empty" {
		return strings.TrimSpace(v) != ""
	}
	return v == c.Value
}
func (a *App) operationPolicyValid(e *PlatformExecution) bool {
	if e.Mode == "preview" {
		return true
	}
	for _, target := range e.MediaTargets {
		if !a.mediaTargetValid(e.Org, target) {
			return false
		}
	}
	if e.Origin == "automation" {
		c := a.state.Conversations[e.TriggerConversation]
		if c == nil || c.Org != e.Org || c.OptedOut || a.state.Generation[c.ID] != e.TriggerGeneration {
			return false
		}
	}
	ws := a.state.Platform.Workspaces[e.Org]
	if ws == nil {
		return false
	}
	b, ok := a.businessVersion(e.Org, e.BusinessVersion)
	if !ok {
		return false
	}
	f, ok := platformWorkflow(e.Config, e.WorkflowID)
	if !ok {
		return false
	}
	current, ok := a.solutionBusiness(e.Org, f.Solution, 0)
	return ok && b.Version == current.Version && current.Fingerprint == e.BusinessFingerprint && operationDependency(e.Config, e.WorkflowID) == operationDependency(currentPlatform(ws).Config, e.WorkflowID)
}
func (a *App) operationFailed(e *PlatformExecution, code string) {
	a.metricEnd("execution", e.Org, e.ID+":"+e.Plan.StepID, e.Lease, "failed")
	e.Status = "failed"
	e.Error = code
	e.Lease = ""
	a.operationEvent(e, "execution.failed", "execution-worker", "", code)
}
func (a *App) advanceOperation(e *PlatformExecution) {
	e.StepIndex++
	e.Attempts = 0
	e.Lease = ""
	f, _ := platformWorkflow(e.Config, e.WorkflowID)
	if e.StepIndex >= len(f.Steps) {
		e.Status = "completed"
		a.operationEvent(e, "execution.completed", "execution-worker", "", "")
	} else {
		e.Status = "queued"
	}
}
func (a *App) claimOperation(w http.ResponseWriter) {
	rows := []*PlatformExecution{}
	now := a.now().UTC()
	for _, e := range a.state.Platform.Executions {
		if (e.Status == "queued" && !e.NotBefore.After(now)) || (e.Status == "running" && !e.LeaseUntil.After(now)) {
			rows = append(rows, e)
		}
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].CreatedAt.Before(rows[j].CreatedAt) })
	if len(rows) == 0 {
		w.WriteHeader(204)
		return
	}
	e := rows[0]
	if !a.operationPolicyValid(e) {
		if a.transact(func() { a.cancelOperation(e, "execution-worker", "configuration_or_business_changed") }) != nil {
			fail(w, 503, "storage_unavailable")
		} else {
			w.WriteHeader(204)
		}
		return
	}
	if e.Attempts >= 3 {
		if a.transact(func() { a.operationFailed(e, "worker_attempts_exhausted") }) != nil {
			fail(w, 503, "storage_unavailable")
		} else {
			w.WriteHeader(204)
		}
		return
	}
	f, _ := platformWorkflow(e.Config, e.WorkflowID)
	if e.StepIndex >= len(f.Steps) {
		fail(w, 409, "invalid_execution_state")
		return
	}
	s := f.Steps[e.StepIndex]
	tool, ok := platformTool(e.Config, s.ToolID)
	if !ok || !tool.Enabled {
		if a.transact(func() { a.operationFailed(e, "tool_disabled") }) != nil {
			fail(w, 503, "storage_unavailable")
		} else {
			w.WriteHeader(204)
		}
		return
	}
	if !conditionMatches(e, s.Condition) {
		if a.transact(func() {
			e.Steps = append(e.Steps, StepRecord{StepID: s.ID, ToolID: s.ToolID, Status: "skipped", Output: json.RawMessage("null"), Preview: e.Mode == "preview", CompletedAt: now})
			a.operationEvent(e, "step.skipped", "execution-worker", s.ID, "condition_not_matched")
			a.advanceOperation(e)
		}) != nil {
			fail(w, 503, "storage_unavailable")
		} else {
			w.WriteHeader(204)
		}
		return
	}
	values := map[string]string{}
	valid := true
	for name, b := range s.Inputs {
		v, ok := resolveBinding(e, b)
		if !ok {
			valid = false
			break
		}
		values[name] = v
	}
	if !valid {
		if a.transact(func() { a.operationFailed(e, "input_not_available") }) != nil {
			fail(w, 503, "storage_unavailable")
		} else {
			w.WriteHeader(204)
		}
		return
	}
	if id := values["conversation_id"]; id != "" {
		c := a.state.Conversations[id]
		if c == nil || c.Org != e.Org {
			if a.transact(func() { a.operationFailed(e, "target_unavailable") }) != nil {
				fail(w, 503, "storage_unavailable")
			} else {
				w.WriteHeader(204)
			}
			return
		}
	}
	plan := sdrsdk.ActionPlan{ExecutionID: e.ID, StepID: s.ID, Organization: e.Org, Handler: tool.Handler, Inputs: values, Business: append(json.RawMessage(nil), e.Business...), At: now, Preview: e.Mode == "preview"}
	if code := a.mediaActionProblem(e, plan); code != "" {
		if a.transact(func() { a.operationFailed(e, code) }) != nil {
			fail(w, 503, "storage_unavailable")
		} else {
			w.WriteHeader(204)
		}
		return
	}
	if e.Mode == "apply" && strings.HasPrefix(plan.Handler, "calendar.") {
		if _, problem := a.calendarActionRequest(e, plan); problem != nil {
			if a.transact(func() { a.operationFailed(e, problem.Error()) }) != nil {
				fail(w, 503, "storage_unavailable")
			} else {
				w.WriteHeader(204)
			}
			return
		}
	}
	if e.Mode == "apply" && tool.Approval == "always" {
		approval, exists := e.Approvals[s.ID]
		if !exists || !approval.ExpiresAt.After(now) {
			if a.transact(func() {
				e.Status = "waiting_approval"
				e.Plan = plan
				delete(e.Approvals, s.ID)
				a.operationEvent(e, "step.approval_requested", "execution-worker", s.ID, "")
			}) != nil {
				fail(w, 503, "storage_unavailable")
			} else {
				w.WriteHeader(204)
			}
			return
		}
	}
	lease := token()
	if a.transact(func() {
		if e.Status == "running" {
			a.metricEnd("execution", e.Org, e.ID+":"+e.Plan.StepID, e.Lease, "expired")
		}
		e.Status = "running"
		e.Lease = lease
		e.LeaseUntil = now.Add(90 * time.Second)
		e.Attempts++
		e.Plan = plan
		mode := e.Mode
		if mode == "apply" {
			mode = a.metricMode(values["conversation_id"])
		}
		a.metricStart("execution", e.Org, e.ID+":"+s.ID, lease, "operation:"+tool.Handler, mode, a.metricOperationParents(e, s.ID)...)
		a.operationEvent(e, "step.started", "execution-worker", s.ID, "")
	}) != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, sdrsdk.OperationJob{ID: e.ID, Lease: lease, Plan: plan})
}
func (a *App) completeOperation(w http.ResponseWriter, id, lease string, r sdrsdk.ActionResult) {
	e := a.state.Platform.Executions[id]
	if e == nil || lease == "" {
		fail(w, 409, "stale_execution")
		return
	}
	if e.CompletedLease == lease && e.CompletedDigest == sdrsdk.Digest(r) {
		write(w, 200, map[string]bool{"duplicate": true})
		return
	}
	if e.Status != "running" || e.Lease != lease || !e.LeaseUntil.After(a.now()) || !a.operationPolicyValid(e) {
		fail(w, 409, "stale_execution")
		return
	}
	expected, err := sdrsdk.ComputeAction(e.Plan)
	if err != nil || sdrsdk.Digest(expected) != sdrsdk.Digest(r) {
		fail(w, 422, "invalid_action_result")
		return
	}
	if code := a.mediaActionProblem(e, e.Plan); code != "" {
		fail(w, 409, code)
		return
	}
	var calendarRequest *CalendarRequest
	if e.Mode == "apply" && strings.HasPrefix(e.Plan.Handler, "calendar.") {
		var problem error
		calendarRequest, problem = a.calendarActionRequest(e, e.Plan)
		if problem != nil {
			fail(w, 409, problem.Error())
			return
		}
	}
	f, _ := platformWorkflow(e.Config, e.WorkflowID)
	s := f.Steps[e.StepIndex]
	tool, _ := platformTool(e.Config, s.ToolID)
	if e.Mode == "apply" && tool.Approval == "always" {
		approval, ok := e.Approvals[s.ID]
		if !ok || !approval.ExpiresAt.After(a.now()) {
			fail(w, 409, "approval_expired")
			return
		}
	}
	if id := e.Plan.Inputs["conversation_id"]; id != "" {
		c := a.state.Conversations[id]
		if c == nil || c.Org != e.Org {
			fail(w, 409, "target_unavailable")
			return
		}
	}
	err = a.transact(func() {
		a.metricEnd("execution", e.Org, e.ID+":"+e.Plan.StepID, e.Lease, "completed")
		if e.Mode == "apply" {
			if calendarRequest != nil {
				a.storeCalendarRequest(calendarRequest)
			}
			switch e.Plan.Handler {
			case "media.send":
				a.enqueueWorkflowMedia(e, r)
			case "conversation.note":
				var out struct {
					ID string `json:"note_id"`
				}
				_ = json.Unmarshal(r.Output, &out)
				a.state.Platform.Notes[out.ID] = InternalNote{ID: out.ID, Org: e.Org, Conversation: e.Plan.Inputs["conversation_id"], Text: e.Plan.Inputs["text"], Actor: e.Actor, ExecutionID: e.ID, At: a.now().UTC()}
			case "conversation.pause":
				c := a.state.Conversations[e.Plan.Inputs["conversation_id"]]
				c.Automation = "paused"
				a.state.Generation[c.ID]++
				// The flow's own approved pause may be followed by its internal note.
				// Any later human intervention changes the generation again.
				if e.Origin == "automation" && e.TriggerConversation == c.ID {
					e.TriggerGeneration = a.state.Generation[c.ID]
				}
				a.invalidatePipeline(c, false)
				a.cancelOldAutomatic(c)
				a.touch(c)
				a.record(AuditEntry{Org: e.Org, Actor: e.Actor, Action: "pause", Conversation: c.ID, Operation: e.ID, Revision: c.Revision, Reason: e.Plan.Inputs["reason"]})
			}
		}
		approved := ""
		if ap, ok := e.Approvals[s.ID]; ok {
			approved = ap.Actor
		}
		e.Steps = append(e.Steps, StepRecord{StepID: s.ID, ToolID: s.ToolID, Status: "completed", Output: append(json.RawMessage(nil), r.Output...), Preview: e.Mode == "preview", CompletedAt: a.now().UTC(), ApprovedBy: approved})
		e.CompletedLease = lease
		e.CompletedDigest = sdrsdk.Digest(r)
		delete(e.Approvals, s.ID)
		a.operationEvent(e, "step.completed", "execution-worker", s.ID, "")
		a.advanceOperation(e)
	})
	if err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, map[string]string{"execution_id": e.ID, "status": e.Status})
}
func (a *App) failOperation(w http.ResponseWriter, id, lease, code string) {
	e := a.state.Platform.Executions[id]
	if e == nil || lease == "" || e.Lease != lease || e.Status != "running" || !e.LeaseUntil.After(a.now()) {
		fail(w, 409, "stale_execution")
		return
	}
	if !slices.Contains([]string{"invalid_tool_input", "unsupported_tool", "invalid_action_context", "offer_not_available", "worker_unavailable"}, code) {
		fail(w, 422, "validation_error")
		return
	}
	if a.transact(func() { a.operationFailed(e, code) }) != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, map[string]bool{"accepted": true})
}
func (a *App) triggerPlatform(c *Conversation, parentRun ...string) {
	ws := a.state.Platform.Workspaces[c.Org]
	if ws == nil || c.Automation != "active" || c.OptedOut {
		return
	}
	v := currentPlatform(ws)
	for _, f := range v.Config.Workflows {
		if !f.Enabled || !f.Automation.Enabled || f.Solution != "sdr" {
			continue
		}
		match := true
		matched := map[string]string{}
		for _, condition := range f.Automation.Conditions {
			fact, ok := a.state.Pipeline.Memory[c.ID][condition.Field]
			if !ok || !fact.ExpiresAt.After(a.now()) || strings.TrimSpace(fact.Value) == "" || (condition.Operator == "equals" && sdrsdk.Normalized(fact.Value) != sdrsdk.Normalized(condition.Value)) {
				match = false
				break
			}
			matched[condition.Field] = fact.Value
		}
		if !match {
			continue
		}
		trigger := c.Org + ":" + c.ID + ":" + f.ID + ":" + fmt.Sprint(v.Version)
		if !f.Automation.Once {
			trigger += ":" + fingerprint(matched)
		}
		if a.state.Platform.TriggerReceipts[trigger] != "" {
			continue
		}
		input := map[string]string{}
		for key, b := range f.Automation.Inputs {
			switch b.From {
			case "literal":
				input[key] = b.Value
			case "memory":
				fact := a.state.Pipeline.Memory[c.ID][b.Key]
				if fact.ExpiresAt.After(a.now()) {
					input[key] = fact.Value
				}
			case "conversation":
				input[key] = c.ID
			}
		}
		e, code := a.newOperation(User{ID: "automation:" + f.ID, Org: c.Org, Role: "automation"}, v.Config, f, input, "apply", "published", "automation", v.Version, ws.Revision)
		if code != "" {
			a.record(AuditEntry{Org: c.Org, Actor: "platform-automation", Action: "platform.trigger.blocked", Conversation: c.ID, Reason: code})
			continue
		}
		a.state.Platform.Sequences[c.Org]++
		if len(parentRun) > 0 {
			e.ParentRunID = parentRun[0]
		}
		e.TriggerConversation = c.ID
		e.TriggerGeneration = a.state.Generation[c.ID]
		e.Sequence = a.state.Platform.Sequences[c.Org]
		a.state.Platform.Executions[e.ID] = e
		a.state.Platform.TriggerReceipts[trigger] = e.ID
		a.operationEvent(e, "execution.created", "platform-automation", "", "sdr_reply")
	}
}
