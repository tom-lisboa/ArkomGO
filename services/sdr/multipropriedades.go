package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	multiAuth = "http://127.0.0.1:55321"
	multiAPI  = "http://127.0.0.1:8190"
	multiWeb  = "http://127.0.0.1:8180"
	multiAlfa = "a1000000-0000-4000-8000-000000000001"
	multiBeta = "b1000000-0000-4000-8000-000000000001"
)

var multiUUID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var multiHTTP = &http.Client{
	Transport:     &http.Transport{},
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

type multiBinding struct{ Email, Org, Role string }

// Each supported role belongs to its own pre-seeded GoTrue identity.
func multipropriedadesBinding(u User) (multiBinding, bool) {
	if u.Environment != "isolated-test" {
		return multiBinding{}, false
	}
	switch {
	case u.Org == "org_demo_alfa" && u.ID == "user_alfa_admin" && u.Role == "admin":
		return multiBinding{"admin@example.test", multiAlfa, "admin"}, true
	case u.Org == "org_demo_alfa" && u.ID == "user_alfa_operator" && u.Role == "operator":
		return multiBinding{"vendedor@example.test", multiAlfa, "vendedor"}, true
	case u.Org == "org_demo_alfa" && u.ID == "user_alfa_viewer" && u.Role == "viewer":
		return multiBinding{"viewer@example.test", multiAlfa, "viewer"}, true
	case u.Org == "org_demo_beta" && u.ID == "user_beta_admin" && u.Role == "admin":
		return multiBinding{"outra-org@example.test", multiBeta, "admin"}, true
	}
	return multiBinding{}, false
}

func multiStateDir(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil || host != "127.0.0.1" {
		return ""
	}
	dir := os.Getenv("ARKOM_MULTI_STATE_DIR")
	if !filepath.IsAbs(dir) {
		return ""
	}
	return dir
}

func multiRequest(ctx context.Context, method, target string, body []byte, key, token string, out any) bool {
	req, err := http.NewRequestWithContext(ctx, method, target, bytes.NewReader(body))
	if err != nil {
		return false
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if key != "" {
		req.Header.Set("apikey", key)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if strings.HasPrefix(target, multiAuth+"/rest/v1/") {
		req.Header.Set("Accept-Profile", "core")
	}
	res, err := multiHTTP.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return false
	}
	return out == nil || json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(out) == nil
}

func multiReady(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	return multiRequest(ctx, http.MethodGet, multiWeb+"/__arkom/ready", nil, "", "", nil) &&
		multiRequest(ctx, http.MethodGet, multiAPI+"/readyz", nil, "", "", nil)
}

type multiAccount struct {
	ID, Email, Password, Org, Role string
}

func multiCredentials(dir string, binding multiBinding) (multiAccount, string, bool) {
	var runtime struct {
		URL string `json:"API_URL"`
		Key string `json:"PUBLISHABLE_KEY"`
	}
	var accounts []multiAccount
	raw, err := os.ReadFile(filepath.Join(dir, "runtime.json"))
	if err != nil || json.Unmarshal(raw, &runtime) != nil ||
		runtime.URL != multiAuth || !strings.HasPrefix(runtime.Key, "sb_publishable_") {
		return multiAccount{}, "", false
	}
	raw, err = os.ReadFile(filepath.Join(dir, "accounts.json"))
	if err != nil || json.Unmarshal(raw, &accounts) != nil {
		return multiAccount{}, "", false
	}
	for _, account := range accounts {
		if account.Email == binding.Email && account.Org == binding.Org && account.Role == binding.Role &&
			account.Password != "" && multiUUID.MatchString(account.ID) {
			return account, runtime.Key, true
		}
	}
	return multiAccount{}, "", false
}

func (a *App) multiSession(w http.ResponseWriter, r *http.Request, u User) {
	if r.Method != http.MethodPost {
		fail(w, 405, "method_not_allowed")
		return
	}
	dir := multiStateDir(r)
	if dir == "" {
		fail(w, 404, "not_found")
		return
	}
	u, err := a.directoryUser(r.Context(), u)
	if err != nil {
		directoryFailure(w, err)
		return
	}
	binding, allowed := multipropriedadesBinding(u)
	if !allowed {
		fail(w, 403, "forbidden")
		return
	}
	a.mu.Lock()
	allowed = a.allow(w, r, []quota{{"multi-session:" + u.Org + ":" + u.ID, 16, time.Minute}})
	a.mu.Unlock()
	if !allowed {
		return
	}
	account, key, ok := multiCredentials(dir, binding)
	if !ok || !multiReady(r.Context()) {
		fail(w, 503, "multipropriedades_unavailable")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	login, _ := json.Marshal(map[string]string{"email": account.Email, "password": account.Password})
	var token struct {
		Access  string `json:"access_token"`
		Refresh string `json:"refresh_token"`
		User    struct{ ID string }
	}
	var access struct {
		Org  string `json:"org_id"`
		Role string `json:"papel"`
	}
	var memberships []struct {
		Org  string `json:"org_id"`
		Role string `json:"role"`
	}
	if !multiRequest(ctx, http.MethodPost, multiAuth+"/auth/v1/token?grant_type=password", login, key, "", &token) ||
		token.User.ID != account.ID || token.Access == "" || token.Refresh == "" ||
		!multiRequest(ctx, http.MethodGet, multiAuth+"/rest/v1/memberships?select=org_id,role&user_id=eq."+account.ID, nil, key, token.Access, &memberships) ||
		len(memberships) != 1 || memberships[0].Org != binding.Org || memberships[0].Role != binding.Role ||
		!multiRequest(ctx, http.MethodGet, multiAPI+"/v1/orgs/"+binding.Org+"/acesso", nil, "", token.Access, &access) ||
		access.Org != binding.Org || access.Role != binding.Role {
		fail(w, 503, "multipropriedades_unavailable")
		return
	}
	write(w, 200, map[string]string{"access_token": token.Access, "refresh_token": token.Refresh})
}
