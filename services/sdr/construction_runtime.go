package main

import (
	"context"
	"deeph/pkg/application"
	"deeph/pkg/construction"
	"errors"
	"log"
	"net/http"
	"net/url"
	"path"
	"strings"
)

type runtimeStarter func(context.Context, string, *application.Contract, map[string]string) (construction.Runtime, error)
type previewRuntime struct {
	org, status, message string
	cancel               context.CancelFunc
	context              context.Context
	process              construction.Runtime
	busy                 bool
}

func (a *App) closeRuntimes() {
	a.runtimeMu.Lock()
	defer a.runtimeMu.Unlock()
	a.runtimeClosed = true
	for _, p := range a.runtimes {
		p.cancel()
		if p.process != nil {
			p.process.Close()
		}
	}
}
func runtimeView(p *previewRuntime) map[string]any {
	if p == nil {
		return map[string]any{"status": "stopped"}
	}
	return map[string]any{"status": p.status, "message": p.message}
}
func (a *App) runtimeHTTP(w http.ResponseWriter, r *http.Request, u User, parts []string) {
	if len(parts) < 2 || len(parts) > 3 {
		fail(w, 404, "not_found")
		return
	}
	action := "status"
	if len(parts) == 3 {
		action = parts[2]
	}
	if (action == "status" && r.Method != "GET") || (action != "status" && r.Method != "POST") {
		fail(w, 405, "method_not_allowed")
		return
	}
	if action != "status" && action != "start" && action != "stop" && action != "request" {
		fail(w, 404, "not_found")
		return
	}
	var in construction.RuntimeRequest
	if action == "request" && !decodeCore(w, r, &in) {
		return
	}
	a.mu.Lock()
	b := a.state.Platform.Constructions[parts[0]]
	if b == nil || b.Org != u.Org {
		a.mu.Unlock()
		fail(w, 404, "not_found")
		return
	}
	if action != "status" && u.Role == "viewer" {
		a.mu.Unlock()
		fail(w, 403, "forbidden")
		return
	}
	if action == "start" || action == "request" {
		if b.Status != "ready" || b.contractStatus() != "validated" {
			a.mu.Unlock()
			fail(w, 409, "runtime_contract_invalid")
			return
		}
		if len(b.Contract.Manifest.Capabilities) > 0 {
			a.mu.Unlock()
			fail(w, 409, "runtime_capabilities_unavailable")
			return
		}
		if !construction.RuntimeCompatible(b.Files) {
			a.mu.Unlock()
			fail(w, 409, "runtime_entrypoint_missing")
			return
		}
	}
	a.runtimeMu.Lock()
	if a.runtimes == nil {
		a.runtimes = map[string]*previewRuntime{}
	}
	p := a.runtimes[b.ID]
	if action == "status" {
		view := runtimeView(p)
		a.runtimeMu.Unlock()
		a.mu.Unlock()
		write(w, 200, view)
		return
	}
	if action == "stop" {
		if p != nil {
			p.cancel()
			if p.process != nil {
				p.process.Close()
			}
			p.status = "stopped"
		}
		a.runtimeMu.Unlock()
		a.mu.Unlock()
		write(w, 200, map[string]any{"status": "stopped"})
		return
	}
	if action == "start" {
		if a.runtimeClosed {
			a.runtimeMu.Unlock()
			a.mu.Unlock()
			fail(w, 503, "runtime_unavailable")
			return
		}
		if p != nil && (p.status == "starting" || p.status == "running") {
			view := runtimeView(p)
			a.runtimeMu.Unlock()
			a.mu.Unlock()
			write(w, 200, view)
			return
		}
		active := 0
		for _, v := range a.runtimes {
			if v.status == "starting" || v.status == "running" {
				active++
				if v.org == u.Org {
					a.runtimeMu.Unlock()
					a.mu.Unlock()
					fail(w, 409, "runtime_busy")
					return
				}
			}
		}
		if active >= 4 {
			a.runtimeMu.Unlock()
			a.mu.Unlock()
			fail(w, 429, "runtime_limit")
			return
		}
		if err := a.transact(func() { a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "preview.started", Operation: b.ID}) }); err != nil {
			a.runtimeMu.Unlock()
			a.mu.Unlock()
			fail(w, 503, "storage_unavailable")
			return
		}
		files := map[string]string{}
		for k, v := range b.Files {
			files[k] = v
		}
		contract := *b.Contract
		ctx, cancel := context.WithCancel(context.Background())
		p = &previewRuntime{org: u.Org, status: "starting", cancel: cancel, context: ctx}
		a.runtimes[b.ID] = p
		start := a.runtimeStart
		if start == nil {
			start = construction.StartRuntime
		}
		a.runtimeMu.Unlock()
		a.mu.Unlock()
		go func() {
			proc, err := start(ctx, u.Org, &contract, files)
			a.runtimeMu.Lock()
			if ctx.Err() != nil {
				if proc != nil {
					proc.Close()
				}
				a.runtimeMu.Unlock()
				return
			}
			if err != nil {
				log.Printf("preview startup failed for build %s: %v", parts[0], err)
				p.status = "failed"
				p.message = "Não foi possível iniciar. Confira NewHandler e o executor isolado."
				cancel()
				a.runtimeMu.Unlock()
				return
			}
			p.process = proc
			p.status = "running"
			a.runtimeMu.Unlock()
			<-proc.Done()
			a.runtimeMu.Lock()
			if p.status == "running" {
				p.status = "stopped"
				p.message = "A prévia terminou ou expirou. Você pode iniciar novamente."
			}
			a.runtimeMu.Unlock()
			cancel()
		}()
		write(w, 202, map[string]any{"status": "starting"})
		return
	}
	// Recheck the immutable contract and route on every request, independent of UI.
	manifest := b.Contract.Manifest
	if p == nil || p.status != "running" || p.process == nil {
		a.runtimeMu.Unlock()
		a.mu.Unlock()
		fail(w, 409, "runtime_not_running")
		return
	}
	if p.busy {
		a.runtimeMu.Unlock()
		a.mu.Unlock()
		fail(w, 429, "runtime_busy")
		return
	}
	if err := allowedRuntimeRequest(manifest, in); err != nil {
		a.runtimeMu.Unlock()
		a.mu.Unlock()
		fail(w, 422, err.Error())
		return
	}
	appID, digest := b.ApplicationID, b.Contract.SourceDigest
	storageEnabled := construction.DataCompatible(b.Files)
	version := 0
	if storageEnabled {
		in.Data, version = a.previewData(u.Org, appID)
	}
	recordsEnabled := construction.RecordsCompatible(b.Files)
	var recordSnapshot *construction.RecordsSnapshot
	if recordsEnabled {
		// Keep a distinct expectation; only the serialized copy goes to the child.
		recordSnapshot = a.previewRecords(u.Org, appID)
		in.Records = a.previewRecords(u.Org, appID)
		if in.Records != nil {
			in.Records.NextID = recordSnapshot.NextID
			in.Records.NextCreatedAt = recordSnapshot.NextCreatedAt
		}
	}
	p.busy = true
	proc := p.process
	a.runtimeMu.Unlock()
	a.mu.Unlock()
	out, err := proc.Call(r.Context(), in)
	a.mu.Lock()
	a.runtimeMu.Lock()
	defer a.mu.Unlock()
	defer a.runtimeMu.Unlock()
	p.busy = false
	if err != nil {
		fail(w, 502, "runtime_request_failed")
		return
	}
	current := a.state.Platform.Constructions[parts[0]]
	if a.runtimes[parts[0]] != p || p.status != "running" || p.context.Err() != nil || current == nil || current.Org != u.Org || current.ApplicationID != appID || current.contractStatus() != "validated" || current.Contract.SourceDigest != digest {
		fail(w, 409, "runtime_session_changed")
		return
	}
	select {
	case <-proc.Done():
		fail(w, 409, "runtime_session_changed")
		return
	default:
	}
	// The data envelope belongs only to the host; never return it to the iframe.
	pending := out.DataWrite
	out.DataWrite = nil
	created := out.RecordCreate
	out.RecordCreate = nil
	if (pending != nil || created != nil) && out.Status >= 200 && out.Status < 300 {
		if (pending != nil && !storageEnabled) || (created != nil && !recordsEnabled) {
			fail(w, 409, "preview_data_unavailable")
			return
		}
		if err := a.savePreviewMutations(u, appID, version, pending, recordSnapshot, created); err != nil {
			// Discard any application memory that might assume this failed write succeeded.
			p.cancel()
			proc.Close()
			p.status = "failed"
			p.message = "O dado não foi salvo. Reinicie a prévia e tente novamente."
			code := 503
			if err.Error() == "preview_data_conflict" || err.Error() == "preview_records_limit" {
				code = 409
			}
			if err.Error() == "preview_data_invalid" || err.Error() == "preview_records_invalid" {
				code = 502
			}
			fail(w, code, err.Error())
			return
		}
	}
	write(w, 200, out)
}
func allowedRuntimeRequest(m application.Manifest, in construction.RuntimeRequest) error {
	if len(in.Body) > 32768 || len(in.Path) > 2048 {
		return errors.New("runtime_request_too_large")
	}
	u, err := url.ParseRequestURI(in.Path)
	if err != nil || u.IsAbs() || u.Host != "" || u.Fragment != "" || u.RawPath != "" || strings.Contains(u.Path, "%") || path.Clean(u.Path) != u.Path || !strings.HasPrefix(u.Path, "/api/") {
		return errors.New("runtime_invalid_path")
	}
	mux := http.NewServeMux()
	for _, route := range m.Routes {
		if route.Method != in.Method {
			continue
		}
		mux.HandleFunc(route.Method+" "+route.Path, func(http.ResponseWriter, *http.Request) {})
	}
	r, err := http.NewRequest(in.Method, "http://application.invalid"+in.Path, nil)
	if err != nil {
		return errors.New("runtime_invalid_method")
	}
	_, pattern := mux.Handler(r)
	if pattern == "" {
		return errors.New("runtime_route_not_declared")
	}
	return nil
}
