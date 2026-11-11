package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"strings"

	"sdr-next-pilot/internal/platformaccess"
)

type directoryResolver = platformaccess.Resolver
type directoryPrincipal = platformaccess.Principal
type directoryUserKey struct{}

func (a *App) configureDirectory() error {
	c, err := platformaccess.FromFile(os.Getenv("SDR_DIRECTORY_FILE"), "bia-sdr")
	if err != nil {
		return err
	}
	if c != nil {
		a.directory = c
	}
	return nil
}

func (a *App) directoryUser(ctx context.Context, u User) (User, error) {
	if a.directory == nil {
		return u, nil
	}
	if prior, ok := ctx.Value(directoryUserKey{}).(User); ok && prior.ID == u.ID && prior.Org == u.Org {
		role, err := platformaccess.Ceiling(u.Role, prior.Role)
		if err != nil {
			return User{}, err
		}
		u.Role = role
		u.Platform = prior.Platform
		return u, nil
	}
	p, err := a.directory.Resolve(ctx, u.Org, u.ID)
	if err != nil {
		return User{}, err
	}
	if p.Solution != "bia-sdr" || p.LocalOrganizationID != u.Org || p.LocalActorID != u.ID {
		return User{}, platformaccess.ErrUnavailable
	}
	role, err := platformaccess.Ceiling(u.Role, p.Role)
	if err != nil {
		return User{}, err
	}
	u.Role = role
	u.Platform = &p
	return u, nil
}

func directoryFailure(w http.ResponseWriter, err error) {
	if errors.Is(err, platformaccess.ErrDenied) {
		fail(w, 403, "platform_access_denied")
		return
	}
	fail(w, 503, "platform_directory_unavailable")
}

// Resolve outside App.mu, once per authenticated HTTP request. Every route
// retains its existing local session, ownership, CORS and permission checks.
func (a *App) directoryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if a.directory == nil || !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			next.ServeHTTP(w, r)
			return
		}
		h := sha256.Sum256([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")))
		a.mu.Lock()
		s, ok := a.sessions[hex.EncodeToString(h[:])]
		valid := ok && s.Expires.After(a.now())
		a.mu.Unlock()
		if !valid {
			next.ServeHTTP(w, r)
			return
		}
		u, err := a.directoryUser(r.Context(), s.User)
		if err != nil {
			directoryFailure(w, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), directoryUserKey{}, u)))
	})
}
