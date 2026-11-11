package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"arkom/bia/internal/platformdirectory"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestRemixEntryOriginPKCESessionsAndIsolation(t *testing.T) {
	db := identityTestDB(t)
	config := db.Config()
	config.MaxConns = 3
	limited, openErr := pgxpool.NewWithConfig(context.Background(), config)
	if openErr != nil {
		t.Fatal(openErr)
	}
	t.Cleanup(limited.Close)
	db = limited
	ctx := context.Background()
	if _, err := db.Exec(ctx, gifSchema); err != nil {
		t.Fatal(err)
	}
	directory := platformdirectory.Store{DB: db}
	a, err := provisionNative(ctx, db, strings.NewReader(`{"email":"remix@bilhon.com","password":"fictional-password","display_name":"Remix owner","organization":"bilhon-homolog"}`))
	if err != nil {
		t.Fatal(err)
	}
	b, err := provisionCustomer(ctx, db, strings.NewReader(identityFixture))
	if err != nil {
		t.Fatal(err)
	}
	const hub = "https://api.clips.invalid"
	identities := []customerIdentity{a, b}
	installs := []platformdirectory.Installation{}
	for n, identity := range identities {
		name := []string{"alfa", "beta"}[n]
		_, err := directory.Register(ctx, platformdirectory.Registration{Namespace: "remix-test", Key: "client-" + name, CustomerReference: name, OrganizationReference: name, Name: "Fictitious " + name, ExistingOrganizationID: identity.OrganizationID,
			Members: []platformdirectory.MemberInput{{Reference: "owner-" + name, Name: "Owner"}}, Products: []platformdirectory.ProductInput{{Solution: "clips", Backend: "clips-remix-test", LocalOrganizationID: identity.WorkspaceID, Grants: []platformdirectory.GrantInput{{PersonReference: "owner-" + name, LocalActorID: identity.ID, Role: "operator"}}}}})
		if err != nil {
			t.Fatal(err)
		}
		input := platformdirectory.InstallationInput{Key: "install-" + name, OrganizationID: identity.OrganizationID, Backend: "clips-remix-test", Solution: "clips", Origin: "https://" + name + ".lovable.invalid", APIURL: hub, SourceReference: "project-" + name, VerificationReference: "verified-by-lab-operator"}
		inst, err := directory.RegisterInstallation(ctx, input, false)
		if err != nil {
			t.Fatal(err)
		}
		again, err := directory.RegisterInstallation(ctx, input, false)
		if err != nil || again != inst {
			t.Fatal("installation not idempotent", err)
		}
		installs = append(installs, inst)
		if n == 1 {
			input.Key = "steal-origin"
			input.Origin = installs[0].Origin
			if _, err := directory.RegisterInstallation(ctx, input, false); err == nil {
				t.Fatal("origin assigned to two clients")
			}
		}
	}
	auth := identityAuth{db: db, origin: hub, remixBackend: "clips-remix-test"}
	mux := http.NewServeMux()
	q := queue{db: db, gifs: testGIFConfig(t)}
	q.mountGIF(mux)
	mux.HandleFunc("GET /app/probe", func(w http.ResponseWriter, r *http.Request) {
		i, _ := appIdentity(r)
		writeJSON(w, 200, map[string]string{"owner": studioSession(r), "workspace": i.WorkspaceID})
	})
	mux.HandleFunc("POST /app/probe", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
	h := remixHost{auth: auth, backend: auth.remixBackend}
	handler := h.wrap(auth.protect(mux, strings.Repeat("t", 48)), mux)
	call := func(method, path, origin string, body any, installationID, token string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(method, hub+path, strings.NewReader(string(raw)))
		req.Header.Set("Content-Type", "application/json")
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		if installationID != "" {
			req.Header.Set("X-Clips-Installation", installationID)
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		for _, c := range cookies {
			req.AddCookie(c)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}
	issue := func(identity customerIdentity) *http.Cookie {
		rec := httptest.NewRecorder()
		auth.issueSession(ctx, rec, httptest.NewRequest("POST", hub+"/auth/login", nil), identity)
		if rec.Code != 200 {
			t.Fatal(rec.Body.String())
		}
		return rec.Result().Cookies()[0]
	}
	cookieA, cookieB := issue(a), issue(b)
	base := "/remix/v1/installations/" + installs[0].ID
	if res := call("GET", base+"/bootstrap", installs[1].Origin, nil, "", ""); res.Code != 403 || res.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("foreign origin bootstrapped", res.Code)
	}
	res := call("GET", base+"/bootstrap", installs[0].Origin, nil, "", "")
	if res.Code != 200 || strings.Contains(res.Body.String(), "organization_id") || strings.Contains(res.Body.String(), "token") || strings.Contains(res.Body.String(), "person_id") {
		t.Fatal("bootstrap leaked private identity", res.Code, res.Body.String())
	}
	verifier := strings.Repeat("v", 43)
	state := strings.Repeat("s", 43)
	requestBody := map[string]string{"challenge": remixChallenge(verifier), "challenge_method": "S256", "state": state}
	res = call("POST", base+"/request", installs[0].Origin, requestBody, "", "")
	if res.Code != 200 {
		t.Fatal(res.Code, res.Body.String())
	}
	var requested struct {
		URL string `json:"authorization_url"`
	}
	json.Unmarshal(res.Body.Bytes(), &requested)
	u, _ := url.Parse(requested.URL)
	res = call("GET", u.RequestURI(), "", nil, "", "")
	if res.Code != 303 || res.Header().Get("Location") != "/login" || len(res.Result().Cookies()) != 1 {
		t.Fatal("central login not requested", res.Code)
	}
	pending := res.Result().Cookies()[0]
	if !pending.HttpOnly || !pending.Secure || pending.SameSite != http.SameSiteLaxMode {
		t.Fatal("unsafe pending cookie")
	}
	if res := call("POST", "/auth/remix/continue", hub, map[string]string{}, "", "", pending, cookieB); res.Code != 403 {
		t.Fatal("wrong customer's cookie issued entry", res.Code)
	}
	res = call("POST", "/auth/remix/continue", hub, map[string]string{}, "", "", pending, cookieA)
	if res.Code != 200 {
		t.Fatal(res.Code, res.Body.String())
	}
	var redirect struct {
		URL string `json:"redirect_url"`
	}
	json.Unmarshal(res.Body.Bytes(), &redirect)
	callback, _ := url.Parse(redirect.URL)
	values, _ := url.ParseQuery(callback.Fragment)
	if callback.Scheme+"://"+callback.Host != installs[0].Origin || callback.Path != "/login" || callback.RawQuery != "" || values.Get("state") != state {
		t.Fatal("unsafe callback", callback)
	}
	code := values.Get("clips_code")
	exchange := map[string]string{"code": code, "verifier": verifier, "state": state}
	bad := map[string]string{"code": code, "verifier": strings.Repeat("x", 43), "state": state}
	if res := call("POST", base+"/exchange", installs[0].Origin, bad, "", ""); res.Code != 403 {
		t.Fatal("bad PKCE accepted", res.Code)
	}
	if res := call("POST", base+"/exchange", installs[1].Origin, exchange, "", ""); res.Code != 403 {
		t.Fatal("foreign origin exchanged code", res.Code)
	}
	results := make(chan *httptest.ResponseRecorder, 4)
	var wg sync.WaitGroup
	for range 4 {
		wg.Go(func() { results <- call("POST", base+"/exchange", installs[0].Origin, exchange, "", "") })
	}
	wg.Wait()
	close(results)
	var tokens remixTokens
	winners := 0
	for result := range results {
		if result.Code == 200 {
			winners++
			json.Unmarshal(result.Body.Bytes(), &tokens)
		} else if result.Code != 403 {
			t.Fatal("concurrent exchange failed", result.Code, result.Body.String())
		}
	}
	if winners != 1 {
		t.Fatal("authorization code had multiple concurrent winners", winners)
	}
	if tokens.Identity.ID != a.ID || tokens.Identity.Platform == nil || tokens.InstallationID != installs[0].ID {
		t.Fatal("entry identity changed")
	}
	if res := call("POST", base+"/exchange", installs[0].Origin, exchange, "", ""); res.Code != 403 {
		t.Fatal("code replay accepted", res.Code)
	}
	if res := call("GET", "/app/probe", installs[0].Origin, nil, installs[0].ID, tokens.Access); res.Code != 200 || !strings.Contains(res.Body.String(), a.WorkspaceID) {
		t.Fatal("private API not connected", res.Code, res.Body.String())
	}
	for _, path := range []string{"/ops/status", "/integration/v1/events?source=clips", "/studio/session"} {
		if res := call("GET", path, installs[0].Origin, nil, installs[0].ID, tokens.Access); res.Code != 403 {
			t.Fatal("technical API exposed", path, res.Code)
		}
	}
	if res := call("GET", "/app/probe", installs[1].Origin, nil, installs[1].ID, tokens.Access); res.Code != 403 {
		t.Fatal("token moved to another installation", res.Code)
	}
	reqB, err := h.createRequest(ctx, installs[1], state, remixChallenge(verifier))
	if err != nil {
		t.Fatal(err)
	}
	redirectB, err := h.completeRequest(ctx, reqB, b, sessionHash(cookieB.Value))
	if err != nil {
		t.Fatal(err)
	}
	callbackB, err := url.Parse(redirectB)
	if err != nil {
		t.Fatal(err)
	}
	valuesB, err := url.ParseQuery(callbackB.Fragment)
	if err != nil {
		t.Fatal(err)
	}
	tokensB, err := h.exchange(ctx, installs[1], valuesB.Get("clips_code"), verifier, state)
	if err != nil {
		t.Fatal(err)
	}
	actors := []remixTokens{tokens, tokensB}
	gifCall := func(n int, method, path string, body any) *httptest.ResponseRecorder {
		return call(method, path, installs[n].Origin, body, installs[n].ID, actors[n].Access)
	}
	assertRemixGIFIsolation(t, q, identities, gifCall)

	res = call("POST", base+"/refresh", installs[0].Origin, map[string]string{"refresh_token": tokens.Refresh}, "", "")
	if res.Code != 200 {
		t.Fatal(res.Code, res.Body.String())
	}
	var fresh remixTokens
	json.Unmarshal(res.Body.Bytes(), &fresh)
	if res := call("POST", base+"/refresh", installs[0].Origin, map[string]string{"refresh_token": tokens.Refresh}, "", ""); res.Code != 403 {
		t.Fatal("reused refresh accepted", res.Code)
	}
	if res := call("GET", "/auth/me", installs[0].Origin, nil, installs[0].ID, fresh.Access); res.Code != 403 {
		t.Fatal("refresh replay did not revoke session", res.Code)
	}
	// A separate browser/installation is unaffected by the replay or logout.
	if res := call("GET", "/auth/me", "", nil, "", "", cookieB); res.Code != 200 {
		t.Fatal("other customer affected", res.Code)
	}
	if _, err := directory.Change(ctx, platformdirectory.Change{Kind: "installation", ID: installs[0].ID, Enabled: false, ExpectedRevision: 1, Reason: "Lab revocation"}); err != nil {
		t.Fatal(err)
	}
	if res := call("GET", base+"/bootstrap", installs[0].Origin, nil, "", ""); res.Code != 403 {
		t.Fatal("revoked installation retained bootstrap", res.Code)
	}
}

func TestRemixOperationalRegistrationRejectsUnverifiedAddressShapes(t *testing.T) {
	for _, origin := range []string{"http://example.com", "https://localhost", "https://alfa.remix.localhost:8080", "https://127.0.0.1", "https://user:password@example.com", "https://example.com/", "https://example.com/path", "https://example.com?customer=other", "https://example.com#other", "https://example.com:443", "https://EXAMPLE.com"} {
		if platformdirectory.ValidOrigin(origin, false) {
			t.Fatal("noncanonical/local production origin accepted", origin)
		}
	}
	if !platformdirectory.ValidOrigin("https://verified-client.lovable.app", false) {
		t.Fatal("verified canonical domain rejected")
	}
	if !platformdirectory.ValidOrigin("https://alfa.remix.localhost:8080", true) {
		t.Fatal("isolated test origin rejected")
	}
}

func assertRemixGIFIsolation(t *testing.T, q queue, accounts []customerIdentity, call func(int, string, string, any) *httptest.ResponseRecorder) {
	t.Helper()
	ctx := context.Background()
	keys := []string{"sk-synthetic-remix-alpha-credential", "sk-synthetic-remix-bravo-credential"}
	for n, account := range accounts {
		if resp := call(n, "PUT", "/app/gifs/key", map[string]string{"key": keys[n]}); resp.Code != 204 {
			t.Fatalf("account %d could not save key: %d %s", n, resp.Code, resp.Body)
		}
		input := fmt.Sprintf(`{"email":%q,"remaining":%d,"expires_at":%q}`, account.Email, n+1, time.Now().Add(time.Hour).Format(time.RFC3339))
		if err := setGIFGrant(ctx, q.db, strings.NewReader(input)); err != nil {
			t.Fatal(err)
		}
	}
	jobIDs := make([]string, len(accounts))
	for n, account := range accounts {
		resp := call(n, "POST", "/app/gifs", map[string]any{"prompt": "A robot waving", "gift": false})
		if resp.Code != 202 {
			t.Fatalf("account %d could not submit BYOK job: %d %s", n, resp.Code, resp.Body)
		}
		var job struct{ ID string }
		if err := json.Unmarshal(resp.Body.Bytes(), &job); err != nil {
			t.Fatal(err)
		}
		jobIDs[n] = job.ID
		var owner string
		var sponsored bool
		if err := q.db.QueryRow(ctx, `SELECT account_id,sponsored FROM gif_jobs WHERE id=$1`, job.ID).Scan(&owner, &sponsored); err != nil {
			t.Fatal(err)
		}
		if owner != account.ID || sponsored || q.gifJobKey(ctx, owner, sponsored) != keys[n] {
			t.Fatalf("account %d would use the wrong worker credential", n)
		}
		if _, err := q.db.Exec(ctx, `UPDATE gif_jobs SET status='done',image=$2 WHERE id=$1`, job.ID, []byte(fmt.Sprintf("GIF89a-account-%d", n))); err != nil {
			t.Fatal(err)
		}
	}
	for n, account := range accounts {
		resp := call(n, "POST", "/app/gifs", map[string]any{"prompt": "A sponsored robot", "gift": true})
		if resp.Code != 202 || q.gifJobKey(ctx, account.ID, true) != q.gifs.platformKey {
			t.Fatalf("account %d could not use its own gift: %d", n, resp.Code)
		}
	}
	for n := range accounts {
		status := call(n, "GET", "/app/gifs", nil)
		var out struct {
			Remaining int  `json:"gift_remaining"`
			HasKey    bool `json:"has_key"`
		}
		if err := json.Unmarshal(status.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		if status.Code != 200 || !out.HasKey || out.Remaining != n || strings.Contains(status.Body.String(), jobIDs[1-n]) || strings.Contains(status.Body.String(), "sk-synthetic") {
			t.Fatalf("account %d received wrong balance or foreign data: %d", n, status.Code)
		}
		if resp := call(n, "GET", "/app/gifs/"+jobIDs[n]+"/image", nil); resp.Code != 200 || resp.Body.String() != fmt.Sprintf("GIF89a-account-%d", n) {
			t.Fatalf("account %d could not download its own GIF", n)
		}
		if resp := call(n, "GET", "/app/gifs/"+jobIDs[1-n]+"/image", nil); resp.Code != 404 {
			t.Fatalf("account %d accessed a foreign GIF: %d", n, resp.Code)
		}
	}
}
