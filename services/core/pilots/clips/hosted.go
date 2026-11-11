package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"arkom/bia/internal/platformdirectory"
	"arkom/bia/internal/solutionbus"
	"arkom/bia/internal/solutioninbox"
	access "arkom/bia/pkg/platformaccess"

	"github.com/jackc/pgx/v5/pgxpool"
)

const hostedDDL = `
CREATE TABLE IF NOT EXISTS worker_health (
    id text PRIMARY KEY,
    seen_at timestamptz NOT NULL
);`

func runHosted(role string) error {
	if role == "connectors" || role == "connectors-health" {
		return runConnectors(role)
	}
	password, err := os.ReadFile("/run/secrets/db_password")
	if err != nil {
		return err
	}
	cfg, err := pgxpool.ParseConfig("postgres://clips_go@postgres:5432/clips_go_homolog?sslmode=disable")
	if err != nil {
		return err
	}
	cfg.ConnConfig.Password = strings.TrimSpace(string(password))
	cfg.MaxConns = 3
	cfg.ConnConfig.ConnectTimeout = 3 * time.Second
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return err
	}
	defer db.Close()
	q := queue{db: db, studio: "/usr/bin/ffmpeg", uploads: make(chan struct{}, 1), hosted: true, integrations: true}

	if role == "api" || role == "worker" {
		q.gifs, err = loadGIFConfig(role == "worker")
		if err != nil {
			return err
		}
	}
	switch role {
	case "migrate":
		migration, cancel := context.WithTimeout(ctx, 15*time.Second)
		defer cancel()
		_, err := db.Exec(migration, schema+studioSchema+hostedDDL+identitySchema+platformSchema+interfaceSchema+solutionbus.Schema+solutioninbox.Schema+platformdirectory.Schema+remixSchema+gifSchema)
		return err
	case "gif-grant":
		return setGIFGrant(ctx, db, os.Stdin)
	case "directory-register", "directory-change", "directory-bind-service", "directory-installation":
		return directoryCommand(ctx, db, role, os.Stdin, os.Stdout)
	case "provision":
		provision, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		identity, err := provisionCustomer(provision, db, os.Stdin)
		if err == nil {
			return json.NewEncoder(os.Stdout).Encode(identity)
		}
		return err
	case "provision-native":
		provision, cancel := context.WithTimeout(ctx, 15*time.Second)
		defer cancel()
		identity, err := provisionNative(provision, db, os.Stdin)
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(identity)
	case "provision-service":
		var req struct {
			Solution       string `json:"solution"`
			OrganizationID string `json:"organization_id"`
		}
		if err := json.NewDecoder(io.LimitReader(os.Stdin, 4096)).Decode(&req); err != nil {
			return err
		}
		provision, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		credential, err := solutionbus.Provision(provision, db, req.Solution, req.OrganizationID)
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(credential)
	case "worker":
		pulseCtx, cancel := context.WithCancel(ctx)
		defer cancel()
		done := make(chan struct{})
		go func() {
			defer close(done)
			tick := time.NewTicker(5 * time.Second)
			defer tick.Stop()
			for {
				query, finish := context.WithTimeout(pulseCtx, 2*time.Second)
				_, err := db.Exec(query, `INSERT INTO worker_health VALUES('render',now())
					ON CONFLICT(id) DO UPDATE SET seen_at=excluded.seen_at`)
				finish()
				if err != nil && pulseCtx.Err() == nil {
					log.Printf("worker heartbeat: %v", err)
				}
				select {
				case <-tick.C:
				case <-pulseCtx.Done():
					return
				}
			}
		}()
		if q.gifs != nil {
			gifDone := make(chan struct{})
			go func() { defer close(gifDone); q.runGIFWorker(ctx) }()
			defer func() { <-gifDone }()
		}
		runWorker(ctx, q)
		cancel()
		<-done
		return nil
	case "api":
		token, err := os.ReadFile("/run/secrets/api_token")
		if err != nil || len(strings.TrimSpace(string(token))) < 40 {
			return errors.New("a private API token of at least 40 characters is required")
		}
		mux := http.NewServeMux()
		mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
			if !q.hostedReady(r.Context()) {
				writeError(w, http.StatusServiceUnavailable, "not_ready")
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "environment": "homolog"})
		})
		mux.HandleFunc("GET /ops/status", func(w http.ResponseWriter, r *http.Request) {
			query, cancel := context.WithTimeout(r.Context(), 3*time.Second)
			defer cancel()
			rows, err := db.Query(query, `SELECT status,count(*) FROM jobs GROUP BY status`)
			if err != nil {
				writeError(w, 503, "database_unavailable")
				return
			}
			defer rows.Close()
			counts := map[string]int{}
			for rows.Next() {
				var state string
				var count int
				if err := rows.Scan(&state, &count); err != nil {
					writeError(w, 503, "database_unavailable")
					return
				}
				counts[state] = count
			}
			if rows.Err() != nil {
				writeError(w, 503, "database_unavailable")
				return
			}
			writeJSON(w, 200, map[string]any{"environment": "homolog", "jobs": counts})
		})
		q.mountStudio(mux)
		q.mountApp(mux)
		integration := solutionbus.Server{DB: db, Artifact: q.integrationArtifact}
		directoryEnabled := os.Getenv("CLIPS_DIRECTORY_ENABLED")
		if directoryEnabled != "" && directoryEnabled != "0" && directoryEnabled != "1" {
			return errors.New("invalid directory activation")
		}
		if directoryEnabled == "1" {
			integration.Directory = &platformdirectory.Store{DB: db}
		}
		directoryBackend := os.Getenv("CLIPS_DIRECTORY_BACKEND")
		if directoryBackend != "" && (directoryEnabled != "1" || !access.ValidReference(directoryBackend)) {
			return errors.New("invalid directory backend configuration")
		}
		integration.Mount(mux)
		if err := mountInterface(mux, "/srv/clips-ui", "https://"+sourceProject+".supabase.co"); err != nil {
			return err
		}
		publicKey, err := os.ReadFile("/run/config/source_publishable_key")
		if err != nil || !strings.HasPrefix(strings.TrimSpace(string(publicKey)), "sb_publishable_") {
			return errors.New("the source Auth publishable key is required")
		}
		customers := identityAuth{db: db, providerURL: "https://" + sourceProject + ".supabase.co",
			directoryBackend: directoryBackend,
			publishable:      strings.TrimSpace(string(publicKey)), origin: hostedOrigin,
			throttle: &authThrottle{},
			client: &http.Client{Timeout: 6 * time.Second,
				CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
		handler := customers.protect(mux, strings.TrimSpace(string(token)))
		remixEnabled := os.Getenv("CLIPS_REMIX_ENABLED")
		if remixEnabled != "" && remixEnabled != "0" && remixEnabled != "1" {
			return errors.New("invalid remix activation")
		}
		if remixEnabled == "1" {
			customers.remixBackend = os.Getenv("CLIPS_REMIX_BACKEND")
			if !access.ValidReference(customers.remixBackend) {
				return errors.New("a registered remix backend is required")
			}
			handler = (remixHost{auth: customers, backend: customers.remixBackend}).wrap(customers.protect(mux, strings.TrimSpace(string(token))), mux)
		}
		server := &http.Server{
			Addr: "0.0.0.0:8080", Handler: handler,
			ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 60 * time.Second,
			WriteTimeout: 65 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16 << 10,
		}
		done := make(chan error, 1)
		go func() { done <- server.ListenAndServe() }()
		select {
		case err := <-done:
			return err
		case <-ctx.Done():
			shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			return server.Shutdown(shutdown)
		}
	default:
		return fmt.Errorf("unsupported hosted role %q", role)
	}
}

func (q queue) hostedReady(ctx context.Context) bool {
	query, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	var ready bool
	err := q.db.QueryRow(query, `SELECT EXISTS(
		SELECT 1 FROM worker_health WHERE id='render' AND seen_at > now()-interval '30 seconds')`).Scan(&ready)
	return err == nil && ready
}

func privateHostedAPI(next http.Handler, token string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.URL.Path != "/healthz" {
			expected := "Bearer " + token
			if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte(expected)) != 1 {
				writeError(w, http.StatusUnauthorized, "team_access_required")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
