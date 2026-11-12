package main

import (
	"archive/zip"
	"bytes"
	"context"
	"deeph/pkg/application"
	"deeph/pkg/arkom"
	"deeph/pkg/construction"
	"embed"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"sdr-next-pilot/pkg/sdrsdk"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed demo/construction/reference/*
var constructionReferences embed.FS
var constructionControl = struct {
	sync.Mutex
	cancel map[string]context.CancelFunc
}{cancel: map[string]context.CancelFunc{}}

type ConstructionTrace struct {
	construction.Event
	Sequence int       `json:"sequence"`
	At       time.Time `json:"at"`
}
type ConstructionBuild struct {
	ID            string                `json:"id"`
	ApplicationID string                `json:"application_id,omitempty"`
	Revision      int                   `json:"revision,omitempty"`
	Contract      *application.Contract `json:"contract,omitempty"`
	Org           string                `json:"organization_id"`
	Goal          string                `json:"goal"`
	Status        string                `json:"status"`
	ParentID      string                `json:"parent_id,omitempty"`
	CreatedAt     time.Time             `json:"created_at"`
	UpdatedAt     time.Time             `json:"updated_at"`
	Files         map[string]string     `json:"files"`
	Traces        []ConstructionTrace   `json:"traces"`
}

func (b *ConstructionBuild) summary() map[string]any {
	return map[string]any{"id": b.ID, "goal": b.Goal, "status": b.Status, "parent_id": b.ParentID, "created_at": b.CreatedAt, "updated_at": b.UpdatedAt, "files_count": len(b.Files), "sequence": len(b.Traces), "application_id": b.ApplicationID, "revision": b.Revision, "contract_status": b.contractStatus(), "runtime_compatible": construction.RuntimeCompatible(b.Files)}
}
func (a *App) constructionTrace(id string, event construction.Event) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	b := a.state.Platform.Constructions[id]
	if b == nil || b.Status != "running" {
		return errors.New("build_not_running")
	}
	err := a.transact(func() {
		if event.Kind == "file.written" {
			b.Files[event.Path] = event.After
		}
		b.UpdatedAt = a.now().UTC()
		b.Traces = append(b.Traces, ConstructionTrace{event, len(b.Traces) + 1, b.UpdatedAt})
	})
	if err == nil {
		a.signalConstruction()
	}
	return err
}
func (a *App) runConstruction(ctx context.Context, id string, planner *sdrsdk.OpenAIPlanner, initial map[string]string) {
	defer func() {
		constructionControl.Lock()
		delete(constructionControl.cancel, id)
		constructionControl.Unlock()
	}()
	refs := map[string]string{"reference/catalog.json": arkom.Catalog, "reference/platform-contracts.go": construction.Contracts}
	for _, name := range []string{"sdr-types.go.txt", "crm-integration.md"} {
		data, _ := constructionReferences.ReadFile("demo/construction/reference/" + name)
		refs["reference/"+name] = string(data)
	}
	a.mu.Lock()
	goal := a.state.Platform.Constructions[id].Goal
	a.mu.Unlock()
	engine := construction.Engine{Provider: constructionProvider{planner}, Tester: construction.Sandbox{}, References: refs, Emit: func(e construction.Event) error { return a.constructionTrace(id, e) }}
	_, err := engine.Run(ctx, goal, initial)
	a.finishConstruction(id, err, ctx.Err())
}

func (a *App) finishConstruction(id string, err, contextErr error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	b := a.state.Platform.Constructions[id]
	if b == nil || b.Status != "running" {
		return
	}
	var contract *application.Contract
	if err == nil && contextErr == nil {
		contract, err = application.Seal(b.ApplicationID, b.Revision, b.Files)
	}
	saveErr := a.transact(func() {
		b.Contract = contract
		b.Status = "ready"
		summary := "Código construído e testes Go aprovados; implantação ainda não realizada."
		if err != nil {
			b.Status = "failed"
			summary = "A construção parou antes de concluir. Revise os traces e continue a partir dos arquivos preservados."
			// Only stable engine/provider codes are exposed, never response bodies.
			if strings.HasPrefix(err.Error(), "provider: model_") || strings.HasPrefix(err.Error(), "agent_round_limit:") || err.Error() == "agent_reported_blocker" {
				summary += " Motivo: " + err.Error()
			}
		}
		if contextErr != nil {
			b.Status = "cancelled"
			summary = "Construção interrompida; arquivos preservados."
		}
		b.UpdatedAt = a.now().UTC()
		b.Traces = append(b.Traces, ConstructionTrace{construction.Event{Kind: "build." + b.Status, Agent: "system", Summary: summary}, len(b.Traces) + 1, b.UpdatedAt})
		a.record(AuditEntry{Org: b.Org, Actor: "deeph", Action: "construction." + b.Status, Operation: id})
	})
	if saveErr == nil {
		a.signalConstruction()
	}
	if saveErr != nil {
		log.Print("construction final state could not be persisted")
	}
}
func (a *App) constructionHTTP(w http.ResponseWriter, r *http.Request, u User) bool {
	const prefix = "/v1/sdr/genesis-demo/construction"
	if r.URL.Path != prefix && !strings.HasPrefix(r.URL.Path, prefix+"/") {
		return false
	}
	suffix := strings.TrimPrefix(r.URL.Path, prefix)
	parts := strings.Split(strings.Trim(suffix, "/"), "/")
	if len(parts) >= 2 && parts[1] == "runtime" {
		a.runtimeHTTP(w, r, u, parts)
		return true
	}
	if len(parts) == 2 && parts[1] == "events" && r.Method == "GET" {
		a.constructionStream(w, r, u, parts[0])
		return true
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if suffix == "" && r.Method == "GET" {
		items := []map[string]any{}
		for _, b := range a.state.Platform.Constructions {
			if b.Org == u.Org {
				items = append(items, b.summary())
			}
		}
		sort.Slice(items, func(i, j int) bool {
			return items[i]["created_at"].(time.Time).After(items[j]["created_at"].(time.Time))
		})
		write(w, 200, map[string]any{"builds": items, "can_build": u.Role != "viewer"})
		return true
	}
	if suffix == "" && r.Method == "POST" {
		if u.Role == "viewer" {
			fail(w, 403, "forbidden")
			return true
		}
		var body struct {
			Goal     string `json:"goal"`
			ParentID string `json:"parent_id,omitempty"`
		}
		if !decodeCore(w, r, &body) {
			return true
		}
		if !textOK(body.Goal, 4000, true) || len([]rune(body.Goal)) < 15 {
			fail(w, 422, "invalid_goal")
			return true
		}
		count := 0
		for _, b := range a.state.Platform.Constructions {
			if b.Org == u.Org {
				count++
			}
			if b.Status == "running" {
				fail(w, 409, "construction_busy")
				return true
			}
		}
		if count >= 20 {
			fail(w, 409, "construction_limit")
			return true
		}
		initial := construction.Seed()
		var parent *ConstructionBuild
		if body.ParentID != "" {
			parent = a.state.Platform.Constructions[body.ParentID]
			if parent == nil || parent.Org != u.Org {
				fail(w, 404, "not_found")
				return true
			}
			initial = map[string]string{}
			for k, v := range parent.Files {
				initial[k] = v
			}
		}
		if !(construction.Sandbox{}).Available() {
			fail(w, 503, "isolated_runner_unavailable")
			return true
		}
		planner, err := sdrsdk.NewOpenAI(os.Getenv("OPENAI_API_KEY"), os.Getenv("SDR_OPENAI_MODEL"))
		if err != nil {
			fail(w, 503, "genesis_unavailable")
			return true
		}
		applicationID, revision := a.constructionIdentity(u.Org, parent)
		b := &ConstructionBuild{ApplicationID: applicationID, Revision: revision, ID: "build_" + token(), Org: u.Org, Goal: body.Goal, ParentID: body.ParentID, Status: "running", CreatedAt: a.now().UTC(), UpdatedAt: a.now().UTC(), Files: initial, Traces: []ConstructionTrace{}}
		if a.transact(func() {
			if a.state.Platform.Constructions == nil {
				a.state.Platform.Constructions = map[string]*ConstructionBuild{}
			}
			a.state.Platform.Constructions[b.ID] = b
			a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "construction.started", Operation: b.ID})
		}) != nil {
			fail(w, 503, "storage_unavailable")
			return true
		}
		a.signalConstruction()
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
		constructionControl.Lock()
		constructionControl.cancel[b.ID] = cancel
		constructionControl.Unlock()
		go func() { defer cancel(); a.runConstruction(ctx, b.ID, planner, initial) }()
		write(w, 202, b.summary())
		return true
	}
	b := a.state.Platform.Constructions[parts[0]]
	if b == nil || b.Org != u.Org {
		fail(w, 404, "not_found")
		return true
	}
	if len(parts) == 2 && parts[1] == "contract" && r.Method == "GET" {
		result := map[string]any{"application_id": b.ApplicationID, "revision": b.Revision, "status": b.contractStatus(), "contract": nil}
		if b.contractStatus() == "validated" {
			result["contract"] = b.Contract
		}
		if b.ApplicationID != "" {
			manifest, err := application.ValidateFiles(b.Files)
			if err != nil {
				result["validation_error"] = err.Error()
			} else {
				result["manifest"] = manifest
			}
		}
		write(w, 200, result)
		return true
	}
	if len(parts) == 1 && r.Method == "GET" {
		after, _ := strconv.Atoi(r.URL.Query().Get("after"))
		if after < 0 {
			after = 0
		}
		if after > len(b.Traces) {
			after = len(b.Traces)
		}
		write(w, 200, map[string]any{"build": b.summary(), "files": b.Files, "traces": b.Traces[after:]})
		return true
	}
	if len(parts) == 2 && parts[1] == "cancel" && r.Method == "POST" {
		if u.Role == "viewer" {
			fail(w, 403, "forbidden")
			return true
		}
		if b.Status == "running" {
			if a.transact(func() {
				b.Status = "cancelled"
				b.UpdatedAt = a.now().UTC()
				b.Traces = append(b.Traces, ConstructionTrace{construction.Event{Kind: "build.cancelled", Agent: "system", Summary: "Interrompido pelo cliente; arquivos preservados."}, len(b.Traces) + 1, b.UpdatedAt})
				a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "construction.cancelled", Operation: b.ID})
			}) != nil {
				fail(w, 503, "storage_unavailable")
				return true
			}
			a.signalConstruction()
			constructionControl.Lock()
			cancel := constructionControl.cancel[b.ID]
			constructionControl.Unlock()
			if cancel != nil {
				cancel()
			}
		}
		write(w, 200, b.summary())
		return true
	}
	if len(parts) == 2 && parts[1] == "export" && r.Method == "GET" {
		var buf bytes.Buffer
		z := zip.NewWriter(&buf)
		names := []string{}
		for name := range b.Files {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			if name != "backend/go.mod" && !construction.ValidPath(name) {
				continue
			}
			f, _ := z.Create(name)
			_, _ = f.Write([]byte(b.Files[name]))
		}
		if b.contractStatus() == "validated" {
			raw, _ := json.MarshalIndent(b.Contract, "", "  ")
			f, _ := z.Create("application-contract.json")
			_, _ = f.Write(raw)
		}
		manifest, _ := json.MarshalIndent(b.summary(), "", "  ")
		f, _ := z.Create("construction-manifest.json")
		_, _ = f.Write(manifest)
		_ = z.Close()
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", `attachment; filename="genesis-construction.zip"`)
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(buf.Bytes())
		return true
	}
	fail(w, 405, "method_not_allowed")
	return true
}

// Called with a.mu held; revision allocation is committed with the new build.
// Branching from an older revision still allocates a fresh number in the lineage.
func (a *App) constructionIdentity(org string, parent *ConstructionBuild) (string, int) {
	if parent == nil || parent.Org != org || parent.ApplicationID == "" {
		return "app_" + token(), 1
	}
	revision := parent.Revision
	for _, b := range a.state.Platform.Constructions {
		if b.Org == org && b.ApplicationID == parent.ApplicationID && b.Revision > revision {
			revision = b.Revision
		}
	}
	return parent.ApplicationID, revision + 1
}
func (b *ConstructionBuild) contractStatus() string {
	if b.ApplicationID == "" {
		return "legacy"
	}
	if b.Files[application.ManifestPath] == "" {
		return "missing"
	}
	if _, err := application.ValidateFiles(b.Files); err != nil {
		return "invalid"
	}
	if b.Status == "ready" {
		if b.Contract.Matches(b.ApplicationID, b.Revision, b.Files) {
			return "validated"
		}
		return "invalid"
	}
	return "pending"
}
