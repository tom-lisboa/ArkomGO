package main

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

//go:embed interface.sql
var interfaceSchema string

func interfacePath(path string) bool {
	switch path {
	case "/", "/login", "/signup", "/forgot-password", "/reset-password", "/dashboard", "/new-project", "/settings", "/gifs", "/jornadas", "/favicon.ico", "/robots.txt":
		return true
	}
	return strings.HasPrefix(path, "/assets/") || strings.HasPrefix(path, "/project/")
}

func mountInterface(mux *http.ServeMux, directory string, authOrigin string) error {
	if !filepath.IsAbs(directory) {
		return errors.New("absolute frontend directory required")
	}
	info, err := os.Stat(filepath.Join(directory, "index.html"))
	if err != nil || !info.Mode().IsRegular() {
		return errors.New("compiled official frontend is required")
	}
	files := http.FileServer(http.Dir(directory))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" && r.Method != "HEAD" {
			writeError(w, 405, "method_not_allowed")
			return
		}
		if !interfacePath(r.URL.Path) {
			writeError(w, 404, "not_found")
			return
		}
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' "+authOrigin+"; img-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		w.Header().Set("Referrer-Policy", "same-origin")
		if strings.HasPrefix(r.URL.Path, "/assets/") || r.URL.Path == "/favicon.ico" || r.URL.Path == "/robots.txt" {
			path := strings.TrimPrefix(r.URL.Path, "/")
			if !fs.ValidPath(path) {
				writeError(w, 404, "not_found")
				return
			}
			info, err := os.Stat(filepath.Join(directory, path))
			if err != nil || !info.Mode().IsRegular() {
				writeError(w, 404, "not_found")
				return
			}
			if strings.HasPrefix(path, "assets/") {
				w.Header().Set("Cache-Control", "public,max-age=31536000,immutable")
			}
			files.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(directory, "index.html"))
	})
	return nil
}

type appProject struct {
	ID          string    `json:"id"`
	OrgID       string    `json:"org_id"`
	UserID      string    `json:"user_id"`
	Title       string    `json:"title"`
	Status      string    `json:"status"`
	SourceType  string    `json:"source_type"`
	StoragePath string    `json:"storage_path"`
	Resolution  string    `json:"resolution"`
	Duration    float64   `json:"duration"`
	Start       float64   `json:"start_seconds"`
	Error       *string   `json:"error_message"`
	Created     time.Time `json:"created_at"`
}

func appIdentity(r *http.Request) (customerIdentity, bool) {
	i, ok := r.Context().Value(customerProfileKey{}).(customerIdentity)
	return i, ok
}

func (q queue) mountApp(mux *http.ServeMux) {
	q.mountGIF(mux)
	mux.HandleFunc("GET /app/integrations", q.appIntegrationStatus)
	mux.HandleFunc("POST /app/projects", q.studioSubmit)
	mux.HandleFunc("GET /rest/v1/{table}", q.appRead)
	mux.HandleFunc("DELETE /rest/v1/{table}", q.appDelete)
	mux.HandleFunc("POST /storage/v1/object/sign/clips-videos/{kind}/{file}", q.appSign)
	mux.HandleFunc("GET /storage/v1/object/sign/clips-videos/{kind}/{file}", q.appFile)
	// Deliberate, explicit local refusals; never relay unknown requests to production.
	mux.HandleFunc("/rest/v1/", appUnavailable)
	mux.HandleFunc("/storage/v1/", appUnavailable)
	mux.HandleFunc("/functions/v1/", appUnavailable)
	mux.HandleFunc("/app/", appUnavailable)
}

func appUnavailable(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 501, map[string]string{"error": "not_available_in_homolog", "message": "Esta função ainda não está disponível na homologação. Nenhuma operação foi enviada ao CLIPS atual."})
}

func (q queue) projects(ctx context.Context, identity customerIdentity, id string) ([]appProject, error) {
	rows, err := q.db.Query(ctx, `SELECT p.job_id,p.title,j.status,j.error_code,p.created_at,s.start_seconds,s.duration_seconds
		FROM app_projects p JOIN jobs j ON j.id=p.job_id JOIN studio_inputs s ON s.job_id=p.job_id
		WHERE p.account_id=$1 AND ($2='' OR p.job_id=$2) ORDER BY p.created_at DESC LIMIT 100`, identity.ID, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []appProject{}
	for rows.Next() {
		p := appProject{OrgID: identity.WorkspaceID, UserID: identity.SourceID, SourceType: "upload", Resolution: "720p"}
		if err := rows.Scan(&p.ID, &p.Title, &p.Status, &p.Error, &p.Created, &p.Start, &p.Duration); err != nil {
			return nil, err
		}
		switch p.Status {
		case "succeeded":
			p.Status = "completed"
		case "failed":
			p.Status = "error"
		case "running":
			p.Status = "processing"
		default:
			p.Status = "pending"
		}
		p.StoragePath = "source/" + p.ID + ".mp4"
		result = append(result, p)
	}
	return result, rows.Err()
}

func appFilter(r *http.Request, key string) (string, bool) {
	value := r.URL.Query().Get(key)
	if value == "" {
		return "", true
	}
	if !strings.HasPrefix(value, "eq.") || !validKey.MatchString(strings.TrimPrefix(value, "eq.")) {
		return "", false
	}
	return strings.TrimPrefix(value, "eq."), true
}

func appResult(w http.ResponseWriter, r *http.Request, rows any, count int) {
	if strings.Contains(r.Header.Get("Accept"), "application/vnd.pgrst.object+json") {
		if count != 1 {
			writeJSON(w, 406, map[string]string{"code": "PGRST116", "message": "No matching record"})
			return
		}
		// The callers pass typed slices; encoding a single raw element preserves types.
		data, _ := json.Marshal(rows)
		var list []json.RawMessage
		_ = json.Unmarshal(data, &list)
		writeJSON(w, 200, list[0])
		return
	}
	writeJSON(w, 200, rows)
}

func (q queue) appRead(w http.ResponseWriter, r *http.Request) {
	i, ok := appIdentity(r)
	if !ok {
		writeError(w, 401, "customer_session_required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	table := r.PathValue("table")
	profile := r.Header.Get("Accept-Profile")
	if profile == "core" {
		var rows []map[string]any
		switch table {
		case "profiles":
			rows = []map[string]any{{"user_id": i.SourceID, "full_name": i.Name, "display_name": i.Name, "email": i.Email, "is_approved": true}}
		case "roles":
			rows = []map[string]any{{"user_id": i.SourceID, "app": "clips", "role": "user"}}
		case "memberships":
			rows = []map[string]any{{"user_id": i.SourceID, "org_id": i.WorkspaceID, "role": "member"}}
		default:
			appUnavailable(w, r)
			return
		}
		// Own profile only; honor equality filters, including the QA admin gate.
		for _, key := range []string{"user_id", "org_id", "app", "role"} {
			if want := r.URL.Query().Get(key); strings.HasPrefix(want, "eq.") {
				if rows[0][key] != strings.TrimPrefix(want, "eq.") {
					rows = []map[string]any{}
					break
				}
			}
		}
		appResult(w, r, rows, len(rows))
		return
	}
	if profile != "" && profile != "app_clips" {
		appUnavailable(w, r)
		return
	}
	key := "id"
	if table != "projects" {
		key = "project_id"
	}
	id, valid := appFilter(r, key)
	if !valid {
		writeError(w, 400, "invalid_filter")
		return
	}
	projects, err := q.projects(ctx, i, id)
	if err != nil {
		writeError(w, 503, "database_unavailable")
		return
	}
	switch table {
	case "projects":
		appResult(w, r, projects, len(projects))
	case "clips":
		clips := []map[string]any{}
		for _, p := range projects {
			if p.Status == "completed" {
				clips = append(clips, map[string]any{
					"id": p.ID, "project_id": p.ID, "org_id": i.WorkspaceID, "title": "Trecho selecionado", "start_time": p.Start,
					"end_time": p.Start + p.Duration, "score": nil, "format": "9:16", "transcript_excerpt": "", "triage_status": "pending", "created_at": p.Created})
			}
		}
		appResult(w, r, clips, len(clips))
	case "transcriptions":
		appResult(w, r, []map[string]any{}, 0)
	default:
		appUnavailable(w, r)
	}
}

func (q queue) appDelete(w http.ResponseWriter, r *http.Request) {
	i, ok := appIdentity(r)
	if !ok {
		writeError(w, 401, "customer_session_required")
		return
	}
	if r.PathValue("table") != "projects" {
		appUnavailable(w, r)
		return
	}
	id, valid := appFilter(r, "id")
	if !valid || id == "" {
		writeError(w, 400, "project_required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	var deleted string
	if q.integrations {
		var pending bool
		err := q.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM integration_outbox e
			JOIN integration_grants g ON g.organization_id=e.organization_id AND g.source_solution=e.source_solution AND g.can_read
			JOIN integration_clients c ON c.id=g.client_id AND c.enabled AND c.solution IN ('social','finance','bia-sdr')
			WHERE e.organization_id=$1 AND e.source_solution='clips' AND e.subject='projects/'||$2
			AND NOT EXISTS(SELECT 1 FROM integration_acks a WHERE a.client_id=c.id AND a.event_id=e.id))`, i.OrganizationID, id).Scan(&pending)
		if err != nil {
			writeError(w, 503, "integration_storage_unavailable")
			return
		}
		if pending {
			writeError(w, 409, "integration_delivery_pending")
			return
		}
	}
	tx, err := q.db.Begin(ctx)
	if err != nil {
		writeError(w, 503, "database_unavailable")
		return
	}
	defer tx.Rollback(ctx)
	err = tx.QueryRow(ctx, `SELECT j.id FROM jobs j JOIN app_projects p ON p.job_id=j.id WHERE p.account_id=$1
		AND p.job_id=$2 AND j.status IN ('succeeded','failed') FOR UPDATE OF j`, i.ID, id).Scan(&deleted)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 409, "project_not_found_or_still_processing")
		return
	}
	if err != nil {
		writeError(w, 503, "database_unavailable")
		return
	}
	if _, err = tx.Exec(ctx, `DELETE FROM studio_inputs WHERE job_id=$1`, id); err == nil {
		_, err = tx.Exec(ctx, `DELETE FROM jobs WHERE id=$1`, id)
	}
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		writeError(w, 503, "database_unavailable")
		return
	}
	writeJSON(w, 200, []map[string]string{{"id": deleted}})
}

func appFileID(r *http.Request) (string, bool) {
	file := r.PathValue("file")
	id := strings.TrimSuffix(file, ".mp4")
	return id, file == id+".mp4" && validKey.MatchString(id) && (r.PathValue("kind") == "source" || r.PathValue("kind") == "exports")
}

func (q queue) appSign(w http.ResponseWriter, r *http.Request) {
	id, valid := appFileID(r)
	if !valid {
		writeError(w, 404, "not_found")
		return
	}
	r.SetPathValue("id", id)
	if !q.studioOwns(w, r) {
		return
	}
	// The SDK-compatible URL remains private: every media request requires the
	// same secure session cookie. No bearer token or team key goes in the URL.
	writeJSON(w, 200, map[string]string{"signedURL": "/object/sign/clips-videos/" + r.PathValue("kind") + "/" + id + ".mp4"})
}

func (q queue) appFile(w http.ResponseWriter, r *http.Request) {
	id, valid := appFileID(r)
	if !valid {
		writeError(w, 404, "not_found")
		return
	}
	r.SetPathValue("id", id)
	if !q.studioOwns(w, r) {
		return
	}
	if r.PathValue("kind") == "exports" {
		filename := ""
		if r.URL.Query().Has("download") {
			filename = "clips-go-vertical.mp4"
		}
		q.serveVideo(w, r, filename)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	var source []byte
	if err := q.db.QueryRow(ctx, `SELECT source FROM studio_inputs WHERE job_id=$1`, id).Scan(&source); err != nil {
		writeError(w, 404, "not_found")
		return
	}
	w.Header().Set("Content-Type", "video/mp4")
	http.ServeContent(w, r, "source.mp4", time.Time{}, bytes.NewReader(source))
}
