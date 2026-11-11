package crmsync

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	sdk "clickmax.io/go"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/tom-lisboa/CRMGO/internal/clickmax"
)

type delivery struct {
	route, opportunity, lead, title    string
	workspace, pipeline, stage, keyEnv string
}

type Worker struct {
	DB                 *pgxpool.Pool
	Transport          http.RoundTripper
	BaseURL            string
	PublicDevWorkspace string
}

func (w Worker) ProcessOne(ctx context.Context) (bool, error) {
	db := w.DB
	var job delivery
	err := db.QueryRow(ctx, `WITH next AS (
		SELECT d.route_id,d.opportunity_id,r.workspace_id,r.pipeline_id,r.stage_id,r.key_env
		FROM arkom_crm.deliveries d
		JOIN arkom_crm.routes r ON r.id=d.route_id
		JOIN platform_directory.installations i ON i.id=r.bia_installation_id AND i.organization_id=r.organization_id
		JOIN platform_directory.organizations o ON o.id=r.organization_id
		JOIN platform_directory.entitlements e ON e.organization_id=o.id AND e.solution=i.solution
		JOIN integration_clients c ON c.id=r.publisher_id
		JOIN integration_grants g ON g.client_id=c.id AND g.organization_id=o.id AND g.source_solution=i.solution
		WHERE d.state='pending' AND d.next_attempt_at<=now()
		  AND i.solution='bia-sdr' AND c.solution=i.solution AND g.can_publish
		  AND r.enabled AND i.enabled AND o.enabled AND e.enabled AND c.enabled
		ORDER BY d.next_attempt_at,d.route_id,d.opportunity_id LIMIT 1 FOR UPDATE OF d SKIP LOCKED
	)
	UPDATE arkom_crm.deliveries d SET state='creating' FROM next n
	WHERE d.route_id=n.route_id AND d.opportunity_id=n.opportunity_id
	RETURNING d.route_id::text,d.opportunity_id,d.clickmax_lead_id::text,d.title,
		n.workspace_id::text,n.pipeline_id::text,n.stage_id::text,n.key_env`).Scan(
		&job.route, &job.opportunity, &job.lead, &job.title, &job.workspace, &job.pipeline, &job.stage, &job.keyEnv)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	request, cancel := context.WithTimeout(ctx, 20*time.Second)
	state, card, delay := w.deliver(request, job)
	cancel()

	save, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	_, err = db.Exec(save, `UPDATE arkom_crm.deliveries
		SET state=$3,clickmax_card_id=NULLIF($4,'')::uuid,next_attempt_at=now()+make_interval(secs => $5::double precision)
		WHERE route_id=$1 AND opportunity_id=$2 AND state='creating'`,
		job.route, job.opportunity, state, card, delay.Seconds())
	return true, err
}

func (w Worker) workspaceClient(ctx context.Context, workspace, keyEnv string) (*sdk.Client, error) {
	httpClient := &http.Client{
		Transport:     w.Transport,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	key := strings.TrimSpace(os.Getenv(keyEnv))
	publicDev := w.BaseURL == sdk.DefaultBaseURL && w.PublicDevWorkspace != "" &&
		w.PublicDevWorkspace == workspace && strings.HasPrefix(key, "cxp_")
	privateDev := w.BaseURL != sdk.DefaultBaseURL && strings.HasPrefix(key, "cxd_")
	if !publicDev && !privateDev {
		return nil, ErrRoute
	}
	client, err := sdk.New(key, sdk.WithHTTPClient(httpClient), sdk.WithBaseURL(w.BaseURL))
	if err != nil {
		return nil, ErrRoute
	}
	identity, err := client.Whoami(ctx)
	if err != nil || identity.Workspace.WorkspaceID != workspace {
		return nil, ErrRoute
	}
	return client, nil
}

func (w Worker) deliver(ctx context.Context, job delivery) (state, card string, delay time.Duration) {
	client, err := w.workspaceClient(ctx, job.workspace, job.keyEnv)
	if err != nil {
		return "pending", "", time.Minute
	}

	result, err := client.Cards.Create(ctx, sdk.CardsCreateInput{
		LeadIDs: []string{job.lead}, PipelineID: job.pipeline, StageID: job.stage, Title: &job.title,
	})
	if err == nil && clickmax.ValidID(result.ID) {
		return "done", result.ID, 0
	}
	var apiErr *sdk.Error
	if errors.As(err, &apiErr) {
		switch apiErr.Status {
		case 429:
			return "pending", "", max(time.Minute, apiErr.RetryAfter)
		case 400, 401, 402, 403, 404, 422:
			return "rejected", "", 0
		}
	}
	// The write may have reached Clickmax. Reconcile before attempting another create.
	return "review", "", 0
}
