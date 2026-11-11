package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func storedApp(t *testing.T) (*App, map[string]string, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "lab.sqlite")
	a, creds, err := newApp(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { a.Close() })
	return a, creds, path
}
func TestSQLiteAtomicAuditAndRestart(t *testing.T) {
	a, creds, path := storedApp(t)
	op := login(t, a, creds, "alfa.operator")
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	endpoint := "/v1/sdr/conversations/conv_demo_alfa/actions"
	body := map[string]any{"kind": "takeover", "reason": "Equipe assume o atendimento", "expected_revision": 0}
	code, b := req(a, "POST", endpoint, op, "once", body)
	if code != 200 {
		t.Fatal(code, b)
	}
	operation := b["operation_id"]
	req(a, "POST", endpoint, op, "once", body)
	_, out := req(a, "GET", "/v1/sdr/audit", admin, "", nil)
	found := 0
	for _, item := range out["items"].([]any) {
		v := item.(map[string]any)
		if v["operation_id"] == operation {
			found++
			if v["actor_id"] != "user_alfa_operator" || v["reason"] != body["reason"] || v["revision"] != float64(1) {
				t.Fatal("incomplete audit", v)
			}
		}
	}
	if found != 1 {
		t.Fatal("idempotency duplicated audit", found)
	}
	_, out = req(a, "GET", "/v1/sdr/audit", beta, "", nil)
	for _, item := range out["items"].([]any) {
		if item.(map[string]any)["organization_id"] != "org_demo_beta" {
			t.Fatal("audit leaked")
		}
	}
	if code, _ = req(a, "GET", "/v1/sdr/audit", op, "", nil); code != 403 {
		t.Fatal("operator audit permission")
	}
	if _, err := a.db.Exec("UPDATE audit SET reason='changed'"); err == nil {
		t.Fatal("audit is mutable")
	}
	if _, err := a.db.Exec("DELETE FROM audit"); err == nil {
		t.Fatal("audit is deletable")
	}
	var count int
	if err := a.db.QueryRow("SELECT count(*) FROM audit WHERE operation_id=?", operation).Scan(&count); err != nil || count != 1 {
		t.Fatal(count, err)
	}
	a.Close()
	restart, keys, err := newApp(path)
	if err != nil {
		t.Fatal(err)
	}
	defer restart.Close()
	newToken := login(t, restart, keys, "alfa.operator")
	code, b = req(restart, "POST", endpoint, newToken, "once", body)
	if code != 200 || b["duplicate"] != true {
		t.Fatal("lost idempotency", code, b)
	}
	if restart.state.Conversations["conv_demo_alfa"].Revision != 1 {
		t.Fatal("lost snapshot")
	}
}
func TestSQLAuditFailureRollsBackWholeCommand(t *testing.T) {
	a, creds, _ := storedApp(t)
	op := login(t, a, creds, "alfa.operator")
	_, err := a.db.Exec(`CREATE TRIGGER fail_command_audit BEFORE INSERT ON audit WHEN NEW.action='pause' BEGIN SELECT RAISE(ABORT,'injected audit failure'); END`)
	if err != nil {
		t.Fatal(err)
	}
	endpoint := "/v1/sdr/conversations/conv_demo_alfa/actions"
	body := map[string]any{"kind": "pause", "reason": "teste", "expected_revision": 0}
	code, _ := req(a, "POST", endpoint, op, "pause1", body)
	if code != 503 {
		t.Fatal(code)
	}
	if a.state.Conversations["conv_demo_alfa"].Revision != 0 {
		t.Fatal("memory rollback")
	}
	var payload []byte
	if err = a.db.QueryRow("SELECT payload FROM state_snapshot WHERE id=1").Scan(&payload); err != nil {
		t.Fatal(err)
	}
	var persisted State
	if err = json.Unmarshal(payload, &persisted); err != nil {
		t.Fatal(err)
	}
	if persisted.Conversations["conv_demo_alfa"].Automation != "active" || len(persisted.Results) != 0 {
		t.Fatal("database partial commit")
	}
	a.db.Exec("DROP TRIGGER fail_command_audit")
	code, _ = req(a, "POST", endpoint, op, "pause1", body)
	if code != 200 {
		t.Fatal("key consumed on failure", code)
	}
}
func TestSingleProcessAndLegacyProtection(t *testing.T) {
	a, _, path := storedApp(t)
	if second, _, err := newApp(path); err == nil {
		second.Close()
		t.Fatal("second writer acquired lock")
	}
	a.Close()
	second, _, err := newApp(path)
	if err != nil {
		t.Fatal(err)
	}
	second.Close()
	if bad, _, err := newApp(filepath.Join(t.TempDir(), "state.json")); err == nil {
		bad.Close()
		t.Fatal("legacy accepted")
	}
}
func TestPersistedLoginLimitsAndRetryAfter(t *testing.T) {
	a, creds, path := storedApp(t)
	now := time.Now()
	a.now = func() time.Time { return now }
	for i := 0; i < 10; i++ {
		code, _ := req(a, "POST", "/v1/sdr/auth/login", "", "", map[string]any{"username": "alfa.operator", "password": "incorrect"})
		if code != 401 {
			t.Fatal(i, code)
		}
	}
	b, _ := json.Marshal(map[string]any{"username": "alfa.operator", "password": creds["alfa.operator"]})
	r := httptest.NewRequest("POST", "/v1/sdr/auth/login", bytes.NewReader(b))
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	if w.Code != 429 || w.Header().Get("Retry-After") == "" {
		t.Fatal("missing rate response", w.Code)
	}
	// Another legitimate user has a separate user quota.
	login(t, a, creds, "beta.operator")
	a.Close()
	restart, keys, err := newApp(path)
	if err != nil {
		t.Fatal(err)
	}
	defer restart.Close()
	restart.now = func() time.Time { return now }
	code, _ := req(restart, "POST", "/v1/sdr/auth/login", "", "", map[string]any{"username": "alfa.operator", "password": keys["alfa.operator"]})
	if code != 429 {
		t.Fatal("restart bypassed limit", code)
	}
	now = now.Add(15*time.Minute + time.Second)
	login(t, restart, keys, "alfa.operator")
}
func TestCommandQuotaDoesNotMutateConversation(t *testing.T) {
	a, creds, _ := storedApp(t)
	now := time.Now()
	a.now = func() time.Time { return now }
	tok := login(t, a, creds, "alfa.operator")
	endpoint := "/v1/sdr/conversations/conv_demo_alfa/actions"
	body := map[string]any{"kind": "pause", "reason": "teste", "expected_revision": 0}
	for i := 0; i < 60; i++ {
		code, _ := req(a, "POST", endpoint, tok, "same", body)
		if code != 200 {
			t.Fatal(i, code)
		}
	}
	code, _ := req(a, "POST", endpoint, tok, "same", body)
	if code != 429 {
		t.Fatal("no command quota", code)
	}
	if a.state.Conversations["conv_demo_alfa"].Revision != 1 {
		t.Fatal("quota mutated state")
	}
	now = now.Add(time.Minute + time.Second)
	code, _ = req(a, "POST", endpoint, tok, "same", body)
	if code != 200 {
		t.Fatal("window did not reset", code)
	}
}
func TestLimitFailuresFailClosedAndNoSecretsInAudit(t *testing.T) {
	a, creds, _ := storedApp(t)
	tok := login(t, a, creds, "alfa.admin")
	_, b := req(a, "GET", "/v1/sdr/audit", tok, "", nil)
	raw, _ := json.Marshal(b)
	if strings.Contains(string(raw), creds["alfa.admin"]) || strings.Contains(string(raw), tok) {
		t.Fatal("secret in audit")
	}
	a.db.Exec("DROP TABLE request_limits")
	code, _ := req(a, "GET", "/v1/sdr/me", tok, "", nil)
	if code != 503 {
		t.Fatal("limiter failure allowed request", code)
	}
}
func TestIPQuotaIgnoresForwardedHeaders(t *testing.T) {
	a, _, _ := storedApp(t)
	for i := 0; i <= 120; i++ {
		b, _ := json.Marshal(map[string]any{"username": fmt.Sprintf("unknown-%d", i), "password": "incorrect"})
		r := httptest.NewRequest("POST", "/v1/sdr/auth/login", bytes.NewReader(b))
		r.Header.Set("X-Forwarded-For", token())
		w := httptest.NewRecorder()
		a.Handler().ServeHTTP(w, r)
		expected := 401
		if i == 120 {
			expected = 429
		}
		if w.Code != expected {
			t.Fatal(i, w.Code, expected)
		}
	}
}

func TestMessageTaskAndAuditCommitTogether(t *testing.T) {
	a, creds, path := storedApp(t)
	tok := login(t, a, creds, "alfa.operator")
	base := "/v1/sdr/conversations/conv_demo_alfa"
	req(a, "POST", base+"/actions", tok, "take", map[string]any{"kind": "takeover", "reason": "teste", "expected_revision": 0})
	_, err := a.db.Exec(`CREATE TRIGGER fail_message_audit BEFORE INSERT ON audit WHEN NEW.action='message.queued' BEGIN SELECT RAISE(ABORT,'fail'); END`)
	if err != nil {
		t.Fatal(err)
	}
	body := map[string]any{"text": "conteudo privado simulado", "expected_revision": 1}
	code, _ := req(a, "POST", base+"/messages", tok, "msg", body)
	if code != 503 || len(a.state.Tasks) != 0 || len(a.state.Messages["conv_demo_alfa"]) != 0 {
		t.Fatal("partial message commit", code)
	}
	a.db.Exec("DROP TRIGGER fail_message_audit")
	code, b := req(a, "POST", base+"/messages", tok, "msg", body)
	if code != 202 {
		t.Fatal(code, b)
	}
	a.Close()
	a, _, err = newApp(path)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	if len(a.state.Tasks) != 1 {
		t.Fatal("lost task")
	}
	if err = a.Drain(); err != nil {
		t.Fatal(err)
	}
	if a.state.Messages["conv_demo_alfa"][0].Status != "sent" {
		t.Fatal("fake delivery")
	}
	var n int
	err = a.db.QueryRow("SELECT count(*) FROM audit WHERE action='message.sent' AND organization_id='org_demo_alfa'").Scan(&n)
	if err != nil || n != 1 {
		t.Fatal("delivery not audited", n, err)
	}
	var raw string
	err = a.db.QueryRow("SELECT coalesce(group_concat(reason,''),'') FROM audit").Scan(&raw)
	if err != nil || strings.Contains(raw, body["text"].(string)) {
		t.Fatal("message text copied into audit")
	}
}
