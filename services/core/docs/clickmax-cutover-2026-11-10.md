# Entrada do CRM na Bia Go — 10/11/2026

## Estado publicado

Workspace: Arkom. Pipeline: SDR · ARKOM.
Release: `r-631586c06df9`; esquema PostgreSQL 28.

Cinco automações antigas de entrada foram pausadas, sem excluir seu histórico:
Novo Lead, Reagendamento e Tentativas 1, 2 e 3. Foram substituídas pelas
automações `[ARKOM][Bia Go] <etapa> → SDR`, no grupo
`Bia Go · Entrada do CRM`.

Cada automação envia somente a identidade do card, contato e etapa para
`POST https://sdk.arkom.ai/webhooks/bia/leads`, com o token de entrada já
armazenado no ClickMax. Nenhuma dessas novas automações envia WhatsApp
diretamente. O remetente continua sendo o configurado no nosso backend.

```json
{
  "clickmax_card_id": "{{$trigger.cardId}}",
  "clickmax_contact_id": "{{$trigger.leadId}}",
  "clickmax_stage_id": "{{$trigger.stageId}}"
}
```

O backend verifica o card aberto, pipeline, etapa atual, contato único,
responsável e preferências de WhatsApp. Eventos antigos de outra etapa são
ignorados. Um card recém-criado em Novo Lead pode receber a abertura mesmo
com vendedor atribuído automaticamente, sem alterar esse vendedor. Cards
humanos antigos e os bloqueios de atendimento humano são preservados. Consentimento de
SMS não é inferido da autorização de WhatsApp.

O PostgreSQL serializa a entrada por telefone normalizado e por card, incluindo
a variação brasileira com/sem nono dígito. Um card produz uma única abertura.
Um atendimento existente mantém contexto, bloqueios, reserva e início da sua
cadência. A mudança de coluna não reinicia a abertura nem cria outra régua.

Uma reserva futura visível no card é verificada antes da entrada e encaminhada
ao worker de agendamento. Não se envia uma abertura de agendamento com base
em uma reserva de agenda não conectada.

## Exclusividade de mensagens

Configuração de produção:

- `BIA_CLICKMAX_BIA_ATTENDANT_ID`: atendente Bia SDR, verificada no workspace.
- `BIA_CLICKMAX_GO_TAG_ID`: `ARKOM · Bia Go · atendimento ativo`.

A marca de atendimento é aplicada somente depois da gravação durável da
entrada. Se essa marca falhar, a requisição retorna erro recuperável: a
repetição repara a marca e não gera outra abertura.

As réguas antigas de confirmação, remarcação, uma hora e na sala, assim como
Conectado/Buscando Horário, foram pausadas. Também foram pausadas as campanhas
antigas de prospecção/recuperação do SDR que ainda usavam outros números e o
piloto redundante. Os registros de saída/opt-out, notificações a vendedores,
integrações de agenda e fluxos alheios ao SDR foram preservados.

O único remetente WhatsApp do backend Go é `+5511936246321`, via Twilio.
Não reativar os fluxos antigos sem revisar as execuções retidas: elas podem
voltar a enviar ao serem retomadas. Mensagens já aceitas pelo provedor antes
da pausa ainda podem chegar; pausar a automação não recolhe essas mensagens.

## Evidências

- Suíte Go completa passou com PostgreSQL descartável em localhost.
- Teste de concorrência passou com 12 entradas do mesmo card: uma abertura.
- Teste com detector de corrida passou; repetição após erro na marca não
  enviou outra abertura.
- Mudanças reais do card de teste do Lisboa nas cinco etapas chegaram às
  cinco automações novas e terminaram com HTTP 202, `already_managed` e
  `duplicate: true`. Isso valida entrada e supressão de duplicidade para um
  contato existente; não representa uma nova submissão do formulário real.
- Responsável e etapa originais do card de teste foram restaurados.
- Workers, API e voz saudáveis após a publicação.

As validações dos fluxos não apontaram passos soltos, destinos inexistentes,
canais incompletos ou ausência de gatilho. Os avisos de fim de caminho e de
ramo vazio são os encerramentos intencionais das chamadas/guardas.

## Agenda única aprovada em 10/11

O usuário aprovou centralizar as novas entradas na agenda existente do
workspace Arkom, sem recadastrar vendedores. A configuração nativa da agenda
foi salva com 45 minutos, mantendo os mesmos 12 membros, calendários e pesos
do rodízio. Foram comparadas 45 reservas anteriores: nenhum início/fim mudou.

As páginas `/agendar-reuniao` e `/agendar-clickmax` usam agora o destino
`projeto-de-zambinati/call-estrategica-arkom`. O endereço antigo da página D
continua existindo para conservar links, prefill e sessões iniciadas.
A alteração foi publicada pelo PR 192 de `bilhon-business/bilhon-diagnostico`,
merge `b5ad442d83a047e0b5edad372e0c82c9f0231594`, deploy `42920561906`
concluído. Os dois endereços de produção foram verificados após o deploy.

No caminho novo, T14/T19 (preferência), T17 (sobreposição) e coletiva não
interceptam a reserva. O ClickMax confirma a reserva; o evento nativo dessa
agenda chama o Go, que verifica a identidade, preferências de WhatsApp e
pedidos de saída, grava o trabalho e marca o contato antes de responder.
A régua nova não depende do campo customizado SIM; a preferência de canal
consultada no ClickMax continua obrigatória. Eventos autenticados com uma
reserva explícita também aceitam origem CRM/automação após verificar sua
identidade; o importador amplo continua restrito a reservas públicas.

### Validação real após a publicação

Duas reservas públicas novas entraram pelo evento nativo, receberam HTTP 202
e foram importadas uma vez pelo worker. Ambas têm 45 minutos: finais de
telefone 4158 (Clarice) e 5572 (Eduardo). Os dois contatos estão com owner
`go` e etapa `booked`, e os lembretes de cada reserva estão pendentes nos
horários calculados. A confirmação redundante foi suprimida com
`covered_by_form_opening`, preservando uma única abertura de confirmação.

A consulta direta à Twilio confirmou remetente `whatsapp:+5511936246321`,
confirmação lida para 4158 e entregue para 5572. Para 5572, o complemento da
abertura e o vídeo foram posteriormente bloqueados pela Meta (`63049`):
restrição de entrega de modelos de marketing. Não repetir imediatamente nem
trocar de remetente para contornar o bloqueio. Isso não cancela a reserva.
O estado local `sent` significa aceitação inicial; consultar o estado final
no provedor antes de afirmar entrega ao destinatário.

O registro operacional final, sem credenciais, está em
`.local/clickmax/agenda-cutover-final-2026-11-10.json`.

A agenda de outro workspace, `outlier-hub/clickmax-acelerador`, não foi
alterada nem teve reservas canceladas. A chave adicional fornecida também
acessava Arkom, por isso não configura uma segunda agenda Bilhon. Ela não
é necessária para o caminho centralizado.

Validação da página: build aprovado, 143 testes relacionados e três provas
em Chromium com o SDK público atual aprovados (token de sessão, mudança de
fuso com dados preservados e prefill sem submit). As quatro falhas da suíte
geral também ocorrem na base main sem alterações: uma de oferta T21 e três
de atribuição de visita. Não pertencem a esta mudança de agenda.

Os IDs operacionais sem segredos estão em
`.local/clickmax/bia-go-stage-cutover.json`.
