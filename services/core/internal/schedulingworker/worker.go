// Package schedulingworker owns booking mutations and calendar lifecycle events.
package schedulingworker

import (
	"arkom/bia/internal/domain"
	"arkom/bia/internal/providers"
	"arkom/bia/internal/store"
	"arkom/bia/internal/worker"
	"context"
	"log/slog"
	"slices"
	"strings"
	"time"
)

type Worker struct {
	runtime  worker.Worker
	calendar providers.Calendar
	ClickMax *ClickMaxPublic
}

func New(base worker.Worker, calendar providers.Calendar) *Worker {
	w := &Worker{runtime: base, calendar: calendar}
	w.runtime.Queue = "scheduling"
	w.runtime.Planner = nil
	w.runtime.Calendar = nil
	w.runtime.Schedule = nil
	w.runtime.HandleEffect = w.apply
	return w
}
func (w *Worker) Run(ctx context.Context) {
	// Independent mailbox loop avoids waiting behind an external calendar mutation.
	done := make(chan struct{})
	go func() {
		defer close(done)
		tick := time.NewTicker(100 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
				if _, e := w.answerAgenda(ctx); e != nil && ctx.Err() == nil {
					slog.Error("agenda request failed")
				}
			}
		}
	}()
	w.runtime.Run(ctx)
	<-done
}
func (w *Worker) Once(ctx context.Context) (bool, error) {
	if ok, e := w.answerAgenda(ctx); ok || e != nil {
		return ok, e
	}
	return w.runtime.Once(ctx)
}
func (w *Worker) apply(ctx context.Context, j store.Job, s domain.State, fx domain.Effect, now time.Time) (domain.State, []domain.Effect, any, error) {
	switch fx.Kind {
	case "book":
		if fx.Slot == nil {
			return s, nil, nil, &providers.Failure{Code: "missing_slot"}
		}
		operation := j.ID
		if fx.Purpose == "form_booking" {
			operation = strings.TrimPrefix(j.ID, "booking-event/")
		}
		var b domain.Booking
		var e error
		if fx.Slot.Provider == domain.ClickMaxPublicProvider {
			calendar := w.ClickMax.forLead(s)
			if fx.Booking != nil {
				calendar = w.ClickMax.forBooking(fx.Booking)
			}
			if calendar == nil {
				return s, nil, nil, &providers.Failure{Code: "clickmax_team_booking_unconfigured"}
			}
			e = calendar.Book(ctx, operation, s, *fx.Slot, fx.Booking, now)
			if e == nil {
				return s, nil, map[string]string{"status": "clickmax_booking_recorded"}, nil
			}
		} else {
			b, e = w.calendar.Book(ctx, operation, s, *fx.Slot, fx.Booking)
		}
		if e != nil {
			if fx.Purpose == "form_booking" {
				if failure, ok := e.(*providers.Failure); ok && !failure.Ambiguous && !failure.Retryable {
					return s, nil, nil, &worker.SkipEffect{Reason: failure.Code}
				}
			}
			if failure, ok := e.(*providers.Failure); ok && (failure.Code == "google_slot_no_longer_available" || failure.Code == "clickmax_slot_no_longer_available") && fx.Purpose != "form_booking" {
				if fx.Slot.Provider == domain.ClickMaxPublicProvider {
					calendarCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
					slots, err := w.ClickMax.Slots(calendarCtx, s, now)
					cancel()
					slots = slices.DeleteFunc(slots, func(slot domain.Slot) bool { return slot.Start.Equal(fx.Slot.Start) })
					next, effects := domain.OfferReplacementSlots(s, j.ID+":replacement", slots, w.runtime.Policy, now, err != nil)
					return next, effects, map[string]string{"status": "slot_unavailable"}, nil
				}
				s.Offered = nil
				s.OfferVersion = ""
				text := "Esse horário acabou de ficar indisponível. Quer que eu procure outro?"
				if s.Booking != nil {
					text = "Esse horário acabou de ficar indisponível. Sua reserva atual continua confirmada. Quer que eu procure outro?"
				}
				return s, []domain.Effect{{ID: j.ID + ":slot_taken", LeadID: s.ID, Kind: "send", Purpose: "reply", Text: text, Due: now, Expires: now.Add(30 * time.Minute)}}, map[string]string{"status": "slot_unavailable"}, nil
			}
			if failure, ok := e.(*providers.Failure); ok && (failure.Code == "clickmax_contact_not_found" || failure.Code == "clickmax_contact_ambiguous" || failure.Code == "clickmax_team_booking_rejected") {
				s.Offered = nil
				s.OfferVersion = ""
				s.Stage = "awaiting_availability"
				return s, []domain.Effect{
					{ID: j.ID + ":needs_review", LeadID: s.ID, Kind: "crm", Purpose: "handoff", Text: "Agendamento no ClickMax precisa de revisão: " + failure.Code, Due: now, Expires: now.Add(24 * time.Hour)},
					{ID: j.ID + ":pending_reply", LeadID: s.ID, Kind: "send", Purpose: "reply", Text: "Ainda não consegui confirmar esse horário. Vou encaminhar seu pedido para o time verificar a reserva.", Due: now, Expires: now.Add(30 * time.Minute)},
				}, map[string]string{"status": failure.Code}, nil
			}
			return s, nil, nil, e
		}
		if b.ExternallyManaged() {
			return s, nil, b, nil
		}
		ev := domain.Event{ID: j.ID + ":result", LeadID: s.ID, Kind: "booking.created", At: now, Booking: &b}
		if fx.Booking != nil {
			ev.Kind = "booking.rescheduled"
		}
		r := domain.Reduce(s, ev, domain.Decision{}, nil, w.runtime.Policy, now)
		return r.State, r.Effects, b, nil
	case "cancel":
		if fx.Booking == nil {
			return s, nil, nil, &providers.Failure{Code: "missing_booking"}
		}
		if fx.Booking.Provider == domain.ClickMaxPublicProvider {
			calendar := w.ClickMax.forBooking(fx.Booking)
			if calendar == nil {
				return s, nil, nil, &providers.Failure{Code: "clickmax_team_booking_unconfigured"}
			}
			if err := calendar.Cancel(ctx, s, *fx.Booking, now); err != nil {
				return s, nil, nil, err
			}
			return s, nil, map[string]bool{"cancelled": true}, nil
		}
		if e := w.calendar.Cancel(ctx, j.ID, *fx.Booking); e != nil {
			return s, nil, nil, e
		}
		if fx.Booking.ExternallyManaged() {
			return s, nil, map[string]bool{"cancelled": true}, nil
		}
		r := domain.Reduce(s, domain.Event{ID: j.ID + ":result", LeadID: s.ID, Kind: "booking.cancelled", BookingID: fx.Booking.ID, At: now}, domain.Decision{}, nil, w.runtime.Policy, now)
		r.Effects = append(r.Effects, domain.Effect{ID: j.ID + ":confirmed", LeadID: s.ID, Kind: "send", Purpose: "reply", Text: "Sua reserva foi cancelada. Se quiser retomar, posso ajudar a encontrar outro horário.", Due: now, Expires: now.Add(30 * time.Minute)})
		return r.State, r.Effects, map[string]bool{"cancelled": true}, nil
	default:
		return s, nil, nil, &providers.Failure{Code: "unsupported_scheduling_effect"}
	}
}
