package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestGIFCredentialsAndGrantIsolation(t *testing.T) {
	ctx := context.Background()
	db := identityTestDB(t)
	if _, err := db.Exec(ctx, gifSchema); err != nil {
		t.Fatal(err)
	}
	account := func(email string) customerIdentity {
		t.Helper()
		identity, err := provisionNative(ctx, db, strings.NewReader(fmt.Sprintf(
			`{"email":%q,"password":"synthetic-local-password","display_name":"GIF test","organization":"bilhon-homolog"}`, email)))
		if err != nil {
			t.Fatal(err)
		}
		return identity
	}
	aluno := account("gif-aluno@bilhon.com")
	other := account("gif-other@bilhon.com")
	q := queue{db: db, gifs: testGIFConfig(t)}
	mux := http.NewServeMux()
	q.mountGIF(mux)
	request := func(user customerIdentity, method, path, input string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(input))
		if user.ID != "" {
			req = req.WithContext(context.WithValue(req.Context(), customerProfileKey{}, user))
		}
		resp := httptest.NewRecorder()
		mux.ServeHTTP(resp, req)
		return resp
	}
	if resp := request(customerIdentity{}, "GET", "/app/gifs", ""); resp.Code != 401 {
		t.Fatalf("unauthenticated status = %d", resp.Code)
	}
	const key = "sk-test-not-a-real-customer-key"
	if resp := request(other, "PUT", "/app/gifs/key", fmt.Sprintf(`{"key":%q}`, key)); resp.Code != 204 {
		t.Fatalf("save key: %d %s", resp.Code, resp.Body)
	}
	if stored := q.gifJobKey(ctx, other.ID, false); stored != key {
		t.Fatal("could not decrypt the customer's key")
	}
	var sealed []byte
	if err := db.QueryRow(ctx, `SELECT encrypted_key FROM gif_keys WHERE account_id=$1`, other.ID).Scan(&sealed); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(sealed), key) {
		t.Fatal("stored customer key in plaintext")
	}
	const gift = `{"prompt":"Robô acenando","gift":true}`
	if err := setGIFGrant(ctx, db, strings.NewReader(fmt.Sprintf(
		`{"email":%q,"remaining":2,"expires_at":%q}`, aluno.Email, time.Now().Add(time.Hour).Format(time.RFC3339)))); err != nil {
		t.Fatal(err)
	}
	if resp := request(other, "POST", "/app/gifs", gift); resp.Code != 409 {
		t.Fatalf("another account used the gift: %d", resp.Code)
	}
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes <- request(aluno, "POST", "/app/gifs", gift).Code
		}()
	}
	wg.Wait()
	first, second := <-codes, <-codes
	if first+second != 202+409 || first == second {
		t.Fatalf("unexpected concurrent responses: %d and %d", first, second)
	}
	var remaining int
	if err := db.QueryRow(ctx, `SELECT remaining FROM gif_grants WHERE account_id=$1`, aluno.ID).Scan(&remaining); err != nil || remaining != 1 {
		t.Fatalf("gift balance after concurrent requests: %d, %v", remaining, err)
	}
	var id string
	if err := db.QueryRow(ctx, `UPDATE gif_jobs SET status='done',image='GIF89a'::bytea WHERE account_id=$1 RETURNING id`, aluno.ID).Scan(&id); err != nil {
		t.Fatal(err)
	}
	path := "/app/gifs/" + id + "/image"
	if resp := request(other, "GET", path, ""); resp.Code != 404 {
		t.Fatalf("another account downloaded the GIF: %d", resp.Code)
	}
	if resp := request(aluno, "GET", path, ""); resp.Code != 200 || resp.Body.String() != "GIF89a" {
		t.Fatalf("owner GIF download failed: %d", resp.Code)
	}
	if _, err := db.Exec(ctx, `UPDATE gif_grants SET expires_at=now() WHERE account_id=$1`, aluno.ID); err != nil {
		t.Fatal(err)
	}
	if resp := request(aluno, "POST", "/app/gifs", gift); resp.Code != 409 {
		t.Fatalf("expired gift was accepted: %d", resp.Code)
	}
	if resp := request(other, "DELETE", "/app/gifs/key", ""); resp.Code != 204 || q.gifJobKey(ctx, other.ID, false) != "" {
		t.Fatalf("customer key removal failed: %d", resp.Code)
	}
}

func testGIFConfig(t *testing.T) *gifConfig {
	t.Helper()
	block, err := aes.NewCipher(make([]byte, 32))
	if err != nil {
		t.Fatal(err)
	}
	seal, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatal(err)
	}
	return &gifConfig{seal: seal, platformKey: "test-platform-key"}
}
