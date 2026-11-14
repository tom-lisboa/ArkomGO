package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"sdr-next-pilot/pkg/sdrsdk"
	"sort"
	"strings"
	"time"
)

const followupPath = "v1/sdr/followups"
const followupLifetime = 30 * 24 * time.Hour

type followupJob struct {
	ID, Org, Actor, Conversation, Text, Status, Reason, Message string
	Created, Due, Expires, Updated                              time.Time
	Generation, InputVersion, Sequence, BusinessVersion         int
}

func (a *App) followupView(j *followupJob) map[string]any {
	status := j.Status
	if j.Message != "" {
		if message, ok := a.followupMessage(j); ok {
			status = message.Status
		}
	}
	return map[string]any{"id": j.ID, "conversation_id": j.Conversation, "text": j.Text, "status": status,
		"reason": j.Reason, "due_at": j.Due, "created_at": j.Created, "message_id": j.Message}
}

func (a *App) followupHTTP(w http.ResponseWriter, r *http.Request, u User, path string) bool {
	if path != followupPath && !strings.HasPrefix(path, followupPath+"/") {
		return false
	}
	if _, enabled := a.workerSecrets["followup"]; !enabled {
		fail(w, http.StatusNotFound, "not_found")
		return true
	}
	switch {
	case path == followupPath && r.Method == "GET":
		rows := []*followupJob{}
		for _, j := range a.state.Followups {
			if j.Org == u.Org {
				rows = append(rows, j)
			}
		}
		sort.Slice(rows, func(left, right int) bool { return rows[left].Created.After(rows[right].Created) })
		items := []map[string]any{}
		for _, j := range rows[:min(100, len(rows))] {
			items = append(items, a.followupView(j))
		}
		health := a.workerHealth["followup"]
		write(w, 200, map[string]any{"items": items, "online": !health.At.IsZero() && a.now().Sub(health.At) < 30*time.Second})
	case path == followupPath && r.Method == "POST":
		if u.Role == "viewer" {
			fail(w, 403, "forbidden")
			break
		}
		a.scheduleFollowup(w, r, u)
	default:
		id, cancel := strings.CutSuffix(strings.TrimPrefix(path, followupPath+"/"), "/cancel")
		j := a.state.Followups[id]
		if j == nil || j.Org != u.Org {
			fail(w, 404, "not_found")
		} else if !cancel && r.Method == "GET" {
			write(w, 200, a.followupView(j))
		} else if cancel && r.Method == "POST" && u.Role != "viewer" {
			a.cancelFollowup(w, r, u, j)
		} else {
			fail(w, 403, "forbidden")
		}
	}
	return true
}

func (a *App) scheduleFollowup(w http.ResponseWriter, r *http.Request, u User) {
	var in struct {
		Conversation string    `json:"conversation_id"`
		Text         string    `json:"text"`
		Due          time.Time `json:"due_at"`
	}
	if !decodeCore(w, r, &in) {
		return
	}
	key, now := r.Header.Get("Idempotency-Key"), a.now().UTC()
	in.Text = strings.TrimSpace(in.Text)
	if key == "" || len(key) > 100 || !textOK(in.Text, 1000, true) {
		fail(w, 422, "followup_invalid")
		return
	}
	replayKey := "followup:" + u.Org + ":" + u.ID + ":" + key
	fp := fingerprint(in)
	if a.replay(w, replayKey, fp) {
		return
	}
	if in.Due.Before(now.Add(time.Second)) || in.Due.After(now.Add(7*24*time.Hour)) {
		fail(w, 422, "followup_invalid")
		return
	}
	c := a.state.Conversations[in.Conversation]
	if c == nil || c.Org != u.Org {
		fail(w, 404, "not_found")
		return
	}
	current, available := a.solutionBusiness(u.Org, "sdr", 0)
	if !available || c.Automation != "active" || c.OptedOut {
		fail(w, 409, "followup_unavailable")
		return
	}
	if c.Channel == "whatsapp" {
		binding := a.state.Transport.Bindings[c.ID]
		if binding.Org != c.Org || !allowsReal(a.state.Transport.Policies[c.Org], binding.Epoch, binding.Target) ||
			!a.followupWindow(c, in.Due) {
			fail(w, 409, "followup_outside_window")
			return
		}
	} else if c.Channel != "fake_whatsapp" {
		fail(w, 409, "followup_unavailable")
		return
	}
	pending := 0
	for _, j := range a.state.Followups {
		if j.Org == c.Org && j.Status == "scheduled" {
			if j.Conversation == c.ID {
				fail(w, 409, "followup_already_scheduled")
				return
			}
			pending++
		}
	}
	if pending >= 100 {
		fail(w, 429, "followup_limit")
		return
	}
	j := &followupJob{ID: token(), Actor: u.ID, Org: c.Org, Conversation: c.ID, Text: in.Text,
		Status: "scheduled", Created: now, Updated: now, Due: in.Due.UTC(), Expires: in.Due.Add(15 * time.Minute).UTC(),
		Generation: a.state.Generation[c.ID], InputVersion: c.InputVersion, Sequence: len(a.state.Messages[c.ID]), BusinessVersion: current.Version}
	if err := a.transact(func() {
		if a.state.Followups == nil {
			a.state.Followups = make(map[string]*followupJob)
		}
		a.state.Followups[j.ID] = j
		raw, _ := json.Marshal(a.followupView(j))
		a.state.Results[replayKey] = result{fp, raw, http.StatusAccepted}
		a.record(AuditEntry{Org: c.Org, Actor: u.ID, Action: "followup.scheduled", Conversation: c.ID, Operation: j.ID})
	}); err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 202, a.followupView(j))
}

func (a *App) followupMessage(j *followupJob) (*Message, bool) {
	for i := range a.state.Messages[j.Conversation] {
		message := &a.state.Messages[j.Conversation][i]
		if message.ID == j.Message {
			return message, true
		}
	}
	return nil, false
}

func (a *App) cancelFollowup(w http.ResponseWriter, r *http.Request, u User, j *followupJob) {
	msg, exists := a.followupMessage(j)
	if j.Status == "cancelled" || exists && msg.Status == "cancelled" {
		write(w, 200, a.followupView(j))
		return
	}
	if j.Status != "scheduled" && (!exists || msg.Status != "queued") {
		fail(w, 409, "followup_already_processed")
		return
	}
	if err := a.transact(func() {
		j.Status, j.Reason, j.Updated = "cancelled", "operator_cancelled", a.now().UTC()
		if exists {
			msg.Status = "cancelled"
			if conversation := a.state.Conversations[j.Conversation]; conversation != nil {
				a.touch(conversation)
				a.event(conversation, "message.updated", msg.ID)
			}
		}
		a.record(AuditEntry{Org: j.Org, Actor: u.ID, Action: "followup.cancelled", Conversation: j.Conversation, Operation: j.ID})
	}); err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, a.followupView(j))
}

func (a *App) followupWindow(c *Conversation, at time.Time) bool {
	var latest time.Time
	for _, message := range a.state.Messages[c.ID] {
		if message.Direction == "inbound" && message.Status == "received" &&
			!message.Created.After(a.now()) && message.Created.After(latest) {
			latest = message.Created
		}
	}
	return !latest.IsZero() && at.Before(latest.Add(23*time.Hour))
}

func (a *App) followupReason(c *Conversation, j *followupJob, now time.Time) string {
	if c == nil || c.Org != j.Org || c.OptedOut || c.Automation != "active" ||
		a.state.Generation[j.Conversation] != j.Generation || c.InputVersion != j.InputVersion {
		return "conversation_changed"
	}
	for _, m := range a.state.Messages[c.ID][min(j.Sequence, len(a.state.Messages[c.ID])):] {
		if m.Direction == "inbound" || m.Author == "human" {
			return "conversation_changed"
		}
	}
	business, ok := a.solutionBusiness(c.Org, "sdr", 0)
	if !ok || j.BusinessVersion != business.Version {
		return "business_changed"
	}
	if c.Channel == "whatsapp" {
		binding := a.state.Transport.Bindings[c.ID]
		if binding.Org != c.Org || !allowsReal(a.state.Transport.Policies[c.Org], binding.Epoch, binding.Target) || !a.followupWindow(c, now) {
			return "whatsapp_window_closed"
		}
	}
	return ""
}

// The API owns SQLite. Each poll finishes at most one due job atomically by
// cancelling it or writing to the existing outbox. A retry cannot queue twice.
func (a *App) followupPrivate(w http.ResponseWriter, r *http.Request) bool {
	if r.URL.Path != "/internal/workers/followup/process" {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	expected, enabled := a.workerSecrets["followup"]
	actual := sha256.Sum256([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")))
	if r.Method != "POST" || !enabled || subtle.ConstantTimeCompare(actual[:], expected[:]) != 1 {
		fail(w, 401, "unauthorized")
		return true
	}
	now := a.now().UTC()
	a.workerHealth["followup"] = WorkerHealth{At: now}
	var next *followupJob
	var retired []string
	for _, j := range a.state.Followups {
		if j.Status == "scheduled" && !now.Before(j.Due) && (next == nil || j.Due.Before(next.Due)) {
			next = j
		} else if j.Status != "scheduled" && now.Sub(j.Updated) > followupLifetime {
			retired = append(retired, j.ID)
		}
	}
	if next == nil && len(retired) == 0 {
		w.WriteHeader(204)
		return true
	}
	if err := a.transact(func() {
		for _, id := range retired {
			delete(a.state.Followups, id)
		}
		if next == nil {
			return
		}
		a.applyFollowup(next, now)
	}); err != nil {
		fail(w, 503, "storage_unavailable")
		return true
	}
	write(w, 200, struct{}{})
	return true
}

func (a *App) applyFollowup(j *followupJob, now time.Time) {
	c := a.state.Conversations[j.Conversation]
	a.metricStart("followup", j.Org, j.ID, "outbox", "followup", a.metricMode(j.Conversation))
	j.Status, j.Reason, j.Updated = "cancelled", a.followupReason(c, j, now), now
	outcome := "cancelled"
	switch {
	case !now.Before(j.Expires):
		j.Status, j.Reason, outcome = "expired", "schedule_expired", "expired"
	case j.Reason == "":
		m := a.message(c, j.Text, "assistant")
		list := a.state.Messages[c.ID]
		list[len(list)-1].BusinessVersion = j.BusinessVersion
		list[len(list)-1].FollowupID = j.ID
		a.state.Tasks = append(a.state.Tasks, Task{Conversation: c.ID, Message: m.ID, Org: j.Org, Generation: j.Generation, Automatic: true})
		j.Status, j.Message, outcome = "queued", m.ID, "completed"
	}
	a.metricEnd("followup", j.Org, j.ID, "outbox", outcome)
	a.record(AuditEntry{Org: j.Org, Actor: "followup-worker", Action: "followup." + j.Status, Conversation: j.Conversation, Operation: j.ID, Reason: j.Reason})
}

func runFollowupWorker(ctx context.Context, client *sdrsdk.Client) bool {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return true
		case <-ticker.C:
			run, cancel := context.WithTimeout(ctx, 5*time.Second)
			for count := 0; count < 20; count++ {
				processed, err := client.ProcessFollowup(run)
				if err != nil || !processed {
					break
				}
			}
			cancel()
		}
	}
}
