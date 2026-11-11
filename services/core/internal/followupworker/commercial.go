package followupworker

import (
	"context"
	"strings"
	"sync"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"arkom/bia/internal/store"
)

// ProtectCommercialStages checks current cards immediately before proactive
// outreach. A local booking can outlive the move from SDR to the closer.
func (w *Worker) ProtectCommercialStages(db *store.DB, client *clickmax.Client) {
	var lock sync.Mutex
	var expires time.Time
	var stages map[string]bool
	protected := func(ctx context.Context) (map[string]bool, error) {
		lock.Lock()
		defer lock.Unlock()
		if time.Now().Before(expires) {
			return stages, nil
		}
		pipelines, err := client.Pipelines(ctx)
		if err != nil {
			return nil, err
		}
		stages = make(map[string]bool)
		for _, pipeline := range pipelines {
			if pipeline.ArchivedAt != nil {
				continue
			}
			for _, stage := range pipeline.Stages {
				name := strings.ToLower(strings.TrimSpace(stage.Name))
				if strings.Contains(name, "negocia") || name == "fechamento" || name == "ganho" || name == "realizada" || name == "compareceu" {
					stages[stage.ID] = true
				}
			}
		}
		expires = time.Now().Add(time.Minute)
		return stages, nil
	}
	w.runtime.OutreachGuard = func(ctx context.Context, s domain.State, fx domain.Effect) (string, error) {
		if !domain.IsProactive(fx.Purpose) && fx.Purpose != "recovery" && fx.Purpose != "followup" {
			return "", nil
		}
		ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
		defer cancel()
		contact := s.Profile.ProviderLeadID
		if !clickmax.ValidID(contact) {
			if err := db.Pool.QueryRow(ctx, `SELECT COALESCE(
 (SELECT contact_id::text FROM bia_go.clickmax_cards WHERE lead_id=$1),
 (SELECT contact_id::text FROM bia_go.clickmax_public_bookings WHERE lead_id=$1 ORDER BY provider_updated_at DESC LIMIT 1), '')`, s.ID).Scan(&contact); err != nil {
				return "", err
			}
		}
		if !clickmax.ValidID(contact) {
			var code string
			var err error
			contact, code, err = store.FindClickMaxContact(ctx, client, s.Profile)
			if err != nil {
				return "", err
			}
			if code == "clickmax_contact_ambiguous" {
				return "crm_contact_ambiguous", nil
			}
			if contact == "" {
				return "", nil
			}
		}
		cards, err := client.ContactCards(ctx, contact)
		if err != nil || len(cards) == 0 {
			return "", err
		}
		stages, err := protected(ctx)
		if err != nil {
			return "", err
		}
		for _, card := range cards {
			if strings.EqualFold(card.Status, "won") || stages[card.StageID] {
				return "crm_commercial_stage", nil
			}
		}
		return "", nil
	}
}
