package main

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

// This authority is separate from every customer/admin session in the Remix.
//
//go:embed internal/metricsworker/dashboard.html
var metricsPage []byte

//go:embed internal/metricsworker/dashboard.js
var metricsJS []byte

type metricsOpsState struct {
	mu                sync.Mutex
	admin             [32]byte
	workerToken, base string
	sessions          map[[32]byte]time.Time
	limits            map[string]limitWindow
	client            *http.Client
}

func newMetricsOps(admin, workerToken, base string) *metricsOpsState {
	return &metricsOpsState{admin: sha256.Sum256([]byte(admin)), workerToken: workerToken, base: base, sessions: map[[32]byte]time.Time{}, limits: map[string]limitWindow{}, client: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}
func (o *metricsOpsState) allow(key string, max int, window time.Duration, now time.Time) bool {
	v := o.limits[key]
	if v.Start == 0 || now.Unix()-v.Start >= int64(window/time.Second) {
		v = limitWindow{Start: now.Unix()}
	}
	v.Used++
	o.limits[key] = v
	if len(o.limits) > 1000 {
		for k, l := range o.limits {
			if now.Unix()-l.Start > 900 {
				delete(o.limits, k)
			}
		}
	}
	return v.Used <= max
}
func (a *App) metricsOps(w http.ResponseWriter, r *http.Request) bool {
	if !strings.HasPrefix(r.URL.Path, "/v1/ops/metrics") {
		return false
	}
	o := a.ops
	if o == nil {
		fail(w, 404, "not_found")
		return true
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Method == "GET" && r.URL.Path == "/v1/ops/metrics" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(metricsPage)
		return true
	}
	if r.Method == "GET" && r.URL.Path == "/v1/ops/metrics/app.js" {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		_, _ = w.Write(metricsJS)
		return true
	}
	if r.Method == "POST" && r.URL.Path == "/v1/ops/metrics/login" {
		o.mu.Lock()
		defer o.mu.Unlock()
		if !o.allow("login:"+remoteIP(r), 10, 15*time.Minute, a.now()) {
			w.Header().Set("Retry-After", "900")
			fail(w, 429, "rate_limited")
			return true
		}
		var body struct {
			Code string `json:"access_code"`
		}
		if !decodeCore(w, r, &body) {
			return true
		}
		if len(body.Code) > 200 {
			fail(w, 422, "validation_error")
			return true
		}
		hash := sha256.Sum256([]byte(body.Code))
		if len(body.Code) < 32 || subtle.ConstantTimeCompare(hash[:], o.admin[:]) != 1 {
			fail(w, 401, "unauthorized")
			return true
		}
		for k, t := range o.sessions {
			if !t.After(a.now()) {
				delete(o.sessions, k)
			}
		}
		if len(o.sessions) >= 100 {
			fail(w, 429, "session_limit")
			return true
		}
		session := token()
		o.sessions[sha256.Sum256([]byte(session))] = a.now().Add(time.Hour)
		write(w, 200, map[string]any{"access_token": session, "expires_in": 3600, "scope": "platform_metrics_read"})
		return true
	}
	if r.Method != "GET" || r.URL.Path != "/v1/ops/metrics/report" {
		fail(w, 404, "not_found")
		return true
	}
	o.mu.Lock()
	hash := sha256.Sum256([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")))
	expires, ok := o.sessions[hash]
	if !ok || !expires.After(a.now()) {
		o.mu.Unlock()
		fail(w, 401, "unauthorized")
		return true
	}
	allowed := o.allow("report:"+hex.EncodeToString(hash[:]), 60, time.Minute, a.now())
	o.mu.Unlock()
	if !allowed {
		fail(w, 429, "rate_limited")
		return true
	}
	days := 7
	var err error
	if raw := r.URL.Query().Get("days"); raw != "" {
		days, err = strconv.Atoi(raw)
	}
	org := r.URL.Query().Get("organization")
	mode := r.URL.Query().Get("mode")
	if !slices.Contains([]string{"", "real", "simulated", "preparation", "preview"}, mode) || err != nil || days < 1 || days > 90 || len(org) > 100 || strings.ContainsAny(org, "/\x00\r\n") {
		fail(w, 422, "validation_error")
		return true
	}
	q := url.Values{"days": {strconv.Itoa(days)}, "organization": {org}, "mode": {mode}}
	req, err := http.NewRequestWithContext(r.Context(), "GET", o.base+"/report?"+q.Encode(), nil)
	if err != nil {
		fail(w, 503, "metrics_unavailable")
		return true
	}
	req.Header.Set("Authorization", "Bearer "+o.workerToken)
	response, err := o.client.Do(req)
	if err != nil {
		fail(w, 503, "metrics_unavailable")
		return true
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || len(data) > 1<<20 || response.StatusCode != 200 || !json.Valid(data) {
		fail(w, 503, "metrics_unavailable")
		return true
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = io.Copy(w, bytes.NewReader(data))
	return true
}
