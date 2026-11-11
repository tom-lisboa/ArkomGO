package main

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"io"
	"net/http"
	"sdr-next-pilot/internal/calendarworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"slices"
	"sort"
	"strings"
	"time"
)

func (a *App) calendarPrivate(w http.ResponseWriter, r *http.Request) bool {
	if !strings.HasPrefix(r.URL.Path, "/internal/workers/calendar/") {
		return false
	}
	a.mu.Lock()
	expected, exists := a.workerSecrets["calendar"]
	actual := sha256.Sum256([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")))
	if !a.calendarEnabled || !exists || subtle.ConstantTimeCompare(expected[:], actual[:]) != 1 {
		a.mu.Unlock()
		fail(w, 401, "unauthorized")
		return true
	}
	if r.Method != "POST" {
		a.mu.Unlock()
		fail(w, 405, "method_not_allowed")
		return true
	}
	a.workerHealth["calendar"] = WorkerHealth{At: a.now()}
	action := strings.TrimPrefix(r.URL.Path, "/internal/workers/calendar/")
	if action == "claim" {
		a.calendarClaim(w)
		a.mu.Unlock()
		return true
	}
	var b struct {
		ID         string                `json:"id"`
		Lease      string                `json:"lease"`
		Connection string                `json:"connection_id"`
		Result     sdrsdk.CalendarResult `json:"result"`
	}
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10))
	d.DisallowUnknownFields()
	if d.Decode(&b) != nil || d.Decode(new(any)) != io.EOF {
		a.mu.Unlock()
		fail(w, 400, "invalid_json")
		return true
	}
	j := a.state.Calendars.Requests[b.ID]
	if j == nil || b.Lease == "" {
		a.mu.Unlock()
		fail(w, 409, "stale_calendar_request")
		return true
	}
	if action == "complete" && j.CompletedLease == b.Lease && j.ResultDigest == sdrsdk.Digest(b.Result) {
		a.mu.Unlock()
		write(w, 200, map[string]bool{"duplicate": true})
		return true
	}
	if j.Status != "running" || j.Lease != b.Lease || !j.LeaseUntil.After(a.now()) {
		a.mu.Unlock()
		fail(w, 409, "stale_calendar_request")
		return true
	}
	if action == "credential" {
		if !j.EffectStarted && !a.calendarFence(j) {
			a.mu.Unlock()
			fail(w, 409, "calendar_permission_changed")
			return true
		}
		allowed := false
		for _, id := range j.CalendarIDs {
			c := a.state.Calendars.Calendars[id]
			if c != nil && c.Organization == j.Organization && c.Connection == b.Connection {
				allowed = true
			}
		}
		org := j.Organization
		account := a.state.Calendars.Connections[b.Connection]
		if !allowed || a.calendarGoogle == nil || account == nil || account.Organization != org || account.Status != "connected" {
			a.mu.Unlock()
			fail(w, 403, "calendar_connection_unavailable")
			return true
		}
		a.mu.Unlock()
		token, e := a.calendarAccessToken(r.Context(), org, b.Connection)
		a.mu.Lock()
		current := a.state.Calendars.Requests[b.ID]
		account = a.state.Calendars.Connections[b.Connection]
		valid := e == nil && current != nil && current.Status == "running" && current.Lease == b.Lease && current.LeaseUntil.After(a.now()) && account != nil && account.Status == "connected"
		a.mu.Unlock()
		if !valid {
			fail(w, 503, "calendar_connection_unavailable")
			return true
		}
		write(w, 200, map[string]string{"access_token": token})
		return true
	}
	defer a.mu.Unlock()
	if action == "authorize" {
		if j.EffectStarted || !a.calendarFence(j) || j.Input.Kind == "availability" || (j.Input.Kind != "cancel" && !a.calendarSlotFree(j)) {
			fail(w, 409, "calendar_permission_changed")
			return true
		}
		if a.transact(func() {
			j.EffectStarted = true
			a.record(AuditEntry{Org: j.Organization, Actor: "calendar-worker", Action: "calendar.effect.authorized", Operation: j.ID, Conversation: j.Input.ConversationID})
		}) != nil {
			fail(w, 503, "storage_unavailable")
			return true
		}
		write(w, 200, map[string]bool{"authorized": true})
		return true
	}
	if action == "complete" {
		a.calendarComplete(w, j, b.Result)
		return true
	}
	fail(w, 404, "not_found")
	return true
}
func (a *App) calendarClaim(w http.ResponseWriter) {
	if a.expireCalendarRequests() != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	rows := []*CalendarRequest{}
	for _, j := range a.state.Calendars.Requests {
		if j.Status == "queued" || j.Status == "running" && !j.LeaseUntil.After(a.now()) {
			rows = append(rows, j)
		}
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].CreatedAt.Before(rows[j].CreatedAt) })
	if len(rows) == 0 {
		w.WriteHeader(204)
		return
	}
	j := rows[0]
	if !j.EffectStarted && !a.calendarFence(j) {
		if a.transact(func() {
			a.metricEnd("calendar", j.Organization, j.ID, j.Lease, "cancelled")
			j.Status = "cancelled"
			j.Result = sdrsdk.CalendarResult{Status: "cancelled", Error: "calendar_permission_changed"}
			a.record(AuditEntry{Org: j.Organization, Actor: "calendar-worker", Action: "calendar.request.invalidated", Operation: j.ID})
		}) != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
		w.WriteHeader(204)
		return
	}
	if j.Attempts >= 3 {
		if a.transact(func() {
			a.metricEnd("calendar", j.Organization, j.ID, j.Lease, "expired")
			j.Status = "uncertain"
			j.Result = sdrsdk.CalendarResult{Status: "uncertain", Error: "calendar_attempts_exhausted"}
		}) != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
		w.WriteHeader(204)
		return
	}
	refs := []sdrsdk.CalendarRef{}
	busy := map[string][]sdrsdk.CalendarInterval{}
	for _, id := range j.CalendarIDs {
		c := a.state.Calendars.Calendars[id]
		if c == nil || c.Organization != j.Organization {
			fail(w, 409, "calendar_unavailable")
			return
		}
		refs = append(refs, c.CalendarRef)
		busy[id] = a.calendarBusy(id, j.ID, j.Input.BookingID)
	}
	lease := token()
	if a.transact(func() {
		if j.Status == "running" {
			a.metricEnd("calendar", j.Organization, j.ID, j.Lease, "expired")
		}
		j.Status = "running"
		j.Lease = lease
		j.LeaseUntil = a.now().Add(90 * time.Second)
		j.Attempts++
		parents := []string{}
		if j.ParentJob != "" {
			parents = append(parents, j.ParentJob)
		}
		if j.Input.AvailabilityID != "" {
			parents = append(parents, sdrsdk.MetricJob(j.Organization, "calendar", j.Input.AvailabilityID))
		}
		a.metricStart("calendar", j.Organization, j.ID, lease, j.Input.Kind, a.metricMode(j.Input.ConversationID), parents...)
	}) != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, sdrsdk.CalendarJob{ID: j.ID, Organization: j.Organization, Lease: j.Lease, Input: j.Input, Calendars: refs, Busy: busy, Slot: j.Slot, Event: j.Event, Now: a.now().UTC(), Reconcile: j.EffectStarted})
}
func (a *App) calendarComplete(w http.ResponseWriter, j *CalendarRequest, result sdrsdk.CalendarResult) {
	if !slices.Contains([]string{"completed", "confirmed", "cancelled", "failed", "uncertain"}, result.Status) || len(result.Error) > 100 || len(result.Slots) > 200 {
		fail(w, 422, "invalid_calendar_result")
		return
	}
	primary := a.state.Calendars.Calendars[j.CalendarIDs[0]]
	if primary == nil || primary.Organization != j.Organization {
		fail(w, 409, "calendar_unavailable")
		return
	}
	if result.Status == "completed" {
		if j.Input.Kind != "availability" {
			fail(w, 422, "invalid_calendar_result")
			return
		}
		for _, slot := range result.Slots {
			if !slices.Contains(j.CalendarIDs, slot.CalendarID) || len(slot.CheckedIDs) < 1 || len(slot.CheckedIDs) > 8 {
				fail(w, 422, "invalid_calendar_result")
				return
			}
			if slot.ID != "slot_"+sdrsdk.Digest([]any{j.ID, slot.CalendarID, slot.CheckedIDs, slot.Start.UTC(), slot.End.UTC()})[:32] {
				fail(w, 422, "invalid_calendar_result")
				return
			}
			for _, id := range slot.CheckedIDs {
				c := a.state.Calendars.Calendars[id]
				if c == nil || c.Organization != j.Organization || !slices.Contains(j.CalendarIDs, id) || !calendarworker.Allowed(c.Policy, slot.Start, slot.End, j.CreatedAt) {
					fail(w, 422, "invalid_calendar_result")
					return
				}
			}
		}
	}
	writeResult := result.Status == "confirmed" || result.Status == "cancelled" && result.Event != nil
	if writeResult {
		if !j.EffectStarted || result.Event == nil || result.Event.ID != j.Event.ID || result.Event.BookingID != j.Event.BookingID || result.Event.OrganizationHash != j.Event.OrganizationHash || (j.Input.Kind == "cancel") != (result.Status == "cancelled") {
			fail(w, 422, "invalid_calendar_result")
			return
		}
		if j.Slot != nil && (!result.Event.Start.Equal(j.Slot.Start) || !result.Event.End.Equal(j.Slot.End)) {
			fail(w, 422, "invalid_calendar_result")
			return
		}
		if primary.Provider == "google" && result.Status == "confirmed" && result.Event.ETag == "" {
			fail(w, 422, "invalid_calendar_result")
			return
		}
	}
	fence := a.calendarFence(j)
	// Confirmed external effects must remain visible even if a pause or policy
	// change arrived during the provider call. They require review, not erasure.
	if !fence && !(writeResult && primary.Provider == "google") {
		result = sdrsdk.CalendarResult{Status: "cancelled", Error: "calendar_permission_changed"}
		writeResult = false
	}
	if writeResult && primary.Provider == "native" && j.Input.Kind != "cancel" && !a.calendarSlotFree(j) {
		result = sdrsdk.CalendarResult{Status: "failed", Error: "slot_unavailable"}
		writeResult = false
	}
	digest := sdrsdk.Digest(result)
	if a.transact(func() {
		if writeResult {
			b := a.state.Calendars.Bookings[j.Event.BookingID]
			if b == nil {
				b = &CalendarBooking{ID: j.Event.BookingID, Organization: j.Organization, CalendarID: primary.ID, Conversation: j.Input.ConversationID}
				a.state.Calendars.Bookings[b.ID] = b
			}
			b.Revision++
			b.Event = *result.Event
			b.Status = result.Status
			b.UpdatedAt = a.now().UTC()
			b.NeedsReview = !fence
			b.Busy = sdrsdk.CalendarInterval{Start: b.Event.Start.Add(-time.Duration(primary.Policy.BufferBefore) * time.Minute), End: b.Event.End.Add(time.Duration(primary.Policy.BufferAfter) * time.Minute)}
		}
		if result.Error == "calendar_provider_conflict" {
			if b := a.state.Calendars.Bookings[j.Event.BookingID]; b != nil {
				b.NeedsReview = true
			}
		}
		j.Result = result
		j.Status = result.Status
		j.CompletedLease = j.Lease
		j.ResultDigest = digest
		outcome := "completed"
		if result.Status == "failed" {
			outcome = "failed"
		}
		if result.Status == "uncertain" {
			outcome = "uncertain"
		}
		if result.Status == "cancelled" && !writeResult {
			outcome = "cancelled"
		}
		a.metricEnd("calendar", j.Organization, j.ID, j.Lease, outcome)
		a.record(AuditEntry{Org: j.Organization, Actor: "calendar-worker", Action: "calendar.result." + result.Status, Conversation: j.Input.ConversationID, Operation: j.ID, Reason: result.Error})
		if fence {
			a.calendarNotify(j)
		}
	}) != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, map[string]bool{"accepted": true})
}
