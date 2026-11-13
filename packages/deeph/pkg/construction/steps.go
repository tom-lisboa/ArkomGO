package construction

import (
	"context"
	"errors"
)

// Step describes a bounded, host-controlled delivery. Evidence is emitted as events.
type Step struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Acceptance  string `json:"acceptance"`
	instruction string
	rounds      int
}

func Steps() []Step {
	return []Step{
		{"architect", "Planejar", "Plano escrito e contrato da aplicação validado.", "Consulte contratos e escreva somente application.json e DESIGN.md: delimite a primeira entrega pequena, o que fica para depois, endpoints, reuso, isolamento e critérios verificáveis de aceitação. Planeje apenas; não implemente backend nem interface.", 4},
		{"backend", "Construir backend", "Código Go com testes de comportamento aprovados.", "Implemente somente o backend Go e testes da entrega delimitada em DESIGN.md. Use net/http/httptest, execute test e corrija falhas. Não construa a interface nem antecipe funcionalidades futuras.", 10},
		{"interface", "Construir interface", "Entrada da interface criada; revisão final pendente.", "Implemente somente frontend/index.html e CSS/JS da entrega delimitada. Use contratos do backend existente, trate erros e identifique ligações pendentes. Não amplie o escopo.", 6},
		{"reviewer", "Validar entrega", "Contrato final válido e testes Go aprovados.", "Revise a entrega delimitada em DESIGN.md. Corrija erros, execute test e valide o contrato. Não implemente itens deixados para depois. Se houver lacuna não resolvida, use blocked. Não alegue teste visual.", 8},
	}
}
func SupportsSteps(version int) bool { return version == 1 || version == 2 }
func StepsForVersion(version int) []Step {
	legacy := Steps()
	if version == 1 || version == 0 {
		return legacy
	}
	if version != 2 {
		return nil
	}
	return append([]Step{legacy[0],
		{"ux", "Definir experiência", "Jornada, telas, estados e critérios de UX documentados; estrutura validada.", "Leia reference/design.md, DESIGN.md e application.json. Escreva somente design/ux.json com a experiência desta entrega. Seja específico sobre tarefa, navegação, estados e critérios de comportamento. Não escreva código nem altere o escopo. Conclua ready após salvar a especificação.", 6},
		{"designer", "Definir design visual", "Identidade, componentes e responsividade documentados; estrutura validada.", "Leia reference/design.md e design/ux.json. Escreva somente design/ui.json com identidade apropriada ao produto, tokens, componentes e decisões responsivas. Não escreva código, não altere a UX nem declare inspeção visual. Conclua ready após salvar.", 6},
	}, legacy[1:]...)
}
func StepIndexForVersion(version int, id string) int {
	for i, s := range StepsForVersion(version) {
		if s.ID == id {
			return i
		}
	}
	return -1
}
func PlanningStep(id string) bool { return id == "architect" || id == "ux" || id == "designer" }

func StepIndex(id string) int {
	for i, s := range Steps() {
		if s.ID == id {
			return i
		}
	}
	return -1
}

// RunStep executes exactly one step. The caller decides when the next may start.
func (e *Engine) RunStep(ctx context.Context, goal string, initial map[string]string, id string) (map[string]string, error) {
	if StepIndexForVersion(e.StepsVersion, id) < 0 {
		return nil, errors.New("invalid_construction_step")
	}
	return e.run(ctx, goal, initial, id)
}
