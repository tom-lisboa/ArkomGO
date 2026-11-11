package main

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"io"
	"net/http"
	"sdr-next-pilot/pkg/sdrsdk"
	"slices"
	"sort"
	"strings"
	"time"
)

type ContextWindow struct {
	ID, Org, Conversation, Status, Lease, Error string
	InputIDs                                    []string
	FirstAt, LastAt, DueAt, LeaseUntil          time.Time
	Attempts                                    int
	Candidate                                   sdrsdk.Candidate
	CompleteDigest                              string
}
type ExecutionRun struct {
	ID, Org, Conversation, Status, Lease, Error, MessageID, OutcomeDigest, ResponseID, Model, Action, SuggestedResponse string
	Context                                                                                                             sdrsdk.Prepared
	DueAt, LeaseUntil, CreatedAt, CompletedAt                                                                           time.Time
	Attempts                                                                                                            int
	InputTokens, OutputTokens                                                                                           int64
}
type PipelineState struct {
	Windows map[string]*ContextWindow
	Runs    map[string]*ExecutionRun
	Memory  map[string]map[string]sdrsdk.Fact
	Hourly  map[string]int
}
type WorkerHealth struct {
	At    time.Time
	Model string
}

func (a *App) initPipeline() {
	if a.state.Pipeline.Windows == nil {
		a.state.Pipeline.Windows = map[string]*ContextWindow{}
	}
	if a.state.Pipeline.Runs == nil {
		a.state.Pipeline.Runs = map[string]*ExecutionRun{}
	}
	if a.state.Pipeline.Memory == nil {
		a.state.Pipeline.Memory = map[string]map[string]sdrsdk.Fact{}
	}
	if a.state.Pipeline.Hourly == nil {
		a.state.Pipeline.Hourly = map[string]int{}
	}
	// Normalize only already-extracted fields, retaining their message evidence.
	for conversation, facts := range a.state.Pipeline.Memory {
		ctx := sdrsdk.Prepared{}
		for _, m := range a.state.Messages[conversation] {
			if m.Direction == "inbound" {
				ctx.History = append(ctx.History, sdrsdk.HistoryMessage{ID: m.ID, Role: "user", Text: m.Text})
			}
		}
		changed := false
		for key, f := range facts {
			d := sdrsdk.CanonicalDecision(ctx, sdrsdk.Decision{Facts: []sdrsdk.ExtractedFact{{Key: key, Value: f.Value, MessageID: f.MessageID}}})
			if len(d.Facts) > 0 && d.Facts[0].Value != f.Value {
				f.Value = d.Facts[0].Value
				facts[key] = f
				changed = true
			}
		}
		if changed {
			if c := a.state.Conversations[conversation]; c != nil {
				a.record(AuditEntry{Org: c.Org, Actor: "context-worker", Action: "memory.normalized", Conversation: conversation})
			}
		}
	}
	a.workerHealth = map[string]WorkerHealth{}
}
func (a *App) pipelineFence(c *Conversation, ctx sdrsdk.Prepared) bool {
	if c == nil || c.Org != ctx.Organization || c.ID != ctx.Conversation || c.Automation != "active" || c.OptedOut || c.InputVersion != ctx.InputVersion || a.state.Generation[c.ID] != ctx.Generation {
		return false
	}
	b, ok := a.solutionBusiness(c.Org, "sdr", 0)
	return ok && b.Version == ctx.BusinessVersion && b.Fingerprint == ctx.BusinessFingerprint
}
func (a *App) invalidatePipeline(c *Conversation, requeue bool) {
	if !a.pipelineEnabled {
		return
	}
	ids := []string{}
	var first time.Time
	if w := a.state.Pipeline.Windows[c.ID]; w != nil && (w.Status == "pending" || w.Status == "running") {
		ids = append(ids, w.InputIDs...)
		first = w.FirstAt
		a.metricEnd("context", w.Org, w.ID, w.Lease, "cancelled")
		w.Status = "cancelled"
		w.Error = "context_changed"
	}
	for _, j := range a.state.Pipeline.Runs {
		if j.Conversation != c.ID || j.Org != c.Org {
			continue
		}
		waiting := j.Status == "queued" || j.Status == "running"
		if j.Status == "completed" && j.MessageID != "" {
			for _, m := range a.state.Messages[c.ID] {
				if m.ID == j.MessageID && m.Status == "queued" {
					waiting = true
				}
			}
		}
		if waiting {
			ids = append(ids, j.Context.InputIDs...)
			if j.Status == "running" {
				a.metricEnd("execution", j.Org, j.ID, j.Lease, "cancelled")
			}
			j.Status = "cancelled"
			j.Error = "context_changed"
		}
	}
	if requeue && c.Automation == "active" && !c.OptedOut && len(ids) > 0 {
		a.newWindow(c, ids)
		if !first.IsZero() {
			w := a.state.Pipeline.Windows[c.ID]
			w.FirstAt = first
			w.DueAt = sdrsdk.DefaultPolicy().Due(first, w.LastAt)
		}
	}
}
func (a *App) newWindow(c *Conversation, ids []string) {
	unique := map[string]bool{}
	for _, id := range ids {
		unique[id] = true
	}
	ordered := []string{}
	for _, m := range a.state.Messages[c.ID] {
		if unique[m.ID] && m.Direction == "inbound" {
			ordered = append(ordered, m.ID)
		}
	}
	now := a.now().UTC()
	p := sdrsdk.DefaultPolicy()
	a.state.Pipeline.Windows[c.ID] = &ContextWindow{ID: token(), Org: c.Org, Conversation: c.ID, Status: "pending", InputIDs: ordered, FirstAt: now, LastAt: now, DueAt: p.Due(now, now)}
	a.state.Pipeline.Windows[c.ID].DueAt = a.mediaWindowDue(c, a.state.Pipeline.Windows[c.ID])
}
func (a *App) queueContext(c *Conversation, messageID string) {
	w := a.state.Pipeline.Windows[c.ID]
	if w == nil || w.Status != "pending" {
		a.newWindow(c, []string{messageID})
		return
	}
	if !slices.Contains(w.InputIDs, messageID) {
		w.InputIDs = append(w.InputIDs, messageID)
	}
	w.LastAt = a.now().UTC()
	w.DueAt = a.mediaWindowDue(c, w)
}
func (a *App) rawCandidate(c *Conversation, w *ContextWindow) (sdrsdk.Candidate, bool) {
	if c == nil || w == nil {
		return sdrsdk.Candidate{}, false
	}
	b, ok := a.solutionBusiness(c.Org, "sdr", 0)
	if !ok {
		return sdrsdk.Candidate{}, false
	}
	raw, _ := json.Marshal(b)
	history := []sdrsdk.HistoryMessage{}
	size := 0
	all := a.state.Messages[c.ID]
	for i := len(all) - 1; i >= 0 && len(history) < 60; i-- {
		m := all[i]
		if m.Direction != "inbound" && m.Status != "sent" {
			continue
		}
		if size+len(m.Text) > 96000 {
			break
		}
		role := "assistant"
		if m.Direction == "inbound" {
			role = "user"
		}
		historyText := m.Text
		if m.Media != nil && m.Direction == "outbound" {
			historyText += "\n[Anexo enviado: " + m.Media.Kind + "; nome: " + m.Media.Name + ". O conteúdo do anexo enviado não foi interpretado; não presuma o que contém.]"
		}
		history = append(history, sdrsdk.HistoryMessage{ID: m.ID, Sequence: m.Sequence, Role: role, Text: historyText})
		size += len(historyText)
	}
	slices.Reverse(history)
	memory := []sdrsdk.Fact{}
	keys := []string{}
	for k := range a.state.Pipeline.Memory[c.ID] {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		memory = append(memory, a.state.Pipeline.Memory[c.ID][k])
	}
	return sdrsdk.Candidate{Organization: c.Org, Conversation: c.ID, Generation: a.state.Generation[c.ID], InputVersion: c.InputVersion, BusinessVersion: b.Version, BusinessFingerprint: b.Fingerprint, Business: raw, Calendar: a.calendarContext(c), InputIDs: slices.Clone(w.InputIDs), History: history, Memory: memory, At: a.now().UTC()}, true
}
func (a *App) privateWorkers() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if a.calendarPrivate(w, r) {
			return
		}
		if a.metricsFeed(w, r) {
			return
		}
		if a.mediaPrivate(w, r) {
			return
		}
		a.mu.Lock()
		defer a.mu.Unlock()
		w.Header().Set("Cache-Control", "no-store")
		if r.Method == "POST" && r.URL.Path == "/internal/transport/media" {
			a.transportMediaBytes(w, r)
			return
		}
		if r.Method == "POST" && r.URL.Path == "/internal/transport/authorize" {
			a.authorizeReal(w, r)
			return
		}
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if !a.pipelineEnabled || r.Method != "POST" || len(parts) != 4 || parts[0] != "internal" || parts[1] != "workers" || !slices.Contains([]string{"context", "execution"}, parts[2]) {
			fail(w, 404, "not_found")
			return
		}
		role := parts[2]
		expected, exists := a.workerSecrets[role]
		actual := sha256.Sum256([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")))
		if !exists || subtle.ConstantTimeCompare(actual[:], expected[:]) != 1 {
			fail(w, 401, "unauthorized")
			return
		}
		var b struct {
			ID       string              `json:"id"`
			Lease    string              `json:"lease"`
			Code     string              `json:"code"`
			Model    string              `json:"model"`
			Prepared sdrsdk.Prepared     `json:"prepared"`
			Outcome  sdrsdk.Outcome      `json:"outcome"`
			Result   sdrsdk.ActionResult `json:"result"`
		}
		d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128<<10))
		d.DisallowUnknownFields()
		if d.Decode(&b) != nil || d.Decode(new(any)) != io.EOF {
			fail(w, 400, "invalid_json")
			return
		}
		health := a.workerHealth[role]
		health.At = a.now().UTC()
		if role == "execution" && (parts[3] == "claim" || parts[3] == "operation-claim") {
			if b.Model != a.executionModel {
				fail(w, 403, "model_mismatch")
				return
			}
			health.Model = b.Model
		}
		a.workerHealth[role] = health
		if role == "execution" && strings.HasPrefix(parts[3], "operation-") {
			switch parts[3] {
			case "operation-claim":
				a.claimOperation(w)
			case "operation-complete":
				a.completeOperation(w, b.ID, b.Lease, b.Result)
			case "operation-fail":
				a.failOperation(w, b.ID, b.Lease, b.Code)
			default:
				fail(w, 404, "not_found")
			}
			return
		}
		if parts[3] == "claim" {
			if role == "context" {
				a.claimContext(w)
			} else {
				a.claimExecution(w)
			}
			return
		}
		if role == "context" {
			a.finishContext(w, parts[3], b.ID, b.Lease, b.Code, b.Prepared)
		} else {
			a.finishExecution(w, parts[3], b.ID, b.Lease, b.Code, b.Outcome)
		}
	})
}
func (a *App) claimContext(w http.ResponseWriter) {
	now := a.now().UTC()
	if !a.expireMediaTasks() {
		fail(w, 503, "storage_unavailable")
		return
	}
	list := []*ContextWindow{}
	for _, v := range a.state.Pipeline.Windows {
		if a.mediaWindowPending(v) {
			continue
		}
		if (v.Status == "pending" && !v.DueAt.After(now)) || (v.Status == "running" && !v.LeaseUntil.After(now)) {
			list = append(list, v)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].DueAt.Before(list[j].DueAt) })
	if len(list) == 0 {
		w.WriteHeader(204)
		return
	}
	j := list[0]
	if j.Attempts >= 3 {
		err := a.transact(func() {
			a.metricEnd("context", j.Org, j.ID, j.Lease, "expired")
			j.Status = "review"
			j.Error = "context_attempt_limit"
			if c := a.state.Conversations[j.Conversation]; c != nil {
				c.Automation = "human"
				a.state.Generation[c.ID]++
				a.touch(c)
				a.record(AuditEntry{Org: c.Org, Actor: "context-worker", Action: "context.review_required", Conversation: c.ID, Operation: j.ID})
			}
		})
		if err != nil {
			fail(w, 503, "storage_unavailable")
		} else {
			w.WriteHeader(204)
		}
		return
	}
	c := a.state.Conversations[j.Conversation]
	candidate, ok := a.rawCandidate(c, j)
	if c == nil || c.Automation != "active" || c.OptedOut || !ok {
		if a.transact(func() {
			a.metricEnd("context", j.Org, j.ID, j.Lease, "cancelled")
			j.Status = "cancelled"
			j.Error = "automation_blocked"
		}) != nil {
			fail(w, 503, "storage_unavailable")
		} else {
			w.WriteHeader(204)
		}
		return
	}
	lease := token()
	err := a.transact(func() {
		if j.Status == "running" {
			a.metricEnd("context", j.Org, j.ID, j.Lease, "expired")
		}
		j.Status = "running"
		j.Lease = lease
		j.LeaseUntil = now.Add(sdrsdk.DefaultPolicy().Lease)
		j.Attempts++
		j.Candidate = candidate
		a.metricStart("context", j.Org, j.ID, lease, "context", a.metricMode(j.Conversation), a.metricContextParents(j)...)
	})
	if err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, sdrsdk.ContextJob{ID: j.ID, Lease: lease, Candidate: candidate})
}
func (a *App) findWindow(id string) *ContextWindow {
	for _, w := range a.state.Pipeline.Windows {
		if w.ID == id {
			return w
		}
	}
	return nil
}
func (a *App) finishContext(w http.ResponseWriter, action, id, lease, code string, prepared sdrsdk.Prepared) {
	j := a.findWindow(id)
	if j == nil || lease == "" || j.Lease != lease {
		fail(w, 409, "stale_context")
		return
	}
	if action == "complete" && j.Status == "done" && j.CompleteDigest == prepared.Digest {
		write(w, 200, map[string]bool{"duplicate": true})
		return
	}
	if j.Status != "running" || !j.LeaseUntil.After(a.now()) {
		fail(w, 409, "stale_context")
		return
	}
	c := a.state.Conversations[j.Conversation]
	if action == "fail" {
		if code != "context_overflow" {
			fail(w, 422, "validation_error")
			return
		}
		if a.transact(func() {
			a.metricEnd("context", j.Org, j.ID, j.Lease, "failed")
			j.Status = "review"
			j.Error = code
			c.Automation = "human"
			a.state.Generation[c.ID]++
			a.touch(c)
			a.record(AuditEntry{Org: c.Org, Actor: "context-worker", Action: "context.review_required", Conversation: c.ID, Operation: j.ID})
		}) != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
		write(w, 200, map[string]bool{"accepted": true})
		return
	}
	expected, err := sdrsdk.BuildContext(j.Candidate, sdrsdk.DefaultPolicy())
	if action != "complete" || err != nil || sdrsdk.Digest(expected) != sdrsdk.Digest(prepared) {
		fail(w, 422, "invalid_context_snapshot")
		return
	}
	if !a.pipelineFence(c, expected) {
		fail(w, 409, "stale_context")
		return
	}
	runID := "run_" + j.ID
	err = a.transact(func() {
		a.metricEnd("context", j.Org, j.ID, j.Lease, "completed")
		j.Status = "done"
		j.CompleteDigest = prepared.Digest
		a.state.Pipeline.Runs[runID] = &ExecutionRun{ID: runID, Org: c.Org, Conversation: c.ID, Status: "queued", Context: prepared, DueAt: a.now().UTC(), CreatedAt: a.now().UTC()}
		ids := []string{}
		for _, m := range prepared.History {
			ids = append(ids, m.ID)
		}
		a.state.ContextReceipts[c.ID] = ContextReceipt{ID: runID, Organization: c.Org, Conversation: c.ID, Solution: "sdr", BusinessVersion: prepared.BusinessVersion, Fingerprint: prepared.BusinessFingerprint, MessageIDs: ids, PreparedAt: prepared.At, HistoryTruncated: prepared.Truncated}
		a.record(AuditEntry{Org: c.Org, Actor: "context-worker", Action: "context.prepared", Conversation: c.ID, Operation: runID, Revision: prepared.BusinessVersion})
	})
	if err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, map[string]string{"run_id": runID})
}
func (a *App) claimExecution(w http.ResponseWriter) {
	now := a.now().UTC()
	list := []*ExecutionRun{}
	for _, j := range a.state.Pipeline.Runs {
		if (j.Status == "queued" && !j.DueAt.After(now)) || (j.Status == "running" && !j.LeaseUntil.After(now)) {
			list = append(list, j)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].CreatedAt.Before(list[j].CreatedAt) })
	if len(list) == 0 {
		w.WriteHeader(204)
		return
	}
	j := list[0]
	c := a.state.Conversations[j.Conversation]
	if !a.pipelineFence(c, j.Context) {
		if a.transact(func() {
			a.metricEnd("execution", j.Org, j.ID, j.Lease, "cancelled")
			j.Status = "cancelled"
			j.Error = "context_changed"
		}) != nil {
			fail(w, 503, "storage_unavailable")
		} else {
			w.WriteHeader(204)
		}
		return
	}
	hour := j.Org + ":" + now.Format("2006-01-02T15")
	quotaReached := a.state.Pipeline.Hourly[hour] >= 60
	if j.Attempts >= 3 || quotaReached {
		if a.transact(func() {
			a.metricEnd("execution", j.Org, j.ID, j.Lease, "expired")
			j.Status = "review"
			j.Error = "model_attempts_or_hourly_limit"
			c.Automation = "human"
			a.state.Generation[c.ID]++
			a.touch(c)
			a.record(AuditEntry{Org: c.Org, Actor: "execution-worker", Action: "execution.review_required", Conversation: c.ID, Operation: j.ID})
		}) != nil {
			fail(w, 503, "storage_unavailable")
		} else {
			w.WriteHeader(204)
		}
		return
	}
	lease := token()
	if a.transact(func() {
		if j.Status == "running" {
			a.metricEnd("execution", j.Org, j.ID, j.Lease, "expired")
		}
		j.Status = "running"
		j.Lease = lease
		j.LeaseUntil = now.Add(sdrsdk.DefaultPolicy().Lease)
		j.Attempts++
		a.metricStart("execution", j.Org, j.ID, lease, "inference", a.metricMode(j.Conversation), sdrsdk.MetricJob(j.Org, "context", strings.TrimPrefix(j.ID, "run_")))
		a.state.Pipeline.Hourly[hour]++
	}) != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, sdrsdk.ExecutionJob{ID: j.ID, Lease: lease, Context: j.Context})
}
func (a *App) finishExecution(w http.ResponseWriter, action, id, lease, code string, out sdrsdk.Outcome) {
	j := a.state.Pipeline.Runs[id]
	if j == nil || lease == "" || j.Lease != lease {
		fail(w, 409, "stale_execution")
		return
	}
	if action == "complete" && j.Status == "completed" && j.OutcomeDigest == sdrsdk.Digest(out) {
		write(w, 200, map[string]bool{"duplicate": true})
		return
	}
	if j.Status != "running" || !j.LeaseUntil.After(a.now()) || !a.pipelineFence(a.state.Conversations[j.Conversation], j.Context) {
		fail(w, 409, "stale_execution")
		return
	}
	c := a.state.Conversations[j.Conversation]
	if action == "fail" {
		if !slices.Contains([]string{"model_unavailable_or_invalid", "openai_http_400", "openai_http_401", "openai_http_403", "openai_http_404", "openai_http_408", "openai_http_409", "openai_http_422", "openai_http_429", "openai_http_500", "openai_http_502", "openai_http_503", "openai_http_504"}, code) {
			fail(w, 422, "validation_error")
			return
		}
		if a.transact(func() {
			a.metricEnd("execution", j.Org, j.ID, j.Lease, "failed")
			j.Error = code
			j.Status = "queued"
			j.DueAt = a.now().Add(3 * time.Second)
			if j.Attempts >= 3 {
				j.Status = "review"
				c.Automation = "human"
				a.state.Generation[c.ID]++
				a.touch(c)
			}
			a.record(AuditEntry{Org: c.Org, Actor: "execution-worker", Action: "execution.retry_or_review", Conversation: c.ID, Operation: j.ID})
		}) != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
		write(w, 200, map[string]bool{"accepted": true})
		return
	}
	out.Decision = sdrsdk.CanonicalDecision(j.Context, out.Decision)
	if action != "complete" || out.Model != a.executionModel || sdrsdk.ValidateDecision(j.Context, out.Decision) != nil || len(out.ResponseID) > 250 || out.InputTokens < 0 || out.OutputTokens < 0 {
		fail(w, 422, "invalid_execution_outcome")
		return
	}
	var calendarRequest *CalendarRequest
	calendarProblem := false
	if out.Decision.Calendar != nil {
		var e error
		calendarRequest, e = a.newCalendarRequest(User{ID: "agent:sdr", Org: c.Org, Role: "automation"}, calendarIntentInput(out.Decision.Calendar, c.ID), "sdr", j.ID, sdrsdk.MetricJob(c.Org, "execution", j.ID))
		calendarProblem = e != nil
	}
	err := a.transact(func() {
		a.metricEnd("execution", j.Org, j.ID, j.Lease, "completed")
		j.Status = "completed"
		j.OutcomeDigest = sdrsdk.Digest(out)
		j.ResponseID = out.ResponseID
		j.Model = out.Model
		j.InputTokens = out.InputTokens
		j.OutputTokens = out.OutputTokens
		j.CompletedAt = a.now().UTC()
		j.Action = out.Decision.Action
		if a.state.Pipeline.Memory[c.ID] == nil {
			a.state.Pipeline.Memory[c.ID] = map[string]sdrsdk.Fact{}
		}
		for _, f := range out.Decision.Facts {
			seq := 0
			for _, m := range j.Context.History {
				if m.ID == f.MessageID {
					seq = m.Sequence
				}
			}
			old := a.state.Pipeline.Memory[c.ID][f.Key]
			if seq >= old.Sequence {
				a.state.Pipeline.Memory[c.ID][f.Key] = sdrsdk.Fact{Key: f.Key, Value: f.Value, MessageID: f.MessageID, Sequence: seq, ExpiresAt: a.now().Add(90 * 24 * time.Hour)}
			}
		}
		receipt := a.state.ContextReceipts[c.ID]
		if receipt.ID == j.ID {
			receipt.AIEnabled = true
			a.state.ContextReceipts[c.ID] = receipt
		}
		if out.Decision.Action != "opt_out" {
			a.queueQualifiedCRM(c)
		}
		if out.Decision.Action == "reply" {
			message := out.Decision.Message
			if calendarRequest != nil {
				a.storeCalendarRequest(calendarRequest)
				message = "Recebi sua solicitação. Vou conferir a agenda antes de confirmar o resultado."
				if calendarRequest.Status == "waiting_approval" {
					message = "Sua solicitação de agenda ficou aguardando aprovação da equipe. Ainda não é uma reserva confirmada."
				}
			}
			if calendarProblem {
				message = "Não consegui solicitar esse horário agora. Precisamos conferir a disponibilidade e a autorização antes de confirmar."
			}
			m := a.message(c, message, "assistant")
			list := a.state.Messages[c.ID]
			list[len(list)-1].BusinessVersion = j.Context.BusinessVersion
			list[len(list)-1].AIGenerated = true
			a.state.Messages[c.ID] = list
			j.MessageID = m.ID
			a.triggerPlatform(c, j.ID)
			a.state.Tasks = append(a.state.Tasks, Task{Conversation: c.ID, Message: m.ID, Org: c.Org, Generation: j.Context.Generation, Automatic: true, RunID: j.ID})
		} else {
			c.Automation = "human"
			if out.Decision.Action == "opt_out" {
				c.OptedOut = true
				c.Automation = "paused"
			}
			a.state.Generation[c.ID]++
			j.SuggestedResponse = out.Decision.Message
			a.touch(c)
		}
		a.record(AuditEntry{Org: c.Org, Actor: "execution-worker", Action: "execution." + out.Decision.Action, Conversation: c.ID, Operation: j.ID, Revision: j.Context.BusinessVersion})
	})
	if err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, map[string]string{"run_id": j.ID, "status": "completed"})
}
func (a *App) pipelineStatus(u User, c *Conversation) map[string]any {
	health := map[string]any{}
	roles := []string{"context", "execution"}
	if a.calendarEnabled {
		roles = append(roles, "calendar")
	}
	if a.mediaEnabled {
		roles = append(roles, "media")
	}
	for _, role := range roles {
		h := a.workerHealth[role]
		health[role] = map[string]any{"online": !h.At.IsZero() && a.now().Sub(h.At) < 90*time.Second, "last_seen": h.At}
	}
	status := map[string]any{"enabled": a.pipelineEnabled, "ai_enabled": a.pipelineEnabled && a.workerHealth["execution"].Model != "", "workers": health, "delivery": "test_only", "model": a.executionModel, "media_enabled": a.mediaEnabled}
	if a.state.Transport.Policies[u.Org].Enabled && (c == nil || c.Channel == "whatsapp") {
		status["delivery"] = "whatsapp_text_test_contacts"
	}
	if c == nil {
		return status
	}
	label := "idle"
	if c.Automation != "active" || c.OptedOut {
		label = "human"
	}
	if w := a.state.Pipeline.Windows[c.ID]; w != nil {
		if w.Status == "pending" || w.Status == "running" {
			label = "grouping"
			if a.mediaWindowPending(w) {
				label = "reading_media"
			}
		}
		if w.Status == "review" {
			label = "review"
			status["error_code"] = w.Error
		}
	}
	var latest *ExecutionRun
	for _, j := range a.state.Pipeline.Runs {
		if j.Org == u.Org && j.Conversation == c.ID && (latest == nil || j.CreatedAt.After(latest.CreatedAt)) {
			latest = j
		}
	}
	if latest != nil {
		if latest.Status == "queued" || latest.Status == "running" {
			label = "generating"
		}
		if latest.Status == "review" {
			label = "review"
		}
		if latest.Status == "completed" && label == "idle" {
			label = "completed"
		}
		status["last_run"] = map[string]any{"id": latest.ID, "status": latest.Status, "action": latest.Action, "business_version": latest.Context.BusinessVersion, "input_tokens": latest.InputTokens, "output_tokens": latest.OutputTokens, "error_code": latest.Error, "suggested_response": latest.SuggestedResponse}
	}
	facts := []sdrsdk.Fact{}
	for _, f := range a.state.Pipeline.Memory[c.ID] {
		if f.ExpiresAt.After(a.now()) {
			facts = append(facts, f)
		}
	}
	sort.Slice(facts, func(i, j int) bool { return facts[i].Key < facts[j].Key })
	status["memory"] = facts
	status["status"] = label
	return status
}
