package main

import (
	"crypto/sha256"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestFollowupWorkerUsesOwnConversationAndCancelsOnReply(t *testing.T) {
	a, credentials, err := newApp("")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	now := time.Now().UTC()
	a.now = func() time.Time { return now }
	secret := strings.Repeat("x", 32)
	a.workerSecrets = map[string][32]byte{"followup": sha256.Sum256([]byte(secret))}
	alfa := login(t, a, credentials, "alfa.admin")
	beta := login(t, a, credentials, "beta.admin")
	const path = "/v1/sdr/followups"
	schedule := func(bearer, conversation string, want int) string {
		t.Helper()
		code, result := req(a, http.MethodPost, path, bearer, conversation,
			map[string]any{"conversation_id": conversation, "text": "Retomada de teste", "due_at": now.Add(time.Minute)})
		if code != want {
			t.Fatalf("schedule %s returned %d; expected %d", conversation, code, want)
		}
		id, _ := result["id"].(string)
		return id
	}
	schedule(alfa, "conv_demo_beta", 404)
	first := schedule(alfa, "conv_demo_alfa", 202)
	second := schedule(beta, "conv_demo_beta", 202)
	if code, _ := req(a, http.MethodGet, path+"/"+first, beta, "", nil); code != 404 {
		t.Fatal("Beta read the Alfa follow-up")
	}
	if code, _ := req(a, http.MethodPost, path+"/"+second+"/cancel", alfa, "", struct{}{}); code != 404 {
		t.Fatal("Alfa cancelled the Beta follow-up")
	}
	if code, _ := req(a, http.MethodPost, "/__test/ui/inbound", beta, "", map[string]string{
		"provider_event_id": "inbound-test", "conversation_id": "conv_demo_beta", "text": "Quero continuar",
	}); code != 202 {
		t.Fatal(code)
	}
	now = now.Add(time.Minute)
	process := func(bearer string, want int) {
		t.Helper()
		r := httptest.NewRequest(http.MethodPost, "/internal/workers/followup/process", strings.NewReader("{}"))
		r.Header.Set("Authorization", "Bearer "+bearer)
		w := httptest.NewRecorder()
		a.privateWorkers().ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("worker returned %d, expected %d", w.Code, want)
		}
	}
	process(alfa, 401)
	process(secret, 200)
	process(secret, 200)
	process(secret, 204)
	if err := a.Drain(); err != nil {
		t.Fatal(err)
	}
	_, delivered := req(a, http.MethodGet, path+"/"+first, alfa, "", nil)
	_, cancelled := req(a, http.MethodGet, path+"/"+second, beta, "", nil)
	if delivered["status"] != "sent" || cancelled["status"] != "cancelled" || cancelled["reason"] != "conversation_changed" {
		t.Fatalf("unexpected follow-up states: %v / %v", delivered, cancelled)
	}
}
