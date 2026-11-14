package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPlatformLoginCookieSwitchAndLogout(t *testing.T) {
	t.Setenv("ARKOM_LOCAL_DEMO", "true")
	t.Setenv("SDR_CRM_DEV_ENABLED", "true")
	t.Setenv("ARKOM_PLATFORM_REQUIRE_LOGIN", "true")
	a, credentials, err := newApp("")
	if err != nil {
		t.Fatal(err)
	}
	web := platformTestHandler(t, a.Handler())
	call := func(method, path, body string, cookie *http.Cookie, bearer string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, "http://127.0.0.1:3007/api/demo/backend"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		w := httptest.NewRecorder()
		web.ServeHTTP(w, r)
		return w
	}
	const entry = "/v1/platform/auth/"
	for _, path := range []string{"/__test/ui/local-enter", "/__test/ui/login", "/v1/sdr/auth/login"} {
		if code := call("POST", path, "{}", nil, "").Code; code != 404 {
			t.Fatalf("%s accessible with status %d", path, code)
		}
	}
	if got := call("GET", entry+"session", "", nil, ""); got.Code != 401 {
		t.Fatal(got.Code)
	}
	if got := call("POST", entry+"login", `{"email":"beta@arkom.test","password":"incorrect"}`, nil, ""); got.Code != 401 {
		t.Fatal(got.Code)
	}
	signIn := func(account string, old *http.Cookie) *http.Cookie {
		t.Helper()
		raw, _ := json.Marshal(map[string]string{"email": account + "@arkom.test", "password": credentials[account+".admin"]})
		got := call("POST", entry+"login", string(raw), old, "")
		if got.Code != 200 || !strings.Contains(got.Body.String(), "org_demo_"+account) {
			t.Fatalf("%s login rejected (%d)", account, got.Code)
		}
		cookies := got.Result().Cookies()
		if len(cookies) != 1 || !cookies[0].HttpOnly || !cookies[0].Secure || cookies[0].SameSite != http.SameSiteStrictMode {
			t.Fatal("insecure session cookie")
		}
		return cookies[0]
	}
	alfa := signIn("alfa", nil)
	if restored := call("GET", entry+"session", "", alfa, ""); restored.Code != 200 || !strings.Contains(restored.Body.String(), "Alfa Automação") {
		t.Fatal("Alfa session was not restored")
	}
	beta := signIn("beta", alfa)
	if got := call("GET", "/v1/core/business", "", nil, alfa.Value); got.Code != 401 {
		t.Fatal("Alfa token survived switch", got.Code)
	}
	if got := call("GET", "/v1/sdr/conversations/conv_demo_alfa", "", nil, beta.Value); got.Code != 404 {
		t.Fatal("Beta can read Alfa conversation", got.Code)
	}
	if got := call("POST", entry+"logout", "{}", beta, beta.Value); got.Code != 204 || got.Result().Cookies()[0].MaxAge >= 0 {
		t.Fatal("logout did not clear session")
	}
	if got := call("GET", entry+"session", "", beta, ""); got.Code != 401 {
		t.Fatal("logout did not revoke session", got.Code)
	}
}

func TestBetaCRMSyntheticTenant(t *testing.T) {
	a, credentials, err := newApp("")
	if err != nil {
		t.Fatal(err)
	}
	alfa := login(t, a, credentials, "alfa.admin")
	beta := login(t, a, credentials, "beta.admin")
	t.Setenv("ARKOM_PLATFORM_REQUIRE_LOGIN", "true")
	t.Setenv("SDR_CRM_DEV_ENABLED", "true")
	t.Setenv("ARKOM_CRM_BETA_HOMOLOG", "true")

	run := func(token, op string, body any, expected int) map[string]any {
		t.Helper()
		code, result := req(a, "POST", "/v1/sdr/crm/"+op, token, "", body)
		if code != expected {
			t.Fatalf("%s: %d, wanted %d", op, code, expected)
		}
		return result
	}
	run(alfa, "pipelines.list", map[string]any{}, 404)
	run(beta, "pipelines.list", map[string]any{}, 200)
	contact := run(beta, "contacts.create", map[string]string{"name": "Aluno de teste", "email": "aluno@example.test"}, 201)
	id := contact["leadId"].(string)
	code, _ := req(a, "GET", "/v1/sdr/conversations/"+contact["conversationId"].(string), alfa, "", nil)
	if code != 404 {
		t.Fatal("Alfa could fetch Beta conversation", code)
	}
	card := run(beta, "cards.create", map[string]string{
		"pipeline_id": "beta-matriculas", "stage_id": "beta-interesse", "lead_id": id, "title": "Matrícula teste",
	}, 200)
	run(beta, "cards.move", map[string]string{"card_id": card["id"].(string), "stage_id": "beta-aula"}, 200)
	run(beta, "cards.close", map[string]string{"card_id": card["id"].(string), "status": "won"}, 200)
	results := run(beta, "cards.list", map[string]string{"pipeline_id": "beta-matriculas", "status": "won"}, 200)
	if len(results["data"].([]any)) != 1 {
		t.Fatal("expected one Beta card")
	}
}

func TestHostedPlatformScopesLoginAndBlocksPrivateRoutes(t *testing.T) {
	t.Setenv("ARKOM_PLATFORM_REQUIRE_LOGIN", "true")
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("ArkomGO"), 0600); err != nil {
		t.Fatal(err)
	}
	login := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/platform/auth/login" {
			t.Errorf("unexpected upstream path %s", r.URL.Path)
		}
		setPlatformCookie(w, "test", 3600)
	}))
	defer login.Close()
	target, err := url.Parse(login.URL)
	if err != nil {
		t.Fatal(err)
	}
	handler := hostedPlatformWebHandler(dir, dir, target, dir, dir)
	call := func(path, origin string) *http.Response {
		t.Helper()
		r := httptest.NewRequest(http.MethodPost, hostedPlatformOrigin+path, strings.NewReader("{}"))
		r.RemoteAddr = "127.0.0.1:54321"
		r.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w.Result()
	}
	const auth = "/arkomgo/api/demo/backend/v1/platform/auth/"
	for _, origin := range []string{"", "https://example.test"} {
		if got := call(auth+"login", origin); got.StatusCode != http.StatusForbidden {
			t.Fatalf("untrusted origin admitted: %d", got.StatusCode)
		}
	}
	result := call(auth+"login", hostedPlatformOrigin)
	cookies := result.Cookies()
	if result.StatusCode != http.StatusOK || len(cookies) != 1 ||
		cookies[0].Path != auth || !cookies[0].Secure || !cookies[0].HttpOnly {
		t.Fatalf("hosted login did not issue a scoped secure cookie: %d", result.StatusCode)
	}
	for _, path := range []string{
		"/arkomgo/api/demo/backend/__test/ui/local-enter",
		"/arkomgo/api/demo/backend/v1/platform/auth/%2e%2e/login",
		"/arkomgo/maia-data/auth/v1/admin/users",
		"/arkomgo/maia-data/auth/v1/token?grant_type=password",
	} {
		if got := call(path, hostedPlatformOrigin); got.StatusCode != http.StatusNotFound {
			t.Fatalf("private route %s returned %d", path, got.StatusCode)
		}
	}
}
