package sdrsdk

import "strings"

// QualityFeedback reuses the original SDR's bounded revision approach, with
// tenant-independent checks against known facts instead of one company's script.
func QualityFeedback(c Prepared, d Decision) string {
	if d.Action != "reply" {
		return ""
	}
	if strings.Count(d.Message, "?") > 1 {
		return "Faça somente uma pergunta nesta resposta. Escolha o próximo dado necessário, sem repetir informações conhecidas."
	}
	known := map[string]bool{}
	for _, f := range c.Memory {
		known[f.Key] = true
	}
	for _, f := range d.Facts {
		known[f.Key] = true
	}
	text := Normalized(d.Message)
	checks := map[string][]string{
		"name":         {"qual seu nome", "qual é seu nome", "qual é o seu nome", "como você se chama"},
		"company":      {"qual sua empresa", "qual é sua empresa", "nome da sua empresa", "nome da empresa?"},
		"current_tool": {"usam só ", "usam apenas ", "qual ferramenta", "qual sistema", "que ferramenta vocês usam", "que sistema vocês usam"},
	}
	if strings.Contains(text, "?") {
		for key, patterns := range checks {
			if !known[key] {
				continue
			}
			for _, p := range patterns {
				if strings.Contains(text, p) {
					return "O campo " + key + " já foi informado e consta na memória ou na mensagem atual. Não pergunte novamente por esse campo, nem peça para detalhar a ferramenta já informada. Use-o como contexto e faça apenas uma pergunta sobre o próximo dado que realmente falta."
				}
			}
		}
	}
	return ""
}
