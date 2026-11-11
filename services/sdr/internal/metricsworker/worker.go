package metricsworker

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"sdr-next-pilot/pkg/sdrsdk"
	"slices"
	"strconv"
	"time"
)

type Worker struct {
	Source sdrsdk.MetricSource
	Store  *Store
}

func (w *Worker) Once(ctx context.Context) (bool, error) {
	cursor, e := w.Store.Cursor()
	if e != nil {
		return false, e
	}
	b, e := w.Source.ReadMetricEvents(ctx, cursor)
	if e != nil {
		w.Store.PollError(time.Now())
		return false, e
	}
	if e = w.Store.Apply(b, time.Now()); e != nil {
		w.Store.PollError(time.Now())
		return false, e
	}
	return len(b.Events) > 0, nil
}
func (w *Worker) Run(ctx context.Context) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for {
		poll, cancel := context.WithTimeout(ctx, 10*time.Second)
		more, e := w.Once(poll)
		cancel()
		if ctx.Err() != nil {
			return
		}
		if more && e == nil {
			continue
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
func (s *Store) Handler(secret string) http.Handler {
	expected := sha256.Sum256([]byte(secret))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json")
		actual := sha256.Sum256([]byte(r.Header.Get("Authorization")))
		if subtle.ConstantTimeCompare(expected[:], actual[:]) != 1 {
			w.WriteHeader(401)
			return
		}
		if r.Method != "GET" || (r.URL.Path != "/report" && r.URL.Path != "/customer-report") {
			w.WriteHeader(404)
			return
		}
		days := 7
		if v := r.URL.Query().Get("days"); v != "" {
			var e error
			days, e = strconv.Atoi(v)
			if e != nil || days < 1 || days > 90 {
				w.WriteHeader(422)
				return
			}
		}
		org := r.URL.Query().Get("organization")
		if r.URL.Path == "/customer-report" && org == "" {
			w.WriteHeader(422)
			return
		}
		if org != "" && !nameRE.MatchString(org) {
			w.WriteHeader(422)
			return
		}
		mode := r.URL.Query().Get("mode")
		if !slices.Contains([]string{"", "real", "simulated", "preparation", "preview"}, mode) {
			w.WriteHeader(422)
			return
		}
		var report any
		var e error
		if r.URL.Path == "/customer-report" {
			report, e = s.CustomerReport(time.Now(), days, org, mode)
		} else {
			report, e = s.Report(time.Now(), days, org, mode)
		}
		if e != nil {
			w.WriteHeader(503)
			_, _ = w.Write([]byte(`{"error":"metrics_unavailable"}`))
			return
		}
		_ = json.NewEncoder(w).Encode(report)
	})
}
