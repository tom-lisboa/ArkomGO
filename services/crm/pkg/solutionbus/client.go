// Package solutionbus defines the versioned HTTP contract between the new backends.
package solutionbus

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Event struct {
	ID             string          `json:"event_id"`
	OrganizationID string          `json:"organization_id"`
	ActorID        string          `json:"actor_id,omitempty"`
	Source         string          `json:"source_solution"`
	Type           string          `json:"event_type"`
	Subject        string          `json:"subject"`
	OccurredAt     time.Time       `json:"occurred_at"`
	Data           json.RawMessage `json:"data"`
}

type Client struct {
	BaseURL, Token, OrganizationID string
	HTTP                           *http.Client
}

func (c Client) request(ctx context.Context, method, path string, body []byte) ([]byte, error) {
	u, err := url.Parse(c.BaseURL)
	if err != nil || u.RawQuery != "" || u.User != nil || u.Fragment != "" || u.Path != "" && u.Path != "/" {
		return nil, fmt.Errorf("invalid integration origin")
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost")) {
		return nil, fmt.Errorf("HTTPS integration origin required")
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.BaseURL, "/")+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("X-Organization-ID", c.OrganizationID)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	if c.HTTP != nil {
		copy := *c.HTTP
		client = &copy
	}
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("integration request unavailable")
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("integration request refused: HTTP %d", res.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, (11<<20)+1))
	if len(data) > 11<<20 {
		return nil, fmt.Errorf("integration response exceeds limit")
	}
	return data, err
}

func (c Client) Pending(ctx context.Context, source string) ([]Event, error) {
	data, err := c.request(ctx, "GET", "/integration/v1/events?source="+url.QueryEscape(source), nil)
	if err != nil {
		return nil, err
	}
	var body struct {
		Events []Event `json:"events"`
	}
	if err = json.Unmarshal(data, &body); err != nil {
		return nil, err
	}
	for _, e := range body.Events {
		if e.OrganizationID != c.OrganizationID || e.Source != source {
			return nil, fmt.Errorf("integration event scope mismatch")
		}
	}
	return body.Events, nil
}
func (c Client) Acknowledge(ctx context.Context, event Event, receipt string) error {
	if event.OrganizationID != c.OrganizationID {
		return fmt.Errorf("integration event scope mismatch")
	}
	body, _ := json.Marshal(map[string]string{"receipt_id": receipt})
	_, err := c.request(ctx, "POST", "/integration/v1/events/"+url.PathEscape(event.ID)+"/ack?source="+url.QueryEscape(event.Source), body)
	return err
}
func (c Client) Artifact(ctx context.Context, id string) ([]byte, error) {
	return c.request(ctx, "GET", "/integration/v1/artifacts/"+url.PathEscape(id), nil)
}
func (c Client) Publish(ctx context.Context, event Event) error {
	if event.OrganizationID != c.OrganizationID {
		return fmt.Errorf("integration event scope mismatch")
	}
	body, err := json.Marshal(event)
	if err != nil {
		return err
	}
	_, err = c.request(ctx, "POST", "/integration/v1/events", body)
	return err
}
