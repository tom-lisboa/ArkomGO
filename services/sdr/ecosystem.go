package main

import (
	"crypto/hmac"
	"crypto/sha256"
	_ "embed"
	"encoding/base32"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

//go:embed demo/ecosystem/catalog.json
var ecosystemCatalog []byte

var clipsJobID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,80}$`)
var ecosystemClient = &http.Client{Timeout: 40 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

// The local bridge is explicit: only registered local products.
// Product sessions/credentials never cross into generated applications.
func (a *App) ecosystemHTTP(w http.ResponseWriter, r *http.Request, u User) bool {
	const base = "/v1/sdr/genesis-demo/ecosystem"
	if r.URL.Path != base && !strings.HasPrefix(r.URL.Path, base+"/") {
		return false
	}
	if r.URL.Path == base+"/financeai/session" {
		a.financeSession(w, r, u)
		return true
	}
	if r.URL.Path == base+"/multipropriedades/session" {
		a.multiSession(w, r, u)
		return true
	}
	if strings.HasSuffix(r.URL.Path, "/rating") {
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, base+"/"), "/rating")
		var catalog struct {
			Solutions []map[string]any `json:"solutions"`
		}
		_ = json.Unmarshal(ecosystemCatalog, &catalog)
		available := false
		for _, solution := range catalog.Solutions {
			if solution["id"] == id && solution["service"] != nil {
				available = true
			}
		}
		if id == "multipropriedades" && available {
			resolved, err := a.directoryUser(r.Context(), u)
			if err != nil {
				directoryFailure(w, err)
				return true
			}
			u = resolved
			_, available = multipropriedadesBinding(u)
			available = available && multiStateDir(r) != ""
		}
		if id == "financeai" && available {
			resolved, err := a.directoryUser(r.Context(), u)
			if err != nil {
				directoryFailure(w, err)
				return true
			}
			u = resolved
			_, available = findFinanceBinding(financeStateDir(r), financeCompany(u))
		}
		if !available {
			fail(w, 404, "not_found")
			return true
		}
		if r.Method != "POST" {
			fail(w, 405, "method_not_allowed")
			return true
		}
		if u.Role == "viewer" {
			fail(w, 403, "forbidden")
			return true
		}
		var body struct {
			Rating int `json:"rating"`
		}
		if !decodeCore(w, r, &body) {
			return true
		}
		if body.Rating < 1 || body.Rating > 5 {
			fail(w, 422, "invalid_rating")
			return true
		}
		a.mu.Lock()
		defer a.mu.Unlock()
		if !a.allow(w, r, []quota{{"solution-rating:" + u.Org + ":" + u.ID, 30, time.Minute}}) {
			return true
		}
		if err := a.transact(func() {
			if a.state.Platform.SolutionRatings == nil {
				a.state.Platform.SolutionRatings = map[string]map[string]map[string]int{}
			}
			if a.state.Platform.SolutionRatings[u.Org] == nil {
				a.state.Platform.SolutionRatings[u.Org] = map[string]map[string]int{}
			}
			if a.state.Platform.SolutionRatings[u.Org][id] == nil {
				a.state.Platform.SolutionRatings[u.Org][id] = map[string]int{}
			}
			a.state.Platform.SolutionRatings[u.Org][id][u.ID] = body.Rating
			a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "solution.rating.updated", Operation: id})
		}); err != nil {
			fail(w, 503, "storage_unavailable")
			return true
		}
		write(w, 200, a.solutionRating(u, id))
		return true
	}
	if r.URL.Path == base && r.Method == "GET" {
		crm := a.crmRoutes[u.Org].Origin != ""
		clips := os.Getenv("SDR_CLIPS_BRIDGE_KEY") != ""
		var catalog struct {
			Version   string           `json:"version"`
			Solutions []map[string]any `json:"solutions"`
		}
		if json.Unmarshal(ecosystemCatalog, &catalog) != nil {
			fail(w, 503, "catalog_unavailable")
			return true
		}
		for _, item := range catalog.Solutions {
			id, _ := item["id"].(string)
			configured := false
			switch id {
			case "sdr":
				configured = true
				item["product_capabilities"] = map[string]bool{
					"crm": crm, "calendar": a.calendarEnabled, "customer_data": a.customerEnabled,
				}
			case "genesis":
				configured = os.Getenv("OPENAI_API_KEY") != ""
			case "crm":
				configured = crm
			case "clips":
				configured = clips
			case "financeai":
				if dir := financeStateDir(r); dir != "" {
					if resolved, err := a.directoryUser(r.Context(), u); err == nil {
						company := financeCompany(resolved)
						if _, ok := findFinanceBinding(dir, company); ok {
							configured = financeReady(r.Context())
						} else if company == "" {
							item["reason"] = "O FinanceAI ainda não foi liberado para esta conta."
						}
					}
				}
			case "multipropriedades":
				if dir := multiStateDir(r); dir != "" {
					if resolved, err := a.directoryUser(r.Context(), u); err == nil {
						if binding, allowed := multipropriedadesBinding(resolved); allowed {
							_, _, configured = multiCredentials(dir, binding)
							configured = configured && multiReady(r.Context())
						} else {
							item["reason"] = "A Maia ainda não foi liberada para esta conta."
						}
					}
				}
			}
			item["configured"] = configured
			item["implemented"] = item["service"] != nil
			a.mu.Lock()
			item["rating"] = a.solutionRating(u, id)
			a.mu.Unlock()
			if item["service"] == nil {
				item["reason"] = "Esta solução ainda não está integrada à nova estrutura."
			} else if !configured && item["reason"] == nil {
				item["reason"] = "A configuração deste serviço local precisa ser concluída."
			}
		}
		write(w, 200, map[string]any{"organization_id": u.Org, "version": catalog.Version, "solutions": catalog.Solutions})
		return true
	}
	const prefix = base + "/clips/jobs"
	const gifPrefix = base + "/clips/gifs"
	isGIF := r.URL.Path == gifPrefix || strings.HasPrefix(r.URL.Path, gifPrefix+"/")
	suffix := strings.TrimPrefix(r.URL.Path, prefix)
	parts := strings.Split(strings.TrimPrefix(suffix, "/"), "/")
	valid := r.URL.Path == prefix && (r.Method == "GET" || r.Method == "POST")
	if strings.HasPrefix(r.URL.Path, prefix+"/") && clipsJobID.MatchString(parts[0]) {
		valid = (len(parts) == 1 && r.Method == "GET") ||
			(len(parts) == 2 && (parts[1] == "video" && r.Method == "GET" ||
				parts[1] == "delete" && r.Method == "POST"))
	}
	if isGIF {
		path := strings.TrimPrefix(r.URL.Path, gifPrefix)
		gifParts := strings.Split(strings.TrimPrefix(path, "/"), "/")
		valid = (path == "" && (r.Method == "GET" || r.Method == "POST")) ||
			((path == "/key" || path == "/key/remove") && r.Method == "POST") ||
			(len(gifParts) == 2 && clipsJobID.MatchString(gifParts[0]) && gifParts[1] == "image" && r.Method == "GET")
	}
	if !valid {
		fail(w, 404, "not_found")
		return true
	}
	if r.Method == "POST" && u.Role == "viewer" {
		fail(w, 403, "forbidden")
		return true
	}
	if isGIF {
		var err error
		u, err = a.directoryUser(r.Context(), u)
		if err != nil {
			directoryFailure(w, err)
			return true
		}
		if r.Method == "POST" && u.Role == "viewer" {
			fail(w, 403, "forbidden")
			return true
		}
	}
	secret := os.Getenv("SDR_CLIPS_BRIDGE_KEY")
	if len(secret) < 32 {
		fail(w, 503, "clips_unavailable")
		return true
	}
	digest := hmac.New(sha256.New, []byte(secret))
	digest.Write([]byte(u.Org))
	owner := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(digest.Sum(nil))[:26]
	target := "http://127.0.0.1:18082/studio/jobs" + suffix
	method := r.Method
	limit := int64(8 << 20)
	var gifPath string
	if isGIF {
		gifPath = "/app/gifs" + strings.TrimPrefix(r.URL.Path, gifPrefix)
		switch gifPath {
		case "/app/gifs/key":
			method = http.MethodPut
		case "/app/gifs/key/remove":
			method, gifPath = http.MethodDelete, "/app/gifs/key"
		case "/app/gifs":
			if method == http.MethodPost && !clipsJobID.MatchString(r.Header.Get("Idempotency-Key")) {
				fail(w, 400, "invalid_idempotency_key")
				return true
			}
		}
		limit = 8192
		target = "http://127.0.0.1:18082" + gifPath
	}
	upstream, err := http.NewRequestWithContext(r.Context(), method, target, http.MaxBytesReader(w, r.Body, limit))
	if err != nil {
		fail(w, 400, "invalid_request")
		return true
	}
	upstream.Header.Set("Content-Type", r.Header.Get("Content-Type"))
	upstream.Header.Set("Idempotency-Key", r.Header.Get("Idempotency-Key"))
	if isGIF {
		mac := hmac.New(sha256.New, []byte(secret))
		subjectInput, _ := json.Marshal([]string{"clips-gif-subject/v1", u.Org, u.ID})
		mac.Write(subjectInput)
		raw := hex.EncodeToString(mac.Sum(nil)[:16])
		subject := raw[:8] + "-" + raw[8:12] + "-" + raw[12:16] + "-" + raw[16:20] + "-" + raw[20:]
		scope := "write"
		if u.Role == "viewer" {
			scope = "read"
		} else if u.Role == "admin" && u.Environment == "isolated-test" && u.Org == "org_demo_alfa" && u.ID == "user_alfa_admin" {
			scope = "demo"
		}
		mac.Reset()
		mac.Write([]byte("clips-gif/v1\x00" + subject + "\x00" + scope + "\x00" + method + "\x00" + gifPath))
		upstream.Header.Set("X-Arkom-Clips-Subject", subject)
		upstream.Header.Set("X-Arkom-Clips-Scope", scope)
		upstream.Header.Set("X-Arkom-Clips-Signature", hex.EncodeToString(mac.Sum(nil)))
	} else {
		upstream.AddCookie(&http.Cookie{Name: "clips_go", Value: owner})
	}
	response, err := ecosystemClient.Do(upstream)
	if err != nil {
		fail(w, 503, "clips_unavailable")
		return true
	}
	defer response.Body.Close()
	w.Header().Set("Content-Type", response.Header.Get("Content-Type"))
	w.Header().Set("Cache-Control", "no-store")
	if !isGIF && len(parts) == 2 && parts[1] == "video" {
		w.Header().Set("Content-Disposition", `attachment; filename="arkom-clips.mp4"`)
	}
	// Cookie/owner and worker credentials are deliberately never forwarded.
	w.WriteHeader(response.StatusCode)
	_, _ = io.Copy(w, io.LimitReader(response.Body, 64<<20))
	return true
}

// Called under a.mu. Feedback belongs to this workspace; personal votes never
// enter the catalog, other organizations, or the construction model's context.
func (a *App) solutionRating(u User, id string) map[string]any {
	values := a.state.Platform.SolutionRatings[u.Org][id]
	total := 0
	for _, value := range values {
		total += value
	}
	var average any
	if len(values) > 0 {
		average = float64(total) / float64(len(values))
	}
	return map[string]any{"mine": values[u.ID], "count": len(values), "average": average}
}
