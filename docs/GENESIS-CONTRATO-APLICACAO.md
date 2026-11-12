# Contrato das aplicações geradas — etapa 1

A construção agora produz `application.json`, usando o contrato `arkom.application.v1`.
A definição completa, os limites e um exemplo de calculadora estão em
[`pkg/application/contract.md`](../packages/deeph/pkg/application/contract.md).
O pacote Go `deeph/pkg/application` é a implementação de referência da validação.

## Identidade e revisão

A API atribui `application_id` ao iniciar a primeira construção e `revision=1`.
Continuar uma construção preserva o ID e aloca a próxima revisão da linhagem na
mesma empresa, mesmo que o pedido parta de uma versão antiga. A alocação acontece
sob o lock do serviço e na mesma transação que persiste o projeto. Revisões de
construções canceladas ou falhas não são reutilizadas. Não é uma versão comercial
SemVer nem um número escolhido pelo modelo.

A empresa é identificada pela sessão existente e pelo registro da construção.
O manifesto não aceita identidade da empresa, ID, revisão, credenciais ou URLs
de serviços. Capacidades declaradas são requisitos; a instalação e a autorização
serão resolvidas pelo backend na etapa de execução.

## Declaração dos agentes

O arquiteto entrega nome, versão do esquema, versão do catálogo, backend Go,
entrada web, rotas e capacidades. Backend, designer e revisor mantêm o arquivo
junto ao código. A validação rejeita campos desconhecidos ou ausentes, chaves
JSON duplicadas, métodos inválidos, caminhos fora de `/api/`, rotas conflitantes,
operações duplicadas e capacidades ausentes do catálogo Arkom.

O contrato está incluído nas instruções dos agentes e disponível como referência.
A arquitetura exige uma declaração válida; a revisão final exige também a entrada
web e o módulo Go esperado. Eventos `contract.validated` e `contract.rejected`
registram o resultado. Falhas voltam aos agentes para correção, dentro do limite
existente de rodadas. Os testes Go continuam obrigatórios.

Ao concluir, a API revalida os arquivos persistidos e grava um contrato com ID,
revisão, manifesto e `source_digest` SHA-256. O hash cobre o mapa completo de
caminhos e conteúdos, serializado pelo `encoding/json` Go com chaves ordenadas.
Contrato, estado pronto e auditoria são persistidos na mesma transação.
O hash detecta alterações no artefato; não é assinatura nem autorização de execução.

## API, SSE e exportação

`GET /v1/sdr/genesis-demo/construction/{id}/contract` usa a sessão e o isolamento
por empresa já existentes. Retorna ID, revisão, status e, quando validado, o contrato.
Antes da conclusão pode retornar a declaração e um código de erro de validação.

Os resumos HTTP e SSE incluem `application_id`, `revision` e `contract_status`:

| Estado | Significado |
| --- | --- |
| `legacy` | Construção anterior, sem identidade do novo contrato |
| `missing` | A declaração ainda não foi escrita |
| `invalid` | Declaração inválida, artefato ausente ou contrato final divergente |
| `pending` | Arquivos declarados válidos; construção ainda não concluída |
| `validated` | Construção pronta com contrato vinculado aos arquivos atuais |

A exportação inclui `application.json` como fonte. Projetos validados incluem
`application-contract.json`, emitido pelo host. O arquivo já existente
`construction-manifest.json` continua representando o resumo da construção.

## Compatibilidade e próximo passo

Projetos anteriores continuam legíveis e exportáveis, sem migração automática ou
contrato inventado. Ao continuar um projeto antigo, inicia-se uma linhagem com
identidade e revisão, e os agentes precisam produzir a declaração.

Esta etapa valida a declaração e sua correspondência com os arquivos. Não comprova
que um handler implementa uma rota nem inicia o backend gerado. A [etapa 2](GENESIS-RUNTIME-PREVIA.md) acrescenta
a entrada executável, o ciclo de vida do processo e a ligação autenticada da prévia.
Persistência de negócio, adaptadores e ativação continuam nas etapas seguintes.

## Verificação

- `go test ./...` em `services/sdr`: inclui contrato autenticado, isolamento por
  empresa, persistência, rollback transacional, exportação e compatibilidade legada.
- `go test ./pkg/application ./pkg/construction -skip TestSandboxDeniesHostDataNetworkAndExternalWrites`
  em `packages/deeph`: valida JSON estrito, rotas, catálogo, integridade dos arquivos
  e correção obrigatória pelos agentes. O teste de sandbox macOS requer execução
  fora do sandbox do chat; ele permanece no repositório.
- A suíte de testes usa provedores e artefatos controlados. Esta etapa não foi
  ensaiada com nova geração paga nem implantação de serviços.
