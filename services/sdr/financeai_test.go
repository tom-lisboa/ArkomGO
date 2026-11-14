package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFinanceSessionRejectsUntrustedIdentityAndPayload(t *testing.T) {
	a, creds, _ := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	viewer := login(t, a, creds, "beta.viewer")
	t.Setenv("ARKOM_FINANCEAI_STATE_DIR", t.TempDir())
	const route = "/v1/sdr/genesis-demo/ecosystem/financeai/session"
	nonce := strings.Repeat("a", 43)
	body := `{"challenge":"` + nonce + `","state":"` + nonce + `"}`

	for _, tc := range []struct {
		name, credential, remote, body string
		want                           int
	}{
		{"anonymous", "", "127.0.0.1:4321", body, 401},
		{"remote", admin, "192.0.2.1:4321", body, 404},
		{"role override", viewer, "127.0.0.1:4321", strings.TrimSuffix(body, "}") + `,"role":"admin"}`, 400},
		{"tenant override", admin, "127.0.0.1:4321", strings.TrimSuffix(body, "}") + `,"company":"beta"}`, 400},
		{"bad challenge", admin, "127.0.0.1:4321", `{"challenge":"bad","state":"bad"}`, 422},
		{"unconfigured", admin, "127.0.0.1:4321", body, 503},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, route, strings.NewReader(tc.body))
			r.RemoteAddr = tc.remote
			if tc.credential != "" {
				r.Header.Set("Authorization", "Bearer "+tc.credential)
			}
			w := httptest.NewRecorder()
			a.Handler().ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d", w.Code, tc.want)
			}
		})
	}
}

func TestFinanceCompanyRequiresMatchingOrganizationActorAndRole(t *testing.T) {
	u := User{ID: "user_beta_viewer", Org: "org_demo_beta", Role: "viewer", Environment: "isolated-test"}
	if financeCompany(u) != "beta" {
		t.Fatal("valid beta viewer denied")
	}
	for _, bad := range []User{
		{ID: u.ID, Org: "org_demo_alfa", Role: u.Role, Environment: u.Environment},
		{ID: u.ID, Org: u.Org, Role: "admin", Environment: u.Environment},
		{ID: u.ID, Org: u.Org, Role: u.Role, Environment: "production"},
	} {
		if financeCompany(bad) != "" {
			t.Fatal("incompatible identity accepted")
		}
	}
}
