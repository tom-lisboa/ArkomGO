package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

func (a *App) crmHTTP(w http.ResponseWriter, r *http.Request) bool {
	operation, ok := strings.CutPrefix(r.URL.Path, "/v1/sdr/crm/")
	if !ok {
		return false
	}
	a.mu.Lock()
	if !pilotCORS(w, r) {
		a.mu.Unlock()
		return true
	}
	h := sha256.Sum256([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")))
	session, ok := a.sessions[hex.EncodeToString(h[:])]
	if !ok || !session.Expires.After(a.now()) {
		a.mu.Unlock()
		fail(w, 401, "unauthorized")
		return true
	}
	u, err := a.directoryUser(r.Context(), session.User)
	if err != nil {
		a.mu.Unlock()
		directoryFailure(w, err)
		return true
	}
	route, ok := a.crmRoutes[u.Org]
	if !ok || r.Method != "POST" {
		a.mu.Unlock()
		fail(w, 404, "crm_unavailable")
		return true
	}
	switch operation {
	case "pipelines.list", "pipelines.loss-reasons", "cards.list", "contacts.list":
	case "pipelines.create", "pipelines.update", "pipelines.loss-reasons.update", "stages.update":
		if u.Role != "admin" {
			a.mu.Unlock()
			fail(w, 403, "forbidden")
			return true
		}
	case "contacts.create", "cards.create", "cards.move", "cards.update", "cards.close":
		if u.Role == "viewer" {
			a.mu.Unlock()
			fail(w, 403, "forbidden")
			return true
		}
	default:
		a.mu.Unlock()
		fail(w, 404, "not_found")
		return true
	}
	if !a.allow(w, r, []quota{{"crm:" + u.Org + ":" + u.ID, 60, time.Minute}}) {
		a.mu.Unlock()
		return true
	}
	a.mu.Unlock()

	var body json.RawMessage
	if !decode(w, r, &body) {
		return true
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(route.Origin, "/")+"/integration/v1/crm/"+operation, bytes.NewReader(body))
	if err != nil {
		fail(w, 503, "crm_unavailable")
		return true
	}
	req.Header.Set("Authorization", "Bearer "+route.Token)
	req.Header.Set("X-Organization-ID", route.Organization)
	req.Header.Set("X-Bia-Installation-ID", route.Installation)
	req.Header.Set("Content-Type", "application/json")
	client := http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, err := client.Do(req)
	if err != nil {
		fail(w, 502, "crm_operation_unconfirmed")
		return true
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, (4<<20)+1))
	if err != nil || len(data) > 4<<20 || !json.Valid(data) {
		fail(w, 502, "crm_operation_unconfirmed")
		return true
	}
	if res.StatusCode != 200 || operation != "contacts.create" {
		write(w, res.StatusCode, json.RawMessage(data))
		return true
	}
	var contact struct {
		LeadID string `json:"leadId"`
	}
	var input struct {
		Name string `json:"name"`
	}
	if json.Unmarshal(data, &contact) != nil || !crmUUID.MatchString(contact.LeadID) || json.Unmarshal(body, &input) != nil {
		fail(w, 502, "crm_operation_unconfirmed")
		return true
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, existing := range a.state.Conversations {
		if existing.Org == u.Org && a.state.CRMContacts[u.Org][existing.Contact] == contact.LeadID {
			write(w, 200, map[string]any{"leadId": contact.LeadID, "conversationId": existing.ID})
			return true
		}
	}
	conversation := &Conversation{ID: "conv_test_" + token(), Contact: "contact_test_" + token(), Org: u.Org,
		Label: input.Name, Channel: "fake_whatsapp", Automation: "active", Updated: a.now().UTC()}
	if err := a.transact(func() {
		if a.state.CRMContacts == nil {
			a.state.CRMContacts = make(map[string]map[string]string)
		}
		if a.state.CRMContacts[u.Org] == nil {
			a.state.CRMContacts[u.Org] = make(map[string]string)
		}
		a.state.CRMContacts[u.Org][conversation.Contact] = contact.LeadID
		a.state.Conversations[conversation.ID] = conversation
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "crm.contact.linked", Conversation: conversation.ID})
	}); err != nil {
		fail(w, 503, "storage_unavailable")
		return true
	}
	write(w, 201, map[string]any{"leadId": contact.LeadID, "conversationId": conversation.ID})
	return true
}
