package httpapi

import (
	"net/http"
	"strings"

	"arkom/multipropriedades/internal/financebridge"
)

func (s *Server) registerArkomFinance() {
	finance, ok := s.opts.Finance.(financebridge.Registry)
	if !ok {
		return
	}
	const path = "/v2/orgs/{org}/parcelas/{id}/financeai"
	s.mux.HandleFunc("GET "+path, s.protect("manage", func(w http.ResponseWriter, r *http.Request) {
		p := r.Context().Value(contextKey{}).(principal)
		data, err := finance.Status(r.Context(), p.Access.OrgID, p.User.ID, strings.ToLower(r.PathValue("id")))
		if err != nil {
			upstreamError(w, err)
			return
		}
		write(w, http.StatusOK, map[string]any{"data": data})
	}))
	s.mux.HandleFunc("POST "+path+"/preparar", s.protect("manage", func(w http.ResponseWriter, r *http.Request) {
		var body struct{}
		if !decode(w, r, &body) {
			return
		}
		p := r.Context().Value(contextKey{}).(principal)
		data, err := finance.Prepare(r.Context(), p.Access.OrgID, p.User.ID, strings.ToLower(r.PathValue("id")))
		if err != nil {
			upstreamError(w, err)
			return
		}
		write(w, http.StatusOK, map[string]any{"data": data})
	}))
}
