package main

import (
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"sdr-next-pilot/pkg/sdrsdk"
	"strconv"
	"strings"
	"time"
)

func (a *App) initMetricsEvents() error {
	if a.db == nil {
		return nil
	}
	_, err := a.db.Exec(`CREATE TABLE IF NOT EXISTS worker_event_meta(id INTEGER PRIMARY KEY CHECK(id=1),source TEXT NOT NULL,collected_since TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS worker_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,at INTEGER NOT NULL,payload BLOB NOT NULL);
CREATE INDEX IF NOT EXISTS worker_events_at ON worker_events(at);`)
	if err != nil {
		return err
	}
	_, err = a.db.Exec("INSERT OR IGNORE INTO worker_event_meta VALUES(1,?,?)", token(), a.now().UTC().Format(time.RFC3339Nano))
	return err
}

func (a *App) metricMode(conversation string) string {
	if c := a.state.Conversations[conversation]; c != nil {
		if c.Channel == "whatsapp" {
			return "real"
		}
		return "simulated"
	}
	return "preparation"
}
func (a *App) metricStart(worker, org, job, lease, kind, mode string, parents ...string) {
	if lease == "" {
		return
	}
	key := sdrsdk.MetricJob(org, worker, job)
	attempt := sdrsdk.Digest("metric-attempt:" + key + ":" + lease)
	clean := []string{}
	for _, p := range parents {
		if p != "" {
			clean = append(clean, p)
		}
	}
	a.pendingMetrics = append(a.pendingMetrics, sdrsdk.WorkerMetricEvent{SchemaVersion: 1, ID: attempt + ":start", Organization: org, Worker: worker, Job: key, Attempt: attempt, Phase: "start", Kind: kind, Mode: mode, Parents: clean, At: a.now().UTC()})
}
func (a *App) metricEnd(worker, org, job, lease, outcome string) {
	if lease == "" {
		return
	}
	key := sdrsdk.MetricJob(org, worker, job)
	attempt := sdrsdk.Digest("metric-attempt:" + key + ":" + lease)
	a.pendingMetrics = append(a.pendingMetrics, sdrsdk.WorkerMetricEvent{SchemaVersion: 1, ID: attempt + ":finish", Organization: org, Worker: worker, Job: key, Attempt: attempt, Phase: "finish", Outcome: outcome, At: a.now().UTC()})
}
func (a *App) metricContextParents(j *ContextWindow) []string {
	wanted := map[string]bool{}
	for _, id := range j.InputIDs {
		wanted[id] = true
	}
	parents := []string{}
	for _, m := range a.state.Media.Jobs {
		if m.Org == j.Org && m.Direction == "inbound" && wanted[m.Message] {
			parents = append(parents, sdrsdk.MetricJob(j.Org, "media", m.ID))
		}
	}
	return parents
}
func (a *App) metricOperationParents(e *PlatformExecution, step string) []string {
	parents := []string{}
	f, _ := platformWorkflow(e.Config, e.WorkflowID)
	for i, s := range f.Steps {
		if s.ID != step {
			continue
		}
		for p := i - 1; p >= 0; p-- {
			for _, record := range e.Steps {
				if record.StepID == f.Steps[p].ID && record.Status == "completed" {
					parents = append(parents, sdrsdk.MetricJob(e.Org, "execution", e.ID+":"+record.StepID))
					break
				}
			}
			if len(parents) > 0 {
				break
			}
		}
	}
	if len(parents) == 0 && e.ParentRunID != "" {
		parents = append(parents, sdrsdk.MetricJob(e.Org, "execution", e.ParentRunID))
	}
	if e.Plan.Handler == "media.send" {
		if asset := a.state.Media.Assets[e.Plan.Inputs["media_id"]]; asset != nil && asset.Organization == e.Org && asset.Direction == "outbound" {
			parents = append(parents, sdrsdk.MetricJob(e.Org, "media", asset.ID))
		}
	}
	return parents
}
func (a *App) metricTransportParents(d *realDelivery) []string {
	org := d.Envelope.Organization
	for _, m := range a.state.Messages[d.Envelope.Conversation] {
		if m.ID == d.Envelope.ID && m.ExecutionID != "" {
			return []string{sdrsdk.MetricJob(org, "execution", m.ExecutionID+":"+m.ExecutionStep)}
		}
	}
	if d.RunID != "" {
		return []string{sdrsdk.MetricJob(org, "execution", d.RunID)}
	}
	if d.Envelope.MediaID != "" {
		return []string{sdrsdk.MetricJob(org, "media", d.Envelope.MediaID)}
	}
	return nil
}

func (a *App) metricsFeed(w http.ResponseWriter, r *http.Request) bool {
	if r.URL.Path != "/internal/metrics/events" {
		return false
	}
	if r.Method != "GET" {
		fail(w, 405, "method_not_allowed")
		return true
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	expected, exists := a.workerSecrets["metrics"]
	actual := sha256.Sum256([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")))
	if !exists || subtle.ConstantTimeCompare(expected[:], actual[:]) != 1 {
		fail(w, 401, "unauthorized")
		return true
	}
	if a.db == nil {
		fail(w, 503, "metrics_storage_unavailable")
		return true
	}
	after := int64(0)
	if raw := r.URL.Query().Get("after"); raw != "" {
		n, e := strconv.ParseInt(raw, 10, 64)
		if e != nil || n < 0 {
			fail(w, 422, "validation_error")
			return true
		}
		after = n
	}
	var batch sdrsdk.WorkerMetricBatch
	var since string
	if err := a.db.QueryRow("SELECT source,collected_since FROM worker_event_meta WHERE id=1").Scan(&batch.Source, &since); err != nil {
		fail(w, 503, "metrics_storage_unavailable")
		return true
	}
	batch.CollectedSince, _ = time.Parse(time.RFC3339Nano, since)
	if err := a.db.QueryRow("SELECT coalesce((SELECT min(seq) FROM worker_events),0),coalesce((SELECT seq FROM sqlite_sequence WHERE name='worker_events'),0)").Scan(&batch.Floor, &batch.Head); err != nil {
		fail(w, 503, "metrics_storage_unavailable")
		return true
	}
	rows, err := a.db.Query("SELECT seq,payload FROM worker_events WHERE seq>? ORDER BY seq LIMIT 200", after)
	if err != nil {
		fail(w, 503, "metrics_storage_unavailable")
		return true
	}
	defer rows.Close()
	batch.Events = []sdrsdk.WorkerMetricEvent{}
	for rows.Next() {
		var seq int64
		var raw []byte
		var event sdrsdk.WorkerMetricEvent
		if rows.Scan(&seq, &raw) != nil || json.Unmarshal(raw, &event) != nil {
			fail(w, 503, "metrics_storage_unavailable")
			return true
		}
		event.Sequence = seq
		batch.Events = append(batch.Events, event)
	}
	if rows.Err() != nil {
		fail(w, 503, "metrics_storage_unavailable")
		return true
	}
	a.workerHealth["metrics"] = WorkerHealth{At: a.now().UTC(), Model: "metrics"}
	write(w, 200, batch)
	return true
}

func (a *App) saveMetricEvents(tx interface {
	Exec(string, ...any) (sql.Result, error)
}) error {
	for _, event := range a.pendingMetrics {
		raw, err := json.Marshal(event)
		if err != nil {
			return err
		}
		if _, err = tx.Exec("INSERT OR IGNORE INTO worker_events(id,at,payload) VALUES(?,?,?)", event.ID, event.At.Unix(), raw); err != nil {
			return fmt.Errorf("worker metric commit: %w", err)
		}
	}
	if len(a.pendingMetrics) > 0 && a.now().Sub(a.metricsLastPrune) >= 10*time.Minute {
		if _, err := tx.Exec("DELETE FROM worker_events WHERE at<?", a.now().Add(-90*24*time.Hour).Unix()); err != nil {
			return err
		}
		a.metricsLastPrune = a.now()
	}
	return nil
}
