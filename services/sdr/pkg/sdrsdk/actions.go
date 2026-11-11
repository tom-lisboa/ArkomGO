package sdrsdk

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type ParameterSpec struct {
	Name      string `json:"name"`
	Label     string `json:"label"`
	Required  bool   `json:"required"`
	MaxLength int    `json:"max_length"`
}
type HandlerSpec struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	Parameters   []ParameterSpec `json:"parameters"`
	OutputFields []string        `json:"output_fields"`
	Writes       bool            `json:"writes"`
}

func ActionCatalog() []HandlerSpec {
	return append(calendarHandlers(), []HandlerSpec{
		{ID: "media.send", Name: "Enviar mídia preparada", Description: "Enfileira um arquivo da empresa na conversa ativa. A conclusão da etapa confirma a fila; consulte a mensagem para saber a entrega. Não gera vídeo nem baixa URLs.", Parameters: []ParameterSpec{{"conversation_id", "Conversa", true, 100}, {"media_id", "Arquivo preparado", true, 100}, {"caption", "Legenda (sem legenda para áudio)", false, 1000}}, OutputFields: []string{"summary", "message_id", "conversation_id", "media_id", "status", "sent"}, Writes: true},
		{ID: "business.lookup", Name: "Consultar conhecimento", Description: "Consulta a base publicada autorizada para o SDR da empresa.", Parameters: []ParameterSpec{{"query", "Assunto da consulta", false, 300}}, OutputFields: []string{"summary", "business_version"}},
		{ID: "offer.prepare", Name: "Preparar proposta em rascunho", Description: "Prepara valores e condições da oferta publicada. Não envia nem assina uma proposta.", Parameters: []ParameterSpec{{"offer_id", "Identificador da oferta", true, 48}, {"customer_name", "Nome do contato", true, 100}}, OutputFields: []string{"summary", "quote_id", "offer_id", "customer_name", "amount_cents", "setup_cents", "conditions", "business_version"}},
		{ID: "conversation.note", Name: "Registrar nota interna", Description: "Registra uma anotação para a equipe. Não envia mensagem ao contato.", Parameters: []ParameterSpec{{"conversation_id", "Conversa", true, 100}, {"text", "Texto da nota", true, 2000}}, OutputFields: []string{"summary", "note_id", "conversation_id"}, Writes: true},
		{ID: "conversation.pause", Name: "Pausar atendimento", Description: "Interrompe a automação de uma conversa da empresa.", Parameters: []ParameterSpec{{"conversation_id", "Conversa", true, 100}, {"reason", "Motivo da pausa", true, 500}}, OutputFields: []string{"summary", "conversation_id", "automation"}, Writes: true},
	}...)
}
func FindHandler(id string) (HandlerSpec, bool) {
	for _, h := range ActionCatalog() {
		if h.ID == id {
			return h, true
		}
	}
	return HandlerSpec{}, false
}

type ActionPlan struct {
	Preview      bool              `json:"preview"`
	ExecutionID  string            `json:"execution_id"`
	StepID       string            `json:"step_id"`
	Organization string            `json:"organization_id"`
	Handler      string            `json:"handler"`
	Inputs       map[string]string `json:"inputs"`
	Business     json.RawMessage   `json:"business"`
	At           time.Time         `json:"at"`
}
type ActionResult struct {
	Output json.RawMessage `json:"output"`
}
type OperationJob struct {
	ID    string     `json:"id"`
	Lease string     `json:"lease"`
	Plan  ActionPlan `json:"plan"`
}
type OperationQueue interface {
	ClaimOperation(context.Context) (OperationJob, bool, error)
	CompleteOperation(context.Context, OperationJob, ActionResult) error
	FailOperation(context.Context, OperationJob, string) error
}

func ComputeAction(p ActionPlan) (ActionResult, error) {
	bad := func(code string) (ActionResult, error) { return ActionResult{}, errors.New(code) }
	h, ok := FindHandler(p.Handler)
	if !ok {
		return bad("unsupported_tool")
	}
	allowed := map[string]bool{}
	for _, s := range h.Parameters {
		allowed[s.Name] = true
		v := p.Inputs[s.Name]
		if (s.Required && strings.TrimSpace(v) == "") || len([]rune(v)) > s.MaxLength {
			return bad("invalid_tool_input")
		}
	}
	for k := range p.Inputs {
		if !allowed[k] {
			return bad("invalid_tool_input")
		}
	}
	var business struct {
		Organization string `json:"organization_id"`
		Version      int    `json:"business_version"`
		Name         string `json:"name"`
		Offers       []struct {
			ID         string `json:"id"`
			Name       string `json:"name"`
			Amount     int64  `json:"amount_cents"`
			Setup      int64  `json:"setup_cents"`
			Cadence    string `json:"cadence"`
			Conditions string `json:"conditions"`
		} `json:"offers"`
		Facts []struct {
			ID       string `json:"id"`
			Topic    string `json:"topic"`
			Value    string `json:"value"`
			SourceID string `json:"source_id"`
		} `json:"facts"`
	}
	if json.Unmarshal(p.Business, &business) != nil || p.Organization == "" || p.ExecutionID == "" || p.StepID == "" || business.Organization != p.Organization {
		return bad("invalid_action_context")
	}
	out := map[string]any{"business_version": business.Version}
	if strings.HasPrefix(p.Handler, "calendar.") {
		out["request_id"] = "calreq_" + Digest(p.ExecutionID + ":" + p.StepID)[:48]
		out["status"] = "queued"
		out["confirmed"] = false
		out["summary"] = "Solicitação de agenda enfileirada; acompanhe request_id para obter o resultado real."
		if p.Preview {
			out["status"] = "would_queue"
			out["summary"] = "Simulação: solicitaria a operação de agenda, sem consultar ou alterar provedor."
		}
		raw, _ := json.Marshal(out)
		return ActionResult{Output: raw}, nil
	}
	switch p.Handler {
	case "media.send":
		out["message_id"] = "msg_" + Digest(p.ExecutionID + ":" + p.StepID)[:32]
		out["conversation_id"] = p.Inputs["conversation_id"]
		out["media_id"] = p.Inputs["media_id"]
		out["status"] = "queued"
		out["sent"] = false
		out["summary"] = "Mídia enfileirada; consulte a mensagem para acompanhar a entrega."
		if p.Preview {
			out["status"] = "would_queue"
			out["summary"] = "Simulação: enfileiraria a mídia preparada. Nenhuma mensagem enviada."
		}
	case "business.lookup":
		hits := []map[string]string{}
		q := Normalized(p.Inputs["query"])
		for _, f := range business.Facts {
			if q == "" || strings.Contains(Normalized(f.Topic+" "+f.Value), q) {
				hits = append(hits, map[string]string{"id": f.ID, "topic": f.Topic, "value": f.Value, "source_id": f.SourceID})
			}
			if len(hits) >= 6 {
				break
			}
		}
		out["items"] = hits
		out["summary"] = fmt.Sprintf("%s: %d informações publicadas encontradas.", business.Name, len(hits))
	case "offer.prepare":
		found := false
		for _, o := range business.Offers {
			if o.ID != p.Inputs["offer_id"] {
				continue
			}
			found = true
			out["quote_id"] = "draft_" + Digest(p.ExecutionID + ":" + p.StepID)[:24]
			out["offer_id"] = o.ID
			out["customer_name"] = p.Inputs["customer_name"]
			out["amount_cents"] = o.Amount
			out["setup_cents"] = o.Setup
			out["currency"] = "BRL"
			out["cadence"] = o.Cadence
			out["conditions"] = o.Conditions
			out["draft"] = true
			out["sent"] = false
			price := fmt.Sprintf("R$ %d,%02d", o.Amount/100, o.Amount%100)
			if o.Cadence == "monthly" {
				price += " por mês"
			}
			if o.Cadence == "once" {
				price += " em pagamento único"
			}
			if o.Cadence == "quote" {
				price = "sob consulta"
			}
			out["summary"] = fmt.Sprintf("Rascunho %s para %s. Valor: %s; implantação: R$ %d,%02d. %s", o.Name, p.Inputs["customer_name"], price, o.Setup/100, o.Setup%100, o.Conditions)
			break
		}
		if !found {
			return bad("offer_not_available")
		}
	case "conversation.note":
		out["note_id"] = "note_" + Digest(p.ExecutionID + ":" + p.StepID)[:24]
		out["conversation_id"] = p.Inputs["conversation_id"]
		out["summary"] = "Nota interna registrada para a equipe."
		if p.Preview {
			out["summary"] = "Simulação: registraria uma nota interna."
		}
		out["text"] = p.Inputs["text"]
	case "conversation.pause":
		out["conversation_id"] = p.Inputs["conversation_id"]
		out["automation"] = "paused"
		out["summary"] = "Automação da conversa pausada."
		if p.Preview {
			out["summary"] = "Simulação: pausaria a automação da conversa."
			out["automation"] = "would_pause"
		}
	}
	raw, _ := json.Marshal(out)
	return ActionResult{Output: raw}, nil
}
func (c *Client) ClaimOperation(ctx context.Context) (OperationJob, bool, error) {
	var j OperationJob
	ok, e := c.post(ctx, "/internal/workers/execution/operation-claim", map[string]string{"model": c.Model}, &j)
	return j, ok, e
}
func (c *Client) CompleteOperation(ctx context.Context, j OperationJob, r ActionResult) error {
	_, e := c.post(ctx, "/internal/workers/execution/operation-complete", struct {
		ID     string       `json:"id"`
		Lease  string       `json:"lease"`
		Result ActionResult `json:"result"`
	}{j.ID, j.Lease, r}, nil)
	return e
}
func (c *Client) FailOperation(ctx context.Context, j OperationJob, code string) error {
	_, e := c.post(ctx, "/internal/workers/execution/operation-fail", map[string]string{"id": j.ID, "lease": j.Lease, "code": code}, nil)
	return e
}
