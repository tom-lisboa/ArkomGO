# Demo agêntica na base Arkom

A demo vive no próprio arkom-dash, branch local `codex/arkom-agent-demo`.
Entrada: http://127.0.0.1:3007/demo .

Reutiliza Shell, ArkomLogo, StarField, fontes, cores e providers do repositório. A navegação da demo é uma opção explícita de Shell; a navegação padrão permanece no produto. Início organiza especialistas e ferramentas por função. Mapa distingue áreas conectadas de futuras integrações. Sistemas abre as ferramentas dentro do portal.

O adaptador em `src/components/demo-runtime` é uma cópia do frontend SDR Next para esta etapa. Reutiliza conversas, CRMGO, conhecimento, automações, execuções e Genesis. A próxima integração deve extrair esses módulos para um pacote compartilhado e evitar manter duas cópias. O proxy local encaminha apenas as rotas do backend de demonstração, com as sessões existentes; não carrega chaves OpenAI ou Clickmax no frontend.

Para executar, primeiro iniciar a demo Go conforme o roteiro do SDR Next. Depois:

```sh
ARKOM_LOCAL_DEMO=true /opt/homebrew/opt/node@24/bin/node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3007
```

O acesso demonstrativo é exclusivo do ambiente local. Não usar esse modo para implantação pública. A sessão e o provisionamento comerciais exigem a integração do diretório da plataforma.

A sessão de demonstração é compartilhada em memória e deduplica entradas simultâneas. O runtime permanece montado ao alternar entre CRM, SDR e execuções, preservando a seleção. O CRM separa Contatos e Oportunidades; configurações de criação ficam recolhidas e o funil aparece em colunas. A página inicial consulta disponibilidade de IA, funis e aprovações nas 30 execuções mais recentes. Zero aprovações é um resultado real, não uma simulação.

Validação: TypeScript aprovado; início, SDR, CRM, Genesis e mapa responderam HTTP 200; rota desconhecida respondeu 404. Login e consulta dos três funis do Clickmax DEV passaram pelo proxy do portal, com IA habilitada e zero execuções de plataforma nesta consulta. Requisições sem sessão receberam 401, rotas não permitidas receberam 404 e origens divergentes receberam 403. Quatro testes de regressão cobrem sessão compartilhada e controle de origem do proxy:

```sh
node --test scripts/test-demo-session.cjs scripts/test-demo-proxy.cjs
npx tsc --noEmit
```

A revisão visual e os cliques ponta a ponta ficaram pendentes porque o navegador local está desativado no Codex. As verificações HTTP não substituem essa revisão.

## Próximas entregas do produto

1. Consolidar navegação, componentes compartilhados e identidade da empresa entre portal, SDR e CRM. Validar visualmente desktop e celular.
2. Transformar o plano do Genesis em uma alteração restrita e executável, começando por configurar um fluxo de qualificação. Mostrar prévia, obter aprovação, aplicar e registrar versão com possibilidade de recuperação.
3. Expandir o resumo real já conectado no início com atividades de cada agente, resultados e a fila completa de aprovações. Autonomia configurada por cliente e operação, executada pelo backend.
4. Habilitar instalação por empresa e Remix da mesma solução, preservando backend, dados, permissões e contratos.
5. Generalizar o catálogo de capacidades para as 23 soluções e avançar para novas aplicações construídas pelo Genesis.

O Genesis atual prepara o plano com deepH. Construção e publicação automáticas seguem como trabalho futuro. A integração Bia → CRMGO → Clickmax e os workers são reais nesta demo.
