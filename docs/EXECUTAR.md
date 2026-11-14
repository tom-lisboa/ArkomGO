# Executar a demo local

## Requisitos

- Node.js 24 ou superior e npm.
- Go 1.26 ou superior; os módulos mantêm seus próprios `go.mod`.
- Python 3.9 ou superior para os scripts.
- Acesso à API OpenAI e um modelo autorizado.
- Para o CRM: PostgreSQL DEV provisionado, workspace Clickmax DEV e credenciais privadas.

As portas 3007, 8080, 8081, 8098 e 8099 devem estar livres. O launcher recusa iniciar por cima de uma instância existente. Ele não modifica nem encerra a demo que já esteja rodando em outro checkout.

## Preparar

```sh
git clone https://github.com/tom-lisboa/ArkomGO.git
cd ArkomGO
cp .env.example .env
python3 scripts/build-demo.py
```

Preencha `OPENAI_API_KEY` no `.env`, sem publicá-lo. O modelo deve ser válido para sua conta. O script de build gera somente binários locais e instala dependências do portal e do compilador Svelte; não inicia chamadas de IA.

Os seis agentes de construção do Genesis usam `GENESIS_OPENAI_MODEL=gpt-6.1-sol` e `GENESIS_REASONING_EFFORT=high` por padrão, pela Responses API. Essas variáveis são independentes de `SDR_OPENAI_MODEL`, usado pelo atendimento e pelo fluxo legado de qualificação. É possível ajustar o esforço para `low`, `medium`, `high`, `xhigh` ou `max`, desde que suportado pelo modelo escolhido. Reinicie a demo após alterar o `.env`. A construção permite até 32 mil tokens de saída por chamada (incluindo raciocínio), com timeout de cinco minutos; o limite global da etapa continua em vinte minutos. São limites máximos, não consumo fixo. Não há troca automática para um modelo mais barato em caso de erro.

```sh
python3 scripts/demo.py
```

Abra http://127.0.0.1:3007/demo . Use Ctrl+C para encerrar os processos iniciados pelo launcher. Logs, credenciais geradas, SQLite e relatórios ficam sob `.local/runtime`, ignorada pelo Git.

Sem configuração CRM, é possível iniciar Genesis e SDR. As telas que dependem do CRM mostrarão indisponibilidade até que ele seja configurado. O Genesis somente chama o provedor quando você solicita um plano. Mensagens enviadas para o atendimento com IA também podem gerar consumo da API.

## Configurar o CRM real de desenvolvimento

Esta publicação **não inclui** a base PostgreSQL, o token de instalação, a chave Clickmax nem o arquivo privado de rotas usados no computador de origem.

1. Siga [o contrato CRMGO](../services/crm/INTEGRACAO.md) para provisionar o diretório/instalação e a rota em `arkom_crm.routes` no PostgreSQL DEV. O worker cria seu schema, mas não cria sozinho o vínculo comercial completo.
2. Copie [crm-routes.example.json](../config/crm-routes.example.json) para `.local/crm-routes.json` e preencha organização, instalação e credencial privada. Use a organização fictícia do SDR como chave, e os UUIDs centrais nos campos da rota.
3. Configure `SDR_CRM_ROUTES_FILE=.local/crm-routes.json`, `ARKOM_CRM_DATABASE_URL` e `ARKOM_CRM_CLICKMAX_PUBLIC_DEV_WORKSPACE` em `.env`. Para API dedicada de testes, siga a alternativa `ARKOM_CRM_CLICKMAX_DEV_URL` do contrato.
4. A variável da chave deve ter exatamente o nome de `key_env` cadastrado na rota. Para criação de contatos, a variável de captura usa esse nome seguido de `_CAPTURE_URL`.
5. Use apenas dados fictícios e o workspace DEV autorizado. Reinicie o launcher e consulte CRM pelo portal.

A base `services/core` registra diretório, identidade e barramento em refatoração. Não é iniciada pelo launcher nem substitui automaticamente o provisionamento do CRMGO.

## Verificar

```sh
(cd apps/agents/bia && npm ci --ignore-scripts && npm run build)
(cd apps/genesis_flutter && flutter analyze && flutter test)
node --test apps/genesis_flutter/test/*.test.cjs
(cd services/sdr && go test ./...)
(cd services/crm && go test ./...)
(cd packages/deeph && go test ./...)
python3 scripts/catalog_mermaid.py
npm ci --ignore-scripts
npm run diagrams:check
```

Os testes CRM que exigem PostgreSQL só exercitam esse caminho quando `ARKOM_CRM_TEST_DATABASE_URL` aponta para uma base **vazia e descartável**; não use o banco de operação. Consulte os READMEs de cada componente para verificações adicionais. Scripts antigos que mencionam caminhos absolutos ou serviços de produção são referências históricas, não o procedimento desta demo.

## Limites operacionais

Esta é uma demo local, não um pacote pronto para produção. O login Alfa simplificado depende de flags explícitas e loopback. Um produto público exige sessão comercial, provisionamento por empresa, gestão de credenciais, domínio, limites, auditoria e operação contínua. Publicar este repositório no GitHub não publica a aplicação na internet.

## Estúdio de construção

Abra `/demo/genesis` e descreva a aplicação. O backend usa a mesma configuração OpenAI da demo e inicia os papéis de construção do deepH. O macOS requer `/usr/bin/sandbox-exec` e uma instalação Go em `/usr` ou `/opt/homebrew`; toolchains baixadas sob o diretório do usuário não são executadas no isolamento. Para as novas interfaces Svelte, também instale as dependências de `packages/genesis-frontend` com `npm ci --ignore-scripts` (o script de build já faz isso). O launcher configura `ARKOM_FRONTEND_TOOLCHAIN` para esse diretório. No macOS, Node deve estar em `/usr` ou `/opt/homebrew`. No Linux, prepare Docker e as imagens `golang:1.26` e `node:24-bookworm-slim`; esse executor ainda requer homologação específica. Sem executor isolado a API recusa iniciar.

Arquivos e traces ficam no SQLite da demo. O download entrega um ZIP de fontes; ele ainda não instala a aplicação. Para pedir uma melhoria, escreva o novo pedido no campo principal e escolha **Continuar destes arquivos**. Veja [escopo e limites da construção](GENESIS-CONSTRUCAO.md).

### Genesis em Flutter Web

Instale Flutter 3.50.0 e disponibilize `flutter` no PATH, ou informe `FLUTTER_BIN`. O script `build-demo.py` agora também compila o Genesis. Para reconstruir somente essa tela, execute `python3 scripts/build-genesis-flutter.py`. O launcher exige os assets gerados antes de iniciar. Fontes e CanvasKit são servidos pelo servidor Go; não é necessário iniciar outro servidor Flutter.

O estúdio usa sessão em memória e stream autenticado SSE por projeto. Mais detalhes e comandos de teste em [apps/genesis_flutter](../apps/genesis_flutter/README.md).

### Frontends gerados em Svelte

Novos projetos usam Svelte 5. A etapa de interface compila os componentes e devolve erros/avisos nos traces. Revisões e retomadas de projetos antigos em HTML preservam o formato anterior. Veja [a base Svelte e seus limites](GENESIS-SVELTE.md) e [o fluxo de UX e design](GENESIS-UX-DESIGN.md).

Navegação por telas e revisões somente de interface: [GENESIS-NAVIGATION.md](GENESIS-NAVIGATION.md).

## Plataforma Flutter e CLIPS

A navegação local usa Flutter. O catálogo, os módulos disponíveis, o CLIPS e a inicialização opcional do PostgreSQL do CRM estão documentados em [ECOSISTEMA-LOCAL-FLUTTER.md](ECOSISTEMA-LOCAL-FLUTTER.md). O comando padrão `python3 scripts/demo.py` agora inicia os serviços locais configurados; não é necessário editar o launcher para desativar o CRM quando o banco DEV existente é gerenciado pela configuração.

### Servidor da plataforma

`demo.py` inicia `.local/bin/bia -web` em loopback na porta 3007. Ele serve `apps/genesis_flutter/build/web` e o agente `apps/agents/bia/dist`, sem Node/Next em execução na plataforma. Recompile com `scripts/build-demo.py` após mudanças no código; o build Flutter é de produção e não tem hot reload. O launcher não expõe os diretórios de fontes, `.env` ou dados privados.

Teste de navegação no navegador (demo em execução): `npm run test:local --prefix apps/agents/bia`. Não cria mensagens, cobranças, clientes ou construções. O login local conserva os limites de acesso do laboratório; entradas repetidas em pouco tempo podem responder 429 e informar `Retry-After`.

### Lia e agenda nativa

A demo inicia a agenda própria e seu worker Go por padrão. `ARKOM_CALENDAR_LOCAL_ENABLED=false` desativa essa capacidade. O acesso é pelo agente Lia em Início ou pela aba Agendas da BIA. Agendas, regras, pedidos e reservas pertencem à empresa autenticada. A conexão Google permanece bloqueada nesta etapa local. Teste completo com dados fictícios: `npm run test:agenda:local --prefix apps/agents/bia`.
