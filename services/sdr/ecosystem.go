package main

import (
	"crypto/hmac"
	"crypto/sha256"
	_ "embed"
	"encoding/base32"
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

// The local bridge is explicit: only the four products present in this repository.
// Product sessions/credentials never cross into generated applications.
func (a *App) ecosystemHTTP(w http.ResponseWriter, r *http.Request, u User) bool {
	const base = "/v1/sdr/genesis-demo/ecosystem"
	if r.URL.Path != base && !strings.HasPrefix(r.URL.Path, base+"/") {
		return false
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
			case "genesis":
				configured = os.Getenv("OPENAI_API_KEY") != ""
			case "crm":
				configured = crm
			case "clips":
				configured = clips
			}
			item["configured"] = configured
			item["implemented"] = item["service"] != nil
			if item["service"] == nil {
				item["reason"] = "Esta solução ainda não está integrada à nova estrutura."
			} else if !configured {
				item["reason"] = "A configuração deste serviço local precisa ser concluída."
			}
		}
		write(w, 200, map[string]any{"organization_id": u.Org, "version": catalog.Version, "solutions": catalog.Solutions})
		return true
	}
	const prefix = base + "/clips/jobs"
	suffix := strings.TrimPrefix(r.URL.Path, prefix)
	parts := strings.Split(strings.Trim(suffix, "/"), "/")
	valid := r.URL.Path == prefix || (strings.HasPrefix(r.URL.Path, prefix+"/") && len(parts) <= 2 && clipsJobID.MatchString(parts[0]) && (len(parts) == 1 || parts[1] == "video"))
	if !valid || (r.Method != "GET" && !(r.Method == "POST" && r.URL.Path == prefix)) {
		fail(w, 404, "not_found")
		return true
	}
	if r.Method == "POST" && u.Role == "viewer" {
		fail(w, 403, "forbidden")
		return true
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
	upstream, err := http.NewRequestWithContext(r.Context(), r.Method, target, http.MaxBytesReader(w, r.Body, 8<<20))
	if err != nil {
		fail(w, 400, "invalid_request")
		return true
	}
	upstream.Header.Set("Content-Type", r.Header.Get("Content-Type"))
	upstream.Header.Set("Idempotency-Key", r.Header.Get("Idempotency-Key"))
	upstream.AddCookie(&http.Cookie{Name: "clips_go", Value: owner})
	response, err := ecosystemClient.Do(upstream)
	if err != nil {
		fail(w, 503, "clips_unavailable")
		return true
	}
	defer response.Body.Close()
	w.Header().Set("Content-Type", response.Header.Get("Content-Type"))
	w.Header().Set("Cache-Control", "no-store")
	if len(parts) == 2 && parts[1] == "video" {
		w.Header().Set("Content-Disposition", `attachment; filename="arkom-clips.mp4"`)
	}
	// Cookie/owner and worker credentials are deliberately never forwarded.
	w.WriteHeader(response.StatusCode)
	_, _ = io.Copy(w, io.LimitReader(response.Body, 64<<20))
	return true
}
