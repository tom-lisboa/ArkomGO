package solutionbus

import (
	"context"
	"errors"
	"net/http"
	"time"

	"arkom/bia/internal/crmsync"
)

func (s Server) crm(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authorize(w, r, "bia-sdr", true)
	if !ok {
		return
	}
	installation := r.Header.Get("X-Bia-Installation-ID")
	if !uuidRE.MatchString(installation) {
		fail(w, 400, "invalid_crm_installation")
		return
	}
	var input crmsync.CRMRequest
	if !decode(w, r, &input) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	output, err := s.CRM.CRM(ctx, p.organization, p.client, installation, r.PathValue("operation"), input)
	switch {
	case errors.Is(err, crmsync.ErrRoute):
		fail(w, 503, "crm_route_unavailable")
	case errors.Is(err, crmsync.ErrPayload):
		fail(w, 422, "invalid_crm_input")
	case errors.Is(err, crmsync.ErrCardCloseRejected):
		fail(w, 422, "crm_card_close_rejected")
	case err != nil:
		fail(w, 502, "crm_operation_unconfirmed")
	default:
		respond(w, 200, output)
	}
}
