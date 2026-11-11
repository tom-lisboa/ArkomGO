package main

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestPublicPilotRequiresCodeAndScopesCompany(t *testing.T) {
	a, keys, _ := storedApp(t)
	body := map[string]any{"company": "alfa", "role": "operator", "access_code": "invalid"}
	code, _ := req(a, "POST", "/__test/ui/login", "", "", body)
	if code != 401 {
		t.Fatal("open demo login", code)
	}
	body["access_code"] = keys["alfa.operator"]
	code, b := req(a, "POST", "/__test/ui/login", "", "", body)
	if code != 200 {
		t.Fatal(code, b)
	}
	tok := b["access_token"].(string)
	code, _ = req(a, "GET", "/v1/sdr/conversations/conv_demo_beta", tok, "", nil)
	if code != 404 {
		t.Fatal("tenant leak")
	}
	code, _ = req(a, "POST", "/__test/v1/connections/conn_demo_alfa/inbound", keys["harness.alfa"], "", nil)
	if code != 404 {
		t.Fatal("public harness")
	}
	raw, _ := json.Marshal(b)
	if len(raw) == 0 {
		t.Fatal("no session")
	}
}
func TestPilotOrigins(t *testing.T) {
	for _, s := range []string{"https://24.199.100.186", "https://test.lovable.app", "https://preview.lovableproject.com"} {
		if !pilotOrigin(s) {
			t.Fatal(s)
		}
	}
	for _, s := range []string{"http://test.lovable.app", "https://test.lovable.app.evil.example", "https://test.lovable.app/path", "https://test.lovable.app:9999"} {
		if pilotOrigin(s) {
			t.Fatal(s)
		}
	}
	a, _, _ := storedApp(t)
	r := httptest.NewRequest("OPTIONS", "/v1/sdr/me", nil)
	r.Header.Set("Origin", "https://test.lovable.app")
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != "https://test.lovable.app" {
		t.Fatal(w.Code)
	}
}
