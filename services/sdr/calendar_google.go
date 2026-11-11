package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"sdr-next-pilot/internal/calendarworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"slices"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"
)

const calendarListScope = "https://www.googleapis.com/auth/calendar.calendarlist.readonly"
const calendarBusyScope = "https://www.googleapis.com/auth/calendar.events.freebusy"
const calendarWriteScope = "https://www.googleapis.com/auth/calendar.events"

type calendarGoogleConfig struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	Redirect     string `json:"redirect_uri"`
}
type calendarGoogleService struct {
	Config calendarGoogleConfig
	Key    cipher.AEAD
	HTTP   *http.Client
	locks  sync.Map
}

func googleScopes(mode string) []string {
	s := []string{calendarListScope, calendarBusyScope}
	if mode == "write" {
		s = append(s, calendarWriteScope)
	}
	return s
}
func (g *calendarGoogleService) oauth(mode string) *oauth2.Config {
	return &oauth2.Config{ClientID: g.Config.ClientID, ClientSecret: g.Config.ClientSecret, RedirectURL: g.Config.Redirect, Scopes: googleScopes(mode), Endpoint: oauth2.Endpoint{AuthURL: "https://accounts.google.com/o/oauth2/v2/auth", TokenURL: "https://oauth2.googleapis.com/token", AuthStyle: oauth2.AuthStyleInParams}}
}
func (g *calendarGoogleService) seal(org, id string, value any) ([]byte, error) {
	raw, e := json.Marshal(value)
	if e != nil {
		return nil, e
	}
	nonce := make([]byte, g.Key.NonceSize())
	if _, e = rand.Read(nonce); e != nil {
		return nil, e
	}
	return g.Key.Seal(nonce, nonce, raw, []byte(org+"\x00"+id)), nil
}
func (g *calendarGoogleService) open(org, id string, raw []byte, value any) error {
	n := g.Key.NonceSize()
	if len(raw) < n {
		return errors.New("invalid_calendar_secret")
	}
	b, e := g.Key.Open(nil, raw[:n], raw[n:], []byte(org+"\x00"+id))
	if e != nil {
		return errors.New("invalid_calendar_secret")
	}
	return json.Unmarshal(b, value)
}
func (a *App) configureCalendars() error {
	a.calendarEnabled = true
	configPath, keyPath := os.Getenv("SDR_GOOGLE_CALENDAR_CONFIG_FILE"), os.Getenv("SDR_GOOGLE_CALENDAR_KEY_FILE")
	if configPath == "" && keyPath == "" {
		return nil
	}
	raw, e := os.ReadFile(configPath)
	var c calendarGoogleConfig
	if e != nil || json.Unmarshal(raw, &c) != nil || c.ClientID == "" || c.ClientSecret == "" {
		return errors.New("calendar_google_config_invalid")
	}
	u, e := url.Parse(c.Redirect)
	if e != nil || u.Scheme != "https" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || net.ParseIP(u.Hostname()) != nil || u.Hostname() == "" || !strings.HasSuffix(u.Path, "/v1/sdr/calendar/google/callback") {
		return errors.New("calendar_google_redirect_requires_https_domain")
	}
	encoded, e := os.ReadFile(keyPath)
	if e != nil {
		return errors.New("calendar_token_key_missing")
	}
	key, e := base64.StdEncoding.DecodeString(strings.TrimSpace(string(encoded)))
	if e != nil || len(key) != 32 {
		return errors.New("calendar_token_key_invalid")
	}
	block, e := aes.NewCipher(key)
	if e != nil {
		return e
	}
	aead, e := cipher.NewGCM(block)
	if e != nil {
		return e
	}
	a.calendarGoogle = &calendarGoogleService{Config: c, Key: aead, HTTP: &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
	return nil
}
func secretHash(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func (a *App) calendarGoogleHTTP(w http.ResponseWriter, r *http.Request, u User) {
	if u.Role != "admin" {
		fail(w, 403, "forbidden")
		return
	}
	if a.calendarGoogle == nil || a.db == nil {
		fail(w, 503, "calendar_google_not_configured")
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/v1/sdr/calendar/google/")
	if path == "authorize" && r.Method == "POST" {
		var b struct {
			Label string `json:"label"`
			Mode  string `json:"mode"`
		}
		if !decode(w, r, &b) {
			return
		}
		if !textOK(b.Label, 100, true) || !slices.Contains([]string{"read", "write"}, b.Mode) {
			fail(w, 422, "invalid_google_connection")
			return
		}
		a.mu.Lock()
		defer a.mu.Unlock()
		if !a.allow(w, r, []quota{{"calendar-google:" + u.Org, 6, 15 * time.Minute}}) {
			return
		}
		count := 0
		for _, c := range a.state.Calendars.Connections {
			if c.Organization == u.Org && c.Status == "connected" {
				count++
			}
		}
		if count >= 8 {
			fail(w, 409, "calendar_connection_limit")
			return
		}
		id, state, ticket := token(), token(), token()
		proof := struct {
			Verifier string `json:"verifier"`
			State    string `json:"state"`
		}{oauth2.GenerateVerifier(), state}
		sealed, e := a.calendarGoogle.seal(u.Org, id, proof)
		if e != nil {
			fail(w, 503, "calendar_oauth_unavailable")
			return
		}
		_, _ = a.db.Exec("DELETE FROM calendar_oauth_flows WHERE expires_at<?", a.now().Add(-time.Hour).Unix())
		origin := r.Header.Get("Origin")
		if !pilotOrigin(origin) {
			fail(w, 403, "calendar_oauth_origin_required")
			return
		}
		sessionHash := secretHash(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		_, e = a.db.Exec("INSERT INTO calendar_oauth_flows(id,organization_id,actor_id,session_hash,label,mode,origin,ticket_hash,state_hash,verifier,expires_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", id, u.Org, u.ID, sessionHash, b.Label, b.Mode, origin, secretHash(ticket), secretHash(state), sealed, a.now().Add(10*time.Minute).Unix(), "created")
		if e != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
		start := strings.TrimSuffix(a.calendarGoogle.Config.Redirect, "/callback") + "/start"
		write(w, 200, map[string]any{"authorization_url": start, "ticket": ticket, "expires_in": 600})
		return
	}
	parts := strings.Split(path, "/")
	if len(parts) == 2 && parts[1] == "calendars" && r.Method == "GET" {
		items, e := a.googleCalendarList(r.Context(), u.Org, parts[0])
		if e != nil {
			fail(w, 503, "calendar_google_unavailable")
			return
		}
		write(w, 200, map[string]any{"items": items})
		return
	}
	if len(parts) == 2 && parts[1] == "attach" && r.Method == "POST" {
		var b struct {
			ExternalID string                `json:"external_id"`
			Name       string                `json:"name"`
			Policy     sdrsdk.CalendarPolicy `json:"policy"`
		}
		if !decode(w, r, &b) {
			return
		}
		if !textOK(b.Name, 100, true) || calendarworker.ValidatePolicy(b.Policy) != nil {
			fail(w, 422, "invalid_calendar_policy")
			return
		}
		items, e := a.googleCalendarList(r.Context(), u.Org, parts[0])
		if e != nil {
			fail(w, 503, "calendar_google_unavailable")
			return
		}
		var selected *googleCalendarItem
		for _, item := range items {
			if item.ID == b.ExternalID {
				v := item
				selected = &v
				break
			}
		}
		if selected == nil {
			fail(w, 404, "calendar_unavailable")
			return
		}
		a.mu.Lock()
		defer a.mu.Unlock()
		account := a.state.Calendars.Connections[parts[0]]
		if account == nil || account.Organization != u.Org || account.Status != "connected" {
			fail(w, 404, "not_found")
			return
		}
		count := 0
		for _, c := range a.state.Calendars.Calendars {
			if c.Organization == u.Org {
				count++
				if c.Provider == "google" && c.ExternalID == selected.ID {
					if c.Connection == account.ID {
						write(w, 200, c)
						return
					}
					old := a.state.Calendars.Connections[c.Connection]
					if old != nil && old.Status == "connected" {
						fail(w, 409, "calendar_already_attached")
						return
					}
					clone := *c
					clone.Connection = account.ID
					clone.Enabled = true
					clone.Revision++
					clone.Writable = account.Mode == "write" && (selected.Role == "writer" || selected.Role == "owner")
					if !clone.Writable {
						clone.Agents = map[string]sdrsdk.CalendarGrant{}
						for key, g := range c.Agents {
							clone.Agents[key] = sdrsdk.CalendarGrant{Read: g.Read}
						}
					}
					if a.transact(func() {
						a.state.Calendars.Calendars[c.ID] = &clone
						a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "calendar.google.reconnected", Operation: c.ID})
					}) != nil {
						fail(w, 503, "storage_unavailable")
						return
					}
					write(w, 200, &clone)
					return
				}
			}
		}
		if count >= 16 {
			fail(w, 409, "calendar_limit")
			return
		}
		c := &ManagedCalendar{Organization: u.Org, Revision: 1, Enabled: true, Agents: map[string]sdrsdk.CalendarGrant{}, CalendarRef: sdrsdk.CalendarRef{ID: "calendar_" + token(), Name: b.Name, Provider: "google", Connection: account.ID, ExternalID: selected.ID, Writable: account.Mode == "write" && (selected.Role == "writer" || selected.Role == "owner"), Policy: b.Policy}}
		if a.transact(func() {
			a.state.Calendars.Calendars[c.ID] = c
			a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "calendar.google.attached", Operation: c.ID})
		}) != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
		write(w, 200, c)
		return
	}
	if len(parts) == 2 && parts[1] == "disconnect" && r.Method == "POST" {
		a.mu.Lock()
		defer a.mu.Unlock()
		c := a.state.Calendars.Connections[parts[0]]
		if c == nil || c.Organization != u.Org {
			fail(w, 404, "not_found")
			return
		}
		if a.transact(func() {
			c.Status = "disconnected"
			c.UpdatedAt = a.now()
			for _, cal := range a.state.Calendars.Calendars {
				if cal.Organization == u.Org && cal.Connection == c.ID {
					cal.Enabled = false
					cal.Revision++
				}
			}
			a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "calendar.google.disconnected", Operation: c.ID})
		}) != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
		if _, e := a.db.Exec("DELETE FROM calendar_google_tokens WHERE organization_id=? AND connection_id=?", u.Org, c.ID); e != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
		write(w, 200, map[string]bool{"disconnected": true})
		return
	}
	fail(w, 404, "not_found")
}

type googleCalendarItem struct {
	ID       string `json:"id"`
	Name     string `json:"summary"`
	Timezone string `json:"timeZone"`
	Role     string `json:"accessRole"`
}

func (a *App) googleCalendarList(ctx context.Context, org, connection string) ([]googleCalendarItem, error) {
	token, e := a.calendarAccessToken(ctx, org, connection)
	if e != nil {
		return nil, e
	}
	items := []googleCalendarItem{}
	page := ""
	for n := 0; n < 10; n++ {
		q := url.Values{"maxResults": {"250"}}
		if page != "" {
			q.Set("pageToken", page)
		}
		r, e := http.NewRequestWithContext(ctx, "GET", "https://www.googleapis.com/calendar/v3/users/me/calendarList?"+q.Encode(), nil)
		if e != nil {
			return nil, e
		}
		r.Header.Set("Authorization", "Bearer "+token)
		resp, e := a.calendarGoogle.HTTP.Do(r)
		if e != nil {
			return nil, errors.New("calendar_google_unavailable")
		}
		raw, e := io.ReadAll(io.LimitReader(resp.Body, (1<<20)+1))
		resp.Body.Close()
		var data struct {
			Items []googleCalendarItem `json:"items"`
			Next  string               `json:"nextPageToken"`
		}
		if e != nil || resp.StatusCode != 200 || len(raw) > 1<<20 || json.Unmarshal(raw, &data) != nil {
			return nil, errors.New("calendar_google_unavailable")
		}
		items = append(items, data.Items...)
		if data.Next == "" {
			return items, nil
		}
		page = data.Next
	}
	return nil, errors.New("calendar_list_limit")
}
func (a *App) calendarAccessToken(ctx context.Context, org, connection string) (string, error) {
	g := a.calendarGoogle
	if g == nil {
		return "", errors.New("calendar_google_not_configured")
	}
	value, _ := g.locks.LoadOrStore(org+":"+connection, &sync.Mutex{})
	lock := value.(*sync.Mutex)
	lock.Lock()
	defer lock.Unlock()
	a.mu.Lock()
	account := a.state.Calendars.Connections[connection]
	if account == nil || account.Organization != org || account.Status != "connected" {
		a.mu.Unlock()
		return "", errors.New("calendar_connection_unavailable")
	}
	var ciphertext []byte
	e := a.db.QueryRow("SELECT ciphertext FROM calendar_google_tokens WHERE organization_id=? AND connection_id=?", org, connection).Scan(&ciphertext)
	mode := account.Mode
	a.mu.Unlock()
	var old oauth2.Token
	if e != nil || g.open(org, connection, ciphertext, &old) != nil {
		return "", errors.New("calendar_token_unavailable")
	}
	ctx = context.WithValue(ctx, oauth2.HTTPClient, g.HTTP)
	fresh, e := g.oauth(mode).TokenSource(ctx, &old).Token()
	if e != nil {
		return "", errors.New("calendar_reconnect_required")
	}
	if fresh.RefreshToken == "" {
		fresh.RefreshToken = old.RefreshToken
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	account = a.state.Calendars.Connections[connection]
	if account == nil || account.Organization != org || account.Status != "connected" {
		return "", errors.New("calendar_connection_unavailable")
	}
	if fresh.AccessToken != old.AccessToken || fresh.RefreshToken != old.RefreshToken || !fresh.Expiry.Equal(old.Expiry) {
		sealed, e := g.seal(org, connection, fresh)
		if e != nil {
			return "", e
		}
		if _, e = a.db.Exec("UPDATE calendar_google_tokens SET ciphertext=? WHERE organization_id=? AND connection_id=?", sealed, org, connection); e != nil {
			return "", e
		}
	}
	return fresh.AccessToken, nil
}

func (a *App) calendarOAuthPublic(w http.ResponseWriter, r *http.Request) bool {
	action := strings.TrimPrefix(r.URL.Path, "/v1/sdr/calendar/google/")
	if (action != "start" && action != "callback") || (action == "start" && r.Method != "POST") || (action == "callback" && r.Method != "GET") {
		return false
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
	if !a.calendarEnabled || a.calendarGoogle == nil || a.db == nil {
		fail(w, 503, "calendar_google_not_configured")
		return true
	}
	g := a.calendarGoogle
	a.mu.Lock()
	if !a.allow(w, r, []quota{{"calendar-oauth:" + remoteIP(r), 30, 15 * time.Minute}}) {
		a.mu.Unlock()
		return true
	}
	var id, org, actor, session, label, mode, origin, cookieHash, status string
	var sealed []byte
	var expires int64
	field, secret := "ticket_hash", ""
	if action == "start" {
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		if r.ParseForm() != nil {
			a.mu.Unlock()
			fail(w, 400, "invalid_calendar_oauth_start")
			return true
		}
		secret = r.PostForm.Get("ticket")
	}
	if action == "callback" {
		field, secret = "state_hash", r.URL.Query().Get("state")
	}
	if len(secret) != 48 {
		a.mu.Unlock()
		fail(w, 400, "invalid_calendar_oauth_state")
		return true
	}
	e := a.db.QueryRow("SELECT id,organization_id,actor_id,session_hash,label,mode,origin,cookie_hash,verifier,expires_at,status FROM calendar_oauth_flows WHERE "+field+"=?", secretHash(secret)).Scan(&id, &org, &actor, &session, &label, &mode, &origin, &cookieHash, &sealed, &expires, &status)
	s, valid := a.sessions[session]
	if valid {
		u, directoryErr := a.directoryUser(r.Context(), s.User)
		if directoryErr != nil {
			a.mu.Unlock()
			directoryFailure(w, directoryErr)
			return true
		}
		s.User = u
	}
	if e != nil || !valid || s.User.Org != org || s.User.ID != actor || s.User.Role != "admin" || !s.Expires.After(a.now()) || expires <= a.now().Unix() {
		a.mu.Unlock()
		fail(w, 400, "expired_calendar_oauth_state")
		return true
	}
	var proof struct {
		Verifier string `json:"verifier"`
		State    string `json:"state"`
	}
	if g.open(org, id, sealed, &proof) != nil {
		a.mu.Unlock()
		fail(w, 400, "invalid_calendar_oauth_state")
		return true
	}
	cookieName := "__Host-sdr-calendar-" + id[:12]
	if action == "start" {
		if origin == "" || r.Header.Get("Origin") != origin || len(r.PostForm.Get("access_token")) != 48 || secretHash(r.PostForm.Get("access_token")) != session {
			a.mu.Unlock()
			fail(w, 403, "calendar_oauth_browser_session_required")
			return true
		}
		if status != "created" {
			a.mu.Unlock()
			fail(w, 400, "calendar_oauth_already_used")
			return true
		}
		cookie := token()
		_, e = a.db.Exec("UPDATE calendar_oauth_flows SET status='started',cookie_hash=? WHERE id=? AND status='created'", secretHash(cookie), id)
		a.mu.Unlock()
		if e != nil {
			fail(w, 503, "storage_unavailable")
			return true
		}
		http.SetCookie(w, &http.Cookie{Name: cookieName, Value: cookie, Path: "/", MaxAge: 600, Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode})
		auth := g.oauth(mode).AuthCodeURL(proof.State, oauth2.AccessTypeOffline, oauth2.SetAuthURLParam("prompt", "consent"), oauth2.SetAuthURLParam("include_granted_scopes", "true"), oauth2.S256ChallengeOption(proof.Verifier))
		http.Redirect(w, r, auth, http.StatusFound)
		return true
	}
	cookie, e := r.Cookie(cookieName)
	if e != nil || status != "started" || subtle.ConstantTimeCompare([]byte(secretHash(cookie.Value)), []byte(cookieHash)) != 1 {
		a.mu.Unlock()
		fail(w, 400, "invalid_calendar_oauth_browser")
		return true
	}
	_, e = a.db.Exec("UPDATE calendar_oauth_flows SET status='exchanging' WHERE id=? AND status='started'", id)
	a.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1, Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	if e != nil {
		fail(w, 503, "storage_unavailable")
		return true
	}
	if r.URL.Query().Get("error") != "" || r.URL.Query().Get("code") == "" {
		fail(w, 400, "calendar_google_consent_denied")
		return true
	}
	ctx := context.WithValue(r.Context(), oauth2.HTTPClient, g.HTTP)
	grant, e := g.oauth(mode).Exchange(ctx, r.URL.Query().Get("code"), oauth2.VerifierOption(proof.Verifier))
	if e != nil || grant.AccessToken == "" || grant.RefreshToken == "" {
		fail(w, 400, "calendar_google_authorization_failed")
		return true
	}
	scopes := googleScopes(mode)
	if scope, ok := grant.Extra("scope").(string); ok {
		scopes = strings.Fields(scope)
	}
	for _, required := range googleScopes(mode) {
		if !slices.Contains(scopes, required) {
			fail(w, 400, "calendar_google_permissions_missing")
			return true
		}
	}
	connection := "gcal_" + token()
	ciphertext, e := g.seal(org, connection, grant)
	if e != nil {
		fail(w, 503, "calendar_oauth_unavailable")
		return true
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	s, valid = a.sessions[session]
	if valid {
		u, directoryErr := a.directoryUser(r.Context(), s.User)
		if directoryErr != nil {
			directoryFailure(w, directoryErr)
			return true
		}
		s.User = u
	}
	if !valid || !s.Expires.After(a.now()) || s.User.Org != org {
		fail(w, 401, "unauthorized")
		return true
	}
	count := 0
	for _, c := range a.state.Calendars.Connections {
		if c.Organization == org && c.Status == "connected" {
			count++
		}
	}
	if count >= 8 {
		fail(w, 409, "calendar_connection_limit")
		return true
	}
	if _, e = a.db.Exec("INSERT INTO calendar_google_tokens VALUES(?,?,?)", org, connection, ciphertext); e != nil {
		fail(w, 503, "storage_unavailable")
		return true
	}
	if a.transact(func() {
		a.state.Calendars.Connections[connection] = &CalendarConnection{ID: connection, Organization: org, Label: label, Mode: mode, Status: "connected", Scopes: scopes, UpdatedAt: a.now()}
		a.record(AuditEntry{Org: org, Actor: actor, Action: "calendar.google.connected", Operation: connection})
	}) != nil {
		_, _ = a.db.Exec("DELETE FROM calendar_google_tokens WHERE organization_id=? AND connection_id=?", org, connection)
		fail(w, 503, "storage_unavailable")
		return true
	}
	_, _ = a.db.Exec("DELETE FROM calendar_oauth_flows WHERE id=?", id)
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = io.WriteString(w, "Conta Google conectada. Pode fechar esta janela e voltar ao SDR para escolher as agendas.")
	return true
}
