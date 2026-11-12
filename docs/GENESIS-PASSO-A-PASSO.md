# Construção por etapas e traces

O Genesis inicia apenas o planejamento quando recebe uma ideia ou melhoria.
O cliente vê quatro passos no estúdio, com critérios e estados associados aos
traces salvos. Ao terminar um passo, a construção fica em `awaiting_step`.
**Iniciar próxima etapa** autoriza somente o passo seguinte. Falhas, cancelamentos
e reinícios permitem **Retomar esta etapa**, conservando arquivos e histórico.

Esta entrega controla as quatro fases existentes. O planejamento deve delimitar
uma primeira entrega pequena e registrar em `DESIGN.md` o que fica para depois.
A divisão dinâmica de um produto em várias entregas funcionais será um incremento
posterior; os passos atuais são fases de trabalho, não uma estimativa percentual.

| Passo | Escopo | Evidência necessária para concluir |
| --- | --- | --- |
| Planejar | `DESIGN.md`, `README.md`, `application.json` | Plano existente e manifesto válido |
| Construir backend | Go, testes, manifesto e README | Testes Go finais aprovados no executor |
| Construir interface | HTML/CSS/JS, manifesto e README | `frontend/index.html` existente; revisão ainda pendente |
| Validar entrega | Correções dentro da entrega delimitada | Contrato completo válido, testes finais aprovados e contrato selado |

Planejamento não escreve implementação nem executa código. Backend e interface
não podem escrever os arquivos da outra fase. O revisor pode corrigir ambos.
Os arquivos reservados ao host continuam protegidos. Cada execução tem limites
de rodadas e tempo. Os testes e as correções dentro de um passo são automáticos;
a transição para outro passo depende do cliente.

## A mesma fonte para progresso e histórico

O host atribui `step_id` e `execution_id` a cada trace. O modelo não escolhe esses
identificadores nem declara o passo concluído diretamente. `step.started`,
`step.completed`, `step.failed`, `step.cancelled` e `step.interrupted` representam
transições persistidas. Leituras, escritas, rejeições e testes carregam a mesma
identidade da etapa e tentativa.

A lista de passos é uma projeção desses eventos, calculada pelo servidor. Ela
inclui estado, quantidade de traces e primeira/última sequência. Não existe
contador de progresso local, avanço por tempo ou conclusão baseada só no resumo
do agente. Clicar em um passo abre o histórico filtrado pelo `step_id`; o controle
**Ver todos os traces** restaura o histórico completo.

O checkpoint exige o trace final `agent.finished` da mesma etapa e tentativa.
O checkpoint e o trace de conclusão são gravados na mesma transação. A evidência
contém o digest dos arquivos, sua quantidade e o critério da fase. Uma falha de
persistência não publica o checkpoint nem sinaliza sucesso pelo SSE. Se o serviço
reiniciar durante uma execução, preserva os arquivos e grava `step.interrupted`.
Ele não chama o provedor automaticamente. Tentativas antigas não podem escrever
nem finalizar uma tentativa nova.

## API e compatibilidade

Novas construções têm `steps_version=1`. O resumo HTTP/SSE inclui `steps` e
`next_step_id`. O pedido inicial permanece `POST /construction` e executa apenas
`architect`. A retomada usa a sessão existente:

```http
POST /v1/sdr/genesis-demo/construction/{id}/advance
Content-Type: application/json

{"step_id":"backend","sequence":12}
```

A sequência deve corresponder ao último trace do checkpoint que o cliente leu.
O servidor rejeita salto de etapa, reenvio de checkpoint antigo, execução já ativa,
empresa diferente e perfil de visualização. O novo início grava um trace antes de
invocar o provedor. O estúdio reabre o SSE do mesmo projeto após esse início.
O projeto conserva ID, revisão, arquivos e traces entre os passos. Somente a revisão
final deixa o projeto `ready` e apto a iniciar o backend da prévia.

Construções anteriores continuam legíveis/exportáveis e não recebem progresso
inventado. Ao pedir uma nova versão delas, a nova construção usa as etapas.
O contrato, o runtime e suas restrições existentes permanecem aplicáveis.

## Verificação e próxima entrega

Os testes exercitam o fluxo inteiro com provedor controlado: planejamento sem
implementação, avanço explícito, evidências, autorização, rollback, reenvio,
falha de testes, retomada, eventos de tentativas antigas e recuperação após restart.
No Flutter, testes em 1280 e 390 px abrem os traces de um passo, filtram o histórico
e verificam que o tempo não avança as etapas. Nenhuma nova geração paga foi usada.

O próximo incremento do backend é a persistência de dados das aplicações. Deve
começar com uma entrega pequena e critério observável: salvar e recuperar um dado
com isolamento por empresa e aplicação. Banco, adaptadores e publicação não fazem
parte desta mudança.

A organização em marcos pequenos, critérios de conclusão e validações se inspira
na [documentação oficial da OpenAI](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex).
As quatro fases e os checkpoints descritos aqui são decisões do Genesis; não são
um formato ou requisito de API da OpenAI.
