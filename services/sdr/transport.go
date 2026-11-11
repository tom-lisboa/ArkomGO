package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"sdr-next-pilot/pkg/sdrsdk"
	"sort"
	"strings"
	"time"
)

var realPhone = regexp.MustCompile(`^[1-9][0-9]{9,14}$`)
var transportID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)

type transportPolicy struct {
	MediaEnabled bool      `json:"media_enabled,omitempty"`
	Enabled      bool      `json:"enabled"`
	Revision     int       `json:"revision"`
	Epoch        string    `json:"epoch"`
	Since        time.Time `json:"since"`
	Allowed      []string  `json:"allowed"`
}
type realInbound struct {
	Human        bool              `json:"human,omitempty"`
	Media        *sdrsdk.MediaFile `json:"media,omitempty"`
	ID           string            `json:"id"`
	Organization string            `json:"organization_id"`
	Epoch        string            `json:"epoch"`
	ProviderID   string            `json:"provider_id"`
	Target       string            `json:"target"`
	Name         string            `json:"name"`
	Text         string            `json:"text"`
	At           time.Time         `json:"at"`
}
type realEnvelope struct {
	MediaSeconds    int    `json:"media_seconds,omitempty"`
	MediaID         string `json:"media_id,omitempty"`
	MediaKind       string `json:"media_kind,omitempty"`
	MediaMIME       string `json:"media_mime,omitempty"`
	MediaName       string `json:"media_name,omitempty"`
	MediaSHA256     string `json:"media_sha256,omitempty"`
	MediaSize       int    `json:"media_size,omitempty"`
	ID              string `json:"id"`
	Organization    string `json:"organization_id"`
	Conversation    string `json:"conversation_id"`
	Epoch           string `json:"epoch"`
	Target          string `json:"target"`
	Text            string `json:"text"`
	Automatic       bool   `json:"automatic"`
	Generation      int    `json:"generation"`
	InputVersion    int    `json:"input_version"`
	BusinessVersion int    `json:"business_version"`
}
type realResult struct {
	Status     string `json:"status"`
	ProviderID string `json:"provider_id,omitempty"`
}
type realBinding struct{ Org, Target, Epoch string }
type realDelivery struct {
	Sequence                         int
	Envelope                         realEnvelope
	Status, Claim, ProviderID, RunID string
}
type TransportState struct {
	Policies   map[string]transportPolicy
	Bindings   map[string]realBinding
	Deliveries map[string]*realDelivery
	Received   map[string]bool
	Synced     map[string]int
	LastSync   map[string]time.Time
}
type realEngine interface {
	PutMessaging(context.Context, string, transportPolicy) error
	Inbox(context.Context, string) ([]realInbound, error)
	AckInbox(context.Context, string, string) error
	Enqueue(context.Context, realEnvelope) (realResult, error)
	Delivery(context.Context, string, string) (realResult, error)
}

func (e *engineClient) PutMessaging(ctx context.Context, org string, p transportPolicy) error {
	return e.call(ctx, "POST", "/internal/accounts/"+url.PathEscape(org)+"/messaging", p, nil)
}
func (e *engineClient) Inbox(ctx context.Context, org string) ([]realInbound, error) {
	var b struct {
		Items []realInbound `json:"items"`
	}
	err := e.call(ctx, "GET", "/internal/accounts/"+url.PathEscape(org)+"/inbox", nil, &b)
	return b.Items, err
}
func (e *engineClient) AckInbox(ctx context.Context, org, id string) error {
	return e.call(ctx, "POST", "/internal/accounts/"+url.PathEscape(org)+"/inbox/"+url.PathEscape(id)+"/ack", struct{}{}, nil)
}
func (e *engineClient) Enqueue(ctx context.Context, b realEnvelope) (realResult, error) {
	var r realResult
	err := e.call(ctx, "POST", "/internal/accounts/"+url.PathEscape(b.Organization)+"/outbox", b, &r)
	return r, err
}
func (e *engineClient) Delivery(ctx context.Context, org, id string) (realResult, error) {
	var r realResult
	err := e.call(ctx, "GET", "/internal/accounts/"+url.PathEscape(org)+"/outbox/"+url.PathEscape(id), nil, &r)
	return r, err
}
func (a *App) initTransport() {
	a.transportErrors = map[string]string{}
	p := &a.state.Transport
	if p.Policies == nil {
		p.Policies = map[string]transportPolicy{}
	}
	if p.Bindings == nil {
		p.Bindings = map[string]realBinding{}
	}
	if p.Deliveries == nil {
		p.Deliveries = map[string]*realDelivery{}
	}
	if p.Received == nil {
		p.Received = map[string]bool{}
	}
	if p.Synced == nil {
		p.Synced = map[string]int{}
	}
	if p.LastSync == nil {
		p.LastSync = map[string]time.Time{}
	}
	for _, org := range []string{"org_demo_alfa", "org_demo_beta"} {
		if _, ok := p.Policies[org]; !ok {
			p.Policies[org] = transportPolicy{Revision: 1, Epoch: token(), Since: a.now().UTC(), Allowed: []string{}}
		}
	}
}
func allowsReal(p transportPolicy, epoch, target string) bool {
	if !p.Enabled || p.Epoch != epoch {
		return false
	}
	for _, v := range p.Allowed {
		if v == target {
			return true
		}
	}
	return false
}
func (a *App) messagingView(org string) map[string]any {
	p := a.state.Transport.Policies[org]
	phones := []string{}
	for _, v := range p.Allowed {
		phones = append(phones, strings.TrimSuffix(v, "@s.whatsapp.net"))
	}
	return map[string]any{"enabled": p.Enabled, "revision": p.Revision, "test_phones": phones, "synced": a.state.Transport.Synced[org] == p.Revision, "last_sync": a.state.Transport.LastSync[org], "text_only": !p.MediaEnabled, "media_enabled": p.MediaEnabled, "media_available": a.mediaEnabled, "max_media_bytes": sdrsdk.MaxMediaBytes, "max_test_contacts": 3, "error_code": a.transportErrors[org]}
}
func (a *App) messagingRoute(w http.ResponseWriter, r *http.Request, u User) {
	if r.Method == "GET" {
		write(w, 200, a.messagingView(u.Org))
		return
	}
	if r.Method != "POST" {
		fail(w, 404, "not_found")
		return
	}
	if u.Role != "admin" {
		fail(w, 403, "forbidden")
		return
	}
	var b struct {
		Enabled      bool     `json:"enabled"`
		MediaEnabled bool     `json:"media_enabled,omitempty"`
		Phones       []string `json:"test_phones"`
		Revision     *int     `json:"expected_revision"`
		Reason       string   `json:"reason"`
	}
	if !decode(w, r, &b) {
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if key == "" || len(key) > 100 || b.Revision == nil || !textOK(b.Reason, 500, true) || len(b.Phones) > 3 || (b.Enabled && len(b.Phones) == 0) {
		fail(w, 422, "validation_error")
		return
	}
	targets := []string{}
	seen := map[string]bool{}
	for _, v := range b.Phones {
		v = strings.NewReplacer("+", "", " ", "", "-", "", "(", "", ")", "").Replace(v)
		if !realPhone.MatchString(v) || seen[v] {
			fail(w, 422, "invalid_phone")
			return
		}
		seen[v] = true
		targets = append(targets, v+"@s.whatsapp.net")
	}
	rk := "real-policy:" + u.Org + ":" + u.ID + ":" + key
	fp := fingerprint(b)
	if a.replay(w, rk, fp) {
		return
	}
	p := a.state.Transport.Policies[u.Org]
	if b.MediaEnabled && !a.mediaEnabled {
		fail(w, 409, "media_not_configured")
		return
	}
	if *b.Revision != p.Revision {
		fail(w, 409, "revision_conflict")
		return
	}
	if b.Enabled {
		if !a.pipelineEnabled {
			fail(w, 409, "ai_not_ready")
			return
		}
		if _, ok := a.wa.(realEngine); !ok {
			fail(w, 409, "transport_not_ready")
			return
		}
		var raw []byte
		if a.db == nil || a.db.QueryRow("SELECT view FROM whatsapp_channels WHERE organization_id=?", u.Org).Scan(&raw) != nil {
			fail(w, 409, "whatsapp_not_connected")
			return
		}
		var view WhatsAppView
		_ = json.Unmarshal(raw, &view)
		if view.Status != "connected" {
			fail(w, 409, "whatsapp_not_connected")
			return
		}
	}
	var out map[string]any
	err := a.transact(func() {
		a.state.Transport.Policies[u.Org] = transportPolicy{Enabled: b.Enabled, MediaEnabled: b.MediaEnabled, Revision: p.Revision + 1, Epoch: token(), Since: a.now().UTC(), Allowed: targets}
		for _, c := range a.state.Conversations {
			if c.Org == u.Org && c.Channel == "whatsapp" {
				a.state.Generation[c.ID]++
				a.invalidatePipeline(c, false)
				a.cancelOldAutomatic(c)
				a.touch(c)
			}
		}
		for _, d := range a.state.Transport.Deliveries {
			if d.Envelope.Organization == u.Org && d.Status == "queued" {
				a.realStatus(d, "cancelled", "")
			}
		}
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "whatsapp.messaging.configured", Revision: p.Revision + 1, Reason: b.Reason})
		out = map[string]any{"messaging": a.messagingView(u.Org), "duplicate": false}
		raw, _ := json.Marshal(out)
		a.state.Results[rk] = result{fp, raw, 200}
	})
	if err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, out)
}
func (a *App) applyLead(c *Conversation, text string) Message {
	m := a.message(c, text, "lead")
	if a.pipelineEnabled {
		c.InputVersion++
		a.invalidatePipeline(c, true)
		a.cancelOldAutomatic(c)
		if pipelineOptOut(text) {
			c.OptedOut = true
			c.Automation = "paused"
			a.state.Generation[c.ID]++
			a.invalidatePipeline(c, false)
			a.touch(c)
		} else if c.Automation == "active" && !c.OptedOut {
			if _, ok := a.solutionBusiness(c.Org, "sdr", 0); ok {
				a.queueContext(c, m.ID)
			}
		}
	} else if c.Channel == "fake_whatsapp" && c.Automation == "active" && !c.OptedOut {
		if receipt, ok := a.prepareBusinessContext(c); ok {
			reply := a.message(c, "[SIMULAÇÃO] Recebemos sua mensagem.", "assistant")
			list := a.state.Messages[c.ID]
			list[len(list)-1].BusinessVersion = receipt.BusinessVersion
			a.state.Messages[c.ID] = list
			a.state.Tasks = append(a.state.Tasks, Task{Conversation: c.ID, Message: reply.ID, Org: c.Org, Generation: a.state.Generation[c.ID], Automatic: true})
		}
	}
	return m
}
func (a *App) ingestReal(v realInbound) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	p := a.state.Transport.Policies[v.Organization]
	if !allowsReal(p, v.Epoch, v.Target) || v.At.Before(p.Since.Truncate(time.Second)) {
		return errors.New("transport_policy_changed")
	}
	if !transportID.MatchString(v.ID) || v.ProviderID == "" || !textOK(v.Text, 4000, !v.Human && v.Media == nil) || (v.Media != nil && (v.Human || !a.mediaEnabled || !p.MediaEnabled)) {
		return errors.New("invalid_transport_input")
	}
	k := v.Organization + ":" + v.ID
	if a.state.Transport.Received[k] {
		return nil
	}
	h := sha256.Sum256([]byte(v.Organization + ":" + v.Target))
	id := "conv_wa_" + hex.EncodeToString(h[:16])
	c := a.state.Conversations[id]
	count, msgs := 0, 0
	for _, conv := range a.state.Conversations {
		if conv.Org == v.Organization && conv.Channel == "whatsapp" {
			count++
			msgs += len(a.state.Messages[conv.ID])
		}
	}
	if !v.Human && ((c == nil && count >= 100) || msgs >= 2000) {
		return errors.New("transport_pilot_limit")
	}
	return a.transact(func() {
		if v.Human && c == nil && (count >= 100 || msgs >= 2000) {
			a.state.Transport.Received[k] = true
			return
		}
		if c == nil {
			label := v.Name
			if len([]rune(label)) > 100 {
				label = ""
			}
			if label == "" {
				phone := strings.TrimSuffix(v.Target, "@s.whatsapp.net")
				label = "WhatsApp · " + phone[len(phone)-4:]
			}
			c = &Conversation{ID: id, Label: label, Org: v.Organization, Contact: "contact_wa_" + hex.EncodeToString(h[:16]), Channel: "whatsapp", Automation: "active", Updated: a.now().UTC()}
			a.state.Conversations[id] = c
		}
		a.state.Transport.Bindings[id] = realBinding{v.Organization, v.Target, v.Epoch}
		if v.Human {
			if c.Automation == "active" && (c.ResumedAt == nil || !v.At.Before(c.ResumedAt.Truncate(time.Second))) {
				a.takeOverWhatsApp(c)
			}
			operation := v.ID
			if msgs < 2000 {
				body := v.Text
				if strings.TrimSpace(body) == "" {
					body = "[Mídia enviada pelo atendimento humano]"
				}
				m := a.message(c, body, "human")
				list := a.state.Messages[id]
				list[len(list)-1].Status = "sent"
				list[len(list)-1].Created = v.At
				operation = m.ID
			}
			a.state.Transport.Received[k] = true
			a.record(AuditEntry{Org: v.Organization, Actor: "whatsapp-transport", Action: "whatsapp.human.accepted", Conversation: id, Operation: operation, Revision: c.Revision})
			return
		}
		text := v.Text
		if v.Media != nil && strings.TrimSpace(text) == "" {
			text = "[Mídia recebida; processamento pendente]"
		}
		m := a.applyLead(c, text)
		if v.Media != nil {
			a.incomingMedia(c, m.ID, v)
		}
		a.state.Transport.Received[k] = true
		a.record(AuditEntry{Org: v.Organization, Actor: "whatsapp-transport", Action: "whatsapp.inbound.accepted", Conversation: id, Operation: m.ID, Revision: c.Revision})
	})
}

func (a *App) takeOverWhatsApp(c *Conversation) {
	c.Automation = "human"
	a.state.Generation[c.ID]++
	a.invalidatePipeline(c, false)
	a.cancelOldAutomatic(c)
	a.touch(c)
}
func (a *App) realEligible(d *realDelivery) bool {
	e := d.Envelope
	c := a.state.Conversations[e.Conversation]
	b := a.state.Transport.Bindings[e.Conversation]
	p := a.state.Transport.Policies[e.Organization]
	if c == nil || c.Org != e.Organization || c.Channel != "whatsapp" || b.Org != e.Organization || b.Target != e.Target || b.Epoch != e.Epoch || !allowsReal(p, e.Epoch, e.Target) || c.OptedOut || a.state.Generation[c.ID] != e.Generation {
		return false
	}
	if !a.envelopeMediaAllowed(e) {
		return false
	}
	if e.Automatic {
		if !a.pipelineEnabled || c.Automation != "active" || c.InputVersion != e.InputVersion {
			return false
		}
		business, ok := a.solutionBusiness(c.Org, "sdr", 0)
		if !ok || business.Version != e.BusinessVersion {
			return false
		}
	}
	if !e.Automatic && c.Automation == "active" {
		return false
	}
	found := false
	for _, m := range a.state.Messages[c.ID] {
		if m.ID == e.ID && (m.Status == "queued" || m.Status == "sending") {
			if !a.workflowMediaDeliveryAllowed(c, &m) {
				return false
			}
			found = true
		}
	}
	if !found {
		return false
	}
	if e.Automatic && d.RunID != "" {
		run := a.state.Pipeline.Runs[d.RunID]
		if run == nil || run.Status != "completed" || !a.pipelineFence(c, run.Context) {
			return false
		}
	}
	return true
}
func (a *App) realStatus(d *realDelivery, status, provider string) {
	if d.Status != status {
		if status == "sending" {
			a.metricStart("whatsapp", d.Envelope.Organization, d.Envelope.ID, d.Claim, "outbound", "real", a.metricTransportParents(d)...)
		}
		if status == "sent" || status == "uncertain" || status == "cancelled" {
			outcome := status
			if status == "sent" {
				outcome = "completed"
			}
			a.metricEnd("whatsapp", d.Envelope.Organization, d.Envelope.ID, d.Claim, outcome)
		}
	}
	d.Status = status
	if provider != "" {
		d.ProviderID = provider
	}
	c := a.state.Conversations[d.Envelope.Conversation]
	if c == nil {
		return
	}
	for i := range a.state.Messages[c.ID] {
		m := &a.state.Messages[c.ID][i]
		if m.ID == d.Envelope.ID && m.Status != status {
			m.Status = status
			a.touch(c)
			a.event(c, "message.updated", m.ID)
			a.record(AuditEntry{Org: c.Org, Actor: "whatsapp-transport", Action: "whatsapp.message." + status, Conversation: c.ID, Operation: m.ID, Revision: c.Revision})
		}
	}
}
func (a *App) authorizeReal(w http.ResponseWriter, r *http.Request) {
	var expected string
	if e, ok := a.wa.(*engineClient); ok {
		expected = e.secret
	}
	actual := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if len(expected) < 40 || subtle.ConstantTimeCompare([]byte(actual), []byte(expected)) != 1 {
		fail(w, 401, "unauthorized")
		return
	}
	var b struct {
		Envelope realEnvelope `json:"envelope"`
		Claim    string       `json:"claim"`
	}
	if !decodeCore(w, r, &b) {
		return
	}
	d := a.state.Transport.Deliveries[b.Envelope.ID]
	if d == nil || d.Envelope != b.Envelope || d.Status != "queued" || !transportID.MatchString(b.Claim) || !a.realEligible(d) {
		fail(w, 409, "dispatch_not_permitted")
		return
	}
	if err := a.transact(func() { d.Claim = b.Claim; a.realStatus(d, "sending", "") }); err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, map[string]bool{"allowed": true})
}

// One coordinator per API. All socket waits occur outside App.mu.
func (a *App) TransportTick(ctx context.Context) error {
	a.transportMu.Lock()
	defer a.transportMu.Unlock()
	engine, ok := a.wa.(realEngine)
	if !ok {
		return nil
	}
	var firstErr error
companyLoop:
	for _, org := range []string{"org_demo_alfa", "org_demo_beta"} {
		a.mu.Lock()
		p := a.state.Transport.Policies[org]
		needSync := a.state.Transport.Synced[org] != p.Revision || a.now().Sub(a.state.Transport.LastSync[org]) >= 30*time.Second
		a.mu.Unlock()
		var err error
		if needSync {
			err = engine.PutMessaging(ctx, org, p)
		}
		if err != nil {
			a.setTransportError(org, "transport_unavailable")
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		a.mu.Lock()
		if needSync && a.state.Transport.Policies[org].Revision == p.Revision {
			err = a.transact(func() { a.state.Transport.Synced[org] = p.Revision; a.state.Transport.LastSync[org] = a.now().UTC() })
		}
		a.mu.Unlock()
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		if p.Enabled {
			items, e := engine.Inbox(ctx, org)
			if e != nil {
				a.setTransportError(org, "transport_unavailable")
				continue
			}
			for _, item := range items {
				if item.Organization != org {
					a.setTransportError(org, "transport_scope_mismatch")
					if firstErr == nil {
						firstErr = errors.New("transport_scope_mismatch")
					}
					continue companyLoop
				}
				if e = a.ingestReal(item); e != nil {
					a.setTransportError(org, e.Error())
					if firstErr == nil {
						firstErr = e
					}
					continue companyLoop
				}
				if e = engine.AckInbox(ctx, org, item.ID); e != nil {
					a.setTransportError(org, "transport_unavailable")
					if firstErr == nil {
						firstErr = e
					}
					continue companyLoop
				}
			}
		}
		a.setTransportError(org, "")
	}
	a.mu.Lock()
	needPreparation := false
	for _, t := range a.state.Tasks {
		c := a.state.Conversations[t.Conversation]
		if c == nil || c.Channel != "whatsapp" {
			continue
		}
		d := a.state.Transport.Deliveries[t.Message]
		if d == nil || (d.Status != "queued" && d.Status != "sending") || (d.Status == "queued" && !a.realEligible(d)) {
			needPreparation = true
			break
		}
	}
	var err error
	if needPreparation {
		err = a.transact(func() {
			remaining := []Task{}
			for _, t := range a.state.Tasks {
				c := a.state.Conversations[t.Conversation]
				if c == nil || c.Channel != "whatsapp" {
					remaining = append(remaining, t)
					continue
				}
				var m *Message
				for i := range a.state.Messages[c.ID] {
					if a.state.Messages[c.ID][i].ID == t.Message {
						m = &a.state.Messages[c.ID][i]
						break
					}
				}
				if m == nil {
					continue
				}
				d := a.state.Transport.Deliveries[m.ID]
				if d == nil && m.Status == "queued" {
					b := a.state.Transport.Bindings[c.ID]
					d = &realDelivery{Sequence: m.Sequence, Envelope: realEnvelope{ID: m.ID, Organization: c.Org, Conversation: c.ID, Epoch: b.Epoch, Target: b.Target, Text: m.Text, Automatic: t.Automatic, Generation: t.Generation, InputVersion: c.InputVersion, BusinessVersion: m.BusinessVersion}, Status: "queued", RunID: t.RunID}
					a.addEnvelopeMedia(&d.Envelope, m)
					a.state.Transport.Deliveries[m.ID] = d
				}
				if d != nil && d.Status == "queued" && (m.Status != "queued" || !a.realEligible(d)) {
					a.realStatus(d, "cancelled", "")
				}
				if d != nil && (d.Status == "queued" || d.Status == "sending") {
					remaining = append(remaining, t)
				}
			}
			a.state.Tasks = remaining
		})
	}
	pending := []realEnvelope{}
	for _, d := range a.state.Transport.Deliveries {
		if d.Status == "queued" || d.Status == "sending" {
			pending = append(pending, d.Envelope)
		}
	}
	sort.Slice(pending, func(i, j int) bool {
		if pending[i].Conversation != pending[j].Conversation {
			return pending[i].Conversation < pending[j].Conversation
		}
		return a.state.Transport.Deliveries[pending[i].ID].Sequence < a.state.Transport.Deliveries[pending[j].ID].Sequence
	})
	a.mu.Unlock()
	if err != nil {
		return err
	}
	blocked := map[string]bool{}
	for _, env := range pending {
		if blocked[env.Conversation] {
			continue
		}
		blocked[env.Conversation] = true
		r, e := engine.Enqueue(ctx, env)
		if e != nil {
			a.setTransportError(env.Organization, "transport_unavailable")
			continue
		}
		if r.Status == "queued" || r.Status == "sending" {
			r, e = engine.Delivery(ctx, env.Organization, env.ID)
			if e != nil {
				continue
			}
		}
		a.mu.Lock()
		d := a.state.Transport.Deliveries[env.ID]
		if d != nil {
			if r.Status == "sent" || r.Status == "uncertain" || r.Status == "cancelled" {
				e = a.transact(func() { a.realStatus(d, r.Status, r.ProviderID) })
			}
		}
		a.mu.Unlock()
		if e != nil {
			return e
		}
	}
	return firstErr
}
func (a *App) setTransportError(org, code string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.transportErrors[org] = code
}
