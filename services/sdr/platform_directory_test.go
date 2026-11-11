package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"sdr-next-pilot/internal/platformaccess"
)

func TestDirectorySDRScopesEveryCustomerRouteAndPreservesLocalRole(t *testing.T) {
	t.Setenv("SDR_DIRECTORY_FILE", "")
	a, credentials, err := newApp("")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	alfa := login(t, a, credentials, "alfa.admin")
	beta := login(t, a, credentials, "beta.admin")
	viewer := login(t, a, credentials, "alfa.viewer")
	var mode atomic.Int32 // 0 viewer, 1 common admin, 2 revoke alfa, 3 unavailable
	orgs := map[string]string{"org_demo_alfa": "11111111-1111-4111-8111-111111111111", "org_demo_beta": "22222222-2222-4222-8222-222222222222"}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var local platformaccess.LocalIdentity
		if json.NewDecoder(r.Body).Decode(&local) != nil || orgs[local.OrganizationID] == "" {
			w.WriteHeader(403)
			return
		}
		if mode.Load() == 3 {
			w.WriteHeader(503)
			return
		}
		if mode.Load() == 2 && local.OrganizationID == "org_demo_alfa" {
			w.WriteHeader(403)
			return
		}
		role := "viewer"
		if mode.Load() == 1 {
			role = "admin"
		}
		json.NewEncoder(w).Encode(platformaccess.Principal{CustomerID: orgs[local.OrganizationID], OrganizationID: orgs[local.OrganizationID], PersonID: "33333333-3333-4333-8333-333333333333", Backend: "sdr-next", Solution: "bia-sdr", LocalOrganizationID: local.OrganizationID, LocalActorID: local.ActorID, Role: role})
	}))
	defer srv.Close()
	config := platformaccess.Configuration{URL: srv.URL, Backend: "sdr-next", Solution: "bia-sdr"}
	for local, id := range orgs {
		config.Organizations = append(config.Organizations, platformaccess.Credential{OrganizationID: id, LocalOrganizationID: local, Token: "arkom_service_" + strings.Repeat("a", 43)})
	}
	client, err := platformaccess.New(config)
	if err != nil {
		t.Fatal(err)
	}
	a.directory = client
	code, body := req(a, "GET", "/v1/sdr/me", alfa, "", nil)
	if code != 200 || body["role"] != "viewer" || body["platform"] == nil {
		t.Fatal("common identity/ceiling missing", code, body)
	}
	if code, _ := req(a, "GET", "/v1/sdr/conversations/conv_demo_beta", alfa, "", nil); code != 404 {
		t.Fatal("cross organization read", code)
	}
	action := map[string]any{"kind": "pause", "reason": "Lab control", "expected_revision": 1}
	if code, _ := req(a, "POST", "/v1/sdr/conversations/conv_demo_alfa/actions", alfa, "directory-pause", action); code != 403 {
		t.Fatal("common viewer mutated", code)
	}
	mode.Store(1)
	if code, body := req(a, "GET", "/v1/sdr/me", alfa, "", nil); code != 200 || body["role"] != "admin" {
		t.Fatal("role change required a new session", code, body)
	}
	if code, body := req(a, "GET", "/v1/sdr/me", viewer, "", nil); code != 200 || body["role"] != "viewer" {
		t.Fatal("directory promoted local viewer", code, body)
	}
	mode.Store(2)
	for _, path := range []string{"/v1/sdr/me", "/v1/sdr/conversations", "/v1/sdr/calendar/capabilities", "/v1/customer/graphql", "/v1/sdr/media"} {
		if code, _ := req(a, "GET", path, alfa, "", nil); code != 403 {
			t.Fatal("revoked identity bypassed route", path, code)
		}
	}
	if code, _ := req(a, "GET", "/v1/sdr/me", beta, "", nil); code != 200 {
		t.Fatal("unrelated customer affected", code)
	}
	if code, _ := req(a, "POST", "/v1/sdr/auth/login", "", "", map[string]any{"username": "alfa.admin", "password": credentials["alfa.admin"]}); code != 403 {
		t.Fatal("revoked user received new session", code)
	}
	mode.Store(3)
	if code, _ := req(a, "GET", "/v1/sdr/me", beta, "", nil); code != 503 {
		t.Fatal("directory outage bypassed access", code)
	}
}

func TestDirectorySDRInvalidConfigurationStopsStartup(t *testing.T) {
	t.Setenv("SDR_DIRECTORY_FILE", t.TempDir()+"/missing-private-config.json")
	if a, _, err := newApp(""); err == nil || a != nil {
		t.Fatal("invalid opt-in configuration was silently disabled")
	}
}
