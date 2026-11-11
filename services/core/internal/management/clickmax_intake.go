package management

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"arkom/bia/internal/store"
	"github.com/jackc/pgx/v5"
)

const clickMaxActiveLead = `l.state->>'owner'='go'
 AND COALESCE(l.state#>>'{profile,consent}','false')='true'
 AND COALESCE(l.state->>'opted_out','false')<>'true'
 AND COALESCE(l.state->>'paused','false')<>'true'
 AND COALESCE(l.state->>'human','false')<>'true'
 AND COALESCE(m.status,'open')='open'`

func clickMaxCurrentLead(ctx context.Context, tx pgx.Tx, id string, revision int64) (bool, error) {
	var current bool
	err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM bia_go.leads l
 LEFT JOIN bia_go.lead_management m ON m.lead_id=l.id WHERE l.id=$1 AND l.revision=$2 AND `+clickMaxActiveLead+`)`, id, revision).Scan(&current)
	return current, err
}

func (s *Server) clickMaxIntake(ctx context.Context) error {
	settings := s.ClickMaxSettings
	if settings.AutoLinkSince.IsZero() {
		return nil
	}
	tx, err := s.DB.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var locked bool
	if err = tx.QueryRow(ctx, `SELECT pg_try_advisory_xact_lock(hashtextextended('clickmax-intake',0))`).Scan(&locked); err != nil || !locked {
		return err
	}
	var id, contact string
	var raw []byte
	var revision int64
	var dispatched bool
	err = tx.QueryRow(ctx, `SELECT l.id,l.state,l.revision,COALESCE(i.contact_id::text,''),i.dispatched_at IS NOT NULL
 FROM bia_go.leads l
 LEFT JOIN bia_go.lead_management m ON m.lead_id=l.id
 LEFT JOIN bia_go.clickmax_intake i ON i.lead_id=l.id
 WHERE `+clickMaxActiveLead+`
 AND ((l.state->>'created_at')::timestamptz >= $1 OR (l.state->>'last_inbound')::timestamptz >= $1)
 AND (l.state->>'created_at')::timestamptz <= now()-interval '20 seconds'
 AND (i.next_attempt_at IS NULL OR i.next_attempt_at<=now())
 AND NOT EXISTS(SELECT 1 FROM bia_go.clickmax_cards b WHERE b.lead_id=l.id)
 ORDER BY COALESCE(i.next_attempt_at,l.updated_at),l.id LIMIT 1`, settings.AutoLinkSince).Scan(&id, &raw, &revision, &contact, &dispatched)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	var lead domain.State
	if err = json.Unmarshal(raw, &lead); err != nil {
		return err
	}
	retry := func(code string, delay time.Duration) error {
		_, err := tx.Exec(ctx, `INSERT INTO bia_go.clickmax_intake(lead_id,error_code,next_attempt_at) VALUES($1,$2,$3)
 ON CONFLICT(lead_id) DO UPDATE SET error_code=EXCLUDED.error_code,next_attempt_at=EXCLUDED.next_attempt_at`, id, code, time.Now().Add(delay))
		if err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	if !dispatched {
		var code string
		contact, code = s.findClickMaxContact(ctx, lead.Profile)
		if code != "" {
			delay := time.Minute
			if code == "clickmax_contact_not_found" || code == "clickmax_contact_ambiguous" {
				delay = 15 * time.Minute
			}
			return retry(code, delay)
		}
	}
	cards, err := s.ClickMax.ContactCards(ctx, contact)
	if err != nil {
		return retry(clickMaxErrorCode(err), time.Minute)
	}
	var card clickmax.Card
	var targetCards, open int
	for _, c := range cards {
		if c.PipelineID != settings.PipelineID {
			continue
		}
		targetCards++
		if c.Status == "open" {
			card = c
			open++
		}
	}
	if open > 1 || (open == 1 && (len(card.LeadIDs) != 1 || card.LeadIDs[0] != contact)) {
		return retry("clickmax_card_ambiguous", 15*time.Minute)
	}
	if open == 0 && targetCards != 0 {
		return retry("clickmax_closed_card_requires_review", 15*time.Minute)
	}
	if current, err := clickMaxCurrentLead(ctx, tx, id, revision); err != nil || !current {
		return err
	}
	if open == 0 {
		if dispatched {
			return retry("clickmax_creation_requires_review", 15*time.Minute)
		}
		// Persist the dispatch before POST. Following a timeout, read the
		// contact's cards to recover the result instead of creating again.
		armed, err := s.DB.Pool.Exec(ctx, `INSERT INTO bia_go.clickmax_intake(lead_id,contact_id,dispatched_at,next_attempt_at,error_code)
 VALUES($1,$2,now(),now()+interval '30 seconds','clickmax_creation_pending')
 ON CONFLICT(lead_id) DO UPDATE SET contact_id=EXCLUDED.contact_id,dispatched_at=EXCLUDED.dispatched_at,next_attempt_at=EXCLUDED.next_attempt_at,error_code=EXCLUDED.error_code
 WHERE bia_go.clickmax_intake.dispatched_at IS NULL`, id, contact)
		if err != nil || armed.RowsAffected() != 1 {
			return err
		}
		title := "Bia Go"
		if name := strings.TrimSpace(lead.Profile.Name); name != "" {
			title += " · " + name
		}
		card, err = s.ClickMax.CreateCard(ctx, settings.PipelineID, settings.Stages["contact_pending"], contact, title)
		if err != nil {
			return retry(clickMaxErrorCode(err), time.Minute)
		}
		if !clickmax.ValidID(card.ID) {
			return retry("clickmax_card_unverified", time.Minute)
		}
		card, err = s.ClickMax.Card(ctx, card.ID)
		if err != nil {
			return retry(clickMaxErrorCode(err), time.Minute)
		}
	}
	if !clickmax.ValidID(card.ID) || !clickmax.ValidID(card.StageID) || card.PipelineID != settings.PipelineID ||
		card.Status != "open" || len(card.LeadIDs) != 1 || card.LeadIDs[0] != contact {
		return retry("clickmax_card_unverified", time.Minute)
	}
	tag, err := tx.Exec(ctx, `INSERT INTO bia_go.clickmax_cards(lead_id,card_id,pipeline_id,contact_id,confirmed_stage,auto_linked)
 VALUES($1,$2,$3,$4,$5,true) ON CONFLICT DO NOTHING`, id, card.ID, card.PipelineID, contact, card.StageID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return retry("clickmax_card_already_linked", 15*time.Minute)
	}
	if _, err = tx.Exec(ctx, `DELETE FROM bia_go.clickmax_intake WHERE lead_id=$1`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Server) findClickMaxContact(ctx context.Context, f domain.Form) (string, string) {
	id, code, err := store.FindClickMaxContact(ctx, s.ClickMax, f)
	if err != nil {
		code = clickMaxErrorCode(err)
	}
	return id, code
}
