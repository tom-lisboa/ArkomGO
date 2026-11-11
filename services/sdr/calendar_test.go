package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"path/filepath"
	"sdr-next-pilot/internal/calendarworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeCalendarProvider struct {
	BusyFn  func(sdrsdk.CalendarRef) ([]sdrsdk.CalendarInterval, error)
	ApplyFn func(string, sdrsdk.CalendarEvent) (sdrsdk.CalendarEvent, error)
	GetFn   func(string) (sdrsdk.CalendarEvent, error)
}

func (f fakeCalendarProvider) Busy(_ context.Context, c sdrsdk.CalendarRef, _, _ time.Time, _ string) ([]sdrsdk.CalendarInterval, error) {
	if f.BusyFn != nil {
		return f.BusyFn(c)
	}
	return nil, nil
}
func (f fakeCalendarProvider) Apply(_ context.Context, _ sdrsdk.CalendarRef, kind string, e sdrsdk.CalendarEvent) (sdrsdk.CalendarEvent, error) {
	if f.ApplyFn != nil {
		return f.ApplyFn(kind, e)
	}
	e.ETag = "test-etag"
	return e, nil
}
func (f fakeCalendarProvider) Get(_ context.Context, _ sdrsdk.CalendarRef, id string) (sdrsdk.CalendarEvent, error) {
	if f.GetFn != nil {
		return f.GetFn(id)
	}
	return sdrsdk.CalendarEvent{}, calendarworker.ErrNotFound
}

type calFixture struct {
	a                             *App
	creds                         map[string]string
	admin, beta, operator, viewer string
	q                             *sdrsdk.Client
	now                           *time.Time
	worker                        calendarworker.Worker
}

func calendarApp(t *testing.T) *calFixture {
	t.Helper()
	a, creds, e := newApp(filepath.Join(t.TempDir(), "state.sqlite"))
	if e != nil {
		t.Fatal(e)
	}
	now := time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	a.now = func() time.Time { return now }
	a.calendarEnabled = true
	a.workerSecrets = map[string][32]byte{"calendar": sha256.Sum256([]byte(strings.Repeat("c", 48)))}
	server := httptest.NewServer(a.privateWorkers())
	q := &sdrsdk.Client{Base: server.URL, Token: strings.Repeat("c", 48), HTTP: server.Client()}
	f := &calFixture{a: a, creds: creds, q: q, now: &now}
	f.worker = calendarworker.Worker{Queue: q, Provider: func(sdrsdk.CalendarJob) calendarworker.Provider { return fakeCalendarProvider{} }}
	f.admin = login(t, a, creds, "alfa.admin")
	f.beta = login(t, a, creds, "beta.admin")
	f.operator = login(t, a, creds, "alfa.operator")
	f.viewer = login(t, a, creds, "alfa.viewer")
	t.Cleanup(func() { server.Close(); _ = a.Close() })
	return f
}
func calendarPolicy() sdrsdk.CalendarPolicy {
	return sdrsdk.CalendarPolicy{Timezone: "America/Cuiaba", Windows: []sdrsdk.CalendarWindow{{Day: 1, Start: 480, End: 1080}, {Day: 2, Start: 480, End: 1080}, {Day: 3, Start: 480, End: 1080}, {Day: 4, Start: 480, End: 1080}, {Day: 5, Start: 480, End: 1080}}, BlockedDates: []string{}, Durations: []int{30, 60}, Step: 15, Notice: 30, Horizon: 60}
}
func (f *calFixture) create(t *testing.T, tok, name string, p sdrsdk.CalendarPolicy) *ManagedCalendar {
	t.Helper()
	code, out := req(f.a, "POST", "/v1/sdr/calendar/calendars", tok, name, map[string]any{"name": name, "enabled": true, "policy": p, "agents": map[string]sdrsdk.CalendarGrant{"sdr": {Read: true, Book: true, Reschedule: true, Cancel: true}}})
	if code != 200 {
		t.Fatal(code, out)
	}
	return f.a.state.Calendars.Calendars[out["id"].(string)]
}
func (f *calFixture) submit(t *testing.T, tok, key string, in sdrsdk.CalendarInput) *CalendarRequest {
	t.Helper()
	code, out := req(f.a, "POST", "/v1/sdr/calendar/requests", tok, key, in)
	if code != 202 {
		t.Fatal(code, out)
	}
	return f.a.state.Calendars.Requests[out["id"].(string)]
}
func (f *calFixture) once(t *testing.T) {
	t.Helper()
	ok, e := f.worker.Once(context.Background())
	if e != nil || !ok {
		t.Fatal("calendar worker", ok, e)
	}
}
func (f *calFixture) availability(t *testing.T, ids []string, mode string) *CalendarRequest {
	in := sdrsdk.CalendarInput{Kind: "availability", CalendarIDs: ids, Mode: mode, From: f.now.Add(time.Hour), To: f.now.Add(5 * time.Hour), Duration: 30}
	j := f.submit(t, f.admin, token(), in)
	f.once(t)
	if j.Status != "completed" {
		t.Fatal(j.Status, j.Result)
	}
	return j
}

func TestCalendarNativeBookRescheduleCancelAndTenantIsolation(t *testing.T) {
	f := calendarApp(t)
	cal := f.create(t, f.admin, "Alfa agenda", calendarPolicy())
	other := f.create(t, f.beta, "Beta privada", calendarPolicy())
	code, out := req(f.a, "GET", "/v1/sdr/calendar/calendars", f.admin, "", nil)
	if code != 200 || strings.Contains(string(customerTestJSON(out)), other.ID) {
		t.Fatal("calendar listing leaked", code, out)
	}
	if code, _ = req(f.a, "POST", "/v1/sdr/calendar/requests", f.admin, "cross", sdrsdk.CalendarInput{Kind: "availability", CalendarIDs: []string{other.ID}, Mode: "any", From: f.now.Add(time.Hour), To: f.now.Add(2 * time.Hour), Duration: 30}); code != 422 {
		t.Fatal("foreign calendar accepted", code)
	}
	if code, _ = req(f.a, "POST", "/v1/sdr/calendar/calendars", f.operator, "config", map[string]any{}); code != 403 {
		t.Fatal("operator reconfigured", code)
	}
	if code, _ = req(f.a, "POST", "/v1/sdr/calendar/requests", f.viewer, "viewer", map[string]any{}); code != 403 {
		t.Fatal("viewer wrote", code)
	}
	offer := f.availability(t, []string{cal.ID}, "any")
	if len(offer.Result.Slots) == 0 {
		t.Fatal("no slots")
	}
	in := sdrsdk.CalendarInput{Kind: "book", AvailabilityID: offer.ID, SlotID: offer.Result.Slots[0].ID, Summary: "Reunião Alfa"}
	j := f.submit(t, f.operator, "book-one", in)
	again := f.submit(t, f.operator, "book-one", in)
	if j.ID != again.ID {
		t.Fatal("duplicate request")
	}
	if code, _ = req(f.a, "POST", "/v1/sdr/calendar/requests", f.operator, "second", in); code != 422 {
		t.Fatal("slot hold did not block a competitor", code)
	}
	f.once(t)
	if j.Status != "confirmed" {
		t.Fatal(j.Result)
	}
	b := f.a.state.Calendars.Bookings[j.Event.BookingID]
	if b == nil || b.Revision != 1 {
		t.Fatal("reservation not committed")
	}
	if code, _ = req(f.a, "GET", "/v1/sdr/calendar/requests/"+j.ID, f.beta, "", nil); code != 404 {
		t.Fatal("foreign request readable")
	}
	newOffer := f.availability(t, []string{cal.ID}, "any")
	move := f.submit(t, f.admin, "reschedule", sdrsdk.CalendarInput{Kind: "reschedule", AvailabilityID: newOffer.ID, SlotID: newOffer.Result.Slots[0].ID, BookingID: b.ID, ExpectedRevision: 1})
	f.once(t)
	if move.Status != "confirmed" || b.Revision != 2 || b.Event.Start.Equal(j.Result.Event.Start) {
		t.Fatal("reschedule failed", move.Result, b)
	}
	cancel := f.submit(t, f.admin, "cancel", sdrsdk.CalendarInput{Kind: "cancel", BookingID: b.ID, ExpectedRevision: 2})
	f.once(t)
	if cancel.Status != "cancelled" || b.Status != "cancelled" || b.Revision != 3 {
		t.Fatal("cancel failed", cancel.Result, b)
	}
}

func TestCalendarConcurrentClaimsAndApproval(t *testing.T) {
	f := calendarApp(t)
	p := calendarPolicy()
	p.Approval = true
	cal := f.create(t, f.admin, "Approval", p)
	offer := f.availability(t, []string{cal.ID}, "any")
	in := sdrsdk.CalendarInput{Kind: "book", AvailabilityID: offer.ID, SlotID: offer.Result.Slots[0].ID}
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for _, key := range []string{"one", "two"} {
		wg.Add(1)
		go func(key string) {
			defer wg.Done()
			code, _ := req(f.a, "POST", "/v1/sdr/calendar/requests", f.operator, key, in)
			codes <- code
		}(key)
	}
	wg.Wait()
	close(codes)
	success := 0
	for code := range codes {
		if code == 202 {
			success++
		} else if code != 422 {
			t.Fatal(code)
		}
	}
	if success != 1 {
		t.Fatal("concurrent slot acquired twice")
	}
	var j *CalendarRequest
	for _, candidate := range f.a.state.Calendars.Requests {
		if candidate.Input.Kind == "book" {
			j = candidate
		}
	}
	if j == nil || j.Status != "waiting_approval" {
		t.Fatal("approval skipped")
	}
	if _, ok, e := f.q.ClaimCalendar(context.Background()); e != nil || ok {
		t.Fatal("unapproved job was claimed", e)
	}
	path := "/v1/sdr/calendar/requests/" + j.ID + "/actions"
	if code, _ := req(f.a, "POST", path, f.operator, "approve", map[string]string{"action": "approve"}); code != 409 {
		t.Fatal("operator approved", code)
	}
	if code, _ := req(f.a, "POST", path, f.admin, "approve", map[string]string{"action": "approve"}); code != 200 {
		t.Fatal("admin approval", code)
	}
	f.once(t)
	if j.Status != "confirmed" {
		t.Fatal(j.Result)
	}
}

func TestCalendarMultiAgendaAllAnyAndRuleValidation(t *testing.T) {
	f := calendarApp(t)
	p := calendarPolicy()
	p.Windows = []sdrsdk.CalendarWindow{{Day: 1, Start: 540, End: 600}}
	one := f.create(t, f.admin, "One", p)
	p.Windows = []sdrsdk.CalendarWindow{{Day: 1, Start: 600, End: 660}}
	two := f.create(t, f.admin, "Two", p)
	all := f.availability(t, []string{one.ID, two.ID}, "all")
	any := f.availability(t, []string{one.ID, two.ID}, "any")
	if len(all.Result.Slots) != 0 || len(any.Result.Slots) != 6 {
		t.Fatal("multi-calendar semantics", len(all.Result.Slots), len(any.Result.Slots))
	}
	p.BlockedDates = []string{"2026-11-09"}
	if calendarworker.ValidatePolicy(p) != nil {
		t.Fatal("valid blackout")
	}
	if calendarworker.Allowed(p, time.Date(2026, 11, 9, 14, 0, 0, 0, time.UTC), time.Date(2026, 11, 9, 14, 30, 0, 0, time.UTC), *f.now) {
		t.Fatal("blackout ignored")
	}
	p.Windows = append(p.Windows, p.Windows[0])
	if calendarworker.ValidatePolicy(p) == nil {
		t.Fatal("overlapping policy accepted")
	}
}

type calendarQueueHook struct {
	sdrsdk.CalendarQueue
	BeforeAuthorize func()
}

func (q calendarQueueHook) AuthorizeCalendar(ctx context.Context, j sdrsdk.CalendarJob) error {
	if q.BeforeAuthorize != nil {
		q.BeforeAuthorize()
	}
	return q.CalendarQueue.AuthorizeCalendar(ctx, j)
}
func TestCalendarPauseRevokesPendingAgentEffect(t *testing.T) {
	f := calendarApp(t)
	cal := f.create(t, f.admin, "SDR calendar", calendarPolicy())
	conv := f.a.state.Conversations["conv_demo_alfa"]
	input := sdrsdk.CalendarInput{Kind: "availability", CalendarIDs: []string{cal.ID}, Mode: "any", From: f.now.Add(time.Hour), To: f.now.Add(4 * time.Hour), Duration: 30, ConversationID: conv.ID}
	offer, e := f.a.newCalendarRequest(User{ID: "agent:sdr", Org: conv.Org}, input, "sdr", "available", "")
	if e != nil {
		t.Fatal(e)
	}
	if e = f.a.transact(func() { f.a.storeCalendarRequest(offer) }); e != nil {
		t.Fatal(e)
	}
	f.once(t)
	request, e := f.a.newCalendarRequest(User{ID: "agent:sdr", Org: conv.Org}, sdrsdk.CalendarInput{Kind: "book", AvailabilityID: offer.ID, SlotID: offer.Result.Slots[0].ID, ConversationID: conv.ID}, "sdr", "book", "")
	if e != nil {
		t.Fatal(e)
	}
	_ = f.a.transact(func() { f.a.storeCalendarRequest(request) })
	f.worker.Queue = calendarQueueHook{CalendarQueue: f.q, BeforeAuthorize: func() {
		f.a.mu.Lock()
		defer f.a.mu.Unlock()
		conv.Automation = "human"
		f.a.state.Generation[conv.ID]++
	}}
	f.once(t)
	if request.Status != "cancelled" || len(f.a.state.Calendars.Bookings) != 0 {
		t.Fatal("pause did not revoke native reservation", request.Result)
	}
}

func TestCalendarGoogleUncertainResultOnlyReconciles(t *testing.T) {
	f := calendarApp(t)
	cal := f.create(t, f.admin, "Google mocked", calendarPolicy())
	cal.Provider = "google"
	cal.Connection = "account"
	cal.ExternalID = "calendar@example.test"
	f.a.state.Calendars.Connections["account"] = &CalendarConnection{ID: "account", Organization: "org_demo_alfa", Mode: "write", Status: "connected"}
	provider := fakeCalendarProvider{}
	f.worker.Provider = func(sdrsdk.CalendarJob) calendarworker.Provider { return provider }
	offer := f.availability(t, []string{cal.ID}, "any")
	j := f.submit(t, f.admin, "google-book", sdrsdk.CalendarInput{Kind: "book", AvailabilityID: offer.ID, SlotID: offer.Result.Slots[0].ID})
	writes := 0
	var created sdrsdk.CalendarEvent
	provider.ApplyFn = func(_ string, event sdrsdk.CalendarEvent) (sdrsdk.CalendarEvent, error) {
		writes++
		created = event
		created.ETag = "confirmed-remotely"
		return event, calendarworker.ErrUncertain
	}
	f.once(t)
	if j.Status != "uncertain" || len(f.a.state.Calendars.Bookings) != 0 {
		t.Fatal("uncertain write falsely confirmed", j.Result)
	}
	if _, ok, e := f.q.ClaimCalendar(context.Background()); ok || e != nil {
		t.Fatal("uncertain write retried automatically", e)
	}
	provider.GetFn = func(string) (sdrsdk.CalendarEvent, error) { return created, nil }
	if code, _ := req(f.a, "POST", "/v1/sdr/calendar/requests/"+j.ID+"/actions", f.admin, "reconcile", map[string]string{"action": "reconcile"}); code != 200 {
		t.Fatal(code)
	}
	f.once(t)
	if j.Status != "confirmed" || writes != 1 || len(f.a.state.Calendars.Bookings) != 1 {
		t.Fatal("reconcile duplicated effect", j.Result, writes)
	}
}

func TestCalendarFailedQueriesNeverBecomeFreeSlotsAndRollback(t *testing.T) {
	f := calendarApp(t)
	cal := f.create(t, f.admin, "Unavailable", calendarPolicy())
	cal.Provider = "google"
	cal.Connection = "account"
	f.a.state.Calendars.Connections["account"] = &CalendarConnection{ID: "account", Organization: cal.Organization, Status: "connected"}
	f.worker.Provider = func(sdrsdk.CalendarJob) calendarworker.Provider {
		return fakeCalendarProvider{BusyFn: func(sdrsdk.CalendarRef) ([]sdrsdk.CalendarInterval, error) { return nil, errors.New("offline") }}
	}
	j := f.submit(t, f.admin, "busy-error", sdrsdk.CalendarInput{Kind: "availability", CalendarIDs: []string{cal.ID}, From: f.now.Add(time.Hour), To: f.now.Add(4 * time.Hour), Duration: 30})
	f.once(t)
	if j.Status != "failed" || len(j.Result.Slots) != 0 || j.Result.Error != "calendar_unavailable" {
		t.Fatal("provider failure became availability", j.Result)
	}
	f.a.failSave = true
	code, _ := req(f.a, "POST", "/v1/sdr/calendar/requests", f.admin, "rollback", sdrsdk.CalendarInput{Kind: "availability", CalendarIDs: []string{cal.ID}, From: f.now.Add(time.Hour), To: f.now.Add(4 * time.Hour), Duration: 30})
	f.a.failSave = false
	if code != 503 || len(f.a.state.Calendars.Requests) != 1 {
		t.Fatal("calendar mutation did not roll back", code)
	}
}

func TestCalendarRestartKeepsConfirmedBookingsAndScopedExports(t *testing.T) {
	f := calendarApp(t)
	cal := f.create(t, f.admin, "Keep booking", calendarPolicy())
	offer := f.availability(t, []string{cal.ID}, "any")
	j := f.submit(t, f.admin, "book", sdrsdk.CalendarInput{Kind: "book", AvailabilityID: offer.ID, SlotID: offer.Result.Slots[0].ID})
	f.once(t)
	for _, collection := range []string{"calendars", "calendar_connections", "calendar_bookings", "calendar_requests"} {
		records, e := f.a.customerRecords("org_demo_beta", collection)
		if e != nil || len(records) != 0 {
			t.Fatal("calendar export scope", collection, e)
		}
		records, e = f.a.customerRecords("org_demo_alfa", collection)
		if e != nil {
			t.Fatal(e)
		}
		raw, _ := json.Marshal(records)
		if strings.Contains(string(raw), j.Lease) {
			t.Fatal("worker lease in customer export")
		}
	}
	file := f.a.file
	_ = f.a.Close()
	restarted, _, e := newApp(file)
	if e != nil {
		t.Fatal(e)
	}
	defer restarted.Close()
	if restarted.state.Calendars.Bookings[j.Event.BookingID] == nil {
		t.Fatal("booking lost at restart")
	}
}
