package main

import (
	"encoding/json"
	"fmt"
	"sdr-next-pilot/pkg/sdrsdk"
	"slices"
	"strings"
	"time"
)

type ToolConfig struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Handler       string   `json:"handler"`
	Enabled       bool     `json:"enabled"`
	Approval      string   `json:"approval"`
	ApproverRoles []string `json:"approver_roles"`
}
type InputField struct {
	Name      string `json:"name"`
	Label     string `json:"label"`
	Required  bool   `json:"required"`
	Default   string `json:"default"`
	MaxLength int    `json:"max_length"`
}
type ValueBinding struct {
	From   string `json:"from"`
	Key    string `json:"key,omitempty"`
	StepID string `json:"step_id,omitempty"`
	Value  string `json:"value,omitempty"`
}
type StepCondition struct {
	Binding  ValueBinding `json:"binding"`
	Operator string       `json:"operator"`
	Value    string       `json:"value"`
}
type FlowStep struct {
	ID        string                  `json:"id"`
	ToolID    string                  `json:"tool_id"`
	Inputs    map[string]ValueBinding `json:"inputs"`
	Condition *StepCondition          `json:"condition,omitempty"`
}
type MemoryCondition struct {
	Field    string `json:"field"`
	Operator string `json:"operator"`
	Value    string `json:"value"`
}
type AutoTrigger struct {
	Enabled    bool                    `json:"enabled"`
	Once       bool                    `json:"once"`
	Conditions []MemoryCondition       `json:"conditions"`
	Inputs     map[string]ValueBinding `json:"inputs"`
}
type WorkflowConfig struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Description string       `json:"description"`
	Solution    string       `json:"solution"`
	Enabled     bool         `json:"enabled"`
	Roles       []string     `json:"roles"`
	Inputs      []InputField `json:"inputs"`
	Steps       []FlowStep   `json:"steps"`
	Automation  AutoTrigger  `json:"automation"`
}
type PlatformConfig struct {
	Tools     []ToolConfig     `json:"tools"`
	Workflows []WorkflowConfig `json:"workflows"`
}
type PlatformVersion struct {
	Version      int            `json:"version"`
	Config       PlatformConfig `json:"config"`
	PublishedAt  time.Time      `json:"published_at"`
	PublishedBy  string         `json:"published_by"`
	Reason       string         `json:"reason"`
	RestoredFrom int            `json:"restored_from,omitempty"`
}
type PlatformWorkspace struct {
	Revision  int
	Draft     PlatformConfig
	Versions  []PlatformVersion
	UpdatedAt time.Time
}
type OperationEvent struct {
	Sequence int       `json:"sequence"`
	Kind     string    `json:"kind"`
	Status   string    `json:"status"`
	StepID   string    `json:"step_id,omitempty"`
	Actor    string    `json:"actor_id"`
	Detail   string    `json:"detail"`
	At       time.Time `json:"at"`
}
type StepRecord struct {
	StepID      string          `json:"step_id"`
	ToolID      string          `json:"tool_id"`
	Status      string          `json:"status"`
	Output      json.RawMessage `json:"output"`
	Preview     bool            `json:"preview"`
	CompletedAt time.Time       `json:"completed_at"`
	ApprovedBy  string          `json:"approved_by,omitempty"`
}
type StepApproval struct {
	StepID, Actor string
	At, ExpiresAt time.Time
}
type PlatformExecution struct {
	ParentRunID                                                                                                        string
	NotBefore                                                                                                          time.Time
	MediaTargets                                                                                                       map[string]MediaTarget
	TriggerConversation                                                                                                string
	TriggerGeneration                                                                                                  int
	ID, Org, WorkflowID, Status, Mode, Source, Actor, ActorRole, Origin, Error, Lease, CompletedLease, CompletedDigest string
	Sequence, Revision, ConfigVersion, ConfigRevision, BusinessVersion, StepIndex, Attempts                            int
	Config                                                                                                             PlatformConfig
	Business                                                                                                           json.RawMessage
	BusinessFingerprint                                                                                                string
	Input                                                                                                              map[string]string
	Steps                                                                                                              []StepRecord
	Events                                                                                                             []OperationEvent
	Approvals                                                                                                          map[string]StepApproval
	Plan                                                                                                               sdrsdk.ActionPlan
	LeaseUntil, CreatedAt, UpdatedAt                                                                                   time.Time
}
type InternalNote struct {
	ID           string    `json:"id"`
	Org          string    `json:"organization_id"`
	Conversation string    `json:"conversation_id"`
	Text         string    `json:"text"`
	Actor        string    `json:"actor_id"`
	ExecutionID  string    `json:"execution_id"`
	At           time.Time `json:"at"`
}
type PlatformState struct {
	Workspaces      map[string]*PlatformWorkspace
	Executions      map[string]*PlatformExecution
	Notes           map[string]InternalNote
	Sequences       map[string]int
	TriggerReceipts map[string]string
}

func clonePlatform(c PlatformConfig) PlatformConfig {
	raw, _ := json.Marshal(c)
	var out PlatformConfig
	_ = json.Unmarshal(raw, &out)
	return out
}
func platformTool(c PlatformConfig, id string) (ToolConfig, bool) {
	for _, v := range c.Tools {
		if v.ID == id {
			return v, true
		}
	}
	return ToolConfig{}, false
}
func platformWorkflow(c PlatformConfig, id string) (WorkflowConfig, bool) {
	for _, v := range c.Workflows {
		if v.ID == id {
			return v, true
		}
	}
	return WorkflowConfig{}, false
}
func currentPlatform(w *PlatformWorkspace) PlatformVersion { return w.Versions[len(w.Versions)-1] }
func validRoles(r []string) bool {
	if len(r) == 0 || len(r) > 2 {
		return false
	}
	seen := map[string]bool{}
	for _, v := range r {
		if (v != "admin" && v != "operator") || seen[v] {
			return false
		}
		seen[v] = true
	}
	return true
}

var memoryFields = []string{"name", "company", "segment", "sellers", "contact_volume", "current_tool", "goal"}

func validatePlatform(c PlatformConfig) []string {
	issues := []string{}
	add := func(s string) { issues = append(issues, s) }
	if len(c.Tools) == 0 || len(c.Tools) > 16 || len(c.Workflows) == 0 || len(c.Workflows) > 12 {
		add("Use de 1 a 16 ferramentas e de 1 a 12 fluxos.")
	}
	tools := map[string]ToolConfig{}
	for _, t := range c.Tools {
		_, exists := tools[t.ID]
		_, supported := sdrsdk.FindHandler(t.Handler)
		if !coreID.MatchString(t.ID) || exists || !textOK(t.Name, 100, true) || !supported || !slices.Contains([]string{"always", "automatic"}, t.Approval) || !validRoles(t.ApproverRoles) {
			add("Ferramenta inválida: " + t.ID)
		}
		tools[t.ID] = t
	}
	workflows := map[string]bool{}
	for _, f := range c.Workflows {
		if !coreID.MatchString(f.ID) || workflows[f.ID] || !textOK(f.Name, 100, true) || !textOK(f.Description, 500, false) || !slices.Contains(coreSolutions, f.Solution) || !validRoles(f.Roles) || len(f.Steps) == 0 || len(f.Steps) > 8 || len(f.Inputs) > 12 {
			add("Fluxo inválido: " + f.ID)
		}
		workflows[f.ID] = true
		inputs := map[string]bool{}
		for _, v := range f.Inputs {
			if !coreID.MatchString(v.Name) || inputs[v.Name] || !textOK(v.Label, 100, true) || v.MaxLength < 1 || v.MaxLength > 2000 || len([]rune(v.Default)) > v.MaxLength {
				add("Campo de entrada inválido no fluxo " + f.ID)
			}
			inputs[v.Name] = true
		}
		previous := map[string]sdrsdk.HandlerSpec{}
		checkBinding := func(b ValueBinding) bool {
			switch b.From {
			case "literal":
				return b.Key == "" && b.StepID == "" && textOK(b.Value, 2000, false)
			case "input":
				return inputs[b.Key] && b.StepID == "" && b.Value == ""
			case "step":
				h, ok := previous[b.StepID]
				return ok && slices.Contains(h.OutputFields, b.Key) && b.Value == ""
			}
			return false
		}
		for _, s := range f.Steps {
			t, exists := tools[s.ToolID]
			h, supported := sdrsdk.FindHandler(t.Handler)
			if t.Handler == "media.send" && (f.Solution != "sdr" || s.Inputs["conversation_id"].From == "step") {
				add("Envio de mídia exige solução sdr e conversa por entrada ou valor fixo: " + s.ID)
			}
			if !coreID.MatchString(s.ID) || !exists || !supported {
				add("Etapa ou ferramenta inválida no fluxo " + f.ID)
			}
			if _, dup := previous[s.ID]; dup {
				add("Identificador de etapa repetido em " + f.ID)
			}
			params := map[string]bool{}
			for _, p := range h.Parameters {
				params[p.Name] = true
				if b, ok := s.Inputs[p.Name]; ok {
					if !checkBinding(b) || (p.Required && b.From == "literal" && strings.TrimSpace(b.Value) == "") {
						add("Preencha o parâmetro " + p.Name + " da etapa " + s.ID)
					}
				} else if p.Required {
					add("Falta o parâmetro " + p.Name + " na etapa " + s.ID)
				}
			}
			for k := range s.Inputs {
				if !params[k] {
					add("Parâmetro não suportado: " + k)
				}
			}
			if s.Condition != nil {
				if !checkBinding(s.Condition.Binding) || !slices.Contains([]string{"equals", "not_empty"}, s.Condition.Operator) || !textOK(s.Condition.Value, 500, false) {
					add("Condição inválida na etapa " + s.ID)
				}
			}
			previous[s.ID] = h
		}
		if f.Automation.Enabled {
			if f.Solution != "sdr" || len(f.Automation.Conditions) == 0 || len(f.Automation.Conditions) > 7 {
				add("A automação precisa de condições sobre dados do SDR.")
			}
			guarded := map[string]bool{}
			for _, v := range f.Automation.Conditions {
				if !slices.Contains(memoryFields, v.Field) || !slices.Contains([]string{"exists", "equals"}, v.Operator) || !textOK(v.Value, 500, v.Operator == "equals") {
					add("Condição automática inválida em " + f.ID)
				}
				guarded[v.Field] = true
			}
			for _, field := range f.Inputs {
				b, exists := f.Automation.Inputs[field.Name]
				if !exists {
					if field.Required && field.Default == "" {
						add("Mapeie o campo automático " + field.Name)
					}
					continue
				}
				valid := false
				switch b.From {
				case "literal":
					valid = b.Key == "" && b.StepID == "" && textOK(b.Value, field.MaxLength, field.Required)
				case "memory":
					valid = slices.Contains(memoryFields, b.Key) && b.Value == "" && b.StepID == "" && (!field.Required || guarded[b.Key])
				case "conversation":
					valid = b.Key == "id" && b.Value == "" && b.StepID == ""
				}
				if !valid {
					add("Origem automática inválida para " + field.Name)
				}
			}
			for k := range f.Automation.Inputs {
				if !inputs[k] {
					add("Campo automático não definido: " + k)
				}
			}
		}
	}
	raw, _ := json.Marshal(c)
	if len(raw) > 32000 {
		add("A configuração ultrapassa o limite de 32 KB deste piloto.")
	}
	return issues
}
func (a *App) initPlatform() {
	p := &a.state.Platform
	if p.Workspaces == nil {
		p.Workspaces = map[string]*PlatformWorkspace{}
	}
	if p.Executions == nil {
		p.Executions = map[string]*PlatformExecution{}
	}
	if p.Notes == nil {
		p.Notes = map[string]InternalNote{}
	}
	if p.Sequences == nil {
		p.Sequences = map[string]int{}
	}
	if p.TriggerReceipts == nil {
		p.TriggerReceipts = map[string]string{}
	}
	for _, org := range []string{"org_demo_alfa", "org_demo_beta"} {
		if p.Workspaces[org] != nil {
			continue
		}
		offer := "essencial"
		if org == "org_demo_beta" {
			offer = "ingles-grupo"
		}
		c := examplePlatform(offer)
		p.Workspaces[org] = &PlatformWorkspace{Revision: 1, Draft: clonePlatform(c), Versions: []PlatformVersion{{Version: 1, Config: clonePlatform(c), PublishedAt: a.now().UTC(), PublishedBy: "fixture-seed", Reason: "Fluxos iniciais do piloto"}}, UpdatedAt: a.now().UTC()}
		a.record(AuditEntry{Org: org, Actor: "fixture-seed", Action: "platform.seeded", Revision: 1})
	}
}
func examplePlatform(offer string) PlatformConfig {
	literal := func(v string) ValueBinding { return ValueBinding{From: "literal", Value: v} }
	input := func(k string) ValueBinding { return ValueBinding{From: "input", Key: k} }
	return PlatformConfig{Tools: []ToolConfig{
		{"consultar_negocio", "Consultar negócio", "business.lookup", true, "automatic", []string{"admin"}},
		{"rascunho_proposta", "Preparar proposta", "offer.prepare", true, "automatic", []string{"admin"}},
		{"nota_interna", "Registrar nota interna", "conversation.note", true, "automatic", []string{"admin"}},
		{"pausar_atendimento", "Pausar atendimento", "conversation.pause", true, "always", []string{"admin"}},
	}, Workflows: []WorkflowConfig{
		{ID: "preparar_proposta", Name: "Preparar proposta", Description: "Consulta a base e prepara valores publicados, sem enviar nada ao contato.", Solution: "sdr", Enabled: true, Roles: []string{"admin", "operator"}, Inputs: []InputField{{"offer_id", "Oferta", true, offer, 48}, {"customer_name", "Nome do contato", true, "Contato de teste", 100}}, Steps: []FlowStep{{ID: "consulta", ToolID: "consultar_negocio", Inputs: map[string]ValueBinding{"query": literal("")}}, {ID: "proposta", ToolID: "rascunho_proposta", Inputs: map[string]ValueBinding{"offer_id": input("offer_id"), "customer_name": input("customer_name")}}}, Automation: AutoTrigger{Enabled: false, Once: true, Conditions: []MemoryCondition{{Field: "name", Operator: "exists"}}, Inputs: map[string]ValueBinding{"offer_id": literal(offer), "customer_name": {From: "memory", Key: "name"}}}},
		{ID: "registrar_pausa", Name: "Pausar e registrar motivo", Description: "Pede aprovação, pausa uma conversa do piloto e registra uma nota para a equipe.", Solution: "sdr", Enabled: true, Roles: []string{"admin", "operator"}, Inputs: []InputField{{"conversation_id", "Conversa", true, "", 100}, {"reason", "Motivo", true, "Pausa solicitada pelo gestor", 500}}, Steps: []FlowStep{{ID: "pausa", ToolID: "pausar_atendimento", Inputs: map[string]ValueBinding{"conversation_id": input("conversation_id"), "reason": input("reason")}}, {ID: "nota", ToolID: "nota_interna", Inputs: map[string]ValueBinding{"conversation_id": input("conversation_id"), "text": input("reason")}}}, Automation: AutoTrigger{Once: true, Conditions: []MemoryCondition{{Field: "goal", Operator: "equals", Value: "preciso de atendimento humano"}}, Inputs: map[string]ValueBinding{"conversation_id": {From: "conversation", Key: "id"}, "reason": literal("Solicitação de atendimento humano registrada pelo fluxo")}}},
	}}
}
func platformInput(f WorkflowConfig, in map[string]string) (map[string]string, error) {
	out := map[string]string{}
	known := map[string]bool{}
	for _, s := range f.Inputs {
		known[s.Name] = true
		v, ok := in[s.Name]
		if !ok {
			v = s.Default
		}
		if !textOK(v, s.MaxLength, s.Required) {
			return nil, fmt.Errorf("invalid_input")
		}
		out[s.Name] = v
	}
	for k := range in {
		if !known[k] {
			return nil, fmt.Errorf("invalid_input")
		}
	}
	return out, nil
}
