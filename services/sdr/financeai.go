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

const financeWeb = "http://127.0.0.1:8194"
const financeAPI = "http://127.0.0.1:8195"

var financeID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
var financeNonce = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

type financeBinding struct {
	Organization string `json:"organizationId"`
	Installation string `json:"installationId"`
	Name         string `json:"name"`
}

// Both the tenant and the member reference are resolved from the Arkom session.
func financeCompany(u User) string {
	if u.Environment != "isolated-test" {
		return ""
	}
	switch u.Role {
	case "admin", "operator", "viewer":
	default:
		return ""
	}
	for _, company := range []string{"alfa", "beta"} {
		if u.Org == "org_demo_"+company && u.ID == "user_"+company+"_"+u.Role {
			return company
		}
	}
	return ""
}

func financeStateDir(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	dir := os.Getenv("ARKOM_FINANCEAI_STATE_DIR")
	if err != nil || host != "127.0.0.1" || !filepath.IsAbs(dir) {
		return ""
	}
	return dir
}

func financeReadPrivate(dir, name string) []byte {
	file, err := os.Open(filepath.Join(dir, name))
	if err != nil {
		return nil
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 || info.Size() > 4096 {
		return nil
	}
	data, _ := io.ReadAll(io.LimitReader(file, 4097))
	return data
}

func findFinanceBinding(dir, company string) (financeBinding, bool) {
	var bindings map[string]financeBinding
	if dir == "" || company == "" || json.Unmarshal(financeReadPrivate(dir, "bindings.json"), &bindings) != nil {
		return financeBinding{}, false
	}
	binding := bindings[company]
	return binding, financeID.MatchString(binding.Organization) && financeID.MatchString(binding.Installation) &&
		binding.Name != "" && bindings["alfa"].Organization != bindings["beta"].Organization &&
		bindings["alfa"].Installation != bindings["beta"].Installation
}

func financeReady(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	return multiRequest(ctx, http.MethodGet, financeWeb+"/__arkom/ready", nil, "", "", nil) &&
		multiRequest(ctx, http.MethodGet, financeAPI+"/health", nil, "", "", nil)
}

type financeHandoff struct {
	Code         string `json:"code"`
	State        string `json:"state"`
	Installation string `json:"installationId"`
	Origin       string `json:"origin"`
}

func (a *App) financeSession(w http.ResponseWriter, r *http.Request, u User) {
	if r.Method != http.MethodPost {
		fail(w, 405, "method_not_allowed")
		return
	}
	dir := financeStateDir(r)
	if dir == "" {
		fail(w, 404, "not_found")
		return
	}
	resolved, err := a.directoryUser(r.Context(), u)
	if err != nil {
		directoryFailure(w, err)
		return
	}
	company := financeCompany(resolved)
	if company == "" {
		fail(w, 403, "forbidden")
		return
	}
	var input struct {
		Challenge string `json:"challenge"`
		State     string `json:"state"`
	}
	if !decodeCore(w, r, &input) {
		return
	}
	if !financeNonce.MatchString(input.Challenge) || !financeNonce.MatchString(input.State) {
		fail(w, 422, "invalid_handoff")
		return
	}
	a.mu.Lock()
	allowed := a.allow(w, r, []quota{{"finance-session:" + u.Org + ":" + u.ID, 16, time.Minute}})
	a.mu.Unlock()
	if !allowed {
		return
	}
	binding, ok := findFinanceBinding(dir, company)
	secret := strings.TrimSpace(string(financeReadPrivate(dir, "provisioning.key")))
	if !ok || len(secret) < 32 || !financeReady(r.Context()) {
		fail(w, 503, "financeai_unavailable")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	body, _ := json.Marshal(map[string]string{
		"organizationId": binding.Organization, "installationId": binding.Installation,
		"userReference": resolved.ID, "challenge": input.Challenge,
		"challengeMethod": "S256", "state": input.State,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, financeAPI+"/internal/onboarding/handoffs", bytes.NewReader(body))
	if err != nil {
		fail(w, 503, "financeai_unavailable")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+secret)
	response, err := multiHTTP.Do(req)
	if err != nil {
		fail(w, 503, "financeai_unavailable")
		return
	}
	defer response.Body.Close()
	if response.StatusCode == 404 || response.StatusCode == 403 {
		fail(w, 403, "forbidden")
		return
	}
	var handoff financeHandoff
	if response.StatusCode != 201 || json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&handoff) != nil ||
		handoff.State != input.State || handoff.Installation != binding.Installation ||
		handoff.Origin != "https://finance-"+company+".arkom.test" || !strings.HasPrefix(handoff.Code, "fc_code_") ||
		!financeID.MatchString(handoff.Code) {
		fail(w, 503, "financeai_unavailable")
		return
	}
	write(w, 200, map[string]string{
		"code": handoff.Code, "state": handoff.State, "company": company,
		"installationId": handoff.Installation, "name": binding.Name,
	})
}
