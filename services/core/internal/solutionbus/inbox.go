package solutionbus

import (
	"bytes"
	"context"
	"net/http"
	"time"
)

func (s Server) inbox(w http.ResponseWriter, r *http.Request) {
	destination := r.URL.Query().Get("destination")
	p, ok := s.authorize(w, r, destination, false)
	if !ok {
		return
	}
	if p.solution != destination {
		fail(w, 403, "destination_scope_denied")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	rows, err := s.DB.Query(ctx, `SELECT id,event_id,project_id,state,COALESCE(media_sha256,''),created_at
		FROM solution_inbox.deliveries WHERE destination=$1 AND organization_id=$2 ORDER BY created_at DESC LIMIT 100`, destination, p.organization)
	if err != nil {
		fail(w, 503, "integration_storage_unavailable")
		return
	}
	defer rows.Close()
	result := []map[string]any{}
	for rows.Next() {
		var id, event, project, state, hash string
		var created time.Time
		if rows.Scan(&id, &event, &project, &state, &hash, &created) != nil {
			fail(w, 503, "integration_storage_unavailable")
			return
		}
		result = append(result, map[string]any{"id": id, "source_event_id": event, "project_id": project, "state": state, "media_sha256": hash, "created_at": created, "organization_id": p.organization, "destination": destination})
	}
	if rows.Err() != nil {
		fail(w, 503, "integration_storage_unavailable")
		return
	}
	respond(w, 200, map[string]any{"deliveries": result})
}
func (s Server) inboxMedia(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authorize(w, r, "social", false)
	if !ok {
		return
	}
	if p.solution != "social" {
		fail(w, 403, "destination_scope_denied")
		return
	}
	if !idRE.MatchString(r.PathValue("id")) {
		fail(w, 404, "not_found")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	var media []byte
	if err := s.DB.QueryRow(ctx, `SELECT media FROM solution_inbox.deliveries WHERE id=$1 AND destination='social' AND organization_id=$2`, r.PathValue("id"), p.organization).Scan(&media); err != nil || len(media) < 12 {
		fail(w, 404, "not_found")
		return
	}
	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Disposition", `attachment; filename="clips-social-draft.mp4"`)
	http.ServeContent(w, r, "clips-social-draft.mp4", time.Time{}, bytes.NewReader(media))
}
