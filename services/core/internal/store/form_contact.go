package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"github.com/jackc/pgx/v5"
)

func WhatsAppPhoneVariants(phone string) []string {
	key := testPhoneKey(phone)
	if key != phone {
		return []string{phone, key}
	}
	if strings.HasPrefix(phone, "+55") && len(phone) == 13 && phone[5] >= '6' && phone[5] <= '9' {
		return []string{phone, phone[:5] + "9" + phone[5:]}
	}
	return []string{phone}
}

// WhatsApp can report Brazilian mobiles with or without the ninth digit. Reuse
// an existing Twilio conversation; never overwrite its ownership or block flags.
func (d *DB) WhatsAppContact(ctx context.Context, phone string) (domain.State, error) {
	var raw []byte
	var s domain.State
	err := d.Pool.QueryRow(ctx, `SELECT state FROM bia_go.leads WHERE state->'profile'->>'phone'=ANY($1::text[]) AND (state->'profile'->>'phone'=$2 OR state->'profile'->>'conversation_id' LIKE 'twilio:%') ORDER BY (state->'profile'->>'phone'=$2) DESC LIMIT 1`, WhatsAppPhoneVariants(phone), phone).Scan(&raw)
	if err == nil {
		err = json.Unmarshal(raw, &s)
	}
	return s, err
}

// Activating and enqueueing the form event are one transaction. Repeated POSTs
// (including retries after a lost response) never create another contact job.
func (d *DB) ActivateTestForm(ctx context.Context, id, mode, sender string) (string, error) {
	if mode != "live" && mode != "shadow" {
		return "", errors.New("invalid_mode")
	}
	tx, err := d.Pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var raw []byte
	var eventID, lead *string
	var expires time.Time
	var slotID string
	err = tx.QueryRow(ctx, `SELECT profile,contact_event_id,claimed_by,expires_at,selected_slot_id FROM bia_go.test_forms WHERE id=$1 FOR UPDATE`, id).Scan(&raw, &eventID, &lead, &expires, &slotID)
	if err != nil {
		return "", err
	}
	if eventID != nil {
		return *eventID, tx.Commit(ctx)
	}
	if !expires.After(time.Now()) {
		return "", ErrConflict
	}
	var f domain.Form
	if err = json.Unmarshal(raw, &f); err != nil {
		return "", err
	}
	if err = prepareFormContact(ctx, tx, &f, sender); err != nil {
		return "", err
	}
	leadID, contactEventID := domain.LeadKey(f.Phone), "form-contact-"+id
	if err = enqueueFormContact(ctx, tx, contactEventID, mode, f, "", clickmax.Appointment{}); err != nil {
		return "", err
	}
	if slotID != "" {
		if mode != "live" {
			return "", &FormBookingError{Code: "live_calendar_required"}
		}
		if _, _, err = reserveFormSlot(ctx, tx, "form-booking:"+id, leadID, slotID, f, mode, d.DualCalendar); err != nil {
			return "", err
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE bia_go.test_forms SET contact_event_id=$2,claimed_by=$3,claimed_at=now() WHERE id=$1`, id, contactEventID, leadID); err != nil {
		return "", err
	}
	return contactEventID, tx.Commit(ctx)
}

// SubmitProductionForm records the form and its durable execution job in one
// transaction. The fingerprint describes the submitted data, before resolving
// the lead's existing phone variant or WhatsApp conversation.
func (d *DB) SubmitProductionForm(ctx context.Context, id, sender string, f domain.Form, appointment clickmax.Appointment) (eventID string, duplicate bool, err error) {
	eventID = "bia-intake-" + id
	raw, err := json.Marshal(f)
	if err != nil {
		return "", false, err
	}
	fingerprint := hash(raw)
	tx, err := d.Pool.Begin(ctx)
	if err != nil {
		return "", false, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, eventID); err != nil {
		return "", false, err
	}
	var existing string
	err = tx.QueryRow(ctx, `SELECT fingerprint FROM bia_go.jobs WHERE id=$1`, eventID).Scan(&existing)
	if err == nil {
		if existing != fingerprint {
			return "", false, ErrConflict
		}
		return eventID, true, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", false, err
	}
	if appointment.ID != "" {
		if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "clickmax-public/"+appointment.ID); err != nil {
			return "", false, err
		}
		var linked bool
		err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM bia_go.clickmax_public_bookings p
 JOIN bia_go.leads l ON l.id=p.lead_id JOIN bia_go.bookings b ON b.id=p.booking_id
 WHERE p.appointment_id=$1 AND p.contact_id=$2 AND b.cancelled_at IS NULL
 AND l.state#>>'{profile,phone}'=ANY($3::text[]))`, appointment.ID, appointment.ContactID, WhatsAppPhoneVariants(f.Phone)).Scan(&linked)
		if err != nil {
			return "", false, err
		}
		if linked {
			return "", true, tx.Commit(ctx)
		}
		// The authenticated intake has verified this exact appointment, calendar,
		// contact and phone against ClickMax. Legacy form bridges can label a
		// real reservation as CRM/automation instead of public_booking.
	}
	if err = prepareFormContact(ctx, tx, &f, sender); err != nil {
		return "", false, err
	}
	if err = enqueueFormContact(ctx, tx, eventID, "live", f, fingerprint, appointment); err != nil {
		return "", false, err
	}
	return eventID, false, tx.Commit(ctx)
}

func prepareFormContact(ctx context.Context, tx pgx.Tx, f *domain.Form, sender string) error {
	// Serialize alternate spellings of the same phone across simultaneous forms.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "form-contact:"+testPhoneKey(f.Phone)); err != nil {
		return err
	}
	var existing []byte
	err := tx.QueryRow(ctx, `SELECT state FROM bia_go.leads WHERE state->'profile'->>'phone'=ANY($1::text[]) ORDER BY (state->'profile'->>'phone'=$2) DESC LIMIT 1`, WhatsAppPhoneVariants(f.Phone), f.Phone).Scan(&existing)
	if err == nil {
		var s domain.State
		if err = json.Unmarshal(existing, &s); err != nil {
			return err
		}
		f.Phone = s.Profile.Phone
		f.ConversationID = s.Profile.ConversationID
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if f.ConversationID == "" {
		f.ConversationID = "twilio:" + sender + ":" + f.Phone
	}
	return nil
}

func enqueueFormContact(ctx context.Context, tx pgx.Tx, eventID, mode string, f domain.Form, fingerprint string, appointment clickmax.Appointment) error {
	leadID := domain.LeadKey(f.Phone)
	now := time.Now().UTC()
	initial, _ := json.Marshal(domain.State{ID: leadID, Owner: "go", Stage: "new", CreatedAt: now, Profile: domain.Form{Phone: f.Phone, ConversationID: f.ConversationID}})
	if _, err := tx.Exec(ctx, `INSERT INTO bia_go.leads(id,state) VALUES($1,$2) ON CONFLICT DO NOTHING`, leadID, initial); err != nil {
		return err
	}
	ev := domain.Event{ID: eventID, LeadID: leadID, Kind: "form.contact_requested", At: now, Form: &f, BookingID: appointment.ID, ClickMaxScheduleID: appointment.ScheduleID}
	if err := domain.ValidateEvent(ev); err != nil {
		return err
	}
	raw, _ := json.Marshal(ev)
	if fingerprint == "" {
		ev.At = time.Time{}
		fp, _ := json.Marshal(ev)
		fingerprint = hash(fp)
	}
	ct, err := tx.Exec(ctx, `INSERT INTO bia_go.jobs(id,lead_id,kind,mode,payload,fingerprint,due_at) VALUES($1,$2,'event',$3,$4,$5,now()) ON CONFLICT DO NOTHING`, eventID, leadID, mode, raw, fingerprint)
	if err != nil {
		return err
	}
	if ct.RowsAffected() != 1 {
		return ErrConflict
	}
	return nil
}
