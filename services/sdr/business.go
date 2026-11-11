package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sdr-next-pilot/pkg/sdrsdk"
	"slices"
	"strings"
	"time"
	_ "time/tzdata"
)

var coreSolutions = []string{"sdr", "atendimento", "marketing"}
var coreID = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,47}$`)

type BusinessSource struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Content   string   `json:"content"`
	Status    string   `json:"status"`
	Solutions []string `json:"solutions"`
}
type BusinessFact struct {
	ID        string   `json:"id"`
	Topic     string   `json:"topic"`
	Value     string   `json:"value"`
	SourceID  string   `json:"source_id"`
	Solutions []string `json:"solutions"`
}
type BusinessOffer struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	AmountCents int64    `json:"amount_cents"`
	SetupCents  int64    `json:"setup_cents"`
	Cadence     string   `json:"cadence"`
	Conditions  string   `json:"conditions"`
	SourceID    string   `json:"source_id"`
	Solutions   []string `json:"solutions"`
	Active      bool     `json:"active"`
}
type BusinessProfile struct {
	Name             string           `json:"name"`
	Description      string           `json:"description"`
	Audience         string           `json:"audience"`
	Region           string           `json:"region"`
	Timezone         string           `json:"timezone"`
	Tone             string           `json:"tone"`
	BiaPreset        string           `json:"bia_preset,omitempty"`
	EnabledSolutions []string         `json:"enabled_solutions"`
	Offers           []BusinessOffer  `json:"offers"`
	Sources          []BusinessSource `json:"sources"`
	Facts            []BusinessFact   `json:"facts"`
}
type BusinessVersion struct {
	Version      int             `json:"version"`
	Profile      BusinessProfile `json:"profile"`
	Fingerprint  string          `json:"fingerprint"`
	PublishedAt  time.Time       `json:"published_at"`
	PublishedBy  string          `json:"published_by"`
	Reason       string          `json:"reason"`
	RestoredFrom int             `json:"restored_from,omitempty"`
}
type BusinessWorkspace struct {
	Revision  int               `json:"revision"`
	Draft     BusinessProfile   `json:"draft"`
	Versions  []BusinessVersion `json:"versions"`
	UpdatedAt time.Time         `json:"updated_at"`
}
type BusinessContext struct {
	Organization string           `json:"organization_id"`
	Solution     string           `json:"solution"`
	Version      int              `json:"business_version"`
	Fingerprint  string           `json:"fingerprint"`
	Name         string           `json:"name"`
	Description  string           `json:"description"`
	Audience     string           `json:"audience"`
	Region       string           `json:"region"`
	Timezone     string           `json:"timezone"`
	Tone         string           `json:"tone"`
	BiaPreset    string           `json:"bia_preset,omitempty"`
	Offers       []BusinessOffer  `json:"offers"`
	Sources      []BusinessSource `json:"sources"`
	Facts        []BusinessFact   `json:"facts"`
	MaxBytes     int              `json:"max_bytes"`
	// This endpoint never includes another solution's conversations or credentials.
	ConversationMemoryIncluded bool `json:"conversation_memory_included"`
}
type ContextReceipt struct {
	ID               string    `json:"id"`
	Organization     string    `json:"organization_id"`
	Conversation     string    `json:"conversation_id"`
	Solution         string    `json:"solution"`
	BusinessVersion  int       `json:"business_version"`
	Fingerprint      string    `json:"fingerprint"`
	MessageIDs       []string  `json:"message_ids"`
	PreparedAt       time.Time `json:"prepared_at"`
	HistoryTruncated bool      `json:"history_truncated"`
	AIEnabled        bool      `json:"ai_enabled"`
}

func cloneProfile(p BusinessProfile) BusinessProfile {
	b, _ := json.Marshal(p)
	var copy BusinessProfile
	_ = json.Unmarshal(b, &copy)
	return copy
}
func fingerprint(v any) string { b, _ := json.Marshal(v); return fmt.Sprintf("%x", sha256.Sum256(b)) }
func inScope(scopes []string, solution string) bool {
	return slices.Contains(scopes, "all") || slices.Contains(scopes, solution)
}
func validScopes(scopes []string) bool {
	if len(scopes) == 0 || len(scopes) > 3 {
		return false
	}
	seen := map[string]bool{}
	for _, v := range scopes {
		if seen[v] || (v != "all" && !slices.Contains(coreSolutions, v)) {
			return false
		}
		seen[v] = true
	}
	return !seen["all"] || len(scopes) == 1
}
func textOK(s string, max int, required bool) bool {
	return (!required || strings.TrimSpace(s) != "") && len([]rune(s)) <= max && !strings.ContainsRune(s, 0)
}
func validateBusiness(p BusinessProfile, publish bool) []string {
	issues := []string{}
	if !textOK(p.Name, 100, true) || !textOK(p.Description, 1500, true) || !textOK(p.Audience, 800, true) || !textOK(p.Region, 300, true) || !textOK(p.Tone, 500, true) {
		issues = append(issues, "Preencha nome, descrição, público, região e tom dentro dos limites.")
	}
	if p.BiaPreset != "" && !sdrsdk.ValidBiaPreset(p.BiaPreset) {
		issues = append(issues, "Escolha um perfil da Bia disponível.")
	}
	if _, err := time.LoadLocation(p.Timezone); err != nil {
		issues = append(issues, "Escolha um fuso horário válido.")
	}
	if len(p.EnabledSolutions) == 0 || len(p.EnabledSolutions) > 3 {
		issues = append(issues, "Habilite de uma a três soluções.")
	}
	enabled := map[string]bool{}
	for _, v := range p.EnabledSolutions {
		if !slices.Contains(coreSolutions, v) || enabled[v] {
			issues = append(issues, "Solução inválida ou repetida.")
		}
		enabled[v] = true
	}
	if len(p.Sources) > 8 || len(p.Facts) > 24 || len(p.Offers) > 8 {
		issues = append(issues, "Limite do piloto: 8 fontes, 24 regras e 8 ofertas.")
	}
	sources := map[string]BusinessSource{}
	for _, s := range p.Sources {
		_, exists := sources[s.ID]
		if !coreID.MatchString(s.ID) || exists || !textOK(s.Title, 140, true) || !textOK(s.Content, 4000, true) || !validScopes(s.Solutions) || (s.Status != "approved" && s.Status != "draft") {
			issues = append(issues, "Fonte inválida: "+s.ID)
		}
		sources[s.ID] = s
	}
	checkSource := func(id string) {
		s, ok := sources[id]
		if !ok {
			issues = append(issues, "Fonte não encontrada: "+id)
		} else if publish && s.Status != "approved" {
			issues = append(issues, "Aprove a fonte antes de publicar: "+id)
		}
	}
	ids := map[string]bool{}
	for _, f := range p.Facts {
		if !coreID.MatchString(f.ID) || ids[f.ID] || !textOK(f.Topic, 120, true) || !textOK(f.Value, 2000, true) || !validScopes(f.Solutions) {
			issues = append(issues, "Regra inválida: "+f.ID)
		}
		ids[f.ID] = true
		checkSource(f.SourceID)
	}
	ids = map[string]bool{}
	for _, o := range p.Offers {
		if !coreID.MatchString(o.ID) || ids[o.ID] || !textOK(o.Name, 100, true) || !textOK(o.Description, 700, true) || !textOK(o.Conditions, 1000, true) || !validScopes(o.Solutions) || o.AmountCents < 0 || o.AmountCents > 100000000 || o.SetupCents < 0 || o.SetupCents > 100000000 || !slices.Contains([]string{"monthly", "once", "quote"}, o.Cadence) {
			issues = append(issues, "Oferta inválida: "+o.ID)
		}
		if o.Cadence == "quote" && (o.AmountCents != 0 || o.SetupCents != 0) {
			issues = append(issues, "Oferta sob consulta deve deixar os valores zerados.")
		}
		ids[o.ID] = true
		checkSource(o.SourceID)
	}
	if publish && (len(p.Sources) == 0 || len(p.Facts) == 0) {
		issues = append(issues, "Publique ao menos uma fonte aprovada e uma regra do negócio.")
	}
	b, _ := json.Marshal(p)
	if len(b) > 24000 {
		issues = append(issues, "O contexto ultrapassa 24 KB. Reduza o conteúdo para este piloto.")
	}
	return issues
}
func (a *App) initBusinessCore() error {
	if a.state.Business == nil {
		a.state.Business = map[string]*BusinessWorkspace{}
	}
	if a.state.ContextReceipts == nil {
		a.state.ContextReceipts = map[string]ContextReceipt{}
	}
	for _, org := range []string{"org_demo_alfa", "org_demo_beta"} {
		if _, exists := a.state.Business[org]; exists {
			continue
		}
		p := exampleBusiness(org)
		now := a.now().UTC()
		if issues := validateBusiness(p, true); len(issues) > 0 {
			return fmt.Errorf("invalid business fixture: %v", issues)
		}
		a.state.Business[org] = &BusinessWorkspace{Revision: 1, Draft: cloneProfile(p), Versions: []BusinessVersion{{Version: 1, Profile: cloneProfile(p), Fingerprint: fingerprint(p), PublishedAt: now, PublishedBy: "fixture-seed", Reason: "Dados fictícios para homologação"}}, UpdatedAt: now}
		a.record(AuditEntry{Org: org, Actor: "fixture-seed", Action: "business.seeded", Revision: 1})
	}
	return nil
}
func (a *App) businessVersion(org string, version int) (BusinessVersion, bool) {
	ws := a.state.Business[org]
	if ws == nil || len(ws.Versions) == 0 {
		return BusinessVersion{}, false
	}
	if version == 0 {
		return ws.Versions[len(ws.Versions)-1], true
	}
	for _, v := range ws.Versions {
		if v.Version == version {
			return v, true
		}
	}
	return BusinessVersion{}, false
}
func compileBusiness(org, solution string, v BusinessVersion) (BusinessContext, bool) {
	p := v.Profile
	c := BusinessContext{Organization: org, Solution: solution, Version: v.Version, Name: p.Name, Description: p.Description, Audience: p.Audience, Region: p.Region, Timezone: p.Timezone, Tone: p.Tone, Offers: []BusinessOffer{}, Sources: []BusinessSource{}, Facts: []BusinessFact{}, MaxBytes: 32000}
	if !slices.Contains(p.EnabledSolutions, solution) {
		return c, false
	}
	if solution == "sdr" {
		c.BiaPreset = p.BiaPreset
	}
	sources := map[string]bool{}
	for _, s := range p.Sources {
		if s.Status == "approved" && inScope(s.Solutions, solution) {
			c.Sources = append(c.Sources, s)
			sources[s.ID] = true
		}
	}
	for _, f := range p.Facts {
		if sources[f.SourceID] && inScope(f.Solutions, solution) {
			c.Facts = append(c.Facts, f)
		}
	}
	for _, o := range p.Offers {
		if o.Active && sources[o.SourceID] && inScope(o.Solutions, solution) {
			c.Offers = append(c.Offers, o)
		}
	}
	c.Fingerprint = fingerprint(c)
	b, _ := json.Marshal(c)
	return c, len(b) <= c.MaxBytes
}
func (a *App) solutionBusiness(org, solution string, version int) (BusinessContext, bool) {
	v, ok := a.businessVersion(org, version)
	if !ok {
		return BusinessContext{}, false
	}
	return compileBusiness(org, solution, v)
}
func (a *App) businessView(org string) map[string]any {
	ws := a.state.Business[org]
	latest, _ := a.businessVersion(org, 0)
	summaries := []map[string]any{}
	for i := len(ws.Versions) - 1; i >= 0; i-- {
		v := ws.Versions[i]
		summaries = append(summaries, map[string]any{"version": v.Version, "published_at": v.PublishedAt, "published_by": v.PublishedBy, "reason": v.Reason, "restored_from": v.RestoredFrom})
	}
	return map[string]any{"organization_id": org, "revision": ws.Revision, "draft": ws.Draft, "bia_presets": sdrsdk.BiaPresets(), "published": latest, "history": summaries, "has_unpublished_changes": fingerprint(ws.Draft) != latest.Fingerprint, "fictional_data": true, "updated_at": ws.UpdatedAt}
}
func decodeCore(w http.ResponseWriter, r *http.Request, v any) bool {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 48<<10))
	d.DisallowUnknownFields()
	if d.Decode(v) != nil || d.Decode(new(any)) != io.EOF {
		fail(w, 400, "invalid_json")
		return false
	}
	return true
}
func (a *App) businessRoute(w http.ResponseWriter, r *http.Request, u User, path string) {
	ws := a.state.Business[u.Org]
	if ws == nil {
		fail(w, 404, "not_found")
		return
	}
	if r.Method == "GET" && path == "v1/core/business" {
		write(w, 200, a.businessView(u.Org))
		return
	}
	parts := strings.Split(path, "/")
	if r.Method == "GET" && len(parts) == 5 && parts[2] == "solutions" && parts[4] == "context" {
		c, ok := a.solutionBusiness(u.Org, parts[3], 0)
		if !ok {
			fail(w, 404, "solution_unavailable")
			return
		}
		write(w, 200, c)
		return
	}
	if r.Method != "POST" || !slices.Contains([]string{"v1/core/business/draft", "v1/core/business/publish", "v1/core/business/restore", "v1/core/business/preview"}, path) {
		fail(w, 404, "not_found")
		return
	}
	preview := strings.HasSuffix(path, "/preview")
	if (!preview && u.Role != "admin") || (preview && u.Role == "viewer") {
		if a.deniedAudit(w, u, "business.command.denied") {
			fail(w, 403, "forbidden")
		}
		return
	}
	var b struct {
		Profile          *BusinessProfile `json:"profile,omitempty"`
		ExpectedRevision *int             `json:"expected_revision,omitempty"`
		Reason           string           `json:"reason,omitempty"`
		Version          int              `json:"version,omitempty"`
		Target           string           `json:"target,omitempty"`
		Solution         string           `json:"solution,omitempty"`
	}
	if !decodeCore(w, r, &b) {
		return
	}
	if preview {
		if b.Profile != nil || b.ExpectedRevision != nil || b.Reason != "" || b.Version != 0 || !slices.Contains([]string{"draft", "published"}, b.Target) || !slices.Contains(coreSolutions, b.Solution) {
			fail(w, 422, "validation_error")
			return
		}
		v, _ := a.businessVersion(u.Org, 0)
		issues := []string{}
		if b.Target == "draft" {
			v = BusinessVersion{Profile: ws.Draft}
			issues = validateBusiness(ws.Draft, true)
		}
		c, ok := compileBusiness(u.Org, b.Solution, v)
		if !ok {
			issues = append(issues, "Esta solução não está habilitada ou o contexto excede o limite.")
		}
		write(w, 200, map[string]any{"context": c, "issues": issues, "ready_to_publish": len(issues) == 0, "target": b.Target, "ai_enabled": false, "external_effects": false, "checks": businessChecks(c, ok, issues)})
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if len(key) == 0 || len(key) > 100 || b.ExpectedRevision == nil || *b.ExpectedRevision < 1 || !textOK(b.Reason, 500, true) || b.Target != "" || b.Solution != "" {
		fail(w, 422, "validation_error")
		return
	}
	isDraft := strings.HasSuffix(path, "/draft")
	isRestore := strings.HasSuffix(path, "/restore")
	if (isDraft && (b.Profile == nil || b.Version != 0)) || (!isDraft && b.Profile != nil) || (!isRestore && b.Version != 0) || (isRestore && b.Version < 1) {
		fail(w, 422, "validation_error")
		return
	}
	fp := fingerprint(struct {
		Path string
		Body any
	}{path, b})
	rk := "business:" + u.Org + ":" + u.ID + ":" + key
	if a.replay(w, rk, fp) {
		return
	}
	if *b.ExpectedRevision != ws.Revision {
		fail(w, 409, "revision_conflict")
		return
	}
	candidate := ws.Draft
	if isDraft {
		candidate = cloneProfile(*b.Profile)
		if candidate.BiaPreset == "" {
			candidate.BiaPreset = ws.Draft.BiaPreset
		}
	}
	if isRestore {
		v, ok := a.businessVersion(u.Org, b.Version)
		if !ok {
			fail(w, 404, "not_found")
			return
		}
		candidate = cloneProfile(v.Profile)
	}
	issues := validateBusiness(candidate, !isDraft)
	if len(issues) > 0 {
		write(w, 422, map[string]any{"error": "business_validation", "issues": issues})
		return
	}
	if !isDraft && len(ws.Versions) >= 200 {
		fail(w, 409, "version_limit")
		return
	}
	operation := token()
	var response map[string]any
	err := a.transact(func() {
		ws.Draft = cloneProfile(candidate)
		ws.Revision++
		ws.UpdatedAt = a.now().UTC()
		action := "business.draft.saved"
		if !isDraft {
			v := BusinessVersion{Version: ws.Versions[len(ws.Versions)-1].Version + 1, Profile: cloneProfile(candidate), Fingerprint: fingerprint(candidate), PublishedAt: a.now().UTC(), PublishedBy: u.ID, Reason: b.Reason}
			if isRestore {
				v.RestoredFrom = b.Version
				action = "business.version.restored"
			} else {
				action = "business.version.published"
			}
			ws.Versions = append(ws.Versions, v)
			a.cancelPlatformPending(u.Org, "business_context_changed")
			// A draft written under older business rules may never be delivered after publication.
			for _, c := range a.state.Conversations {
				if c.Org == u.Org {
					a.state.Generation[c.ID]++
					a.invalidatePipeline(c, true)
					a.cancelOldAutomatic(c)
				}
			}
		}
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: action, Operation: operation, Revision: ws.Revision, Reason: b.Reason})
		response = map[string]any{"operation_id": operation, "duplicate": false, "business": a.businessView(u.Org)}
		raw, _ := json.Marshal(response)
		a.state.Results[rk] = result{Fingerprint: fp, Body: raw, Code: 200}
	})
	if err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, response)
}
func (a *App) cancelOldAutomatic(c *Conversation) {
	for _, task := range a.state.Tasks {
		if !task.Automatic || task.Conversation != c.ID {
			continue
		}
		for i := range a.state.Messages[c.ID] {
			m := &a.state.Messages[c.ID][i]
			if m.ID == task.Message && m.Status == "queued" {
				m.Status = "cancelled"
				a.touch(c)
				a.event(c, "message.updated", m.ID)
				a.record(AuditEntry{Org: c.Org, Actor: "business-core", Action: "message.cancelled.context_changed", Conversation: c.ID, Operation: m.ID, Revision: c.Revision})
			}
		}
	}
}
func businessChecks(c BusinessContext, enabled bool, issues []string) []map[string]any {
	return []map[string]any{
		{"id": "valid", "name": "Dados completos e fontes aprovadas", "passed": len(issues) == 0, "detail": "Verificação estrutural; não mede qualidade de resposta de IA."},
		{"id": "enabled", "name": "Solução autorizada a consumir o contexto", "passed": enabled, "detail": "O servidor resolve empresa e escopo pela sessão."},
		{"id": "provenance", "name": "Regras e ofertas com origem identificada", "passed": enabled && len(c.Facts) > 0 && len(c.Sources) > 0, "detail": "Somente fontes aprovadas e visíveis para esta solução entram no contexto."},
		{"id": "private", "name": "Conversas e credenciais fora da base compartilhada", "passed": enabled && !c.ConversationMemoryIncluded, "detail": "O histórico do atendimento permanece no SDR da própria empresa."},
	}
}
func (a *App) prepareBusinessContext(c *Conversation) (ContextReceipt, bool) {
	ctx, ok := a.solutionBusiness(c.Org, "sdr", 0)
	if !ok {
		return ContextReceipt{}, false
	}
	ids := []string{}
	size := 0
	history := a.state.Messages[c.ID]
	for i := len(history) - 1; i >= 0 && len(ids) < 20; i-- {
		m := history[i]
		if m.Direction != "inbound" && m.Status != "sent" {
			continue
		}
		if size+len(m.Text) > 16000 {
			break
		}
		ids = append(ids, m.ID)
		size += len(m.Text)
	}
	slices.Reverse(ids)
	receipt := ContextReceipt{ID: token(), Organization: c.Org, Conversation: c.ID, Solution: "sdr", BusinessVersion: ctx.Version, Fingerprint: ctx.Fingerprint, MessageIDs: ids, PreparedAt: a.now().UTC(), HistoryTruncated: len(ids) < len(history)}
	a.state.ContextReceipts[c.ID] = receipt
	a.record(AuditEntry{Org: c.Org, Actor: "business-core", Action: "context.prepared", Conversation: c.ID, Operation: receipt.ID, Revision: ctx.Version})
	return receipt, true
}
func (a *App) conversationContext(w http.ResponseWriter, r *http.Request, u User, c *Conversation) {
	current, available := a.solutionBusiness(u.Org, "sdr", 0)
	var prepared any
	if receipt, ok := a.state.ContextReceipts[c.ID]; ok && receipt.Organization == u.Org {
		ctx, ok := a.solutionBusiness(u.Org, "sdr", receipt.BusinessVersion)
		if ok {
			history := []map[string]any{}
			for _, id := range receipt.MessageIDs {
				for _, m := range a.state.Messages[c.ID] {
					if m.ID == id {
						history = append(history, map[string]any{"id": m.ID, "author": m.Author, "text": m.Text})
						break
					}
				}
			}
			prepared = map[string]any{"receipt": receipt, "business": ctx, "history": history, "superseded": !available || ctx.Fingerprint != current.Fingerprint}
		}
	}
	write(w, 200, map[string]any{"current_business": current, "solution_available": available, "last_prepared": prepared, "automation": c.Automation, "opted_out": c.OptedOut, "ai_enabled": a.pipelineEnabled && a.workerHealth["execution"].Model != "", "delivery": "test_only", "runtime": a.pipelineStatus(u, c)})
}
