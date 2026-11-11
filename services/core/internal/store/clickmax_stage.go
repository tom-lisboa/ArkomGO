package store

import (
	"context"
	"encoding/json"
	"errors"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"github.com/jackc/pgx/v5"
)

// The card owns one opening across Novo Lead and all attempt columns. This lock
// also serializes with website intake and the Brazilian ninth-digit variant.
// Existing conversations keep their context, block flags and follow-up anchor.
func (d *DB) SubmitClickMaxCard(ctx context.Context, sender string, f domain.Form, card clickmax.Card, appointment clickmax.Appointment) (eventID, status string, duplicate bool, err error) {
	tx, err := d.Pool.Begin(ctx)
	if err != nil {
		return "", "", false, err
	}
	defer tx.Rollback(ctx)
	if err = prepareFormContact(ctx, tx, &f, sender); err != nil {
		return "", "", false, err
	}
	eventID = "bia-intake-clickmax-card-" + card.ID
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, eventID); err != nil {
		return "", "", false, err
	}
	var exists bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM bia_go.jobs WHERE id=$1)`, eventID).Scan(&exists); err != nil {
		return "", "", false, err
	}
	if exists {
		return eventID, "already_managed", true, tx.Commit(ctx)
	}
	leadID := domain.LeadKey(f.Phone)
	var raw []byte
	err = tx.QueryRow(ctx, `SELECT state FROM bia_go.leads WHERE id=$1 FOR UPDATE`, leadID).Scan(&raw)
	var current domain.State
	if err == nil {
		if err = json.Unmarshal(raw, &current); err != nil {
			return "", "", false, err
		}
		if current.Owner != "go" || current.OptedOut || current.Paused || current.Human {
			return "", "", false, ErrConflict
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return "", "", false, err
	}
	var otherBinding bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM bia_go.clickmax_cards WHERE (lead_id=$1 AND card_id<>$2) OR (card_id=$2 AND lead_id<>$1))`, leadID, card.ID).Scan(&otherBinding); err != nil {
		return "", "", false, err
	}
	if otherBinding {
		return "", "", false, ErrConflict
	}
	// An existing outbound/inbound, booking, or queued form owns the greeting.
	var pending bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM bia_go.jobs WHERE lead_id=$1 AND status IN ('pending','running') AND ((kind='event' AND payload->>'kind' IN ('form.contact_requested','form.submitted')) OR (kind='effect' AND payload->>'purpose' IN ('form_contact','welcome'))))`, leadID).Scan(&pending); err != nil {
		return "", "", false, err
	}
	managed := current.FirstContactAt != nil || current.LastFormContactAt != nil || !current.LastInbound.IsZero() || current.Booking != nil || pending
	if !managed {
		if err = enqueueFormContact(ctx, tx, eventID, "live", f, "", appointment); err != nil {
			return "", "", false, err
		}
	}
	if _, err = tx.Exec(ctx, `INSERT INTO bia_go.clickmax_cards(lead_id,card_id,pipeline_id,contact_id,confirmed_stage,auto_linked) VALUES($1,$2,$3,$4,$5,true) ON CONFLICT DO NOTHING`, leadID, card.ID, card.PipelineID, f.ProviderLeadID, card.StageID); err != nil {
		return "", "", false, err
	}
	status = "contact_queued"
	if managed {
		status = "already_managed"
		eventID = ""
	}
	return eventID, status, managed, tx.Commit(ctx)
}
