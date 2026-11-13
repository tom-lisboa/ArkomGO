package construction

import (
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strings"
)

const UXPath = "design/ux.json"
const UIPath = "design/ui.json"

// These gates validate specification structure, not visual quality or usability.
type UXSpec struct {
	Audience    string   `json:"audience"`
	PrimaryTask string   `json:"primary_task"`
	Journey     []string `json:"journey"`
	Screens     []string `json:"screens"`
	States      struct {
		Loading string `json:"loading"`
		Empty   string `json:"empty"`
		Error   string `json:"error"`
		Success string `json:"success"`
	} `json:"states"`
	Accessibility []string `json:"accessibility"`
	Acceptance    []string `json:"acceptance"`
}
type UISpec struct {
	Direction string `json:"direction"`
	Colors    struct {
		Background string `json:"background"`
		Surface    string `json:"surface"`
		Text       string `json:"text"`
		Primary    string `json:"primary"`
		Focus      string `json:"focus"`
	} `json:"colors"`
	Typography    string   `json:"typography"`
	Spacing       string   `json:"spacing"`
	Components    []string `json:"components"`
	Responsive    string   `json:"responsive"`
	Accessibility []string `json:"accessibility"`
}

func decodeDesign(raw string, target any) error {
	if len(raw) > 24000 {
		return fmt.Errorf("especificação excede 24 KB")
	}
	d := json.NewDecoder(strings.NewReader(raw))
	d.DisallowUnknownFields()
	if err := d.Decode(target); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("use somente um objeto JSON")
	}
	return nil
}
func designText(field, value string) error {
	if len([]rune(strings.TrimSpace(value))) < 12 {
		return fmt.Errorf("%s: descreva uma decisão específica com pelo menos 12 caracteres", field)
	}
	return nil
}
func designList(field string, values []string) error {
	if len(values) == 0 || len(values) > 20 {
		return fmt.Errorf("%s: use de 1 a 20 itens", field)
	}
	for _, v := range values {
		if err := designText(field, v); err != nil {
			return err
		}
	}
	return nil
}
func ValidateDesign(files map[string]string, stage string) error {
	var ux UXSpec
	if err := decodeDesign(files[UXPath], &ux); err != nil {
		return fmt.Errorf("%s: %w", UXPath, err)
	}
	for _, v := range [][2]string{{"audience", ux.Audience}, {"primary_task", ux.PrimaryTask}, {"states.loading", ux.States.Loading}, {"states.empty", ux.States.Empty}, {"states.error", ux.States.Error}, {"states.success", ux.States.Success}} {
		if err := designText(v[0], v[1]); err != nil {
			return err
		}
	}
	for _, v := range []struct {
		name  string
		items []string
	}{{"journey", ux.Journey}, {"screens", ux.Screens}, {"accessibility", ux.Accessibility}, {"acceptance", ux.Acceptance}} {
		if err := designList(v.name, v.items); err != nil {
			return err
		}
	}
	if stage == "ux" {
		return nil
	}
	var ui UISpec
	if err := decodeDesign(files[UIPath], &ui); err != nil {
		return fmt.Errorf("%s: %w", UIPath, err)
	}
	for _, v := range [][2]string{{"direction", ui.Direction}, {"typography", ui.Typography}, {"spacing", ui.Spacing}, {"responsive", ui.Responsive}} {
		if err := designText(v[0], v[1]); err != nil {
			return err
		}
	}
	color := regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	for _, v := range []string{ui.Colors.Background, ui.Colors.Surface, ui.Colors.Text, ui.Colors.Primary, ui.Colors.Focus} {
		if !color.MatchString(v) {
			return fmt.Errorf("colors: use cinco cores hexadecimais #RRGGBB")
		}
	}
	if err := designList("components", ui.Components); err != nil {
		return err
	}
	return designList("accessibility", ui.Accessibility)
}

const DesignReference = `As etapas UX e design visual produzem especificações para a interface Svelte, não código nem evidência de teste visual. Leia DESIGN.md e application.json para manter o escopo da entrega. Não invente pesquisa com usuários, entrevistas, métricas ou validações realizadas.
UX escreve somente design/ux.json, objeto JSON com campos: audience (string: público e contexto), primary_task (string: tarefa principal), journey (array de strings: ações e respostas na ordem), screens (array de strings: telas e hierarquia), states (objeto com loading, empty, error, success, todos strings com mensagens/ações; explique quando um estado não se aplica), accessibility (array de strings: teclado, labels e feedback), acceptance (array de strings: cenários de comportamento verificáveis). Cada descrição tem pelo menos 12 caracteres; cada lista tem 1 a 20 itens. Sem chaves adicionais.
Design visual lê a UX e escreve somente design/ui.json: direction (string: identidade adequada ao pedido, sem impor tema Arkom), colors (objeto com background, surface, text, primary, focus; cada valor #RRGGBB), typography (string: hierarquia/tamanhos com fontes do sistema), spacing (string: escala, largura e ritmo), components (array de strings: componentes Svelte e suas variantes/estados), responsive (string: decisões para celular e desktop), accessibility (array de strings: foco, contraste a verificar e redução de movimento). Mesmos limites de descrições/listas. Sem chaves adicionais. Inclua detalhes concretos, não promessas genéricas.
O host valida formato e campos obrigatórios e registra design.validated ou design.rejected nos traces. Isso não comprova usabilidade, contraste real nem qualidade visual. Sem shell, testes Go ou compilação nessas duas etapas.
Interface deve ler as duas especificações e transformá-las em componentes e estilos executáveis, com estados e cenários de UX. Revisão deve confrontar a implementação com os critérios descritos, relatando lacunas sem alegar inspeção visual inexistente. Não coloque detalhes de infraestrutura ou rotas técnicas no texto do produto, salvo se forem necessários ao seu público. Svelte bind:value de input type=number fornece number ou undefined: trate esses valores antes de chamar métodos de string.`
