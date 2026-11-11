package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
)

// These are synthetic identities for the localhost contract test.
const (
	homologOrg     = "org-clips-homolog"
	homologUser    = "usuario-clips-homolog"
	homologProject = "projeto-clips-novo"
	homologClip    = "corte-clips-novo"
	homologName    = "podcast-vertical-legendado.mp4"
)

type homologExport struct {
	queue queue
	key   string
}

func (q queue) mountHomolog(mux *http.ServeMux) {
	h := homologExport{queue: q, key: rand.Text()}
	mux.HandleFunc("POST /homolog/functions/v1/clips_trim-video", h.submit)
	mux.HandleFunc("HEAD /homolog/exports/{id}", h.ready)
	mux.HandleFunc("POST /homolog/exports/{id}/sign", h.sign)
	mux.HandleFunc("GET /homolog/exports/{id}/file", h.download)
}

func homologUserID(w http.ResponseWriter, r *http.Request) string {
	var user string
	switch r.Header.Get("Authorization") {
	case "Bearer fixture-clips-owner":
		user = homologUser
	case "Bearer fixture-clips-colleague":
		user = "colega-clips-homolog"
	default:
		writeError(w, http.StatusUnauthorized, "invalid_fixture_session")
		return ""
	}
	if r.Header.Get("x-org-id") != homologOrg {
		writeError(w, http.StatusForbidden, "fixture_org_mismatch")
		return ""
	}
	return user
}

func (h homologExport) submit(w http.ResponseWriter, r *http.Request) {
	user := homologUserID(w, r)
	if user == "" {
		return
	}
	var input struct {
		Project string  `json:"projectId"`
		Clip    string  `json:"clipId"`
		Start   float64 `json:"startTime"`
		End     float64 `json:"endTime"`
		Format  string  `json:"format"`
		Size    string  `json:"resolution"`
		Mode    string  `json:"mode"`
		Before  float64 `json:"paddingBefore"`
		After   float64 `json:"paddingAfter"`
	}
	body := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048))
	if body.Decode(&input) != nil || body.Decode(new(any)) != io.EOF || input.Project == "" || input.Clip == "" {
		writeError(w, http.StatusBadRequest, "invalid_export")
		return
	}
	if user != homologUser || input.Project != homologProject || input.Clip != homologClip {
		// The local harness reports the routing decision; it never calls production.
		writeJSON(w, http.StatusOK, map[string]string{"route": "legacy"})
		return
	}
	v := h.queue.video
	if input.Start != v.start || input.End != v.start+v.duration || input.Format != "9:16" ||
		input.Size != "720p" || input.Mode != "mp4" || input.Before != 0 || input.After != 0 {
		writeError(w, http.StatusBadRequest, "unsupported_homolog_recipe")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	digest := sha256.Sum256(v.recipe)
	j, _, err := h.queue.enqueue(ctx, "homolog-export-"+hex.EncodeToString(digest[:]), "entrevista-demo")
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "export_unavailable")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"success": true, "processing": true, "exportId": j.ID, "downloadName": homologName,
		"exportPath": homologOrg + "/" + homologUser + "/" + homologProject + "/exports/" + j.ID + ".mp4",
	})
}

func (h homologExport) requireReady(w http.ResponseWriter, r *http.Request) bool {
	user := homologUserID(w, r)
	if user == "" {
		return false
	}
	if user != homologUser {
		writeError(w, http.StatusForbidden, "export_scope_mismatch")
		return false
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	var size int
	err := h.queue.db.QueryRow(ctx, `SELECT octet_length(mp4) FROM job_videos WHERE job_id = $1`, r.PathValue("id")).Scan(&size)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "export_not_ready")
		return false
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "export_unavailable")
		return false
	}
	w.Header().Set("X-Export-Bytes", strconv.Itoa(size))
	return true
}

func (h homologExport) ready(w http.ResponseWriter, r *http.Request) {
	if h.requireReady(w, r) {
		w.WriteHeader(http.StatusOK)
	}
}

func (h homologExport) signature(id, expires string) string {
	mac := hmac.New(sha256.New, []byte(h.key))
	mac.Write([]byte(id + ":" + expires))
	return hex.EncodeToString(mac.Sum(nil))
}

func (h homologExport) sign(w http.ResponseWriter, r *http.Request) {
	if !h.requireReady(w, r) {
		return
	}
	id := r.PathValue("id")
	expires := strconv.FormatInt(time.Now().Add(time.Minute).Unix(), 10)
	path := "/homolog/exports/" + id + "/file?expires=" + expires + "&sig=" + h.signature(id, expires)
	writeJSON(w, http.StatusOK, map[string]string{"signedUrl": "http://" + address + path})
}

func (h homologExport) download(w http.ResponseWriter, r *http.Request) {
	expires := r.URL.Query().Get("expires")
	deadline, err := strconv.ParseInt(expires, 10, 64)
	if err != nil || deadline <= time.Now().Unix() ||
		!hmac.Equal([]byte(r.URL.Query().Get("sig")), []byte(h.signature(r.PathValue("id"), expires))) {
		writeError(w, http.StatusForbidden, "invalid_export_signature")
		return
	}
	h.queue.serveVideo(w, r, homologName)
}
