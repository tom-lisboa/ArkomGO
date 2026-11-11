package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"arkom/bia/internal/platformdirectory"
	access "arkom/bia/pkg/platformaccess"
	"github.com/jackc/pgx/v5"
)

func remixFailure(w http.ResponseWriter, err error) {
	if errors.Is(err, access.ErrDenied) || errors.Is(err, pgx.ErrNoRows) || errors.Is(err, errRemixRequestExpired) {
		writeError(w, 403, "remix_access_denied")
		return
	}
	if errors.Is(err, platformdirectory.ErrInvalid) {
		writeError(w, 400, "invalid_remix_request")
		return
	}
	writeError(w, 503, "remix_unavailable")
}
func remixDecode(w http.ResponseWriter, r *http.Request, out any) bool {
	if r.Header.Get("Content-Type") != "application/json" {
		writeError(w, 415, "json_required")
		return false
	}
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	d.DisallowUnknownFields()
	if d.Decode(out) != nil || d.Decode(new(any)) != io.EOF {
		writeError(w, 400, "invalid_remix_request")
		return false
	}
	return true
}
func (h remixHost) limit(w http.ResponseWriter, r *http.Request, id string) bool {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	var attempts int
	ip, _, splitErr := net.SplitHostPort(r.RemoteAddr)
	if splitErr != nil {
		ip = r.RemoteAddr
	}
	err := h.auth.db.QueryRow(ctx, `INSERT INTO remix_limits(id,attempts,reset_at) VALUES($1,1,now()+interval '1 minute')
 ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN remix_limits.reset_at<=now() THEN 1 ELSE remix_limits.attempts+1 END,
 reset_at=CASE WHEN remix_limits.reset_at<=now() THEN now()+interval '1 minute' ELSE remix_limits.reset_at END RETURNING attempts`, sessionHash(id+":"+ip+":"+r.URL.Path)).Scan(&attempts)
	if err != nil {
		writeError(w, 503, "remix_unavailable")
		return false
	}
	if attempts > 60 {
		w.Header().Set("Retry-After", "60")
		writeError(w, 429, "login_retry_later")
		return false
	}
	return true
}

func remixCORS(w http.ResponseWriter, r *http.Request, i platformdirectory.Installation) bool {
	w.Header().Add("Vary", "Origin")
	if r.Header.Get("Origin") != i.Origin {
		writeError(w, 403, "remix_origin_denied")
		return false
	}
	w.Header().Set("Access-Control-Allow-Origin", i.Origin)
	w.Header().Set("Access-Control-Expose-Headers", "Content-Length,Content-Range,Content-Disposition")
	if r.Method == "OPTIONS" {
		method := r.Header.Get("Access-Control-Request-Method")
		gifKeyWrite := method == "PUT" && r.URL.Path == "/app/gifs/key"
		if method != "GET" && method != "HEAD" && method != "POST" && method != "DELETE" && !gifKeyWrite {
			writeError(w, 403, "remix_method_denied")
			return false
		}
		allowed := map[string]bool{"authorization": true, "content-type": true, "x-clips-installation": true, "idempotency-key": true, "accept-profile": true, "content-profile": true, "prefer": true, "range": true, "x-client-info": true, "apikey": true, "x-upsert": true}
		for _, header := range strings.Split(r.Header.Get("Access-Control-Request-Headers"), ",") {
			if header = strings.ToLower(strings.TrimSpace(header)); header != "" && !allowed[header] {
				writeError(w, 403, "remix_header_denied")
				return false
			}
		}
		methods := "GET,HEAD,POST,DELETE"
		if r.URL.Path == "/app/gifs/key" {
			methods += ",PUT"
		}
		w.Header().Set("Access-Control-Allow-Methods", methods)
		w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Clips-Installation,Idempotency-Key,Accept-Profile,Content-Profile,Prefer,Range,X-Client-Info,Apikey,X-Upsert")
		w.Header().Set("Access-Control-Max-Age", "300")
		w.WriteHeader(204)
		return false
	}
	return true
}

func (h remixHost) public(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) != 5 || parts[0] != "remix" || parts[1] != "v1" || parts[2] != "installations" {
		writeError(w, 404, "not_found")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	i, err := h.installation(ctx, parts[3])
	if err != nil {
		remixFailure(w, err)
		return
	}
	if !remixCORS(w, r, i) {
		return
	}
	if !h.limit(w, r, i.ID) {
		return
	}
	switch parts[4] {
	case "bootstrap":
		if r.Method != "GET" {
			writeError(w, 405, "method_not_allowed")
			return
		}
		writeJSON(w, 200, i.Public())
	case "request":
		if r.Method != "POST" {
			writeError(w, 405, "method_not_allowed")
			return
		}
		var in struct {
			State     string `json:"state"`
			Challenge string `json:"challenge"`
			Method    string `json:"challenge_method"`
		}
		if !remixDecode(w, r, &in) {
			return
		}
		if in.Method != "S256" {
			writeError(w, 400, "pkce_required")
			return
		}
		request, err := h.createRequest(ctx, i, in.State, in.Challenge)
		if err != nil {
			remixFailure(w, err)
			return
		}
		writeJSON(w, 200, map[string]string{"authorization_url": h.auth.origin + "/remix/authorize?request=" + request})
	case "exchange":
		if r.Method != "POST" {
			writeError(w, 405, "method_not_allowed")
			return
		}
		var in struct {
			Code     string `json:"code"`
			State    string `json:"state"`
			Verifier string `json:"verifier"`
		}
		if !remixDecode(w, r, &in) {
			return
		}
		tokens, err := h.exchange(ctx, i, in.Code, in.Verifier, in.State)
		if err != nil {
			remixFailure(w, err)
			return
		}
		writeJSON(w, 200, tokens)
	case "refresh":
		if r.Method != "POST" {
			writeError(w, 405, "method_not_allowed")
			return
		}
		var in struct {
			Token string `json:"refresh_token"`
		}
		if !remixDecode(w, r, &in) {
			return
		}
		tokens, err := h.refresh(ctx, i, in.Token)
		if err != nil {
			remixFailure(w, err)
			return
		}
		writeJSON(w, 200, tokens)
	default:
		writeError(w, 404, "not_found")
	}
}

func (h remixHost) authorize(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, 405, "method_not_allowed")
		return
	}
	request := r.URL.Query().Get("request")
	if !remixProof.MatchString(request) {
		writeError(w, 400, "invalid_remix_request")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	var id string
	err := h.auth.db.QueryRow(ctx, `SELECT installation_id::text FROM remix_authorizations WHERE request_hash=$1 AND expires_at>now() AND completed_at IS NULL`, sessionHash(request)).Scan(&id)
	if err != nil {
		remixFailure(w, err)
		return
	}
	if _, err = h.installation(ctx, id); err != nil {
		remixFailure(w, err)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: remixCookie, Value: request, Path: "/", HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, MaxAge: 300})
	http.Redirect(w, r, "/login", http.StatusSeeOther)
}

func (a identityAuth) continueRemix(w http.ResponseWriter, r *http.Request, identity customerIdentity) {
	if a.remixBackend == "" {
		writeError(w, 404, "not_found")
		return
	}
	pending, err := r.Cookie(remixCookie)
	if err != nil {
		w.WriteHeader(204)
		return
	}
	parent, err := r.Cookie(customerCookie)
	if err != nil {
		writeError(w, 401, "customer_session_required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	next, err := (remixHost{auth: a, backend: a.remixBackend}).completeRequest(ctx, pending.Value, identity, sessionHash(parent.Value))
	if err != nil {
		if errors.Is(err, errRemixRequestExpired) {
			clearRemixCookie(w)
		}
		remixFailure(w, err)
		return
	}
	clearRemixCookie(w)
	writeJSON(w, 200, map[string]string{"redirect_url": next})
}

func remixCustomerPath(path string) bool {
	return path == "/auth/me" || path == "/auth/logout" || path == "/studio/jobs" || strings.HasPrefix(path, "/studio/jobs/") || strings.HasPrefix(path, "/app/") || strings.HasPrefix(path, "/rest/v1/") || strings.HasPrefix(path, "/storage/v1/") || strings.HasPrefix(path, "/functions/v1/")
}

func (h remixHost) wrap(normal, application http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if strings.HasPrefix(r.URL.Path, "/remix/v1/") {
			h.public(w, r)
			return
		}
		if r.URL.Path == "/remix/authorize" {
			h.authorize(w, r)
			return
		}
		installationID := r.Header.Get("X-Clips-Installation")
		if installationID == "" {
			normal.ServeHTTP(w, r)
			return
		}
		if !remixCustomerPath(r.URL.Path) {
			writeError(w, 403, "remix_route_denied")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		i, err := h.installation(ctx, installationID)
		if err != nil {
			remixFailure(w, err)
			return
		}
		if !remixCORS(w, r, i) {
			return
		}
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			writeError(w, 401, "customer_session_required")
			return
		}
		identity, sessionID, err := h.authenticate(ctx, i, strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		if err != nil {
			remixFailure(w, err)
			return
		}
		if r.URL.Path == "/auth/me" && r.Method == "GET" {
			writeJSON(w, 200, identity)
			return
		}
		if r.URL.Path == "/auth/logout" && r.Method == "POST" {
			if err = h.logout(ctx, sessionID); err != nil {
				remixFailure(w, err)
				return
			}
			w.WriteHeader(204)
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" && identity.Platform.Role == "viewer" {
			writeError(w, 403, "platform_read_only")
			return
		}
		ctx = context.WithValue(r.Context(), customerContextKey{}, "customer:"+identity.ID)
		ctx = context.WithValue(ctx, customerProfileKey{}, identity)
		application.ServeHTTP(w, r.WithContext(ctx))
	})
}
