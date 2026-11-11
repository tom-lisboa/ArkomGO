package integration

import (
	"context"
	"testing"
	"time"

	"arkom/bia/internal/domain"
	"arkom/bia/internal/providers"
	"arkom/bia/internal/schedulingworker"
)

func TestBookingConfirmationWaitsForQuota(t *testing.T) {
	db := setup(t)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)
	s := testState("confirmation-quota", now)
	s.LastInbound = now
	s.Booking = &domain.Booking{ID: "quota-booking", Provider: domain.ClickMaxPublicProvider, Start: now.Add(2 * time.Hour), End: now.Add(3 * time.Hour)}
	past := scheduledMessage("quota-already-sent", s, "reply", now)
	confirmation := scheduledMessage("quota-confirmation", s, "booking_confirmation", now)
	confirmation.Expires = s.Booking.Start
	publishEffects(t, db, "seed-confirmation-quota", s, past, confirmation)
	sentAt := now.Add(-30 * time.Minute)
	if _, err := db.Pool.Exec(ctx, `UPDATE bia_go.jobs SET status='done',completed_at=$2 WHERE id=$1`, past.ID, sentAt); err != nil {
		t.Fatal(err)
	}
	messenger := &countingMessenger{}
	w := runtimeWorker(db, now, messenger)
	w.GlobalHourly = 1
	sw := schedulingworker.New(*w, &providers.LocalCalendar{Pool: db.Pool})
	makeDue := func() {
		t.Helper()
		// Force a repeated claim without advancing the finalized-send window.
		// An old due_at must still count against the cap once the job is leased.
		if _, err := db.Pool.Exec(ctx, `UPDATE bia_go.jobs SET due_at=now()-interval '2 hours' WHERE id=$1`, confirmation.ID); err != nil {
			t.Fatal(err)
		}
	}
	for range 6 {
		makeDue()
		step(t, sw, true)
		var due time.Time
		var status, reason string
		var attempts int
		err := db.Pool.QueryRow(ctx, `SELECT status,error_code,due_at,attempts FROM bia_go.jobs WHERE id=$1`, confirmation.ID).Scan(&status, &reason, &due, &attempts)
		if err != nil || status != "pending" || reason != "send_rate_limit" || attempts != 0 ||
			due.Before(sentAt.Add(time.Hour)) || due.After(sentAt.Add(time.Hour+2*time.Second)) {
			t.Fatalf("confirmation lost its place or retry budget: %s %s %s %d, %v", status, reason, due, attempts, err)
		}
		step(t, sw, false)
	}
	if messenger.Count.Load() != 0 {
		t.Fatal("sent before quota reopened")
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE bia_go.jobs SET completed_at=now()-interval '1 hour 1 second' WHERE id=$1`, past.ID); err != nil {
		t.Fatal(err)
	}
	makeDue()
	step(t, sw, true)
	step(t, sw, false)
	assertJob(t, db, confirmation.ID, "scheduling", "done")
	if messenger.Count.Load() != 1 {
		t.Fatalf("expected exactly one delivery, got %d", messenger.Count.Load())
	}
}
