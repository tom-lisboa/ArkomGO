package main

import (
	"bufio"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func platformTestHandler(t *testing.T, backend http.Handler) http.Handler {
	t.Helper()
	upstream := httptest.NewServer(backend)
	t.Cleanup(upstream.Close)
	target, _ := url.Parse(upstream.URL)
	flutter, bia := t.TempDir(), t.TempDir()
	for dir, text := range map[string]string{flutter: "flutter-platform", bia: "bia-agent"} {
		if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	return platformWebHandler(flutter, bia, target)
}

func TestPlatformWebFlutterRoutesAndAgentBoundary(t *testing.T) {
	handler := platformTestHandler(t, http.NotFoundHandler())
	for _, tc := range []struct {
		path string
		code int
		body string
	}{
		{"/demo", 200, "flutter-platform"}, {"/demo/team", 200, "flutter-platform"},
		{"/demo/home", 200, "flutter-platform"}, {"/demo/genesis/new", 200, "flutter-platform"},
		{"/demo/multipropriedades", 200, "flutter-platform"}, {"/demo/financeai", 200, "flutter-platform"},
		{"/demo/genesis/build_" + strings.Repeat("a", 48), 200, "flutter-platform"},
		{"/agents/bia/", 200, "bia-agent"}, {"/genesis-flutter/index.html", 301, ""},
		{"/demo/systems", 302, ""}, {"/demo/whatsapp", 302, ""},
		{"/demoteam", 404, ""}, {"/demo/missing", 404, ""}, {"/.env", 404, ""},
		{"/api/demo/backend/admin/keys", 404, ""}, {"/api/demo/backend/v1/sdr/../secret", 404, ""},
	} {
		t.Run(tc.path, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:3007"+tc.path, nil)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != tc.code || !strings.Contains(w.Body.String(), tc.body) {
				t.Fatalf("status %d, body %q", w.Code, w.Body.String())
			}
		})
	}
	r := httptest.NewRequest("GET", "http://external.example:3007/demo", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 404 {
		t.Fatal("external host accepted")
	}
}

func TestPlatformWebProxyPreservesTenantHeadersAndRejectsCrossOrigin(t *testing.T) {
	calls := 0
	handler := platformTestHandler(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.RequestURI() != "/v1/sdr/events?after=23" || r.Header.Get("Authorization") != "Bearer tenant-beta" || r.Header.Get("Idempotency-Key") != "same-operation" || r.Header.Get("Last-Event-ID") != "23" {
			t.Error("lost path, cursor, tenant session or idempotency key")
		}
		if r.Header.Get("Cookie") != "" || r.Header.Get("X-Forwarded-For") != "" {
			t.Error("forwarded untrusted ambient identity")
		}
		payload, _ := io.ReadAll(r.Body)
		if string(payload) != "{}" {
			t.Error("lost payload")
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	for _, tc := range []struct {
		method, origin, site string
		code                 int
	}{
		{"POST", "http://127.0.0.1:3007", "same-origin", 202},
		{"POST", "https://attacker.example", "cross-site", 403},
		{"POST", "http://localhost:3007", "same-site", 403},
		{"DELETE", "http://127.0.0.1:3007", "same-origin", 405},
	} {
		r := httptest.NewRequest(tc.method, "http://127.0.0.1:3007/api/demo/backend/v1/sdr/events?after=23", strings.NewReader("{}"))
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("Sec-Fetch-Site", tc.site)
		r.Header.Set("Authorization", "Bearer tenant-beta")
		r.Header.Set("Idempotency-Key", "same-operation")
		r.Header.Set("Last-Event-ID", "23")
		r.Header.Set("Cookie", "session=do-not-forward")
		r.Header.Set("X-Forwarded-For", "1.2.3.4")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != tc.code {
			t.Fatalf("%s %s: %d", tc.method, tc.origin, w.Code)
		}
	}
	if calls != 1 {
		t.Fatalf("%d requests reached the backend", calls)
	}
}

func TestPlatformWebStreamsTracesBeforeBackendCompletes(t *testing.T) {
	release := make(chan struct{})
	handler := platformTestHandler(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "event: update\ndata: first\n\n")
		w.(http.Flusher).Flush()
		<-release
	}))
	web := httptest.NewServer(handler)
	defer web.Close()
	r, _ := http.NewRequest("GET", web.URL+"/api/demo/backend/v1/sdr/events", nil)
	response, err := (&http.Client{Timeout: 2 * time.Second}).Do(r)
	if err != nil {
		close(release)
		t.Fatal(err)
	}
	line, err := bufio.NewReader(response.Body).ReadString('\n')
	close(release)
	response.Body.Close()
	if err != nil || line != "event: update\n" {
		t.Fatalf("stream buffered or changed: %q %v", line, err)
	}
}
