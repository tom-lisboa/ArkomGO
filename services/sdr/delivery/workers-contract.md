> Atualização 0.8: o mesmo processamento atende o WhatsApp real de texto para contatos de teste autorizados. O transporte e os limites estão em docs/WHATSAPP.md; referências abaixo a entrega simulada descrevem a fase anterior.

# Workers do piloto — etapa 0.6

Dois processos novos, independentes do SDR operacional: `sdr-next-context` e `sdr-next-execution`. Usam o SDK local `pkg/sdrsdk` para o contrato com a API privada e a mesma versão de `openai-go/v3` já usada no SDR original: v3.89.0. A versão nova adapta os padrões do SDR; não importa o módulo operacional nem reutiliza seu banco, Redis, regras comerciais ou prompts de uma empresa como padrão global. Arquivos de origem e hashes: `workers-source-reference.json`.

## Fluxo implementado

1. A interface envia uma entrada de teste autenticada. A API grava mensagem e trabalho na mesma transação do banco exclusivo do piloto. O recebimento HTTP 202 não confirma resposta.
2. Contexto agrupa fragmentos após 5 segundos de silêncio, com fechamento máximo de 30 segundos. Reclama o trabalho com credencial própria e prazo de posse, monta uma janela limitada e entrega um snapshot identificado por empresa, conversa, versão de entrada, versão de negócio e impressão digital.
3. O servidor valida esse snapshot e publica uma execução durável. O executor só aceita contexto atualizado, com automação ativa e sem opt-out.
4. Execução usa Responses pelo SDK Go, com decisão estruturada e `store: false`. Reenvia o contexto preparado por nós; não usa Threads, Conversations ou `previous_response_id` como fonte de memória. A chave autorizada permanece num arquivo privado montado exclusivamente no executor, sem ir à interface, aos arquivos de Remix ou ao worker de contexto. Reutilização da chave do SDR original foi autorizada expressamente pelo usuário em 03/11/2026; a configuração original não foi modificada.
5. A proposta passa por validação no executor e novamente no servidor: ações fechadas, preços compatíveis com ofertas, referências de conhecimento permitidas e fatos com evidência numa mensagem do usuário. Existem verificações determinísticas de algumas alegações de execução indevida; elas não equivalem a uma avaliação semântica completa.
6. A normalização conserva valores explícitos — nome, empresa, ferramenta e quantidade — com a mensagem de origem, evitando guardar uma correção junto com o nome negado. Uma revisão limitada pode refazer a resposta quando repete pergunta sobre informação conhecida ou faz múltiplas perguntas.
7. No retorno, a API revalida posse, geração, entrada e versão do negócio antes de gravar resultado, memória, auditoria e saída. Nova mensagem, publicação ou pausa invalidam a geração anterior. Uma resposta desatualizada é descartada. Publicação com trabalho pendente prepara novamente os dados mais recentes, sem retomar uma conversa sob controle humano.
8. A saída aparece apenas no chat de teste. O gateway WhatsApp real continua separado; este executor ainda não recebe nem envia mensagens dos números pareados.

## Isolamento e persistência

A API privada escuta somente a porta 8081 da rede Docker interna, sem publicar porta no host nem criar rota no proxy. Contexto e execução têm credenciais distintas e não abrem diretamente o SQLite. O processo da API continua como único escritor do estado, com transação SQLite e auditoria. Os workers novos não recebem credenciais de Postgres, Redis ou outras integrações do SDR original.

Cada trabalho tem prazo de posse de 90 segundos e confirmação com a mesma identidade. Worker antigo não pode confirmar uma execução reclamada por outro. A confirmação repetida do mesmo resultado não cria outra mensagem. Falha temporária ao confirmar tenta persistir o mesmo resultado antes de gerar outra resposta.

Há limite de 3 tentativas por trabalho e 60 tentativas de execução por empresa/hora. Cada tentativa pode fazer uma chamada inicial ao modelo e uma revisão de qualidade. Esse limite não é um limite de gasto financeiro nem um teto de 60 chamadas ao provedor. O uso de tokens da chamada aceita e de sua revisão é registrado no resultado. Erros anteriores à aceitação podem consumir tokens e ainda não têm conciliação financeira.

Memória comercial é separada por conversa e empresa. Campos permitidos: nome, empresa do contato, segmento, vendedores, volume de contatos, ferramenta atual e objetivo. Guardam valor, mensagem de origem, sequência e validade de 90 dias; evidência mais antiga não substitui uma mais nova. São dados extraídos pelo modelo com verificação de origem, não fatos automaticamente aprovados por um humano.

A janela contém até 20 mensagens e 24 KB de histórico, mais o negócio e memória, com limite total de 56 KB de snapshot. Esses são limites de bytes/mensagens; não substituem orçamento preciso de tokens. Trabalho cujo turno atual não cabe na janela exige revisão humana, sem descarte silencioso de fragmentos. Mensagens incertas, canceladas ou ainda na fila não são apresentadas como já enviadas.

## Teste na interface e API

Em Conversas, Nova conversa de teste cria um contato fictício separado, sem telefone e sem efeitos no WhatsApp. Administradores e operadores podem criar; viewer é consulta. Limite do piloto: 40 conversas por empresa. A lista permite escolher uma conversa e acompanhar agrupamento, preparação, resposta e dados já conhecidos.

Novas rotas autenticadas:

- `POST /__test/ui/conversations` com `label` e Idempotency-Key: cria conversa fictícia da empresa da sessão.
- `GET /v1/sdr/runtime`: saúde dos dois workers e modo de teste.
- `GET /v1/sdr/conversations/{id}/runtime`: estado do processamento, memória e estatísticas da última execução da própria empresa. Não retorna credenciais nem tokens de posse.

As rotas internas dos workers não são aceitas pelo handler público. Controle humano, opt-out, papéis e contratos existentes continuam aplicados.

## Evidências e limites

- `workers-validation.json`: respostas reais e verificações de catálogo, extração de fatos, correção de nome, isolamento e pausa. Ver o resultado final desse arquivo; a primeira execução do teste revelou armazenamento excessivo de texto no campo nome e motivou a correção.
- `workers-local-validation.json`: testes, compilação e preservação dos arquivos originais.
- `workers-deployment.json` e `workers-context-fix.json`: atualização apenas dos serviços novos e comparação dos IDs/processos dos serviços protegidos.

Nesta etapa não foram incorporados os workers de mídia, agenda, follow-up e voz, a orquestração completa de especialistas nem todos os redutores comerciais do SDR original. O fluxo novo oferece texto, contexto, memória e ações de responder, encaminhar para humano e interromper contato. Handoff registra necessidade e sugere texto para a equipe; não afirma que um humano já recebeu uma notificação. O Remix continua a consumir a API central; provisionamento comercial de novos compradores e homologação de um Remix real no Lovable seguem pendentes.

Os testes não comprovam melhora de conversão. Qualidade real precisa continuar sendo medida por cenários e revisão de respostas. Memória com evidência literal não comprova, sozinha, interpretação semântica correta de todo dado. A hospedagem e o armazenamento continuam dimensionados para este piloto.

Referências oficiais: [Responses no SDK Go](https://developers.openai.com/api/reference/go/resources/responses/methods/create) e [gestão de contexto](https://developers.openai.com/api/docs/guides/conversation-state).
