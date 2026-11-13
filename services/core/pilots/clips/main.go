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
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"sync"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const address = "127.0.0.1:18082"

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
	if !filepath.IsAbs(socket) {
		return errors.New("use run-local.sh to start the pilot with a private PostgreSQL socket")
	}
	info, err := os.Stat(socket)
	if err != nil || !info.IsDir() || info.Mode().Perm() != 0700 {
		return errors.New("the PostgreSQL socket directory must be private (0700)")
	}

	// The only supported database connection is the local pilot's Unix socket.
	cfg, err := pgxpool.ParseConfig("postgres://clips_pilot@localhost:55474/clips_pilot?sslmode=disable")
	if err != nil {
		return err
	}
	cfg.ConnConfig.Host = socket
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
	if studio != "" {
		ddl += studioSchema
	}
	if _, err := db.Exec(startup, ddl); err != nil {
		return fmt.Errorf("prepare local schema: %w", err)
	}
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return fmt.Errorf("start local API: %w", err)
	}
	defer listener.Close()

	q := queue{db: db, video: video, studio: studio, uploads: make(chan struct{}, 2)}
	workerCtx, stopWorkers := context.WithCancel(ctx)
	var workers sync.WaitGroup
	for range 2 {
		workers.Go(func() { runWorker(workerCtx, q) })
	}
	defer func() {
		stopWorkers()
		workers.Wait()
	}()

	server := &http.Server{
		Handler:           q.routes(homolog),
		ReadHeaderTimeout: 3 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      35 * time.Second,
		IdleTimeout:       30 * time.Second,
	}
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	log.Printf("CLIPS pilot listening on http://%s", address)
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
	} else {
		mux.HandleFunc("POST /jobs", q.createJob)
		mux.HandleFunc("GET /jobs/{id}", q.getJob)
		mux.HandleFunc("GET /jobs/{id}/video", q.getVideo)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != address && r.Host != "localhost:18082" {
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
