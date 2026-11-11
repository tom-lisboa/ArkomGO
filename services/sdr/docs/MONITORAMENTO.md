# Monitoramento dos workers · 0.11

O novo processo `-worker metrics` coleta eventos do piloto e mantém uma projeção em SQLite próprio. Não recebe OpenAI, banco do SDR, sessão WhatsApp nem permissão para executar tarefas. O painel global é da nossa operação: [Uso dos workers](https://24.199.100.186/sdr-next/v1/ops/metrics). O código de acesso interno é entregue separadamente e não entra no Remix.

## Definições

- **Ativação:** uma tarefa entregue com um novo identificador de tentativa. Polling sem trabalho, leitura de arquivo, consulta de status e repetição da confirmação não contam novamente.
- **Tarefa única:** trabalho lógico por empresa e worker; uma nova tentativa aumenta ativações, mantendo a mesma tarefa única.
- **Conclusão:** o coordenador aceitou o resultado. No worker WhatsApp significa confirmação de envio ao provedor; não afirma leitura no telefone.
- **Falha:** tentativa encerrada com erro. Cancelamento, prazo de tentativa expirado, espera por download e envio incerto têm resultados separados.
- **Sem conclusão:** houve atribuição sem resultado terminal registrado. O monitor não presume que o processamento terminou só porque passou algum tempo.
- **Worker de métricas:** conta seus lotes de eventos processados à parte. Não publica eventos sobre a própria coleta, evitando recursão; consultas vazias não aumentam lotes.

O filtro distingue atendimento real, conversas simuladas, preparação/fluxos sem conversa e preview. O mapa de calor cruza clientes e workers; a intensidade usa o maior valor visível. Ranking e totais usam ativações. Seletores usam o período móvel das últimas 24 horas, 7, 30 ou 90 dias.

## Sequências verificáveis

Cada tarefa informa as dependências conhecidas, nunca uma associação pela proximidade de horários:

- mídia recebida → contexto que inclui aquela mensagem;
- contexto → execução da resposta;
- execução da resposta → fluxo disparado por ela;
- etapa de fluxo → próxima etapa realmente executada;
- preparação da mídia → etapa `media.send` que usa o arquivo;
- execução/etapa → autorização final do envio WhatsApp;
- mídia preparada → envio manual daquele anexo.

Uma cadeia conta uma vez por tarefa final e caminho distinto de workers. Tentativas não multiplicam a cadeia; mídias paralelas com caminho equivalente não multiplicam um mesmo turno. Um arquivo reutilizado em dois envios pode aparecer em duas cadeias, pois existem duas tarefas finais. Preparações independentes também podem aparecer como uma cadeia de um worker. A cadeia mostra o percurso observado, incluindo tarefas ainda sem conclusão; não é uma contagem de conversas convertidas.

Dependências ausentes por recorte de período, retenção ou coleta anterior são marcadas como trecho parcial. A leitura do grafo limita-se às dez mil tentativas mais recentes no período; o painel informa o limite. Os contadores usam agregação SQL de todas as tentativas disponíveis, e não apenas o grafo. Há limites de apresentação de 200 clientes/workers e dez mil células; o aviso de limite também cobre esse caso.

## Persistência e isolamento

O coordenador grava os eventos na mesma transação que confirma a atribuição/resultado, em `worker_events` do banco separado do piloto. A indisponibilidade do worker de métricas não impede o atendimento. A integração é assíncrona: leitura de até 200 eventos por página, cursor durável, fonte identificada, versão de evento, identificadores idempotentes e validação antes de aplicar o lote. Reiniciar o coletor não duplica os totais. Trocar a fonte ou rebobinar o cursor é tratado como erro, sem misturar históricos.

Eventos contêm empresa, worker, tipo de tarefa, modalidade, IDs opacos de tarefa/tentativa, dependências, fase, resultado e horário. Não contêm conteúdo de conversa, nome de arquivo, telefone, token privado, prompt ou credencial. Os identificadores das tentativas usam hash; o token da concessão não é exportado.

Eventos de origem e tentativas projetadas têm retenção de 90 dias. A limpeza é gradual; se o coletor ficar sem ler além dessa janela, uma lacuna é explícita. Não se reconstitui uma ativação histórica sem registro. A coleta começa na instalação deste recurso. Resultados de tarefas anteriores sem evento de atribuição não criam ativações fictícias.

O feed `/internal/metrics/events` só aceita leitura com o token próprio do coletor. Esse token não autoriza claims, resultados de negócio ou ferramentas. O painel usa sessão interna distinta das sessões do cliente; nem um administrador de empresa ganha visão global. As consultas ao monitor são feitas fora da trava do atendimento. A API privada do coletor é somente leitura e não é publicada em porta externa.

## Extensão para novos workers

O evento versão 1 está no SDK em `pkg/sdrsdk/metrics.go`. Uma integração nova registra `metricStart` e `metricEnd` na transação de atribuição/resultado e informa as dependências verificáveis com `MetricJob`. Novos nomes de worker e tipos de tarefa aparecem nos agrupamentos sem alteração do painel. A origem é o coordenador autorizado, não eventos enviados pelo Lovable. Esta é a implementação do piloto com uma API e um coletor; ampliar volume/provisionamento comercial exige dimensionar armazenamento e consumidores, preservando o contrato do evento.

O worker original em Go, sua infraestrutura WhatsApp e o Supabase atual ficam fora desta instalação.
