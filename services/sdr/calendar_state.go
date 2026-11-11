package main

import (
	"errors"
	"sdr-next-pilot/internal/calendarworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"slices"
	"time"
)

type ManagedCalendar struct {
	Organization string                          `json:"organization_id"`
	Revision     int                             `json:"revision"`
	Enabled      bool                            `json:"enabled"`
	Agents       map[string]sdrsdk.CalendarGrant `json:"agents"`
	sdrsdk.CalendarRef
}
type CalendarConnection struct {
	ID           string    `json:"id"`
	Organization string    `json:"organization_id"`
	Label        string    `json:"label"`
	Mode         string    `json:"mode"`
	Status       string    `json:"status"`
	Scopes       []string  `json:"scopes"`
	UpdatedAt    time.Time `json:"updated_at"`
}
type CalendarBooking struct {
	ID           string                  `json:"id"`
	Organization string                  `json:"organization_id"`
	CalendarID   string                  `json:"calendar_id"`
	Conversation string                  `json:"conversation_id"`
	Revision     int                     `json:"revision"`
	Status       string                  `json:"status"`
	Event        sdrsdk.CalendarEvent    `json:"event"`
	Busy         sdrsdk.CalendarInterval `json:"busy"`
	UpdatedAt    time.Time               `json:"updated_at"`
	NeedsReview  bool                    `json:"needs_review"`
}
type CalendarRequest struct {
	ID, Organization, Actor, Source, KeyHash, Fingerprint, Status, Lease, CompletedLease, ResultDigest string
	Input                                                                                              sdrsdk.CalendarInput
	CalendarIDs                                                                                        []string
	Revisions                                                                                          map[string]int
	Slot                                                                                               *sdrsdk.CalendarSlot
	Event                                                                                              sdrsdk.CalendarEvent
	Result                                                                                             sdrsdk.CalendarResult
	Generation, InputVersion, Attempts                                                                 int
	EffectStarted                                                                                      bool
	CreatedAt, ExpiresAt, LeaseUntil, ApprovedAt                                                       time.Time
	ApprovedBy, ParentJob                                                                              string
}
type CalendarState struct {
	Calendars   map[string]*ManagedCalendar
	Connections map[string]*CalendarConnection
	Bookings    map[string]*CalendarBooking
	Requests    map[string]*CalendarRequest
}

func (a *App) initCalendars() error {
	c := &a.state.Calendars
	if c.Calendars == nil {
		c.Calendars = map[string]*ManagedCalendar{}
	}
	if c.Connections == nil {
		c.Connections = map[string]*CalendarConnection{}
	}
	if c.Bookings == nil {
		c.Bookings = map[string]*CalendarBooking{}
	}
	if c.Requests == nil {
		c.Requests = map[string]*CalendarRequest{}
	}
	if a.db != nil {
		_, e := a.db.Exec(`CREATE TABLE IF NOT EXISTS calendar_google_tokens(organization_id TEXT NOT NULL,connection_id TEXT NOT NULL,ciphertext BLOB NOT NULL,PRIMARY KEY(organization_id,connection_id));
CREATE TABLE IF NOT EXISTS calendar_oauth_flows(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,actor_id TEXT NOT NULL,session_hash TEXT NOT NULL,label TEXT NOT NULL,mode TEXT NOT NULL,origin TEXT NOT NULL DEFAULT '',ticket_hash TEXT NOT NULL UNIQUE,state_hash TEXT NOT NULL UNIQUE,cookie_hash TEXT NOT NULL DEFAULT '',verifier BLOB NOT NULL,expires_at INTEGER NOT NULL,status TEXT NOT NULL,connection_id TEXT NOT NULL DEFAULT '');`)
		if e != nil {
			return e
		}
		rows, e := a.db.Query("PRAGMA table_info(calendar_oauth_flows)")
		if e != nil {
			return e
		}
		hasOrigin := false
		for rows.Next() {
			var seq, notnull, pk int
			var name, kind string
			var fallback any
			if e = rows.Scan(&seq, &name, &kind, &notnull, &fallback, &pk); e != nil {
				rows.Close()
				return e
			}
			hasOrigin = hasOrigin || name == "origin"
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return e
		}
		if !hasOrigin {
			_, e = a.db.Exec("ALTER TABLE calendar_oauth_flows ADD COLUMN origin TEXT NOT NULL DEFAULT ''")
		}
		return e
	}
	return nil
}
func calendarTerminal(s string) bool {
	return slices.Contains([]string{"completed", "confirmed", "cancelled", "failed"}, s)
}
func (a *App) expireCalendarRequests() error {
	due := []*CalendarRequest{}
	for _, j := range a.state.Calendars.Requests {
		if !calendarTerminal(j.Status) && !j.EffectStarted && !j.ExpiresAt.After(a.now()) {
			due = append(due, j)
		}
	}
	if len(due) == 0 {
		return nil
	}
	return a.transact(func() {
		for _, j := range due {
			a.metricEnd("calendar", j.Organization, j.ID, j.Lease, "expired")
			j.Status = "cancelled"
			j.Result = sdrsdk.CalendarResult{Status: "cancelled", Error: "calendar_request_expired"}
			a.record(AuditEntry{Org: j.Organization, Actor: "calendar-worker", Action: "calendar.request.expired", Operation: j.ID})
		}
	})
}
func (a *App) calendarFence(j *CalendarRequest) bool {
	if !a.calendarEnabled || !j.ExpiresAt.After(a.now()) {
		return false
	}
	for index, id := range j.CalendarIDs {
		c := a.state.Calendars.Calendars[id]
		if c == nil || c.Organization != j.Organization || !c.Enabled || c.Revision != j.Revisions[id] {
			return false
		}
		if c.Provider == "google" {
			account := a.state.Calendars.Connections[c.Connection]
			if account == nil || account.Organization != j.Organization || account.Status != "connected" {
				return false
			}
		}
		if j.Source != "manual" {
			g := c.Agents[j.Source]
			if !g.Read || index == 0 && ((j.Input.Kind == "book" && !g.Book) || (j.Input.Kind == "reschedule" && !g.Reschedule) || (j.Input.Kind == "cancel" && !g.Cancel)) {
				return false
			}
		}
	}
	if j.Source != "manual" && j.Input.ConversationID != "" {
		c := a.state.Conversations[j.Input.ConversationID]
		if c == nil || c.Org != j.Organization || c.Automation != "active" || c.OptedOut || a.state.Generation[c.ID] != j.Generation || c.InputVersion != j.InputVersion {
			return false
		}
	}
	if j.Input.BookingID != "" {
		b := a.state.Calendars.Bookings[j.Input.BookingID]
		if b == nil || b.Organization != j.Organization || b.Revision != j.Input.ExpectedRevision || b.Status != "confirmed" {
			return false
		}
	}
	return true
}
func (a *App) newCalendarRequest(u User, input sdrsdk.CalendarInput, source, key, parent string) (*CalendarRequest, error) {
	bad := func(code string) (*CalendarRequest, error) { return nil, errors.New(code) }
	if !a.calendarEnabled {
		return bad("calendar_not_enabled")
	}
	if !slices.Contains([]string{"availability", "book", "reschedule", "cancel"}, input.Kind) || len(key) < 1 || len(key) > 100 || !textOK(input.Summary, 200, false) {
		return bad("invalid_calendar_request")
	}
	if input.Mode == "" {
		input.Mode = "any"
	}
	if input.Kind == "availability" && (len(input.CalendarIDs) < 1 || len(input.CalendarIDs) > 8 || !input.To.After(input.From) || input.To.Sub(input.From) > 31*24*time.Hour || input.From.Before(a.now().Add(-time.Minute)) || input.Duration < 5 || input.Duration > 240 || !slices.Contains([]string{"all", "any"}, input.Mode)) {
		return bad("invalid_availability_query")
	}
	keyHash := fingerprint([]string{u.Org, u.ID, source, key})
	fp := fingerprint(input)
	for _, j := range a.state.Calendars.Requests {
		if j.Organization == u.Org && j.KeyHash == keyHash {
			if j.Fingerprint != fp {
				return bad("idempotency_conflict")
			}
			return j, nil
		}
	}
	active := 0
	total := 0
	for _, j := range a.state.Calendars.Requests {
		if j.Organization == u.Org {
			total++
			if !calendarTerminal(j.Status) && j.ExpiresAt.After(a.now()) {
				active++
			}
		}
	}
	if total >= 1000 || active >= 20 {
		return bad("calendar_request_limit")
	}
	if input.ConversationID != "" {
		c := a.state.Conversations[input.ConversationID]
		if c == nil || c.Org != u.Org {
			return bad("target_unavailable")
		}
	}
	if source != "manual" && input.ConversationID == "" {
		return bad("conversation_required")
	}
	var slot *sdrsdk.CalendarSlot
	ids := slices.Clone(input.CalendarIDs)
	if input.Kind == "book" || input.Kind == "reschedule" {
		offer := a.state.Calendars.Requests[input.AvailabilityID]
		if offer == nil || offer.Organization != u.Org || offer.Status != "completed" || offer.Input.Kind != "availability" || offer.CreatedAt.Add(10*time.Minute).Before(a.now()) || source != "manual" && offer.Input.ConversationID != input.ConversationID {
			return bad("availability_expired")
		}
		for _, s := range offer.Result.Slots {
			if s.ID == input.SlotID {
				v := s
				slot = &v
				ids = slices.Clone(s.CheckedIDs)
				break
			}
		}
		if slot == nil {
			return bad("slot_unavailable")
		}
		if input.Kind == "reschedule" {
			b := a.state.Calendars.Bookings[input.BookingID]
			if b == nil || b.Organization != u.Org || b.CalendarID != slot.CalendarID {
				return bad("booking_unavailable")
			}
		}
	}
	var event sdrsdk.CalendarEvent
	if input.Kind == "availability" && input.BookingID != "" {
		b := a.state.Calendars.Bookings[input.BookingID]
		if b == nil || b.Organization != u.Org || b.Status != "confirmed" || b.Revision != input.ExpectedRevision || len(ids) == 0 || ids[0] != b.CalendarID || source != "manual" && b.Conversation != input.ConversationID {
			return bad("booking_unavailable")
		}
		event = b.Event
	}
	if input.Kind == "cancel" || input.Kind == "reschedule" {
		b := a.state.Calendars.Bookings[input.BookingID]
		if b == nil || b.Organization != u.Org || b.Status != "confirmed" || b.Revision != input.ExpectedRevision || source != "manual" && b.Conversation != input.ConversationID {
			return bad("booking_unavailable")
		}
		if input.Kind == "cancel" {
			ids = []string{b.CalendarID}
		}
		event = b.Event
		for _, j := range a.state.Calendars.Requests {
			if j.Organization == u.Org && j.Input.BookingID == b.ID && !calendarTerminal(j.Status) {
				return bad("booking_in_progress")
			}
		}
	}
	if len(ids) < 1 || len(ids) > 8 {
		return bad("invalid_calendar_request")
	}
	seen := map[string]bool{}
	revisions := map[string]int{}
	approval := false
	for index, id := range ids {
		c := a.state.Calendars.Calendars[id]
		if c == nil || c.Organization != u.Org || !c.Enabled || seen[id] {
			return bad("calendar_unavailable")
		}
		seen[id] = true
		revisions[id] = c.Revision
		if calendarworker.ValidatePolicy(c.Policy) != nil {
			return bad("invalid_calendar_policy")
		}
		if input.Kind != "availability" && index == 0 && !c.Writable {
			return bad("calendar_read_only")
		}
		if source != "manual" {
			grant := c.Agents[source]
			if !grant.Read || index == 0 && ((input.Kind == "book" && !grant.Book) || (input.Kind == "reschedule" && !grant.Reschedule) || (input.Kind == "cancel" && !grant.Cancel)) {
				return bad("calendar_agent_not_allowed")
			}
		}
		approval = approval || c.Policy.Approval
	}
	id := "calreq_" + token()
	if input.Kind == "book" {
		bookingID := "booking_" + token()
		event = sdrsdk.CalendarEvent{ID: sdrsdk.Digest([]string{u.Org, bookingID})[:48], BookingID: bookingID, OrganizationHash: sdrsdk.Digest(u.Org)[:32], Summary: input.Summary}
	}
	j := &CalendarRequest{ID: id, Organization: u.Org, Actor: u.ID, Source: source, KeyHash: keyHash, Fingerprint: fp, Status: "queued", Input: input, CalendarIDs: ids, Revisions: revisions, Slot: slot, Event: event, CreatedAt: a.now().UTC(), ExpiresAt: a.now().Add(15 * time.Minute).UTC(), ParentJob: parent}
	if source != "manual" && input.ConversationID != "" {
		c := a.state.Conversations[input.ConversationID]
		j.Generation = a.state.Generation[c.ID]
		j.InputVersion = c.InputVersion
		if !a.calendarFence(j) {
			return bad("calendar_permission_changed")
		}
	}
	if input.Kind != "availability" && approval {
		j.Status = "waiting_approval"
	}
	if input.Kind != "availability" && input.Kind != "cancel" && !a.calendarSlotFree(j) {
		return bad("slot_unavailable")
	}
	return j, nil
}
func (a *App) calendarBusy(id, excludeJob, excludeBooking string) []sdrsdk.CalendarInterval {
	busy := []sdrsdk.CalendarInterval{}
	owner := ""
	if c := a.state.Calendars.Calendars[id]; c != nil {
		owner = c.Organization
	}
	for bid, b := range a.state.Calendars.Bookings {
		if b.Organization == owner && bid != excludeBooking && b.CalendarID == id && b.Status == "confirmed" {
			busy = append(busy, b.Busy)
		}
	}
	for jid, j := range a.state.Calendars.Requests {
		if j.Organization != owner || jid == excludeJob || j.Slot == nil || j.Input.Kind == "availability" || calendarTerminal(j.Status) || (!j.ExpiresAt.After(a.now()) && !j.EffectStarted) || !slices.Contains(j.CalendarIDs, id) {
			continue
		}
		c := a.state.Calendars.Calendars[id]
		if c != nil {
			busy = append(busy, sdrsdk.CalendarInterval{Start: j.Slot.Start.Add(-time.Duration(c.Policy.BufferBefore) * time.Minute), End: j.Slot.End.Add(time.Duration(c.Policy.BufferAfter) * time.Minute)})
		}
	}
	return busy
}
func (a *App) calendarSlotFree(j *CalendarRequest) bool {
	if j.Slot == nil {
		return false
	}
	for _, id := range j.CalendarIDs {
		c := a.state.Calendars.Calendars[id]
		if c == nil || c.Organization != j.Organization || !calendarworker.Fits(c.CalendarRef, j.Slot.Start, j.Slot.End, a.now(), a.calendarBusy(id, j.ID, j.Input.BookingID)) {
			return false
		}
	}
	return true
}
func (a *App) storeCalendarRequest(j *CalendarRequest) {
	a.state.Calendars.Requests[j.ID] = j
	a.record(AuditEntry{Org: j.Organization, Actor: j.Actor, Action: "calendar.request." + j.Input.Kind, Conversation: j.Input.ConversationID, Operation: j.ID})
}
