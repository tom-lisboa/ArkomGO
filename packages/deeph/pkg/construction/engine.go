package construction

import (
	"context"
	"errors"
	"fmt"
	"path"
	"sort"
	"strings"
)

const Contracts = `// Package platform contains host-owned integration boundaries.
package platform
import "context"
type Tenant struct { OrganizationID string }
type Lead struct { ID, Name, Company, Goal string }
// CRM is an adapter boundary, not a connected integration in this workspace.
// Production wiring must use authenticated Arkom services, never browser keys.
type CRM interface { FindLead(context.Context, Tenant, string) (Lead,error) }
`

func Seed() map[string]string {
	return map[string]string{"backend/go.mod": "module arkom.local/solution\n\ngo 1.24.0\n", "backend/platform/contracts.go": Contracts}
}
func clone(m map[string]string) map[string]string {
	out := map[string]string{}
	for k, v := range m {
		out[k] = v
	}
	return out
}
func ValidPath(p string) bool {
	if len(p) > 160 || path.Clean(p) != p || strings.ContainsAny(p, "\\\x00") || strings.HasPrefix(p, "/") {
		return false
	}
	for _, part := range strings.Split(p, "/") {
		if strings.HasPrefix(part, ".") {
			return false
		}
	}
	if p == "DESIGN.md" || p == "README.md" {
		return true
	}
	if strings.HasPrefix(p, "backend/") && strings.HasSuffix(p, ".go") {
		return true
	}
	return strings.HasPrefix(p, "frontend/") && (strings.HasSuffix(p, ".html") || strings.HasSuffix(p, ".css") || strings.HasSuffix(p, ".js"))
}
func allowed(agent, p string) bool {
	if !ValidPath(p) || strings.HasPrefix(p, "backend/platform/") {
		return false
	}
	switch agent {
	case "architect", "backend", "interface", "reviewer":
		return true
	}
	return false
}
func (e *Engine) Run(ctx context.Context, goal string, initial map[string]string) (map[string]string, error) {
	files := Seed()
	for k, v := range initial {
		if ValidPath(k) && !strings.HasPrefix(k, "backend/platform/") {
			files[k] = v
		}
	}
	if e.Provider == nil || e.Tester == nil {
		return files, errors.New("construction_not_configured")
	}
	emit := func(v Event) error {
		if e.Emit != nil {
			return e.Emit(v)
		}
		return nil
	}
	consulted := map[string]bool{}
	refs := []string{}
	for k := range e.References {
		refs = append(refs, k)
	}
	sort.Strings(refs)
	stages := []struct {
		name, instruction string
		rounds            int
	}{
		{"architect", "Consulte contratos e escreva DESIGN.md: escopo, endpoints, estrutura, reuso, isolamento e critérios de aceitação.", 4},
		{"backend", "Sua responsabilidade principal é backend Go e testes reais de domínio e isolamento por empresa. Use net/http/httptest em vez de abrir portas. Execute test e corrija falhas. Quando backend e testes estiverem prontos, use ready e deixe o restante da interface para o próximo especialista.", 10},
		{"interface", "Sua responsabilidade principal é frontend/index.html e CSS/JS necessários. Aproveite arquivos existentes e use contratos do backend gerado; identifique ligações pendentes da implantação. Evite mudanças desnecessárias no backend.", 6},
		{"reviewer", "Revise todos os arquivos contra o pedido. Corrija erros, acrescente testes e execute test. Se não puder resolver uma lacuna, use blocked. Não alegue teste visual.", 8},
	}
	for _, stage := range stages {
		if err := emit(Event{Kind: "agent.started", Agent: stage.name, Summary: "Etapa iniciada"}); err != nil {
			return files, err
		}
		feedback := []string{}
		finished := false
		retried := false
		for round := 0; round < stage.rounds; round++ {
			if err := ctx.Err(); err != nil {
				return files, err
			}
			referencesSeen := consulted["reference/catalog.json"] && consulted["reference/platform-contracts.go"]
			turn, err := e.Provider.Next(ctx, Request{Agent: stage.name, Goal: goal, Instruction: Rules + "\nSUA ETAPA: " + stage.instruction, Files: clone(files), References: refs, Feedback: feedback})
			if err != nil {
				if errors.Is(err, ErrProviderUnavailable) && !retried && ctx.Err() == nil {
					retried = true
					if saveErr := emit(Event{Kind: "agent.retry", Agent: stage.name, Summary: "O provedor demorou ou ficou indisponível. Tentando novamente com os arquivos preservados."}); saveErr != nil {
						return files, saveErr
					}
					continue
				}
				return files, fmt.Errorf("provider: %w", err)
			}
			if len(turn.Actions) > 6 || len(turn.Summary) > 2000 {
				return files, errors.New("invalid_agent_response")
			}
			if err := emit(Event{Kind: "agent.update", Agent: stage.name, Summary: turn.Summary}); err != nil {
				return files, err
			}
			for _, a := range turn.Actions {
				if err := ctx.Err(); err != nil {
					return files, err
				}
				ev := Event{Agent: stage.name, Path: a.Path}
				switch a.Tool {
				case "list":
					names := []string{}
					for p := range files {
						names = append(names, p)
					}
					sort.Strings(names)
					feedback = append(feedback, "Arquivos: "+strings.Join(names, ", "))
					ev.Kind = "files.listed"
					ev.Summary = "Consultou os arquivos"
				case "read":
					data, ok := files[a.Path]
					if !ok {
						data, ok = e.References[a.Path]
					}
					if !ok {
						feedback = append(feedback, "Arquivo indisponível: "+a.Path)
						ev.Kind = "tool.rejected"
						ev.Summary = "Leitura fora dos arquivos disponíveis"
					} else {
						consulted[a.Path] = true
						feedback = append(feedback, a.Path+":\n"+data)
						ev.Kind = "file.read"
						ev.Summary = "Leu contrato ou código"
					}
				case "write":
					if !referencesSeen {
						feedback = append(feedback, "Leia reference/catalog.json e reference/platform-contracts.go e aguarde os resultados antes de escrever.")
						ev.Kind = "tool.rejected"
						ev.Summary = "Consulte o ecossistema antes de construir"
						break
					}
					if !allowed(stage.name, a.Path) || len(a.Content) > 48000 {
						feedback = append(feedback, "Escrita recusada: "+a.Path)
						ev.Kind = "tool.rejected"
						ev.Summary = "Caminho ou tamanho não permitido"
						break
					}
					size := len(a.Content)
					for p, v := range files {
						if p != a.Path {
							size += len(v)
						}
					}
					if size > 350000 || len(files) >= 48 && files[a.Path] == "" {
						return files, errors.New("workspace_limit")
					}
					ev.Kind = "file.written"
					ev.Summary = "Escreveu código"
					ev.Before = files[a.Path]
					ev.After = a.Content
					files[a.Path] = a.Content
					feedback = append(feedback, "Arquivo salvo: "+a.Path)
				case "test":
					if err := emit(Event{Kind: "test.started", Agent: stage.name, Summary: "Executando testes Go em isolamento"}); err != nil {
						return files, err
					}
					output, err := e.Tester.Test(ctx, clone(files))
					ev.Kind = "test.passed"
					ev.Summary = "Testes Go passaram"
					if err != nil {
						ev.Kind = "test.failed"
						ev.Summary = "Testes precisam de correção"
						output += "\n" + err.Error()
					}
					ev.Output = output
					feedback = append(feedback, "Testes:\n"+output)
				default:
					ev.Kind = "tool.rejected"
					ev.Summary = "Ferramenta indisponível"
					feedback = append(feedback, "Ferramenta não permitida: "+a.Tool)
				}
				if err := emit(ev); err != nil {
					return files, err
				}
			}
			if turn.Verdict == "blocked" {
				return files, errors.New("agent_reported_blocker")
			}
			if turn.Verdict == "ready" {
				if stage.name == "architect" && files["DESIGN.md"] == "" {
					feedback = append(feedback, "Escreva DESIGN.md antes de concluir.")
					continue
				}
				if stage.name == "interface" && files["frontend/index.html"] == "" {
					feedback = append(feedback, "Escreva frontend/index.html antes de concluir.")
					continue
				}
				if stage.name == "backend" || stage.name == "reviewer" {
					if err := emit(Event{Kind: "test.started", Agent: stage.name, Summary: "Validando o estado final da etapa"}); err != nil {
						return files, err
					}
					output, err := e.Tester.Test(ctx, clone(files))
					kind := "test.passed"
					if err != nil {
						kind = "test.failed"
					}
					if saveErr := emit(Event{Kind: kind, Agent: stage.name, Summary: "Resultado da validação final", Output: output}); saveErr != nil {
						return files, saveErr
					}
					if err != nil {
						feedback = append(feedback, "Corrija antes de concluir:\n"+output+"\n"+err.Error())
						continue
					}
				}
				finished = true
				break
			}
			if len(feedback) > 18 {
				feedback = append(feedback[:4], feedback[len(feedback)-14:]...)
			}
		}
		if !finished {
			return files, fmt.Errorf("agent_round_limit: %s", stage.name)
		}
		if err := emit(Event{Kind: "agent.finished", Agent: stage.name, Summary: "Etapa concluída"}); err != nil {
			return files, err
		}
	}
	return files, nil
}
