package main

import (
	access "arkom/bia/pkg/platformaccess"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed identity.sql
var identitySchema string

const sourceProject = "auytmefqnuzbktyzcled"
const hostedOrigin = "https://clipsgo-homolog.24-199-100-186.sslip.io"
const customerCookie = "__Host-clips_go_auth"
const customerSessionTTL = time.Hour

type sourceAccount struct {
	ID        string `json:"source_user_id"`
	Email     string `json:"email"`
	Name      string `json:"display_name"`
	Confirmed bool   `json:"email_confirmed"`
	Banned    bool   `json:"banned"`
	Deleted   bool   `json:"deleted"`
	Instances []struct {
		OrgID      string `json:"org_id"`
		InstanceID string `json:"instance_id"`
		Status     string `json:"status"`
	} `json:"clips_instances"`
}

type customerIdentity struct {
	ID             string            `json:"id"`
	SourceID       string            `json:"source_user_id"`
	Email          string            `json:"email"`
	Name           string            `json:"display_name"`
	WorkspaceID    string            `json:"workspace_id"`
	ExpiresAt      time.Time         `json:"session_expires_at"`
	Provider       string            `json:"auth_provider"`
	OrganizationID string            `json:"organization_id"`
	Platform       *access.Principal `json:"platform,omitempty"`
}

// Provisioning consumes only the SELECT result. Passwords, hashes, tokens, and
// other applications' data never enter this database.
func provisionCustomer(ctx context.Context, db *pgxpool.Pool, input io.Reader) (customerIdentity, error) {
	var source sourceAccount
	if err := json.NewDecoder(io.LimitReader(input, 16<<10)).Decode(&source); err != nil {
		return customerIdentity{}, errors.New("invalid source account document")
	}
	if !source.Confirmed || source.Banned || source.Deleted || len(source.Instances) != 1 ||
		source.Instances[0].Status != "active" || source.Email == "" || source.Name == "" ||
		source.ID == "" || source.Instances[0].OrgID == "" || source.Instances[0].InstanceID == "" {
		return customerIdentity{}, errors.New("one confirmed active CLIPS account is required")
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		return customerIdentity{}, err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `INSERT INTO customer_accounts(source_project,source_user_id,email,display_name)
		VALUES($1,$2,$3,$4) ON CONFLICT(source_project,source_user_id) DO NOTHING`,
		sourceProject, source.ID, strings.ToLower(source.Email), source.Name)
	if err != nil {
		return customerIdentity{}, err
	}
	var identity customerIdentity
	identity.SourceID = source.ID
	identity.Provider = "supabase"
	err = tx.QueryRow(ctx, `SELECT id::text,email,display_name FROM customer_accounts
		WHERE source_project=$1 AND source_user_id=$2 AND email=$3 AND enabled FOR UPDATE`,
		sourceProject, source.ID, strings.ToLower(source.Email)).Scan(&identity.ID, &identity.Email, &identity.Name)
	if err != nil {
		return customerIdentity{}, errors.New("account mapping conflict; no account was changed")
	}
	i := source.Instances[0]
	_, err = tx.Exec(ctx, `INSERT INTO customer_workspaces(account_id,source_org_id,source_instance_id)
		VALUES($1,$2,$3) ON CONFLICT(account_id) DO NOTHING`, identity.ID, i.OrgID, i.InstanceID)
	if err != nil {
		return customerIdentity{}, err
	}
	err = tx.QueryRow(ctx, `SELECT id::text FROM customer_workspaces
		WHERE account_id=$1 AND source_org_id=$2 AND source_instance_id=$3`, identity.ID, i.OrgID, i.InstanceID).Scan(&identity.WorkspaceID)
	if err != nil {
		return customerIdentity{}, errors.New("workspace mapping conflict; no account was changed")
	}
	identity.OrganizationID = identity.WorkspaceID
	_, err = tx.Exec(ctx, `INSERT INTO platform_organizations(id,slug,name) VALUES($1::uuid,'clips-'||($1::uuid)::text,'CLIPS homologação') ON CONFLICT(id) DO NOTHING`, identity.WorkspaceID)
	if err == nil {
		_, err = tx.Exec(ctx, `INSERT INTO platform_access(account_id,organization_id,solution) VALUES($1,$2,'clips') ON CONFLICT DO NOTHING`, identity.ID, identity.WorkspaceID)
	}
	if err != nil {
		return customerIdentity{}, err
	}
	return identity, tx.Commit(ctx)
}

type sourceUser struct {
	ID               string  `json:"id"`
	Email            string  `json:"email"`
	EmailConfirmedAt *string `json:"email_confirmed_at"`
	IsAnonymous      bool    `json:"is_anonymous"`
}

type identityAuth struct {
	db               *pgxpool.Pool
	providerURL      string
	publishable      string
	origin           string
	client           *http.Client
	throttle         *authThrottle
	directoryBackend string
	remixBackend     string
}

// The pilot has one enabled customer. Bound public exchanges before contacting
// the shared identity provider, including attempts with fabricated JWTs.
type authThrottle struct {
	mu   sync.Mutex
	next time.Time
	busy bool
}

func (l *authThrottle) acquire() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.busy || time.Now().Before(l.next) {
		return false
	}
	l.busy = true
	l.next = time.Now().Add(6 * time.Second)
	return true
}

func (l *authThrottle) release() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.busy = false
}

var errInvalidSourceSession = errors.New("invalid source session")

// Validate at the fixed Supabase Auth server. Merely decoding client JWT claims
// is insufficient; neither an email string nor an unsigned JWT grants access.
func (a identityAuth) verifySource(ctx context.Context, bearer string) (sourceUser, error) {
	if !strings.HasPrefix(bearer, "Bearer ") || len(bearer) > 8192 || strings.Count(bearer, ".") != 2 {
		return sourceUser{}, errInvalidSourceSession
	}
	req, err := http.NewRequestWithContext(ctx, "GET", a.providerURL+"/auth/v1/user", nil)
	if err != nil {
		return sourceUser{}, err
	}
	req.Header.Set("Authorization", bearer)
	req.Header.Set("apikey", a.publishable)
	res, err := a.client.Do(req)
	if err != nil {
		return sourceUser{}, errors.New("identity provider unavailable")
	}
	defer res.Body.Close()
	if res.StatusCode == 401 || res.StatusCode == 403 {
		return sourceUser{}, errInvalidSourceSession
	}
	if res.StatusCode != 200 {
		return sourceUser{}, errors.New("identity provider unavailable")
	}
	var user sourceUser
	if err := json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&user); err != nil {
		return sourceUser{}, errors.New("identity provider returned an invalid response")
	}
	if user.ID == "" || user.Email == "" || user.EmailConfirmedAt == nil || *user.EmailConfirmedAt == "" || user.IsAnonymous {
		return sourceUser{}, errInvalidSourceSession
	}
	return user, nil
}

type customerContextKey struct{}
type customerProfileKey struct{}

func sessionHash(value string) string { return fmt.Sprintf("%x", sha256.Sum256([]byte(value))) }

func (a identityAuth) readSession(ctx context.Context, r *http.Request) (customerIdentity, error) {
	cookie, err := r.Cookie(customerCookie)
	if err != nil || len(cookie.Value) != 43 {
		return customerIdentity{}, pgx.ErrNoRows
	}
	var identity customerIdentity
	err = a.db.QueryRow(ctx, `SELECT a.id::text,a.email,a.display_name,w.id::text,a.source_user_id::text,s.expires_at,a.auth_provider,p.organization_id::text
		FROM customer_sessions s JOIN customer_accounts a ON a.id=s.account_id
		JOIN customer_workspaces w ON w.account_id=a.id
		JOIN platform_access p ON p.account_id=a.id AND p.solution='clips' JOIN platform_organizations o ON o.id=p.organization_id
		WHERE s.token_hash=$1 AND s.expires_at>now() AND a.enabled AND p.enabled AND o.enabled`, sessionHash(cookie.Value)).Scan(
		&identity.ID, &identity.Email, &identity.Name, &identity.WorkspaceID, &identity.SourceID, &identity.ExpiresAt, &identity.Provider, &identity.OrganizationID)
	return identity, err
}

func (a identityAuth) createSession(w http.ResponseWriter, r *http.Request) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeError(w, 415, "json_required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	user, err := a.verifySource(ctx, r.Header.Get("Authorization"))
	if err != nil {
		status, code := 503, "identity_provider_unavailable"
		if errors.Is(err, errInvalidSourceSession) {
			status, code = 401, "invalid_source_session"
		}
		writeError(w, status, code)
		return
	}
	var identity customerIdentity
	err = a.db.QueryRow(ctx, `SELECT a.id::text,a.email,a.display_name,w.id::text,a.source_user_id::text,p.organization_id::text
		FROM customer_accounts a JOIN customer_workspaces w ON w.account_id=a.id
		JOIN platform_access p ON p.account_id=a.id AND p.solution='clips' JOIN platform_organizations o ON o.id=p.organization_id
		WHERE a.source_project=$1 AND a.source_user_id=$2 AND a.email=$3 AND a.enabled AND a.auth_provider='supabase' AND p.enabled AND o.enabled`,
		sourceProject, user.ID, strings.ToLower(user.Email)).Scan(&identity.ID, &identity.Email, &identity.Name, &identity.WorkspaceID, &identity.SourceID, &identity.OrganizationID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 403, "customer_not_enabled")
		return
	}
	if err != nil {
		writeError(w, 503, "database_unavailable")
		return
	}
	identity.Provider = "supabase"
	a.issueSession(ctx, w, r, identity)
}

func (a identityAuth) issueSession(ctx context.Context, w http.ResponseWriter, r *http.Request, identity customerIdentity) {
	var directoryErr error
	identity, directoryErr = a.applyDirectory(ctx, identity)
	if directoryErr != nil {
		directoryError(w, directoryErr)
		return
	}
	var secret [32]byte
	if _, err := rand.Read(secret[:]); err != nil {
		writeError(w, 503, "session_unavailable")
		return
	}
	value := base64.RawURLEncoding.EncodeToString(secret[:])
	tx, err := a.db.Begin(ctx)
	if err != nil {
		writeError(w, 503, "database_unavailable")
		return
	}
	defer tx.Rollback(ctx)
	// Serialize rotations for this account and bound sessions without disturbing
	// its other active devices during normal use.
	var enabled bool
	err = tx.QueryRow(ctx, `SELECT enabled FROM customer_accounts WHERE id=$1 FOR UPDATE`, identity.ID).Scan(&enabled)
	if err == nil && !enabled {
		writeError(w, 403, "customer_not_enabled")
		return
	}
	if err == nil {
		_, err = tx.Exec(ctx, `DELETE FROM customer_sessions WHERE expires_at<=now()`)
	}
	if err == nil {
		_, err = tx.Exec(ctx, `DELETE FROM customer_sessions WHERE token_hash IN
			(SELECT token_hash FROM customer_sessions WHERE account_id=$1 ORDER BY created_at DESC,token_hash OFFSET 9)`, identity.ID)
	}
	if err == nil {
		// Replace this browser's session while preserving other signed-in devices.
		if prior, cookieErr := r.Cookie(customerCookie); cookieErr == nil {
			_, err = tx.Exec(ctx, `DELETE FROM customer_sessions WHERE token_hash=$1 AND account_id=$2`, sessionHash(prior.Value), identity.ID)
		}
	}
	if err == nil {
		_, err = tx.Exec(ctx, `INSERT INTO customer_sessions(token_hash,account_id,expires_at)
			VALUES($1,$2,now()+interval '1 hour')`, sessionHash(value), identity.ID)
	}
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		writeError(w, 503, "database_unavailable")
		return
	}
	identity.ExpiresAt = time.Now().Add(customerSessionTTL)
	http.SetCookie(w, &http.Cookie{Name: customerCookie, Value: value, Path: "/", Secure: true,
		HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: int(customerSessionTTL.Seconds())})
	writeJSON(w, 200, identity)
}

func (a identityAuth) protect(next http.Handler, teamToken string) http.Handler {
	teamOnly := privateHostedAPI(next, teamToken)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if strings.HasPrefix(r.URL.Path, "/integration/") {
			next.ServeHTTP(w, r)
			return
		}
		if r.URL.Path == "/healthz" {
			teamOnly.ServeHTTP(w, r)
			return
		}
		if r.URL.Path == "/auth/config" && r.Method == "GET" {
			writeJSON(w, 200, map[string]any{"local_domains": []string{"bilhon.com"}, "remix_enabled": a.remixBackend != ""})
			return
		}
		if (r.Method == "GET" || r.Method == "HEAD") && interfacePath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" && r.Header.Get("Origin") != "" && r.Header.Get("Origin") != a.origin {
			writeError(w, 403, "origin_not_allowed")
			return
		}
		if (r.URL.Path == "/auth/session" || r.URL.Path == "/auth/login") && r.Method == "POST" {
			if a.throttle != nil {
				if !a.throttle.acquire() {
					w.Header().Set("Retry-After", "6")
					writeError(w, 429, "login_retry_later")
					return
				}
				defer a.throttle.release()
			}
			if r.URL.Path == "/auth/login" {
				a.loginNative(w, r)
			} else {
				a.createSession(w, r)
			}
			return
		}
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+teamToken)) == 1 {
			teamOnly.ServeHTTP(w, r)
			return
		}
		customerRoute := (r.URL.Path == "/auth/me" && r.Method == "GET") ||
			(r.URL.Path == "/auth/remix/continue" && r.Method == "POST") ||
			(r.URL.Path == "/auth/refresh" && r.Method == "POST") ||
			(r.URL.Path == "/auth/logout" && r.Method == "POST") ||
			(r.URL.Path == "/studio/jobs" && r.Method == "POST") ||
			(strings.HasPrefix(r.URL.Path, "/studio/jobs/") && (r.Method == "GET" || r.Method == "HEAD"))
		customerRoute = customerRoute || strings.HasPrefix(r.URL.Path, "/app/") || strings.HasPrefix(r.URL.Path, "/rest/v1/") || strings.HasPrefix(r.URL.Path, "/storage/v1/") || strings.HasPrefix(r.URL.Path, "/functions/v1/")
		if !customerRoute {
			teamOnly.ServeHTTP(w, r)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		identity, err := a.readSession(ctx, r)
		if err != nil {
			status, code := 503, "database_unavailable"
			if errors.Is(err, pgx.ErrNoRows) {
				status, code = 401, "customer_session_required"
			}
			writeError(w, status, code)
			return
		}
		if r.URL.Path != "/auth/logout" {
			identity, err = a.applyDirectory(ctx, identity)
			if err != nil {
				directoryError(w, err)
				return
			}
		}
		if r.URL.Path == "/auth/me" {
			writeJSON(w, 200, identity)
			return
		}
		if r.URL.Path == "/auth/remix/continue" {
			a.continueRemix(w, r, identity)
			return
		}
		if r.URL.Path == "/auth/refresh" {
			if identity.Provider != "local" {
				writeError(w, 403, "source_session_required")
				return
			}
			a.issueSession(ctx, w, r, identity)
			return
		}
		if r.URL.Path == "/auth/logout" {
			cookie, _ := r.Cookie(customerCookie)
			if err := a.logoutBrowserSession(ctx, sessionHash(cookie.Value)); err != nil {
				writeError(w, 503, "database_unavailable")
				return
			}
			http.SetCookie(w, &http.Cookie{Name: customerCookie, Value: "", Path: "/", Secure: true,
				HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: -1})
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if identity.Platform != nil && identity.Platform.Role == "viewer" && r.Method != "GET" && r.Method != "HEAD" {
			writeError(w, 403, "platform_read_only")
			return
		}
		// Stable ownership survives logout and the next verified sign-in. Do not use
		// user-controlled legacy cookies or headers to resolve a customer's workspace.
		ctx = context.WithValue(r.Context(), customerContextKey{}, "customer:"+identity.ID)
		ctx = context.WithValue(ctx, customerProfileKey{}, identity)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
