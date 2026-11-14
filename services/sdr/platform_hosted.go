package main

import (
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	hostedPlatformHost   = "sdk.arkom.ai"
	hostedPlatformOrigin = "https://" + hostedPlatformHost
	hostedPlatformMount  = "/arkomgo"
	hostedPlatformListen = "127.0.0.1:13008"
)

var (
	hostedFinanceRoute = regexp.MustCompile(`^/(alfa|beta)/v1(?:/[A-Za-z0-9_-]+)+$`)
	hostedMaiaRoute    = regexp.MustCompile(`^/v[12]/orgs/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$`)
	hostedMaiaRest     = regexp.MustCompile(`^/rest/v1/(?:rpc/)?[a-z][a-z0-9_]*$`)
	hostedSafePath     = regexp.MustCompile(`^/[A-Za-z0-9_/-]+(?:\.[A-Za-z0-9_/-]+)*$`)
)

func viewRoot(mount string) string {
	if mount == "" {
		return "/demo"
	}
	return mount
}

func hostedPlatformWebHandler(flutter, bia string, api *url.URL, maia, finance string) http.Handler {
	for _, dir := range []string{maia, finance} {
		info, err := os.Stat(filepath.Join(dir, "index.html"))
		if !filepath.IsAbs(dir) || err != nil || !info.Mode().IsRegular() {
			log.Fatal("compile os agentes Maia e FinanceAI para a homologação pública")
		}
	}
	platform := platformWebWithMount(flutter, bia, api, hostedPlatformMount)
	financeWeb := hostedAgentFiles("/agents/financeai/", finance, false)
	maiaWeb := hostedAgentFiles("/agents/maia/", maia, true)
	financeAPI := hostedAgentProxy("127.0.0.1:8194", "/finance-api", "/api", "http://127.0.0.1:8194")
	maiaAPI := hostedAgentProxy("127.0.0.1:8190", "/maia-api", "", "http://127.0.0.1:8180")
	maiaData := hostedAgentProxy("127.0.0.1:55321", "/maia-data", "", "")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		p := r.URL.Path
		if err != nil || host != "127.0.0.1" || r.Host != hostedPlatformHost ||
			!strings.HasPrefix(p, hostedPlatformMount+"/") || r.URL.RawPath != "" ||
			strings.Contains(p, "//") || strings.Contains(p, "/.") || !hostedSafePath.MatchString(p) {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		read := r.Method == http.MethodGet || r.Method == http.MethodHead
		origin := r.Header.Get("Origin")
		if (origin != "" && origin != hostedPlatformOrigin) ||
			(!read && (origin != hostedPlatformOrigin || r.Header.Get("Sec-Fetch-Site") == "cross-site")) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		r = r.Clone(r.Context())
		r.URL.Path = strings.TrimPrefix(p, hostedPlatformMount)
		switch {
		case strings.HasPrefix(r.URL.Path, "/agents/maia/") && read:
			maiaWeb.ServeHTTP(w, r)
		case strings.HasPrefix(r.URL.Path, "/agents/financeai/") && read:
			financeWeb.ServeHTTP(w, r)
		case strings.HasPrefix(r.URL.Path, "/finance-api/"):
			if !hostedFinanceRoute.MatchString(strings.TrimPrefix(r.URL.Path, "/finance-api")) {
				http.NotFound(w, r)
				return
			}
			financeAPI.ServeHTTP(w, r)
		case strings.HasPrefix(r.URL.Path, "/maia-api/"):
			if !hostedMaiaRoute.MatchString(strings.TrimPrefix(r.URL.Path, "/maia-api")) || !hostedMaiaBearer(r) {
				http.NotFound(w, r)
				return
			}
			maiaAPI.ServeHTTP(w, r)
		case strings.HasPrefix(r.URL.Path, "/maia-data/"):
			if !hostedMaiaDataAllowed(r) {
				http.NotFound(w, r)
				return
			}
			maiaData.ServeHTTP(w, r)
		case strings.HasPrefix(r.URL.Path, "/api/demo/backend/"):
			r.Host = hostedPlatformListen
			if origin != "" {
				r.Header.Set("Origin", "http://"+hostedPlatformListen)
			}
			platform.ServeHTTP(w, r)
		case strings.HasPrefix(r.URL.Path, "/agents/bia/"), strings.HasPrefix(r.URL.Path, "/genesis-flutter/"):
			r.Host = hostedPlatformListen
			platform.ServeHTTP(w, r)
		case read:
			r.Host = hostedPlatformListen
			r.URL.Path = "/demo" + r.URL.Path
			platform.ServeHTTP(w, r)
		default:
			http.NotFound(w, r)
		}
	})
}

func hostedAgentFiles(prefix, dir string, spa bool) http.Handler {
	files := http.StripPrefix(prefix, http.FileServer(http.Dir(dir)))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'")
		name := strings.TrimPrefix(r.URL.Path, prefix)
		if name == "" || (spa && strings.Contains(r.Header.Get("Accept"), "text/html") && filepath.Ext(name) == "") {
			http.ServeFile(w, r, filepath.Join(dir, "index.html"))
			return
		}
		if strings.HasSuffix(name, "/") {
			http.NotFound(w, r)
			return
		}
		files.ServeHTTP(w, r)
	})
}

func hostedAgentProxy(address, prefix, upstreamPrefix, origin string) http.Handler {
	target := &url.URL{Scheme: "http", Host: address}
	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			r.Out.URL.Path = upstreamPrefix + strings.TrimPrefix(r.In.URL.Path, prefix)
			r.Out.Header = make(http.Header)
			for _, key := range []string{
				"Authorization", "Content-Type", "Idempotency-Key", "Accept", "Apikey",
				"Accept-Profile", "Content-Profile", "Prefer", "Range", "Range-Unit",
			} {
				if value := r.In.Header.Get(key); value != "" {
					r.Out.Header.Set(key, value)
				}
			}
			if origin != "" {
				r.Out.Header.Set("Origin", origin)
			}
		},
		ModifyResponse: func(r *http.Response) error {
			r.Header.Del("Set-Cookie")
			r.Header.Del("Location")
			r.Header.Set("Cache-Control", "no-store")
			r.Header.Set("Content-Security-Policy", "default-src 'none'; sandbox; frame-ancestors 'none'")
			return nil
		},
	}
}

func hostedMaiaBearer(r *http.Request) bool {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	return ok && strings.Count(token, ".") == 2
}

func hostedMaiaDataAllowed(r *http.Request) bool {
	key := r.Header.Get("Apikey")
	if !strings.HasPrefix(key, "sb_publishable_") {
		return false
	}
	path := strings.TrimPrefix(r.URL.Path, "/maia-data")
	if path == "/auth/v1/token" {
		grant := r.URL.Query()["grant_type"]
		return r.Method == http.MethodPost && len(grant) == 1 && grant[0] == "refresh_token"
	}
	if !hostedMaiaBearer(r) {
		return false
	}
	switch path {
	case "/auth/v1/user":
		return r.Method == http.MethodGet
	case "/auth/v1/logout":
		return r.Method == http.MethodPost
	}
	if !hostedMaiaRest.MatchString(path) {
		return false
	}
	for _, key := range []string{"Accept-Profile", "Content-Profile"} {
		switch r.Header.Get(key) {
		case "", "app_multi", "core":
		default:
			return false
		}
	}
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPatch, http.MethodDelete:
		return true
	}
	return false
}
