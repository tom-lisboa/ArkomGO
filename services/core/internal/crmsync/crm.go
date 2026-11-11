package crmsync

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"strings"

	"arkom/bia/internal/clickmax"
	sdk "clickmax.io/go"
	"github.com/jackc/pgx/v5"
)

var ErrCardCloseRejected = errors.New("Clickmax rejected the opportunity result")

type CRMRequest struct {
	Query       string   `json:"query,omitempty"`
	SearchBy    string   `json:"search_by,omitempty"`
	Page        int64    `json:"page,omitempty"`
	Description *string  `json:"description,omitempty"`
	ValueCents  *int64   `json:"value_cents,omitempty"`
	Probability *int64   `json:"probability,omitempty"`
	Name        string   `json:"name,omitempty"`
	Email       string   `json:"email,omitempty"`
	PipelineID  string   `json:"pipeline_id,omitempty"`
	StageID     string   `json:"stage_id,omitempty"`
	Status      string   `json:"status,omitempty"`
	Reasons     []string `json:"reasons,omitempty"`
	Restricted  *bool    `json:"restricted,omitempty"`
	LossReason  string   `json:"loss_reason,omitempty"`
	CardID      string   `json:"card_id,omitempty"`
	LeadID      string   `json:"lead_id,omitempty"`
	Title       string   `json:"title,omitempty"`
	Stages      []string `json:"stages,omitempty"`
}

func (w Worker) CRM(ctx context.Context, org, publisher, installation, operation string, input CRMRequest) (any, error) {
	var workspace, keyEnv, workspaceSlug string
	err := w.DB.QueryRow(ctx, `SELECT r.workspace_id::text,r.key_env,COALESCE(r.workspace_slug,'') FROM arkom_crm.routes r
		JOIN platform_directory.installations i ON i.id=r.bia_installation_id AND i.organization_id=r.organization_id
		JOIN platform_directory.organizations o ON o.id=r.organization_id
		JOIN platform_directory.entitlements e ON e.organization_id=o.id AND e.solution=i.solution
		WHERE r.organization_id=$1 AND r.publisher_id=$2 AND i.id=$3 AND r.enabled
		  AND i.solution='bia-sdr' AND i.enabled AND o.enabled AND e.enabled`, org, publisher, installation).Scan(&workspace, &keyEnv, &workspaceSlug)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrRoute
	}
	if err != nil {
		return nil, err
	}
	client, err := w.workspaceClient(ctx, workspace, keyEnv)
	if err != nil {
		return nil, err
	}
	switch operation {
	case "pipelines.list":
		return client.Pipelines.List(ctx)
	case "pipelines.create":
		if !validText(input.Name, 100) || len(input.Stages) == 0 || len(input.Stages) > 30 {
			return nil, ErrPayload
		}
		stages := make([]sdk.PipelinesCreateInputStagesItem, 0, len(input.Stages))
		for _, name := range input.Stages {
			if !validText(name, 100) {
				return nil, ErrPayload
			}
			stages = append(stages, sdk.PipelinesCreateInputStagesItem{Name: strings.TrimSpace(name)})
		}
		return client.Pipelines.Create(ctx, sdk.PipelinesCreateInput{Name: strings.TrimSpace(input.Name), Stages: stages})
	case "pipelines.update":
		if !clickmax.ValidID(input.PipelineID) || !validText(input.Name, 100) ||
			(input.Description != nil && len(*input.Description) > 500) {
			return nil, ErrPayload
		}
		update := sdk.PipelinesUpdateInput{ID: input.PipelineID, Name: sdk.Ptr(strings.TrimSpace(input.Name))}
		if input.Description != nil {
			update.Description = sdk.NewNullable(strings.TrimSpace(*input.Description))
		}
		return client.Pipelines.Update(ctx, update)
	case "stages.update":
		if !clickmax.ValidID(input.StageID) || !validText(input.Name, 100) {
			return nil, ErrPayload
		}
		return client.Stages.Update(ctx, sdk.StagesUpdateInput{ID: input.StageID, Name: sdk.Ptr(strings.TrimSpace(input.Name))})
	case "pipelines.loss-reasons", "pipelines.loss-reasons.update":
		if !clickmax.ValidID(input.PipelineID) {
			return nil, ErrPayload
		}
		var settings *sdk.PipelinesSettingsGetOutput
		if operation == "pipelines.loss-reasons.update" {
			if input.Restricted == nil || input.Reasons == nil || len(input.Reasons) > 50 ||
				(*input.Restricted && len(input.Reasons) == 0) {
				return nil, ErrPayload
			}
			seen := make(map[string]bool, len(input.Reasons))
			for i, reason := range input.Reasons {
				reason = strings.TrimSpace(reason)
				key := strings.ToLower(reason)
				if !validText(reason, 500) || seen[key] {
					return nil, ErrPayload
				}
				input.Reasons[i] = reason
				seen[key] = true
			}
			settings, err = client.Pipelines.SettingsUpdate(ctx, sdk.PipelinesSettingsUpdateInput{
				ID: input.PipelineID, LostReasons: input.Reasons, RestrictLossReasons: input.Restricted,
			})
		} else {
			settings, err = client.Pipelines.SettingsGet(ctx, sdk.PipelinesSettingsGetParams{ID: input.PipelineID})
		}
		if err != nil {
			return nil, err
		}
		return struct {
			Reasons    []string `json:"reasons"`
			Restricted bool     `json:"restricted"`
		}{Reasons: settings.LostReasons, Restricted: settings.RestrictLossReasons}, nil
	case "cards.list":
		if !clickmax.ValidID(input.PipelineID) || input.Page < 0 || input.Page > 100000 {
			return nil, ErrPayload
		}
		filter := sdk.CardsListInput{PipelineID: &input.PipelineID, Page: sdk.Ptr(max(1, input.Page))}
		switch input.Status {
		case "":
		case "open", "won", "lost":
			filter.Status = sdk.Ptr(sdk.CardsListInputStatus(input.Status))
		default:
			return nil, ErrPayload
		}
		if reason := strings.TrimSpace(input.LossReason); reason != "" {
			if len(reason) > 500 || (input.Status != "" && input.Status != "lost") {
				return nil, ErrPayload
			}
			filter.Status = sdk.Ptr(sdk.CardsListInputStatusLost)
			filter.Conditions = []sdk.CardsListInputConditionsItem{{
				Field:       sdk.CardsListInputConditionsItemFieldLossReason,
				Operator:    sdk.CardsListInputConditionsItemOperatorEquals,
				ValueString: sdk.NewNullable(reason),
			}}
		}
		return client.Cards.List(ctx, filter)
	case "cards.create":
		if !clickmax.ValidID(input.PipelineID) || !clickmax.ValidID(input.StageID) ||
			!clickmax.ValidID(input.LeadID) || !validText(input.Title, 200) {
			return nil, ErrPayload
		}
		return client.Cards.Create(ctx, sdk.CardsCreateInput{LeadIDs: []string{input.LeadID}, PipelineID: input.PipelineID, StageID: input.StageID, Title: &input.Title})
	case "cards.update":
		if !clickmax.ValidID(input.CardID) || !validText(input.Title, 200) ||
			(input.ValueCents != nil && (*input.ValueCents < 0 || *input.ValueCents > 999999999999)) ||
			(input.Probability != nil && (*input.Probability < 0 || *input.Probability > 100)) {
			return nil, ErrPayload
		}
		update := sdk.CardsUpdateInput{ID: input.CardID, Title: sdk.NewNullable(strings.TrimSpace(input.Title))}
		if input.ValueCents != nil {
			update.Value = sdk.NewNullable(*input.ValueCents)
		}
		if input.Probability != nil {
			update.Probability = sdk.NewNullable(*input.Probability)
		}
		return client.Cards.Update(ctx, update)
	case "cards.close":
		if !clickmax.ValidID(input.CardID) {
			return nil, ErrPayload
		}
		update := sdk.CardsUpdateInput{ID: input.CardID}
		switch input.Status {
		case "won":
			if strings.TrimSpace(input.LossReason) != "" {
				return nil, ErrPayload
			}
			update.Status = sdk.Ptr(sdk.CardsUpdateInputStatusWon)
		case "lost":
			reason := strings.TrimSpace(input.LossReason)
			if !validText(reason, 500) {
				return nil, ErrPayload
			}
			update.Status = sdk.Ptr(sdk.CardsUpdateInputStatusLost)
			update.LossReason = sdk.NewNullable(reason)
		default:
			return nil, ErrPayload
		}
		card, err := client.Cards.Update(ctx, update)
		var apiErr *sdk.Error
		if errors.As(err, &apiErr) && (apiErr.Status == 400 || apiErr.Status == 422) {
			return nil, ErrCardCloseRejected
		}
		return card, err
	case "cards.move":
		if !clickmax.ValidID(input.CardID) || !clickmax.ValidID(input.StageID) {
			return nil, ErrPayload
		}
		return client.Cards.Move(ctx, sdk.CardsMoveInput{ID: input.CardID, StageID: input.StageID})
	case "contacts.list":
		return listContacts(ctx, client, workspaceSlug, input)
	case "contacts.create":
		return w.captureContact(ctx, client, keyEnv, input)
	default:
		return nil, ErrPayload
	}
}

func validText(value string, maxLength int) bool {
	return strings.TrimSpace(value) != "" && len(value) <= maxLength
}

func (w Worker) captureContact(ctx context.Context, client *sdk.Client, keyEnv string, input CRMRequest) (any, error) {
	email, err := mail.ParseAddress(input.Email)
	if err != nil || email.Address != input.Email || len(input.Email) > 254 || !validText(input.Name, 100) {
		return nil, ErrPayload
	}
	capture, err := url.Parse(os.Getenv(keyEnv + "_CAPTURE_URL"))
	if err != nil || capture.Scheme != "https" || (capture.Host != "api.clickmax.io" && capture.Host != "api.clickmax.dev") || capture.User != nil ||
		capture.RawQuery != "" || capture.Fragment != "" || !strings.HasPrefix(capture.Path, "/ingest/") || capture.Path == "/ingest/" {
		return nil, ErrRoute
	}
	body, err := json.Marshal(map[string]string{"name": strings.TrimSpace(input.Name), "email": input.Email})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, capture.String(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	httpClient := &http.Client{Transport: w.Transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var result struct {
		LeadID string `json:"leadId"`
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 || json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&result) != nil ||
		!clickmax.ValidID(result.LeadID) {
		return nil, errors.New("Clickmax capture not confirmed")
	}
	if _, err = client.Leads.Get(ctx, sdk.LeadsGetParams{LeadID: result.LeadID}); err != nil {
		return nil, err
	}
	return result, nil
}
