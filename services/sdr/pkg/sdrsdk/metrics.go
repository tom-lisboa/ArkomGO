package sdrsdk

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"time"
)

// Metadata only. No prompts, messages, phone numbers, filenames or credentials.
type WorkerMetricEvent struct {
	SchemaVersion int       `json:"schema_version"`
	Sequence      int64     `json:"sequence"`
	ID            string    `json:"id"`
	Organization  string    `json:"organization_id"`
	Worker        string    `json:"worker"`
	Job           string    `json:"job"`
	Attempt       string    `json:"attempt"`
	Phase         string    `json:"phase"`
	Outcome       string    `json:"outcome,omitempty"`
	Kind          string    `json:"kind,omitempty"`
	Mode          string    `json:"mode,omitempty"`
	Parents       []string  `json:"parents,omitempty"`
	At            time.Time `json:"at"`
}
type WorkerMetricBatch struct {
	Source         string              `json:"source"`
	CollectedSince time.Time           `json:"collected_since"`
	Floor          int64               `json:"floor"`
	Head           int64               `json:"head"`
	Events         []WorkerMetricEvent `json:"events"`
}
type MetricSource interface {
	ReadMetricEvents(context.Context, int64) (WorkerMetricBatch, error)
}

func MetricJob(org, worker, job string) string { return Digest(org + "\x00" + worker + "\x00" + job) }
func (c *Client) ReadMetricEvents(ctx context.Context, after int64) (WorkerMetricBatch, error) {
	var batch WorkerMetricBatch
	r, err := http.NewRequestWithContext(ctx, "GET", c.Base+"/internal/metrics/events?after="+strconv.FormatInt(after, 10), nil)
	if err != nil {
		return batch, ErrUnavailable
	}
	r.Header.Set("Authorization", "Bearer "+c.Token)
	response, err := c.HTTP.Do(r)
	if err != nil {
		return batch, ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return batch, ErrUnavailable
	}
	err = json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&batch)
	return batch, err
}
