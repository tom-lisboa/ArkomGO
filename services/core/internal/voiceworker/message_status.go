package voiceworker

import (
	"context"
	"net/http"
	"time"

	"arkom/bia/internal/providers"
)

// A provider acceptance is not a delivery. Verify the callback signature, then
// read the authoritative receipt so spoofed or out-of-order form values cannot
// mark a message as delivered. Messaging receipts work when calls are disabled.
func (s *Server) messageStatus(w http.ResponseWriter, r *http.Request) {
	if !s.verifiedSignature(w, r) {
		return
	}
	id := r.PostForm.Get("MessageSid")
	if !providers.ValidMessageSID(id) {
		http.Error(w, "invalid message", http.StatusBadRequest)
		return
	}
	if s.Messages == nil {
		http.Error(w, "messaging unavailable", http.StatusServiceUnavailable)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	m, err := s.Messages.Fetch(ctx, id)
	if err != nil {
		http.Error(w, "receipt unavailable", http.StatusServiceUnavailable)
		return
	}
	if m.SID != id || m.From != "whatsapp:"+s.Sender {
		http.Error(w, "receipt mismatch", http.StatusForbidden)
		return
	}
	if err := s.Messages.RecordDelivery(ctx, m); err != nil {
		http.Error(w, "receipt storage unavailable", http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
