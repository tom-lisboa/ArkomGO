package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRegisteredCompaniesAreProvisionedAndPersistSeparately(t *testing.T) {
	t.Setenv("ARKOM_LOCAL_DEMO", "true")
	t.Setenv("SDR_CRM_DEV_ENABLED", "true")
	t.Setenv("ARKOM_PLATFORM_REQUIRE_LOGIN", "true")

	dir := t.TempDir()
	provisioner := filepath.Join(dir, "provision")
	if err := os.WriteFile(provisioner, []byte("#!/bin/sh\ncat >/dev/null\n"), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ARKOM_SIGNUP_PROVISIONER", provisioner)
	path := filepath.Join(dir, "state.sqlite")
	a, _, err := newApp(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = a.Close() }()
	call := func(method, path, body, bearer string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.RemoteAddr = "127.0.0.1:54321"
		r.Header.Set("Content-Type", "application/json")
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		w := httptest.NewRecorder()
		a.Handler().ServeHTTP(w, r)
		return w
	}
	const auth = "/v1/platform/auth/"
	const secret = "password-for-this-test"
	login := func(email, expectedName string, status int) (User, string) {
		t.Helper()
		body, _ := json.Marshal(map[string]string{"email": email, "password": secret})
		res := call(http.MethodPost, auth+"login", string(body), "")
		if res.Code != status {
			t.Fatalf("login returned %d", res.Code)
		}
		var result struct {
			Identity User
			Token    string `json:"access_token"`
			Name     string `json:"company_name"`
		}
		if status == 200 && (json.Unmarshal(res.Body.Bytes(), &result) != nil || result.Name != expectedName || result.Token == "") {
			t.Fatal("wrong account context")
		}
		return result.Identity, result.Token
	}
	emails := []string{"first@example.test", "second@example.test"}
	names := []string{"Primeira Empresa", "Segunda Empresa"}
	var users []User
	for i, email := range emails {
		body, _ := json.Marshal(map[string]string{"email": email, "password": secret,
			"company": names[i], "description": "Contexto de teste de " + names[i], "timezone": "America/Cuiaba"})
		if result := call(http.MethodPost, auth+"signup", string(body), ""); result.Code != 202 || len(result.Result().Cookies()) != 0 {
			t.Fatalf("signup returned %d before preparation", result.Code)
		}
		if result := call(http.MethodPost, auth+"signup", string(body), ""); result.Code != 409 {
			t.Fatalf("duplicate signup returned %d", result.Code)
		}
		login(email, "", 202)
		a.provisionPlatformSignup(t.Context())
		org, access := login(email, names[i], 200)
		users = append(users, org)
		context := call(http.MethodGet, "/v1/core/solutions/sdr/context", "", access)
		if context.Code != 200 || !strings.Contains(context.Body.String(), names[i]) || strings.Contains(context.Body.String(), names[1-i]) {
			t.Fatal("SDR received the wrong company context")
		}
		if len(a.state.HomologCRMs[org.Org].Pipelines) != 1 {
			t.Fatal("CRM pipeline was not provisioned")
		}
	}
	if users[0].Org == users[1].Org || users[0].ID == users[1].ID {
		t.Fatal("different registrations share an identity")
	}
	if err := a.Close(); err != nil {
		t.Fatal(err)
	}
	a, _, err = newApp(path)
	if err != nil {
		t.Fatal(err)
	}
	if a.state.Signups[emails[0]].Ready != true || a.state.Signups[emails[1]].Ready != true {
		t.Fatal("signup readiness was lost after restart")
	}
	_, first := login(emails[0], names[0], 200)
	_, second := login(emails[1], names[1], 200)
	created := call(http.MethodPost, "/v1/sdr/crm/contacts.create", `{"name":"Contato de teste","email":"contact@example.test"}`, first)
	var contact map[string]string
	_ = json.Unmarshal(created.Body.Bytes(), &contact)
	if created.Code != 201 || contact["conversationId"] == "" {
		t.Fatalf("CRM create contact returned %d", created.Code)
	}
	route := "/v1/sdr/conversations/" + contact["conversationId"]
	if call(http.MethodGet, route, "", first).Code != 200 || call(http.MethodGet, route, "", second).Code != 404 {
		t.Fatal("CRM conversation crosses organization boundaries")
	}
}
