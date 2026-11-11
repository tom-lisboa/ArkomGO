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
	"arkom/bia/internal/providers"
	"arkom/bia/internal/schedulingworker"
)

func TestClickMaxTeamRescheduleKeepsOriginalUntilAccepted(t *testing.T) {
	for _, calendar := range []string{"arkom", "bilhon"} {
		t.Run(calendar, func(t *testing.T) {
			testClickMaxTeamReschedule(t, calendar)
		})
	}
}

func testClickMaxTeamReschedule(t *testing.T, calendar string) {
	ctx := context.Background()
	db := setup(t)
	now := time.Now().UTC().Truncate(time.Second)
	s := testState("reschedule-test", now.Add(-time.Hour))
	s.Profile.SMSConsent, s.Profile.SMSPhone = true, s.Profile.Phone
	publishEffects(t, db, "seed-remarca", s)
	const schedule = "2901efd1-827b-4a88-baec-0a0d20176c62"
	remote := clickmax.Appointment{ID: "11111111-1111-4111-8111-111111111111", ContactID: "22222222-2222-4222-8222-222222222222",
		AttendantID: "33333333-3333-4333-8333-333333333333", ScheduleID: schedule, Origin: "crm",
		CreatedAt: now, UpdatedAt: now, Start: now.Add(72 * time.Hour), End: now.Add(73 * time.Hour),
		Status: "scheduled", MeetingLink: "https://meet.clickmax.io/existing-room"}
	if err := db.RecordClickMaxTeamBooking(ctx, remote, s.ID, now); err != nil {
		t.Fatal(err)
	}
	w := runtimeWorker(db, now, &countingMessenger{})
	w.Policy.ClickMaxPublicBooking, w.Policy.MeetingReminders, w.Policy.MeetingStart, w.Policy.SMSReminders = true, true, true, true
	client, err := clickmax.New("cxd_disposabletestkey")
	if err != nil {
		t.Fatal(err)
	}
	sw := schedulingworker.New(*w, &providers.LocalCalendar{Pool: db.Pool})
	sw.ClickMax = &schedulingworker.ClickMaxPublic{DB: db, Client: client, ScheduleID: schedule, Availability: availableTeamSlot{}}
	if calendar == "bilhon" {
		primary, err := clickmax.New("cxd_primarytestkey")
		if err != nil {
			t.Fatal(err)
		}
		primary.HTTP.Transport = googleTransport(func(r *http.Request) (*http.Response, error) {
			t.Fatalf("Bilhon reschedule used Arkom credentials: %s %s", r.Method, r.URL.Path)
			return nil, nil
		})
		sw.ClickMax.IntakeOnly = true
		sw.ClickMax = &schedulingworker.ClickMaxPublic{DB: db, Client: primary, ScheduleID: "66666666-6666-4666-8666-666666666666", Bilhon: sw.ClickMax}
	}
	step(t, sw, true)
	step(t, sw, true) // deliver the original confirmation before choosing a replacement
	current := func() domain.State {
		t.Helper()
		state, err := db.Lead(ctx, s.ID)
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
	old := *current().Booking
	candidate := domain.Slot{ID: "new-team-option", Provider: domain.ClickMaxPublicProvider, Start: remote.Start.Add(3 * time.Hour), End: remote.End.Add(3 * time.Hour)}
	writes := 0
	client.HTTP.Transport = googleTransport(func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/api/v0/scheduled-calls/get":
			if r.URL.Query().Get("id") != remote.ID {
				t.Error("wrong appointment lookup")
			}
			raw, _ := json.Marshal(remote)
			return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(raw)), Request: r}, nil
		case "/api/v0/scheduled-calls/update":
			writes++
			var req struct {
				ID    string    `json:"id"`
				Start time.Time `json:"startAt"`
				End   time.Time `json:"endAt"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, err
			}
			if req.ID != remote.ID || !req.Start.Equal(candidate.Start) || !req.End.Equal(candidate.End) {
				t.Error("expected update of the same appointment to the chosen time")
			}
			if current().Booking.ID != old.ID || pending(old.ID) != 4 {
				t.Error("original must stay active before provider acceptance")
			}
			if writes == 1 {
				return &http.Response{StatusCode: 409, Body: io.NopCloser(strings.NewReader(`{"code":"scheduling_time_conflict"}`)), Request: r}, nil
			}
			remote.Start, remote.End, remote.UpdatedAt = req.Start, req.End, remote.UpdatedAt.Add(time.Second)
			return nil, io.ErrUnexpectedEOF
		default:
			t.Errorf("unexpected ClickMax request %s", r.URL.Path)
			return nil, io.ErrUnexpectedEOF
		}
	})
	choose := func(id string) string {
		t.Helper()
		state := current()
		offer := domain.Reduce(state, domain.Event{ID: id + "-offer", Kind: "message.received", At: now, Text: "Quero remarcar minha reunião."},
			domain.Decision{Action: "offer_slots"}, []domain.Slot{candidate}, w.Policy, now)
		if len(offer.State.Offered) != 1 || offer.State.Booking.ID != old.ID {
			t.Fatal("expected new options and original booking")
		}
		picked := domain.Reduce(offer.State, domain.Event{ID: id, Kind: "message.received", At: now, Text: "O primeiro"},
			domain.Decision{Action: "reschedule", SlotID: candidate.ID}, nil, w.Policy, now)
		if len(picked.Effects) != 1 || picked.Effects[0].Kind != "book" || picked.Effects[0].BookingID != old.ID {
			t.Fatal("expected worker task bound to original booking", picked.Effects)
		}
		publishEffects(t, db, "publish-"+id, picked.State, picked.Effects...)
		return picked.Effects[0].ID
	}
	choose("first-choice")
	step(t, sw, true)
	if current().Booking.ID != old.ID || pending(old.ID) != 4 {
		t.Fatal("rejected replacement disturbed the original")
	}
	retryID := choose("second-choice")
	step(t, sw, true)
	if current().Booking.ID != old.ID || pending(old.ID) != 4 {
		t.Fatal("uncertain response released the original before reconciliation")
	}
	replayID := choose("repeated-choice")
	step(t, sw, true)
	assertJob(t, db, replayID, "scheduling", "pending")
	if current().Human || current().Booking.ID != old.ID || writes != 2 {
		t.Fatal("a repeated choice must wait for the original operation")
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE bia_go.jobs SET due_at=now() WHERE id=$1 AND status='pending'`, retryID); err != nil {
		t.Fatal(err)
	}
	step(t, sw, true)
	step(t, sw, true)
	moved := current().Booking
	if moved == nil || moved.ID == old.ID || moved.ClickMaxID != remote.ID || moved.CloserID != old.CloserID ||
		!moved.Start.Equal(candidate.Start) || pending(old.ID) != 0 || pending(moved.ID) != 4 || writes != 2 {
		t.Fatalf("expected one rescheduled meeting and one reminder set: %+v, writes=%d", moved, writes)
	}
}

type availableTeamSlot struct{}

func (availableTeamSlot) Available(context.Context, domain.State, domain.Slot) (bool, error) {
	return true, nil
}

func (availableTeamSlot) Slots(context.Context, domain.State, time.Time) ([]domain.Slot, error) {
	return nil, nil
}

func TestClickMaxTeamBookingFromWhatsApp(t *testing.T) {
	for _, tc := range []string{"accepted", "response_lost"} {
		t.Run(tc, func(t *testing.T) {
			ctx := context.Background()
			db := setup(t)
			now := time.Now().UTC().Truncate(time.Second)
			const schedule = "2901efd1-827b-4a88-baec-0a0d20176c62"
			const pipeline = "9bd7a27b-0228-4f55-83ce-cc79dd624c6f"
			const contact = "22222222-2222-4222-8222-222222222222"
			lead := testState("team-booking-lead", now.Add(-time.Hour))
			lead.Profile.SMSConsent, lead.Profile.SMSPhone = true, lead.Profile.Phone
			slot := domain.Slot{ID: "clickmax-option", Provider: domain.ClickMaxPublicProvider, Start: now.Add(48 * time.Hour), End: now.Add(49 * time.Hour)}
			lead.Offered = []domain.Slot{slot}
			w := runtimeWorker(db, now, &countingMessenger{})
			w.Policy.ClickMaxPublicBooking, w.Policy.MeetingReminders, w.Policy.MeetingStart, w.Policy.SMSReminders = true, true, true, true
			choice := domain.Event{ID: "choice", Kind: "message.received", At: now, Text: "O primeiro"}
			picked := domain.Reduce(lead, choice, domain.Decision{Action: "book", SlotID: slot.ID}, nil, w.Policy, now)
			if len(picked.Effects) != 1 || picked.Effects[0].Kind != "book" {
				t.Fatal("choice must enqueue a booking", picked.Effects)
			}
			publishEffects(t, db, "seed-team-booking", picked.State, picked.Effects...)
			client, err := clickmax.New("cxd_disposabletestkey")
			if err != nil {
				t.Fatal(err)
			}
			var created clickmax.Appointment
			writes := 0
			client.HTTP.Transport = googleTransport(func(r *http.Request) (*http.Response, error) {
				var body any
				switch r.URL.Path {
				case "/api/v0/leads/search":
					body = map[string]any{"data": []clickmax.Contact{{ID: contact, Phone: lead.Profile.Phone}}, "meta": map[string]int{"countItens": 1}}
				case "/api/v0/scheduled-calls/list":
					if r.URL.Query().Get("leadId") != contact {
						t.Error("expected verified contact filter")
					}
					data := []clickmax.Appointment{}
					if writes > 0 {
						data = append(data, created)
					}
					body = map[string]any{"data": data}
				case "/api/v0/scheduled-calls/create":
					writes++
					var req map[string]json.RawMessage
					if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
						return nil, err
					}
					if r.Method != http.MethodPost || string(req["appointmentScheduleId"]) != `"`+schedule+`"` ||
						string(req["leadId"]) != `"`+contact+`"` || req["attendantId"] != nil || req["allowConflict"] != nil || req["allowOutsideAvailability"] != nil {
						t.Error("reservation must use the configured team rotation and native availability")
					}
					created = clickmax.Appointment{ID: "11111111-1111-4111-8111-111111111111", ContactID: contact,
						AttendantID: "33333333-3333-4333-8333-333333333333", ScheduleID: schedule, Origin: "crm",
						CreatedAt: now, UpdatedAt: now, Start: slot.Start, End: slot.End, Status: "scheduled"}
					if err := json.Unmarshal(req["notes"], &created.Notes); err != nil || created.Notes == "" {
						t.Error("missing recovery marker")
					}
					if tc == "response_lost" {
						return nil, io.ErrUnexpectedEOF
					}
					body = created
				default:
					t.Errorf("unexpected ClickMax request %s", r.URL.Path)
					return nil, io.ErrUnexpectedEOF
				}
				raw, _ := json.Marshal(body)
				return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(raw)), Request: r}, nil
			})
			sw := schedulingworker.New(*w, &providers.LocalCalendar{Pool: db.Pool})
			sw.ClickMax = &schedulingworker.ClickMaxPublic{DB: db, Client: client, ScheduleID: schedule, PipelineID: pipeline, Availability: availableTeamSlot{}}
			step(t, sw, true)
			if tc == "response_lost" {
				if _, err := db.Pool.Exec(ctx, `UPDATE bia_go.jobs SET due_at=now() WHERE id=$1 AND status='pending'`, picked.Effects[0].ID); err != nil {
					t.Fatal(err)
				}
				step(t, sw, true)
			}
			step(t, sw, true)
			current, err := db.Lead(ctx, lead.ID)
			if err != nil || current.Booking == nil || current.Booking.ClickMaxID != created.ID || current.Booking.CloserID == 0 || writes != 1 {
				t.Fatalf("expected one confirmed native booking: %+v, posts=%d, err=%v", current.Booking, writes, err)
			}
			var scheduled int
			err = db.Pool.QueryRow(ctx, `SELECT count(*) FROM bia_go.jobs WHERE payload->>'booking_id'=$1
 AND payload->>'purpose' IN ('booking_confirmation','meeting_audio','meeting_call','meeting_sms','meeting_start')`, current.Booking.ID).Scan(&scheduled)
			if err != nil || scheduled != 5 {
				t.Fatalf("confirmation and reminders should follow the reservation: %d, %v", scheduled, err)
			}
		})
	}
}
