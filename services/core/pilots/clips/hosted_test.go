package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHostedAPIRequiresTeamToken(t *testing.T) {
	handler := privateHostedAPI(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}), strings.Repeat("x", 48))
	for _, tc := range []struct {
		path, auth string
		status     int
	}{
		{"/healthz", "", 204},
		{"/studio/session", "", 401},
		{"/ops/status", "Bearer incorrect", 401},
		{"/studio/jobs/known/video", "", 401},
		{"/ops/status", "Bearer " + strings.Repeat("x", 48), 204},
	} {
		req := httptest.NewRequest("GET", tc.path, nil)
		req.Header.Set("Authorization", tc.auth)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != tc.status {
			t.Fatalf("%s got %d, want %d", tc.path, rec.Code, tc.status)
		}
	}
}
