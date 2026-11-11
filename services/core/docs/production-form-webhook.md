# Integração da página com a Bia

Use `POST https://sdk.arkom.ai/webhooks/bia/leads` no backend da página, depois da validação e do cadastro do lead no ClickMax. Se a página também confirmar uma reunião no ClickMax, envie o cadastro à Bia depois dessa confirmação. Use o mesmo telefone e e-mail nos dois sistemas.

## Formulário atual do diagnóstico Bilhon

O código público de `diagnostico.bilhon.com` envia o cadastro para `POST /lead` e as respostas seguintes para `PATCH /lead` no Worker Cloudflare `funil-aplicacao-porta`. Quando a agenda individual do ClickMax confirma uma reserva, a página recebe `scheduledCallId` e já avisa o Worker em `POST /booking-touch`, com o ID da reserva e, quando disponível, o identificador da sessão do lead. As respostas intermediárias do formulário não disparam a régua de reunião.

Conecte a Bia no servidor, depois de associar o cadastro final à reserva confirmada. O evento **Reunião agendada** do ClickMax pode acionar o processamento se o aviso do navegador falhar. Os dois sinais devem convergir no mesmo `clickmax_booking_id`. Envie ao Go o consentimento registrado e os dados do cadastro identificado. Preferências de horário sem reserva confirmada e reservas de outras agendas ficam fora dessa integração.

O ClickMax continua responsável pelo CRM, pela disponibilidade e pela reserva. O SDR Go recebe o cadastro, acompanha alterações na reunião e decide quando enviar a confirmação e os lembretes. A Twilio entrega o WhatsApp e as ligações por IA do número da Bia.

O fluxo **[ARKOM][Bia Go] Diagnóstico confirmado → SDR** está publicado no ClickMax para a agenda **Diagnóstico de IA + 1 Sistema de IA Grátis**. A página de agendamento oferece o campo opcional **Informação adicional**. A instrução pede que o cliente digite `SIM` para receber pelo WhatsApp da Arkom confirmações e lembretes das reuniões que agendar. O campo de CRM é `bia_whatsapp_booking_opt_in`. A página permite confirmar a reunião com o campo em branco.

A automação chama o Go quando o campo corresponde a `SIM` e o contato não tem a etiqueta **optout-whatsapp**. A etapa HTTP encaminha o ID da reserva, nome, telefone e e-mail. Desde 9 de novembro de 2026 às 15h04 em Cuiabá, a rota se aplica aos contatos elegíveis da agenda. A etiqueta de autorização deixou de ser necessária. As quatro automações anteriores usam a condição inversa e mantêm a cobertura de quem já estava na régua anterior e de quem não escolheu receber pela Bia Go. A separação no ClickMax usa o campo do contato. No Go, a reserva continua sendo identificada pelo ID da reunião.

Ao conferir uma nova reserva, verifique que o ClickMax salvou o `SIM`, o webhook aceitou o ID e a Twilio entregou a confirmação. Confira o caso em branco, o aviso no horário da reunião e a remarcação. Reenvie falhas temporárias com o mesmo ID da reserva e revise falhas definitivas antes de fazer outro envio.

Durante a migração, defina quem envia a régua por reserva. Use o piloto para validar antes de transferir novos agendamentos. Depois da transferência, em caso de erro temporário ou de resposta perdida, reenvie a mesma reserva ao Go com o mesmo ID. Acionar a régua antiga como alternativa imediata pode duplicar um envio já aceito pelo Go.

## Configuração do backend

| Variável | Valor |
| --- | --- |
| `BIA_WEBHOOK_URL` | `https://sdk.arkom.ai/webhooks/bia/leads` |
| `BIA_INTAKE_TOKEN` | Chave de cadastro de produção, compartilhada por canal privado |

Guarde a chave no ambiente do servidor. O navegador envia o formulário para o próprio backend da página. O backend faz a chamada à Bia com estes cabeçalhos:

```http
Content-Type: application/json
Authorization: Bearer <BIA_INTAKE_TOKEN>
Idempotency-Key: <ID estável e único deste cadastro>
User-Agent: Arkom-Intake/1.0
```

Gere o ID uma vez e reutilize o mesmo ID e os mesmos dados em todas as tentativas do mesmo cadastro, inclusive após falha de rede. Um UUID é suficiente.
O `User-Agent` acima funciona para chamadas de servidor. Se usar `urllib` em Python, configure-o explicitamente: o agente padrão dessa biblioteca foi bloqueado na borda.

```json
{
  "name": "Ana Exemplo",
  "phone": "+5565999999999",
  "email": "ana@example.com",
  "company": "Empresa Exemplo",
  "revenue": 5000,
  "goal": "Melhorar o atendimento",
  "timezone": "America/Cuiaba",
  "consent": true,
  "sms_consent": false
}
```

`name`, `phone` e `consent` são obrigatórios. Envie `phone` no formato internacional e `consent: true` quando a pessoa autorizar o contato pelo WhatsApp. O SMS usa uma autorização separada. Envie `sms_consent: true` somente quando essa opção for marcada. `revenue` é um número inteiro opcional, com `0` para ausência de faturamento e `null` ou omissão quando não informado.

## Reserva confirmada pelo ClickMax

Na automação **Reunião agendada**, envie também `clickmax_booking_id` com o ID da reunião (`{{$trigger.scheduledCallId}}`). O Go verifica na API do ClickMax a reserva futura, a agenda e o telefone informado. Uma reserva nova precisa ter sido criada pelo agendamento público da agenda configurada. O Go acompanha esse ID mesmo se a oportunidade mudar de quadro. Use o consentimento registrado pelo formulário de origem. O gatilho de agendamento, por si só, não substitui esse campo.

Nesse modo, a Bia usa o ID da reunião como chave de idempotência e espera a importação da reserva antes de enviar a abertura. Se a mesma reserva já estiver vinculada ao lead, a resposta é `202` com `status: booking_already_linked` e o evento não cria outro envio. Um `409` indica que os dados da reserva não batem ou que ela não pertence ao fluxo habilitado.

## Segunda agenda do ClickMax

O suporte ao **Diagnóstico de IA – Time Bilhon** usa a chave do workspace Bilhon em `BIA_CLICKMAX_BILHON_API_KEY`, o UUID da agenda em `BIA_CLICKMAX_BILHON_SCHEDULE_ID`, um corte RFC3339 em `BIA_CLICKMAX_BILHON_SINCE` e um token exclusivo em `BIA_CLICKMAX_BILHON_INTAKE_TOKEN`.

O workflow de **Reunião agendada** da Bilhon deve filtrar essa agenda e a autorização explícita para o WhatsApp. Envie `clickmax_calendar: "bilhon"` junto de `clickmax_booking_id`, os dados de contato e `consent: true`. Use o token exclusivo da Bilhon. O Worker de Agendamento verifica a reserva com a chave do workspace certo e guarda esse vínculo para consultas, remarcações e cancelamentos. A mesma reserva continua sendo deduplicada pelo UUID.

A coluna **Novo Lead** usa o webhook de cadastro sem campos de reserva, com chave estável por entrada autorizada. **Tentativa 1** registra o primeiro envio. **Tentativas 2 e 3** refletem os follow-ups enviados pelo Go, e **Reagendamento** reflete a falta registrada. A régua do Go deve ser a única responsável pelos envios dos contatos migrados. Na troca, separe os contatos pelo filtro de consentimento e responsabilidade antes de substituir a automação antiga.

## Respostas e troca do fluxo

| HTTP | Significado |
| --- | --- |
| `202` | Cadastro aceito e atendimento enfileirado. `duplicate: true` confirma que a mesma submissão já foi recebida. |
| `400` / `422` | JSON inválido, campo inválido ou autorização ausente. Corrija os dados antes de reenviar. |
| `401` | Confira a chave privada e o cabeçalho `Authorization`. |
| `409` | O ID já foi usado com dados diferentes. Verifique o cadastro original. |
| `503` | Reenvie com espera progressiva, o mesmo ID e os mesmos dados. |

Na página, a confirmação pode dizer “Cadastro recebido. A Bia vai falar com você pelo WhatsApp.” O `202` confirma a fila, e a entrega é processada em seguida. A Bia conversa e agenda pelo WhatsApp. Se o lead já tiver uma reserva na agenda conectada, o worker importa a reunião e programa os lembretes. A chamada de cadastro não cria uma segunda reserva.

Antes de abrir o tráfego, confira um cadastro controlado da página até o WhatsApp e o quadro **SDR · ARKOM**. Aponte os novos cadastros para a Bia e retire esses mesmos contatos do disparo inicial e dos follow-ups do n8n. Mantenha os atendimentos anteriores no fluxo que já é responsável por eles.
# Entrada por etapas do ClickMax

Além do corpo do formulário, o mesmo endpoint recebe os campos
`clickmax_card_id`, `clickmax_contact_id` e `clickmax_stage_id` com o token
primário de entrada. O servidor consulta os dados atuais no ClickMax; não
aceita o telefone ou consentimento do corpo como evidência nesse modo.
As etapas admitidas são Novo Lead, Reagendamento e Tentativas 1, 2 e 3.

O processamento retorna `contact_queued` para um novo atendimento,
`already_managed` para um card/contato já assumido ou `ignored` com o motivo
quando a etapa mudou, há responsável humano, saída do WhatsApp ou bloqueio.
Mudanças de etapa não reiniciam a mensagem de abertura. Veja a situação
publicada e as pendências em `clickmax-cutover-2026-11-10.md`.

