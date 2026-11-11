package management

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func (s *Server) clickMaxPipelines(w http.ResponseWriter, r *http.Request) {
	if s.ClickMax == nil {
		fail(w, 503, "clickmax_not_configured")
		return
	}
	pipelines, err := s.ClickMax.Pipelines(r.Context())
	if err != nil {
		fail(w, 502, clickMaxErrorCode(err))
		return
	}
	write(w, 200, map[string]any{"pipelines": pipelines, "sync_enabled": s.ClickMaxSync})
}

type clickMaxBinding struct {
	Card           string    `json:"card_id"`
	Pipeline       string    `json:"pipeline_id"`
	Contact        string    `json:"-"`
	ConfirmedStage string    `json:"confirmed_stage_id"`
	AttemptedStage string    `json:"pending_stage_id,omitempty"`
	Paused         bool      `json:"paused"`
	ErrorCode      string    `json:"error_code,omitempty"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (s *Server) clickMaxStatus(w http.ResponseWriter, r *http.Request) {
	var b clickMaxBinding
	err := s.DB.Pool.QueryRow(r.Context(), `SELECT card_id::text,pipeline_id::text,confirmed_stage::text,COALESCE(attempted_stage::text,''),paused,error_code,updated_at FROM bia_go.clickmax_cards WHERE lead_id=$1`, r.PathValue("id")).Scan(&b.Card, &b.Pipeline, &b.ConfirmedStage, &b.AttemptedStage, &b.Paused, &b.ErrorCode, &b.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		result := map[string]any{"linked": false, "sync_enabled": s.ClickMaxSync}
		var code string
		err = s.DB.Pool.QueryRow(r.Context(), `SELECT error_code FROM bia_go.clickmax_intake WHERE lead_id=$1`, r.PathValue("id")).Scan(&code)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			readError(w, err)
			return
		}
		if code != "" {
			result["intake_error"] = code
		}
		write(w, 200, result)
		return
	}
	if readError(w, err) {
		return
	}
	write(w, 200, map[string]any{"linked": true, "sync_enabled": s.ClickMaxSync, "binding": b})
}

func (s *Server) clickMaxBind(w http.ResponseWriter, r *http.Request) {
	if s.ClickMax == nil || !s.ClickMaxSync {
		fail(w, 503, "clickmax_sync_not_enabled")
		return
	}
	var input struct {
		CardID string `json:"card_id"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.CardID = strings.ToLower(strings.TrimSpace(input.CardID))
	if !clickmax.ValidID(input.CardID) {
		fail(w, 422, "invalid_clickmax_card_id")
		return
	}
	ctx := r.Context()
	lead, err := s.DB.Lead(ctx, r.PathValue("id"))
	if readError(w, err) {
		return
	}
	if lead.Owner != "go" || lead.OptedOut {
		fail(w, 409, "clickmax_lead_not_eligible")
		return
	}
	if err = s.ClickMaxSettings.ValidatePipeline(ctx, s.ClickMax); err != nil {
		fail(w, 502, clickMaxErrorCode(err))
		return
	}
	card, err := s.ClickMax.Card(ctx, input.CardID)
	if err != nil {
		fail(w, 502, clickMaxErrorCode(err))
		return
	}
	if !strings.EqualFold(card.PipelineID, s.ClickMaxSettings.PipelineID) || card.Status != "open" {
		fail(w, 409, "clickmax_card_outside_open_pipeline")
		return
	}
	contact, err := s.matchClickMaxContact(ctx, lead.Profile, card.LeadIDs)
	if err != nil {
		fail(w, 502, clickMaxErrorCode(err))
		return
	}
	if contact == "" {
		fail(w, 409, "clickmax_card_contact_not_verified")
		return
	}
	tx, err := s.DB.Pool.Begin(ctx)
	if readError(w, err) {
		return
	}
	defer tx.Rollback(ctx)
	var raw []byte
	if readError(w, tx.QueryRow(ctx, `SELECT state FROM bia_go.leads WHERE id=$1 FOR UPDATE`, lead.ID).Scan(&raw)) {
		return
	}
	var current domain.State
	if readError(w, json.Unmarshal(raw, &current)) {
		return
	}
	if current.Owner != "go" || current.OptedOut || current.Profile.Phone != lead.Profile.Phone || current.Profile.Email != lead.Profile.Email || current.Profile.ProviderLeadID != lead.Profile.ProviderLeadID {
		fail(w, 409, "clickmax_lead_changed")
		return
	}
	tag, err := tx.Exec(ctx, `INSERT INTO bia_go.clickmax_cards(lead_id,card_id,pipeline_id,contact_id,confirmed_stage) VALUES($1,$2,$3,$4,$5)
	ON CONFLICT(lead_id) DO UPDATE SET card_id=EXCLUDED.card_id,pipeline_id=EXCLUDED.pipeline_id,contact_id=EXCLUDED.contact_id,confirmed_stage=EXCLUDED.confirmed_stage,attempted_stage=NULL,paused=false,error_code='',attempts=0,next_attempt_at=now(),updated_at=now()
	WHERE bia_go.clickmax_cards.attempted_stage IS NULL OR bia_go.clickmax_cards.next_attempt_at<=now() OR bia_go.clickmax_cards.paused`, lead.ID, input.CardID, s.ClickMaxSettings.PipelineID, contact, strings.ToLower(card.StageID))
	var dbErr *pgconn.PgError
	if errors.As(err, &dbErr) && dbErr.Code == "23505" {
		fail(w, 409, "clickmax_card_already_linked")
		return
	}
	if readError(w, err) {
		return
	}
	if tag.RowsAffected() != 1 {
		fail(w, 409, "clickmax_move_pending")
		return
	}
	result, _ := json.Marshal(map[string]string{"card_id": input.CardID, "pipeline_id": s.ClickMaxSettings.PipelineID})
	_, err = tx.Exec(ctx, `INSERT INTO bia_go.management_actions(id,actor_id,lead_id,kind,fingerprint,request,result) VALUES($1,$2,$3,'clickmax.card_linked',$4,$5,$5)`, "clickmax_"+randomToken()[:32], actor(r).ID, lead.ID, digest(string(result)), result)
	if readError(w, err) || readError(w, tx.Commit(ctx)) {
		return
	}
	s.clickMaxStatus(w, r)
}

func (s *Server) matchClickMaxContact(ctx context.Context, form domain.Form, ids []string) (string, error) {
	if form.Channel == "clickmax" && clickmax.ValidID(form.ProviderLeadID) {
		if slices.ContainsFunc(ids, func(id string) bool { return strings.EqualFold(id, form.ProviderLeadID) }) {
			return form.ProviderLeadID, nil
		}
		return "", nil
	}
	if len(ids) > 10 {
		return "", nil
	}
	var match string
	for _, id := range ids {
		if !clickmax.ValidID(id) {
			continue
		}
		contact, err := s.ClickMax.Contact(ctx, id)
		if err != nil {
			return "", err
		}
		if !sameClickMaxContact(form, contact) {
			continue
		}
		if match != "" && !strings.EqualFold(match, id) {
			return "", nil
		}
		match = id
	}
	return match, nil
}

func sameClickMaxContact(form domain.Form, contact clickmax.Contact) bool {
	phone, err := domain.NormalizePhone("+" + strings.TrimPrefix(strings.TrimSpace(contact.Phone), "+"))
	if err == nil && form.Phone != "" {
		return phone == form.Phone
	}
	return form.Email != "" && strings.EqualFold(strings.TrimSpace(form.Email), strings.TrimSpace(contact.Email))
}

func clickMaxErrorCode(err error) string {
	var remote *clickmax.RequestError
	if errors.As(err, &remote) {
		return remote.Error()
	}
	switch err.Error() {
	case "clickmax_pipeline_unavailable", "clickmax_stage_outside_pipeline", "clickmax_move_unverified", "clickmax_card_unverified":
		return err.Error()
	}
	return "clickmax_unavailable"
}
