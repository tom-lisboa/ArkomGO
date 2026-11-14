package main

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

const platformSessionCookie = "arkom_platform"

func platformRequiresLogin() bool {
	return os.Getenv("ARKOM_PLATFORM_REQUIRE_LOGIN") == "true"
}

func (a *App) platformAuth(w http.ResponseWriter, r *http.Request, path string) bool {
	action, ok := strings.CutPrefix(path, "v1/platform/auth/")
	if !ok {
		return false
	}
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	if os.Getenv("ARKOM_LOCAL_DEMO") != "true" || os.Getenv("SDR_CRM_DEV_ENABLED") != "true" || host != "127.0.0.1" {
		fail(w, 404, "not_found")
		return true
	}
	w.Header().Set("Cache-Control", "no-store")
	switch action {
	case "login":
		if r.Method != http.MethodPost {
			fail(w, 405, "method_not_allowed")
			return true
		}
		a.platformLogin(w, r)
	case "session":
		if r.Method != http.MethodGet {
			fail(w, 405, "method_not_allowed")
			return true
		}
		token, key := platformCredential(r)
		active, ok := a.sessions[key]
		if !ok || !active.Expires.After(a.now()) {
			fail(w, 401, "unauthorized")
			return true
		}
		u, err := a.directoryUser(r.Context(), active.User)
		if err != nil {
			directoryFailure(w, err)
			return true
		}
		a.writePlatformSession(w, token, u, active.Expires)
	case "logout":
		if r.Method != http.MethodPost {
			fail(w, 405, "method_not_allowed")
			return true
		}
		_, key := platformCredential(r)
		delete(a.sessions, key)
		setPlatformCookie(w, "", -1)
		w.WriteHeader(http.StatusNoContent)
	default:
		fail(w, 404, "not_found")
	}
	return true
}

func (a *App) platformLogin(w http.ResponseWriter, r *http.Request) {
	if !a.allow(w, r, []quota{{"platform-login-ip:" + remoteIP(r), 120, 15 * time.Minute}}) {
		return
	}
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeCore(w, r, &in) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	name := ""
	switch email {
	case "alfa@arkom.test":
		name = "alfa.admin"
	case "beta@arkom.test":
		name = "beta.admin"
	}
	bucket := name
	if bucket == "" {
		bucket = "unknown"
	}
	if name == "" {
		a.loginRegisteredPlatformUser(w, r, email, in.Password)
		return
	}
	hash := sha256.Sum256([]byte(in.Password))
	expected := a.passwords[name]
	if subtle.ConstantTimeCompare(hash[:], expected[:]) != 1 {
		if !a.allow(w, r, []quota{{"platform-login-failure:" + bucket, 10, 15 * time.Minute}}) {
			return
		}
		if a.authAudit(w, bucket, "platform.login.denied") {
			fail(w, 401, "unauthorized")
		}
		return
	}
	a.finishPlatformLogin(w, r, a.users[name])
}

func (a *App) finishPlatformLogin(w http.ResponseWriter, r *http.Request, account User) {
	u, err := a.directoryUser(r.Context(), account)
	if err != nil {
		directoryFailure(w, err)
		return
	}
	if err := a.transact(func() {
		a.record(AuditEntry{Org: account.Org, Actor: account.ID, Action: "platform.login.accepted"})
	}); err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	if err := a.prepareWhatsApp(u.Org); err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	_, previous := platformCredential(r)
	delete(a.sessions, previous)
	for key, active := range a.sessions {
		if !active.Expires.After(a.now()) {
			delete(a.sessions, key)
		}
	}
	value := token()
	expiry := a.now().Add(time.Hour)
	a.sessions[platformSessionKey(value)] = session{account, expiry}
	setPlatformCookie(w, value, int(time.Hour.Seconds()))
	a.writePlatformSession(w, value, u, expiry)
}

func (a *App) writePlatformSession(w http.ResponseWriter, token string, u User, expiry time.Time) {
	company := ""
	if business := a.state.Business[u.Org]; business != nil {
		company = business.Draft.Name
	}
	write(w, 200, map[string]any{
		"access_token": token, "identity": u, "expires_at": expiry, "company_name": company,
	})
}

func platformCredential(r *http.Request) (string, string) {
	if cookie, err := r.Cookie(platformSessionCookie); err == nil {
		return cookie.Value, platformSessionKey(cookie.Value)
	}
	value := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	return value, platformSessionKey(value)
}

func platformSessionKey(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func setPlatformCookie(w http.ResponseWriter, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: platformSessionCookie, Value: value, Path: "/api/demo/backend/v1/platform/auth/",
		MaxAge: maxAge, HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode,
	})
}
