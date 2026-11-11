# Mídia como capacidade do produto · contrato 0.10

O Remix inclui `src/media-flows.ts`, o cliente HTTP e o OpenAPI público. Nenhuma tela nova é obrigatória. O cliente pode pedir ao Lovable para criar um botão, uma condição, uma campanha ou outro fluxo e chamar nossa API. Vídeo MP4, áudio, imagem e PDF usam o mesmo motor de execução Go. O cliente escolhe o arquivo; esta capacidade não gera um vídeo por IA.

## O que o cliente pode criar

1. Preparar um arquivo com `POST /v1/sdr/media`, multipart `file`, Bearer da sessão do usuário e `Idempotency-Key`. Não há campo de empresa: a empresa vem da sessão. O arquivo não fica preso a uma conversa e pode ser reutilizado nas conversas da mesma empresa. Upload não envia.
2. Consultar `GET /v1/sdr/media/{id}` até `status=ready`. IDs de mídia recebida ou de outra empresa não são aceitos para envio. Anexos preparados pela rota antiga de conversa continuam restritos àquela conversa.
3. Criar uma ferramenta cujo `handler` seja `media.send`. O administrador escolhe `approval=always` ou `automatic`, quem pode aprovar e quais perfis podem executar o fluxo. A configuração segue as APIs existentes de rascunho, validação e publicação, com revisão, motivo e chave de idempotência. Sempre preservar as demais ferramentas/fluxos da empresa ao editar.
4. Na etapa do fluxo, vincular `conversation_id`, `media_id` e, opcionalmente, `caption` por entrada ou valor fixo. Saídas de etapas anteriores também podem fornecer mídia/legenda; a conversa de destino deve ser conhecida ao criar o pedido (entrada ou valor fixo). Nesta etapa, envios usam `solution=sdr`.
5. Chamar `POST /v1/platform/executions` com `mode=apply`, `source=published`, versão publicada esperada e as entradas declaradas. O gatilho é escolhido pelo cliente. Os gatilhos automáticos existentes da plataforma também podem executar a ferramenta, conforme as condições publicadas pelo administrador.
6. Para agendar o fluxo, incluir `not_before` em RFC3339 com fuso/UTC. Aceita data futura em até sete dias; o arquivo precisa continuar válido nessa data. A fila fica no Go e persiste após reinício. O horário é o início mínimo de processamento, não garantia de entrega naquele segundo. Aprovação `always` é solicitada quando o fluxo chega à etapa, inclusive em agendamentos.

`GET /v1/platform/capabilities` informa o handler, os limites e a disponibilidade da mídia. `available=true` significa worker configurado; `whatsapp_enabled=true` também exige ativação de mensagens e mídias pela empresa. A instalação desta capacidade não ativa canais, contatos ou regras automaticamente.

## Exemplo para o Lovable

Use `mediaWorkflowTemplate('video_boas_vindas', 'enviar_video', 'Vídeo de boas-vindas')` para construir uma definição inicial. A função somente retorna dados: não salva, publica nem envia. Junte ferramenta/fluxo ao rascunho existente e utilize `platform.configure`, com revisão atual, para salvar e publicar. O padrão exige aprovação; o administrador pode alterá-lo.

Depois que o fluxo estiver publicado e o arquivo preparado:

```ts
import {mediaFlows} from './media-flows';

// session é a sessão atual do usuário; nenhum segredo de provedor no Lovable.
const {execution} = await mediaFlows.create(session, {
  workflowId: 'video_boas_vindas',
  conversationId,
  mediaId: arquivoPronto.id,
  caption: 'Aqui está a apresentação que você pediu.',
  configurationVersion: versaoPublicada,
  // notBefore: dataEscolhida.toISOString(), // opcional
}, chaveDestePedido);
```

Preservar chave e corpo em uma confirmação incerta da mesma solicitação. Um novo clique intencional usa outra chave. Não guardar o Bearer em configuração pública, código ou repositório. Uma integração externa sem sessão de usuário precisará de um contrato próprio de autenticação; não exponha os tokens privados dos workers.

## Acompanhar, aprovar e cancelar

`preview` executa a simulação e não cria mensagem. Em `apply`, acompanhar a execução e utilizar suas `allowed_actions` para aprovar, pausar, retomar ou cancelar enquanto houver etapas pendentes. O resultado de `media.send` contém `message_id`, `conversation_id`, `media_id`, `status=queued`, `sent=false`.

**Execução concluída significa pedido enfileirado.** Acompanhar a entrega com `GET /v1/sdr/conversations/{id}/messages/{message_id}` ou `mediaFlows.delivery`. `sent` confirma o envio ao provedor, sem afirmar leitura no aparelho. `uncertain` não permite repetição automática.

Depois de enfileirar, cancelar antes da autorização final com `POST /v1/sdr/conversations/{id}/messages/{message_id}/cancel`: enviar a revisão atual da conversa (`GET /v1/sdr/conversations/{id}`), motivo e chave de idempotência. A função `mediaFlows.cancelDelivery` faz essa chamada. Se o envio já começou, retorna `409 send_already_started`; cancelar um fluxo não recolhe mensagens já enviadas.

## Regras de execução e limites do piloto

A ferramenta automática exige conversa ativa. Uma conversa pausada/assumida continua sob controle humano; a rota de envio manual continua disponível para a equipe. O pedido captura a geração e a versão de entrada da conversa: uma nova mensagem, pausa, opt-out, mudança de configuração/negócio ou revogação do canal pode invalidar um envio pendente. Pausar e depois retomar não ressuscita um agendamento anterior. O cliente deve conferir o estado atual e criar um novo pedido se ainda quiser o envio. O gateway verifica a autorização novamente depois de preparar o upload e antes de enviar; uma mensagem já autorizada pode concluir.

As mídias têm até 8 MB, vídeo MP4 H264/AAC até três minutos e legenda até mil caracteres; áudio não aceita legenda. O worker de mídia normaliza o arquivo, o worker de execução solicita o envio e o gateway Go usa a sessão WhatsApp da empresa. Credenciais, armazenamento, contexto e execução permanecem no servidor. Não se baixa URL arbitrária enviada pelo navegador.

Continuam os limites atuais: duas empresas de teste, até três contatos WhatsApp autorizados por empresa, 30 preparações de mídia/hora/empresa, sete dias de validade por arquivo, 256 MB/500 arquivos por armazenamento, 1.000 registros de mídia no conjunto e 200 execuções por empresa. Não é disparo em massa nem provisionamento comercial automático. O cliente pode personalizar o produto dentro das capacidades e permissões do contrato; novos recursos de backend entram como novas capacidades da plataforma.

Nada desta etapa altera o SDR Go original, a Lumi original ou o Supabase atual.
