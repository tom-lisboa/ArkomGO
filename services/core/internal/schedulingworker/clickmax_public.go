package schedulingworker

import (
	"context"
	"errors"
	"log/slog"
	"slices"
	"strings"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"arkom/bia/internal/store"
)

type ClickMaxPublic struct {
	DB                     *store.DB
	Client                 *clickmax.Client
	PipelineID, ScheduleID string
	Since                  time.Time
	// IntakeOnly starts with explicitly authorized bookings from this calendar.
	IntakeOnly   bool
	Bilhon       *ClickMaxPublic
	Availability interface {
		Available(context.Context, domain.State, domain.Slot) (bool, error)
		Slots(context.Context, domain.State, time.Time) ([]domain.Slot, error)
	}
}

func (c *ClickMaxPublic) forBooking(booking *domain.Booking) *ClickMaxPublic {
	if c == nil {
		return nil
	}
	if booking == nil || booking.Provider != domain.ClickMaxPublicProvider ||
		booking.ClickMaxScheduleID == "" || booking.ClickMaxScheduleID == c.ScheduleID {
		return c
	}
	if c.Bilhon != nil && booking.ClickMaxScheduleID == c.Bilhon.ScheduleID {
		return c.Bilhon
	}
	return nil
}

func (c *ClickMaxPublic) forLead(s domain.State) *ClickMaxPublic {
	if s.Booking != nil {
		return c.forBooking(s.Booking)
	}
	return c.forBooking(s.PreviousBooking)
}

func (c *ClickMaxPublic) Slots(ctx context.Context, s domain.State, now time.Time) ([]domain.Slot, error) {
	calendar := c.forLead(s)
	if calendar == nil {
		return nil, errors.New("clickmax_calendar_unavailable")
	}
	return calendar.Availability.Slots(ctx, s, now)
}

func (c ClickMaxPublic) Run(ctx context.Context) {
	tick := time.NewTicker(20 * time.Second)
	defer tick.Stop()
	ready := false
	for {
		op, cancel := context.WithTimeout(ctx, 18*time.Second)
		n, err := c.Sync(op, time.Now().UTC())
		cancel()
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			slog.Warn("ClickMax public calendar sync pending")
		} else if !ready {
			slog.Info("ClickMax public calendar synchronization ready")
			ready = true
		}
		if n > 0 {
			slog.Info("ClickMax public calendar events imported", "count", n)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

func (c ClickMaxPublic) Sync(ctx context.Context, now time.Time) (int, error) {
	var appointments []clickmax.Appointment
	if !c.IntakeOnly {
		var err error
		appointments, err = c.Client.PipelineAppointments(ctx, c.PipelineID, now.AddDate(0, 0, -2), now.AddDate(0, 0, 60))
		if err != nil {
			return 0, err
		}
	}
	seen := make([]string, 0, len(appointments))
	var imported int
	var incomplete bool
	apply := func(a clickmax.Appointment) {
		changed, err := c.DB.ImportClickMaxPublic(ctx, a, c.Since, now)
		if err != nil {
			incomplete = true
		}
		if changed {
			imported++
		}
	}
	for _, a := range appointments {
		if a.ScheduleID == c.ScheduleID && a.PipelineID == c.PipelineID {
			seen = append(seen, a.ID)
			if !a.CreatedAt.Before(c.Since) {
				apply(a)
			}
		}
	}
	intakes, err := c.DB.PendingClickMaxFormBookings(ctx, c.ScheduleID, !c.IntakeOnly)
	if err != nil {
		return imported, err
	}
	for _, intake := range intakes {
		a, err := c.Client.Appointment(ctx, intake.AppointmentID)
		if err != nil {
			incomplete = true
			continue
		}
		phone := "+" + strings.TrimPrefix(strings.TrimSpace(a.LeadPhone), "+")
		if a.ScheduleID != c.ScheduleID || !slices.Contains(store.WhatsAppPhoneVariants(intake.Phone), phone) ||
			(intake.Email != "" && a.LeadEmail != "" && !strings.EqualFold(intake.Email, a.LeadEmail)) {
			continue
		}
		changed, err := c.DB.ImportClickMaxFormBooking(ctx, a, intake.LeadID, c.Since, now)
		if err != nil {
			incomplete = true
		} else if changed {
			imported++
			seen = append(seen, a.ID)
		}
	}
	missing, err := c.DB.PendingClickMaxPublicIDs(ctx, seen, now, c.ScheduleID, !c.IntakeOnly)
	if err != nil {
		return imported, err
	}
	for _, id := range missing {
		if err := c.DB.MarkClickMaxBookingChecked(ctx, id, now); err != nil {
			incomplete = true
			continue
		}
		a, err := c.Client.Appointment(ctx, id)
		if err != nil {
			incomplete = true
			continue
		}
		// A known booking may have moved to another pipeline after intake.
		if a.ScheduleID == c.ScheduleID || a.Status == "cancelled" {
			apply(a)
		}
	}
	if err := c.reconcileTeamBookings(ctx, now); err != nil {
		incomplete = true
	}
	if incomplete {
		return imported, errors.New("clickmax_public_sync_incomplete")
	}
	return imported, nil
}
