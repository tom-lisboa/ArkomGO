package main

import (
	"cmp"
	"crypto/sha256"
	"fmt"
	"maps"
	"net/http"
	"net/mail"
	"os"
	"slices"
	"strings"
)

const betaOrganization = "org_demo_beta"

type homologCRM struct {
	Pipelines map[string]homologPipeline
	Contacts  map[string]homologContact
	Cards     map[string]homologCard
}

type homologStage struct {
	ID    string `json:"stageId"`
	Name  string `json:"stageName"`
	Order int    `json:"displayOrder"`
}

type homologPipeline struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Stages      []homologStage `json:"stagesBreakdown"`
	Reasons     []string       `json:"reasons"`
	Restricted  bool           `json:"restricted"`
}

type homologContact struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Telephone string `json:"telephone,omitempty"`
}

type homologCard struct {
	ID          string `json:"id"`
	PipelineID  string `json:"pipelineId"`
	StageID     string `json:"stageId"`
	LeadID      string `json:"leadId"`
	Title       string `json:"title"`
	Status      string `json:"status"`
	LossReason  string `json:"lossReason,omitempty"`
	Value       int64  `json:"value"`
	Probability int64  `json:"probability"`
}

type homologCRMInput struct {
	PipelineID  string   `json:"pipeline_id"`
	StageID     string   `json:"stage_id"`
	CardID      string   `json:"card_id"`
	LeadID      string   `json:"lead_id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Title       *string  `json:"title"`
	Email       string   `json:"email"`
	SearchBy    string   `json:"search_by"`
	Query       string   `json:"query"`
	Status      string   `json:"status"`
	LossReason  string   `json:"loss_reason"`
	Stages      []string `json:"stages"`
	Reasons     []string `json:"reasons"`
	Restricted  *bool    `json:"restricted"`
	Value       *int64   `json:"value_cents"`
	Probability *int64   `json:"probability"`
	Page        int      `json:"page"`
}

func homologCRMEnabled(org string) bool {
	return org == betaOrganization && platformRequiresLogin() &&
		os.Getenv("SDR_CRM_DEV_ENABLED") == "true" && os.Getenv("ARKOM_CRM_BETA_HOMOLOG") == "true"
}

func newHomologCRM() *homologCRM {
	pipeline := homologPipeline{ID: "beta-matriculas", Name: "Matrículas · Beta",
		Description: "Da primeira conversa à matrícula na escola de idiomas.",
		Stages:      []homologStage{{"beta-interesse", "Novo interesse", 0}, {"beta-aula", "Aula de apresentação", 1}, {"beta-proposta", "Proposta", 2}},
		Reasons:     []string{"Horário incompatível", "Adiou o início"}}
	return &homologCRM{
		Pipelines: map[string]homologPipeline{pipeline.ID: pipeline},
		Contacts:  map[string]homologContact{},
		Cards:     map[string]homologCard{},
	}
}

// This CRM is for Beta's synthetic tenant and has no upstream credentials.
func (a *App) homologCRMHTTP(w http.ResponseWriter, r *http.Request, u User, operation string) {
	var in homologCRMInput
	if !decodeCore(w, r, &in) {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	crm := a.state.HomologCRMs[u.Org]
	if crm == nil {
		crm = newHomologCRM()
	}
	var result any
	var update func()
	status := 200
	pipeline, pipelineFound := crm.Pipelines[in.PipelineID]
	card, cardFound := crm.Cards[in.CardID]
	reasons := func() any {
		return map[string]any{"reasons": pipeline.Reasons, "restricted": pipeline.Restricted}
	}
	switch operation {
	case "pipelines.list":
		list := slices.SortedFunc(maps.Values(crm.Pipelines), func(a, b homologPipeline) int {
			return cmp.Or(cmp.Compare(a.Name, b.Name), cmp.Compare(a.ID, b.ID))
		})
		if list == nil {
			list = []homologPipeline{}
		}
		result = map[string]any{"data": list}
	case "pipelines.loss-reasons", "pipelines.loss-reasons.update", "pipelines.update":
		if !pipelineFound {
			break
		}
		switch operation {
		case "pipelines.loss-reasons":
			result = reasons()
		case "pipelines.loss-reasons.update":
			if in.Restricted == nil || len(in.Reasons) > 50 || (*in.Restricted && len(in.Reasons) == 0) ||
				!validHomologNames(in.Reasons, 500) {
				break
			}
			pipeline.Reasons, pipeline.Restricted = in.Reasons, *in.Restricted
			result = reasons()
			update = func() { crm.Pipelines[pipeline.ID] = pipeline }
		case "pipelines.update":
			if !textOK(in.Name, 100, true) || !textOK(in.Description, 500, false) {
				break
			}
			pipeline.Name, pipeline.Description = strings.TrimSpace(in.Name), strings.TrimSpace(in.Description)
			result = pipeline
			update = func() { crm.Pipelines[pipeline.ID] = pipeline }
		}
	case "pipelines.create":
		if !textOK(in.Name, 100, true) || len(in.Stages) == 0 || len(in.Stages) > 30 ||
			!validHomologNames(in.Stages, 100) || len(crm.Pipelines) >= 40 {
			break
		}
		pipeline = homologPipeline{ID: token(), Name: strings.TrimSpace(in.Name)}
		for index, name := range in.Stages {
			pipeline.Stages = append(pipeline.Stages, homologStage{token(), strings.TrimSpace(name), index})
		}
		result = pipeline
		update = func() { crm.Pipelines[pipeline.ID] = pipeline }
	case "stages.update":
		if !textOK(in.Name, 100, true) {
			break
		}
		for _, existing := range crm.Pipelines {
			index := slices.IndexFunc(existing.Stages, func(stage homologStage) bool { return stage.ID == in.StageID })
			if index < 0 {
				continue
			}
			existing.Stages = slices.Clone(existing.Stages)
			existing.Stages[index].Name = strings.TrimSpace(in.Name)
			result = existing.Stages[index]
			update = func() { crm.Pipelines[existing.ID] = existing }
			break
		}
	case "contacts.list":
		matches := []homologContact{}
		query := strings.ToLower(strings.TrimSpace(in.Query))
		for _, contact := range crm.Contacts {
			value := contact.Name
			switch in.SearchBy {
			case "email":
				value = contact.Email
			case "telephone":
				value = contact.Telephone
			}
			if strings.Contains(strings.ToLower(value), query) {
				matches = append(matches, contact)
			}
		}
		slices.SortFunc(matches, func(a, b homologContact) int { return cmp.Compare(a.Email, b.Email) })
		page, pages, items := crmPage(matches, in.Page)
		result = map[string]any{"data": items, "page": page, "pages": pages}
	case "contacts.create":
		email, err := mail.ParseAddress(in.Email)
		if err != nil || email.Address != in.Email || !textOK(in.Email, 254, true) || !textOK(in.Name, 120, true) {
			break
		}
		for _, contact := range crm.Contacts {
			if strings.EqualFold(contact.Email, in.Email) {
				fail(w, 409, "crm_contact_exists")
				return
			}
		}
		contact := homologContact{ID: token(), Name: strings.TrimSpace(in.Name), Email: in.Email}
		conversation := &Conversation{ID: "conv_test_" + token(), Org: u.Org, Contact: "contact_test_" + token(),
			Label: contact.Name, Channel: "fake_whatsapp", Automation: "active", Updated: a.now().UTC()}
		result, status = map[string]string{"leadId": contact.ID, "conversationId": conversation.ID}, 201
		update = func() {
			crm.Contacts[contact.ID] = contact
			if a.state.CRMContacts == nil {
				a.state.CRMContacts = map[string]map[string]string{}
			}
			if a.state.CRMContacts[u.Org] == nil {
				a.state.CRMContacts[u.Org] = map[string]string{}
			}
			a.state.CRMContacts[u.Org][conversation.Contact] = contact.ID
			a.state.Conversations[conversation.ID] = conversation
		}
	case "cards.list":
		if !pipelineFound {
			break
		}
		matches := []homologCard{}
		for _, value := range crm.Cards {
			if value.PipelineID == pipeline.ID && (in.Status == "" || value.Status == in.Status) &&
				(in.LossReason == "" || value.LossReason == in.LossReason) {
				matches = append(matches, value)
			}
		}
		slices.SortFunc(matches, func(a, b homologCard) int { return cmp.Or(cmp.Compare(a.Title, b.Title), cmp.Compare(a.ID, b.ID)) })
		_, pages, items := crmPage(matches, in.Page)
		result = map[string]any{"data": items, "meta": map[string]int{"countPages": pages}}
	case "cards.create":
		if !pipelineFound || !homologStageExists(pipeline, in.StageID) || in.Title == nil ||
			!textOK(*in.Title, 200, true) || crm.Contacts[in.LeadID].ID == "" {
			break
		}
		card = homologCard{ID: token(), PipelineID: pipeline.ID, StageID: in.StageID, LeadID: in.LeadID, Title: strings.TrimSpace(*in.Title), Status: "open"}
		result = card
		update = func() { crm.Cards[card.ID] = card }
	case "cards.move", "cards.update", "cards.close":
		if !cardFound || card.Status != "open" {
			break
		}
		switch operation {
		case "cards.move":
			if !homologStageExists(crm.Pipelines[card.PipelineID], in.StageID) {
				break
			}
			card.StageID = in.StageID
			result = card
		case "cards.update":
			if in.Title == nil || !textOK(*in.Title, 200, true) ||
				in.Value != nil && (*in.Value < 0 || *in.Value > 100000000000) ||
				in.Probability != nil && (*in.Probability < 0 || *in.Probability > 100) {
				break
			}
			card.Title = strings.TrimSpace(*in.Title)
			if in.Value != nil {
				card.Value = *in.Value
			}
			if in.Probability != nil {
				card.Probability = *in.Probability
			}
			result = card
		case "cards.close":
			p := crm.Pipelines[card.PipelineID]
			if in.Status != "won" && in.Status != "lost" || in.Status == "lost" &&
				(!textOK(in.LossReason, 500, true) || p.Restricted && !slices.Contains(p.Reasons, in.LossReason)) {
				break
			}
			card.Status = in.Status
			if in.Status == "lost" {
				card.LossReason = strings.TrimSpace(in.LossReason)
			}
			result = card
		}
		update = func() { crm.Cards[card.ID] = card }
	}
	if result == nil {
		fail(w, 422, "invalid_crm_input")
		return
	}
	if update != nil {
		if err := a.transact(func() {
			if a.state.HomologCRMs == nil {
				a.state.HomologCRMs = map[string]*homologCRM{}
			}
			a.state.HomologCRMs[u.Org] = crm
			update()
			a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "crm." + operation})
		}); err != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
	}
	write(w, status, result)
}

func homologStageExists(p homologPipeline, id string) bool {
	return slices.ContainsFunc(p.Stages, func(s homologStage) bool { return s.ID == id })
}

func validHomologNames(values []string, max int) bool {
	return !slices.ContainsFunc(values, func(value string) bool { return !textOK(value, max, true) })
}

func crmPage[T any](all []T, requested int) (int, int, []T) {
	const size = 20
	pages := max(1, (len(all)+size-1)/size)
	page := min(max(requested, 1), pages)
	start := (page - 1) * size
	return page, pages, all[start:min(start+size, len(all))]
}

// Called by the BIA inside the transaction that commits qualification.
func (a *App) recordHomologOpportunity(conversation *Conversation, lead, title string) {
	crm := a.state.HomologCRMs[conversation.Org]
	if crm == nil || crm.Contacts[lead].ID == "" {
		return
	}
	pipeline := crm.Pipelines["beta-matriculas"]
	if len(pipeline.Stages) == 0 {
		return
	}
	id := fmt.Sprintf("%x", sha256.Sum256([]byte("homolog-crm:"+conversation.ID)))
	if _, exists := crm.Cards[id]; !exists {
		crm.Cards[id] = homologCard{ID: id, PipelineID: pipeline.ID, StageID: pipeline.Stages[0].ID,
			LeadID: lead, Title: title, Status: "open"}
	}
}
