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
		p = &previewRuntime{org: u.Org, status: "starting", cancel: cancel}
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
	p.busy = true
	proc := p.process
	a.runtimeMu.Unlock()
	a.mu.Unlock()
	out, err := proc.Call(r.Context(), in)
	a.runtimeMu.Lock()
	p.busy = false
	a.runtimeMu.Unlock()
	if err != nil {
		fail(w, 502, "runtime_request_failed")
		return
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
