package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"arkom/bia/internal/platformdirectory"
	"arkom/bia/internal/solutionbus"
	access "arkom/bia/pkg/platformaccess"
)

func directoryFixture(company string) platformdirectory.Registration {
	in := platformdirectory.Registration{Namespace: "verified-lab", Key: "register-" + company, CustomerReference: company, OrganizationReference: company + "-main", Name: "Empresa fictícia", Members: []platformdirectory.MemberInput{
		{Reference: "shared-person", Name: "Responsável fictício"}, {Reference: company + "-viewer", Name: "Responsável fictício"},
	}}
	for _, solution := range []string{"clips", "social", "finance", "bia-sdr"} {
		role := "operator"
		if solution == "finance" {
			role = "viewer"
		}
		in.Products = append(in.Products, platformdirectory.ProductInput{Solution: solution, Backend: solution + "-next", LocalOrganizationID: solution + "-" + company,
			Grants: []platformdirectory.GrantInput{{PersonReference: "shared-person", LocalActorID: "local-owner", Role: role}, {PersonReference: company + "-viewer", LocalActorID: "local-viewer", Role: "viewer"}}})
	}
	return in
}

func TestCommonDirectoryAcrossFourProductsAndTwoCustomers(t *testing.T) {
	db := identityTestDB(t)
	ctx := context.Background()
	store := platformdirectory.Store{DB: db}
	alfa, err := store.Register(ctx, directoryFixture("alfa"))
	if err != nil {
		t.Fatal(err)
	}
	beta, err := store.Register(ctx, directoryFixture("beta"))
	if err != nil {
		t.Fatal(err)
	}
	if alfa.CustomerID == beta.CustomerID || alfa.OrganizationID == beta.OrganizationID || alfa.People["shared-person"] != beta.People["shared-person"] || alfa.People["alfa-viewer"] == beta.People["beta-viewer"] {
		t.Fatal("identity merged by display name or person was duplicated")
	}
	var wg sync.WaitGroup
	for range 5 {
		wg.Go(func() {
			again, err := store.Register(ctx, directoryFixture("alfa"))
			if err != nil || again.OrganizationID != alfa.OrganizationID {
				t.Error("concurrent registration duplicated", err)
			}
		})
	}
	wg.Wait()
	changed := directoryFixture("alfa")
	changed.Name = "Different"
	if _, err := store.Register(ctx, changed); !errors.Is(err, platformdirectory.ErrConflict) {
		t.Fatal("idempotency mismatch accepted", err)
	}
	changed = directoryFixture("gamma")
	changed.Products[0].LocalOrganizationID = "clips-alfa"
	if _, err := store.Register(ctx, changed); !errors.Is(err, platformdirectory.ErrConflict) {
		t.Fatal("local tenant rebound", err)
	}
	var count int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM platform_directory.customers`).Scan(&count); err != nil || count != 2 {
		t.Fatal("partial failed registration persisted", count, err)
	}
	mux := http.NewServeMux()
	solutionbus.Server{DB: db, Directory: &store}.Mount(mux)
	server := httptest.NewServer(mux)
	defer server.Close()
	clients := map[string]*access.Client{}
	credentials := map[string]solutionbus.Credential{}
	for name, org := range map[string]platformdirectory.Registered{"alfa": alfa, "beta": beta} {
		for _, solution := range []string{"clips", "social", "finance", "bia-sdr"} {
			credential, err := solutionbus.Provision(ctx, db, solution, org.OrganizationID)
			if err != nil {
				t.Fatal(err)
			}
			if err := store.BindService(ctx, credential.ClientID, solution+"-next"); err != nil {
				t.Fatal(err)
			}
			if err := store.BindService(ctx, credential.ClientID, solution+"-next"); err != nil {
				t.Fatal("repeat service binding", err)
			}
			c, err := access.New(access.Configuration{URL: server.URL, Backend: solution + "-next", Solution: solution, Organizations: []access.Credential{{OrganizationID: org.OrganizationID, LocalOrganizationID: solution + "-" + name, Token: credential.Token}}})
			if err != nil {
				t.Fatal(err)
			}
			p, err := c.Resolve(ctx, solution+"-"+name, "local-owner")
			if err != nil {
				t.Fatal(err)
			}
			if p.CustomerID != org.CustomerID || p.OrganizationID != org.OrganizationID || p.PersonID != org.People["shared-person"] || p.Solution != solution {
				t.Fatal("incorrect shared identity", p)
			}
			if solution == "finance" && p.Role != "viewer" {
				t.Fatal("permission leaked between products")
			}
			clients[solution+"-"+name] = c
			credentials[solution+"-"+name] = credential
		}
	}
	foreign := access.LocalIdentity{Backend: "finance-next", OrganizationID: "finance-beta", ActorID: "local-owner"}
	cred := credentials["finance-alfa"]
	if _, err := store.ResolveService(ctx, cred.ClientID, alfa.OrganizationID, "finance", foreign); !errors.Is(err, access.ErrDenied) {
		t.Fatal("foreign organization accepted", err)
	}
	if _, err := store.ResolveService(ctx, cred.ClientID, alfa.OrganizationID, "social", foreign); !errors.Is(err, access.ErrDenied) {
		t.Fatal("foreign product accepted", err)
	}
	if _, err := clients["finance-alfa"].Resolve(ctx, "finance-alfa", "unregistered-user"); !errors.Is(err, access.ErrDenied) {
		t.Fatal("unregistered person accepted", err)
	}
	body, _ := json.Marshal(access.LocalIdentity{Backend: "finance-next", OrganizationID: "finance-alfa", ActorID: "local-owner"})
	for _, browser := range []bool{true, false} {
		req := httptest.NewRequest("POST", "/integration/v1/identity/finance/resolve", strings.NewReader(string(body)))
		if browser {
			req.Header.Set("Authorization", "Bearer "+cred.Token)
			req.Header.Set("Origin", "https://untrusted.invalid")
		}
		req.Header.Set("X-Organization-ID", alfa.OrganizationID)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != 401 && rec.Code != 403 {
			t.Fatal("browser or anonymous access accepted", rec.Code)
		}
	}
	// Change just the Finance grant. Other solutions retain their own roles.
	revision, err := store.Change(ctx, platformdirectory.Change{Kind: "grant", OrganizationID: alfa.OrganizationID, PersonID: alfa.People["shared-person"], Solution: "finance", Role: "operator", Enabled: true, ExpectedRevision: 1, Reason: "Authorized lab role update"})
	if err != nil || revision != 2 {
		t.Fatal(err)
	}
	if p, err := clients["finance-alfa"].Resolve(ctx, "finance-alfa", "local-owner"); err != nil || p.Role != "operator" {
		t.Fatal("role not revalidated", p, err)
	}
	if _, err = store.Change(ctx, platformdirectory.Change{Kind: "grant", OrganizationID: alfa.OrganizationID, PersonID: alfa.People["shared-person"], Solution: "finance", Role: "admin", Enabled: true, ExpectedRevision: 1, Reason: "Stale update"}); !errors.Is(err, platformdirectory.ErrConflict) {
		t.Fatal("stale role update accepted", err)
	}
	// Membership revocation is scoped to one organization, including shared people.
	if _, err := store.Change(ctx, platformdirectory.Change{Kind: "membership", OrganizationID: alfa.OrganizationID, PersonID: alfa.People["shared-person"], Enabled: false, ExpectedRevision: 1, Reason: "Lab revocation"}); err != nil {
		t.Fatal(err)
	}
	for _, solution := range []string{"clips", "social", "finance", "bia-sdr"} {
		if _, err := clients[solution+"-alfa"].Resolve(ctx, solution+"-alfa", "local-owner"); !errors.Is(err, access.ErrDenied) {
			t.Fatal("revoked member retained access", solution, err)
		}
		if _, err := clients[solution+"-beta"].Resolve(ctx, solution+"-beta", "local-owner"); err != nil {
			t.Fatal("unrelated organization revoked", err)
		}
	}
	// Reapplying additive schema or repeating registration never resurrects access.
	if _, err := db.Exec(ctx, platformdirectory.Schema); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Register(ctx, directoryFixture("alfa")); err != nil {
		t.Fatal(err)
	}
	if _, err := clients["clips-alfa"].Resolve(ctx, "clips-alfa", "local-owner"); !errors.Is(err, access.ErrDenied) {
		t.Fatal("migration or retry resurrected access", err)
	}
	for _, change := range []platformdirectory.Change{
		{Kind: "entitlement", OrganizationID: beta.OrganizationID, Solution: "social", Enabled: false, ExpectedRevision: 1, Reason: "Lab product disabled"},
		{Kind: "customer", ID: beta.CustomerID, Enabled: false, ExpectedRevision: 1, Reason: "Lab customer disabled"},
	} {
		if _, err := store.Change(ctx, change); err != nil {
			t.Fatal(err)
		}
		if change.Kind == "entitlement" {
			if _, err := clients["social-beta"].Resolve(ctx, "social-beta", "local-owner"); !errors.Is(err, access.ErrDenied) {
				t.Fatal("disabled product retained identity access", err)
			}
			if _, err := clients["finance-beta"].Resolve(ctx, "finance-beta", "local-owner"); err != nil {
				t.Fatal("unrelated product affected", err)
			}
			req := httptest.NewRequest("GET", "/integration/v1/events?source=clips", nil)
			req.Header.Set("Authorization", "Bearer "+credentials["social-beta"].Token)
			req.Header.Set("X-Organization-ID", beta.OrganizationID)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)
			if rec.Code != 403 {
				t.Fatal("disabled service retained event access", rec.Code)
			}
		}
	}
	if _, err := clients["social-beta"].Resolve(ctx, "social-beta", "local-owner"); !errors.Is(err, access.ErrDenied) {
		t.Fatal("disabled customer/product retained access", err)
	}
	if err := db.QueryRow(ctx, `SELECT count(*) FROM platform_directory.audit`).Scan(&count); err != nil || count < 6 {
		t.Fatal("missing audit records", count, err)
	}
}

func TestClipsDirectoryAdoptionKeepsLocalOwnershipAndBoundsRole(t *testing.T) {
	db := identityTestDB(t)
	ctx := context.Background()
	identity, err := provisionNative(ctx, db, strings.NewReader(`{"email":"directory@bilhon.com","password":"fictitious-password","display_name":"Directory lab","organization":"bilhon-homolog"}`))
	if err != nil {
		t.Fatal(err)
	}
	store := platformdirectory.Store{DB: db}
	in := platformdirectory.Registration{Namespace: "native-lab", Key: "adopt-clips", CustomerReference: "bilhon", OrganizationReference: "main", Name: "Bilhon fictício", ExistingOrganizationID: identity.OrganizationID,
		Members: []platformdirectory.MemberInput{{Reference: "student", Name: "Student"}}, Products: []platformdirectory.ProductInput{{Solution: "clips", Backend: "clips-lab", LocalOrganizationID: identity.WorkspaceID, Grants: []platformdirectory.GrantInput{{PersonReference: "student", LocalActorID: identity.ID, Role: "viewer"}}}}}
	registered, err := store.Register(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	plain := identityAuth{db: db, origin: hostedOrigin}
	strict := plain
	strict.directoryBackend = "clips-lab"
	// Same browser cookie and same project owner survive opt-in adoption.
	mux := http.NewServeMux()
	mux.HandleFunc("POST /app/probe", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
	login := httptest.NewRecorder()
	plain.issueSession(ctx, login, httptest.NewRequest("POST", hostedOrigin+"/auth/login", nil), identity)
	if login.Code != 200 {
		t.Fatal(login.Body.String())
	}
	cookie := login.Result().Cookies()[0]
	call := func(method, path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, hostedOrigin+path, nil)
		req.AddCookie(cookie)
		rec := httptest.NewRecorder()
		strict.protect(mux, "team-secret").ServeHTTP(rec, req)
		return rec
	}
	res := call("GET", "/auth/me")
	if res.Code != 200 {
		t.Fatal(res.Code, res.Body.String())
	}
	var got customerIdentity
	if err := json.Unmarshal(res.Body.Bytes(), &got); err != nil || got.ID != identity.ID || got.WorkspaceID != identity.WorkspaceID || got.Platform == nil || got.Platform.PersonID != registered.People["student"] {
		t.Fatal("local ownership changed", got, err)
	}
	if call("POST", "/app/probe").Code != 403 {
		t.Fatal("directory viewer could mutate")
	}
	if _, err := store.Change(ctx, platformdirectory.Change{Kind: "grant", OrganizationID: registered.OrganizationID, PersonID: registered.People["student"], Solution: "clips", Role: "operator", Enabled: true, ExpectedRevision: 1, Reason: "Lab operator granted"}); err != nil {
		t.Fatal(err)
	}
	if call("POST", "/app/probe").Code != 204 {
		t.Fatal("role not refreshed")
	}
	if _, err := store.Change(ctx, platformdirectory.Change{Kind: "person", ID: registered.People["student"], Enabled: false, ExpectedRevision: 1, Reason: "Lab person disabled"}); err != nil {
		t.Fatal(err)
	}
	if call("GET", "/auth/me").Code != 403 {
		t.Fatal("disabled global identity retained cookie access")
	}
	if call("POST", "/auth/logout").Code != 204 {
		t.Fatal("revoked user could not log out")
	}
	// Adoption is optional; absent mappings fail closed when it is enabled.
	strict.directoryBackend = "unregistered-backend"
	newLogin := httptest.NewRecorder()
	strict.issueSession(ctx, newLogin, httptest.NewRequest("POST", hostedOrigin+"/auth/login", nil), identity)
	if newLogin.Code != 403 || len(newLogin.Result().Cookies()) != 0 {
		t.Fatal("unmapped directory user received a session")
	}
}
