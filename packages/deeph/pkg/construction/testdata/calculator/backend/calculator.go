package solution

import (
	"arkom.local/solution/platform"
	"encoding/json"
	"net/http"
)

func NewHandler(tenant platform.Tenant) http.Handler {
	mux := http.NewServeMux()
	history := []float64{}
	mux.HandleFunc("POST /api/calculate", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			A  float64 `json:"a"`
			B  float64 `json:"b"`
			Op string  `json:"op"`
		}
		if json.NewDecoder(r.Body).Decode(&in) != nil {
			http.Error(w, "invalid_input", 400)
			return
		}
		var value float64
		switch in.Op {
		case "+":
			value = in.A + in.B
		case "-":
			value = in.A - in.B
		case "*":
			value = in.A * in.B
		case "/":
			if in.B == 0 {
				http.Error(w, "division_by_zero", 422)
				return
			}
			value = in.A / in.B
		default:
			http.Error(w, "invalid_operation", 400)
			return
		}
		history = append(history, value)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"result": value, "organization_id": tenant.OrganizationID})
	})
	mux.HandleFunc("GET /api/history", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(history)
	})
	return mux
}
