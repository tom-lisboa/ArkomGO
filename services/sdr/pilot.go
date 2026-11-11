package main

import (
	"net/http"
	"net/url"
	"os"
	"strings"
)

// Origin checks are additional browser controls; tenant access always requires
// a session and the appropriate pilot code. No cookies or wildcard ACAO.
func pilotOrigin(origin string) bool {
	if os.Getenv("SDR_CRM_DEV_ENABLED") == "true" && origin == "http://127.0.0.1:8080" {
		return true
	}
	if origin == "https://24.199.100.186" || origin == "https://sdk.arkom.ai" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	host := u.Hostname()
	return strings.HasSuffix(host, ".lovable.app") || strings.HasSuffix(host, ".lovable.dev") || strings.HasSuffix(host, ".lovableproject.com")
}
func pilotCORS(w http.ResponseWriter, r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin != "" {
		if !pilotOrigin(origin) {
			fail(w, 403, "forbidden")
			return false
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Expose-Headers", "Retry-After")
	}
	if r.Method == "OPTIONS" {
		if origin == "" {
			fail(w, 403, "forbidden")
			return false
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key")
		w.Header().Set("Access-Control-Max-Age", "300")
		w.WriteHeader(204)
		return false
	}
	return true
}
