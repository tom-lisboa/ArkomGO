# Backend da prévia — etapa 2

O Genesis pode iniciar o backend Go de uma construção concluída com contrato
validado e encaminhar chamadas da interface a esse processo isolado. O estúdio inicia automaticamente o backend ao abrir uma construção concluída e compatível. O rodapé mostra a preparação e a conexão; **Conectar solução** permite retomar e **Mais opções → Pausar solução** encerra a execução. As chamadas aguardam a preparação e entram em fila.

## Entrada do backend

Arquivos na raiz `backend/` usam `package solution` e expõem:

```go
func NewHandler(tenant platform.Tenant) http.Handler
```

`platform` é `arkom.local/solution/platform`. O host chama essa função uma vez,
fornece a empresa autenticada e mantém o handler até a prévia terminar. O código
usa `net/http` e testes `httptest`, sem abrir uma porta nem criar um `main`.
`backend/cmd/arkom-runtime/` é reservado ao adaptador do host. Os agentes recebem
essas instruções; os testes isolados compilam o adaptador quando encontram a
entrada. A detecção de `NewHandler` no resumo é apenas estrutural; a compilação e
inicialização efetivas ainda podem falhar. Logs da aplicação devem usar stderr.

A [calculadora de referência](../packages/deeph/pkg/construction/testdata/calculator)
contém manifesto, handler e interface reais usados pelo teste de integração.
Ela não é inserida automaticamente na lista de projetos do usuário.

A interface pode usar:

```js
const response = await fetch('/api/calculate', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({a: 12, b: 30, op: '+'})
});
const result = await response.json();
```

O transporte aceita caminho, método e corpo JSON/texto. O host pode incluir internamente o snapshot do documento da aplicação;
esse envelope não vem do navegador nem é devolvido a ele. Cabeçalhos personalizados,
cookies, streaming, binários, WebSocket e chamadas externas não fazem parte deste
contrato. O host envia `Content-Type: application/json` ao handler. A resposta
expõe status, corpo e tipo `application/json` ou `text/plain`.

## Isolamento e identidade

A interface permanece em iframe de origem opaca, `sandbox="allow-scripts"` e CSP
com `connect-src 'none'`. Um adaptador de `fetch` usa `MessageChannel`; o estúdio
verifica a janela de origem, o iframe conectado, o projeto selecionado e a sessão
atual antes de encaminhar o pedido autenticado. A aplicação não recebe o token.

A API revalida empresa, perfil, contrato e digest dos arquivos em cada pedido.
Somente método e rota declarados podem ser chamados. IDs de empresa enviados no
corpo não substituem `tenant.OrganizationID`. Perfis de visualização não iniciam,
encerram ou chamam o backend.

O processo recebe apenas código, empresa e pedidos via stdin/stdout. Não recebe
chaves do provedor, conexão com banco ou sessão Arkom. No Linux, executa em Docker
sem rede, como usuário sem privilégios, filesystem somente leitura, capacidades
removidas, limites de memória/CPU/processos e armazenamento temporário. No macOS,
reutiliza `sandbox-exec` com bloqueio de rede, diretórios pessoais e escrita externa.
Não há fallback para execução sem isolamento. Linux exige Docker e a imagem
`golang:1.26` disponível; macOS exige Go instalado em caminho de sistema.

## Ciclo de vida e limites

- Uma prévia ativa por empresa; até quatro no serviço.
- Inicialização assíncrona, com limite de 100 segundos para compilar/iniciar.
- Duração de cinco minutos, incluindo preparação; depois é possível reiniciar.
- Um pedido em execução por prévia, até cinco segundos. Timeout encerra o processo.
- Corpo de pedido até 32 KiB e resposta até 64 KiB; caminho até 2 KiB.
- Estado comum em memória é temporário. Parar, expirar ou reiniciar o serviço
  apaga esse estado. Um [documento salvo explicitamente](GENESIS-DADOS-APLICACAO.md)
  por empresa/aplicação permanece, assim como o código e o histórico da construção.
- Aplicações com `capabilities` não vazias são recusadas até existirem adaptadores
  autorizados. Esta etapa não conecta CRM, pagamentos ou outros serviços.

O processo é cancelado também quando o serviço encerra. Trocar de projeto fecha
sua ponte no navegador; a execução pode continuar até ser encerrada ou expirar.

## API

Todos os caminhos abaixo têm o prefixo
`/v1/sdr/genesis-demo/construction/{id}/runtime` e usam a sessão existente.

| Método e sufixo | Comportamento |
| --- | --- |
| `GET` | Estado `stopped`, `starting`, `running` ou `failed` |
| `POST /start` | Inicia a revisão selada; retorna 202 ou estado já ativo |
| `POST /request` | Recebe `{method,path,body}` e retorna `{status,body,content_type}` |
| `POST /stop` | Cancela inicialização/execução; pode ser repetido |

A auditoria registra `preview.started` antes de criar o processo. Estado da execução
não é persistido nem indica publicação. O proxy do portal mantém o mesmo protocolo
sob `/api/demo/backend/`.

## Validação

Os testes Go cobrem autorização por empresa/perfil, integridade do snapshot,
rotas, entrada ausente, capacidades indisponíveis, cancelamento e início idempotente.
Os testes JS exercitam a ponte real de mensagens e o bloqueio de frames/sessões
antigos. A análise e os testes Flutter verificam a interface.

O job `runtime` do GitHub Actions executa com Docker:

```sh
cd services/sdr
ARKOM_RUNTIME_INTEGRATION=true go test -run TestRuntimeIntegration -count=1 -timeout=7m .
```

Esse teste inicia Go de verdade, calcula 12 + 30, consulta o histórico em memória,
confirma a empresa fornecida pelo host, testa bloqueio de leitura/escrita externa,
rede e variáveis do host, e encerra um handler travado por timeout. A calculadora
é uma fixture controlada; o teste não chama modelos nem consome geração paga.
O sandbox do chat macOS não permite iniciar um segundo `sandbox-exec`; essa
verificação deve ocorrer fora dele ou no executor Linux do CI.

Projetos anteriores precisam ser continuados para receber manifesto e `NewHandler`.
Para usar a nova versão local, recompile o serviço e o Flutter e reinicie a demo
conforme [EXECUTAR.md](EXECUTAR.md). Um processo já aberto continua com o binário antigo.
