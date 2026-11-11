package clickmax

import (
	"context"
	"errors"
	"net/http"
	"net/url"
)

func (c *Client) ContactsByPhoneSuffix(ctx context.Context, suffix string) ([]Contact, error) {
	var out struct {
		Data []Contact `json:"data"`
		Meta struct {
			Count int `json:"countItens"`
		} `json:"meta"`
	}
	body := map[string]any{"perPage": 100, "filters": []map[string]any{
		{"field": "telephone", "operator": "endsWith", "negation": false, "valueString": suffix},
	}}
	if err := c.request(ctx, http.MethodPost, "/leads/search", body, &out); err != nil {
		return nil, err
	}
	if out.Data == nil || out.Meta.Count != len(out.Data) {
		return nil, errors.New("clickmax_contact_search_incomplete")
	}
	return out.Data, nil
}

func (c *Client) ContactCards(ctx context.Context, contact string) ([]Card, error) {
	var out struct {
		Data []Card `json:"data"`
	}
	if err := c.request(ctx, http.MethodGet, "/cards/list-by-lead?leadId="+url.QueryEscape(contact), nil, &out); err != nil {
		return nil, err
	}
	if out.Data == nil {
		return nil, errors.New("clickmax_card_list_invalid")
	}
	return out.Data, nil
}

func (c *Client) CreateCard(ctx context.Context, pipeline, stage, contact, title string) (Card, error) {
	var out Card
	err := c.request(ctx, http.MethodPost, "/cards/create", map[string]any{
		"pipelineId": pipeline, "stageId": stage, "leadIds": []string{contact}, "title": title,
	}, &out)
	return out, err
}

func (c *Client) SetCardField(ctx context.Context, card, field, value string) error {
	var out struct {
		Mode     string `json:"mode"`
		Affected int    `json:"affected"`
	}
	if err := c.request(ctx, http.MethodPost, "/opportunities/bulk-set-custom-field", map[string]any{
		"cardIds": []string{card}, "customFieldId": field, "value": value,
	}, &out); err != nil {
		return err
	}
	if out.Mode != "sync" || out.Affected != 1 {
		return errors.New("clickmax_field_update_unverified")
	}
	return nil
}
