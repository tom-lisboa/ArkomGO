package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNativeLoginIsIndependentAndScoped(t *testing.T) {
	db := identityTestDB(t)
	ctx := context.Background()
	fixture := `{"email":"native-test@bilhon.com","password":"synthetic-local-password","display_name":"Aluno de teste","organization":"bilhon-homolog"}`
	identity, err := provisionNative(ctx, db, strings.NewReader(fixture))
	if err != nil {
		t.Fatal(err)
	}
	second, err := provisionNative(ctx, db, strings.NewReader(fixture))
	if err != nil || second != identity {
		t.Fatal("native provisioning is not repeatable", err)
	}
	if _, err := provisionNative(ctx, db, strings.NewReader(strings.Replace(fixture, "synthetic-local-password", "another-local-password", 1))); err == nil {
		t.Fatal("provisioning reset a password")
	}
	if _, err := provisionNative(ctx, db, strings.NewReader(strings.Replace(fixture, "bilhon-homolog", "another-organization", 1))); err == nil {
		t.Fatal("provisioning accepted a different organization")
	}
	var hash string
	if err := db.QueryRow(ctx, `SELECT password_hash FROM native_credentials WHERE account_id=$1`, identity.ID).Scan(&hash); err != nil || strings.Contains(hash, "synthetic-local-password") {
		t.Fatal("password was not hashed", err)
	}
	auth := identityAuth{db: db, providerURL: "http://127.0.0.1:1", origin: hostedOrigin}
	handler := auth.protect(http.NotFoundHandler(), strings.Repeat("t", 48))
	request := func(method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, hostedOrigin+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", hostedOrigin)
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	for _, body := range []string{`{"email":"native-test@bilhon.com","password":"wrong"}`, `{"email":"absent@bilhon.com","password":"wrong"}`} {
		if r := request("POST", "/auth/login", body, nil); r.Code != 401 {
			t.Fatal("invalid local login accepted", r.Code)
		}
	}
	r := request("POST", "/auth/login", `{"email":" NATIVE-TEST@bilhon.com ","password":"synthetic-local-password"}`, nil)
	if r.Code != 200 || len(r.Result().Cookies()) != 1 {
		t.Fatal("native login failed", r.Code, r.Body.String())
	}
	var profile customerIdentity
	_ = json.Unmarshal(r.Body.Bytes(), &profile)
	if profile.Provider != "local" || profile.OrganizationID != identity.OrganizationID || profile.WorkspaceID != identity.WorkspaceID {
		t.Fatal("local identity mapping changed")
	}
	cookie := r.Result().Cookies()[0]
	if request("GET", "/auth/me", "", cookie).Code != 200 {
		t.Fatal("local session was not accepted")
	}
	refreshed := request("POST", "/auth/refresh", "{}", cookie)
	if refreshed.Code != 200 || len(refreshed.Result().Cookies()) != 1 {
		t.Fatal("native refresh failed")
	}
	if request("GET", "/auth/me", "", cookie).Code != 401 {
		t.Fatal("old cookie survived refresh")
	}
	cookie = refreshed.Result().Cookies()[0]
	if request("GET", "/ops/status", "", cookie).Code != 401 {
		t.Fatal("local member gained operator access")
	}
	_, err = db.Exec(ctx, `UPDATE platform_access SET enabled=false WHERE account_id=$1`, identity.ID)
	if err != nil || request("GET", "/auth/me", "", cookie).Code != 401 || request("POST", "/auth/login", `{"email":"native-test@bilhon.com","password":"synthetic-local-password"}`, nil).Code != 401 {
		t.Fatal("revoked solution access remained active")
	}
}
