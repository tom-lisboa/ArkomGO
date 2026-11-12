package construction

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"sort"
	"strings"
)

const FrontendContractPath = "frontend/svelte.json"
const FrontendContract = "{\"schema\":\"arkom.svelte.v1\",\"svelte\":\"5.57.3\",\"entry\":\"frontend/src/App.svelte\"}\n"

var frontendArtifacts = []string{"frontend/index.html", "frontend/bundle.js", "frontend/bundle.css", "frontend/build.json"}

// New projects use Svelte. Legacy projects retain their source format when
// resumed or revised; the existing Go SDK can still be upgraded independently.
func NewSeed() map[string]string {
	files := Seed()
	files[FrontendContractPath] = FrontendContract
	return files
}
func IsSvelte(files map[string]string) bool { _, ok := files[FrontendContractPath]; return ok }
func frontendArtifact(name string) bool {
	for _, p := range frontendArtifacts {
		if p == name {
			return true
		}
	}
	return false
}
func frontendSource(name string) bool {
	return strings.HasPrefix(name, "frontend/src/") && ValidPath(name)
}
func frontendDigest(files map[string]string) string {
	names := []string{}
	for name := range files {
		if frontendSource(name) || name == FrontendContractPath || name == "application.json" {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	h := sha256.New()
	for _, name := range names {
		fmt.Fprintf(h, "%d:%s%d:%s", len(name), name, len(files[name]), files[name])
	}
	return "sha256:" + hex.EncodeToString(h.Sum(nil))
}

type FrontendResult struct {
	OK         bool             `json:"ok"`
	Javascript string           `json:"javascript"`
	CSS        string           `json:"css"`
	Warnings   []map[string]any `json:"warnings"`
	Errors     []map[string]any `json:"errors"`
}
type FrontendCompiler interface {
	CompileFrontend(context.Context, map[string]string) (FrontendResult, error)
}

// The receipt binds compiled output to the exact sources that were compiled.
func FrontendCurrent(files map[string]string) bool {
	if !IsSvelte(files) {
		return true
	}
	var receipt struct {
		SourceDigest string `json:"source_digest"`
		BundleDigest string `json:"bundle_digest"`
	}
	return files[FrontendContractPath] == FrontendContract && json.Unmarshal([]byte(files["frontend/build.json"]), &receipt) == nil && receipt.SourceDigest == frontendDigest(files) && receipt.BundleDigest == compiledDigest(files) && files["frontend/index.html"] != "" && files["frontend/bundle.js"] != ""
}
func compiledDigest(files map[string]string) string {
	h := sha256.New()
	for _, name := range frontendArtifacts[:3] {
		fmt.Fprintf(h, "%d:%s", len(files[name]), files[name])
	}
	return hex.EncodeToString(h.Sum(nil))
}
func (e *Engine) compileFrontend(ctx context.Context, files map[string]string, agent string, emit func(Event) error) error {
	if err := emit(Event{Kind: "frontend.build.started", Agent: agent, Summary: "Compilando componentes Svelte em isolamento"}); err != nil {
		return err
	}
	compiler, ok := e.Tester.(FrontendCompiler)
	var result FrontendResult
	var err error
	if !ok {
		err = errors.New("frontend_compiler_unavailable")
	} else if files[FrontendContractPath] != FrontendContract {
		err = errors.New("frontend_contract_invalid")
	} else {
		result, err = compiler.CompileFrontend(ctx, clone(files))
	}
	if err == nil && (!result.OK || result.Javascript == "" || len(result.Javascript) > 256*1024 || len(result.CSS) > 256*1024 || len(result.Javascript)+len(result.CSS) > 384*1024) {
		err = errors.New("frontend_build_invalid")
	}
	if err != nil {
		output, _ := json.Marshal(result.Errors)
		if saveErr := emit(Event{Kind: "frontend.build.failed", Agent: agent, Summary: "O frontend precisa de correção", Output: string(output) + "\n" + err.Error()}); saveErr != nil {
			return saveErr
		}
		return fmt.Errorf("%w: %s", err, output)
	}
	var manifest struct {
		Name string `json:"name"`
	}
	_ = json.Unmarshal([]byte(files["application.json"]), &manifest)
	outputs := map[string]string{
		"frontend/index.html": "<!doctype html>\n<html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + html.EscapeString(manifest.Name) + "</title><link rel=\"stylesheet\" href=\"./bundle.css\"></head><body><div id=\"app\"></div><script src=\"./bundle.js\"></script></body></html>",
		"frontend/bundle.js":  result.Javascript, "frontend/bundle.css": result.CSS,
	}
	receipt, _ := json.Marshal(map[string]any{"schema": "arkom.svelte.build.v1", "source_digest": frontendDigest(files), "bundle_digest": compiledDigest(outputs), "warnings": result.Warnings})
	outputs["frontend/build.json"] = string(receipt)
	for _, name := range frontendArtifacts {
		if err := emit(Event{Kind: "file.written", Agent: "system", Path: name, Before: files[name], After: outputs[name], Summary: "Salvou artefato compilado do frontend"}); err != nil {
			return err
		}
		files[name] = outputs[name]
	}
	warnings, _ := json.Marshal(result.Warnings)
	return emit(Event{Kind: "frontend.build.passed", Agent: agent, Summary: "Svelte compilado; inspeção visual ainda pendente", Output: string(warnings)})
}

const FrontendReference = `FRONTEND SVELTE: este projeto usa Svelte 5.57.3. Escreva frontend/src/App.svelte e componentes .svelte, módulos .js/.ts e estilos .css em frontend/src/. O host monta App.svelte automaticamente; não crie main.ts nem monte App manualmente. Importe estilos globais diretamente de App.svelte (ex.: import './styles.css'). Arquivos não importados não entram no bundle e geram aviso. Importe arquivos relativos com extensão. Svelte compila TypeScript simples em <script lang="ts">; não use preprocessadores. Use $state, $derived, $props e eventos onclick/onsubmit. Exemplo: <script>let count = $state(0);</script><button onclick={() => count++}>{count}</button>. Componentes são importados com import Card from './Card.svelte'. Use CSS no componente ou import './styles.css'. Não use @import remoto, URLs externas, bibliotecas de ícones, fontes de CDN ou pacotes adicionais; somente svelte e seus módulos oficiais de UI. Prefira SVG inline para ícones.
O host controla frontend/svelte.json, frontend/index.html, bundle.js, bundle.css e build.json; nunca escreva esses arquivos. Não crie package.json, vite.config ou scripts de instalação. A ferramenta test na etapa interface compila Svelte; erros e warnings voltam nos traces. Para concluir interface e revisão, o host compila novamente as fontes finais. Compilação não é teste visual, de acessibilidade nem de comportamento.
Use fetch('/api/...') no navegador para o backend Go já declarado. Trate loading, vazio, sucesso e erro; verifique response.ok. Use somente dados da API ou exemplos claramente identificados. Crie componentes reutilizáveis, layout responsivo, HTML semântico, labels, foco visível, navegação por teclado e contraste legível. Escolha identidade visual apropriada ao produto e ao pedido do cliente; não aplique o tema Arkom automaticamente. Entregue somente o escopo de DESIGN.md. Sem SSR/SvelteKit nesta etapa.`
