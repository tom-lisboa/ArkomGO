package solutionbus

import (
	"context"
	"errors"
	"net/http"
	"time"

	access "arkom/bia/pkg/platformaccess"
)

func (s Server) resolveIdentity(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Origin") != "" {
		fail(w, 403, "server_identity_required")
		return
	}
	solution := r.PathValue("solution")
	p, ok := s.authorize(w, r, solution, false)
	if !ok {
		return
	}
	if p.solution != solution {
		fail(w, 403, "service_scope_denied")
		return
	}
	var in access.LocalIdentity
	if !decode(w, r, &in) {
		return
	}
	if !access.ValidReference(in.Backend) || !access.ValidReference(in.OrganizationID) || !access.ValidReference(in.ActorID) {
		fail(w, 400, "invalid_local_identity")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	out, err := s.Directory.ResolveService(ctx, p.client, p.organization, p.solution, in)
	if errors.Is(err, access.ErrDenied) {
		fail(w, 403, "platform_access_denied")
		return
	}
	if err != nil {
		fail(w, 503, "platform_directory_unavailable")
		return
	}
	respond(w, 200, out)
}
