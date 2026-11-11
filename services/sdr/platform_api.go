package main

import (
	"encoding/json"
	"net/http"
	"sdr-next-pilot/pkg/sdrsdk"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
)

func (a *App) platformWorkspaceView(org string) map[string]any {
	w := a.state.Platform.Workspaces[org]
	v := currentPlatform(w)
	history := []map[string]any{}
	for i := len(w.Versions) - 1; i >= 0; i-- {
		x := w.Versions[i]
		history = append(history, map[string]any{"version": x.Version, "published_at": x.PublishedAt, "published_by": x.PublishedBy, "reason": x.Reason, "restored_from": x.RestoredFrom})
	}
	return map[string]any{"organization_id": org, "revision": w.Revision, "draft": w.Draft, "published": v, "history": history, "validation_issues": validatePlatform(w.Draft),
		"has_unpublished_changes": fingerprint(w.Draft) != fingerprint(v.Config), "updated_at": w.UpdatedAt}
}
func terminalOperation(s string) bool { return s == "completed" || s == "failed" || s == "cancelled" }
func (a *App) operationEvent(e *PlatformExecution, kind, actor, step, detail string) {
	e.Revision++
	e.UpdatedAt = a.now().UTC()
	e.Events = append(e.Events, OperationEvent{Sequence: len(e.Events) + 1, Kind: kind, Status: e.Status, StepID: step, Actor: actor, Detail: detail, At: e.UpdatedAt})
	a.record(AuditEntry{Org: e.Org, Actor: actor, Action: "platform." + kind, Operation: e.ID, Revision: e.Revision, Reason: detail})
}
func (a *App) cancelOperation(e *PlatformExecution, actor, reason string) {
	if terminalOperation(e.Status) {
		return
	}
	a.metricEnd("execution", e.Org, e.ID+":"+e.Plan.StepID, e.Lease, "cancelled")
	e.Status = "cancelled"
	e.Error = reason
	e.Lease = ""
	a.operationEvent(e, "execution.cancelled", actor, "", reason)
}
func (a *App) cancelPlatformPending(org, reason string) {
	for _, e := range a.state.Platform.Executions {
		if e.Org == org {
			a.cancelOperation(e, "business-core", reason)
		}
	}
}
func operationDependency(c PlatformConfig, id string) string {
	f, ok := platformWorkflow(c, id)
	if !ok {
		return ""
	}
	tools := []ToolConfig{}
	for _, s := range f.Steps {
		t, ok := platformTool(c, s.ToolID)
		if !ok {
			return ""
		}
		tools = append(tools, t)
	}
	return fingerprint(struct {
		Workflow WorkflowConfig
		Tools    []ToolConfig
	}{f, tools})
}
func (a *App) platformRoute(w http.ResponseWriter, r *http.Request, u User, path string) {
	workspace := a.state.Platform.Workspaces[u.Org]
	if workspace == nil {
		fail(w, 404, "not_found")
		return
	}
	if r.Method == "GET" && path == "v1/platform/capabilities" {
		handlers := sdrsdk.ActionCatalog()
		if !a.calendarEnabled {
			handlers = slices.DeleteFunc(handlers, func(h sdrsdk.HandlerSpec) bool { return strings.HasPrefix(h.ID, "calendar.") })
		}
		write(w, 200, map[string]any{"api_version": "1", "configuration_version": currentPlatform(workspace).Version, "handlers": handlers, "binding_sources": []string{"input", "literal", "step"}, "memory_fields": memoryFields, "execution_modes": []string{"preview", "apply"}, "states": []string{"queued", "running", "waiting_approval", "paused", "completed", "failed", "cancelled"}, "can_configure": u.Role == "admin", "can_execute": u.Role != "viewer", "max_steps": 8, "max_workflows": 12, "real_whatsapp_delivery": a.state.Transport.Policies[u.Org].Enabled,
			"media_automation": map[string]any{"available": a.mediaEnabled, "whatsapp_enabled": a.state.Transport.Policies[u.Org].Enabled && a.state.Transport.Policies[u.Org].MediaEnabled, "handler": "media.send", "upload_path": "/v1/sdr/media", "kinds": []string{"video", "audio", "image", "document"}, "max_bytes": sdrsdk.MaxMediaBytes, "max_schedule_days": 7, "delivery_status_is_separate": true}})
		return
	}
	if r.Method == "GET" && path == "v1/platform/configuration" {
		write(w, 200, a.platformWorkspaceView(u.Org))
		return
	}
	if r.Method == "POST" && strings.HasPrefix(path, "v1/platform/configuration/") {
		a.platformConfigurationCommand(w, r, u, path)
		return
	}
	if path == "v1/platform/executions" {
		if r.Method == "POST" {
			a.createPlatformExecution(w, r, u)
			return
		}
		if r.Method == "GET" {
			a.listPlatformExecutions(w, r, u)
			return
		}
	}
	parts := strings.Split(path, "/")
	if len(parts) >= 4 && parts[2] == "executions" {
		e := a.state.Platform.Executions[parts[3]]
		if e == nil || e.Org != u.Org {
			fail(w, 404, "not_found")
			return
		}
		if r.Method == "GET" && len(parts) == 4 {
			write(w, 200, a.operationView(e, u))
			return
		}
		if len(parts) == 5 {
			if parts[4] == "actions" && r.Method == "POST" {
				a.operationCommand(w, r, u, e)
				return
			}
			if parts[4] == "export" && r.Method == "GET" {
				w.Header().Set("Content-Disposition", `attachment; filename="execution-`+e.ID+`.json"`)
				write(w, 200, map[string]any{"execution": a.operationView(e, u), "configuration": e.Config, "business_context": e.Business, "events": e.Events, "exported_at": a.now().UTC()})
				return
			}
			if parts[4] == "events" && r.Method == "GET" {
				after := 0
				if raw := r.URL.Query().Get("after_seq"); raw != "" {
					v, err := strconv.Atoi(raw)
					if err != nil || v < 0 {
						fail(w, 422, "validation_error")
						return
					}
					after = v
				}
				items := []OperationEvent{}
				for _, v := range e.Events {
					if v.Sequence > after {
						items = append(items, v)
					}
				}
				write(w, 200, map[string]any{"items": items, "next_after_seq": len(e.Events), "status": e.Status})
				return
			}
		}
	}
	if len(parts) == 5 && parts[2] == "conversations" && parts[4] == "notes" && r.Method == "GET" {
		c := a.state.Conversations[parts[3]]
		if c == nil || c.Org != u.Org {
			fail(w, 404, "not_found")
			return
		}
		items := []InternalNote{}
		for _, n := range a.state.Platform.Notes {
			if n.Org == u.Org && n.Conversation == c.ID {
				items = append(items, n)
			}
		}
		sort.Slice(items, func(i, j int) bool { return items[i].At.Before(items[j].At) })
		write(w, 200, map[string]any{"items": items})
		return
	}
	fail(w, 404, "not_found")
}
func (a *App) platformConfigurationCommand(w http.ResponseWriter, r *http.Request, u User, path string) {
	if u.Role != "admin" {
		fail(w, 403, "forbidden")
		return
	}
	var b struct {
		Config           *PlatformConfig `json:"config,omitempty"`
		ExpectedRevision *int            `json:"expected_revision,omitempty"`
		Reason           string          `json:"reason,omitempty"`
		Version          int             `json:"version,omitempty"`
	}
	if !decodeCore(w, r, &b) {
		return
	}
	ws := a.state.Platform.Workspaces[u.Org]
	if path == "v1/platform/configuration/validate" {
		c := ws.Draft
		if b.Config != nil {
			c = *b.Config
		}
		issues := validatePlatform(c)
		write(w, 200, map[string]any{"valid": len(issues) == 0, "issues": issues, "effects_applied": false})
		return
	}
	if !slices.Contains([]string{"v1/platform/configuration/draft", "v1/platform/configuration/publish", "v1/platform/configuration/restore"}, path) {
		fail(w, 404, "not_found")
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if key == "" || len(key) > 100 || b.ExpectedRevision == nil || !textOK(b.Reason, 500, true) {
		fail(w, 422, "validation_error")
		return
	}
	draft := strings.HasSuffix(path, "/draft")
	restore := strings.HasSuffix(path, "/restore")
	if (draft && (b.Config == nil || b.Version != 0)) || (!draft && b.Config != nil) || (!restore && b.Version != 0) || (restore && b.Version < 1) {
		fail(w, 422, "validation_error")
		return
	}
	fp := fingerprint(struct {
		Path string
		Body any
	}{path, b})
	rk := "platform-config:" + u.Org + ":" + u.ID + ":" + key
	if a.replay(w, rk, fp) {
		return
	}
	if *b.ExpectedRevision != ws.Revision {
		fail(w, 409, "revision_conflict")
		return
	}
	c := ws.Draft
	if draft {
		c = *b.Config
	}
	if restore {
		found := false
		for _, v := range ws.Versions {
			if v.Version == b.Version {
				c = v.Config
				found = true
				break
			}
		}
		if !found {
			fail(w, 404, "not_found")
			return
		}
	}
	issues := validatePlatform(c)
	if draft {
		raw, _ := json.Marshal(c)
		issues = []string{}
		if len(raw) > 32000 || len(c.Tools) > 16 || len(c.Workflows) > 12 {
			issues = append(issues, "Limite do rascunho excedido.")
		}
		for _, flow := range c.Workflows {
			if len(flow.Steps) > 8 || len(flow.Inputs) > 12 {
				issues = append(issues, "Limite de etapas ou campos excedido.")
			}
		}
	}
	if len(issues) > 0 {
		write(w, 422, map[string]any{"error": "platform_validation", "issues": issues})
		return
	}
	if !draft && len(ws.Versions) >= 100 {
		fail(w, 409, "version_limit")
		return
	}
	var response map[string]any
	err := a.transact(func() {
		ws.Draft = clonePlatform(c)
		ws.Revision++
		ws.UpdatedAt = a.now().UTC()
		action := "configuration.draft.saved"
		if !draft {
			v := PlatformVersion{Version: currentPlatform(ws).Version + 1, Config: clonePlatform(c), PublishedAt: a.now().UTC(), PublishedBy: u.ID, Reason: b.Reason}
			if restore {
				v.RestoredFrom = b.Version
				action = "configuration.restored"
			} else {
				action = "configuration.published"
			}
			ws.Versions = append(ws.Versions, v)
			for _, e := range a.state.Platform.Executions {
				if e.Org == u.Org && !terminalOperation(e.Status) && operationDependency(e.Config, e.WorkflowID) != operationDependency(c, e.WorkflowID) {
					a.cancelOperation(e, u.ID, "configuration_changed")
				}
			}
		}
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "platform." + action, Revision: ws.Revision, Reason: b.Reason})
		response = map[string]any{"workspace": a.platformWorkspaceView(u.Org), "duplicate": false}
		raw, _ := json.Marshal(response)
		a.state.Results[rk] = result{fp, raw, 200}
	})
	if err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, response)
}
func (a *App) newOperation(u User, c PlatformConfig, f WorkflowConfig, input map[string]string, mode, source, origin string, version, revision int) (*PlatformExecution, string) {
	values, err := platformInput(f, input)
	if err != nil {
		return nil, "invalid_execution_input"
	}
	business, ok := a.solutionBusiness(u.Org, f.Solution, 0)
	if !ok {
		return nil, "solution_unavailable"
	}
	if id := values["conversation_id"]; id != "" {
		target := a.state.Conversations[id]
		if target == nil || target.Org != u.Org {
			return nil, "target_unavailable"
		}
	}
	count := 0
	for _, e := range a.state.Platform.Executions {
		if e.Org == u.Org {
			count++
		}
	}
	if count >= 200 {
		return nil, "execution_limit"
	}
	raw, _ := json.Marshal(business)
	e := &PlatformExecution{ID: "exec_" + token(), Org: u.Org, WorkflowID: f.ID, Status: "queued", Mode: mode, Source: source, Actor: u.ID, ActorRole: u.Role, Origin: origin, Revision: 0, ConfigVersion: version, ConfigRevision: revision, BusinessVersion: business.Version, Config: clonePlatform(c), Business: raw, BusinessFingerprint: business.Fingerprint, Input: values, Steps: []StepRecord{}, Events: []OperationEvent{}, Approvals: map[string]StepApproval{}, CreatedAt: a.now().UTC(), UpdatedAt: a.now().UTC()}
	if code := a.captureMediaTargets(e, f); code != "" {
		return nil, code
	}
	return e, ""
}
func (a *App) createPlatformExecution(w http.ResponseWriter, r *http.Request, u User) {
	if u.Role == "viewer" {
		fail(w, 403, "forbidden")
		return
	}
	var b struct {
		WorkflowID       string            `json:"workflow_id"`
		Mode             string            `json:"mode"`
		Source           string            `json:"source"`
		Input            map[string]string `json:"input"`
		ExpectedRevision *int              `json:"expected_configuration_revision,omitempty"`
		ExpectedVersion  *int              `json:"expected_configuration_version,omitempty"`
		NotBefore        *time.Time        `json:"not_before,omitempty"`
	}
	if !decodeCore(w, r, &b) {
		return
	}
	if !slices.Contains([]string{"preview", "apply"}, b.Mode) || !slices.Contains([]string{"draft", "published"}, b.Source) || (b.Source == "draft" && (b.Mode != "preview" || u.Role != "admin")) {
		fail(w, 422, "validation_error")
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if key == "" || len(key) > 100 {
		fail(w, 422, "validation_error")
		return
	}
	fp := fingerprint(b)
	rk := "platform-execution:" + u.Org + ":" + u.ID + ":" + key
	if a.replay(w, rk, fp) {
		return
	}
	if b.NotBefore != nil && (b.Mode != "apply" || !b.NotBefore.After(a.now()) || b.NotBefore.After(a.now().Add(7*24*time.Hour))) {
		fail(w, 422, "invalid_schedule")
		return
	}
	ws := a.state.Platform.Workspaces[u.Org]
	v := currentPlatform(ws)
	c := v.Config
	version := v.Version
	if b.Source == "published" && b.ExpectedVersion != nil && *b.ExpectedVersion != v.Version {
		fail(w, 409, "revision_conflict")
		return
	}
	if b.Source == "draft" {
		if b.ExpectedRevision == nil || *b.ExpectedRevision != ws.Revision {
			fail(w, 409, "revision_conflict")
			return
		}
		c = ws.Draft
		version = 0
	}
	if issues := validatePlatform(c); len(issues) > 0 {
		write(w, 422, map[string]any{"error": "platform_validation", "issues": issues})
		return
	}
	f, ok := platformWorkflow(c, b.WorkflowID)
	if !ok || !f.Enabled {
		fail(w, 404, "workflow_unavailable")
		return
	}
	if !slices.Contains(f.Roles, u.Role) {
		fail(w, 403, "forbidden")
		return
	}
	e, code := a.newOperation(u, c, f, b.Input, b.Mode, b.Source, "manual", version, ws.Revision)
	if code != "" {
		status := 422
		if code == "target_unavailable" {
			status = 404
		}
		if code == "execution_limit" || code == "solution_unavailable" {
			status = 409
		}
		fail(w, status, code)
		return
	}
	if b.NotBefore != nil {
		e.NotBefore = b.NotBefore.UTC()
		// Known media must still exist when the flow is due. Outputs of previous
		// steps are revalidated by the coordinator when the send is claimed.
		for _, step := range f.Steps {
			tool, _ := platformTool(e.Config, step.ToolID)
			if tool.Handler != "media.send" {
				continue
			}
			id, known := resolveBinding(e, step.Inputs["media_id"])
			if asset := a.state.Media.Assets[id]; known && asset != nil && asset.Organization == e.Org && !asset.Expires.After(e.NotBefore) {
				fail(w, 422, "media_expires_before_schedule")
				return
			}
		}
	}
	var out map[string]any
	err := a.transact(func() {
		a.state.Platform.Sequences[u.Org]++
		e.Sequence = a.state.Platform.Sequences[u.Org]
		a.state.Platform.Executions[e.ID] = e
		a.operationEvent(e, "execution.created", u.ID, "", "")
		out = map[string]any{"execution": a.operationView(e, u), "duplicate": false}
		raw, _ := json.Marshal(out)
		a.state.Results[rk] = result{fp, raw, 202}
	})
	if err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 202, out)
}
func (a *App) operationActions(e *PlatformExecution, u User) []string {
	actions := []string{}
	if u.Role == "viewer" {
		return actions
	}
	f, _ := platformWorkflow(e.Config, e.WorkflowID)
	manage := u.Role == "admin" || u.ID == e.Actor || (e.Origin == "automation" && slices.Contains(f.Roles, u.Role))
	if manage && !terminalOperation(e.Status) {
		actions = append(actions, "cancel")
		if e.Status == "paused" {
			actions = append(actions, "resume")
		} else {
			actions = append(actions, "pause")
		}
	}
	if manage && e.Status == "failed" && slices.Contains([]string{"worker_attempts_exhausted", "worker_unavailable"}, e.Error) {
		actions = append(actions, "retry")
	}
	if e.Status == "waiting_approval" && e.StepIndex < len(f.Steps) {
		t, _ := platformTool(e.Config, f.Steps[e.StepIndex].ToolID)
		if slices.Contains(t.ApproverRoles, u.Role) {
			actions = append(actions, "approve")
		}
	}
	return actions
}
func (a *App) operationView(e *PlatformExecution, u User) map[string]any {
	f, _ := platformWorkflow(e.Config, e.WorkflowID)
	var approval any
	if e.Status == "waiting_approval" && e.StepIndex < len(f.Steps) {
		s := f.Steps[e.StepIndex]
		t, _ := platformTool(e.Config, s.ToolID)
		previewPlan := e.Plan
		previewPlan.Preview = true
		result, _ := sdrsdk.ComputeAction(previewPlan)
		approval = map[string]any{"step_id": s.ID, "tool_name": t.Name, "inputs": e.Plan.Inputs, "preview_result": result.Output}
	}
	return map[string]any{"id": e.ID, "organization_id": e.Org, "sequence": e.Sequence, "revision": e.Revision, "workflow_id": e.WorkflowID, "workflow_name": f.Name, "mode": e.Mode, "source": e.Source, "origin": e.Origin, "actor_id": e.Actor, "status": e.Status, "configuration_version": e.ConfigVersion, "configuration_revision": e.ConfigRevision, "business_version": e.BusinessVersion, "input": e.Input, "steps": e.Steps, "next_step": e.StepIndex, "steps_count": len(f.Steps), "error_code": e.Error, "approval_request": approval, "allowed_actions": a.operationActions(e, u), "created_at": e.CreatedAt, "updated_at": e.UpdatedAt, "not_before": e.NotBefore}
}
func (a *App) listPlatformExecutions(w http.ResponseWriter, r *http.Request, u User) {
	limit := 30
	before := 0
	var err error
	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 100 {
			fail(w, 422, "validation_error")
			return
		}
	}
	if raw := r.URL.Query().Get("before_seq"); raw != "" {
		before, err = strconv.Atoi(raw)
		if err != nil || before < 1 {
			fail(w, 422, "validation_error")
			return
		}
	}
	rows := []*PlatformExecution{}
	for _, e := range a.state.Platform.Executions {
		if e.Org == u.Org && (before == 0 || e.Sequence < before) {
			rows = append(rows, e)
		}
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Sequence > rows[j].Sequence })
	more := len(rows) > limit
	if more {
		rows = rows[:limit]
	}
	items := []map[string]any{}
	next := 0
	for _, e := range rows {
		items = append(items, a.operationView(e, u))
		next = e.Sequence
	}
	write(w, 200, map[string]any{"items": items, "has_more": more, "next_before_seq": next})
}
func (a *App) operationCommand(w http.ResponseWriter, r *http.Request, u User, e *PlatformExecution) {
	var b struct {
		Kind             string `json:"kind"`
		ExpectedRevision *int   `json:"expected_revision"`
		Reason           string `json:"reason"`
	}
	if !decodeCore(w, r, &b) {
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if key == "" || len(key) > 100 || b.ExpectedRevision == nil || !textOK(b.Reason, 500, true) {
		fail(w, 422, "validation_error")
		return
	}
	fp := fingerprint(struct {
		ID   string
		Body any
	}{e.ID, b})
	rk := "platform-action:" + u.Org + ":" + u.ID + ":" + key
	if a.replay(w, rk, fp) {
		return
	}
	if !slices.Contains(a.operationActions(e, u), b.Kind) {
		fail(w, 403, "action_not_permitted")
		return
	}
	if *b.ExpectedRevision != e.Revision {
		fail(w, 409, "revision_conflict")
		return
	}
	var out map[string]any
	err := a.transact(func() {
		switch b.Kind {
		case "cancel":
			a.cancelOperation(e, u.ID, b.Reason)
		case "pause":
			a.metricEnd("execution", e.Org, e.ID+":"+e.Plan.StepID, e.Lease, "cancelled")
			e.Status = "paused"
			e.Lease = ""
			a.operationEvent(e, "execution.paused", u.ID, "", b.Reason)
		case "resume", "retry":
			e.Status = "queued"
			e.Error = ""
			e.Attempts = 0
			e.Lease = ""
			a.operationEvent(e, "execution.resumed", u.ID, "", b.Reason)
		case "approve":
			f, _ := platformWorkflow(e.Config, e.WorkflowID)
			s := f.Steps[e.StepIndex]
			e.Approvals[s.ID] = StepApproval{StepID: s.ID, Actor: u.ID, At: a.now().UTC(), ExpiresAt: a.now().Add(15 * time.Minute)}
			e.Status = "queued"
			e.Lease = ""
			a.operationEvent(e, "step.approved", u.ID, s.ID, b.Reason)
		}
		out = map[string]any{"execution": a.operationView(e, u), "duplicate": false}
		raw, _ := json.Marshal(out)
		a.state.Results[rk] = result{fp, raw, 200}
	})
	if err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, out)
}
