package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"arkom/bia/internal/platformidentity"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed platform.sql
var platformSchema string

type nativeAccountInput struct {
	Email        string `json:"email"`
	Password     string `json:"password"`
	Name         string `json:"display_name"`
	Organization string `json:"organization"`
}

func provisionNative(ctx context.Context, db *pgxpool.Pool, input io.Reader) (customerIdentity, error) {
	var req nativeAccountInput
	d := json.NewDecoder(io.LimitReader(input, 4096))
	d.DisallowUnknownFields()
	if err := d.Decode(&req); err != nil || d.Decode(new(any)) != io.EOF {
		return customerIdentity{}, errors.New("invalid native account document")
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Name = strings.TrimSpace(req.Name)
	address, err := mail.ParseAddress(req.Email)
	if err != nil || address.Address != req.Email || len(req.Email) > 254 || !strings.HasSuffix(req.Email, "@bilhon.com") || req.Name == "" || len(req.Name) > 120 || req.Organization != "bilhon-homolog" {
		return customerIdentity{}, errors.New("invalid native account or organization")
	}
	hash, err := platformidentity.HashPassword(req.Password)
	if err != nil {
		return customerIdentity{}, err
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		return customerIdentity{}, err
	}
	defer tx.Rollback(ctx)
	var identity customerIdentity
	identity.Provider = "local"
	// Refuse takeover/reset of an existing account; a repeat must prove the same password.
	var oldHash string
	err = tx.QueryRow(ctx, `SELECT a.id::text,a.email,a.display_name,w.id::text,a.source_user_id::text,c.password_hash,p.organization_id::text
		FROM customer_accounts a JOIN customer_workspaces w ON w.account_id=a.id JOIN native_credentials c ON c.account_id=a.id
		JOIN platform_access p ON p.account_id=a.id AND p.solution='clips' JOIN platform_organizations o ON o.id=p.organization_id
		WHERE a.email=$1 AND a.auth_provider='local' AND a.enabled AND o.slug=$2 AND p.enabled AND o.enabled FOR UPDATE OF a`, req.Email, req.Organization).Scan(
		&identity.ID, &identity.Email, &identity.Name, &identity.WorkspaceID, &identity.SourceID, &oldHash, &identity.OrganizationID)
	if err == nil {
		if !platformidentity.PasswordMatches(req.Password, oldHash) {
			return customerIdentity{}, errors.New("existing account differs; no password was changed")
		}
		return identity, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return customerIdentity{}, err
	}
	var org string
	err = tx.QueryRow(ctx, `INSERT INTO platform_organizations(slug,name) VALUES('bilhon-homolog','Bilhon · Homologação')
		ON CONFLICT(slug) DO UPDATE SET slug=excluded.slug WHERE platform_organizations.enabled RETURNING id::text`).Scan(&org)
	if err != nil {
		return customerIdentity{}, err
	}
	identity.OrganizationID = org
	err = tx.QueryRow(ctx, `WITH new_id AS(SELECT gen_random_uuid() AS id)
		INSERT INTO customer_accounts(id,source_project,source_user_id,email,display_name,auth_provider)
		SELECT id,'arkom-local',id,$1,$2,'local' FROM new_id
		RETURNING id::text,email,display_name,source_user_id::text`, req.Email, req.Name).Scan(&identity.ID, &identity.Email, &identity.Name, &identity.SourceID)
	if err != nil {
		return customerIdentity{}, errors.New("account could not be created; existing accounts were preserved")
	}
	err = tx.QueryRow(ctx, `INSERT INTO customer_workspaces(account_id) VALUES($1) RETURNING id::text`, identity.ID).Scan(&identity.WorkspaceID)
	if err == nil {
		_, err = tx.Exec(ctx, `INSERT INTO native_credentials(account_id,password_hash) VALUES($1,$2)`, identity.ID, hash)
	}
	if err == nil {
		_, err = tx.Exec(ctx, `INSERT INTO platform_access(account_id,organization_id,solution) VALUES($1,$2,'clips')`, identity.ID, org)
	}
	if err != nil {
		return customerIdentity{}, err
	}
	return identity, tx.Commit(ctx)
}

func (a identityAuth) loginNative(w http.ResponseWriter, r *http.Request) {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		writeError(w, 415, "json_required")
		return
	}
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if d.Decode(&req) != nil || d.Decode(new(any)) != io.EOF || len(req.Email) > 254 || len(req.Password) > 256 {
		writeError(w, 401, "invalid_credentials")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	var attempts int
	err = a.db.QueryRow(ctx, `INSERT INTO native_login_limits(id,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes')
		ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN native_login_limits.reset_at<=now() THEN 1 ELSE native_login_limits.attempts+1 END,
		reset_at=CASE WHEN native_login_limits.reset_at<=now() THEN now()+interval '15 minutes' ELSE native_login_limits.reset_at END RETURNING attempts`, sessionHash(email)).Scan(&attempts)
	if err != nil {
		writeError(w, 503, "database_unavailable")
		return
	}
	if attempts > 10 {
		w.Header().Set("Retry-After", "900")
		writeError(w, 429, "login_retry_later")
		return
	}
	var identity customerIdentity
	var hash string
	err = a.db.QueryRow(ctx, `SELECT a.id::text,a.email,a.display_name,w.id::text,a.source_user_id::text
		,c.password_hash,p.organization_id::text FROM customer_accounts a JOIN customer_workspaces w ON w.account_id=a.id
		JOIN native_credentials c ON c.account_id=a.id
		JOIN platform_access p ON p.account_id=a.id AND p.solution='clips' JOIN platform_organizations o ON o.id=p.organization_id
		WHERE a.email=$1 AND a.auth_provider='local' AND a.enabled AND p.enabled AND o.enabled
		`, email).Scan(&identity.ID, &identity.Email, &identity.Name, &identity.WorkspaceID, &identity.SourceID, &hash, &identity.OrganizationID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 503, "database_unavailable")
		return
	}
	if hash == "" {
		hash = platformidentity.DummyPasswordHash
	}
	if !platformidentity.PasswordMatches(req.Password, hash) || identity.ID == "" {
		writeError(w, 401, "invalid_credentials")
		return
	}
	identity.Provider = "local"
	if _, err = a.db.Exec(ctx, `DELETE FROM native_login_limits WHERE id=$1 OR reset_at<now()-interval '1 day'`, sessionHash(email)); err != nil {
		writeError(w, 503, "database_unavailable")
		return
	}
	a.issueSession(ctx, w, r, identity)
}
