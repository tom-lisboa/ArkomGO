package schedulingworker

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"arkom/bia/internal/providers"
	"arkom/bia/internal/store"
	"github.com/jackc/pgx/v5"
)

type teamBooking struct {
	key, lead, contact, schedule, card string
	start, end, dispatched             time.Time
	appointment, failure, replaces     string
}

const teamBookingColumns = `operation_id,lead_id,contact_id::text,schedule_id::text,COALESCE(card_id::text,''),
 starts_at,ends_at,dispatched_at,COALESCE(appointment_id::text,''),COALESCE(failure,''),COALESCE(replaces_appointment_id::text,'')`

func scanTeamBooking(row pgx.Row) (teamBooking, error) {
	var op teamBooking
	err := row.Scan(&op.key, &op.lead, &op.contact, &op.schedule, &op.card, &op.start, &op.end, &op.dispatched, &op.appointment, &op.failure, &op.replaces)
	return op, err
}

func (o teamBooking) notes() string {
	return fmt.Sprintf("Arkom Bia %x", sha256.Sum256([]byte(o.key)))
}

func (o teamBooking) matches(a clickmax.Appointment) bool {
	return clickmax.ValidID(a.ID) && clickmax.ValidID(a.AttendantID) && a.Active() && !a.UpdatedAt.IsZero() &&
		a.ContactID == o.contact && a.ScheduleID == o.schedule && (o.card == "" || a.CardID == o.card) &&
		a.Start.Equal(o.start) && a.End.Equal(o.end) &&
		((o.replaces != "" && a.ID == o.replaces) || (o.replaces == "" && a.Notes == o.notes()))
}

func (c ClickMaxPublic) Book(ctx context.Context, key string, s domain.State, slot domain.Slot, old *domain.Booking, now time.Time) error {
	var replaces string
	if old != nil {
		replaces = old.ClickMaxID
	}
	op, err := scanTeamBooking(c.DB.Pool.QueryRow(ctx, `SELECT `+teamBookingColumns+` FROM bia_go.clickmax_team_booking_attempts WHERE operation_id=$1`, key))
	if err == nil {
		if op.lead != s.ID || op.schedule != c.ScheduleID || op.replaces != replaces || !op.start.Equal(slot.Start) || !op.end.Equal(slot.End) {
			return &providers.Failure{Code: "clickmax_team_operation_mismatch", Ambiguous: true}
		}
		if op.appointment != "" {
			return nil
		}
		if op.failure != "" {
			return &providers.Failure{Code: op.failure}
		}
		found, err := c.reconcileTeamBooking(ctx, op, now)
		if err == nil && found {
			return nil
		}
		if now.Sub(op.dispatched) > 90*time.Second {
			return &providers.Failure{Code: "clickmax_team_booking_requires_review", Ambiguous: true}
		}
		return &providers.Deferred{Code: "clickmax_team_booking_pending", After: 5 * time.Second}
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if slot.Provider != domain.ClickMaxPublicProvider || !slot.Start.After(now.Add(30*time.Minute)) || !slot.End.After(slot.Start) {
		return &providers.Failure{Code: "clickmax_slot_no_longer_available"}
	}
	if s.OptedOut || s.Paused || s.Human || s.Owner != "go" {
		return &providers.Failure{Code: "clickmax_booking_contact_blocked"}
	}
	if old != nil {
		// Another queued choice can arrive while the first update is being
		// reconciled. A moved remote time is then expected, not a reason
		// to send the conversation to a human or suppress the original retry.
		if err := c.waitForTeamReplacement(ctx, s.ID, replaces); err != nil {
			return err
		}
		a, err := c.currentTeamAppointment(ctx, s.ID, *old)
		if err != nil {
			return err
		}
		if !a.Active() || !a.Start.After(now) || (slot.Start.Before(a.End) && slot.End.After(a.Start)) {
			return &providers.Failure{Code: "clickmax_booking_changed"}
		}
		return c.submitTeamBooking(ctx, key, s, slot, a.ContactID, a.CardID, a.ID, now)
	}
	contact, code, err := store.FindClickMaxContact(ctx, c.Client, s.Profile)
	if err != nil {
		return &providers.Deferred{Code: "clickmax_contact_lookup_unavailable", After: 5 * time.Second}
	}
	if code != "" {
		return &providers.Failure{Code: code}
	}
	card, err := c.cardForBooking(ctx, s.ID, contact)
	if err != nil {
		return &providers.Deferred{Code: "clickmax_card_lookup_unavailable", After: 5 * time.Second}
	}
	calls, err := c.Client.Appointments(ctx, "", contact, now.Add(-24*time.Hour), time.Time{})
	if err != nil {
		return &providers.Deferred{Code: "clickmax_appointment_lookup_pending", After: 5 * time.Second}
	}
	for _, a := range calls {
		if a.ScheduleID == c.ScheduleID && a.Active() && a.End.After(now) {
			if err := c.DB.RecordClickMaxTeamBooking(ctx, a, s.ID, now); err != nil {
				return &providers.Failure{Code: "clickmax_existing_booking_requires_review", Ambiguous: true}
			}
			return nil
		}
	}
	return c.submitTeamBooking(ctx, key, s, slot, contact, card, "", now)
}

func (c ClickMaxPublic) submitTeamBooking(ctx context.Context, key string, s domain.State, slot domain.Slot, contact, card, replaces string, now time.Time) error {
	available, err := c.Availability.Available(ctx, s, slot)
	if err != nil {
		return &providers.Deferred{Code: "clickmax_team_availability_unavailable", After: 5 * time.Second}
	}
	if !available {
		return &providers.Failure{Code: "clickmax_slot_no_longer_available"}
	}
	// Only the process that writes this durable intent may send the POST.
	// After a timeout, the operation is recovered by reading, never reposted.
	op, err := scanTeamBooking(c.DB.Pool.QueryRow(ctx, `INSERT INTO bia_go.clickmax_team_booking_attempts
 (operation_id,lead_id,contact_id,schedule_id,card_id,starts_at,ends_at,replaces_appointment_id)
 VALUES($1,$2,$3,$4,NULLIF($5,'')::uuid,$6,$7,NULLIF($8,'')::uuid)
 ON CONFLICT DO NOTHING RETURNING `+teamBookingColumns, key, s.ID, contact, c.ScheduleID, card, slot.Start, slot.End, replaces))
	if errors.Is(err, pgx.ErrNoRows) {
		return &providers.Deferred{Code: "clickmax_team_booking_pending", After: 5 * time.Second}
	}
	if err != nil {
		return err
	}
	target := clickmax.Appointment{
		ID: op.replaces, ContactID: op.contact, ScheduleID: op.schedule, CardID: op.card,
		Start: op.start, End: op.end, Notes: op.notes(),
	}
	var a clickmax.Appointment
	var writeErr error
	if op.replaces != "" {
		// Change the existing appointment in one ClickMax write. Its old
		// time remains booked until ClickMax accepts the update.
		a, writeErr = c.Client.RescheduleAppointment(ctx, target)
	} else {
		a, writeErr = c.Client.BookTeamAppointment(ctx, target)
	}
	err = writeErr
	if err == nil && !op.matches(a) && clickmax.ValidID(a.ID) {
		a, err = c.Client.Appointment(ctx, a.ID)
	}
	if err == nil && op.matches(a) {
		if err = c.finishTeamBooking(ctx, op, a, now); err == nil {
			return nil
		}
	}
	var rejected *clickmax.RequestError
	if errors.As(writeErr, &rejected) && (rejected.Status == 400 || rejected.Status == 401 || rejected.Status == 403 || rejected.Status == 409 || rejected.Status == 422) {
		code := "clickmax_team_booking_rejected"
		if rejected.Status == 409 || strings.EqualFold(rejected.Code, "slot_not_available") {
			code = "clickmax_slot_no_longer_available"
		}
		if _, err = c.DB.Pool.Exec(ctx, `UPDATE bia_go.clickmax_team_booking_attempts SET failure=$2 WHERE operation_id=$1`, key, code); err != nil {
			return err
		}
		return &providers.Failure{Code: code}
	}
	return &providers.Deferred{Code: "clickmax_team_booking_pending", After: 5 * time.Second}
}

func (c ClickMaxPublic) cardForBooking(ctx context.Context, lead, contact string) (string, error) {
	if c.IntakeOnly {
		// The primary CRM card can belong to a different workspace.
		return "", nil
	}
	var card string
	err := c.DB.Pool.QueryRow(ctx, `SELECT card_id::text FROM bia_go.clickmax_cards
 WHERE lead_id=$1 AND contact_id=$2 AND pipeline_id=$3`, lead, contact, c.PipelineID).Scan(&card)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return card, err
}

func (c ClickMaxPublic) finishTeamBooking(ctx context.Context, op teamBooking, a clickmax.Appointment, now time.Time) error {
	if err := c.DB.RecordClickMaxTeamBooking(ctx, a, op.lead, now); err != nil {
		return err
	}
	_, err := c.DB.Pool.Exec(ctx, `UPDATE bia_go.clickmax_team_booking_attempts SET appointment_id=$2 WHERE operation_id=$1 AND failure IS NULL`, op.key, a.ID)
	return err
}

func (c ClickMaxPublic) reconcileTeamBooking(ctx context.Context, op teamBooking, now time.Time) (bool, error) {
	if op.replaces != "" {
		a, err := c.Client.Appointment(ctx, op.replaces)
		if err != nil || !op.matches(a) {
			return false, err
		}
		return true, c.finishTeamBooking(ctx, op, a, now)
	}
	calls, err := c.Client.Appointments(ctx, "", op.contact, op.start.Add(-time.Second), op.end)
	if err != nil {
		return false, err
	}
	var matched *clickmax.Appointment
	for _, a := range calls {
		if a.Notes != op.notes() {
			continue
		}
		if matched != nil || !op.matches(a) {
			return false, errors.New("clickmax_team_booking_unverified")
		}
		matched = &a
	}
	if matched == nil {
		return false, nil
	}
	return true, c.finishTeamBooking(ctx, op, *matched, now)
}

func (c ClickMaxPublic) reconcileTeamBookings(ctx context.Context, now time.Time) error {
	rows, err := c.DB.Pool.Query(ctx, `SELECT `+teamBookingColumns+` FROM bia_go.clickmax_team_booking_attempts
 WHERE schedule_id=$1 AND appointment_id IS NULL AND failure IS NULL
 AND dispatched_at BETWEEN $2 AND $3 ORDER BY checked_at NULLS FIRST, dispatched_at LIMIT 8`, c.ScheduleID, now.Add(-10*time.Minute), now.Add(-10*time.Second))
	if err != nil {
		return err
	}
	pending, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (teamBooking, error) {
		return scanTeamBooking(row)
	})
	if err != nil {
		return err
	}
	for _, op := range pending {
		if _, e := c.DB.Pool.Exec(ctx, `UPDATE bia_go.clickmax_team_booking_attempts SET checked_at=$2 WHERE operation_id=$1`, op.key, now); e != nil {
			return e
		}
		readCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		_, e := c.reconcileTeamBooking(readCtx, op, now)
		cancel()
		if e != nil {
			err = e
		}
	}
	return err
}

func (c ClickMaxPublic) currentTeamAppointment(ctx context.Context, lead string, booking domain.Booking) (clickmax.Appointment, error) {
	var contact string
	if booking.Provider != domain.ClickMaxPublicProvider || !clickmax.ValidID(booking.ClickMaxID) {
		return clickmax.Appointment{}, &providers.Failure{Code: "clickmax_booking_changed"}
	}
	err := c.DB.Pool.QueryRow(ctx, `SELECT contact_id::text FROM bia_go.clickmax_public_bookings
 WHERE appointment_id=$1 AND lead_id=$2 AND booking_id=$3`, booking.ClickMaxID, lead, booking.ID).Scan(&contact)
	if errors.Is(err, pgx.ErrNoRows) {
		return clickmax.Appointment{}, &providers.Failure{Code: "clickmax_booking_changed"}
	}
	if err != nil {
		return clickmax.Appointment{}, err
	}
	a, err := c.Client.Appointment(ctx, booking.ClickMaxID)
	if err != nil {
		return a, &providers.Deferred{Code: "clickmax_appointment_lookup_pending", After: 5 * time.Second}
	}
	if a.ContactID != contact || a.ScheduleID != c.ScheduleID || !a.Start.Equal(booking.Start) || !a.End.Equal(booking.End) {
		return a, &providers.Failure{Code: "clickmax_booking_changed"}
	}
	return a, nil
}

func (c ClickMaxPublic) waitForTeamReplacement(ctx context.Context, lead, appointment string) error {
	if !clickmax.ValidID(appointment) {
		return &providers.Failure{Code: "clickmax_booking_changed"}
	}
	var pending bool
	err := c.DB.Pool.QueryRow(ctx, `SELECT EXISTS(
 SELECT 1 FROM bia_go.clickmax_public_bookings p
 JOIN bia_go.clickmax_team_booking_attempts a ON a.contact_id=p.contact_id AND a.schedule_id=$3
 WHERE p.appointment_id=$2 AND p.lead_id=$1 AND a.replaces_appointment_id=p.appointment_id
 AND a.appointment_id IS NULL AND a.failure IS NULL)`, lead, appointment, c.ScheduleID).Scan(&pending)
	if err != nil {
		return err
	}
	if pending {
		return &providers.Deferred{Code: "clickmax_team_booking_pending", After: 5 * time.Second}
	}
	return nil
}

func (c ClickMaxPublic) Cancel(ctx context.Context, s domain.State, booking domain.Booking, now time.Time) error {
	if err := c.waitForTeamReplacement(ctx, s.ID, booking.ClickMaxID); err != nil {
		return err
	}
	a, err := c.currentTeamAppointment(ctx, s.ID, booking)
	if err != nil {
		return err
	}
	if a.Active() {
		_, err = c.Client.CancelAppointment(ctx, a.ID)
		if err == nil {
			a, err = c.Client.Appointment(ctx, a.ID)
		}
	}
	if err != nil || a.Status != "cancelled" {
		return &providers.Failure{Code: "clickmax_cancellation_requires_review", Ambiguous: true}
	}
	return c.DB.RecordClickMaxTeamBooking(ctx, a, s.ID, now)
}
