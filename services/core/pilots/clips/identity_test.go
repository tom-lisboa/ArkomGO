package main

import (
	"arkom/bia/internal/platformdirectory"
	"arkom/bia/internal/solutionbus"
	"arkom/bia/internal/solutioninbox"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	urlpkg "net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const identityFixture = `{"source_user_id":"ae34523f-081b-4d6b-a6fb-31b05613f944",
"email":"owner@homolog.invalid","display_name":"Homolog Owner","email_confirmed":true,
"banned":false,"deleted":false,"clips_instances":[{"org_id":"ae34523f-081b-4d6b-a6fb-31b05613f955",
"instance_id":"ae34523f-081b-4d6b-a6fb-31b05613f966","status":"active"}]}`

func TestAuthThrottleBoundsSharedProviderCalls(t *testing.T) {
	l := &authThrottle{}
	if !l.acquire() || l.acquire() {
		t.Fatal("concurrent exchanges were not bounded")
	}
	l.release()
	if l.acquire() {
		t.Fatal("exchange rate was not bounded")
	}
	l.next = time.Now().Add(-time.Second)
	if !l.acquire() {
		t.Fatal("exchange did not recover")
	}
	l.release()
}

func identityTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("CLIPS_IDENTITY_TEST_DSN")
	if dsn == "" {
		t.Skip("run verify-identity-local.py for isolated Postgres integration tests")
	}
	db, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	// The runner creates a disposable database. Refuse an existing application DB.
	var name string
	if err := db.QueryRow(context.Background(), `SELECT current_database()`).Scan(&name); err != nil || name != "clips_identity_test" {
		t.Fatal("a disposable clips_identity_test database is required")
	}
	_, err = db.Exec(context.Background(), schema+studioSchema+identitySchema+platformSchema+solutionbus.Schema+solutioninbox.Schema+platformdirectory.Schema+remixSchema+
		`; TRUNCATE customer_accounts,customer_workspaces,customer_sessions,studio_inputs,jobs,job_videos,
		platform_organizations,integration_clients,integration_outbox,native_login_limits,solution_inbox.deliveries,solution_inbox.health,
		platform_directory.customers,platform_directory.people,platform_directory.backends,platform_directory.requests,platform_directory.audit,remix_limits CASCADE`)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func TestProvisionCustomerIsIdempotentAndRejectsConflicts(t *testing.T) {
	db := identityTestDB(t)
	ctx := context.Background()
	first, err := provisionCustomer(ctx, db, strings.NewReader(identityFixture))
	if err != nil {
		t.Fatal(err)
	}
	second, err := provisionCustomer(ctx, db, strings.NewReader(identityFixture))
	if err != nil || second != first {
		t.Fatalf("duplicate provisioning changed identity: %v", err)
	}
	for _, fixture := range []string{
		strings.Replace(identityFixture, `"email_confirmed":true`, `"email_confirmed":false`, 1),
		strings.Replace(identityFixture, `"banned":false`, `"banned":true`, 1),
		strings.Replace(identityFixture, `"deleted":false`, `"deleted":true`, 1),
		strings.Replace(identityFixture, "owner@homolog.invalid", "changed@homolog.invalid", 1),
		strings.Replace(identityFixture, "31b05613f966", "31b05613f977", 1),
		strings.Replace(identityFixture, "31b05613f944", "31b05613f988", 1),
	} {
		if _, err := provisionCustomer(ctx, db, strings.NewReader(fixture)); err == nil {
			t.Fatal("unsafe mapping was accepted")
		}
	}
	var accounts, workspaces int
	if err := db.QueryRow(ctx, `SELECT (SELECT count(*) FROM customer_accounts),(SELECT count(*) FROM customer_workspaces)`).Scan(&accounts, &workspaces); err != nil || accounts != 1 || workspaces != 1 {
		t.Fatal("conflict changed provisioned records", err, accounts, workspaces)
	}
}

func TestCustomerAuthenticationAndProjectIsolation(t *testing.T) {
	db := identityTestDB(t)
	ctx := context.Background()
	identity, err := provisionCustomer(ctx, db, strings.NewReader(identityFixture))
	if err != nil {
		t.Fatal(err)
	}
	var calls int
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Method != "GET" || r.URL.Path != "/auth/v1/user" || r.Header.Get("apikey") != "sb_publishable_test" {
			t.Error("unexpected provider request")
			w.WriteHeader(500)
			return
		}
		bearer := r.Header.Get("Authorization")
		if bearer == "Bearer provider.down.token" {
			w.WriteHeader(503)
			return
		}
		if bearer == "Bearer invalid.forged.token" {
			w.WriteHeader(401)
			return
		}
		confirmed := "2026-11-06T00:00:00Z"
		user := sourceUser{ID: "ae34523f-081b-4d6b-a6fb-31b05613f944", Email: "owner@homolog.invalid", EmailConfirmedAt: &confirmed}
		switch bearer {
		case "Bearer valid.customer.token":
		case "Bearer different.customer.token":
			user.ID = "ae34523f-081b-4d6b-a6fb-31b05613f999"
		case "Bearer changed.email.token":
			user.Email = "someoneelse@homolog.invalid"
		case "Bearer unconfirmed.customer.token":
			user.EmailConfirmedAt = nil
		default:
			w.WriteHeader(401)
			return
		}
		json.NewEncoder(w).Encode(user)
	}))
	defer provider.Close()
	auth := identityAuth{db: db, providerURL: provider.URL, publishable: "sb_publishable_test", origin: hostedOrigin, client: provider.Client()}
	mux := http.NewServeMux()
	q := queue{db: db}
	q.mountStudio(mux)
	// A probe proves downstream ownership cannot be chosen with the legacy cookie.
	mux.HandleFunc("GET /studio/jobs/probe", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(studioSession(r))) })
	handler := auth.protect(mux, strings.Repeat("x", 48))
	request := func(method, path, bearer, origin string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, hostedOrigin+path, strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", bearer)
		req.Header.Set("Origin", origin)
		for _, cookie := range cookies {
			req.AddCookie(cookie)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}
	for _, tc := range []struct {
		bearer string
		status int
	}{
		{"", 401}, {"Bearer owner@homolog.invalid", 401}, {"Bearer invalid.forged.token", 401},
		{"Bearer provider.down.token", 503}, {"Bearer different.customer.token", 403},
		{"Bearer changed.email.token", 403}, {"Bearer unconfirmed.customer.token", 401},
	} {
		if res := request("POST", "/auth/session", tc.bearer, hostedOrigin); res.Code != tc.status || len(res.Result().Cookies()) != 0 {
			t.Fatalf("source verification returned %d, expected %d", res.Code, tc.status)
		}
	}
	before := calls
	if res := request("POST", "/auth/session", "Bearer valid.customer.token", "https://untrusted.invalid"); res.Code != 403 || calls != before {
		t.Fatal("cross-origin sign-in was accepted")
	}
	res := request("POST", "/auth/session", "Bearer valid.customer.token", hostedOrigin)
	if res.Code != 200 || len(res.Result().Cookies()) != 1 {
		t.Fatalf("verified login failed: %d %s", res.Code, res.Body.String())
	}
	cookie := res.Result().Cookies()[0]
	if cookie.Name != customerCookie || !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.Domain != "" || cookie.Path != "/" {
		t.Fatal("insecure customer session cookie")
	}
	var stored string
	if err := db.QueryRow(ctx, `SELECT token_hash FROM customer_sessions`).Scan(&stored); err != nil || stored != sessionHash(cookie.Value) || strings.Contains(stored, cookie.Value) {
		t.Fatal("session secret persisted in plaintext", err)
	}
	legacy := &http.Cookie{Name: "clips_go", Value: strings.Repeat("A", 26)}
	if res := request("GET", "/auth/me", "", "", cookie); res.Code != 200 || !strings.Contains(res.Body.String(), identity.WorkspaceID) {
		t.Fatal("authenticated profile unavailable")
	}
	if res := request("GET", "/studio/jobs/probe", "", "", cookie, legacy); res.Code != 200 || res.Body.String() != "customer:"+identity.ID {
		t.Fatal("legacy cookie overrode customer identity")
	}
	for _, path := range []string{"/auth/me", "/studio/jobs/probe", "/studio/jobs/other/video", "/ops/status"} {
		if res := request("GET", path, "", "", legacy); res.Code != 401 {
			t.Fatal("legacy cookie bypassed customer authentication", path)
		}
	}
	if res := request("GET", "/ops/status", "", "", cookie); res.Code != 401 {
		t.Fatal("customer can access team operations")
	}
	if res := request("POST", "/studio/session", "", hostedOrigin, cookie); res.Code != 401 {
		t.Fatal("customer can create anonymous technical session")
	}
	_, err = db.Exec(ctx, `INSERT INTO jobs(id,idempotency_key,fixture) VALUES('OWN','own','entrevista-demo'),('OTHER','other','entrevista-demo');
		INSERT INTO studio_inputs(job_id,owner,fingerprint,source,captions,start_seconds,duration_seconds)
		VALUES('OWN','customer:'||'`+identity.ID+`','hash',decode('0000000c6674797069736f6d','hex'),NULL,0,1),
		('OTHER','another-customer','hash',decode('0000000c6674797069736f6d','hex'),NULL,0,1)`)
	if err != nil {
		t.Fatal(err)
	}
	if request("GET", "/studio/jobs/OWN", "", "", cookie).Code != 200 ||
		request("GET", "/studio/jobs/OTHER", "", "", cookie).Code != 404 ||
		request("GET", "/studio/jobs/OTHER/video", "", "", cookie).Code != 404 {
		t.Fatal("project ownership was not enforced")
	}
	// A second browser retains its session; logout revokes only its own token.
	other := request("POST", "/auth/session", "Bearer valid.customer.token", hostedOrigin).Result().Cookies()[0]
	if request("POST", "/auth/logout", "", "https://untrusted.invalid", cookie).Code != 403 ||
		request("POST", "/auth/logout", "", hostedOrigin, cookie).Code != 204 ||
		request("GET", "/auth/me", "", "", cookie).Code != 401 ||
		request("GET", "/auth/me", "", "", other).Code != 200 ||
		request("GET", "/studio/jobs/OWN", "", "", other).Code != 200 {
		t.Fatal("logout or stable ownership failed")
	}
	_, err = db.Exec(ctx, `UPDATE customer_accounts SET enabled=false`)
	if err != nil || request("GET", "/auth/me", "", "", other).Code != 401 ||
		request("POST", "/auth/session", "Bearer valid.customer.token", hostedOrigin).Code != 403 {
		t.Fatal("disabled account retained access")
	}
	_, err = db.Exec(ctx, `UPDATE customer_accounts SET enabled=true; UPDATE customer_sessions SET expires_at=now()-interval '1 second'`)
	if err != nil || request("GET", "/auth/me", "", "", other).Code != 401 {
		t.Fatal("expired session retained access")
	}
}

func TestRealLocalAuthSessionBridge(t *testing.T) {
	url, jwt := os.Getenv("CLIPS_IDENTITY_TEST_AUTH_URL"), os.Getenv("CLIPS_IDENTITY_TEST_AUTH_JWT")
	if url == "" || jwt == "" {
		t.Skip("real local Auth supplied by verify-identity-local.py")
	}
	// The hosted Supabase gateway prefixes GoTrue's /user with /auth/v1.
	target, err := urlpkg.Parse(url)
	if err != nil {
		t.Fatal(err)
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/user" {
			w.WriteHeader(404)
			return
		}
		r.URL.Path = "/user"
		proxy.ServeHTTP(w, r)
	}))
	defer gateway.Close()
	a := identityAuth{providerURL: gateway.URL, publishable: "sb_publishable_local", client: &http.Client{Timeout: 3 * time.Second}}
	user, err := a.verifySource(context.Background(), "Bearer "+jwt)
	if err != nil || user.Email != "bridge@homolog.invalid" {
		t.Fatal("real GoTrue user verification failed", err)
	}
	if _, err := a.verifySource(context.Background(), "Bearer "+jwt+"forged"); err == nil {
		t.Fatal("real Auth accepted a forged signature")
	}
	db := identityTestDB(t)
	fixture := strings.ReplaceAll(strings.ReplaceAll(identityFixture,
		"ae34523f-081b-4d6b-a6fb-31b05613f944", user.ID), "owner@homolog.invalid", user.Email)
	identity, err := provisionCustomer(context.Background(), db, strings.NewReader(fixture))
	if err != nil {
		t.Fatal(err)
	}
	a.db, a.origin = db, hostedOrigin
	handler := a.protect(http.NotFoundHandler(), strings.Repeat("x", 48))
	req := httptest.NewRequest("POST", hostedOrigin+"/auth/session", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer "+jwt)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), identity.WorkspaceID) || len(rec.Result().Cookies()) != 1 {
		t.Fatal("real Auth could not establish a local customer session", rec.Code)
	}
}
