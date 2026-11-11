package main

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sdr-next-pilot/internal/calendarworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"testing"
	"time"
)

type calendarRoundTrip func(*http.Request) (*http.Response, error)

func (f calendarRoundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func googleResponse(code int, v any) *http.Response {
	raw, _ := json.Marshal(v)
	return &http.Response{StatusCode: code, Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(strings.NewReader(string(raw)))}
}
func fakeGoogleService(t *testing.T, a *App) *calendarGoogleService {
	t.Helper()
	block, e := aes.NewCipher([]byte(strings.Repeat("x", 32)))
	if e != nil {
		t.Fatal(e)
	}
	aead, _ := cipher.NewGCM(block)
	g := &calendarGoogleService{Config: calendarGoogleConfig{ClientID: "unit-client", ClientSecret: "unit-client-secret", Redirect: "https://calendar.example.test/sdr-next/v1/sdr/calendar/google/callback"}, Key: aead}
	g.HTTP = &http.Client{Transport: calendarRoundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "oauth2.googleapis.com" {
			t.Fatal("unexpected provider request", r.URL.Host)
		}
		_ = r.ParseForm()
		if r.Form.Get("grant_type") == "authorization_code" && r.Form.Get("code_verifier") == "" {
			t.Fatal("missing PKCE verifier")
		}
		return googleResponse(200, map[string]any{"access_token": "PRIVATE-GOOGLE-ACCESS", "refresh_token": "PRIVATE-GOOGLE-REFRESH", "expires_in": 3600, "token_type": "Bearer", "scope": strings.Join(googleScopes("write"), " ")}), nil
	})}
	a.calendarGoogle = g
	return g
}
func TestCalendarGoogleOAuthStatePKCEBrowserBindingAndEncryptedTenantTokens(t *testing.T) {
	f := calendarApp(t)
	g := fakeGoogleService(t, f.a)
	raw, _ := json.Marshal(map[string]string{"label": "Agenda comercial", "mode": "write"})
	issue := httptest.NewRequest("POST", "/v1/sdr/calendar/google/authorize", bytes.NewReader(raw))
	issue.Header.Set("Authorization", "Bearer "+f.admin)
	issue.Header.Set("Origin", "https://client.lovable.app")
	issued := httptest.NewRecorder()
	f.a.Handler().ServeHTTP(issued, issue)
	code := issued.Code
	var result map[string]any
	_ = json.Unmarshal(issued.Body.Bytes(), &result)
	if code != 200 {
		t.Fatal(code, result)
	}
	startURL, _ := url.Parse(result["authorization_url"].(string))
	form := url.Values{"ticket": {result["ticket"].(string)}, "access_token": {f.admin}}
	shared := httptest.NewRecorder()
	f.a.Handler().ServeHTTP(shared, httptest.NewRequest("GET", startURL.Path+"?ticket="+url.QueryEscape(result["ticket"].(string)), nil))
	if shared.Code == http.StatusFound {
		t.Fatal("shared URL started OAuth without session")
	}
	for _, invalid := range []struct{ origin, access string }{{"https://other.lovable.app", f.admin}, {"https://client.lovable.app", f.beta}} {
		body := url.Values{"ticket": {result["ticket"].(string)}, "access_token": {invalid.access}}
		r := httptest.NewRequest("POST", "/v1/sdr/calendar/google/start", strings.NewReader(body.Encode()))
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		r.Header.Set("Origin", invalid.origin)
		denied := httptest.NewRecorder()
		f.a.Handler().ServeHTTP(denied, r)
		if denied.Code != http.StatusForbidden {
			t.Fatal("OAuth start accepted foreign origin/session", denied.Code)
		}
	}
	start := httptest.NewRequest("POST", "/v1/sdr/calendar/google/start", strings.NewReader(form.Encode()))
	start.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	start.Header.Set("Origin", "https://client.lovable.app")
	if strings.Contains(startURL.RawQuery, "ticket") {
		t.Fatal("OAuth ticket in URL")
	}
	w := httptest.NewRecorder()
	f.a.Handler().ServeHTTP(w, start)
	if w.Code != 302 || len(w.Result().Cookies()) != 1 {
		t.Fatal(w.Code, w.Body.String())
	}
	cookie := w.Result().Cookies()[0]
	if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode {
		t.Fatal("unsafe OAuth cookie")
	}
	auth, _ := url.Parse(w.Header().Get("Location"))
	if auth.Host != "accounts.google.com" || auth.Query().Get("code_challenge_method") != "S256" || auth.Query().Get("access_type") != "offline" {
		t.Fatal("invalid Google OAuth request")
	}
	callbackPath := "/v1/sdr/calendar/google/callback?state=" + url.QueryEscape(auth.Query().Get("state")) + "&code=test-code"
	bad := httptest.NewRecorder()
	f.a.Handler().ServeHTTP(bad, httptest.NewRequest("GET", callbackPath, nil))
	if bad.Code != 400 {
		t.Fatal("callback accepted without browser binding")
	}
	callback := httptest.NewRequest("GET", callbackPath, nil)
	callback.AddCookie(cookie)
	done := httptest.NewRecorder()
	f.a.Handler().ServeHTTP(done, callback)
	if done.Code != 200 {
		t.Fatal(done.Code, done.Body.String())
	}
	var connection *CalendarConnection
	for _, c := range f.a.state.Calendars.Connections {
		connection = c
	}
	if connection == nil || connection.Organization != "org_demo_alfa" {
		t.Fatal("account attached to wrong tenant")
	}
	var encrypted []byte
	if e := f.a.db.QueryRow("SELECT ciphertext FROM calendar_google_tokens WHERE organization_id=? AND connection_id=?", connection.Organization, connection.ID).Scan(&encrypted); e != nil {
		t.Fatal(e)
	}
	if strings.Contains(string(encrypted), "PRIVATE-GOOGLE") {
		t.Fatal("plaintext OAuth tokens stored")
	}
	var value map[string]any
	if g.open("org_demo_beta", connection.ID, encrypted, &value) == nil {
		t.Fatal("ciphertext usable by another tenant")
	}
	for _, collection := range customerCollections {
		records, e := f.a.customerRecords("org_demo_alfa", collection)
		if e != nil {
			t.Fatal(e)
		}
		if strings.Contains(string(customerTestJSON(records)), "PRIVATE-GOOGLE") {
			t.Fatal("provider token exported", collection)
		}
	}
	replay := httptest.NewRecorder()
	r := httptest.NewRequest("GET", callbackPath, nil)
	r.AddCookie(cookie)
	f.a.Handler().ServeHTTP(replay, r)
	if replay.Code != 400 {
		t.Fatal("OAuth state reused", replay.Code)
	}
	if _, e := f.a.calendarAccessToken(context.Background(), "org_demo_beta", connection.ID); e == nil {
		t.Fatal("foreign token read")
	}
	if code, _ = req(f.a, "POST", "/v1/sdr/calendar/google/"+connection.ID+"/disconnect", f.admin, "", map[string]any{}); code != 200 {
		t.Fatal("disconnect", code)
	}
	if _, e := f.a.calendarAccessToken(context.Background(), "org_demo_alfa", connection.ID); e == nil {
		t.Fatal("disconnected account still usable")
	}
}

func TestCalendarGoogleConditionalWritesAndDeterministicInsert(t *testing.T) {
	ref := sdrsdk.CalendarRef{ID: "calendar", Provider: "google", Connection: "account", ExternalID: "person@example.test", Writable: true, Policy: calendarPolicy()}
	event := sdrsdk.CalendarEvent{ID: strings.Repeat("a", 48), BookingID: "booking", OrganizationHash: "org-hash", Summary: "Atendimento", ETag: "old-etag", Start: time.Date(2026, 11, 9, 13, 0, 0, 0, time.UTC), End: time.Date(2026, 11, 9, 13, 30, 0, 0, time.UTC)}
	provider := calendarworker.NewGoogle(func(context.Context, string) (string, error) { return "unit-access", nil })
	writeCalls := 0
	currentETag := "externally-changed"
	provider.HTTP = &http.Client{Transport: calendarRoundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "www.googleapis.com" || r.Header.Get("Authorization") != "Bearer unit-access" {
			t.Fatal("provider boundary")
		}
		body := map[string]any{"id": event.ID, "etag": currentETag, "status": "confirmed", "summary": event.Summary, "start": map[string]string{"dateTime": event.Start.Format(time.RFC3339)}, "end": map[string]string{"dateTime": event.End.Format(time.RFC3339)}, "extendedProperties": map[string]any{"private": map[string]string{"sdr_booking": event.BookingID, "sdr_org": event.OrganizationHash}}}
		if r.Method == "POST" {
			writeCalls++
			if r.URL.Query().Get("sendUpdates") != "none" {
				t.Fatal("unexpected external invitations")
			}
			var input map[string]any
			_ = json.NewDecoder(r.Body).Decode(&input)
			if input["id"] != event.ID {
				t.Fatal("insert ID not deterministic")
			}
			return googleResponse(409, map[string]any{}), nil
		}
		if r.Method == "PATCH" {
			writeCalls++
			if r.Header.Get("If-Match") != event.ETag {
				t.Fatal("unconditional overwrite")
			}
		}
		return googleResponse(200, body), nil
	})}
	if _, e := provider.Apply(context.Background(), ref, "reschedule", event); e != calendarworker.ErrConflict || writeCalls != 0 {
		t.Fatal("external edit overwritten", e, writeCalls)
	}
	confirmed, e := provider.Apply(context.Background(), ref, "book", event)
	if e != nil || confirmed.ID != event.ID || writeCalls != 1 {
		t.Fatal("duplicate insert not reconciled", e, writeCalls)
	}
	currentETag = event.ETag
	if _, e = provider.Apply(context.Background(), ref, "reschedule", event); e != nil || writeCalls != 2 {
		t.Fatal("conditional patch", e, writeCalls)
	}
}

func TestCalendarGooglePartialFreeBusyFailureIsUnavailable(t *testing.T) {
	provider := calendarworker.NewGoogle(func(context.Context, string) (string, error) { return "unit-access", nil })
	provider.HTTP = &http.Client{Transport: calendarRoundTrip(func(*http.Request) (*http.Response, error) {
		return googleResponse(200, map[string]any{"calendars": map[string]any{"id": map[string]any{"errors": []map[string]string{{"reason": "notFound"}}, "busy": []any{}}}}), nil
	})}
	_, e := provider.Busy(context.Background(), sdrsdk.CalendarRef{ExternalID: "id"}, time.Now(), time.Now().Add(time.Hour), "")
	if e != calendarworker.ErrUnavailable {
		t.Fatal("partial provider error became free slots", e)
	}
}

func TestCalendarGoogle404DoesNotConfirmCancellationWithoutCalendarAccess(t *testing.T) {
	g := calendarworker.NewGoogle(func(context.Context, string) (string, error) { return "unit-access", nil })
	accessible := false
	g.HTTP = &http.Client{Transport: calendarRoundTrip(func(r *http.Request) (*http.Response, error) {
		if strings.Contains(r.URL.Path, "/calendarList/") && accessible {
			return googleResponse(200, map[string]string{"id": "calendar-id", "accessRole": "owner"}), nil
		}
		return googleResponse(404, map[string]any{}), nil
	})}
	ref := sdrsdk.CalendarRef{ExternalID: "calendar-id", Writable: true}
	if _, e := g.Get(context.Background(), ref, "event-id"); e != calendarworker.ErrUnavailable {
		t.Fatal("lost access became cancellation proof", e)
	}
	accessible = true
	if _, e := g.Get(context.Background(), ref, "event-id"); e != calendarworker.ErrNotFound {
		t.Fatal("accessible missing event not recognized", e)
	}
}
