package integration

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"arkom/bia/internal/httpapi"
	"arkom/bia/internal/schedulingworker"
)

func TestClickMaxBookingHandoffWaitsForVerifiedReservation(t *testing.T) {
	for _, calendar := range []string{"arkom", "bilhon"} {
		for _, origin := range []string{"public_booking", "crm"} {
			t.Run(calendar+"/"+origin, func(t *testing.T) {
				testClickMaxBookingHandoff(t, calendar, origin)
			})
		}
	}
}

func testClickMaxBookingHandoff(t *testing.T, calendar, origin string) {
	db := setup(t)
	ctx := context.Background()
	now := time.Now().UTC()
	const appointmentID = "11111111-1111-4111-8111-111111111111"
	const phone = "+5565999999999"
	const intakeSchedule = "44444444-4444-4444-8444-444444444444"
	const salesPipeline = "55555555-5555-4555-8555-555555555555"
	a := clickmax.Appointment{
		ID: appointmentID, ContactID: "22222222-2222-4222-8222-222222222222",
		AttendantID: "33333333-3333-4333-8333-333333333333", ScheduleID: intakeSchedule, PipelineID: "closers-pipeline",
		LeadPhone: phone, Origin: origin, Status: "scheduled", MeetingLink: "https://meet.clickmax.io/test-room",
		Start: now.Add(time.Hour), End: now.Add(2 * time.Hour), CreatedAt: now, UpdatedAt: now,
	}
	c, err := clickmax.New("cxd_disposabletestkey")
	if err != nil {
		t.Fatal(err)
	}
	whatsappAllowed := true
	c.HTTP.Transport = googleTransport(func(r *http.Request) (*http.Response, error) {
		if strings.HasSuffix(r.URL.Path, "/leads/get") {
			body, _ := json.Marshal(map[string]any{"id": a.ContactID, "name": "Ana", "telephone": phone, "messagePreferences": map[string]bool{"whatsapp": whatsappAllowed}})
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(body))), Request: r}, nil
		}
		if strings.HasSuffix(r.URL.Path, "/tags/apply-to-leads") {
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"applied":1}`)), Request: r}, nil
		}
		if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/scheduled-calls/list") && r.URL.Query().Get("pipelineId") == salesPipeline {
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"data":[]}`)), Request: r}, nil
		}
		if r.Method != http.MethodGet || r.URL.Query().Get("id") != appointmentID {
			t.Fatalf("unexpected ClickMax request: %s %s", r.Method, r.URL)
		}
		body, _ := json.Marshal(a)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(body))), Request: r}, nil
	})
	key := strings.Repeat("k", 48)
	server := &httpapi.Server{DB: db, IntakeToken: key, VoiceSender: voiceSender, Mode: "live", FormAutoContact: true,
		ClickMax: c, ClickMaxSchedule: intakeSchedule, ClickMaxPipeline: salesPipeline}
	intakeOnly := calendar == "bilhon"
	if !intakeOnly {
		server.ClickMaxGoTag = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	}
	if intakeOnly {
		primary, err := clickmax.New("cxd_primarytestkey")
		if err != nil {
			t.Fatal(err)
		}
		primary.HTTP.Transport = googleTransport(func(r *http.Request) (*http.Response, error) {
			if strings.HasSuffix(r.URL.Path, "/scheduled-calls/list") {
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"data":[]}`)), Request: r}, nil
			}
			t.Fatalf("Bilhon booking used the primary workspace: %s %s", r.Method, r.URL)
			return nil, nil
		})
		server.ClickMax = primary
		server.ClickMaxSchedule = "66666666-6666-4666-8666-666666666666"
		server.ClickMaxBilhon, server.ClickMaxBilhonSchedule = c, intakeSchedule
		server.ClickMaxBilhonSince = now.Add(-time.Hour)
		server.ClickMaxBilhonIntakeToken = strings.Repeat("b", 48)
	}
	h := server.Handler()
	postWithToken := func(destination, token, target string) *httptest.ResponseRecorder {
		payload := map[string]any{"name": "Ana", "phone": destination, "consent": true, "clickmax_booking_id": a.ID}
		if target != "" {
			payload["clickmax_calendar"] = target
		}
		body, _ := json.Marshal(payload)
		r := httptest.NewRequest("POST", "/webhooks/bia/leads", strings.NewReader(string(body)))
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	post := func(destination string) *httptest.ResponseRecorder {
		if intakeOnly {
			return postWithToken(destination, server.ClickMaxBilhonIntakeToken, "bilhon")
		}
		return postWithToken(destination, key, "")
	}
	if intakeOnly {
		for _, v := range []struct{ token, route string }{{key, "bilhon"}, {server.ClickMaxBilhonIntakeToken, ""}} {
			if res := postWithToken(phone, v.token, v.route); res.Code != 403 {
				t.Fatalf("token crossed workspace boundaries: %d %s", res.Code, res.Body)
			}
		}
	}
	if response := post("+5565987654321"); response.Code != 409 {
		t.Fatalf("accepted different phone: %d %s", response.Code, response.Body)
	}
	a.ScheduleID = "another-schedule"
	if response := post(phone); response.Code != 409 {
		t.Fatalf("accepted a booking from another agenda: %d %s", response.Code, response.Body)
	}
	a.ScheduleID = intakeSchedule
	if intakeOnly {
		a.CreatedAt = server.ClickMaxBilhonSince.Add(-time.Second)
		if response := post(phone); response.Code != 409 {
			t.Fatalf("accepted a Bilhon appointment from before cutover: %d %s", response.Code, response.Body)
		}
		a.CreatedAt = now
	}
	if !intakeOnly {
		whatsappAllowed = false
		if response := post(phone); response.Code != 202 || !strings.Contains(response.Body.String(), "whatsapp_not_authorized") {
			t.Fatalf("accepted opted-out booking: %d %s", response.Code, response.Body)
		}
		whatsappAllowed = true
	}
	if response := post(phone); response.Code != 202 || !strings.Contains(response.Body.String(), `"duplicate":false`) {
		t.Fatalf("did not accept a verified public appointment: %d %s", response.Code, response.Body)
	}
	if response := post(phone); response.Code != 202 || !strings.Contains(response.Body.String(), `"duplicate":true`) {
		t.Fatalf("repeat was not deduplicated by appointment: %d %s", response.Code, response.Body)
	}
	m := &countingMessenger{}
	w := runtimeWorker(db, now, m)
	w.Policy.ClickMaxPublicBooking = true
	drain(t, w)
	if _, err := db.Pool.Exec(ctx, `UPDATE bia_go.jobs SET due_at=now() WHERE payload->>'purpose'='form_contact'`); err != nil {
		t.Fatal(err)
	}
	drain(t, w)
	var reason string
	if err := db.Pool.QueryRow(ctx, `SELECT error_code FROM bia_go.jobs WHERE payload->>'purpose'='form_contact'`).Scan(&reason); err != nil || reason != "awaiting_clickmax_form_booking" || m.Count.Load() != 0 {
		t.Fatalf("opening was not deferred until the booking was imported: %q %d %v", reason, m.Count.Load(), err)
	}
	if intakeOnly {
		primary := schedulingworker.ClickMaxPublic{DB: db, Client: server.ClickMax, PipelineID: salesPipeline, ScheduleID: server.ClickMaxSchedule}
		if count, err := primary.Sync(ctx, now); err != nil || count != 0 {
			t.Fatalf("primary workspace picked up a Bilhon intake: %d %v", count, err)
		}
	}
	poller := schedulingworker.ClickMaxPublic{DB: db, Client: c, PipelineID: salesPipeline, ScheduleID: intakeSchedule, Since: now.Add(-time.Hour), IntakeOnly: intakeOnly}
	if count, err := poller.Sync(ctx, now); err != nil || count != 1 {
		t.Fatalf("queued appointment outside the SDR pipeline was not imported: %d %v", count, err)
	}
	if count, err := poller.Sync(ctx, now); err != nil || count != 0 {
		t.Fatalf("repeat sync changed the appointment again: %d %v", count, err)
	}
	scheduler := schedulingworker.New(*w, nil)
	step(t, scheduler, true)
	if _, err := db.Pool.Exec(ctx, `UPDATE bia_go.jobs SET due_at=now() WHERE payload->>'purpose' IN ('form_contact','booking_confirmation') AND status='pending'`); err != nil {
		t.Fatal(err)
	}
	drain(t, w)
	step(t, scheduler, true)
	if got := m.Count.Load(); got != 1 {
		t.Fatalf("expected exactly one booking confirmation, got %d", got)
	}
	state, err := db.Lead(ctx, domain.LeadKey(phone))
	if err != nil || state.Booking == nil || state.Booking.ClickMaxScheduleID != intakeSchedule {
		t.Fatalf("booking lost its verified calendar: %v, %v", state.Booking, err)
	}
}

func TestProductionFormDeduplicatesAndQueuesAutomaticContact(t *testing.T) {
	db := setup(t)
	ctx := context.Background()
	key, demoKey, adminKey := strings.Repeat("k", 48), strings.Repeat("d", 48), strings.Repeat("a", 48)
	h := (&httpapi.Server{DB: db, IntakeToken: key, Token: adminKey, TestFormToken: demoKey, VoiceSender: voiceSender, Mode: "live", FormAutoContact: true}).Handler()
	body := `{"name":"Ana","phone":"+5565999999999","email":"ana@example.com","company":"Empresa Exemplo","revenue":0,"timezone":"America/Cuiaba","consent":true,"sms_consent":true}`
	post := func(token, id, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/webhooks/bia/leads", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Idempotency-Key", id)
		r.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	for _, token := range []string{"", demoKey, adminKey} {
		if w := post(token, "prod-one", body); w.Code != 401 {
			t.Fatalf("unauthorized credential: %d", w.Code)
		}
	}
	if w := post(key, "", body); w.Code != 422 {
		t.Fatalf("accepted without idempotency key: %d", w.Code)
	}
	if w := post(key, "prod-one", strings.Replace(body, `"consent":true`, `"consent":false`, 1)); w.Code != 422 {
		t.Fatalf("accepted without consent: %d", w.Code)
	}
	var wg sync.WaitGroup
	responses := make(chan *httptest.ResponseRecorder, 12)
	for range cap(responses) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			responses <- post(key, "prod-one", body)
		}()
	}
	wg.Wait()
	close(responses)
	first := 0
	for w := range responses {
		if w.Code != 202 || !strings.Contains(w.Body.String(), `"status":"contact_queued"`) || w.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatalf("unexpected acceptance: %d %s", w.Code, w.Body)
		}
		if strings.Contains(w.Body.String(), `"duplicate":false`) {
			first++
		}
	}
	if first != 1 {
		t.Fatalf("expected one first submission, got %d", first)
	}
	if w := post(key, "prod-one", strings.Replace(body, "Ana", "Bia", 1)); w.Code != 409 {
		t.Fatalf("accepted changed payload for same key: %d", w.Code)
	}
	var jobs int
	if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM bia_go.jobs WHERE kind='event'`).Scan(&jobs); err != nil || jobs != 1 {
		t.Fatalf("expected one event: %d %v", jobs, err)
	}
	m := &countingMessenger{}
	now := time.Now()
	w := runtimeWorker(db, now, m)
	w.Policy.ClickMaxPublicBooking = true
	drain(t, w)
	var openingDue time.Time
	if err := db.Pool.QueryRow(ctx, `SELECT due_at FROM bia_go.jobs WHERE payload->>'purpose'='form_contact'`).Scan(&openingDue); err != nil || openingDue.Before(now.Add(40*time.Second-time.Millisecond)) {
		t.Fatalf("opening did not leave time to import a page booking: %s %v", openingDue, err)
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE bia_go.jobs SET due_at=now() WHERE payload->>'purpose'='form_contact'`); err != nil {
		t.Fatal(err)
	}
	drain(t, w)
	state, err := db.Lead(ctx, domain.LeadKey("+5565999999999"))
	if err != nil || state.Owner != "go" || state.Profile.Source != "production_form" || !state.Profile.SMSConsent || state.Profile.Revenue == nil || *state.Profile.Revenue != 0 || m.Count.Load() != 1 {
		t.Fatalf("expected an owned lead and one WhatsApp opening: %d %v", m.Count.Load(), err)
	}
	if replay := post(key, "prod-one", body); replay.Code != 202 || !strings.Contains(replay.Body.String(), `"duplicate":true`) {
		t.Fatalf("retry after processing: %d %s", replay.Code, replay.Body)
	}
}
