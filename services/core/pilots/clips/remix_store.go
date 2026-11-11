package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	_ "embed"
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"time"

	"arkom/bia/internal/platformdirectory"
	access "arkom/bia/pkg/platformaccess"
	"github.com/jackc/pgx/v5"
)

//go:embed remix.sql
var remixSchema string

const remixCookie = "__Host-clips_remix_request"
const remixAccessPrefix = "clips_remix_access_"
const remixRefreshPrefix = "clips_remix_refresh_"

var remixProof = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
var remixVerifier = regexp.MustCompile(`^[A-Za-z0-9._~-]{43,128}$`)
var errRemixRequestExpired = errors.New("remix_request_expired")

type remixHost struct {
	auth    identityAuth
	backend string
}
type remixTokens struct {
	Access         string           `json:"access_token"`
	Refresh        string           `json:"refresh_token"`
	ExpiresIn      int              `json:"expires_in"`
	InstallationID string           `json:"installation_id"`
	Identity       customerIdentity `json:"identity"`
}

func remixSecret() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}
func remixChallenge(v string) string {
	b := sha256.Sum256([]byte(v))
	return base64.RawURLEncoding.EncodeToString(b[:])
}

func (h remixHost) installation(ctx context.Context, id string) (platformdirectory.Installation, error) {
	return h.installationQuery(ctx, h.auth.db, id)
}
func (h remixHost) installationQuery(ctx context.Context, q platformdirectory.RowQuerier, id string) (platformdirectory.Installation, error) {
	i, err := platformdirectory.InstallationQuery(ctx, q, id)
	if err != nil {
		return i, err
	}
	if i.Solution != "clips" || i.Backend != h.backend || i.APIURL != h.auth.origin {
		return i, access.ErrDenied
	}
	return i, nil
}

// Authentication and the directory binding are both revalidated; a platform
// identifier alone cannot select a local workspace or impersonate an account.
func (h remixHost) account(ctx context.Context, i platformdirectory.Installation, accountID string) (customerIdentity, error) {
	return h.accountQuery(ctx, h.auth.db, i, accountID)
}
func (h remixHost) accountQuery(ctx context.Context, q platformdirectory.RowQuerier, i platformdirectory.Installation, accountID string) (customerIdentity, error) {
	var out customerIdentity
	err := q.QueryRow(ctx, `SELECT a.id::text,a.source_user_id::text,a.email,a.display_name,a.auth_provider,w.id::text,p.organization_id::text
 FROM customer_accounts a JOIN customer_workspaces w ON w.account_id=a.id
 JOIN platform_access p ON p.account_id=a.id AND p.solution='clips' JOIN platform_organizations o ON o.id=p.organization_id
 WHERE a.id=$1 AND a.enabled AND p.enabled AND o.enabled AND p.organization_id=$2`, accountID, i.OrganizationID).Scan(&out.ID, &out.SourceID, &out.Email, &out.Name, &out.Provider, &out.WorkspaceID, &out.OrganizationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, access.ErrDenied
	}
	if err != nil {
		return out, err
	}
	p, err := platformdirectory.ResolveLocalQuery(ctx, q, i.Backend, "clips", out.WorkspaceID, out.ID)
	if err != nil {
		return out, err
	}
	if p.OrganizationID != i.OrganizationID {
		return out, access.ErrDenied
	}
	out.Platform = &p
	return out, nil
}

func (h remixHost) createRequest(ctx context.Context, i platformdirectory.Installation, state, challenge string) (string, error) {
	if !remixProof.MatchString(state) || !remixProof.MatchString(challenge) {
		return "", platformdirectory.ErrInvalid
	}
	request, err := remixSecret()
	if err != nil {
		return "", err
	}
	_, err = h.auth.db.Exec(ctx, `INSERT INTO remix_authorizations(request_hash,installation_id,state,challenge,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')`, sessionHash(request), i.ID, state, challenge)
	return request, err
}

func (h remixHost) completeRequest(ctx context.Context, request string, identity customerIdentity, parent string) (string, error) {
	if !remixProof.MatchString(request) {
		return "", access.ErrDenied
	}
	tx, err := h.auth.db.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var installationID, state string
	err = tx.QueryRow(ctx, `SELECT installation_id::text,state FROM remix_authorizations WHERE request_hash=$1 AND expires_at>now() AND completed_at IS NULL FOR UPDATE`, sessionHash(request)).Scan(&installationID, &state)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errRemixRequestExpired
	}
	if err != nil {
		return "", err
	}
	i, err := h.installationQuery(ctx, tx, installationID)
	if err != nil {
		return "", err
	}
	if _, err = h.accountQuery(ctx, tx, i, identity.ID); err != nil {
		return "", err
	}
	code, err := remixSecret()
	if err != nil {
		return "", err
	}
	_, err = tx.Exec(ctx, `UPDATE remix_authorizations SET completed_at=now(),code_hash=$2,account_id=$3,parent_session_hash=$4,code_expires_at=LEAST(expires_at,now()+interval '1 minute') WHERE request_hash=$1`, sessionHash(request), sessionHash(code), identity.ID, parent)
	if err != nil {
		return "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", err
	}
	return i.Origin + "/login#" + url.Values{"clips_code": {code}, "state": {state}}.Encode(), nil
}

func (h remixHost) mint(ctx context.Context, tx pgx.Tx, i platformdirectory.Installation, sessionID string, identity customerIdentity, expires time.Time) (remixTokens, error) {
	var out remixTokens
	a, err := remixSecret()
	if err != nil {
		return out, err
	}
	refresh, err := remixSecret()
	if err != nil {
		return out, err
	}
	deadline := time.Now().Add(10 * time.Minute)
	if expires.Before(deadline) {
		deadline = expires
	}
	out = remixTokens{Access: remixAccessPrefix + a, Refresh: remixRefreshPrefix + refresh, ExpiresIn: int(time.Until(deadline).Seconds()), InstallationID: i.ID, Identity: identity}
	if out.ExpiresIn < 1 {
		return remixTokens{}, access.ErrDenied
	}
	out.Identity.ExpiresAt = deadline
	_, err = tx.Exec(ctx, `INSERT INTO remix_access_tokens(hash,session_id,expires_at) VALUES($1,$2,$3)`, sessionHash(out.Access), sessionID, deadline)
	if err == nil {
		_, err = tx.Exec(ctx, `INSERT INTO remix_refresh_tokens(hash,session_id) VALUES($1,$2)`, sessionHash(out.Refresh), sessionID)
	}
	return out, err
}

func (h remixHost) exchange(ctx context.Context, i platformdirectory.Installation, code, verifier, state string) (remixTokens, error) {
	var out remixTokens
	if !remixProof.MatchString(code) || !remixProof.MatchString(state) || !remixVerifier.MatchString(verifier) {
		return out, access.ErrDenied
	}
	tx, err := h.auth.db.Begin(ctx)
	if err != nil {
		return out, err
	}
	defer tx.Rollback(ctx)
	var account, parent, challenge, storedState string
	err = tx.QueryRow(ctx, `SELECT account_id::text,parent_session_hash,challenge,state FROM remix_authorizations
 WHERE code_hash=$1 AND installation_id=$2 AND consumed_at IS NULL AND code_expires_at>now() FOR UPDATE`, sessionHash(code), i.ID).Scan(&account, &parent, &challenge, &storedState)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, access.ErrDenied
	}
	if err != nil {
		return out, err
	}
	if subtle.ConstantTimeCompare([]byte(challenge), []byte(remixChallenge(verifier))) != 1 || subtle.ConstantTimeCompare([]byte(state), []byte(storedState)) != 1 {
		return out, access.ErrDenied
	}
	identity, err := h.accountQuery(ctx, tx, i, account)
	if err != nil {
		return out, err
	}
	var expires time.Time
	err = tx.QueryRow(ctx, `SELECT expires_at FROM customer_sessions WHERE token_hash=$1 AND account_id=$2 AND expires_at>now()`, parent, account).Scan(&expires)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, access.ErrDenied
	}
	if err != nil {
		return out, err
	}
	// Bound concurrent sessions for this account and installation.
	if _, err = tx.Exec(ctx, `SELECT id FROM customer_accounts WHERE id=$1 FOR UPDATE`, account); err != nil {
		return out, err
	}
	_, err = tx.Exec(ctx, `UPDATE remix_sessions SET revoked_at=now() WHERE id IN(SELECT id FROM remix_sessions WHERE account_id=$1 AND installation_id=$2 AND revoked_at IS NULL ORDER BY created_at DESC OFFSET 9)`, account, i.ID)
	if err != nil {
		return out, err
	}
	var sessionID string
	err = tx.QueryRow(ctx, `INSERT INTO remix_sessions(installation_id,account_id,parent_session_hash,expires_at) VALUES($1,$2,$3,$4) RETURNING id::text`, i.ID, account, parent, expires).Scan(&sessionID)
	if err == nil {
		_, err = tx.Exec(ctx, `UPDATE remix_authorizations SET consumed_at=now() WHERE code_hash=$1`, sessionHash(code))
	}
	if err != nil {
		return out, err
	}
	out, err = h.mint(ctx, tx, i, sessionID, identity, expires)
	if err != nil {
		return out, err
	}
	return out, tx.Commit(ctx)
}

func (h remixHost) authenticate(ctx context.Context, i platformdirectory.Installation, token string) (customerIdentity, string, error) {
	var identity customerIdentity
	if len(token) != len(remixAccessPrefix)+43 || token[:len(remixAccessPrefix)] != remixAccessPrefix {
		return identity, "", access.ErrDenied
	}
	var account, sessionID string
	var expires time.Time
	err := h.auth.db.QueryRow(ctx, `SELECT s.account_id::text,s.id::text,t.expires_at FROM remix_access_tokens t JOIN remix_sessions s ON s.id=t.session_id
 WHERE t.hash=$1 AND s.installation_id=$2 AND t.expires_at>now() AND s.expires_at>now() AND s.revoked_at IS NULL`, sessionHash(token), i.ID).Scan(&account, &sessionID, &expires)
	if errors.Is(err, pgx.ErrNoRows) {
		return identity, "", access.ErrDenied
	}
	if err != nil {
		return identity, "", err
	}
	identity, err = h.account(ctx, i, account)
	identity.ExpiresAt = expires
	return identity, sessionID, err
}

func (h remixHost) refresh(ctx context.Context, i platformdirectory.Installation, token string) (remixTokens, error) {
	var out remixTokens
	if len(token) != len(remixRefreshPrefix)+43 || token[:len(remixRefreshPrefix)] != remixRefreshPrefix {
		return out, access.ErrDenied
	}
	tx, err := h.auth.db.Begin(ctx)
	if err != nil {
		return out, err
	}
	defer tx.Rollback(ctx)
	var id, account string
	var expires time.Time
	var consumed *time.Time
	err = tx.QueryRow(ctx, `SELECT s.id::text,s.account_id::text,s.expires_at,t.consumed_at FROM remix_refresh_tokens t JOIN remix_sessions s ON s.id=t.session_id
 WHERE t.hash=$1 AND s.installation_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() FOR UPDATE OF s,t`, sessionHash(token), i.ID).Scan(&id, &account, &expires, &consumed)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, access.ErrDenied
	}
	if err != nil {
		return out, err
	}
	if consumed != nil {
		if _, err = tx.Exec(ctx, `UPDATE remix_sessions SET revoked_at=now() WHERE id=$1`, id); err != nil {
			return out, err
		}
		if err = tx.Commit(ctx); err != nil {
			return out, err
		}
		return out, access.ErrDenied
	}
	identity, err := h.accountQuery(ctx, tx, i, account)
	if err != nil {
		return out, err
	}
	_, err = tx.Exec(ctx, `UPDATE remix_refresh_tokens SET consumed_at=now() WHERE hash=$1`, sessionHash(token))
	if err != nil {
		return out, err
	}
	out, err = h.mint(ctx, tx, i, id, identity, expires)
	if err != nil {
		return out, err
	}
	return out, tx.Commit(ctx)
}

func (h remixHost) logout(ctx context.Context, sessionID string) error {
	tx, err := h.auth.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var parent string
	err = tx.QueryRow(ctx, `UPDATE remix_sessions SET revoked_at=now() WHERE id=$1 RETURNING parent_session_hash`, sessionID).Scan(&parent)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE remix_sessions SET revoked_at=now() WHERE parent_session_hash=$1 AND revoked_at IS NULL`, parent); err != nil {
		return err
	}
	// End only the CLIPS browser login that created this entry. Other products'
	// sessions and the user's other devices are not reset.
	if _, err = tx.Exec(ctx, `DELETE FROM customer_sessions WHERE token_hash=$1`, parent); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func clearRemixCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: remixCookie, Value: "", Path: "/", HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, MaxAge: -1})
}
