package solution

import (
	"arkom.local/solution/platform"
	"encoding/json"
	"net/http"
)

func NewHandler(tenant platform.Tenant) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/note", func(w http.ResponseWriter, r *http.Request) {
		value, found, err := platform.LoadData(r.Context())
		if err != nil {
			http.Error(w, "storage_unavailable", 503)
			return
		}
		if !found {
			value = json.RawMessage(`{"text":""}`)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"note": value, "organization_id": tenant.OrganizationID})
	})
	mux.HandleFunc("POST /api/note", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Text string `json:"text"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil || len(in.Text) > 2000 {
			http.Error(w, "invalid_note", 400)
			return
		}
		value, _ := json.Marshal(in)
		if err := platform.SaveData(r.Context(), value); err != nil {
			http.Error(w, "storage_unavailable", 503)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"saved": true})
	})
	return mux
}
