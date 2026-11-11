# Agendamento

Use esta ficha para criar uma tela de horários, reservas, remarcação e cancelamento. Pergunte quais agendas devem ser exibidas, qual o fuso, quais durações aceitar e quando a equipe precisa aprovar uma reserva.

## Conexão

Reutilize `request` de `src/api.ts` e `calendars` de `src/calendar-api.ts`. A base é `https://sdk.arkom.ai/sdr-next`, com o Bearer da sessão existente. A API identifica a empresa pela sessão. Consulte as rotas de agenda em `platform-openapi.json`.

A captura mostra a implementação em homologação, com dados fictícios. Comece com `GET /v1/sdr/calendar/capabilities`. Mostre “Agendamento ainda indisponível neste ambiente” quando retornar 404 ou `enabled: false`. Habilite a conexão Google na interface somente quando a API retornar `google_configured: true`.

## Fluxo

1. Use `GET /v1/sdr/calendar/calendars` para listar agendas ativas. Mostre opções de acordo com as permissões da sessão e use `GET /v1/sdr/calendar/bookings` para a lista de reservas. Administração de agendas e aprovações exigem perfil administrador.
2. Para buscar horários, chame `POST /v1/sdr/calendar/requests` com `kind: "availability"`, `calendar_ids`, `mode` (`any` ou `all`), `from` e `to` em RFC 3339, `duration_minutes` e `conversation_id` quando aplicável. Acompanhe `GET /v1/sdr/calendar/requests/{id}` até o resultado. Apresente `result.slots` com o horário e fuso retornados.
3. Para reservar a opção escolhida, envie `kind: "book"`, o `availability_id` da consulta e o `slot_id` devolvido pelo backend. Preserve `conversation_id` quando a reserva pertence a um contato. Para remarcar, consulte novamente com `booking_id` e `expected_revision`, depois use `kind: "reschedule"` com a opção e a revisão da reserva. Para cancelar, use `kind: "cancel"` com `booking_id` e `expected_revision`. O horário anterior permanece válido durante a remarcação até o resultado.
4. Envie `Idempotency-Key` na criação de pedidos e preserve a mesma chave e corpo ao conferir um resultado incerto. Mostre `queued` e `waiting_approval` como pendências. Mostre reserva confirmada somente com `confirmed`. Se a opção expirar ou ficar indisponível, peça nova consulta. Em `uncertain`, mostre a necessidade de conferência e use a ação `reconcile` quando autorizada. A rota `POST /v1/sdr/calendar/requests/{id}/actions` recebe `{action}` com `approve`, `cancel` ou `reconcile`, conforme o estado e o perfil.

O backend valida horários e conclui a operação. O painel monta a experiência e exibe os estados reais da agenda.
