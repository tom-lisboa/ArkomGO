package main

import (
	"context"
	"deeph/pkg/arkom"
	"encoding/json"
	"net/http"
	"slices"
	"sort"
	"strings"
	"time"
)

type QualificationVersion struct {
	Version      int        `json:"version"`
	Spec         arkom.Spec `json:"spec"`
	Actor        string     `json:"actor"`
	At           time.Time  `json:"at"`
	RestoredFrom int        `json:"restored_from,omitempty"`
}
type GenesisChange struct {
	ID             string         `json:"id"`
	Org            string         `json:"organization_id"`
	RunID          string         `json:"run_id"`
	Summary        string         `json:"summary"`
	Spec           arkom.Spec     `json:"spec"`
	Before         arkom.Spec     `json:"before"`
	BaseVersion    int            `json:"base_version"`
	AppliedVersion int            `json:"applied_version,omitempty"`
	Status         string         `json:"status"`
	Artifact       arkom.Artifact `json:"artifact"`
	Previewed      bool           `json:"previewed"`
	CreatedAt      time.Time      `json:"created_at"`
}

func (a *App) qualification(org string) QualificationVersion {
	versions := a.state.Platform.Qualifications[org]
	if len(versions) == 0 {
		return QualificationVersion{Version: 1, Spec: arkom.Default()}
	}
	return versions[len(versions)-1]
}

// finishGenesisChange receives server-captured version and model output. It never
// accepts a specification from a publication request or reads model-selected paths.
func (a *App) finishGenesisChange(ctx context.Context, org, runID, raw string, base QualificationVersion) (string, error) {
	review, err := arkom.ParseReview(raw)
	if err != nil {
		return "", err
	}
	if review.Change == nil {
		return "", nil
	}
	artifact, err := arkom.Build(ctx, *review.Change)
	if err != nil {
		return "", err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	change := &GenesisChange{ID: "change_" + token(), Org: org, RunID: runID, Summary: review.Summary, Spec: *review.Change, Before: base.Spec, BaseVersion: base.Version, Status: "ready", Artifact: artifact, CreatedAt: a.now().UTC()}
	err = a.transact(func() {
		if a.state.Platform.GenesisChanges == nil {
			a.state.Platform.GenesisChanges = map[string]*GenesisChange{}
		}
		a.state.Platform.GenesisChanges[change.ID] = change
		a.record(AuditEntry{Org: org, Actor: "genesis", Action: "genesis.change.prepared", Operation: change.ID, Reason: "Go validado; aguardando prévia e aprovação"})
	})
	return change.ID, err
}

// All calls are authenticated by genesisDemoHTTP. The application lock encloses
// authorization, revision check and durable mutation to avoid cross-request races.
func (a *App) genesisChangeHTTP(w http.ResponseWriter, r *http.Request, u User) bool {
	path := strings.TrimPrefix(r.URL.Path, "/v1/sdr/genesis-demo/")
	if path == "capabilities" && r.Method == "GET" {
		write(w, 200, json.RawMessage(arkom.Catalog))
		return true
	}
	if path != "changes" && !strings.HasPrefix(path, "changes/") {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if path == "changes" && r.Method == "GET" {
		items := []*GenesisChange{}
		for _, p := range a.state.Platform.GenesisChanges {
			if p.Org == u.Org {
				items = append(items, p)
			}
		}
		sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
		_, connected := a.crmRoutes[u.Org]
		write(w, 200, map[string]any{"changes": items, "current": a.qualification(u.Org), "crm_connected": connected, "can_publish": u.Role == "admin"})
		return true
	}
	parts := strings.Split(path, "/")
	if len(parts) != 3 {
		fail(w, 404, "not_found")
		return true
	}
	p := a.state.Platform.GenesisChanges[parts[1]]
	if p == nil || p.Org != u.Org {
		fail(w, 404, "not_found")
		return true
	}
	if r.Method != "POST" {
		fail(w, 405, "method_not_allowed")
		return true
	}
	if u.Role == "viewer" || (parts[2] != "preview" && u.Role != "admin") {
		fail(w, 403, "forbidden")
		return true
	}
	var body struct {
		Facts           map[string]string `json:"facts,omitempty"`
		ExpectedVersion int               `json:"expected_version,omitempty"`
		Reason          string            `json:"reason,omitempty"`
	}
	if !decodeCore(w, r, &body) {
		return true
	}
	switch parts[2] {
	case "preview":
		if len(body.Facts) > len(arkom.Fields) {
			fail(w, 422, "invalid_facts")
			return true
		}
		for k, v := range body.Facts {
			if !slices.Contains(arkom.Fields, k) || len([]rune(v)) > 500 {
				fail(w, 422, "invalid_facts")
				return true
			}
		}
		if !p.Artifact.Verified || p.Spec.Validate() != nil {
			fail(w, 409, "unverified_change")
			return true
		}
		before := p.Before.Missing(body.Facts)
		after := p.Spec.Missing(body.Facts)
		if a.transact(func() {
			p.Previewed = true
			a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "genesis.change.previewed", Operation: p.ID})
		}) != nil {
			fail(w, 503, "storage_unavailable")
			return true
		}
		write(w, 200, map[string]any{"before_qualified": len(before) == 0, "after_qualified": len(after) == 0, "missing": after, "effects_applied": false, "note": "Simulação com dados informados; nenhum contato ou oportunidade foi criado."})
	case "publish", "restore":
		current := a.qualification(u.Org)
		if !textOK(body.Reason, 500, true) {
			fail(w, 422, "reason_required")
			return true
		}
		// A replay of an already completed operation reports the original result,
		// without rolling a later configuration back or producing another version.
		if (parts[2] == "publish" && p.AppliedVersion > 0) || (parts[2] == "restore" && p.Status == "restored") {
			write(w, 200, map[string]any{"change": p, "current": current, "duplicate": true})
			return true
		}
		if body.ExpectedVersion != current.Version {
			fail(w, 409, "qualification_version_conflict")
			return true
		}
		spec := p.Spec
		restored := 0
		if parts[2] == "publish" {
			artifact, err := arkom.Generate(p.Spec)
			if p.Status != "ready" || !p.Previewed || !p.Artifact.Verified || err != nil || artifact.Digest != p.Artifact.Digest {
				fail(w, 409, "preview_and_verified_build_required")
				return true
			}
			if p.BaseVersion != current.Version {
				fail(w, 409, "qualification_version_conflict")
				return true
			}
		} else {
			if p.Status != "published" || p.AppliedVersion != current.Version {
				fail(w, 409, "qualification_version_conflict")
				return true
			}
			spec = p.Before
			restored = p.BaseVersion
		}
		if spec.Validate() != nil {
			fail(w, 422, "unsupported_change")
			return true
		}
		if len(a.state.Platform.Qualifications[u.Org]) >= 100 {
			fail(w, 409, "version_limit")
			return true
		}
		next := QualificationVersion{Version: current.Version + 1, Spec: spec, Actor: u.ID, At: a.now().UTC(), RestoredFrom: restored}
		if a.transact(func() {
			if a.state.Platform.Qualifications == nil {
				a.state.Platform.Qualifications = map[string][]QualificationVersion{}
			}
			a.state.Platform.Qualifications[u.Org] = append(a.state.Platform.Qualifications[u.Org], next)
			if restored > 0 {
				p.Status = "restored"
			} else {
				p.Status = "published"
				p.AppliedVersion = next.Version
			}
			a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "genesis.change." + parts[2], Operation: p.ID, Revision: next.Version, Reason: body.Reason})
		}) != nil {
			fail(w, 503, "storage_unavailable")
			return true
		}
		write(w, 200, map[string]any{"change": p, "current": next, "duplicate": false})
	default:
		fail(w, 404, "not_found")
	}
	return true
}
