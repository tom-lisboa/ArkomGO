package construction

import (
	"context"
	"crypto/sha256"
	"deeph/pkg/application"
	"encoding/json"
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
	return map[string]string{"backend/go.mod": "module arkom.local/solution\n\ngo 1.24.0\n", "backend/platform/contracts.go": Contracts, DataContractPath: DataContracts, RecordsContractPath: RecordsContracts}
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
	if p == MediaPath || p == "design/motion.json" || p == UXPath || p == UIPath || p == NavigationPath {
		return true
	}
	if p == "DESIGN.md" || p == "README.md" || p == application.ManifestPath {
		return true
	}
	if strings.HasPrefix(p, "backend/") && strings.HasSuffix(p, ".go") {
		return true
	}
	return p == FrontendContractPath || p == "frontend/build.json" || strings.HasPrefix(p, "frontend/") && (strings.HasSuffix(p, ".html") || strings.HasSuffix(p, ".css") || strings.HasSuffix(p, ".js") || strings.HasSuffix(p, ".ts") || strings.HasSuffix(p, ".svelte"))
}
func allowed(agent, p string) bool {
	if p == MediaPath || p == FrontendContractPath || p == "frontend/build.json" || !ValidPath(p) || (strings.HasPrefix(p, "backend/platform/") || strings.HasPrefix(p, "backend/cmd/arkom-runtime/")) {
		return false
	}
	switch agent {
	case "ux":
		return p == UXPath || p == NavigationPath
	case "designer":
		return p == UIPath
	case "architect":
		return p == "DESIGN.md" || p == "README.md" || p == application.ManifestPath
	case "backend":
		return strings.HasPrefix(p, "backend/") || p == "README.md" || p == application.ManifestPath
	case "motion":
		return frontendSource(p) || p == "design/motion.json"
	case "interface":
		return strings.HasPrefix(p, "frontend/") || p == "README.md" || p == application.ManifestPath
	case "reviewer":
		return true
	}
	return false
}
func (e *Engine) Run(ctx context.Context, goal string, initial map[string]string) (map[string]string, error) {
	return e.run(ctx, goal, initial, "")
}
func (e *Engine) run(ctx context.Context, goal string, initial map[string]string, onlyStep string) (map[string]string, error) {
	files := Seed()
	for k, v := range initial {
		if ValidPath(k) && !strings.HasPrefix(k, "backend/platform/") && !strings.HasPrefix(k, "backend/cmd/arkom-runtime/") {
			files[k] = v
		}
	}
	if IsSvelte(initial) {
		files[FrontendContractPath] = initial[FrontendContractPath]
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
	// Resuming an older checkpoint must persist host contract upgrades too;
	// tests and exported/sealed files must use the same platform sources.
	if initial != nil && e.StepsVersion < 4 {
		names := []string{}
		for name := range Seed() {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			value := Seed()[name]
			if initial[name] != value {
				if err := emit(Event{Kind: "file.written", Agent: "system", Path: name, Before: initial[name], After: value, Summary: "Atualizou contrato controlado pela plataforma"}); err != nil {
					return files, err
				}
			}
		}
	}
	if e.StepsVersion >= 4 {
		for name, value := range initial {
			if strings.HasPrefix(name, "backend/") {
				files[name] = value
			}
		}
	}
	references := clone(e.References)
	references["reference/application-contract.md"] = application.Reference
	references["reference/platform-data.go"] = DataContracts
	references["reference/platform-records.go"] = RecordsContracts
	references["reference/frontend-svelte.md"] = FrontendReference
	references["reference/visual-agents.md"] = VisualAgentsReference
	if e.StepsVersion >= 2 {
		references["reference/design.md"] = DesignReference
		references["reference/navigation.md"] = NavigationReference
	}
	consulted := map[string]bool{}
	refs := []string{}
	for k := range references {
		refs = append(refs, k)
	}
	sort.Strings(refs)
	stages := StepsForVersion(e.StepsVersion)
	if len(stages) == 0 {
		return files, errors.New("invalid_steps_version")
	}
	for _, stage := range stages {
		if onlyStep != "" && stage.ID != onlyStep {
			continue
		}
		if err := emit(Event{Kind: "agent.started", Agent: stage.ID, Summary: "Etapa iniciada"}); err != nil {
			return files, err
		}
		feedback := []string{}
		if e.StepsVersion >= 3 || e.RevisionScope == "interface" {
			for _, name := range []string{"reference/catalog.json", "reference/platform-contracts.go"} {
				content, ok := references[name]
				if !ok || content == "" {
					continue
				}
				digest := fmt.Sprintf("sha256:%x", sha256.Sum256([]byte(content)))
				if err := emit(Event{Kind: "context.loaded", Agent: "system", Path: name, Summary: "Disponibilizou contrato existente no contexto da etapa", Output: digest}); err != nil {
					return files, err
				}
				feedback = append(feedback, "Contrato disponibilizado pelo host (somente leitura): "+name+"\n"+content)
				consulted[name] = true
			}
		}
		finished := false
		retried := false
		for round := 0; round < stage.rounds; round++ {
			if err := ctx.Err(); err != nil {
				return files, err
			}
			referencesSeen := consulted["reference/catalog.json"] && consulted["reference/platform-contracts.go"]
			rules, instruction := Rules, stage.instruction
			if e.StepsVersion >= 2 {
				rules += "\n" + DesignReference
				if e.StepsVersion >= 3 || files[NavigationPath] != "" {
					rules = strings.Replace(rules, "UX escreve somente design/ux.json", "UX escreve design/ux.json e design/navigation.json", 1)
					rules += "\n" + NavigationReference
				}
			}
			if IsSvelte(files) {
				rules = strings.Replace(rules, legacyFrontendRules, FrontendReference, 1)
				if stage.ID == "interface" {
					instruction = "Construa somente componentes Svelte e CSS/JS/TS em frontend/src/ para a entrega delimitada. Leia reference/frontend-svelte.md. Consulte os contratos do backend existente e as especificações design/*.json, trate estados de interface e execute test para compilar. As especificações são somente leitura nesta etapa: não tente reescrevê-las. Não escreva os artefatos gerados."
				}
			}
			if e.StepsVersion >= 4 {
				rules = FrontendAgentRules + "\n" + VisualAgentsReference + "\n" + FrontendReference + "\n" + DesignReference + "\n" + NavigationReference
				if stage.ID == "interface" {
					instruction = "Construa o frontend Svelte específico para o pedido, lendo o plano UX/UI e as fontes atuais. Em páginas novas, escreva PRIMEIRO um App.svelte pequeno e autossuficiente com o visual e a primeira seção real do pedido, incluindo CSS, antes de criar outros componentes. Essa prévia inicial pode ser monolítica e ainda não usar o Router; a validação parcial permite isso. Depois extraia/evolua componentes e conecte a navegação completa para a entrega final. Nunca importe um componente ainda não escrito. Use verdict continue enquanto faltar conteúdo do pedido. Evolua a página por lotes pequenos de componentes e seções completos: o host compila cada lote para o cliente acompanhar a construção. Não use um template fixo, não antecipe decisões do cliente com conteúdo inventado e não transforme uma página já criada em outra página sem solicitação. As ações completas são aplicadas enquanto sua resposta ainda está chegando. Escreva arquivos e seções pequenos, com dependências já disponíveis, para o compilador atualizar a página imediatamente após cada write. Não espere montar um lote grande para mostrar algo. Crie navegação e interações apropriadas ao pedido. Leia reference/frontend-svelte.md e reference/navigation.md. Os arquivos backend, application.json e design/*.json são somente leitura nesta etapa."
				}
			}
			instruction += fmt.Sprintf("\nEtapa atual: %s. Rodada %d de %d. Conclua somente a responsabilidade desta etapa com verdict ready; pendências de outras etapas ficam para seus responsáveis. Se o código desta etapa já atende ao plano, valide-o sem reescrever. Na última rodada, retorne ready se sua parte está pronta, ou blocked com a lacuna concreta.", stage.ID, round+1, stage.rounds)
			if stage.ID == "backend" {
				instruction += "\nSe a revisão solicitada é apenas visual ou de frontend, preserve o backend existente, rode os testes Go e conclua sua parte com ready. A ferramenta test aqui executa somente os testes Go, nunca Svelte. Não tente corrigir arquivos frontend; isso pertence à próxima etapa."
			}
			if e.RevisionScope == "interface" {
				instruction += "\nREVISÃO SOMENTE DE INTERFACE: o cliente escolheu reaproveitar planejamento, UX, design, rotas e backend já validados. Consulte os arquivos existentes e altere apenas o frontend necessário ao pedido. Não substitua a aplicação por um template. Não escreva application.json, backend/, design/ ou DESIGN.md nem mude endpoints. Se o pedido exigir mudar essas partes, retorne blocked com a dependência concreta. A revisão final pode corrigir somente frontend e deve validar a entrega preservada."
			}
			if e.StepsVersion >= 3 || e.RevisionScope == "interface" {
				instruction += "\nOs contratos de catálogo/plataforma disponibilizados pelo host em feedback já foram carregados; consulte esse conteúdo antes de escrever, sem precisar repetir read para esses dois contratos. Os arquivos atuais estão em files: use o que está pronto, mantenha os componentes e rotas adequados e faça somente as alterações necessárias. Os demais documentos podem ser consultados com read."
			}
			requestFiles := clone(files)
			if raw := requestFiles[MediaPath]; raw != "" {
				requestFiles[MediaPath] = MediaSummary(raw)
			}
			if IsSvelte(files) {
				for _, name := range frontendArtifacts {
					delete(requestFiles, name)
				}
			}
			rejected := false
			applyActions := func(actions []Action) error {
				for _, a := range actions {
					if err := ctx.Err(); err != nil {
						return err
					}
					ev := Event{Agent: stage.ID, Path: a.Path}
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
							data, ok = references[a.Path]
						}
						if !ok {
							feedback = append(feedback, "Arquivo indisponível: "+a.Path)
							ev.Kind = "tool.rejected"
							ev.Summary = "Leitura fora dos arquivos disponíveis"
						} else {
							consulted[a.Path] = true
							if a.Path == MediaPath {
								data = MediaSummary(data)
							}
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
						if (e.StepsVersion >= 4 && (strings.HasPrefix(a.Path, "backend/") || a.Path == application.ManifestPath)) || (e.RevisionScope == "interface" && !strings.HasPrefix(a.Path, "frontend/")) || !(allowed(stage.ID, a.Path) || (e.StepsVersion >= 4 && stage.ID == "architect" && a.Path == "frontend/src/App.svelte")) || (IsSvelte(files) && strings.HasPrefix(a.Path, "frontend/") && !frontendSource(a.Path)) || len(a.Content) > 48000 {
							feedback = append(feedback, "Escrita recusada: "+a.Path)
							if stage.ID == "backend" && strings.HasPrefix(a.Path, "frontend/") {
								feedback = append(feedback, "Você está na etapa backend. Este arquivo pertence à etapa interface, que ainda será executada. Não repita esta escrita. Valide somente o Go existente e conclua sua etapa com ready se ele está correto.")
							}
							ev.Kind = "tool.rejected"
							ev.Summary = "Caminho ou tamanho não permitido"
							if stage.ID == "interface" && strings.HasPrefix(a.Path, "design/") {
								ev.Summary = "A interface apenas lê o plano de UX/design; implemente somente frontend/src/"
								feedback = append(feedback, ev.Summary+". Preserve o plano existente e conclua somente sua implementação.")
							}
							break
						}
						size := len(a.Content)
						for p, v := range files {
							if p != MediaPath && p != a.Path && !(IsSvelte(files) && frontendArtifact(p)) {
								size += len(v)
							}
						}
						if size > 350000 || len(files) >= 48 && files[a.Path] == "" {
							return errors.New("workspace_limit")
						}
						if IsSvelte(files) && (frontendSource(a.Path) || a.Path == "application.json" || a.Path == NavigationPath) && files[a.Path] != a.Content {
							for _, name := range frontendArtifacts {
								if files[name] == "" {
									continue
								}
								if err := emit(Event{Kind: "file.written", Agent: "system", Path: name, Before: files[name], After: "", Summary: "Invalidou compilação após alteração das fontes"}); err != nil {
									return err
								}
								files[name] = ""
							}
						}
						ev.Kind = "file.written"
						ev.Summary = "Escreveu código"
						ev.Before = files[a.Path]
						ev.After = a.Content
						files[a.Path] = a.Content
						feedback = append(feedback, "Arquivo salvo: "+a.Path)
					case "generate_gif":
						if stage.ID != "gif" || e.StepsVersion != 5 {
							ev.Kind = "tool.rejected"
							ev.Summary = "A geração de GIF pertence à especialista Luma"
							break
						}
						if err := e.generateGIF(ctx, files, a, emit); err != nil {
							if ctx.Err() != nil {
								return ctx.Err()
							}
							if saveErr := emit(Event{Kind: "asset.failed", Agent: stage.ID, Path: MediaPath, Summary: "Não foi possível concluir o GIF no CLIPS; sua página foi preservada", Output: err.Error()}); saveErr != nil {
								return saveErr
							}
							return fmt.Errorf("gif_generation_failed: %w", err)
						} else {
							feedback = append(feedback, "GIF real disponível: "+MediaSummary(files[MediaPath]))
							continue
						}
					case "test":
						if PlanningStep(stage.ID) || stage.ID == "gif" {
							ev.Kind = "tool.rejected"
							ev.Summary = "A etapa de planejamento não executa código"
							feedback = append(feedback, ev.Summary)
							break
						}
						if IsSvelte(files) && (stage.ID == "interface" || stage.ID == "motion" || stage.ID == "reviewer") {
							if err := e.compileFrontend(ctx, files, stage.ID, emit); err != nil {
								if errors.Is(err, ErrFrontendRunner) {
									return err
								}
								feedback = append(feedback, "Corrija o frontend: "+err.Error())
								continue
							}
							feedback = append(feedback, "Frontend Svelte compilado; isto não é teste visual. Recibo e warnings: "+frontendReceiptSummary(files["frontend/build.json"]))
							if stage.ID == "interface" || e.StepsVersion >= 4 {
								continue
							}
						}
						if err := emit(Event{Kind: "test.started", Agent: stage.ID, Summary: "Executando testes Go em isolamento"}); err != nil {
							return err
						}
						ev.Path = "backend"
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
					if ev.Kind == "tool.rejected" {
						rejected = true
					}
					if err := emit(ev); err != nil {
						return err
					}
				}
				return nil
			}

			request := Request{Agent: stage.ID, Goal: goal, Instruction: constructionInstructions(rules, instruction, e.StepsVersion), Files: requestFiles, References: refs, Feedback: feedback}
			var turn Turn
			var err error
			streamed := false
			if provider, ok := e.Provider.(ProgressiveProvider); ok && e.StepsVersion >= 4 && (stage.ID == "interface" || stage.ID == "architect" || stage.ID == "motion") {
				streamed = true
				turn, err = provider.NextProgressive(ctx, request, func(p Progress) error {
					if err := ctx.Err(); err != nil {
						return err
					}
					if p.Summary != "" {
						if len(p.Summary) > 2000 {
							return errors.New("invalid_agent_response")
						}
						if err := emit(Event{Kind: "agent.update", Agent: stage.ID, Summary: p.Summary}); err != nil {
							return err
						}
					}
					if p.Path != "" && frontendSource(p.Path) {
						if err := emit(Event{Kind: "file.generating", Agent: stage.ID, Path: p.Path, Summary: "Criando a próxima parte da página"}); err != nil {
							return err
						}
					}
					if p.Action != nil {
						if err := applyActions([]Action{*p.Action}); err != nil {
							return err
						}
						if p.Action.Tool == "write" && frontendSource(p.Action.Path) && files["frontend/src/App.svelte"] != "" {
							if err := e.compileFrontendPreview(ctx, files, stage.ID, emit); err != nil {
								if errors.Is(err, ErrFrontendRunner) {
									return err
								}
								feedback = append(feedback, "Este trecho ainda não compila: "+err.Error()+". A última prévia válida foi preservada.")
							}
						}
					}
					return nil
				})
			} else {
				turn, err = e.Provider.Next(ctx, request)
			}
			if err != nil {
				if errors.Is(err, ErrProviderUnavailable) && !retried && ctx.Err() == nil {
					retried = true
					if saveErr := emit(Event{Kind: "agent.retry", Agent: stage.ID, Summary: "O provedor demorou ou ficou indisponível. Tentando novamente com os arquivos preservados."}); saveErr != nil {
						return files, saveErr
					}
					continue
				}
				return files, fmt.Errorf("provider: %w", err)
			}
			if len(turn.Actions) > 6 || len(turn.Summary) > 2000 {
				return files, errors.New("invalid_agent_response")
			}
			if err := emit(Event{Kind: "agent.update", Agent: stage.ID, Summary: turn.Summary}); err != nil {
				return files, err
			}
			if !streamed {
				if err := applyActions(turn.Actions); err != nil {
					return files, err
				}
			}

			// Publish a real runnable preview after each complete source batch.
			if !streamed && e.StepsVersion >= 4 && stage.ID == "interface" && turn.Verdict == "continue" && files["frontend/src/App.svelte"] != "" && !FrontendCurrent(files) {
				if err := e.compileFrontendPreview(ctx, files, stage.ID, emit); err != nil {
					if errors.Is(err, ErrFrontendRunner) {
						return files, err
					}
					feedback = append(feedback, "Complete/corrija o lote para a prévia: "+err.Error())
				} else {
					feedback = append(feedback, "O lote já está na prévia do cliente. Continue os itens do pedido que ainda faltam; preserve o que está pronto.")
				}
			}
			if turn.Verdict == "ready" && rejected {
				feedback = append(feedback, "Não foi possível concluir: uma ação desta rodada foi recusada. Leia o motivo, execute somente as ações permitidas da sua etapa e confirme os arquivos efetivamente salvos antes de retornar ready novamente.")
				continue
			}
			if turn.Verdict == "blocked" {
				return files, errors.New("agent_reported_blocker")
			}
			if turn.Verdict == "ready" {
				if e.StepsVersion >= 2 && (stage.ID == "ux" || stage.ID == "designer" || stage.ID == "interface" || stage.ID == "reviewer") {
					issue := ValidateDesign(files, stage.ID)
					kind, summary := "design.validated", "Estrutura da especificação validada; inspeção visual e de usabilidade pendente"
					if issue != nil {
						kind = "design.rejected"
						summary = "Corrija a especificação: " + issue.Error()
					}
					if err := emit(Event{Kind: kind, Agent: stage.ID, Summary: summary}); err != nil {
						return files, err
					}
					if issue != nil {
						feedback = append(feedback, summary)
						continue
					}
				}
				if (e.StepsVersion >= 3 || files[NavigationPath] != "") && (stage.ID == "ux" || stage.ID == "designer" || stage.ID == "interface" || stage.ID == "reviewer") {
					plan, issue := ValidateNavigation(files, stage.ID == "interface" || stage.ID == "reviewer")
					kind, summary := "navigation.validated", "Mapa de rotas validado; comportamento da aplicação ainda não verificado"
					output := ""
					if issue != nil {
						kind, summary = "navigation.rejected", issue.Error()
					} else {
						data, _ := json.Marshal(plan)
						output = string(data)
					}
					if err := emit(Event{Kind: kind, Agent: stage.ID, Path: NavigationPath, Summary: summary, Output: output}); err != nil {
						return files, err
					}
					if issue != nil {
						feedback = append(feedback, summary)
						continue
					}
				}
				if stage.ID == "architect" && files["DESIGN.md"] == "" {
					feedback = append(feedback, "Escreva DESIGN.md antes de concluir.")
					continue
				}
				if stage.ID == "interface" && !IsSvelte(files) && files["frontend/index.html"] == "" {
					feedback = append(feedback, "Escreva frontend/index.html antes de concluir.")
					continue
				}
				if IsSvelte(files) && (stage.ID == "interface" || stage.ID == "motion" || stage.ID == "reviewer") && (e.StepsVersion < 4 || !FrontendCurrent(files)) {
					if err := e.compileFrontend(ctx, files, stage.ID, emit); err != nil {
						if errors.Is(err, ErrFrontendRunner) {
							return files, err
						}
						feedback = append(feedback, "Corrija o frontend antes de concluir: "+err.Error())
						continue
					}
				}
				if stage.ID == "architect" || stage.ID == "reviewer" {
					var contractErr error
					if stage.ID == "architect" {
						_, contractErr = application.Decode(files[application.ManifestPath])
					} else {
						_, contractErr = application.ValidateFiles(files)
					}
					kind, summary := "contract.validated", "Contrato da aplicação validado"
					if contractErr != nil {
						kind, summary = "contract.rejected", "Corrija o contrato da aplicação: "+contractErr.Error()
					}
					if err := emit(Event{Kind: kind, Agent: stage.ID, Path: application.ManifestPath, Summary: summary}); err != nil {
						return files, err
					}
					if contractErr != nil {
						feedback = append(feedback, summary)
						continue
					}
				}
				if e.StepsVersion < 4 && (stage.ID == "backend" || stage.ID == "reviewer") {
					if err := emit(Event{Kind: "test.started", Agent: stage.ID, Summary: "Validando o estado final da etapa"}); err != nil {
						return files, err
					}
					output, err := e.Tester.Test(ctx, clone(files))
					kind := "test.passed"
					if err != nil {
						kind = "test.failed"
					}
					if saveErr := emit(Event{Kind: kind, Agent: stage.ID, Summary: "Resultado da validação final", Output: output}); saveErr != nil {
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
			return files, fmt.Errorf("agent_round_limit: %s", stage.ID)
		}
		if err := emit(Event{Kind: "agent.finished", Agent: stage.ID, Summary: "Etapa concluída"}); err != nil {
			return files, err
		}
	}
	return files, nil
}
