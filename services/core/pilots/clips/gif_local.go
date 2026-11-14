package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func (q queue) localGIFRoutes() http.Handler {
	mux := http.NewServeMux()
	q.mountGIF(mux)
	secret := []byte(os.Getenv("SDR_CLIPS_BRIDGE_KEY"))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		subject := r.Header.Get("X-Arkom-Clips-Subject")
		scope := r.Header.Get("X-Arkom-Clips-Scope")
		signature, signatureErr := hex.DecodeString(r.Header.Get("X-Arkom-Clips-Signature"))
		id, idErr := hex.DecodeString(strings.ReplaceAll(subject, "-", ""))
		mac := hmac.New(sha256.New, secret)
		mac.Write([]byte("clips-gif/v1\x00" + subject + "\x00" + scope + "\x00" + r.Method + "\x00" + r.URL.Path))
		if len(secret) < 32 || len(subject) != 36 || len(id) != 16 || idErr != nil ||
			signatureErr != nil || !hmac.Equal(signature, mac.Sum(nil)) ||
			(scope != "read" && scope != "write" && scope != "demo") {
			writeError(w, 401, "customer_session_required")
			return
		}
		if r.Method != http.MethodGet && scope == "read" {
			writeError(w, 403, "forbidden")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		tx, err := q.db.Begin(ctx)
		if err != nil {
			writeError(w, 503, "database_unavailable")
			return
		}
		defer tx.Rollback(ctx)

		// The signed subject is derived from both organization and user by SDR.
		// Provision only an opaque account in the local CLIPS database.
		_, err = tx.Exec(ctx, `INSERT INTO customer_accounts(source_project,source_user_id,email,display_name)
			VALUES('arkom-local-gifs',$1,$1::uuid::text||'@clips.invalid','Arkom local')
			ON CONFLICT(source_project,source_user_id) DO NOTHING`, subject)
		var account customerIdentity
		if err == nil {
			err = tx.QueryRow(ctx, `SELECT id FROM customer_accounts
				WHERE source_project='arkom-local-gifs' AND source_user_id=$1 AND enabled`, subject).Scan(&account.ID)
		}
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, 403, "forbidden")
			return
		}
		if err == nil && scope == "demo" && q.gifs.platformKey != "" {
			_, err = tx.Exec(ctx, `INSERT INTO gif_grants(account_id,expires_at,remaining)
				VALUES($1,now()+interval '30 days',3) ON CONFLICT(account_id) DO NOTHING`, account.ID)
		}
		if err == nil {
			err = tx.Commit(ctx)
		}
		if err != nil {
			writeError(w, 503, "database_unavailable")
			return
		}
		mux.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), customerProfileKey{}, account)))
	})
}
