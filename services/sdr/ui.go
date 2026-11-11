package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Deliberately passwordless local demo entrance. No production account or harness
// secret is returned to the browser. The binary remains a loopback-only laboratory.
func (a *App) demoLogin(w http.ResponseWriter, r *http.Request) {
	if !a.allow(w, r, []quota{{"demo-login-ip:" + remoteIP(r), 120, 15 * time.Minute}}) {
		return
	}
	var body struct {
		Company    string `json:"company"`
		Role       string `json:"role"`
		AccessCode string `json:"access_code"`
	}
	if !decode(w, r, &body) {
		return
	}
	if (body.Company != "alfa" && body.Company != "beta") || (body.Role != "admin" && body.Role != "operator" && body.Role != "viewer") {
		fail(w, 422, "validation_error")
		return
	}
	name := body.Company + "." + body.Role
	if !a.allow(w, r, []quota{{"login-user:" + name, 10, 15 * time.Minute}}) {
		return
	}
	hash, ok := a.passwords[name]
	if !ok || hash != sha256.Sum256([]byte(body.AccessCode)) {
		if !a.authAudit(w, name, "demo.login.denied") {
			return
		}
		fail(w, 401, "unauthorized")
		return
	}
	key := token()
	u, directoryErr := a.directoryUser(r.Context(), a.users[name])
	if directoryErr != nil {
		directoryFailure(w, directoryErr)
		return
	}
	if !a.authAudit(w, name, "demo.login.accepted") {
		return
	}
	if err := a.prepareWhatsApp(u.Org); err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	a.sessions[fmt.Sprintf("%x", sha256.Sum256([]byte(key)))] = session{a.users[name], a.now().Add(time.Hour)}
	write(w, 200, map[string]any{"access_token": key, "identity": u})
}
func (a *App) demoInbound(w http.ResponseWriter, r *http.Request, u User) {
	if u.Role == "viewer" {
		if !a.deniedAudit(w, u, "demo.inbound.denied") {
			return
		}
		fail(w, 403, "forbidden")
		return
	}
	connection := "conn_demo_" + strings.TrimPrefix(u.Org, "org_demo_")
	if !a.allow(w, r, []quota{{"harness:" + connection, 120, time.Minute}}) {
		return
	}
	a.acceptInbound(w, r, connection)
}

func (a *App) createTestConversation(w http.ResponseWriter, r *http.Request, u User) {
	if u.Role == "viewer" {
		fail(w, 403, "forbidden")
		return
	}
	var body struct {
		Label string `json:"label"`
	}
	if !decode(w, r, &body) {
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if !textOK(body.Label, 100, true) || key == "" || len(key) > 100 {
		fail(w, 422, "validation_error")
		return
	}
	fp := fingerprint(body)
	rk := "new-test-conversation:" + u.Org + ":" + u.ID + ":" + key
	if a.replay(w, rk, fp) {
		return
	}
	count := 0
	for _, c := range a.state.Conversations {
		if c.Org == u.Org && c.Channel == "fake_whatsapp" {
			count++
		}
	}
	if count >= 40 {
		fail(w, 409, "test_conversation_limit")
		return
	}
	c := &Conversation{ID: "conv_test_" + token(), Label: body.Label, Org: u.Org, Contact: "contact_test_" + token(), Channel: "fake_whatsapp", Automation: "active", Updated: a.now().UTC()}
	out := map[string]any{"conversation": c, "duplicate": false}
	if a.transact(func() {
		a.state.Conversations[c.ID] = c
		raw, _ := json.Marshal(out)
		a.state.Results[rk] = result{fp, raw, 201}
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "test.conversation.created", Conversation: c.ID})
	}) != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 201, out)
}

// Only the built assets are served. No fallback to source, .env, database or credentials.
func laboratoryUI(api http.Handler, formOrigins ...string) http.Handler {
	root := filepath.Join("frontend", "dist")
	files := http.FileServer(http.Dir(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' "+strings.Join(formOrigins, " "))
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if strings.HasPrefix(r.URL.Path, "/v1/") || strings.HasPrefix(r.URL.Path, "/__test/") {
			api.ServeHTTP(w, r)
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path != "/" && !strings.HasPrefix(r.URL.Path, "/assets/") {
			http.NotFound(w, r)
			return
		}
		if _, err := os.Stat(filepath.Join(root, "index.html")); err != nil {
			http.Error(w, "Interface local ainda não compilada: execute npm run build em frontend.", 503)
			return
		}
		files.ServeHTTP(w, r)
	})
}
