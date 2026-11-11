package main

import (
	"bytes"
	"context"
	"net/http"
	"time"
)

func (q queue) integrationArtifact(w http.ResponseWriter, r *http.Request, organization string) {
	id := r.PathValue("id")
	if !validKey.MatchString(id) {
		writeError(w, 404, "artifact_not_found")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	var data []byte
	err := q.db.QueryRow(ctx, `SELECT v.mp4 FROM job_videos v JOIN app_projects p ON p.job_id=v.job_id
		JOIN platform_access g ON g.account_id=p.account_id AND g.solution='clips' AND g.organization_id=$2 AND g.enabled
		WHERE v.job_id=$1 AND EXISTS(SELECT 1 FROM integration_outbox e WHERE e.organization_id=$2
		AND e.source_solution='clips' AND e.subject='projects/'||p.job_id)`, id, organization).Scan(&data)
	if err != nil {
		writeError(w, 404, "artifact_not_found")
		return
	}
	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Disposition", `attachment; filename="clips-go-vertical.mp4"`)
	http.ServeContent(w, r, "clips-go-vertical.mp4", time.Time{}, bytes.NewReader(data))
}

func (q queue) appIntegrationStatus(w http.ResponseWriter, r *http.Request) {
	identity, ok := appIdentity(r)
	if !ok {
		writeError(w, 401, "customer_session_required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	rows, err := q.db.Query(ctx, `SELECT destination,project_id,state,created_at FROM solution_inbox.deliveries
		WHERE organization_id=$1 AND actor_id=$2 ORDER BY created_at DESC LIMIT 100`, identity.OrganizationID, identity.ID)
	if err != nil {
		writeError(w, 503, "integration_storage_unavailable")
		return
	}
	defer rows.Close()
	result := []map[string]any{}
	for rows.Next() {
		var destination, project, state string
		var created time.Time
		if rows.Scan(&destination, &project, &state, &created) != nil {
			writeError(w, 503, "integration_storage_unavailable")
			return
		}
		result = append(result, map[string]any{"destination": destination, "project_id": project, "state": state, "created_at": created})
	}
	if rows.Err() != nil {
		writeError(w, 503, "integration_storage_unavailable")
		return
	}
	writeJSON(w, 200, map[string]any{"deliveries": result})
}
