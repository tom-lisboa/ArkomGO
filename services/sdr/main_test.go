package main

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func req(a *App, method, path, token, key string, body any) (int, map[string]any) {
	b, _ := json.Marshal(body)
	r := httptest.NewRequest(method, path, bytes.NewReader(b))
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	if key != "" {
		r.Header.Set("Idempotency-Key", key)
	}
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}
func login(t *testing.T, a *App, creds map[string]string, name string) string {
	t.Helper()
	code, b := req(a, "POST", "/v1/sdr/auth/login", "", "", map[string]any{"username": name, "password": creds[name]})
	if code != 200 {
		t.Fatal(code, b)
	}
	return b["access_token"].(string)
}
func TestIsolationAndHumanControl(t *testing.T) {
	a, creds, _ := newApp("")
	alfa := login(t, a, creds, "alfa.operator")
	beta := login(t, a, creds, "beta.operator")
	viewer := login(t, a, creds, "alfa.viewer")
	base := "/v1/sdr/conversations/conv_demo_alfa"
	code, _ := req(a, "GET", "/v1/sdr/conversations/conv_demo_beta", alfa, "", nil)
	if code != 404 {
		t.Fatal("cross tenant", code)
	}
	code, b := req(a, "POST", "/__test/ui/inbound", alfa, "", map[string]any{"provider_event_id": "event1", "conversation_id": "conv_demo_alfa", "text": "oi"})
	if code != 202 {
		t.Fatal(code, b)
	}
	_, dup := req(a, "POST", "/__test/ui/inbound", alfa, "", map[string]any{"provider_event_id": "event1", "conversation_id": "conv_demo_alfa", "text": "oi"})
	if dup["duplicate"] != true || len(a.state.Messages["conv_demo_alfa"]) != 2 {
		t.Fatal("dedupe")
	}
	if len(a.state.Messages["conv_demo_beta"]) != 0 {
		t.Fatal("context leak")
	}
	action := map[string]any{"kind": "pause", "reason": "humano", "expected_revision": 2}
	code, _ = req(a, "POST", base+"/actions", viewer, "pause", action)
	if code != 403 {
		t.Fatal("viewer")
	}
	code, b = req(a, "POST", base+"/actions", alfa, "pause", action)
	if code != 200 {
		t.Fatal(code, b)
	}
	if err := a.Drain(); err != nil {
		t.Fatal(err)
	}
	if a.state.Messages["conv_demo_alfa"][1].Status != "cancelled" {
		t.Fatal("pause failed")
	}
	code, b = req(a, "POST", base+"/actions", alfa, "pause", action)
	if code != 200 || b["duplicate"] != true {
		t.Fatal("action replay")
	}
	msg := map[string]any{"text": "resposta humana", "expected_revision": 3}
	code, b = req(a, "POST", base+"/messages", alfa, "msg1", msg)
	if code != 202 {
		t.Fatal(code, b)
	}
	id := b["message"].(map[string]any)["id"]
	a.Drain()
	code, b = req(a, "POST", base+"/messages", alfa, "msg1", msg)
	if code != 202 || b["message"].(map[string]any)["id"] != id {
		t.Fatal("duplicate message")
	}
	msg["text"] = "outro"
	code, _ = req(a, "POST", base+"/messages", alfa, "msg1", msg)
	if code != 409 {
		t.Fatal("fingerprint")
	}
	_, events := req(a, "GET", "/v1/sdr/events", alfa, "", nil)
	code, _ = req(a, "GET", "/v1/sdr/events?after="+events["next_cursor"].(string), beta, "", nil)
	if code != 400 {
		t.Fatal("cursor tenant leak")
	}
}
func TestPersistenceRollbackAndBusy(t *testing.T) {
	file := filepath.Join(t.TempDir(), "state.sqlite")
	a, creds, _ := newApp(file)
	tok := login(t, a, creds, "alfa.operator")
	path := "/v1/sdr/conversations/conv_demo_alfa/actions"
	body := map[string]any{"kind": "takeover", "reason": "teste", "expected_revision": 0}
	a.failSave = true
	code, _ := req(a, "POST", path, tok, "key", body)
	if code != 503 || a.state.Conversations["conv_demo_alfa"].Revision != 0 {
		t.Fatal("rollback")
	}
	a.failSave = false
	a.state.Busy["conv_demo_alfa"] = true
	code, _ = req(a, "POST", path, tok, "key", body)
	if code != 409 {
		t.Fatal("busy")
	}
	a.state.Busy["conv_demo_alfa"] = false
	code, _ = req(a, "POST", path, tok, "key", body)
	if code != 200 {
		t.Fatal(code)
	}
	a.Close()
	restarted, _, err := newApp(file)
	if err != nil || restarted.state.Conversations["conv_demo_alfa"].Automation != "human" {
		t.Fatal("restart", err)
	}
}
func TestConcurrentIdempotency(t *testing.T) {
	a, creds, _ := newApp("")
	tok := login(t, a, creds, "alfa.operator")
	done := make(chan int, 20)
	for i := 0; i < 20; i++ {
		go func() {
			code, _ := req(a, "POST", "/v1/sdr/conversations/conv_demo_alfa/actions", tok, "same", map[string]any{"kind": "pause", "reason": "teste", "expected_revision": 0})
			done <- code
		}()
	}
	for i := 0; i < 20; i++ {
		if code := <-done; code != 200 {
			t.Fatal(code)
		}
	}
	if a.state.Conversations["conv_demo_alfa"].Revision != 1 {
		t.Fatal("duplicate write")
	}
}

func TestListsRevisionOptOutAndResume(t *testing.T) {
	a, creds, _ := newApp("")
	tok := login(t, a, creds, "alfa.operator")
	code, b := req(a, "GET", "/v1/sdr/conversations", tok, "", nil)
	if code != 200 || len(b["items"].([]any)) != 1 {
		t.Fatal("list", code, b)
	}
	code, b = req(a, "GET", "/v1/sdr/conversations/conv_demo_alfa/messages", tok, "", nil)
	if code != 200 || len(b["items"].([]any)) != 0 {
		t.Fatal("empty history", code, b)
	}
	base := "/v1/sdr/conversations/conv_demo_alfa"
	code, _ = req(a, "POST", base+"/messages", tok, "m", map[string]any{"text": "oi", "expected_revision": 0})
	if code != 409 {
		t.Fatal("human guard")
	}
	code, _ = req(a, "POST", base+"/actions", tok, "pause", map[string]any{"kind": "pause", "reason": "teste", "expected_revision": 1})
	if code != 409 {
		t.Fatal("revision")
	}
	req(a, "POST", base+"/actions", tok, "pause", map[string]any{"kind": "pause", "reason": "teste", "expected_revision": 0})
	req(a, "POST", "/__test/ui/inbound", tok, "", map[string]any{"provider_event_id": "paused1", "conversation_id": "conv_demo_alfa", "text": "inbound pausado"})
	if len(a.state.Messages["conv_demo_alfa"]) != 1 || len(a.state.Tasks) != 0 {
		t.Fatal("paused inbound")
	}
	code, _ = req(a, "POST", base+"/actions", tok, "resume", map[string]any{"kind": "resume", "reason": "teste", "expected_revision": 2})
	if code != 200 {
		t.Fatal("resume", code)
	}
	a.Drain()
	if len(a.state.Messages["conv_demo_alfa"]) != 1 {
		t.Fatal("backlog replay")
	}
	a.state.Conversations["conv_demo_alfa"].OptedOut = true
	code, _ = req(a, "POST", base+"/actions", tok, "resume2", map[string]any{"kind": "resume", "reason": "teste", "expected_revision": 3})
	if code != 409 {
		t.Fatal("optout")
	}
}
