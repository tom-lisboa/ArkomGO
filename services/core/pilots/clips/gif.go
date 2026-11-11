package main

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image/gif"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

//go:embed gif.sql
var gifSchema string

type gifConfig struct {
	seal        cipher.AEAD
	platformKey string
}

func loadGIFConfig(worker bool) (*gifConfig, error) {
	path := os.Getenv("CLIPS_GIF_SEAL_FILE")
	if path == "" {
		return nil, nil
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(data)))
	if err != nil || len(key) != 32 {
		return nil, errors.New("invalid GIF encryption key")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	seal, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	cfg := &gifConfig{seal: seal}
	if worker && os.Getenv("CLIPS_GIF_OPENAI_FILE") != "" {
		data, err := os.ReadFile(os.Getenv("CLIPS_GIF_OPENAI_FILE"))
		if err != nil {
			return nil, err
		}
		cfg.platformKey = strings.TrimSpace(string(data))
		if cfg.platformKey == "" {
			return nil, errors.New("empty GIF platform credential")
		}
	}
	return cfg, nil
}

func (q queue) mountGIF(mux *http.ServeMux) {
	mux.HandleFunc("GET /app/gifs", q.gifStatus)
	mux.HandleFunc("PUT /app/gifs/key", q.gifKey)
	mux.HandleFunc("DELETE /app/gifs/key", q.gifKey)
	mux.HandleFunc("POST /app/gifs", q.gifSubmit)
	mux.HandleFunc("GET /app/gifs/{id}/image", q.gifImage)
}

func (q queue) gifAccount(w http.ResponseWriter, r *http.Request) (customerIdentity, bool) {
	identity, ok := appIdentity(r)
	if !ok {
		writeError(w, 401, "customer_session_required")
		return identity, false
	}
	if q.gifs == nil {
		writeError(w, 503, "gif_unavailable")
		return identity, false
	}
	return identity, true
}

func (q queue) gifStatus(w http.ResponseWriter, r *http.Request) {
	account, ok := q.gifAccount(w, r)
	if !ok {
		return
	}
	var hasKey bool
	var remaining int
	var expires *time.Time
	var jobs json.RawMessage
	err := q.db.QueryRow(r.Context(), `
		SELECT EXISTS(SELECT 1 FROM gif_keys WHERE account_id=$1),
			COALESCE(g.remaining,0), g.expires_at,
			COALESCE((SELECT json_agg(j ORDER BY j.created_at DESC) FROM
				(SELECT id,status,created_at FROM gif_jobs WHERE account_id=$1 ORDER BY created_at DESC LIMIT 20) j), '[]')
		FROM customer_accounts a LEFT JOIN gif_grants g ON g.account_id=a.id AND g.expires_at>now()
		WHERE a.id=$1`, account.ID).Scan(&hasKey, &remaining, &expires, &jobs)
	if err != nil {
		writeError(w, 503, "database_unavailable")
		return
	}
	writeJSON(w, 200, map[string]any{"has_key": hasKey, "gift_remaining": remaining, "gift_expires_at": expires, "jobs": jobs})
}

func (q queue) gifKey(w http.ResponseWriter, r *http.Request) {
	account, ok := q.gifAccount(w, r)
	if !ok {
		return
	}
	if r.Method == http.MethodDelete {
		if _, err := q.db.Exec(r.Context(), `DELETE FROM gif_keys WHERE account_id=$1`, account.ID); err != nil {
			writeError(w, 503, "database_unavailable")
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	var input struct {
		Key string `json:"key"`
	}
	err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048)).Decode(&input)
	key := strings.TrimSpace(input.Key)
	if err != nil || !strings.HasPrefix(key, "sk-") || len(key) < 20 || len(key) > 1024 || strings.ContainsAny(key, " \r\n\t") {
		writeError(w, 400, "invalid_openai_key")
		return
	}
	nonce := make([]byte, q.gifs.seal.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		writeError(w, 503, "gif_unavailable")
		return
	}
	encrypted := q.gifs.seal.Seal(nonce, nonce, []byte(key), []byte(account.ID))
	_, err = q.db.Exec(r.Context(), `INSERT INTO gif_keys VALUES($1,$2)
		ON CONFLICT(account_id) DO UPDATE SET encrypted_key=excluded.encrypted_key`, account.ID, encrypted)
	if err != nil {
		writeError(w, 503, "database_unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (q queue) gifSubmit(w http.ResponseWriter, r *http.Request) {
	account, ok := q.gifAccount(w, r)
	if !ok {
		return
	}
	var input struct {
		Prompt string `json:"prompt"`
		Gift   bool   `json:"gift"`
	}
	err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&input)
	prompt := strings.TrimSpace(input.Prompt)
	if err != nil || prompt == "" || len(prompt) > 4000 || strings.ContainsRune(prompt, 0) {
		writeError(w, 400, "invalid_gif_prompt")
		return
	}
	var capacity bool
	if err := q.db.QueryRow(r.Context(), `SELECT pg_database_size(current_database()) <= 512*1024*1024
		AND (SELECT count(*) FROM gif_jobs WHERE status IN ('queued','running')) < 10`).Scan(&capacity); err != nil {
		writeError(w, 503, "database_unavailable")
		return
	}
	if !capacity {
		writeError(w, 429, "gif_capacity")
		return
	}
	var id string
	err = q.db.QueryRow(r.Context(), `
		WITH gift AS (
			UPDATE gif_grants SET remaining=remaining-1
			WHERE $3 AND account_id=$1 AND expires_at>now() AND remaining>0 RETURNING account_id
		)
		INSERT INTO gif_jobs(account_id,prompt,sponsored)
		SELECT $1,$2,$3 WHERE ($3 AND EXISTS(SELECT 1 FROM gift))
			OR (NOT $3 AND EXISTS(SELECT 1 FROM gif_keys WHERE account_id=$1))
		RETURNING id`, account.ID, prompt, input.Gift).Scan(&id)
	var conflict *pgconn.PgError
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		writeError(w, 409, "gif_credential_unavailable")
	case errors.As(err, &conflict) && conflict.Code == "23505":
		writeError(w, 409, "gif_already_pending")
	case err != nil:
		writeError(w, 503, "database_unavailable")
	default:
		writeJSON(w, 202, map[string]string{"id": id})
	}
}

func (q queue) gifImage(w http.ResponseWriter, r *http.Request) {
	account, ok := q.gifAccount(w, r)
	if !ok {
		return
	}
	var data []byte
	err := q.db.QueryRow(r.Context(), `SELECT image FROM gif_jobs
		WHERE id::text=$1 AND account_id=$2 AND status='done'`, r.PathValue("id"), account.ID).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 404, "gif_not_found")
		return
	}
	if err != nil {
		writeError(w, 503, "database_unavailable")
		return
	}
	w.Header().Set("Content-Type", "image/gif")
	http.ServeContent(w, r, "clips.gif", time.Time{}, bytes.NewReader(data))
}

func (q queue) processGIF(ctx context.Context) {
	query, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	// An interrupted request might already have been charged. Never replay it.
	_, err := q.db.Exec(query, `UPDATE gif_jobs SET status='failed' WHERE status='running'
		AND started_at<now()-interval '6 minutes'`)
	if err != nil {
		return
	}
	var id, account, prompt string
	var gift bool
	err = q.db.QueryRow(query, `UPDATE gif_jobs SET status='running',started_at=now()
		WHERE id=(SELECT id FROM gif_jobs WHERE status='queued' ORDER BY created_at
			LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,account_id,prompt,sponsored`).Scan(&id, &account, &prompt, &gift)
	if err != nil {
		return
	}
	key := q.gifJobKey(query, account, gift)
	cancel()
	run, finish := context.WithTimeout(ctx, 5*time.Minute)
	data := renderGIF(run, key, prompt)
	finish()
	status := "done"
	if data == nil {
		status = "failed"
	}
	save, end := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer end()
	_, err = q.db.Exec(save, `UPDATE gif_jobs SET status=$2,image=$3 WHERE id=$1 AND status='running'`, id, status, data)
	if err != nil {
		log.Printf("could not save GIF job %s", id)
	}
}

func (q queue) gifJobKey(ctx context.Context, account string, gift bool) string {
	var enabled bool
	if q.db.QueryRow(ctx, `SELECT enabled FROM customer_accounts WHERE id=$1`, account).Scan(&enabled) != nil || !enabled {
		return ""
	}
	if gift {
		return q.gifs.platformKey
	}
	var encrypted []byte
	err := q.db.QueryRow(ctx, `SELECT encrypted_key FROM gif_keys WHERE account_id=$1`, account).Scan(&encrypted)
	n := q.gifs.seal.NonceSize()
	if err != nil || len(encrypted) < n {
		return ""
	}
	key, err := q.gifs.seal.Open(nil, encrypted[:n], encrypted[n:], []byte(account))
	if err != nil {
		return ""
	}
	return string(key)
}

func renderGIF(ctx context.Context, key, prompt string) []byte {
	if key == "" {
		return nil
	}
	client := openai.NewClient(option.WithAPIKey(key), option.WithBaseURL("https://api.openai.com/v1"), option.WithMaxRetries(0))
	result, err := client.Images.Generate(ctx, openai.ImageGenerateParams{
		Model:  "gpt-image-2.6-flare",
		Prompt: prompt,
		Size:   "512x512",
	}, option.WithJSONSet("output_format", "gif"), option.WithJSONSet("frame_count", 9), option.WithJSONSet("frame_duration_ms", 200))
	if err != nil || len(result.Data) == 0 || len(result.Data[0].B64JSON) > base64.StdEncoding.EncodedLen(8<<20) {
		return nil
	}
	data, err := base64.StdEncoding.DecodeString(result.Data[0].B64JSON)
	if err != nil {
		return nil
	}
	config, err := gif.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width > 512 || config.Height > 512 {
		return nil
	}
	animation, err := gif.DecodeAll(bytes.NewReader(data))
	if err != nil || len(animation.Image) < 2 {
		return nil
	}
	return data
}

func (q queue) runGIFWorker(ctx context.Context) {
	tick := time.NewTicker(2 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			q.processGIF(ctx)
		}
	}
}

// setGIFGrant is an operator-only command. Zero remaining revokes new requests.
func setGIFGrant(ctx context.Context, db *pgxpool.Pool, input io.Reader) error {
	var grant struct {
		Email     string    `json:"email"`
		Expires   time.Time `json:"expires_at"`
		Remaining int       `json:"remaining"`
	}
	err := json.NewDecoder(io.LimitReader(input, 4096)).Decode(&grant)
	if err != nil || grant.Email == "" || grant.Remaining < 0 || grant.Remaining > 1000 ||
		(grant.Remaining > 0 && !grant.Expires.After(time.Now())) {
		return errors.New("provide email, future expires_at and a remaining balance between 0 and 1000")
	}
	email := strings.ToLower(strings.TrimSpace(grant.Email))
	tag, err := db.Exec(ctx, `INSERT INTO gif_grants (account_id,expires_at,remaining)
		SELECT id,$2,$3 FROM customer_accounts WHERE email=$1 AND enabled
		ON CONFLICT(account_id) DO UPDATE SET expires_at=excluded.expires_at,remaining=excluded.remaining`,
		email, grant.Expires, grant.Remaining)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return errors.New("active Clips account not found")
	}
	return nil
}
