// Package clickmax uses the documented public REST API for pipeline cards.
package clickmax

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const apiURL = "https://mcp.clickmax.io/api/v0"

var uuid = regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`)
var keyPattern = regexp.MustCompile(`^cx[psd]_[A-Za-z0-9_-]{8,512}$`)

func ValidID(id string) bool { return uuid.MatchString(id) }

type Client struct {
	key  string
	HTTP *http.Client
}

func New(key string) (*Client, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil, nil
	}
	if !keyPattern.MatchString(key) {
		return nil, errors.New("invalid BIA_CLICKMAX_API_KEY")
	}
	return &Client{key: key, HTTP: &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}

type RequestError struct {
	Status int
	Code   string
}

func (e *RequestError) Error() string { return fmt.Sprintf("clickmax_http_%d", e.Status) }

func (c *Client) request(ctx context.Context, method, path string, body, out any) error {
	var encoded []byte
	if body != nil {
		var err error
		encoded, err = json.Marshal(body)
		if err != nil {
			return err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, apiURL+path, bytes.NewReader(encoded))
	if err != nil {
		return errors.New("clickmax_request_invalid")
	}
	req.Header.Set("Authorization", "Bearer "+c.key)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return errors.New("clickmax_transport_unavailable")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		var detail struct{ Code string }
		_ = json.NewDecoder(io.LimitReader(resp.Body, 8192)).Decode(&detail)
		return &RequestError{Status: resp.StatusCode, Code: detail.Code}
	}
	const maxBody = 4 << 20
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxBody+1))
	if err != nil || len(raw) > maxBody || json.Unmarshal(raw, out) != nil {
		return errors.New("clickmax_response_invalid")
	}
	return nil
}

type Pipeline struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	ArchivedAt *time.Time `json:"archivedAt,omitempty"`
	Stages     []struct {
		ID    string  `json:"stageId"`
		Name  string  `json:"stageName"`
		Order float64 `json:"displayOrder"`
	} `json:"stagesBreakdown"`
}

func (c *Client) Pipelines(ctx context.Context) ([]Pipeline, error) {
	var out struct {
		Data []Pipeline `json:"data"`
	}
	err := c.request(ctx, http.MethodGet, "/pipelines/list", nil, &out)
	if err == nil && out.Data == nil {
		return nil, errors.New("clickmax_pipeline_list_invalid")
	}
	return out.Data, err
}

type Card struct {
	CreatedAt              time.Time `json:"createdAt"`
	ID                     string    `json:"id"`
	PipelineID             string    `json:"pipelineId"`
	StageID                string    `json:"stageId"`
	Status                 string    `json:"status"`
	LeadIDs                []string  `json:"leadIds"`
	ResponsibleAttendantID string    `json:"responsibleAttendantId"`
	OpenScheduledCall      *struct {
		ID    string    `json:"id"`
		Start time.Time `json:"startAt"`
		End   time.Time `json:"endAt"`
	} `json:"openScheduledCall"`
}

func (c *Client) Card(ctx context.Context, id string) (Card, error) {
	var out Card
	err := c.request(ctx, http.MethodGet, "/cards/get?cardId="+url.QueryEscape(id), nil, &out)
	if err == nil && (!strings.EqualFold(out.ID, id) || !ValidID(out.PipelineID) || !ValidID(out.StageID)) {
		err = errors.New("clickmax_card_unverified")
	}
	return out, err
}

type Contact struct {
	ID                 string `json:"id"`
	Name               string `json:"name"`
	Email              string `json:"email"`
	Phone              string `json:"telephone"`
	MessagePreferences struct {
		WhatsApp *bool `json:"whatsapp"`
	} `json:"messagePreferences"`
	Tags []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"tags"`
}

func (c *Client) Contact(ctx context.Context, id string) (Contact, error) {
	var out Contact
	err := c.request(ctx, http.MethodGet, "/leads/get?leadId="+url.QueryEscape(id), nil, &out)
	if err == nil && !strings.EqualFold(out.ID, id) {
		err = errors.New("clickmax_contact_unverified")
	}
	return out, err
}

// ApplyTag is idempotent; applied=0 means the marker was already present.
func (c *Client) ApplyTag(ctx context.Context, contact, tag string) error {
	if !ValidID(contact) || !ValidID(tag) {
		return errors.New("clickmax_tag_identity_invalid")
	}
	var out struct {
		Applied int `json:"applied"`
	}
	return c.request(ctx, http.MethodPost, "/tags/apply-to-leads", map[string]any{"leadIds": []string{contact}, "tagId": tag}, &out)
}

func (c *Client) Move(ctx context.Context, id, pipeline, stage string) error {
	var out Card
	if err := c.request(ctx, http.MethodPost, "/cards/move", map[string]string{"id": id, "stageId": stage}, &out); err != nil {
		return err
	}
	if !strings.EqualFold(out.ID, id) || !strings.EqualFold(out.PipelineID, pipeline) || !strings.EqualFold(out.StageID, stage) {
		return errors.New("clickmax_move_unverified")
	}
	return nil
}
