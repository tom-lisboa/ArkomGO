package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5"
)

const maxVideoBytes = 10 << 20

type videoWorker struct {
	client          *http.Client
	recipe          []byte
	start, duration float64
}

func newVideoWorker(socket, recipePath string) (*videoWorker, error) {
	if socket == "" && recipePath == "" {
		return nil, nil
	}
	if !filepath.IsAbs(socket) || !filepath.IsAbs(recipePath) {
		return nil, errors.New("video mode requires absolute paths for the local worker socket and recipe")
	}
	info, err := os.Stat(socket)
	if err != nil || info.Mode()&os.ModeSocket == 0 {
		return nil, errors.New("local video worker socket is unavailable")
	}
	recipe, err := os.ReadFile(recipePath)
	if err != nil {
		return nil, err
	}
	var timing struct {
		Start    float64 `json:"start"`
		Duration float64 `json:"duration"`
	}
	if len(recipe) > 1024 || json.Unmarshal(recipe, &timing) != nil || timing.Start < 0 ||
		timing.Duration <= 0 || timing.Duration > 30 {
		return nil, errors.New("invalid local video recipe")
	}
	dialer := &net.Dialer{Timeout: 2 * time.Second}
	client := &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return dialer.DialContext(ctx, "unix", socket)
			},
			IdleConnTimeout: 15 * time.Second,
		},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	return &videoWorker{client: client, recipe: recipe, start: timing.Start, duration: timing.Duration}, nil
}

func (v *videoWorker) trim(ctx context.Context, j job) (json.RawMessage, []byte, *string) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://clips-worker/trim", bytes.NewReader(v.recipe))
	if err != nil {
		code := "video_request_failed"
		return nil, nil, &code
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := v.client.Do(req)
	if err != nil {
		log.Printf("local trim for job %s: %v", j.ID, err)
		code := "video_worker_unavailable"
		return nil, nil, &code
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		log.Printf("local trim for job %s returned HTTP %d", j.ID, resp.StatusCode)
		code := "video_worker_rejected"
		return nil, nil, &code
	}
	mediaType, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	mp4, err := io.ReadAll(io.LimitReader(resp.Body, maxVideoBytes+1))
	if err != nil || mediaType != "video/mp4" || len(mp4) < 12 || len(mp4) > maxVideoBytes || string(mp4[4:8]) != "ftyp" {
		code := "invalid_video_output"
		return nil, nil, &code
	}

	result, _ := json.Marshal(struct {
		Simulated bool    `json:"simulated"`
		Start     float64 `json:"start_seconds"`
		Duration  float64 `json:"duration_seconds"`
		Bytes     int     `json:"bytes"`
		Download  string  `json:"download_path"`
	}{Start: v.start, Duration: v.duration, Bytes: len(mp4), Download: "/jobs/" + j.ID + "/video"})
	return result, mp4, nil
}

func (q queue) getVideo(w http.ResponseWriter, r *http.Request) {
	q.serveVideo(w, r, "clip.mp4")
}

func (q queue) serveVideo(w http.ResponseWriter, r *http.Request, filename string) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	var mp4 []byte
	err := q.db.QueryRow(ctx, `SELECT mp4 FROM job_videos WHERE job_id = $1`, r.PathValue("id")).Scan(&mp4)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		writeError(w, http.StatusNotFound, "video_not_found")
	case err != nil:
		log.Printf("read video: %v", err)
		writeError(w, http.StatusServiceUnavailable, "database_unavailable")
	default:
		w.Header().Set("Content-Type", "video/mp4")
		if filename != "" {
			w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
		}
		http.ServeContent(w, r, filename, time.Time{}, bytes.NewReader(mp4))
	}
}
