package management

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"github.com/jackc/pgx/v5"
)

// RunClickMax mirrors the persisted SDR stage independently of the lead's
// messaging, scheduling and voice jobs.
func (s *Server) RunClickMax(ctx context.Context) {
	if !s.ClickMaxSync || s.ClickMax == nil || s.Mode != "live" {
		return
	}
	tick := time.NewTicker(2 * time.Second)
	defer tick.Stop()
	var validateAt time.Time
	var order map[string]float64
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
		if time.Now().After(validateAt) {
			check, cancel := context.WithTimeout(ctx, 8*time.Second)
			pipeline, err := s.ClickMaxSettings.ResolvePipeline(check, s.ClickMax)
			cancel()
			wasReady := order != nil
			order = nil
			if err == nil {
				order = make(map[string]float64, len(pipeline.Stages))
				for _, stage := range pipeline.Stages {
					order[strings.ToLower(stage.ID)] = stage.Order
				}
				if !wasReady {
					slog.Info("ClickMax CRM synchronization ready", "automatic_intake", !s.ClickMaxSettings.AutoLinkSince.IsZero())
				}
			}
			validateAt = time.Now().Add(time.Minute)
			if err != nil && ctx.Err() == nil {
				slog.Warn("ClickMax pipeline validation failed", "code", clickMaxErrorCode(err))
			}
		}
		if order == nil {
			continue
		}
		op, cancel := context.WithTimeout(ctx, 35*time.Second)
		err := s.syncClickMaxCard(op, order)
		cancel()
		if err != nil && ctx.Err() == nil {
			slog.Error("ClickMax sync storage error")
		}
		op, cancel = context.WithTimeout(ctx, 35*time.Second)
		err = s.clickMaxIntake(op)
		cancel()
		if err != nil && ctx.Err() == nil {
			slog.Error("ClickMax intake storage error")
		}
	}
}

func (s *Server) syncClickMaxCard(ctx context.Context, order map[string]float64) error {
	settings := s.ClickMaxSettings
	mapping, err := json.Marshal(settings.Stages)
	if err != nil {
		return err
	}
	tx, err := s.DB.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var b clickMaxBinding
	var lead, target, leadStage string
	var attempts int
	var revision int64
	var autoLinked, syncMeeting bool
	var raw []byte
	err = tx.QueryRow(ctx, leadCTE()+`
	SELECT b.lead_id,b.card_id::text,b.pipeline_id::text,b.contact_id::text,b.confirmed_stage::text,
	 COALESCE(b.attempted_stage::text,''),target.id,b.attempts,l.pipeline_stage,l.revision,b.auto_linked,l.state,meeting.stale
	FROM bia_go.clickmax_cards b JOIN scored l ON l.id=b.lead_id
	CROSS JOIN LATERAL (
	  SELECT count(DISTINCT j.payload->>'purpose') AS n FROM bia_go.jobs j
	  WHERE l.pipeline_stage='contacted' AND j.lead_id=l.id AND j.status='done' AND `+deliveredSQL+`
	    AND j.payload->>'purpose' IN ('no_reply_15m','no_reply_2h','no_reply_6h','no_reply_24h','no_reply_48h','no_reply_72h')
	) followups
	CROSS JOIN LATERAL (SELECT COALESCE(
	 CASE WHEN followups.n>=2 THEN $2::jsonb->>'attempt_3'
	      WHEN followups.n=1 THEN $2::jsonb->>'attempt_2' END,
	 $2::jsonb->>l.pipeline_stage,'') AS id) target
	CROSS JOIN LATERAL (SELECT $4::boolean AND target.id=$2::jsonb->>'booked'
	 AND l.state#>>'{booking,start}' IS NOT NULL
	 AND b.meeting_synced_start IS DISTINCT FROM (l.state#>>'{booking,start}')::timestamptz AS stale) meeting
	WHERE b.pipeline_id=$3 AND NOT b.paused AND b.next_attempt_at<=now()
	 AND l.state->>'owner'='go' AND l.status='open' AND l.automation='active'
	 AND (b.attempted_stage IS NOT NULL OR target.id NOT IN ('',b.confirmed_stage::text) OR meeting.stale)
	ORDER BY b.next_attempt_at,b.lead_id LIMIT 1 FOR UPDATE OF b SKIP LOCKED`,
		s.now(), mapping, settings.PipelineID, settings.MeetingDateField != "").Scan(&lead, &b.Card, &b.Pipeline, &b.Contact, &b.ConfirmedStage, &b.AttemptedStage, &target, &attempts, &leadStage, &revision, &autoLinked, &raw, &syncMeeting)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	retry := func(err error) error {
		code, paused, delay := clickMaxRetry(err, attempts)
		if _, err := tx.Exec(ctx, `UPDATE bia_go.clickmax_cards SET error_code=$2,paused=$3,attempts=attempts+1,next_attempt_at=$4,updated_at=now() WHERE lead_id=$1`, lead, code, paused, time.Now().Add(delay)); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	card, err := s.ClickMax.Card(ctx, b.Card)
	if err != nil {
		return retry(err)
	}
	stage := strings.ToLower(card.StageID)
	contactLinked := slices.ContainsFunc(card.LeadIDs, func(id string) bool { return strings.EqualFold(id, b.Contact) })
	if !strings.EqualFold(card.PipelineID, b.Pipeline) || card.Status != "open" || !contactLinked ||
		(autoLinked && len(card.LeadIDs) != 1) || (stage != b.ConfirmedStage && stage != b.AttemptedStage && stage != target) {
		if _, err = tx.Exec(ctx, `UPDATE bia_go.clickmax_cards SET paused=true,error_code='clickmax_card_changed_externally',updated_at=now() WHERE lead_id=$1`, lead); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	// A newly linked lead may already have an advanced sales opportunity.
	// Only a recorded no-show may take an automatically linked card backwards.
	if autoLinked && target != "" && stage != target {
		from, fromOK := order[stage]
		to, toOK := order[target]
		noShow := leadStage == "no_show" && stage == settings.Stages["booked"]
		if !fromOK || !toOK || (to <= from && !noShow) {
			if _, err = tx.Exec(ctx, `UPDATE bia_go.clickmax_cards SET confirmed_stage=$2,attempted_stage=NULL,error_code='clickmax_existing_stage_ahead',next_attempt_at=now()+interval '30 seconds',updated_at=now() WHERE lead_id=$1`, lead, stage); err != nil {
				return err
			}
			return tx.Commit(ctx)
		}
	}
	if current, err := clickMaxCurrentLead(ctx, tx, lead, revision); err != nil || !current {
		return err
	}
	if syncMeeting {
		var state domain.State
		if err = json.Unmarshal(raw, &state); err != nil {
			return err
		}
		if state.Booking == nil || state.Booking.Start.IsZero() {
			return nil
		}
		start := state.Booking.Start.In(s.Policy.Zone(domain.State{}))
		if err = s.ClickMax.SetCardField(ctx, b.Card, settings.MeetingDateField, start.Format("2006-01-02")); err != nil {
			return retry(err)
		}
		if err = s.ClickMax.SetCardField(ctx, b.Card, settings.MeetingTimeField, start.Format("15:04")); err != nil {
			return retry(err)
		}
		if _, err = tx.Exec(ctx, `UPDATE bia_go.clickmax_cards SET meeting_synced_start=$2 WHERE lead_id=$1`, lead, state.Booking.Start); err != nil {
			return err
		}
		if current, err := clickMaxCurrentLead(ctx, tx, lead, revision); err != nil || !current {
			return err
		}
	}
	if target == "" || stage == target {
		if _, err = tx.Exec(ctx, `UPDATE bia_go.clickmax_cards SET confirmed_stage=$2,attempted_stage=NULL,error_code='',attempts=0,next_attempt_at=now(),updated_at=now() WHERE lead_id=$1`, lead, stage); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	// Save the target before the POST. If the response is lost or a worker dies,
	// the next attempt reads the card before deciding whether to send another move.
	attempts++
	if _, err = tx.Exec(ctx, `UPDATE bia_go.clickmax_cards SET confirmed_stage=$2,attempted_stage=$3,attempts=$4,next_attempt_at=now()+interval '30 seconds',error_code='',updated_at=now() WHERE lead_id=$1`, lead, stage, target, attempts); err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	err = s.ClickMax.Move(ctx, b.Card, b.Pipeline, target)
	if err != nil {
		code, paused, delay := clickMaxRetry(err, attempts)
		_, err = s.DB.Pool.Exec(ctx, `UPDATE bia_go.clickmax_cards SET error_code=$5,paused=$6,next_attempt_at=$7,updated_at=now() WHERE lead_id=$1 AND card_id=$2 AND attempted_stage=$3 AND attempts=$4`, lead, b.Card, target, attempts, code, paused, time.Now().Add(delay))
		return err
	}
	_, err = s.DB.Pool.Exec(ctx, `UPDATE bia_go.clickmax_cards SET confirmed_stage=$3,attempted_stage=NULL,error_code='',attempts=0,next_attempt_at=now(),updated_at=now() WHERE lead_id=$1 AND card_id=$2 AND attempted_stage=$3 AND attempts=$4`, lead, b.Card, target, attempts)
	return err
}

func clickMaxRetry(err error, attempts int) (string, bool, time.Duration) {
	code := clickMaxErrorCode(err)
	delay := time.Duration(5*(1<<min(attempts, 6))) * time.Second
	var remote *clickmax.RequestError
	if !errors.As(err, &remote) {
		return code, false, delay
	}
	switch remote.Status {
	case http.StatusBadRequest, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity:
		return code, true, delay
	case http.StatusTooManyRequests:
		return code, false, max(delay, 30*time.Second)
	default:
		return code, false, delay
	}
}
