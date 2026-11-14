package construction

import (
	"fmt"
	"regexp"
	"strings"
)

const NavigationPath = "design/navigation.json"

type NavigationRoute struct {
	Path      string `json:"path"`
	Title     string `json:"title"`
	Component string `json:"component"`
	Menu      *bool  `json:"menu"`
}
type NavigationPlan struct {
	Schema string            `json:"schema"`
	Home   string            `json:"home"`
	Routes []NavigationRoute `json:"routes"`
}

var navigationRoutePattern = regexp.MustCompile(`^/(?:[a-z0-9-]+/)*(?:[a-z0-9-]+|:[a-z][a-z0-9_]*)?$`)
var navigationComponentPattern = regexp.MustCompile(`^frontend/src/pages/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.svelte$`)
var navigationParamPattern = regexp.MustCompile(`:[a-z][a-z0-9_]*`)

func ValidateNavigation(files map[string]string, implementation bool) (*NavigationPlan, error) {
	var plan NavigationPlan
	if err := decodeDesign(files[NavigationPath], &plan); err != nil {
		return nil, fmt.Errorf("%s: %w", NavigationPath, err)
	}
	if plan.Schema != "arkom.navigation.v1" || len(plan.Routes) < 1 || len(plan.Routes) > 12 {
		return nil, fmt.Errorf("navegação: use schema arkom.navigation.v1 e 1 a 12 rotas")
	}
	seen := map[string]bool{}
	home, menu := false, false
	for _, r := range plan.Routes {
		if len(r.Path) > 100 || !navigationRoutePattern.MatchString(r.Path) || (r.Path != "/" && strings.HasSuffix(r.Path, "/")) || strings.TrimSpace(r.Title) == "" || len([]rune(r.Title)) > 80 || !navigationComponentPattern.MatchString(r.Component) || r.Menu == nil || (*r.Menu && strings.Contains(r.Path, ":")) {
			return nil, fmt.Errorf("rota inválida: %s; confira path, title, component e menu", r.Path)
		}
		shape := navigationParamPattern.ReplaceAllString(r.Path, ":param")
		if seen[shape] {
			return nil, fmt.Errorf("rota duplicada ou ambígua: %s", r.Path)
		}
		seen[shape] = true
		home = home || (r.Path == plan.Home && !strings.Contains(r.Path, ":"))
		menu = menu || *r.Menu
		if implementation && strings.TrimSpace(files[r.Component]) == "" {
			return nil, fmt.Errorf("implemente a tela declarada: %s", r.Component)
		}
	}
	if !home || !menu {
		return nil, fmt.Errorf("navegação: home deve ser rota estática declarada e deve existir uma rota no menu")
	}
	return &plan, nil
}

const NavigationReference = `NAVEGAÇÃO SVELTE: o plano versão 3 exige design/navigation.json criado pelo agente UX junto com design/ux.json. Este arquivo é o mapa de telas, não uma configuração de endpoints Go. Objeto exato: {"schema":"arkom.navigation.v1","home":"/tarefas","routes":[{"path":"/tarefas","title":"Tarefas","component":"frontend/src/pages/TaskList.svelte","menu":true},{"path":"/tarefas/nova","title":"Nova tarefa","component":"frontend/src/pages/TaskCreate.svelte","menu":true},{"path":"/tarefas/:id","title":"Detalhe da tarefa","component":"frontend/src/pages/TaskDetail.svelte","menu":false}]}. Adapte ao pedido, sem forçar três telas em uma calculadora simples. Entre 1 e 12 rotas; path usa segmentos minúsculos a-z, dígitos e hífen; parâmetro :id apenas no segmento final; títulos até 80 caracteres; home deve existir e não ter parâmetro. Pelo menos uma rota deve estar no menu. Detalhes parametrizados não entram no menu. Declare a jornada lista → criação → detalhe quando solicitada, com comportamento loading/vazio/erro/sucesso e integrações reais ou explicitamente pendentes na UX. Sem prometer conexão com produtos Arkom que o catálogo não disponibiliza.
Interface lê o mapa, UX/UI e contratos Go. Escreve SOMENTE frontend/src/ e NÃO reescreve design/*.json para concluir sua etapa. Implemente cada componente declarado e use frontend/src/App.svelte como layout compartilhado. Importe Router from '@arkom/Router.svelte' e {routes,current,href,navigate} from '@arkom/navigation'. Renderize <Router /> dentro do layout; o host conecta as páginas automaticamente. Menu: {#each routes.filter(r=>r.menu) as route}<a href={href(route.path)} aria-current={$current.route?.path===route.path ? 'page' : undefined}>{route.title}</a>{/each}. Use um nav com rótulo, navegação responsiva, destaque da página e conteúdo com hierarquia; não substitua telas por botões sem ação. O layout persiste entre páginas. Páginas de detalhe recebem let {params}=$props(); use params.id e valide resposta da API. Para abrir um detalhe: navigate('/tarefas/'+encodeURIComponent(id)). Links usam href('/tarefas'); URLs são #/tarefas e #/tarefas/123. Rotas estáticas têm precedência sobre :id. Há página não encontrada, foco na região de conteúdo e título atualizado. Sem SvelteKit, history.pushState ou instalação de router externo. Não use $current para definir outro roteador paralelo. Abas de navegação devem ser links; abas internas sem mudar página podem ser controles locais acessíveis.
O compilador valida mapa, existência das páginas e inclusão do Router no bundle. navigation.validated registra estrutura; navigation.built registra conexão estática ao bundle. Esses traces não são prova de comportamento do código gerado nem de integração real. Os testes da plataforma exercitam o roteador com uma aplicação de referência; a revisão deve verificar os critérios específicos da aplicação e declarar lacunas.`
