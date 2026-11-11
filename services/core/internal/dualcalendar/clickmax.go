package dualcalendar

import (
	"context"
	"errors"
	"strings"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"arkom/bia/internal/googlecalendar"
	"arkom/bia/internal/providers"
	"github.com/jackc/pgx/v5"
)

type clickMaxCapacity struct {
	blocks      []googlecalendar.Interval
	extraFuture int
	err         error
}

func (c *Service) loadClickMaxCapacity(ctx context.Context, attendant string, now time.Time, localIDs []string) clickMaxCapacity {
	if c.ClickMax == nil {
		return clickMaxCapacity{err: errors.New("clickmax_calendar_unconfigured")}
	}
	// Include meetings already in progress in addition to future bookings.
	items, err := c.ClickMax.Appointments(ctx, attendant, "", now.Add(-24*time.Hour), time.Time{})
	data := clickMaxCapacity{err: err}
	local := make(map[string]bool, len(localIDs))
	for _, id := range localIDs {
		local[id] = true
	}
	for _, a := range items {
		if a.Status != "cancelled" && a.End.After(now) {
			data.blocks = append(data.blocks, googlecalendar.Interval{Start: a.Start, End: a.End})
		}
		if a.Active() && a.Start.After(now) && !local[a.ID] {
			data.extraFuture++
			local[a.ID] = true
		}
	}
	return data
}

type clickMaxBinding struct {
	Attendant string `json:"attendant"`
	Contact   string `json:"contact"`
	Card      string `json:"card,omitempty"`
}

func (c *Service) bindClickMaxContact(ctx context.Context, tx pgx.Tx, s domain.State, attendant string) (clickMaxBinding, error) {
	b := clickMaxBinding{Attendant: attendant}
	if c.ClickMax == nil {
		return b, &providers.Failure{Code: "clickmax_calendar_unconfigured"}
	}
	err := tx.QueryRow(ctx, `SELECT card_id::text, contact_id::text FROM bia_go.clickmax_cards WHERE lead_id=$1`, s.ID).Scan(&b.Card, &b.Contact)
	unavailable := &providers.Deferred{Code: "clickmax_contact_lookup_unavailable", After: 5 * time.Second}
	unverified := &providers.Failure{Code: "clickmax_contact_unverified"}
	var contact clickmax.Contact
	if errors.Is(err, pgx.ErrNoRows) {
		email := strings.TrimSpace(s.Profile.Email)
		if email == "" {
			return b, unverified
		}
		items, err := c.ClickMax.ContactsByEmail(ctx, email)
		if err != nil {
			return b, unavailable
		}
		if len(items) != 1 || !strings.EqualFold(items[0].Email, email) {
			return b, unverified
		}
		contact = items[0]
	} else if err != nil {
		return b, err
	} else {
		card, err := c.ClickMax.Card(ctx, b.Card)
		if err != nil {
			return b, unavailable
		}
		found := false
		for _, id := range card.LeadIDs {
			if id == b.Contact {
				found = true
				break
			}
		}
		if !found || card.Status != "open" {
			return b, unverified
		}
		contact, err = c.ClickMax.Contact(ctx, b.Contact)
		if err != nil {
			return b, unavailable
		}
	}
	phone, err := domain.NormalizePhone("+" + strings.TrimPrefix(strings.TrimSpace(contact.Phone), "+"))
	if err != nil || phone != s.Profile.Phone || !clickmax.ValidID(contact.ID) {
		return b, unverified
	}
	b.Contact = contact.ID
	return b, nil
}

func (c *Service) applyClickMax(ctx context.Context, tx pgx.Tx, o operation, allowDispatch bool) (string, error) {
	review := func() error {
		err := c.pending(ctx, o.Key, "clickmax_booking_requires_review")
		if o.Dispatched != nil && time.Since(*o.Dispatched) > 2*time.Minute {
			return &providers.Failure{Code: "clickmax_booking_requires_review", Ambiguous: true}
		}
		return err
	}
	if c.ClickMax == nil {
		return "", c.pending(ctx, o.Key, "clickmax_calendar_unconfigured")
	}
	b := o.Intent.ClickMax
	target := clickmax.Appointment{ID: o.Event, ContactID: b.Contact, AttendantID: b.Attendant, Start: o.Intent.Slot.Start, End: o.Intent.Slot.End}
	match := func(a clickmax.Appointment) bool {
		return clickmax.ValidID(a.ID) && (target.ID == "" || target.ID == a.ID) && a.ContactID == b.Contact && a.AttendantID == b.Attendant
	}
	window := func(a clickmax.Appointment) bool { return a.Start.Equal(target.Start) && a.End.Equal(target.End) }
	if target.ID == "" {
		target.Notes = "Arkom Bia " + digest(o.Key)
		from, to, attendant := time.Now(), time.Time{}, ""
		if o.Dispatched != nil {
			from, to, attendant = target.Start.Add(-time.Second), target.End, b.Attendant
		}
		calls, err := c.ClickMax.Appointments(ctx, attendant, b.Contact, from, to)
		if err != nil {
			if o.Dispatched != nil {
				return "", review()
			}
			return "", c.pending(ctx, o.Key, "clickmax_appointment_lookup_pending")
		}
		if o.Dispatched != nil {
			var id string
			for _, a := range calls {
				if a.Notes != target.Notes {
					continue
				}
				if id != "" || !match(a) || !window(a) || !a.Active() {
					return "", review()
				}
				id = a.ID
			}
			if id != "" {
				return id, nil
			}
			return "", review()
		}
		for _, a := range calls {
			if a.Active() {
				return "", failIntent(ctx, tx, o.Key, "clickmax_contact_already_booked")
			}
		}
	} else {
		a, err := c.ClickMax.Appointment(ctx, target.ID)
		if err != nil {
			if o.Dispatched != nil {
				return "", review()
			}
			return "", c.pending(ctx, o.Key, "clickmax_appointment_lookup_pending")
		}
		if !match(a) {
			return "", review()
		}
		if o.Kind == "cancel" && a.Status == "cancelled" {
			return a.ID, nil
		}
		if o.Kind == "book" && a.Active() && window(a) {
			return a.ID, nil
		}
		if o.Dispatched != nil {
			return "", review()
		}
		expected := o.Intent.Slot
		if o.Intent.Old != nil && o.Kind == "book" {
			expected.Start, expected.End = o.Intent.Old.Start, o.Intent.Old.End
		}
		if !a.Active() || !a.Start.Equal(expected.Start) || !a.End.Equal(expected.End) {
			return "", failIntent(ctx, tx, o.Key, "clickmax_booking_changed")
		}
	}
	if o.Kind == "book" {
		if !target.Start.After(time.Now().Add(30 * time.Minute)) {
			return "", failIntent(ctx, tx, o.Key, "clickmax_slot_expired")
		}
		if !allowDispatch {
			return "", c.pending(ctx, o.Key, "clickmax_booking_awaiting_worker")
		}
		// ClickMax checks the seller's availability on create and update,
		// but update also needs this explicit check for other appointments.
		remote := c.loadClickMaxCapacity(ctx, b.Attendant, time.Now(), nil)
		blocks, err := c.busy(ctx, candidate{Slot: o.Intent.Slot, User: o.User, Account: o.Account, Calendar: o.Calendar}, target.Start, target.End)
		if remote.err != nil || err != nil {
			return "", c.pending(ctx, o.Key, "calendar_availability_unavailable")
		}
		if overlaps(remote.blocks, target.Start, target.End) || overlaps(blocks, target.Start, target.End) {
			return "", failIntent(ctx, tx, o.Key, "clickmax_slot_no_longer_available")
		}
	}
	// ClickMax does not document an idempotency key. Commit the attempt
	// before writing, while the current transaction keeps the operation lock.
	// An uncertain response is reconciled by reading, never by a second POST.
	tag, err := c.Pool.Exec(ctx, `UPDATE bia_go.google_booking_ops SET dispatched_at=now() WHERE operation_id=$1 AND dispatched_at IS NULL AND status='pending'`, o.Key)
	if err != nil {
		return "", err
	}
	if tag.RowsAffected() != 1 {
		return "", c.pending(ctx, o.Key, "clickmax_booking_requires_review")
	}
	var a clickmax.Appointment
	switch {
	case o.Kind == "cancel":
		a, err = c.ClickMax.CancelAppointment(ctx, target.ID)
	case target.ID != "":
		a, err = c.ClickMax.RescheduleAppointment(ctx, target)
	default:
		a, err = c.ClickMax.BookAppointment(ctx, target, b.Card)
	}
	if err != nil {
		var rejected *clickmax.RequestError
		if errors.As(err, &rejected) {
			switch rejected.Status {
			case 400, 409:
				if o.Kind == "book" {
					return "", failIntent(ctx, tx, o.Key, "clickmax_slot_no_longer_available")
				}
			case 401, 403:
				return "", failIntent(ctx, tx, o.Key, "clickmax_calendar_access_denied")
			}
		}
		return "", c.pending(ctx, o.Key, "clickmax_booking_requires_review")
	}
	if !match(a) || (o.Kind == "cancel" && a.Status != "cancelled") ||
		(o.Kind == "book" && (!a.Active() || !window(a) || (target.ID == "" && a.Notes != target.Notes))) {
		return "", c.pending(ctx, o.Key, "clickmax_booking_requires_review")
	}
	return a.ID, nil
}
