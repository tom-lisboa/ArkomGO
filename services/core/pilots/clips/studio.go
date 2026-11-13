package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

//go:embed studio.sql
var studioSchema string

const studioLimit = 48 << 20

func (q queue) mountStudio(mux *http.ServeMux) {
	mux.HandleFunc("GET /studio/jobs", func(w http.ResponseWriter, r *http.Request) {
		owner := studioSession(r)
		if owner == "" {
			writeError(w, 401, "sessao_necessaria")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		rows, err := q.db.Query(ctx, `SELECT `+jobColumns+` FROM jobs WHERE id IN (SELECT job_id FROM studio_inputs WHERE owner=$1) ORDER BY created_at DESC LIMIT 50`, owner)
		if err != nil {
			writeError(w, 503, "banco_indisponivel")
			return
		}
		defer rows.Close()
		items := []job{}
		for rows.Next() {
			item, err := scanJob(rows)
			if err != nil {
				writeError(w, 503, "banco_indisponivel")
				return
			}
			items = append(items, item)
		}
		if rows.Err() != nil {
			writeError(w, 503, "banco_indisponivel")
			return
		}
		writeJSON(w, 200, map[string]any{"jobs": items})
	})
	mux.HandleFunc("POST /studio/session", func(w http.ResponseWriter, r *http.Request) {
		mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || mediaType != "application/json" {
			writeError(w, http.StatusUnsupportedMediaType, "json_required")
			return
		}
		if studioSession(r) == "" {
			http.SetCookie(w, &http.Cookie{Name: "clips_go", Value: rand.Text(), HttpOnly: true,
				SameSite: http.SameSiteStrictMode, Path: "/", MaxAge: 30 * 86400})
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("POST /studio/jobs", q.studioSubmit)
	mux.HandleFunc("GET /studio/jobs/{id}", func(w http.ResponseWriter, r *http.Request) {
		if q.studioOwns(w, r) {
			q.getJob(w, r)
		}
	})
	mux.HandleFunc("GET /studio/jobs/{id}/video", func(w http.ResponseWriter, r *http.Request) {
		if q.studioOwns(w, r) {
			filename := ""
			if r.URL.Query().Get("download") == "1" {
				filename = "clips-go-vertical.mp4"
			}
			q.serveVideo(w, r, filename)
		}
	})
}

func studioSession(r *http.Request) string {
	if owner, ok := r.Context().Value(customerContextKey{}).(string); ok {
		return owner
	}
	c, err := r.Cookie("clips_go")
	if err != nil || len(c.Value) != 26 || !validKey.MatchString(c.Value) {
		return ""
	}
	return c.Value
}

func (q queue) studioOwns(w http.ResponseWriter, r *http.Request) bool {
	session := studioSession(r)
	if session == "" {
		writeError(w, http.StatusUnauthorized, "sessao_necessaria")
		return false
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	var owns bool
	err := q.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM studio_inputs WHERE job_id=$1 AND owner=$2)`,
		r.PathValue("id"), session).Scan(&owns)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "banco_indisponivel")
		return false
	}
	if !owns {
		writeError(w, http.StatusNotFound, "projeto_nao_encontrado")
	}
	return owns
}

func (q queue) studioSubmit(w http.ResponseWriter, r *http.Request) {
	session := studioSession(r)
	if session == "" {
		writeError(w, http.StatusUnauthorized, "sessao_necessaria")
		return
	}
	if q.hosted {
		check, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		var size int64
		var pending int
		err := q.db.QueryRow(check, `SELECT pg_database_size(current_database()),
			(SELECT count(*) FROM jobs WHERE status IN ('queued','running'))`).Scan(&size, &pending)
		if err != nil {
			writeError(w, 503, "banco_indisponivel")
			return
		}
		if size > 512<<20 || pending >= 10 {
			writeError(w, 429, "limite_homologacao")
			return
		}
	}
	key := r.Header.Get("Idempotency-Key")
	if !validKey.MatchString(key) {
		writeError(w, http.StatusBadRequest, "chave_de_pedido_invalida")
		return
	}
	select {
	case q.uploads <- struct{}{}:
		defer func() { <-q.uploads }()
	default:
		writeError(w, http.StatusTooManyRequests, "envio_ocupado")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, studioLimit+(128<<10))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "arquivo_invalido_ou_maior_que_48_mb")
		return
	}
	defer r.MultipartForm.RemoveAll()
	appTitle := ""
	profile, appRequest := r.Context().Value(customerProfileKey{}).(customerIdentity)
	appRequest = appRequest && r.URL.Path == "/app/projects"
	if appRequest {
		appTitle = strings.TrimSpace(r.FormValue("title"))
		if !utf8.ValidString(appTitle) || utf8.RuneCountInString(appTitle) < 1 || utf8.RuneCountInString(appTitle) > 200 {
			writeError(w, 400, "invalid_title")
			return
		}
	}

	start, startErr := strconv.ParseFloat(r.FormValue("start"), 64)
	duration, durationErr := strconv.ParseFloat(r.FormValue("duration"), 64)
	if startErr != nil || durationErr != nil || math.IsNaN(start) || math.IsNaN(duration) ||
		start < 0 || start > 3600 || duration < 1 || duration > 30 {
		writeError(w, http.StatusBadRequest, "intervalo_invalido")
		return
	}
	source, err := studioFile(r, "video", studioLimit)
	if err != nil || len(source) < 12 || string(source[4:8]) != "ftyp" {
		writeError(w, http.StatusBadRequest, "envie_um_mp4_valido")
		return
	}
	if appRequest && len(source) > 7<<20 {
		writeError(w, 413, "video_limit_7_mib")
		return
	}
	captions, err := studioFile(r, "captions", 64<<10)
	if err != nil && !errors.Is(err, http.ErrMissingFile) ||
		len(captions) > 0 && (!utf8.Valid(captions) || !strings.Contains(string(captions), " --> ")) {
		writeError(w, http.StatusBadRequest, "legenda_srt_invalida")
		return
	}

	digest := sha256.New()
	fmt.Fprintf(digest, "%g:%g:%d:%d:", start, duration, len(source), len(captions))
	digest.Write(source)
	digest.Write(captions)
	digest.Write([]byte(appTitle))
	fingerprint := fmt.Sprintf("%x", digest.Sum(nil))
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	var id string
	tx, err := q.db.Begin(ctx)
	if err != nil {
		writeError(w, 503, "banco_indisponivel")
		return
	}
	defer tx.Rollback(ctx)
	err = tx.QueryRow(ctx, `
		WITH new_job AS (
			INSERT INTO jobs(id,idempotency_key,fixture) VALUES($1,$2,'entrevista-demo')
			ON CONFLICT(idempotency_key) DO NOTHING RETURNING id
		)
		INSERT INTO studio_inputs(job_id,owner,fingerprint,source,captions,start_seconds,duration_seconds)
		SELECT id,$3,$4,$5,$6,$7,$8 FROM new_job RETURNING job_id`,
		rand.Text(), session+":"+key, session, fingerprint, source, captions, start, duration).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		var prior string
		err = tx.QueryRow(ctx, `SELECT s.job_id,s.fingerprint FROM studio_inputs s JOIN jobs j ON j.id=s.job_id
			WHERE j.idempotency_key=$1 AND s.owner=$2`, session+":"+key, session).Scan(&id, &prior)
		if err == nil && prior != fingerprint {
			writeError(w, http.StatusConflict, "chave_ja_usada")
			return
		}
	}
	if err == nil && appRequest {
		_, err = tx.Exec(ctx, `INSERT INTO app_projects(job_id,account_id,title) VALUES($1,$2,$3) ON CONFLICT(job_id) DO NOTHING`, id, profile.ID, appTitle)
	}
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		log.Printf("studio enqueue: %v", err)
		writeError(w, http.StatusServiceUnavailable, "banco_indisponivel")
		return
	}
	w.Header().Set("Location", "/studio/jobs/"+id)
	writeJSON(w, http.StatusAccepted, map[string]string{"id": id})
}

func studioFile(r *http.Request, name string, limit int64) ([]byte, error) {
	f, _, err := r.FormFile(name)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, limit+1))
	if int64(len(data)) > limit {
		return nil, errors.New("upload exceeds limit")
	}
	return data, err
}

func (q queue) renderStudio(ctx context.Context, j job) (json.RawMessage, []byte, *string) {
	failed := func(code string) (json.RawMessage, []byte, *string) { return nil, nil, &code }
	var source, captions []byte
	var start, duration float64
	if err := q.db.QueryRow(ctx, `SELECT source,captions,start_seconds,duration_seconds
		FROM studio_inputs WHERE job_id=$1`, j.ID).Scan(&source, &captions, &start, &duration); err != nil {
		return failed("origem_indisponivel")
	}
	dir, err := os.MkdirTemp("", "clips-go-")
	if err != nil {
		return failed("armazenamento_indisponivel")
	}
	defer os.RemoveAll(dir)
	if err := os.WriteFile(filepath.Join(dir, "source.mp4"), source, 0600); err != nil {
		return failed("armazenamento_indisponivel")
	}

	filter := "scale=720:1280:force_original_aspect_ratio=decrease:force_divisible_by=2," +
		"pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30"
	if len(captions) > 0 {
		if err := os.WriteFile(filepath.Join(dir, "captions.srt"), captions, 0600); err != nil {
			return failed("armazenamento_indisponivel")
		}
		filter += ",subtitles=captions.srt:force_style='FontName=Arial,FontSize=18,Bold=1,Outline=2,MarginV=26'"
	}
	cmd := exec.CommandContext(ctx, q.studio, "-hide_banner", "-loglevel", "error", "-nostdin", "-abort_on", "empty_output_stream",
		"-threads", "1", "-filter_threads", "1", "-protocol_whitelist", "file", "-f", "mov", "-ss", fmt.Sprint(start), "-i", "source.mp4",
		"-t", fmt.Sprint(duration), "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1",
		"-vf", filter, "-c:v", "libx264", "-threads", "1", "-preset", "veryfast", "-b:v", "1800k", "-maxrate", "2000k",
		"-bufsize", "2000k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "cut.mp4")
	cmd.Dir = dir
	if err := cmd.Run(); err != nil {
		log.Printf("studio render %s: %v", j.ID, err)
		return failed("falha_ao_renderizar")
	}
	outPath := filepath.Join(dir, "cut.mp4")
	info, err := os.Stat(outPath)
	if err != nil || info.Size() < 12 || info.Size() > maxVideoBytes {
		return failed("saida_invalida")
	}
	mp4, err := os.ReadFile(outPath)
	if err != nil || len(mp4) < 12 || string(mp4[4:8]) != "ftyp" {
		return failed("saida_invalida")
	}
	result, _ := json.Marshal(map[string]any{"download_path": "/studio/jobs/" + j.ID + "/video",
		"width": 720, "height": 1280, "start_seconds": start, "requested_duration_seconds": duration})
	return result, mp4, nil
}
