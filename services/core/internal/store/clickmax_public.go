package store

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strings"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"github.com/jackc/pgx/v5"
)

// PendingClickMaxPublicIDs also covers a meeting moved outside the normal
// list window. Disappearance from the list never implies cancellation.
func (d *DB) PendingClickMaxPublicIDs(ctx context.Context, seen []string, now time.Time, schedule string, includeLegacy bool) ([]string, error) {
	rows, err := d.Pool.Query(ctx, `SELECT p.appointment_id::text FROM bia_go.clickmax_public_bookings p
 JOIN bia_go.bookings b ON b.id=p.booking_id JOIN bia_go.slots s ON s.id=b.slot_id
 WHERE b.cancelled_at IS NULL AND s.ends_at>$2 AND NOT (p.appointment_id::text=ANY($1::text[]))
 AND (b.payload->>'clickmax_schedule_id'=$3 OR ($4 AND COALESCE(b.payload->>'clickmax_schedule_id','')=''))
 ORDER BY p.provider_checked_at NULLS FIRST,s.starts_at LIMIT 10`, seen, now, schedule, includeLegacy)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (d *DB) MarkClickMaxBookingChecked(ctx context.Context, id string, now time.Time) error {
	_, err := d.Pool.Exec(ctx, `UPDATE bia_go.clickmax_public_bookings SET provider_checked_at=$2 WHERE appointment_id=$1`, id, now)
	return err
}

// ImportClickMaxPublic records a verified provider snapshot and its event
// together. The existing scheduling queue owns confirmations and reminders.
func (d *DB) ImportClickMaxPublic(ctx context.Context, a clickmax.Appointment, since, now time.Time) (bool, error) {
	return d.importClickMaxBooking(ctx, a, since, now, "", true)
}

type ClickMaxFormBooking struct {
	AppointmentID, LeadID, Phone, Email string
}

// A verified intake may point at a reservation moved to a different pipeline.
// Follow the exact ID saved by the authenticated form rather than scanning other pipelines.
func (d *DB) PendingClickMaxFormBookings(ctx context.Context, schedule string, includeLegacy bool) ([]ClickMaxFormBooking, error) {
	rows, err := d.Pool.Query(ctx, `SELECT j.payload->>'expected_clickmax_booking_id',j.lead_id,
 l.state#>>'{profile,phone}',COALESCE(l.state#>>'{profile,email}','')
 FROM bia_go.jobs j JOIN bia_go.leads l ON l.id=j.lead_id
 WHERE j.kind='effect' AND j.status IN ('pending','running') AND j.payload->>'purpose'='form_contact'
 AND j.payload->>'expected_clickmax_booking_id'<>''
 AND (j.payload->>'expected_clickmax_schedule_id'=$1 OR ($2 AND COALESCE(j.payload->>'expected_clickmax_schedule_id','')=''))
 AND NOT EXISTS(SELECT 1 FROM bia_go.clickmax_public_bookings p WHERE p.appointment_id::text=j.payload->>'expected_clickmax_booking_id')
 ORDER BY j.due_at LIMIT 10`, schedule, includeLegacy)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ClickMaxFormBooking
	for rows.Next() {
		var candidate ClickMaxFormBooking
		if err := rows.Scan(&candidate.AppointmentID, &candidate.LeadID, &candidate.Phone, &candidate.Email); err != nil {
			return nil, err
		}
		out = append(out, candidate)
	}
	return out, rows.Err()
}

func (d *DB) ImportClickMaxFormBooking(ctx context.Context, a clickmax.Appointment, lead string, since, now time.Time) (bool, error) {
	return d.importClickMaxBooking(ctx, a, since, now, lead, true)
}

// RecordClickMaxTeamBooking is called after the scheduler verifies the
// appointment against its durable operation and the lead's CRM identity.
func (d *DB) RecordClickMaxTeamBooking(ctx context.Context, a clickmax.Appointment, lead string, now time.Time) error {
	if _, err := d.importClickMaxBooking(ctx, a, time.Time{}, now, lead, false); err != nil {
		return err
	}
	var recorded bool
	err := d.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM bia_go.clickmax_public_bookings p
 JOIN bia_go.bookings b ON b.id=p.booking_id JOIN bia_go.slots s ON s.id=b.slot_id
 WHERE p.appointment_id=$1 AND p.lead_id=$2 AND p.contact_id=$3
 AND s.starts_at=$4 AND s.ends_at=$5 AND (b.cancelled_at IS NOT NULL)=$6)`,
		a.ID, lead, a.ContactID, a.Start, a.End, a.Status == "cancelled").Scan(&recorded)
	if err == nil && !recorded {
		err = errors.New("clickmax_team_booking_not_recorded")
	}
	return err
}

func (d *DB) importClickMaxBooking(ctx context.Context, a clickmax.Appointment, since, now time.Time, verifiedLead string, publicBooking bool) (bool, error) {
	if !clickmax.ValidID(a.ID) || !clickmax.ValidID(a.ContactID) || a.UpdatedAt.IsZero() || a.Start.IsZero() || !a.End.After(a.Start) {
		return false, nil
	}
	tx, err := d.Pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "clickmax-public/"+a.ID); err != nil {
		return false, err
	}
	var lead, contact, previousSlot string
	var previous domain.Booking
	var snapshot []byte
	var cancelled *time.Time
	var updated time.Time
	err = tx.QueryRow(ctx, `SELECT p.lead_id,p.contact_id::text,p.provider_updated_at,b.slot_id,b.payload,b.cancelled_at
 FROM bia_go.clickmax_public_bookings p JOIN bia_go.bookings b ON b.id=p.booking_id WHERE p.appointment_id=$1`, a.ID).
		Scan(&lead, &contact, &updated, &previousSlot, &snapshot, &cancelled)
	known := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	if known {
		if (verifiedLead != "" && lead != verifiedLead) || a.ContactID != contact || !a.UpdatedAt.After(updated) {
			return false, nil
		}
		if err = json.Unmarshal(snapshot, &previous); err != nil {
			return false, err
		}
	} else {
		if !a.Active() || (publicBooking && (!a.Start.After(now) || a.CreatedAt.IsZero() || a.CreatedAt.Before(since) || (verifiedLead == "" && a.Origin != "public_booking"))) {
			return false, nil
		}
		lead = verifiedLead
		if lead == "" {
			lead, err = matchClickMaxPublicLead(ctx, tx, a, since)
			if err != nil || lead == "" {
				return false, err
			}
		}
	}
	var stateRaw []byte
	if err = tx.QueryRow(ctx, `SELECT state FROM bia_go.leads WHERE id=$1 FOR UPDATE`, lead).Scan(&stateRaw); err != nil {
		return false, err
	}
	var state domain.State
	if err = json.Unmarshal(stateRaw, &state); err != nil {
		return false, err
	}
	if publicBooking && (state.Owner != "go" || (!known && (state.Human || state.OptedOut || state.Paused || !state.Profile.Consent))) {
		return false, nil
	}
	event := domain.Event{ID: "clickmax-public/" + a.ID + "/" + hash([]byte(a.UpdatedAt.UTC().Format(time.RFC3339Nano)))[:20], LeadID: lead, At: now.UTC()}
	bookingID := previous.ID
	switch {
	case a.Status == "cancelled" && known && cancelled == nil:
		if err = releaseClickMaxPublicBooking(ctx, tx, previous.ID, previousSlot, now); err != nil {
			return false, err
		}
		event.Kind, event.BookingID = "booking.cancelled", previous.ID
	case a.Active() && (known || verifiedLead != "" || a.Start.After(now)) && clickmax.ValidID(a.AttendantID):
		var closer int64
		err = tx.QueryRow(ctx, `INSERT INTO bia_go.clickmax_public_closers(attendant_id) VALUES($1)
 ON CONFLICT(attendant_id) DO UPDATE SET attendant_id=EXCLUDED.attendant_id RETURNING closer_id`, a.AttendantID).Scan(&closer)
		if err != nil {
			return false, err
		}
		meeting := clickMaxPublicRoom(a.MeetingLink)
		if known && cancelled == nil && previous.Start.Equal(a.Start) {
			if !previous.End.Equal(a.End) || previous.MeetingURL != meeting || previous.CloserID != closer {
				previous.End, previous.MeetingURL, previous.CloserID = a.End, meeting, closer
				payload, _ := json.Marshal(previous)
				if _, err = tx.Exec(ctx, `UPDATE bia_go.slots SET ends_at=$2,meeting_url=$3,closer_id=$4 WHERE id=$1`, previousSlot, a.End, meeting, closer); err != nil {
					return false, err
				}
				if _, err = tx.Exec(ctx, `UPDATE bia_go.bookings SET payload=$2 WHERE id=$1`, previous.ID, payload); err != nil {
					return false, err
				}
				event.Kind, event.Booking = "booking.rescheduled", &previous
			}
			break
		}
		var active, activeSlot string
		var activeEnd time.Time
		err = tx.QueryRow(ctx, `SELECT b.id,b.slot_id,s.ends_at FROM bia_go.bookings b JOIN bia_go.slots s ON s.id=b.slot_id
 WHERE b.lead_id=$1 AND b.cancelled_at IS NULL FOR UPDATE OF b`, lead).Scan(&active, &activeSlot, &activeEnd)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return false, err
		}
		if (active != "" && active != previous.ID && activeEnd.After(now)) ||
			(state.Booking != nil && state.Booking.ID != previous.ID && domain.HasActiveMeeting(state, now)) {
			return false, nil
		}
		if active != "" {
			if err = releaseClickMaxPublicBooking(ctx, tx, active, activeSlot, now); err != nil {
				return false, err
			}
		}
		bookingID = "cm_" + hash([]byte(event.ID))[:32]
		slotID := "slot_" + bookingID
		// Reuse a vacated slot on the same attendant and start. A conflicting
		// reservation aborts the transaction and cannot overwrite another lead.
		err = tx.QueryRow(ctx, `INSERT INTO bia_go.slots(id,starts_at,ends_at,closer_id,meeting_url,reserved_by,clickmax_public)
 VALUES($1,$2,$3,$4,$5,$6,true) ON CONFLICT(closer_id,starts_at) DO UPDATE SET
 ends_at=EXCLUDED.ends_at,meeting_url=EXCLUDED.meeting_url,reserved_by=EXCLUDED.reserved_by
 WHERE bia_go.slots.reserved_by IS NULL AND bia_go.slots.clickmax_public RETURNING id`, slotID, a.Start, a.End, closer, meeting, bookingID).Scan(&slotID)
		if err != nil {
			return false, err
		}
		b := domain.Booking{ID: bookingID, Provider: domain.ClickMaxPublicProvider, ClickMaxID: a.ID, ClickMaxScheduleID: a.ScheduleID, Start: a.Start, End: a.End, MeetingURL: meeting, CloserID: closer}
		payload, _ := json.Marshal(b)
		if _, err = tx.Exec(ctx, `INSERT INTO bia_go.bookings(id,operation_id,lead_id,slot_id,payload) VALUES($1,$2,$3,$4,$5)`, bookingID, event.ID, lead, slotID, payload); err != nil {
			return false, err
		}
		event.Kind, event.Booking = "booking.created", &b
		if active != "" {
			event.Kind = "booking.rescheduled"
		}
	}
	if bookingID == "" {
		return false, nil
	}
	if _, err = tx.Exec(ctx, `INSERT INTO bia_go.clickmax_public_bookings(appointment_id,contact_id,lead_id,booking_id,provider_updated_at)
 VALUES($1,$2,$3,$4,$5) ON CONFLICT(appointment_id) DO UPDATE SET booking_id=EXCLUDED.booking_id,provider_updated_at=EXCLUDED.provider_updated_at`, a.ID, a.ContactID, lead, bookingID, a.UpdatedAt); err != nil {
		return false, err
	}
	if event.Kind != "" {
		body, _ := json.Marshal(event)
		if _, err = tx.Exec(ctx, `INSERT INTO bia_go.jobs(id,lead_id,kind,mode,payload,fingerprint,due_at)
 VALUES($1,$2,'event','live',$3,$4,now()) ON CONFLICT DO NOTHING`, event.ID, lead, body, hash(body)); err != nil {
			return false, err
		}
		if _, err = tx.Exec(ctx, `UPDATE bia_go.jobs SET status='skipped',error_code='booking_changed',completed_at=now()
 WHERE lead_id=$1 AND kind='effect' AND status='pending' AND (id LIKE 'fx/%:offer' OR
   ($2<>'' AND payload->>'booking_id'=$2 AND ($3::boolean OR $4::boolean)))`, lead, previous.ID, event.Kind == "booking.cancelled", previous.ID != bookingID); err != nil {
			return false, err
		}
	}
	return event.Kind != "", tx.Commit(ctx)
}

func releaseClickMaxPublicBooking(ctx context.Context, tx pgx.Tx, booking, slot string, now time.Time) error {
	if _, err := tx.Exec(ctx, `UPDATE bia_go.bookings SET cancelled_at=$2 WHERE id=$1 AND cancelled_at IS NULL`, booking, now); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `UPDATE bia_go.slots SET reserved_by=NULL WHERE id=$1 AND reserved_by=$2`, slot, booking)
	return err
}

func matchClickMaxPublicLead(ctx context.Context, tx pgx.Tx, a clickmax.Appointment, since time.Time) (string, error) {
	var phones = []string{}
	if phone, err := domain.NormalizePhone("+" + strings.TrimPrefix(strings.TrimSpace(a.LeadPhone), "+")); err == nil {
		phones = WhatsAppPhoneVariants(phone)
	}
	rows, err := tx.Query(ctx, `SELECT l.id FROM bia_go.leads l
 LEFT JOIN bia_go.clickmax_cards c ON c.lead_id=l.id
 LEFT JOIN bia_go.lead_management m ON m.lead_id=l.id
 WHERE l.state->>'owner'='go' AND COALESCE(m.status,'open')='open' AND l.state#>>'{profile,consent}'='true'
 AND COALESCE(l.state->>'opted_out','false')<>'true'
 AND ((l.state->>'created_at')::timestamptz>=$1 OR (l.state->>'last_inbound')::timestamptz>=$1 OR (l.state->>'last_form_contact_at')::timestamptz>=$1)
 AND (c.contact_id IS NULL OR c.contact_id::text=$3)
 AND (l.state#>>'{profile,phone}'=ANY($2::text[]) OR
      (cardinality($2::text[])=0 AND c.contact_id::text=$3 AND c.card_id::text=$4))
 AND ($5='' OR COALESCE(l.state#>>'{profile,email}','')='' OR lower(l.state#>>'{profile,email}')=lower($5))
 LIMIT 2`, since, phones, a.ContactID, a.CardID, strings.TrimSpace(a.LeadEmail))
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var found string
	for rows.Next() {
		if found != "" {
			return "", nil
		}
		if err = rows.Scan(&found); err != nil {
			return "", err
		}
	}
	return found, rows.Err()
}

func clickMaxPublicRoom(raw string) string {
	u, err := url.Parse(raw)
	if err == nil && len(raw) <= 2048 && domain.ValidHTTPS(raw) && (u.Host == "meet.clickmax.io" || u.Host == "meet.google.com") {
		return raw
	}
	return ""
}
