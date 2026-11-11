package sdrsdk

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	Base, Token, Model string
	HTTP               *http.Client
}

func NewClient(base, token, model string) (*Client, error) {
	if base != "http://sdr-next-pilot:8081" || len(token) < 32 {
		return nil, errors.New("invalid_private_worker_configuration")
	}
	return &Client{Base: base, Token: token, Model: model, HTTP: &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}
func (c *Client) post(ctx context.Context, path string, body, out any) (bool, error) {
	raw, _ := json.Marshal(body)
	r, err := http.NewRequestWithContext(ctx, "POST", c.Base+path, bytes.NewReader(raw))
	if err != nil {
		return false, ErrUnavailable
	}
	r.Header.Set("Authorization", "Bearer "+c.Token)
	r.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(r)
	if err != nil {
		return false, ErrUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode == 204 {
		return false, nil
	}
	if resp.StatusCode == 409 {
		return false, ErrStale
	}
	if resp.StatusCode >= 500 {
		return false, ErrUnavailable
	}
	if resp.StatusCode != 200 {
		return false, errors.New("worker_command_rejected")
	}
	if out != nil {
		if json.NewDecoder(io.LimitReader(resp.Body, 256<<10)).Decode(out) != nil {
			return false, errors.New("worker_response_invalid")
		}
	}
	return true, nil
}
func (c *Client) ClaimContext(ctx context.Context) (ContextJob, bool, error) {
	var j ContextJob
	ok, e := c.post(ctx, "/internal/workers/context/claim", map[string]string{}, &j)
	return j, ok, e
}
func (c *Client) CompleteContext(ctx context.Context, j ContextJob, p Prepared) error {
	_, e := c.post(ctx, "/internal/workers/context/complete", struct {
		ID       string   `json:"id"`
		Lease    string   `json:"lease"`
		Prepared Prepared `json:"prepared"`
	}{j.ID, j.Lease, p}, nil)
	return e
}
func (c *Client) FailContext(ctx context.Context, j ContextJob, code string) error {
	_, e := c.post(ctx, "/internal/workers/context/fail", map[string]string{"id": j.ID, "lease": j.Lease, "code": code}, nil)
	return e
}
func (c *Client) ClaimExecution(ctx context.Context) (ExecutionJob, bool, error) {
	var j ExecutionJob
	ok, e := c.post(ctx, "/internal/workers/execution/claim", map[string]string{"model": strings.TrimSpace(c.Model)}, &j)
	return j, ok, e
}
func (c *Client) CompleteExecution(ctx context.Context, j ExecutionJob, o Outcome) error {
	_, e := c.post(ctx, "/internal/workers/execution/complete", struct {
		ID      string  `json:"id"`
		Lease   string  `json:"lease"`
		Outcome Outcome `json:"outcome"`
	}{j.ID, j.Lease, o}, nil)
	return e
}
func (c *Client) FailExecution(ctx context.Context, j ExecutionJob, code string) error {
	_, e := c.post(ctx, "/internal/workers/execution/fail", map[string]string{"id": j.ID, "lease": j.Lease, "code": code}, nil)
	return e
}
