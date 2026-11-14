package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const address = "127.0.0.1:18082"

func studioAddress() (string, error) {
	override := os.Getenv("ARKOM_LOCAL_CLIPS_LISTEN")
	if override == "" {
		return address, nil
	}
	host, port, err := net.SplitHostPort(override)
	number, parseErr := strconv.ParseUint(port, 10, 16)
	if err != nil || host != "127.0.0.1" || parseErr != nil || number == 0 {
		return "", errors.New("CLIPS studio requires a loopback address")
	}
	return override, nil
}

var validKey = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$`)

func main() {
	socket := flag.String("socket", "", "private Unix socket directory created by run-local.sh")
	videoSocket := flag.String("video-socket", "", "private Unix socket of the local CLIPS worker")
	videoRecipe := flag.String("video-recipe", "", "absolute path to the local video recipe")
	homolog := flag.Bool("homolog-export", false, "enable the localhost CLIPS export contract test")
	studio := flag.String("studio-ffmpeg", "", "local FFmpeg executable for the Clips Go studio")
	hostedRole := flag.String("hosted-role", "", "isolated hosted role: migrate, provision, provision-native, provision-service, directory-register, directory-change, directory-bind-service, directory-installation, gif-grant, api, worker, connectors or connectors-health")
	flag.Parse()
	if *hostedRole != "" {
		if err := runHosted(*hostedRole); err != nil {
			log.Fatal(err)
		}
		return
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	video, err := newVideoWorker(*videoSocket, *videoRecipe)
	if err != nil {
		log.Fatal(err)
	}
	if *homolog && video == nil {
		log.Fatal("homolog-export requires the local video worker")
	}
	if *studio != "" && (!filepath.IsAbs(*studio) || video != nil || *homolog) {
		log.Fatal("studio requires an absolute FFmpeg path and a dedicated launcher mode")
	}
	if err := serve(ctx, *socket, video, *homolog, *studio); err != nil {
		log.Fatal(err)
	}
}

func serve(ctx context.Context, socket string, video *videoWorker, homolog bool, studio string) error {
	dsn := "postgres://clips_pilot@localhost:55474/clips_pilot?sslmode=disable"
	if isolated := os.Getenv("ARKOM_LOCAL_CLIPS_DATABASE_URL"); studio != "" && isolated != "" && socket == "" {
		u, err := url.Parse(isolated)
		if err != nil || u.Scheme != "postgres" || u.Hostname() != "127.0.0.1" || u.Port() == "" ||
			u.Path != "/clips_pilot" || u.User == nil || u.User.Username() != "clips_pilot" ||
			u.Fragment != "" || u.RawQuery != "sslmode=disable" {
			return errors.New("invalid isolated CLIPS database URL")
		}
		dsn = isolated
	} else {
		info, err := os.Stat(socket)
		if !filepath.IsAbs(socket) || err != nil || !info.IsDir() || info.Mode().Perm() != 0700 {
			return errors.New("the PostgreSQL socket directory must be private (0700)")
		}
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return errors.New("invalid CLIPS database configuration")
	}
	if socket != "" {
		cfg.ConnConfig.Host = socket
	}
	cfg.ConnConfig.Fallbacks = nil
	cfg.MaxConns = 6

	startup, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	db, err := pgxpool.NewWithConfig(startup, cfg)
	if err != nil {
		return err
	}
	defer db.Close()
	ddl := schema
	q := queue{db: db, video: video, studio: studio, uploads: make(chan struct{}, 2)}
	if studio != "" {
		ddl += studioSchema
		if len(os.Getenv("SDR_CLIPS_BRIDGE_KEY")) >= 32 {
			q.gifs, err = loadGIFConfig(false)
			if err != nil {
				return err
			}
			if q.gifs != nil {
				q.gifs.platformKey = strings.TrimSpace(os.Getenv("CLIPS_LOCAL_GIF_PLATFORM_KEY"))
				ddl += identitySchema + gifSchema
			}
		}
	}
	if _, err := db.Exec(startup, ddl); err != nil {
		return fmt.Errorf("prepare local schema: %w", err)
	}
	listen := address
	if studio != "" {
		listen, err = studioAddress()
		if err != nil {
			return err
		}
	}
	listener, err := net.Listen("tcp", listen)
	if err != nil {
		return fmt.Errorf("start local API: %w", err)
	}
	defer listener.Close()

	workerCtx, stopWorkers := context.WithCancel(ctx)
	var workers sync.WaitGroup
	for range 2 {
		workers.Go(func() { runWorker(workerCtx, q) })
	}
	if q.gifs != nil {
		workers.Go(func() { q.runGIFWorker(workerCtx) })
	}
	defer func() {
		stopWorkers()
		workers.Wait()
	}()

	server := &http.Server{
		Handler:           q.routesAt(homolog, listen),
		ReadHeaderTimeout: 3 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      35 * time.Second,
		IdleTimeout:       30 * time.Second,
	}
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	log.Printf("CLIPS pilot listening on http://%s", listen)
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		defer server.Close()
		return server.Shutdown(shutdown)
	}
}

func (q queue) routes(homolog bool) http.Handler {
	return q.routesAt(homolog, address)
}

func (q queue) routesAt(homolog bool, listen string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := q.db.Ping(ctx); err != nil {
			writeError(w, http.StatusServiceUnavailable, "database_unavailable")
			return
		}
		mode := "simulation"
		if q.video != nil {
			mode = "local-video"
		}
		if homolog {
			mode = "homolog-export"
		}
		if q.studio != "" {
			mode = "clips-go"
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "mode": mode})
	})
	if homolog {
		q.mountHomolog(mux)
	} else if q.studio != "" {
		q.mountStudio(mux)
		mux.HandleFunc("POST /studio/jobs/{id}/delete", q.studioDelete)
		if q.gifs != nil {
			gifs := q.localGIFRoutes()
			mux.Handle("/app/gifs", gifs)
			mux.Handle("/app/gifs/", gifs)
		}
	} else {
		mux.HandleFunc("POST /jobs", q.createJob)
		mux.HandleFunc("GET /jobs/{id}", q.getJob)
		mux.HandleFunc("GET /jobs/{id}/video", q.getVideo)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != listen && r.Host != strings.Replace(listen, "127.0.0.1", "localhost", 1) {
			writeError(w, http.StatusForbidden, "local_host_required")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		mux.ServeHTTP(w, r)
	})
}

func (q queue) createJob(w http.ResponseWriter, r *http.Request) {
	key := r.Header.Get("Idempotency-Key")
	if !validKey.MatchString(key) {
		writeError(w, http.StatusBadRequest, "invalid_idempotency_key")
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeError(w, http.StatusUnsupportedMediaType, "json_required")
		return
	}

	var input struct {
		Fixture string `json:"fixture"`
	}
	body := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
	body.DisallowUnknownFields()
	if err := body.Decode(&input); err != nil || body.Decode(new(any)) != io.EOF || !fixtures[input.Fixture] {
		writeError(w, http.StatusBadRequest, "invalid_fixture_request")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	j, created, err := q.enqueue(ctx, key, input.Fixture)
	switch {
	case errors.Is(err, errKeyConflict):
		writeError(w, http.StatusConflict, "idempotency_conflict")
	case err != nil:
		log.Printf("enqueue: %v", err)
		writeError(w, http.StatusServiceUnavailable, "database_unavailable")
	default:
		status := http.StatusOK
		if created {
			status = http.StatusAccepted
		}
		w.Header().Set("Location", "/jobs/"+j.ID)
		writeJSON(w, status, j)
	}
}

func (q queue) getJob(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	j, err := q.get(ctx, r.PathValue("id"))
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		writeError(w, http.StatusNotFound, "job_not_found")
	case err != nil:
		log.Printf("read job: %v", err)
		writeError(w, http.StatusServiceUnavailable, "database_unavailable")
	default:
		writeJSON(w, http.StatusOK, j)
	}
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("write response: %v", err)
	}
}
