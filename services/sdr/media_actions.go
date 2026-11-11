package main

import (
	"encoding/json"
	"net/http"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
)

// A client-created send is bound to the conversation state at request time.
// Pausing and resuming must not resurrect a previously scheduled send.
type MediaTarget struct {
	Conversation             string
	Generation, InputVersion int
}

func (a *App) mediaTargetValid(org string, target MediaTarget) bool {
	c := a.state.Conversations[target.Conversation]
	return c != nil && c.Org == org && !c.OptedOut && c.Automation == "active" && a.state.Generation[c.ID] == target.Generation && c.InputVersion == target.InputVersion
}

func (a *App) captureMediaTargets(e *PlatformExecution, f WorkflowConfig) string {
	e.MediaTargets = map[string]MediaTarget{}
	for _, step := range f.Steps {
		tool, _ := platformTool(e.Config, step.ToolID)
		if tool.Handler != "media.send" {
			continue
		}
		id, ok := resolveBinding(e, step.Inputs["conversation_id"])
		c := a.state.Conversations[id]
		if !ok || c == nil || c.Org != e.Org {
			return "target_unavailable"
		}
		target := MediaTarget{c.ID, a.state.Generation[c.ID], c.InputVersion}
		if e.Mode == "apply" && !a.mediaTargetValid(e.Org, target) {
			return "automation_blocked"
		}
		e.MediaTargets[step.ID] = target
	}
	return ""
}

func (a *App) mediaActionProblem(e *PlatformExecution, p sdrsdk.ActionPlan) string {
	if p.Handler != "media.send" {
		return ""
	}
	c := a.state.Conversations[p.Inputs["conversation_id"]]
	if c == nil || c.Org != e.Org {
		return "target_unavailable"
	}
	if !a.usableOutgoingMedia(User{Org: e.Org}, c, p.Inputs["media_id"]) {
		return "media_unavailable"
	}
	asset := a.state.Media.Assets[p.Inputs["media_id"]]
	if (asset.File.Kind == "audio" && p.Inputs["caption"] != "") || len([]rune(p.Inputs["caption"])) > 1000 {
		return "media_caption_invalid"
	}
	if e.Mode == "apply" {
		target, ok := e.MediaTargets[p.StepID]
		if !ok || target.Conversation != c.ID || !a.mediaTargetValid(e.Org, target) {
			return "automation_blocked"
		}
		if c.Channel == "whatsapp" {
			b := a.state.Transport.Bindings[c.ID]
			if !a.pipelineEnabled || !allowsReal(a.state.Transport.Policies[e.Org], b.Epoch, b.Target) {
				return "transport_not_enabled"
			}
		}
	}
	return ""
}

// Called only in the same transaction as the execution receipt. Retrying a
// worker completion cannot enqueue the message twice, even after restart.
func (a *App) enqueueWorkflowMedia(e *PlatformExecution, result sdrsdk.ActionResult) {
	var out struct {
		MessageID string `json:"message_id"`
	}
	_ = json.Unmarshal(result.Output, &out)
	c := a.state.Conversations[e.Plan.Inputs["conversation_id"]]
	asset := a.state.Media.Assets[e.Plan.Inputs["media_id"]]
	m := Message{ID: out.MessageID, Conversation: c.ID, Sequence: len(a.state.Messages[c.ID]) + 1, Direction: "outbound", Author: "assistant", Text: e.Plan.Inputs["caption"], Status: "queued", Created: a.now().UTC(), BusinessVersion: e.BusinessVersion, ExecutionID: e.ID, ExecutionStep: e.Plan.StepID,
		Media: &MessageMedia{ID: asset.ID, Kind: asset.File.Kind, MIME: asset.File.MIME, Name: asset.File.Name, Size: asset.File.Size, Status: "ready"}}
	a.state.Messages[c.ID] = append(a.state.Messages[c.ID], m)
	a.state.Tasks = append(a.state.Tasks, Task{Conversation: c.ID, Message: m.ID, Org: c.Org, Generation: a.state.Generation[c.ID], Automatic: true})
	a.touch(c)
	a.event(c, "message.created", m.ID)
	a.record(AuditEntry{Org: e.Org, Actor: e.Actor, Action: "media.send.queued", Conversation: c.ID, Operation: e.ID, Revision: c.Revision})
}

func (a *App) workflowMediaDeliveryAllowed(c *Conversation, m *Message) bool {
	if m.ExecutionID == "" {
		return true
	}
	e := a.state.Platform.Executions[m.ExecutionID]
	if e == nil || e.Org != c.Org || e.Mode != "apply" || e.Status == "cancelled" || e.Status == "failed" || e.Status == "paused" || !a.operationPolicyValid(e) {
		return false
	}
	target, ok := e.MediaTargets[m.ExecutionStep]
	return ok && target.Conversation == c.ID && a.mediaTargetValid(e.Org, target) && m.Media != nil && a.usableOutgoingMedia(User{Org: c.Org}, c, m.Media.ID)
}

// Delivery status is separate from workflow completion (which means queued).
// Cancellation is allowed only before the final gateway send permit.
func (a *App) mediaMessageRoute(w http.ResponseWriter, r *http.Request, u User, path string) bool {
	parts := strings.Split(path, "/")
	if len(parts) < 6 || len(parts) > 7 || parts[0] != "v1" || parts[1] != "sdr" || parts[2] != "conversations" || parts[4] != "messages" {
		return false
	}
	c := a.state.Conversations[parts[3]]
	if c == nil || c.Org != u.Org {
		fail(w, 404, "not_found")
		return true
	}
	var m *Message
	for i := range a.state.Messages[c.ID] {
		if a.state.Messages[c.ID][i].ID == parts[5] {
			m = &a.state.Messages[c.ID][i]
			break
		}
	}
	if m == nil {
		fail(w, 404, "not_found")
		return true
	}
	if len(parts) == 6 && r.Method == "GET" {
		write(w, 200, m)
		return true
	}
	if len(parts) != 7 || parts[6] != "cancel" || r.Method != "POST" {
		fail(w, 404, "not_found")
		return true
	}
	if u.Role == "viewer" {
		fail(w, 403, "forbidden")
		return true
	}
	var b struct {
		Reason   string `json:"reason"`
		Revision *int   `json:"expected_revision"`
	}
	if !decodeCore(w, r, &b) {
		return true
	}
	key := r.Header.Get("Idempotency-Key")
	if key == "" || len(key) > 100 || b.Revision == nil || !textOK(b.Reason, 500, true) {
		fail(w, 422, "validation_error")
		return true
	}
	fp := fingerprint(struct {
		Path string
		Body any
	}{path, b})
	rk := "media-cancel:" + u.Org + ":" + u.ID + ":" + key
	if a.replay(w, rk, fp) {
		return true
	}
	if c.Revision != *b.Revision {
		fail(w, 409, "revision_conflict")
		return true
	}
	d := a.state.Transport.Deliveries[m.ID]
	if m.Media == nil || m.Direction != "outbound" || (m.Status != "queued" && m.Status != "cancelled") || (d != nil && d.Status != "queued" && d.Status != "cancelled") {
		fail(w, 409, "send_already_started")
		return true
	}
	var response map[string]any
	if err := a.transact(func() {
		m.Status = "cancelled"
		if d != nil {
			d.Status = "cancelled"
		}
		a.touch(c)
		a.event(c, "message.updated", m.ID)
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "media.send.cancelled", Conversation: c.ID, Operation: m.ID, Revision: c.Revision, Reason: b.Reason})
		response = map[string]any{"message": *m, "duplicate": false}
		raw, _ := json.Marshal(response)
		a.state.Results[rk] = resultType(fp, raw, 200)
	}); err != nil {
		fail(w, 503, "storage_unavailable")
		return true
	}
	write(w, 200, response)
	return true
}
