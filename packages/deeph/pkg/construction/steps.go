package construction

import (
	"context"
	"errors"
	"strings"
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
func SupportsSteps(version int) bool {
	return version == 1 || version == 2 || version == 3 || version == 4 || version == 5
}
func StepsForVersion(version int) []Step {
	if version == 5 {
		base := StepsForVersion(4)
		return append(append(append([]Step{}, base[:3]...),
			Step{"gif", "Criando suas animações", "GIFs reais do CLIPS disponíveis para a página, ou reuso/ausência justificados.", "Você é Luma, especialista em GIFs. Leia o pedido, as fontes e frontend/media.json. Se o cliente pediu animações GIF, use generate_gif para criar uma peça coerente com o design. Reutilize assets adequados já existentes; não gere mídia sem necessidade. Descreva composição, paleta, movimento e loop no prompt. Não escreva fontes nem chame test. Depois do resultado real da ferramenta, conclua ready. Em indisponibilidade, registre claramente a lacuna sem afirmar que gerou. Leia reference/visual-agents.md.", 4},
			base[3],
			Step{"motion", "Dando movimento à página", "Scroll e animações implementados e frontend compilado.", "Você é Fluxo, especialista em Motion, Lenis e scroll. Leia reference/visual-agents.md e a página já implementada. Escolha e implemente animações apropriadas ao pedido diretamente nos componentes Svelte, preservando layout, GIFs, filtros e navegação. Importe as bibliotecas locais ou use as ações @arkom/motion. Faça mudanças pequenas, com conteúdo sempre legível, limpeza de listeners e prefers-reduced-motion. Registre em design/motion.json os efeitos escolhidos. Execute test e conclua ready quando compilar; não alegue teste visual. Se movimento não for adequado ao pedido, preserve a página e explique sua decisão.", 8}), base[4])
	}
	if version == 4 {
		base := StepsForVersion(3)
		steps := []Step{base[0], base[1], base[2], base[4], base[5]}
		steps[0].Title = "Entendendo sua ideia"
		steps[0].Acceptance = "Direção da página definida a partir do pedido."
		steps[0].instruction = "Leia o pedido e os arquivos atuais. Em uma página nova, sua PRIMEIRA escrita deve ser frontend/src/App.svelte: uma primeira região real, pequena e autossuficiente, com CSS no próprio componente, identidade e conteúdo próprios do pedido. Ela aparece imediatamente na prévia enquanto o restante é planejado. Não importe componentes ainda inexistentes; o roteador pode ser ligado na etapa interface. Em projetos existentes, preserve a página atual enquanto planeja a mudança. Depois escreva DESIGN.md com a intenção, público, conteúdo, composição e interações desta página. Escolha uma solução específica para o cliente, sem impor template ou pedir decisões técnicas. O manifesto e todo backend são somente leitura. Não escreva application.json nem Go. Preserve escolhas existentes que o cliente não pediu para mudar."
		steps[1].Title = "Organizando a experiência"
		steps[2].Title = "Dando personalidade"
		steps[3].Title = "Construindo sua página"
		steps[3].rounds = 10
		steps[4].Title = "Revisando os detalhes"
		steps[4].Acceptance = "Página Svelte compilada e contrato preservado."
		steps[4].instruction = "Revise somente o frontend entregue contra o pedido e design/*.json. Corrija os componentes e execute test para compilar Svelte. Verifique interações, conteúdo, hierarquia e responsividade no código; não alegue inspeção visual sem evidência. Preserve todos os arquivos backend e application.json. Não execute testes Go, não crie backend e não imponha novos requisitos ao cliente."
		return steps
	}
	legacy := Steps()
	if version == 1 || version == 0 {
		return legacy
	}
	if version != 2 && version != 3 {
		return nil
	}
	steps := append([]Step{legacy[0],
		{"ux", "Definir experiência", "Jornada, telas, estados e critérios de UX documentados; estrutura validada.", "Na primeira rodada, leia reference/catalog.json, reference/platform-contracts.go, reference/design.md, DESIGN.md e application.json; aguarde os resultados antes de escrever. Escreva somente design/ux.json com a experiência desta entrega. Seja específico sobre tarefa, navegação, estados e critérios de comportamento. Não escreva código nem altere o escopo. Conclua ready após salvar a especificação.", 6},
		{"designer", "Definir design visual", "Identidade, componentes e responsividade documentados; estrutura validada.", "Na primeira rodada, leia reference/catalog.json, reference/platform-contracts.go, reference/design.md, DESIGN.md, application.json e design/ux.json; aguarde os resultados antes de escrever. Escreva somente design/ui.json com identidade apropriada ao produto, tokens, componentes e decisões responsivas. Não escreva código, não altere a UX nem declare inspeção visual. Conclua ready após salvar.", 6},
	}, legacy[1:]...)
	if version == 3 {
		steps[1].instruction = strings.Replace(steps[1].instruction, "Escreva somente design/ux.json", "Escreva design/ux.json e design/navigation.json", 1)
		steps[0].instruction += " Planeje as telas e os fluxos completos solicitados; não reduza um produto com múltiplas rotas a uma única tela. A UX detalhará o mapa de navegação."
		steps[1].instruction += " Leia também reference/navigation.md. Nesta versão, escreva também design/navigation.json com as rotas e páginas planejadas; cada tela deve corresponder à jornada da UX."
		steps[1].Acceptance += " Mapa de rotas validado."
	}
	return steps
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
