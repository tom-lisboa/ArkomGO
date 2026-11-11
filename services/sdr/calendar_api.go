package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sdr-next-pilot/internal/calendarworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"slices"
	"sort"
	"strings"
	"time"
)

func calendarRequestView(j *CalendarRequest) map[string]any {
	return map[string]any{"id": j.ID, "organization_id": j.Organization, "source": j.Source, "status": j.Status, "input": j.Input, "result": j.Result, "created_at": j.CreatedAt, "expires_at": j.ExpiresAt, "effect_started": j.EffectStarted, "approved_by": j.ApprovedBy}
}
func (a *App) calendarHTTP(w http.ResponseWriter, r *http.Request) bool {
	if !strings.HasPrefix(r.URL.Path, "/v1/sdr/calendar/") && r.URL.Path != "/v1/sdr/calendar" {
		return false
	}
	if a.calendarOAuthPublic(w, r) {
		return true
	}
	a.mu.Lock()
	if !pilotCORS(w, r) {
		a.mu.Unlock()
		return true
	}
	if !a.calendarEnabled {
		a.mu.Unlock()
		fail(w, 404, "not_found")
		return true
	}
	h := sha256.Sum256([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")))
	s, ok := a.sessions[hex.EncodeToString(h[:])]
	if !ok || !s.Expires.After(a.now()) {
		a.mu.Unlock()
		fail(w, 401, "unauthorized")
		return true
	}
	u, directoryErr := a.directoryUser(r.Context(), s.User)
	if directoryErr != nil {
		a.mu.Unlock()
		directoryFailure(w, directoryErr)
		return true
	}
	if !a.allow(w, r, []quota{{"calendar-read:" + u.Org + ":" + u.ID, 120, time.Minute}}) {
		a.mu.Unlock()
		return true
	}
	if r.Method == "POST" && u.Role == "viewer" {
		a.mu.Unlock()
		fail(w, 403, "forbidden")
		return true
	}
	if r.Method == "POST" && !a.allow(w, r, []quota{{"calendar-command:" + u.Org, 60, time.Hour / 4}}) {
		a.mu.Unlock()
		return true
	}
	a.mu.Unlock()
	if strings.HasPrefix(r.URL.Path, "/v1/sdr/calendar/google/") {
		a.calendarGoogleHTTP(w, r, u)
		return true
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	path := strings.TrimPrefix(r.URL.Path, "/v1/sdr/calendar")
	if path == "/capabilities" && r.Method == "GET" {
		write(w, 200, map[string]any{"enabled": true, "google_configured": a.calendarGoogle != nil, "can_configure": u.Role == "admin", "can_request": u.Role != "viewer", "providers": []string{"native", "google"}, "multi_calendar_modes": []string{"any", "all"}, "max_calendars": 16, "max_connections": 8, "actions": []string{"availability", "book", "reschedule", "cancel"}})
		return true
	}
	if path == "/calendars" {
		if r.Method == "GET" {
			items := []*ManagedCalendar{}
			for _, c := range a.state.Calendars.Calendars {
				if c.Organization == u.Org {
					items = append(items, c)
				}
			}
			sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })
			write(w, 200, map[string]any{"items": items})
			return true
		}
		if r.Method == "POST" {
			a.calendarConfig(w, r, u, "")
			return true
		}
	}
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 2 && parts[0] == "calendars" && r.Method == "POST" {
		a.calendarConfig(w, r, u, parts[1])
		return true
	}
	if path == "/connections" && r.Method == "GET" {
		items := []*CalendarConnection{}
		for _, c := range a.state.Calendars.Connections {
			if c.Organization == u.Org {
				items = append(items, c)
			}
		}
		write(w, 200, map[string]any{"items": items})
		return true
	}
	if path == "/bookings" && r.Method == "GET" {
		items := []*CalendarBooking{}
		for _, b := range a.state.Calendars.Bookings {
			if b.Organization == u.Org {
				items = append(items, b)
			}
		}
		sort.Slice(items, func(i, j int) bool { return items[i].Event.Start.Before(items[j].Event.Start) })
		write(w, 200, map[string]any{"items": items})
		return true
	}
	if path == "/requests" {
		if r.Method == "GET" {
			items := []map[string]any{}
			rows := []*CalendarRequest{}
			for _, j := range a.state.Calendars.Requests {
				if j.Organization == u.Org {
					rows = append(rows, j)
				}
			}
			sort.Slice(rows, func(i, j int) bool { return rows[i].CreatedAt.After(rows[j].CreatedAt) })
			for _, j := range rows[:min(len(rows), 100)] {
				items = append(items, calendarRequestView(j))
			}
			write(w, 200, map[string]any{"items": items})
			return true
		}
		if r.Method == "POST" {
			var input sdrsdk.CalendarInput
			if !decode(w, r, &input) {
				return true
			}
			j, e := a.newCalendarRequest(u, input, "manual", r.Header.Get("Idempotency-Key"), "")
			if e != nil {
				fail(w, 422, e.Error())
				return true
			}
			if a.state.Calendars.Requests[j.ID] != nil {
				write(w, 202, calendarRequestView(j))
				return true
			}
			if a.transact(func() { a.storeCalendarRequest(j) }) != nil {
				fail(w, 503, "storage_unavailable")
				return true
			}
			write(w, 202, calendarRequestView(j))
			return true
		}
	}
	if len(parts) >= 2 && parts[0] == "requests" {
		j := a.state.Calendars.Requests[parts[1]]
		if j == nil || j.Organization != u.Org {
			fail(w, 404, "not_found")
			return true
		}
		if len(parts) == 2 && r.Method == "GET" {
			write(w, 200, calendarRequestView(j))
			return true
		}
		if len(parts) == 3 && r.Method == "POST" {
			var b struct {
				Action string `json:"action"`
			}
			if !decode(w, r, &b) {
				return true
			}
			if parts[2] != "actions" || !slices.Contains([]string{"approve", "cancel", "reconcile"}, b.Action) {
				fail(w, 422, "invalid_calendar_action")
				return true
			}
			if b.Action == "approve" && (u.Role != "admin" || j.Status != "waiting_approval" || !a.calendarFence(j)) {
				fail(w, 409, "calendar_approval_unavailable")
				return true
			}
			if b.Action == "cancel" && (calendarTerminal(j.Status) || j.EffectStarted) {
				fail(w, 409, "calendar_effect_already_started")
				return true
			}
			if b.Action == "reconcile" && (u.Role != "admin" || j.Status != "uncertain" || !j.EffectStarted) {
				fail(w, 409, "calendar_reconciliation_unavailable")
				return true
			}
			if a.transact(func() {
				switch b.Action {
				case "approve":
					j.Status = "queued"
					j.ApprovedBy = u.ID
					j.ApprovedAt = a.now()
				case "cancel":
					j.Status = "cancelled"
					a.metricEnd("calendar", j.Organization, j.ID, j.Lease, "cancelled")
					j.Lease = ""
				case "reconcile":
					j.Status = "queued"
				}
				a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "calendar." + b.Action, Operation: j.ID})
			}) != nil {
				fail(w, 503, "storage_unavailable")
				return true
			}
			write(w, 200, calendarRequestView(j))
			return true
		}
	}
	fail(w, 404, "not_found")
	return true
}

func (a *App) calendarConfig(w http.ResponseWriter, r *http.Request, u User, id string) {
	if u.Role != "admin" {
		fail(w, 403, "forbidden")
		return
	}
	var b struct {
		Name             string                          `json:"name"`
		Enabled          bool                            `json:"enabled"`
		Policy           sdrsdk.CalendarPolicy           `json:"policy"`
		Agents           map[string]sdrsdk.CalendarGrant `json:"agents"`
		ExpectedRevision int                             `json:"expected_revision"`
	}
	if !decode(w, r, &b) {
		return
	}
	if !textOK(b.Name, 100, true) || calendarworker.ValidatePolicy(b.Policy) != nil || len(b.Agents) > 20 {
		fail(w, 422, "invalid_calendar_policy")
		return
	}
	for name := range b.Agents {
		if name != "sdr" && (!strings.HasPrefix(name, "workflow:") || !coreID.MatchString(strings.TrimPrefix(name, "workflow:"))) || len(name) > 70 {
			fail(w, 422, "invalid_calendar_agent")
			return
		}
		g := b.Agents[name]
		if !g.Read && (g.Book || g.Reschedule || g.Cancel) {
			fail(w, 422, "invalid_calendar_agent_permissions")
			return
		}
	}
	key := r.Header.Get("Idempotency-Key")
	if len(key) < 1 || len(key) > 100 {
		fail(w, 422, "idempotency_key_required")
		return
	}
	rk := "calendar-config:" + u.Org + ":" + u.ID + ":" + id + ":" + key
	fp := fingerprint(b)
	if a.replay(w, rk, fp) {
		return
	}
	var c *ManagedCalendar
	if id == "" {
		count := 0
		for _, v := range a.state.Calendars.Calendars {
			if v.Organization == u.Org {
				count++
			}
		}
		if count >= 16 {
			fail(w, 409, "calendar_limit")
			return
		}
		c = &ManagedCalendar{Organization: u.Org, CalendarRef: sdrsdk.CalendarRef{ID: "calendar_" + token(), Provider: "native", Writable: true}}
		if b.ExpectedRevision != 0 {
			fail(w, 409, "revision_conflict")
			return
		}
	} else {
		old := a.state.Calendars.Calendars[id]
		if old == nil || old.Organization != u.Org {
			fail(w, 404, "not_found")
			return
		}
		if old.Revision != b.ExpectedRevision {
			fail(w, 409, "revision_conflict")
			return
		}
		clone := *old
		c = &clone
	}
	c.Name = b.Name
	if !c.Writable {
		for _, g := range b.Agents {
			if g.Book || g.Reschedule || g.Cancel {
				fail(w, 422, "calendar_read_only")
				return
			}
		}
	}
	c.Enabled = b.Enabled
	c.Policy = b.Policy
	c.Agents = b.Agents
	c.Revision++
	if a.transact(func() {
		a.state.Calendars.Calendars[c.ID] = c
		raw, _ := json.Marshal(c)
		a.state.Results[rk] = result{fp, raw, 200}
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "calendar.configured", Operation: c.ID, Revision: c.Revision})
	}) != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, c)
}

// Explicit projections are reused by GraphQL and the customer's ZIP; tokens and
// OAuth flows stay in private tables and never enter these datasets.
func (a *App) calendarCustomerRecords(org, collection string) ([]customerCalendarRecord, error) {
	out := []customerCalendarRecord{}
	add := func(id, conversation string, at time.Time, v any) {
		raw, _ := json.Marshal(v)
		out = append(out, customerCalendarRecord{ID: id, Conversation: conversation, At: at, Data: raw})
	}
	switch collection {
	case "calendars":
		for id, c := range a.state.Calendars.Calendars {
			if c.Organization == org {
				add(id, "", time.Time{}, c)
			}
		}
	case "calendar_connections":
		for id, c := range a.state.Calendars.Connections {
			if c.Organization == org {
				add(id, "", c.UpdatedAt, c)
			}
		}
	case "calendar_bookings":
		for id, b := range a.state.Calendars.Bookings {
			if b.Organization == org {
				add(id, b.Conversation, b.UpdatedAt, b)
			}
		}
	case "calendar_requests":
		for id, j := range a.state.Calendars.Requests {
			if j.Organization == org {
				add(id, j.Input.ConversationID, j.CreatedAt, calendarRequestView(j))
			}
		}
	}
	return out, nil
}

type customerCalendarRecord struct {
	ID, Conversation string
	At               time.Time
	Data             json.RawMessage
}
