package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"deeph/pkg/construction"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestConstructionGIFUsesAccountBridgeAndStableWorkerRequest(t *testing.T) {
	t.Setenv("SDR_CRM_DEV_ENABLED", "true")
	secret := strings.Repeat("g", 48)
	t.Setenv("SDR_CLIPS_BRIDGE_KEY", secret)
	var requests, posts int
	var requestKey, alfaSubject, betaSubject string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		subject, scope := r.Header.Get("X-Arkom-Clips-Subject"), r.Header.Get("X-Arkom-Clips-Scope")
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write([]byte("clips-gif/v1\x00" + subject + "\x00" + scope + "\x00" + r.Method + "\x00" + r.URL.Path))
		if r.Header.Get("X-Arkom-Clips-Signature") != hex.EncodeToString(mac.Sum(nil)) {
			t.Error("invalid worker signature")
		}
		if r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
			t.Error("platform session leaked to worker")
		}
		if alfaSubject == "" {
			alfaSubject = subject
		} else if subject != alfaSubject {
			betaSubject = subject
		}
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "POST" {
			posts++
			key := r.Header.Get("Idempotency-Key")
			if requestKey != "" && key != requestKey {
				t.Error("retry can purchase another GIF")
			}
			requestKey = key
			var body struct {
				Prompt string
				Gift   bool
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			if !body.Gift || body.Prompt != "coffee steam" {
				t.Error("unexpected source of generation", body)
			}
			w.WriteHeader(202)
			_, _ = w.Write([]byte(`{"id":"job-1"}`))
			return
		}
		if strings.HasSuffix(r.URL.Path, "/image") {
			_, _ = w.Write([]byte("worker GIF bytes"))
			return
		}
		_, _ = w.Write([]byte(`{"has_key":false,"jobs":[{"id":"job-1","status":"done"}]}`))
	}))
	defer server.Close()
	t.Setenv("ARKOM_LOCAL_CLIPS_LISTEN", strings.TrimPrefix(server.URL, "http://"))
	g := constructionGIFGenerator{app: &App{}, user: User{ID: "user_alfa_admin", Org: "org_demo_alfa", Role: "admin", Environment: "isolated-test"}, buildID: "build-owned-by-alfa"}
	for i := 0; i < 2; i++ {
		out, err := g.GenerateGIF(context.Background(), "cafe", construction.GIFRequest{Prompt: "coffee steam", Alt: "Café"})
		if err != nil || out.JobID != "job-1" || string(out.Data) != "worker GIF bytes" {
			t.Fatal(out, err)
		}
	}
	if posts != 2 || requestKey == "" {
		t.Fatal("request identity missing")
	}
	g.user = User{ID: "user_beta_admin", Org: betaOrganization, Role: "admin"}
	if _, err := g.request(context.Background(), "GET", "/app/gifs", nil); err != nil {
		t.Fatal(err)
	}
	if alfaSubject == betaSubject || betaSubject == "" {
		t.Fatal("companies share worker account")
	}
	before := requests
	g.user.Role = "viewer"
	if _, err := g.GenerateGIF(context.Background(), "cafe", construction.GIFRequest{Prompt: "coffee steam"}); err == nil || before != requests {
		t.Fatal("viewer can generate GIFs")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	g.user.Role = "admin"
	if _, err := g.GenerateGIF(ctx, "cafe", construction.GIFRequest{Prompt: "coffee steam"}); err == nil {
		t.Fatal("cancellation ignored")
	}
}
