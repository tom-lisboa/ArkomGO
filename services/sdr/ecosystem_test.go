package main

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

type ecosystemTransport func(*http.Request) (*http.Response, error)

func (f ecosystemTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestEcosystemCatalogAndPrivateClipsBridge(t *testing.T) {
	a, creds, _ := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	viewer := login(t, a, creds, "alfa.viewer")
	base := "/v1/sdr/genesis-demo/ecosystem"
	if code, _ := req(a, "GET", base, "", "", nil); code != 401 {
		t.Fatal(code)
	}
	code, out := req(a, "GET", base, admin, "", nil)
	if code != 200 {
		t.Fatal(code)
	}
	count := 0
	for _, raw := range out["solutions"].([]any) {
		s := raw.(map[string]any)
		if s["implemented"] == true {
			count++
		}
		if s["id"] == "financeai" && s["implemented"] != false {
			t.Fatal("unimplemented service unlocked")
		}
	}
	if count != 4 {
		t.Fatal("incorrect operational catalog", count)
	}
	t.Setenv("SDR_CLIPS_BRIDGE_KEY", strings.Repeat("a", 48))
	prior := ecosystemClient
	defer func() { ecosystemClient = prior }()
	owners := []string{}
	ecosystemClient = &http.Client{Transport: ecosystemTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "127.0.0.1:18082" || r.Header.Get("Authorization") != "" {
			t.Fatal("unsafe upstream request")
		}
		cookie, err := r.Cookie("clips_go")
		if err != nil || len(cookie.Value) != 26 {
			t.Fatal("missing tenant identity")
		}
		owners = append(owners, cookie.Value)
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}, "Set-Cookie": []string{"never=expose"}}, Body: io.NopCloser(strings.NewReader(`{"jobs":[]}`))}, nil
	})}
	for _, token := range []string{admin, beta, admin} {
		if code, _ := req(a, "GET", base+"/clips/jobs", token, "", nil); code != 200 {
			t.Fatal(code)
		}
	}
	if owners[0] == owners[1] || owners[0] != owners[2] {
		t.Fatal("tenant separation or stability lost")
	}
	if code, _ := req(a, "POST", base+"/clips/jobs", viewer, "", nil); code != 403 {
		t.Fatal("viewer upload", code)
	}
	if code, _ := req(a, "POST", base+"/clips/jobs/clip123/delete", viewer, "", nil); code != 403 {
		t.Fatal("viewer delete", code)
	}
	if code, _ := req(a, "GET", base+"/clips/jobs/clip123/delete", admin, "", nil); code != 404 {
		t.Fatal("read must not delete", code)
	}
	if code, _ := req(a, "GET", base+"/clips/other", admin, "", nil); code != 404 {
		t.Fatal("unknown route forwarded", code)
	}
}

func TestSolutionRatingPersistsAndScopesFeedback(t *testing.T) {
	a, creds, db := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	operator := login(t, a, creds, "alfa.operator")
	viewer := login(t, a, creds, "alfa.viewer")
	beta := login(t, a, creds, "beta.admin")
	base := "/v1/sdr/genesis-demo/ecosystem"
	vote := func(token string, value int) map[string]any {
		t.Helper()
		code, out := req(a, "POST", base+"/sdr/rating", token, "", map[string]any{"rating": value})
		if code != 200 {
			t.Fatal(code, out)
		}
		return out
	}
	if out := vote(admin, 4); out["count"] != float64(1) || out["average"] != float64(4) {
		t.Fatal(out)
	}
	if out := vote(admin, 5); out["count"] != float64(1) {
		t.Fatal("duplicate vote", out)
	}
	if out := vote(operator, 2); out["average"] != 3.5 || out["mine"] != float64(2) || out["count"] != float64(2) {
		t.Fatal(out)
	}
	if code, _ := req(a, "POST", base+"/sdr/rating", viewer, "", map[string]any{"rating": 5}); code != 403 {
		t.Fatal("viewer mutation", code)
	}
	if code, _ := req(a, "POST", base+"/sdr/rating", admin, "", map[string]any{"rating": 0}); code != 422 {
		t.Fatal("invalid rating", code)
	}
	if code, _ := req(a, "POST", base+"/financeai/rating", admin, "", map[string]any{"rating": 5}); code != 404 {
		t.Fatal("blocked solution rated", code)
	}
	if code, _ := req(a, "POST", base+"/sdr/rating", "", "", map[string]any{"rating": 5}); code != 401 {
		t.Fatal("anonymous rating", code)
	}
	code, list := req(a, "GET", base, beta, "", nil)
	if code != 200 {
		t.Fatal(code)
	}
	for _, raw := range list["solutions"].([]any) {
		s := raw.(map[string]any)
		if s["id"] == "sdr" {
			rating := s["rating"].(map[string]any)
			if rating["count"] != float64(0) || rating["average"] != nil {
				t.Fatal("cross tenant rating", rating)
			}
		}
	}
	if err := a.Close(); err != nil {
		t.Fatal(err)
	}
	restored, nextCreds, err := newApp(db)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	token := login(t, restored, nextCreds, "alfa.admin")
	code, out := req(restored, "GET", base, token, "", nil)
	if code != 200 {
		t.Fatal(code)
	}
	for _, raw := range out["solutions"].([]any) {
		s := raw.(map[string]any)
		if s["id"] == "sdr" {
			rating := s["rating"].(map[string]any)
			if rating["count"] != float64(2) || rating["mine"] != float64(5) {
				t.Fatal("vote not persisted", rating)
			}
		}
	}
}

func TestGIFBridgeUsesOnlyAuthenticatedCompanyAndAccount(t *testing.T) {
	a, creds, _ := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	operator := login(t, a, creds, "alfa.operator")
	beta := login(t, a, creds, "beta.admin")
	viewer := login(t, a, creds, "alfa.viewer")
	t.Setenv("SDR_CLIPS_BRIDGE_KEY", strings.Repeat("g", 48))
	path := "/v1/sdr/genesis-demo/ecosystem/clips/gifs"
	prior := ecosystemClient
	defer func() { ecosystemClient = prior }()
	seen := map[string][]string{}
	ecosystemClient = &http.Client{Transport: ecosystemTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "127.0.0.1:18082" || r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
			t.Fatal("unexpected upstream credential or host")
		}
		seen[r.Method+" "+r.URL.Path] = append(seen[r.Method+" "+r.URL.Path], r.Header.Get("X-Arkom-Clips-Subject"))
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(`{}`))}, nil
	})}
	for _, token := range []string{admin, operator, beta, admin} {
		if code, _ := req(a, "GET", path, token, "", nil); code != 200 {
			t.Fatal(code)
		}
	}
	subjects := seen["GET /app/gifs"]
	if len(subjects) != 4 || subjects[0] == subjects[1] || subjects[0] == subjects[2] || subjects[0] != subjects[3] {
		t.Fatal("expected separate stable subjects per organization and person")
	}
	if code, _ := req(a, "POST", path+"/key", viewer, "", map[string]any{}); code != 403 {
		t.Fatal("viewer key write", code)
	}
	if code, _ := req(a, "POST", path, admin, "", map[string]any{}); code != 400 {
		t.Fatal("missing request key", code)
	}
	if code, _ := req(a, "POST", path+"/key/remove", admin, "", map[string]any{}); code != 200 ||
		len(seen["DELETE /app/gifs/key"]) != 1 {
		t.Fatal("key removal must use the CLIPS API", code)
	}
}

func TestEcosystemSDRCapabilitiesFollowRuntimeAndOrganization(t *testing.T) {
	a, creds, _ := genesisApp(t)
	a.calendarEnabled = true
	a.crmRoutes = map[string]crmRoute{"org_demo_alfa": {Origin: "http://127.0.0.1:8098", Token: "server-only-test-token"}}
	for _, company := range []string{"alfa", "beta"} {
		token := login(t, a, creds, company+".admin")
		code, out := req(a, "GET", "/v1/sdr/genesis-demo/ecosystem", token, "", nil)
		if code != 200 {
			t.Fatal(code, out)
		}
		found := false
		for _, raw := range out["solutions"].([]any) {
			s := raw.(map[string]any)
			if s["id"] != "sdr" {
				continue
			}
			found = true
			caps := s["product_capabilities"].(map[string]any)
			if caps["calendar"] != true || caps["customer_data"] != false || caps["crm"] != (company == "alfa") {
				t.Fatal("incorrect product availability", company, caps)
			}
			if len(caps) != 3 || s["interface"].(map[string]any)["route"] != "/demo/sdr" {
				t.Fatal("unexpected client contract", s)
			}
		}
		if !found {
			t.Fatal("SDR not in catalog")
		}
	}
}
