package platformaccess

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestClientRejectsForgedMappingAndRedirects(t *testing.T) {
	org := "11111111-1111-4111-8111-111111111111"
	p := Principal{CustomerID: org, OrganizationID: org, PersonID: org, Solution: "finance", Backend: "finance-next", LocalOrganizationID: "local-alfa", LocalActorID: "owner", Role: "viewer"}
	mode := "ok"
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Organization-ID") != org || r.Header.Get("Authorization") == "" || r.URL.Path != "/integration/v1/identity/finance/resolve" {
			t.Error("missing server scope")
		}
		switch mode {
		case "deny":
			w.WriteHeader(403)
			return
		case "down":
			w.WriteHeader(503)
			return
		case "redirect":
			http.Redirect(w, r, "https://example.invalid", 302)
			return
		case "foreign":
			v := p
			v.LocalActorID = "another-user"
			json.NewEncoder(w).Encode(v)
			return
		case "trailing":
			json.NewEncoder(w).Encode(p)
			w.Write([]byte(`{}`))
			return
		}
		json.NewEncoder(w).Encode(p)
	}))
	defer s.Close()
	c, err := New(Configuration{URL: s.URL, Backend: p.Backend, Solution: p.Solution, Organizations: []Credential{{OrganizationID: org, LocalOrganizationID: p.LocalOrganizationID, Token: "arkom_service_" + strings.Repeat("a", 43)}}})
	if err != nil {
		t.Fatal(err)
	}
	if got, err := c.Resolve(context.Background(), p.LocalOrganizationID, p.LocalActorID); err != nil || got != p {
		t.Fatal("valid mapping", got, err)
	}
	for _, m := range []string{"down", "redirect", "foreign", "trailing"} {
		mode = m
		if _, err := c.Resolve(context.Background(), p.LocalOrganizationID, p.LocalActorID); !errors.Is(err, ErrUnavailable) {
			t.Fatal(m, err)
		}
	}
	mode = "deny"
	if _, err := c.Resolve(context.Background(), p.LocalOrganizationID, p.LocalActorID); !errors.Is(err, ErrDenied) {
		t.Fatal(err)
	}
	if _, err := c.Resolve(context.Background(), "unregistered", p.LocalActorID); !errors.Is(err, ErrDenied) {
		t.Fatal(err)
	}
	for _, local := range []string{"viewer", "operator", "admin"} {
		for _, common := range []string{"viewer", "operator", "admin"} {
			role, err := Ceiling(local, common)
			if err != nil || RoleRank(role) > RoleRank(local) || RoleRank(role) > RoleRank(common) {
				t.Fatal("role promoted", local, common, role)
			}
		}
	}
}

func TestPrivateConfigurationIsExplicitAndCannotEnableAnotherProduct(t *testing.T) {
	if c, err := FromFile("", "finance"); err != nil || c != nil {
		t.Fatal("disabled adoption changed behavior")
	}
	config := Configuration{URL: "https://identity.example.invalid", Backend: "finance-next", Solution: "finance", Organizations: []Credential{{OrganizationID: "11111111-1111-4111-8111-111111111111", LocalOrganizationID: "local-alfa", Token: "arkom_service_" + strings.Repeat("a", 43)}}}
	path := filepath.Join(t.TempDir(), "private.json")
	raw, _ := json.Marshal(config)
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	if c, err := FromFile(path, "finance"); err != nil || c == nil {
		t.Fatal("valid private configuration", err)
	}
	if _, err := FromFile(path, "bia-sdr"); !errors.Is(err, ErrUnavailable) {
		t.Fatal("configuration reused across products", err)
	}
	if err := os.Chmod(path, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := FromFile(path, "finance"); !errors.Is(err, ErrUnavailable) {
		t.Fatal("public credential file accepted", err)
	}
}
