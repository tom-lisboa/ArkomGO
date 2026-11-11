package crmsync

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"strings"

	"arkom/bia/internal/clickmax"
	"github.com/jackc/pgx/v5"
)

//go:embed schema.sql
var Schema string

const EventType = "bia-sdr.crm.opportunity-qualified.v1"

var ErrRoute = errors.New("CRM route unavailable")
var ErrPayload = errors.New("invalid or conflicting CRM opportunity")

func Enqueue(ctx context.Context, tx pgx.Tx, organization, publisher, opportunity string, data json.RawMessage) error {
	var payload struct {
		Installation string `json:"bia_installation_id"`
		Lead         string `json:"clickmax_lead_id"`
		Title        string `json:"title"`
	}
	if json.Unmarshal(data, &payload) != nil || !clickmax.ValidID(payload.Installation) ||
		!clickmax.ValidID(payload.Lead) || strings.TrimSpace(opportunity) == "" ||
		strings.TrimSpace(payload.Title) == "" || len(payload.Title) > 200 {
		return ErrPayload
	}
	var route string
	err := tx.QueryRow(ctx, `SELECT r.id::text FROM arkom_crm.routes r
		JOIN platform_directory.installations i ON i.id=r.bia_installation_id
		WHERE r.organization_id=$1 AND r.publisher_id=$2 AND i.id=$3 AND r.enabled
		  AND i.organization_id=r.organization_id AND i.solution='bia-sdr' AND i.enabled
		FOR SHARE OF r,i`, organization, publisher, payload.Installation).Scan(&route)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrRoute
	}
	if err != nil {
		return err
	}
	var saved string
	err = tx.QueryRow(ctx, `INSERT INTO arkom_crm.deliveries AS d (route_id,opportunity_id,clickmax_lead_id,title)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (route_id,opportunity_id) DO UPDATE SET opportunity_id=excluded.opportunity_id
		WHERE d.clickmax_lead_id=excluded.clickmax_lead_id AND d.title=excluded.title
		RETURNING opportunity_id`, route, opportunity, payload.Lead, payload.Title).Scan(&saved)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrPayload
	}
	return err
}
