package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"testing"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"arkom/bia/internal/dualcalendar"
	"arkom/bia/internal/providers"
)

func TestClickMaxCalendarKeepsOneAppointmentAndRecoversLostResponses(t *testing.T) {
	db := setup(t)
	ctx := context.Background()
	now := time.Now()
	service, google := googleSchedulingFixture(t, db)
	seller := newPanel(t, db, now, "operator")
	addSchedulingAccount(t, db, service, seller.user.ID, "work")
	if err := service.Save(ctx, seller.user.ID, dualcalendar.Profile{Enabled: true, Destination: dualcalendar.Selection{AccountID: "work", CalendarID: "work-calendar"}}); err != nil {
		t.Fatal(err)
	}
	available, err := service.Slots(ctx, domain.State{}, now)
	if err != nil || len(available) < 3 {
		t.Fatal("expected at least three local slots", err)
	}
	directSeller := newPanel(t, db, now, "admin")
	addSchedulingAccount(t, db, service, directSeller.user.ID, "direct")
	if err = service.Save(ctx, directSeller.user.ID, dualcalendar.Profile{Enabled: true, Destination: dualcalendar.Selection{AccountID: "direct", CalendarID: "direct-calendar"}}); err != nil {
		t.Fatal(err)
	}
	directProfile, err := service.Profile(ctx, directSeller.user.ID)
	if err != nil {
		t.Fatal(err)
	}
	const attendant = "11111111-1111-4111-8111-111111111111"
	const contact = "22222222-2222-4222-8222-222222222222"
	const appointment = "33333333-3333-4333-8333-333333333333"
	const busyAppointment = "44444444-4444-4444-8444-444444444444"
	const email = "ana@example.com"
	lead := testState("clickmax-calendar-lead", now)
	lead.Profile.Email = email
	publishEffects(t, db, "clickmax-calendar-seed", lead)
	client, err := clickmax.New("cxd_disposabletestkey")
	if err != nil {
		t.Fatal(err)
	}
	var remote clickmax.Appointment
	mutations := map[string]int{}
	duplicate := true
	offline := false
	client.HTTP.Transport = googleTransport(func(r *http.Request) (*http.Response, error) {
		var body any
		switch r.URL.Path {
		case "/api/v0/leads/search":
			items := []clickmax.Contact{{ID: contact, Email: email, Phone: lead.Profile.Phone}}
			if duplicate {
				items = append(items, items[0])
			}
			body = map[string]any{"data": items}
		case "/api/v0/scheduled-calls/list":
			if offline {
				return nil, io.ErrUnexpectedEOF
			}
			data := []clickmax.Appointment{}
			q := r.URL.Query()
			if q.Get("includeInactiveCards") != "true" {
				t.Error("inactive cards should not hide capacity")
			}
			if q.Get("leadId") == "" {
				data = append(data, clickmax.Appointment{ID: busyAppointment, AttendantID: attendant, Start: available[0].Start, End: available[0].End, Status: "confirmed"})
			}
			if remote.ID != "" {
				data = append(data, remote)
			}
			body = map[string]any{"data": data}
		case "/api/v0/scheduled-calls/get":
			if r.URL.Query().Get("id") != appointment {
				t.Error("wrong appointment requested")
			}
			body = remote
		case "/api/v0/scheduled-calls/create", "/api/v0/scheduled-calls/update", "/api/v0/scheduled-calls/cancel":
			var input struct {
				clickmax.Appointment
				Outside  bool `json:"allowOutsideAvailability"`
				Conflict bool `json:"allowConflict"`
			}
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				return nil, err
			}
			if input.Outside || input.Conflict {
				t.Error("slot protection overridden")
			}
			mutations[r.URL.Path]++
			switch r.URL.Path {
			case "/api/v0/scheduled-calls/create":
				remote = input.Appointment
				remote.ID, remote.Status = appointment, "scheduled"
				if remote.ContactID != contact || remote.AttendantID != attendant || remote.Notes == "" {
					t.Error("incomplete booking request")
				}
			case "/api/v0/scheduled-calls/update":
				if input.ID != appointment {
					t.Error("remarcation did not reuse appointment")
				}
				remote.Start, remote.End = input.Start, input.End
			case "/api/v0/scheduled-calls/cancel":
				if input.ID != appointment {
					t.Error("wrong appointment cancelled")
				}
				remote.Status = "cancelled"
			}
			// The provider committed the mutation before the HTTP response was lost.
			return nil, io.ErrUnexpectedEOF
		default:
			t.Errorf("unexpected ClickMax operation %s", r.URL.Path)
			return nil, io.ErrUnexpectedEOF
		}
		raw, _ := json.Marshal(body)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(raw)), Request: r}, nil
	})
	service.ClickMax = client
	service.ClickMaxAttendants = map[string]string{seller.user.ID: attendant}
	slots, err := service.Slots(ctx, lead, now)
	if err != nil || len(slots) < 2 || !slots[0].Start.Equal(available[1].Start) || slots[0].CloserID != available[0].CloserID {
		t.Fatal("Google-only seller displaced ClickMax or bypassed its busy time", err)
	}
	legacy := lead
	legacy.Booking = &domain.Booking{ID: "old-google-booking", GoogleSynced: true, CloserID: directProfile.CloserID}
	legacySlots, err := service.Slots(ctx, legacy, now)
	if err != nil || len(legacySlots) == 0 || legacySlots[0].CloserID != directProfile.CloserID || !legacySlots[0].Start.Equal(available[0].Start) {
		t.Fatal("existing Google booking lost its calendar", err)
	}
	if _, err = service.Book(ctx, "clickmax-busy", lead, legacySlots[0], nil); err == nil || err.Error() != "clickmax_slot_no_longer_available" {
		t.Fatal("Google-only slot bypassed ClickMax when reserving", err)
	}
	offline = true
	if _, err = service.Slots(ctx, lead, now); err == nil || err.Error() != "clickmax_availability_unavailable" {
		t.Fatal("Google-only slots hid ClickMax outage", err)
	}
	var pending *providers.Deferred
	if _, err = service.Book(ctx, "clickmax-offline", lead, slots[0], nil); !errors.As(err, &pending) || pending.Code != "clickmax_availability_unavailable" || google.inserts != 0 {
		t.Fatal("ClickMax outage bypassed authoritative calendar", err, google.inserts)
	}
	offline = false
	if _, err = service.Book(ctx, "ambiguous", lead, slots[0], nil); err == nil || err.Error() != "clickmax_contact_unverified" || len(mutations) != 0 {
		t.Fatal("ambiguous contact did not prevent booking", err, mutations)
	}
	duplicate = false
	if _, err = service.Book(ctx, "clickmax-create", lead, slots[0], nil); !errors.As(err, &pending) {
		t.Fatal("lost result should leave intent pending", err)
	}
	var count int
	if err = db.Pool.QueryRow(ctx, `SELECT count(*) FROM bia_go.bookings`).Scan(&count); err != nil || count != 0 {
		t.Fatal("premature confirmation", count, err)
	}
	booked, err := service.Book(ctx, "clickmax-create", lead, slots[0], nil)
	if err != nil || booked.ClickMaxID != appointment || booked.GoogleSynced || !booked.ExternallyManaged() {
		t.Fatal("lost reservation not recovered", booked, err)
	}
	lead.Booking = &booked
	if _, err = service.Book(ctx, "clickmax-move", lead, slots[1], &booked); !errors.As(err, &pending) {
		t.Fatal("lost remarcation should leave intent pending", err)
	}
	moved, err := service.Book(ctx, "clickmax-move", lead, slots[1], &booked)
	if err != nil || moved.ClickMaxID != booked.ClickMaxID || moved.ID == booked.ID || !moved.Start.Equal(slots[1].Start) {
		t.Fatal("lost remarcation not recovered", moved, err)
	}
	if err = service.Cancel(ctx, "clickmax-cancel", moved); !errors.As(err, &pending) {
		t.Fatal("lost cancellation should leave intent pending", err)
	}
	if err = service.Cancel(ctx, "clickmax-cancel", moved); err != nil {
		t.Fatal("lost cancellation not recovered", err)
	}
	if err = db.Pool.QueryRow(ctx, `SELECT count(*) FROM bia_go.bookings WHERE cancelled_at IS NULL`).Scan(&count); err != nil || count != 0 {
		t.Fatal("local reservation was not cancelled", count, err)
	}
	if err = db.Pool.QueryRow(ctx, `SELECT count(*) FROM bia_go.jobs WHERE id LIKE 'clickmax-booking/%'`).Scan(&count); err != nil || count != 3 {
		t.Fatal("missing booking lifecycle events", count, err)
	}
	if len(mutations) != 3 || google.inserts != 0 {
		t.Fatal("appointment duplicated between providers", mutations, google.inserts)
	}
	for _, n := range mutations {
		if n != 1 {
			t.Fatal("uncertain mutation replayed", mutations)
		}
	}
}
