package calendarworker

import (
	"context"
	"errors"
	"sdr-next-pilot/pkg/sdrsdk"
	"time"
)

var ErrUnavailable = errors.New("calendar_provider_unavailable")
var ErrConflict = errors.New("calendar_provider_conflict")
var ErrNotFound = errors.New("calendar_event_not_found")
var ErrUncertain = errors.New("calendar_effect_uncertain")

type Provider interface {
	Busy(context.Context, sdrsdk.CalendarRef, time.Time, time.Time, string) ([]sdrsdk.CalendarInterval, error)
	Get(context.Context, sdrsdk.CalendarRef, string) (sdrsdk.CalendarEvent, error)
	Apply(context.Context, sdrsdk.CalendarRef, string, sdrsdk.CalendarEvent) (sdrsdk.CalendarEvent, error)
}
type Worker struct {
	Queue    sdrsdk.CalendarQueue
	Provider func(sdrsdk.CalendarJob) Provider
}

func (w *Worker) Once(parent context.Context) (bool, error) {
	ctx, cancel := context.WithTimeout(parent, 60*time.Second)
	defer cancel()
	j, ok, e := w.Queue.ClaimCalendar(ctx)
	if !ok || e != nil {
		return ok, e
	}
	r := sdrsdk.CalendarResult{Status: "failed"}
	provider := w.Provider(j)
	if j.Reconcile {
		r = w.reconcile(ctx, j, provider)
	} else {
		r = w.perform(ctx, j, provider)
	}
	e = w.Queue.CompleteCalendar(ctx, j, r)
	for retry := 0; retry < 2 && errors.Is(e, sdrsdk.ErrUnavailable); retry++ {
		select {
		case <-ctx.Done():
			return true, ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
		e = w.Queue.CompleteCalendar(ctx, j, r)
	}
	if errors.Is(e, sdrsdk.ErrStale) {
		return true, nil
	}
	return true, e
}
func (w *Worker) perform(ctx context.Context, j sdrsdk.CalendarJob, p Provider) sdrsdk.CalendarResult {
	fail := func(code string) sdrsdk.CalendarResult { return sdrsdk.CalendarResult{Status: "failed", Error: code} }
	busy := map[string][]sdrsdk.CalendarInterval{}
	from, to := j.Input.From.Add(-4*time.Hour), j.Input.To.Add(4*time.Hour)
	if j.Slot != nil {
		from = j.Slot.Start.Add(-4 * time.Hour)
		to = j.Slot.End.Add(4 * time.Hour)
	}
	if j.Input.Kind != "cancel" {
		for _, c := range j.Calendars {
			busy[c.ID] = append([]sdrsdk.CalendarInterval(nil), j.Busy[c.ID]...)
			if c.Provider == "google" {
				exclude := ""
				if j.Input.BookingID != "" && c.ID == j.Calendars[0].ID {
					exclude = j.Event.ID
				}
				b, e := p.Busy(ctx, c, from, to, exclude)
				if e != nil {
					return fail("calendar_unavailable")
				}
				busy[c.ID] = append(busy[c.ID], b...)
			}
		}
	}
	if j.Input.Kind == "availability" {
		slots, limited, e := Slots(j, busy)
		if e != nil {
			return fail("invalid_availability_query")
		}
		return sdrsdk.CalendarResult{Status: "completed", Slots: slots, Limited: limited}
	}
	if len(j.Calendars) == 0 {
		return fail("calendar_unavailable")
	}
	primary := j.Calendars[0]
	if j.Input.Kind != "cancel" {
		if j.Slot == nil {
			return fail("slot_unavailable")
		}
		for _, c := range j.Calendars {
			if !Fits(c, j.Slot.Start, j.Slot.End, j.Now, busy[c.ID]) {
				return fail("slot_unavailable")
			}
		}
	}
	if e := w.Queue.AuthorizeCalendar(ctx, j); e != nil {
		return fail("calendar_permission_changed")
	}
	event := j.Event
	if j.Slot != nil {
		event.Start = j.Slot.Start
		event.End = j.Slot.End
	}
	if j.Input.Kind == "book" {
		event.Summary = j.Input.Summary
	}
	if primary.Provider == "google" {
		var e error
		event, e = p.Apply(ctx, primary, j.Input.Kind, event)
		if errors.Is(e, ErrConflict) {
			return fail("calendar_provider_conflict")
		}
		if e != nil {
			return sdrsdk.CalendarResult{Status: "uncertain", Error: "calendar_effect_uncertain"}
		}
	}
	status := "confirmed"
	if j.Input.Kind == "cancel" {
		status = "cancelled"
	}
	return sdrsdk.CalendarResult{Status: status, Event: &event}
}
func (w *Worker) reconcile(ctx context.Context, j sdrsdk.CalendarJob, p Provider) sdrsdk.CalendarResult {
	if len(j.Calendars) == 0 || j.Calendars[0].Provider != "google" {
		return sdrsdk.CalendarResult{Status: "failed", Error: "calendar_attempt_expired"}
	}
	e, eErr := p.Get(ctx, j.Calendars[0], j.Event.ID)
	if j.Input.Kind == "cancel" && errors.Is(eErr, ErrNotFound) {
		return sdrsdk.CalendarResult{Status: "cancelled", Event: &j.Event}
	}
	if eErr == nil && j.Input.Kind != "cancel" && e.BookingID == j.Event.BookingID && e.OrganizationHash == j.Event.OrganizationHash && j.Slot != nil && e.Start.Equal(j.Slot.Start) && e.End.Equal(j.Slot.End) {
		return sdrsdk.CalendarResult{Status: "confirmed", Event: &e}
	}
	return sdrsdk.CalendarResult{Status: "uncertain", Error: "calendar_reconciliation_required"}
}
func (w *Worker) Run(ctx context.Context) {
	t := time.NewTicker(500 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			_, _ = w.Once(ctx)
		}
	}
}
