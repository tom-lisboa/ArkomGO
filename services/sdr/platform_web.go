package main

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var platformProjectRoute = regexp.MustCompile(`^(tools|genesis)/build_[a-f0-9]{48}$`)
var platformSolutionRoute = regexp.MustCompile(`^systems/[a-z][a-z0-9_]{0,40}$`)

func platformWebEntrypoint() bool {
	if len(os.Args) != 2 || os.Args[1] != "-web" {
		return false
	}
	if os.Getenv("ARKOM_LOCAL_DEMO") != "true" {
		log.Fatal("a interface Flutter exige o ambiente local")
	}
	flutter := os.Getenv("ARKOM_FLUTTER_BUILD")
	bia := os.Getenv("ARKOM_BIA_BUILD")
	for _, dir := range []string{flutter, bia} {
		if !filepath.IsAbs(dir) {
			log.Fatal("configure os builds locais da plataforma e da BIA")
		}
		info, err := os.Stat(filepath.Join(dir, "index.html"))
		if err != nil || !info.Mode().IsRegular() {
			log.Fatal("compile a plataforma Flutter e o agente BIA antes de iniciar")
		}
	}
	target, _ := url.Parse("http://127.0.0.1:8080")
	listener, err := net.Listen("tcp4", "127.0.0.1:3007")
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{
		Handler: platformWebHandler(flutter, bia, target), ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout: 40 * time.Second, IdleTimeout: 60 * time.Second,
	}
	log.Print("Arkom Flutter pronta em http://127.0.0.1:3007/demo")
	log.Fatal(server.Serve(listener))
	return true
}

func platformWebHandler(flutter, bia string, target *url.URL) http.Handler {
	proxy := &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			r.Out.URL.Path = strings.TrimPrefix(r.In.URL.Path, "/api/demo/backend")
			r.Out.URL.RawPath = ""
			r.Out.Header = make(http.Header)
			for _, name := range []string{"Content-Type", "Authorization", "Idempotency-Key", "Last-Event-ID"} {
				if value := r.In.Header.Get(name); value != "" {
					r.Out.Header.Set(name, value)
				}
			}
		},
		FlushInterval: -1,
		ModifyResponse: func(r *http.Response) error {
			r.Header.Set("Cache-Control", "no-store, no-transform")
			r.Header.Set("X-Accel-Buffering", "no")
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "demo_backend_unavailable"})
		},
	}
	flutterFiles := http.StripPrefix("/genesis-flutter/", http.FileServer(http.Dir(flutter)))
	biaFiles := http.StripPrefix("/agents/bia/", http.FileServer(http.Dir(bia)))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.Host)
		if err != nil || (host != "127.0.0.1" && host != "localhost") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "frame-ancestors 'self'; base-uri 'self'; object-src 'none'")
		for _, part := range strings.Split(r.URL.Path, "/") {
			if part == ".." || strings.HasPrefix(part, ".") {
				http.NotFound(w, r)
				return
			}
		}
		if strings.HasPrefix(r.URL.Path, "/api/demo/backend/") {
			path := strings.TrimPrefix(r.URL.Path, "/api/demo/backend/")
			parts := strings.Split(path, "/")
			if len(parts) < 2 || !platformProxyPrefix(parts[0]+"/"+parts[1]) {
				http.NotFound(w, r)
				return
			}
			if r.Method != http.MethodGet && r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			if r.Method == http.MethodPost && !platformSameOrigin(r) {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			proxy.ServeHTTP(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		switch {
		case r.URL.Path == "/__arkom/ready":
			w.Header().Set("Cache-Control", "no-store")
			_, _ = w.Write([]byte("Arkom Flutter"))
		case strings.HasPrefix(r.URL.Path, "/genesis-flutter/"):
			flutterFiles.ServeHTTP(w, r)
		case strings.HasPrefix(r.URL.Path, "/agents/bia/"):
			biaFiles.ServeHTTP(w, r)
		case r.URL.Path == "/":
			http.Redirect(w, r, "/demo", http.StatusFound)
		case r.URL.Path == "/demo/systems":
			http.Redirect(w, r, "/demo/tools", http.StatusFound)
		case r.URL.Path == "/demo" || strings.HasPrefix(r.URL.Path, "/demo/"):
			view := strings.TrimPrefix(strings.TrimPrefix(r.URL.Path, "/demo"), "/")
			if platformLegacyTab(view) {
				http.Redirect(w, r, "/demo/sdr?tab="+view, http.StatusFound)
				return
			}
			if !platformViewAllowed(view) {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Cache-Control", "no-store")
			http.ServeFile(w, r, filepath.Join(flutter, "index.html"))
		default:
			http.NotFound(w, r)
		}
	})
}

func platformProxyPrefix(prefix string) bool {
	switch prefix {
	case "v1/sdr", "v1/platform", "v1/core", "v1/customer", "__test/ui":
		return true
	}
	return false
}

func platformSameOrigin(r *http.Request) bool {
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return false
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	return err == nil && u.Scheme == "http" && u.Host == r.Host && u.Path == "" && u.User == nil
}

func platformViewAllowed(view string) bool {
	switch view {
	case "", "home", "map", "tools", "team", "sdr", "crm", "agenda", "clips", "multipropriedades", "financeai", "genesis", "genesis/new", "business":
		return true
	}
	return platformProjectRoute.MatchString(view) || platformSolutionRoute.MatchString(view)
}

func platformLegacyTab(view string) bool {
	switch view {
	case "whatsapp", "automations", "executions", "audit", "data", "calendar":
		return true
	}
	return false
}
