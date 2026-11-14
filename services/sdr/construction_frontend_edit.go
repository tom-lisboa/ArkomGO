package main

import (
	"context"
	"deeph/pkg/application"
	"deeph/pkg/construction"
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

func frontendEditablePath(p string) bool {
	return construction.ValidPath(p) && strings.HasPrefix(p, "frontend/src/") &&
		(strings.HasSuffix(p, ".svelte") || strings.HasSuffix(p, ".css") || strings.HasSuffix(p, ".js") || strings.HasSuffix(p, ".ts"))
}

func (a *App) editConstructionFrontend(w http.ResponseWriter, r *http.Request, u User, id string) {
	var in struct {
		Sequence int               `json:"sequence"`
		Files    map[string]string `json:"files"`
	}
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 768<<10))
	d.DisallowUnknownFields()
	if d.Decode(&in) != nil || d.Decode(new(any)) != io.EOF {
		fail(w, 400, "invalid_json")
		return
	}
	a.mu.Lock()
	b := a.state.Platform.Constructions[id]
	if b == nil || b.Org != u.Org {
		a.mu.Unlock()
		fail(w, 404, "not_found")
		return
	}
	if u.Role == "viewer" {
		a.mu.Unlock()
		fail(w, 403, "forbidden")
		return
	}
	if a.constructionClosed || b.Status == "running" || a.frontendEditing[u.Org] || in.Sequence != len(b.Traces) {
		a.mu.Unlock()
		fail(w, 409, "frontend_edit_conflict")
		return
	}
	if !construction.IsSvelte(b.Files) || (b.Status == "ready" && b.contractStatus() != "validated") {
		a.mu.Unlock()
		fail(w, 409, "frontend_edit_unavailable")
		return
	}
	files := map[string]string{}
	for p, s := range b.Files {
		files[p] = s
	}
	if len(in.Files) == 0 || len(in.Files) > 48 {
		a.mu.Unlock()
		fail(w, 422, "frontend_edit_invalid")
		return
	}
	for p, s := range in.Files {
		if !frontendEditablePath(p) || len(s) > 48000 {
			a.mu.Unlock()
			fail(w, 422, "frontend_edit_invalid")
			return
		}
		files[p] = s
	}
	count, size := 0, 0
	for p, s := range files {
		if strings.HasPrefix(p, "frontend/src/") {
			count++
			size += len(s)
		}
	}
	if count > 48 || size > 350000 {
		a.mu.Unlock()
		fail(w, 422, "frontend_edit_invalid")
		return
	}
	compiler := construction.FrontendCompiler(construction.Sandbox{})
	if a.constructionSetup != nil {
		_, tester, err := a.constructionSetup()
		c, ok := tester.(construction.FrontendCompiler)
		if err != nil || !ok {
			a.mu.Unlock()
			fail(w, 503, "frontend_compiler_unavailable")
			return
		}
		compiler = c
	}
	if a.frontendEditing == nil {
		a.frontendEditing = map[string]bool{}
	}
	a.frontendEditing[u.Org] = true
	originalDigest := application.Digest(b.Files)
	a.mu.Unlock()
	defer func() { a.mu.Lock(); delete(a.frontendEditing, u.Org); a.mu.Unlock() }()
	ctx, cancel := context.WithTimeout(r.Context(), 50*time.Second)
	defer cancel()
	compiled, events, err := construction.CompileFrontendFiles(ctx, files, compiler)
	if err != nil {
		// Diagnostics are compiler text; the browser renders them only as text.
		write(w, 422, map[string]any{"error": "frontend_compilation_failed", "diagnostics": events})
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	b = a.state.Platform.Constructions[id]
	if b == nil || b.Org != u.Org || b.Status == "running" || len(b.Traces) != in.Sequence || application.Digest(b.Files) != originalDigest || a.constructionClosed {
		fail(w, 409, "frontend_edit_conflict")
		return
	}
	revision := b.Revision
	var sealed *application.Contract
	if b.Status == "ready" {
		_, revision = a.constructionIdentity(u.Org, b)
		sealed, err = application.Seal(b.ApplicationID, revision, compiled)
		if err != nil {
			fail(w, 422, "frontend_edit_invalid")
			return
		}
	}
	if err = a.transact(func() {
		paths := []string{}
		for p, s := range compiled {
			if b.Files[p] != s {
				paths = append(paths, p)
			}
		}
		sort.Strings(paths)
		now := a.now().UTC()
		for _, p := range paths {
			b.Traces = append(b.Traces, ConstructionTrace{construction.Event{Kind: "file.written", Agent: "user", StepID: "interface", Path: p, Before: b.Files[p], After: compiled[p], Summary: "Alteração de frontend salva pelo cliente"}, len(b.Traces) + 1, now})
		}
		b.Files = compiled
		b.Revision = revision
		b.Contract = sealed
		b.UpdatedAt = now
		b.Traces = append(b.Traces, ConstructionTrace{construction.Event{Kind: "frontend.edited", Agent: "user", StepID: "interface", Summary: "Frontend Svelte editado e compilado pelo cliente"}, len(b.Traces) + 1, now})
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "construction.frontend.edited", Operation: id})
	}); err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	// Any existing process is bound to the old source digest and is stopped.
	a.runtimeMu.Lock()
	if p := a.runtimes[id]; p != nil {
		p.cancel()
		if p.process != nil {
			p.process.Close()
		}
		p.status = "stopped"
	}
	a.runtimeMu.Unlock()
	a.signalConstruction()
	write(w, 200, map[string]any{"build": b.summary(), "files": b.Files, "traces": b.Traces})
}

// A blank frontend has no API routes and does not execute a backend or a model.
func (a *App) createBlankFrontend(w http.ResponseWriter, r *http.Request, u User) {
	var in struct {
		Name string `json:"name"`
	}
	if !decodeCore(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if !textOK(in.Name, 100, true) {
		fail(w, 422, "frontend_edit_invalid")
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if key == "" || len(key) > 100 {
		fail(w, 422, "frontend_edit_invalid")
		return
	}
	a.mu.Lock()
	if u.Role == "viewer" {
		a.mu.Unlock()
		fail(w, 403, "forbidden")
		return
	}
	replayKey := "frontend-blank:" + u.Org + ":" + u.ID + ":" + key
	fp := fingerprint(in)
	if a.replay(w, replayKey, fp) {
		a.mu.Unlock()
		return
	}
	if a.constructionClosed || a.frontendEditing[u.Org] {
		a.mu.Unlock()
		fail(w, 409, "frontend_edit_conflict")
		return
	}
	count := 0
	for _, b := range a.state.Platform.Constructions {
		if b.Org == u.Org {
			count++
		}
	}
	if count >= 20 {
		a.mu.Unlock()
		fail(w, 409, "construction_limit")
		return
	}
	compiler := construction.FrontendCompiler(construction.Sandbox{})
	if a.constructionSetup != nil {
		_, tt, err := a.constructionSetup()
		c, ok := tt.(construction.FrontendCompiler)
		if err != nil || !ok {
			a.mu.Unlock()
			fail(w, 503, "frontend_compiler_unavailable")
			return
		}
		compiler = c
	}
	if a.frontendEditing == nil {
		a.frontendEditing = map[string]bool{}
	}
	a.frontendEditing[u.Org] = true
	a.mu.Unlock()
	defer func() { a.mu.Lock(); delete(a.frontendEditing, u.Org); a.mu.Unlock() }()
	files := construction.NewSeed()
	manifest, _ := json.Marshal(application.Manifest{SchemaVersion: application.SchemaVersion, CatalogVersion: "arkom-capabilities-v1", Name: in.Name, Backend: "go", Entrypoint: "frontend/index.html", Routes: []application.Route{}, Capabilities: []string{}})
	files[application.ManifestPath] = string(manifest)
	files["frontend/src/App.svelte"] = blankFrontendSource
	ctx, cancel := context.WithTimeout(r.Context(), 50*time.Second)
	defer cancel()
	files, events, err := construction.CompileFrontendFiles(ctx, files, compiler)
	if err != nil {
		write(w, 422, map[string]any{"error": "frontend_compilation_failed", "diagnostics": events})
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.constructionClosed {
		fail(w, 503, "construction_unavailable")
		return
	}
	appID := "app_" + token()
	sealed, err := application.Seal(appID, 1, files)
	if err != nil {
		fail(w, 422, "frontend_edit_invalid")
		return
	}
	now := a.now().UTC()
	b := &ConstructionBuild{ID: "build_" + token(), ApplicationID: appID, Revision: 1, Org: u.Org, Goal: in.Name, Status: "ready", Files: files, Contract: sealed, CreatedAt: now, UpdatedAt: now}
	b.Traces = []ConstructionTrace{{Event: construction.Event{Kind: "frontend.created", Agent: "user", Summary: "Página Svelte em branco criada pelo cliente; sem execução de IA ou backend"}, Sequence: 1, At: now}}
	if err = a.transact(func() {
		if a.state.Platform.Constructions == nil {
			a.state.Platform.Constructions = map[string]*ConstructionBuild{}
		}
		a.state.Platform.Constructions[b.ID] = b
		raw, _ := json.Marshal(b.summary())
		a.state.Results[replayKey] = result{fp, raw, 201}
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "construction.frontend.created", Operation: b.ID})
	}); err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	a.signalConstruction()
	write(w, 201, b.summary())
}

const blankFrontendSource = `<main>
  <span>SEU NOVO COMEÇO</span>
  <h1>Sua página. Do seu jeito.</h1>
  <p>Selecione Editar página para mudar textos e aparência. No Código Svelte, você pode transformar toda a estrutura.</p>
  <button onclick={() => alert('Personalize esta ação no Código Svelte.')}>Começar por aqui</button>
</main>
<style>
  :global(body) { margin: 0; background: #f8f7f3; color: #263d32; font-family: system-ui, sans-serif; }
  main { max-width: 760px; padding: clamp(32px, 8vw, 96px); }
  span { font-size: 11px; letter-spacing: .2em; }
  h1 { font-size: clamp(42px, 7vw, 80px); font-weight: 500; line-height: 1.05; letter-spacing: -.045em; margin: 28px 0; }
  p { max-width: 430px; font-size: 16px; line-height: 1.7; color: #68726a; }
  button { margin-top: 20px; padding: 15px 24px; border: 0; border-radius: 8px; background: #263d32; color: white; font: inherit; cursor: pointer; }
  button:focus-visible { outline: 3px solid #bd9b5e; outline-offset: 4px; }
</style>
`
