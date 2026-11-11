package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"arkom/bia/internal/httpapi"
	"arkom/bia/internal/providers"
	"arkom/bia/internal/schedulingworker"
)

func TestClickMaxPublicBookingDrivesRemindersWithoutSellerOAuth(t *testing.T) {
	ctx := context.Background()
	db := setup(t)
	now := time.Now().UTC().Truncate(time.Second)
	since := now.Add(-time.Hour)
	const pipeline = "9bd7a27b-0228-4f55-83ce-cc79dd624c6f"
	const schedule = "2901efd1-827b-4a88-baec-0a0d20176c62"
	const bookingPage = "https://app.clickmax.io/book/projeto-de-zambinati/call-estrategica-arkom"
	const meetingRoom = "https://meet.clickmax.io/test-room"
	lead := testState("clickmax-public-lead", now.Add(-5*time.Minute))
	lead.Profile.Phone = "+5577999749058"
	lead.Profile.SMSConsent, lead.Profile.SMSPhone = true, lead.Profile.Phone
	publishEffects(t, db, "seed-public-clickmax", lead)
	p := policy()
	p.ClickMaxPublicBooking, p.SchedulingURL = true, bookingPage
	p.MeetingReminders, p.MeetingStart, p.SMSReminders = true, true, true
	offer := domain.Reduce(lead, domain.Event{ID: "request-public-link", LeadID: lead.ID, Kind: "message.received", At: now, Text: "quero agendar"}, domain.Decision{Action: "offer_slots"}, nil, p, now)
	if len(offer.Effects) != 2 || strings.Contains(offer.Effects[1].Text, bookingPage) || offer.State.Booking != nil {
		t.Fatal("empty availability must leave booking pending without a link")
	}
	cal := &providers.LocalCalendar{Pool: db.Pool}
	testKey := strings.Repeat("x", 48)
	h := (&httpapi.Server{DB: db, Calendar: cal, TestFormToken: testKey, Mode: "live", Policy: p}).Handler()
	web := calendarCall(h, http.MethodGet, "/webhooks/test-form/"+testKey+"/availability", "", "")
	if web.Code != 200 || !strings.Contains(web.Body.String(), bookingPage) || !strings.Contains(web.Body.String(), "clickmax_public") {
		t.Fatal("web availability did not point to the native agenda", web.Code, web.Body)
	}
	client, err := clickmax.New("cxd_disposabletestkey")
	if err != nil {
		t.Fatal(err)
	}
	start := now.Add(48 * time.Hour)
	a := clickmax.Appointment{
		ID: "11111111-1111-4111-8111-111111111111", ContactID: "22222222-2222-4222-8222-222222222222",
		AttendantID: "33333333-3333-4333-8333-333333333333", ScheduleID: schedule, PipelineID: pipeline,
		LeadPhone: "557799749058", Origin: "public_booking", MeetingLink: meetingRoom,
		Start: start, End: start.Add(time.Hour), Status: "scheduled", CreatedAt: now, UpdatedAt: now,
	}
	outside := a
	outside.ID, outside.ScheduleID = "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"
	stale := a
	stale.ID, stale.CreatedAt = "66666666-6666-4666-8666-666666666666", since.Add(-time.Hour)
	hideFromList := false
	client.HTTP.Transport = googleTransport(func(r *http.Request) (*http.Response, error) {
		var body any
		switch r.URL.Path {
		case "/api/v0/scheduled-calls/list":
			if r.Method != http.MethodGet || r.URL.Query().Get("pipelineId") != pipeline {
				t.Error("unexpected calendar filter")
			}
			data := []clickmax.Appointment{stale, outside}
			if !hideFromList {
				data = append(data, a)
			}
			body = map[string]any{"data": data}
		case "/api/v0/scheduled-calls/get":
			if r.URL.Query().Get("id") != a.ID {
				t.Error("unexpected booking lookup")
			}
			body = a
		default:
			t.Errorf("unexpected ClickMax write %s", r.URL.Path)
			return nil, io.ErrUnexpectedEOF
		}
		raw, _ := json.Marshal(body)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(raw)), Request: r}, nil
	})
	poller := schedulingworker.ClickMaxPublic{DB: db, Client: client, PipelineID: pipeline, ScheduleID: schedule, Since: since}
	w := runtimeWorker(db, now, &countingMessenger{})
	w.Policy = p
	sw := schedulingworker.New(*w, cal)
	sync := func(want int) {
		t.Helper()
		if count, err := poller.Sync(ctx, now); err != nil || count != want {
			t.Fatal("unexpected sync result", count, err)
		}
	}
	current := func() domain.State {
		t.Helper()
		state, err := db.Lead(ctx, lead.ID)
		if err != nil {
			t.Fatal(err)
		}
		return state
	}
	pending := func(id string) int {
		t.Helper()
		var n int
		err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM bia_go.jobs WHERE status='pending' AND payload->>'booking_id'=$1
 AND payload->>'purpose' IN ('meeting_audio','meeting_call','meeting_sms','meeting_start')`, id).Scan(&n)
		if err != nil {
			t.Fatal(err)
		}
		return n
	}
	sync(1)
	sync(0)
	step(t, sw, true)
	first := current().Booking
	if first == nil || first.Provider != domain.ClickMaxPublicProvider || !first.Start.Equal(start) || first.MeetingURL != meetingRoom || pending(first.ID) != 4 {
		t.Fatal("reservation did not start the reminder cadence", first)
	}
	var confirmation string
	err = db.Pool.QueryRow(ctx, `SELECT payload->>'text' FROM bia_go.jobs WHERE payload->>'booking_id'=$1 AND payload->>'purpose'='booking_confirmation'`, first.ID).Scan(&confirmation)
	if err != nil || strings.Contains(confirmation, "https://") || !strings.Contains(confirmation, first.Start.In(p.Zone(current())).Format("02/01 às 15:04")) {
		t.Fatalf("confirmation should contain the meeting time without a link: %q, %v", confirmation, err)
	}
	a.Start, a.End, a.UpdatedAt = start.AddDate(0, 0, 70), start.AddDate(0, 0, 70).Add(time.Hour), now.Add(time.Minute)
	hideFromList = true
	sync(1)
	sync(0)
	step(t, sw, true)
	moved := current().Booking
	if moved == nil || moved.ID == first.ID || !moved.Start.Equal(a.Start) || pending(first.ID) != 0 || pending(moved.ID) != 4 {
		t.Fatal("rescheduling did not replace the previous reminders", moved)
	}
	a.Status, a.UpdatedAt = "cancelled", now.Add(2*time.Minute)
	sync(1)
	sync(0)
	step(t, sw, true)
	if current().Booking != nil || pending(moved.ID) != 0 {
		t.Fatal("cancelled reservation still has reminders")
	}
}
