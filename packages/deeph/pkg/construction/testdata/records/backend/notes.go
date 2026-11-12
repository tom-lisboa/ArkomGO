package solution

import (
	"arkom.local/solution/platform"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

func NewHandler(tenant platform.Tenant) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/notes", func(w http.ResponseWriter, r *http.Request) {
		items, err := platform.ListRecords(r.Context())
		if err != nil {
			http.Error(w, "records_unavailable", 503)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"items": items, "organization_id": tenant.OrganizationID})
	})
	mux.HandleFunc("POST /api/notes", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Text string `json:"text"`
		}
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		dec.DisallowUnknownFields()
		if dec.Decode(&in) != nil || dec.Decode(new(any)) != io.EOF || strings.TrimSpace(in.Text) == "" {
			http.Error(w, "invalid_note", 400)
			return
		}
		value, _ := json.Marshal(in)
		item, err := platform.CreateRecord(r.Context(), value)
		if err != nil {
			status := 503
			if errors.Is(err, platform.ErrInvalidRecord) {
				status = 400
			}
			if errors.Is(err, platform.ErrRecordsLimit) {
				status = 409
			}
			http.Error(w, err.Error(), status)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(201)
		json.NewEncoder(w).Encode(item)
	})
	return mux
}
