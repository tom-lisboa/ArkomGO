# Follow-up com mídia programada

Use esta ficha para montar um painel de retomada com mídia. Defina com a empresa qual conversa pode receber o conteúdo, qual arquivo enviar, se precisa de legenda, em que horário e quem aprova.

No SDR produto, este fluxo usa `media.send` no motor de Automações e Execuções. A cadência comercial da Bia interna, com lembretes de reunião, SMS e ligação, é uma integração separada. Mostre somente os canais e ações disponíveis na API do Remix.

## Conexão e execução

1. Use a sessão existente e `request` de `src/api.ts`, com a base `https://sdk.arkom.ai/sdr-next`. Leia `platform-openapi.json` e reutilize `src/platform-api.ts`, `src/media-flows.ts` e `FLUXOS-DE-MIDIA.md`.
2. Consulte `GET /v1/platform/capabilities`. Para envio no WhatsApp, verifique `media_automation.available` e `media_automation.whatsapp_enabled`. Se necessário, encaminhe o administrador à configuração do canal e das permissões.
3. O administrador publica um fluxo com `media.send` e as entradas `conversation_id`, `media_id` e, se necessário, `caption`. Respeite as regras de aprovação. Use uma mídia da empresa em `ready`: `POST /v1/sdr/media` prepara um arquivo multipart e `GET /v1/sdr/media/{id}` informa o estado. Áudio segue sem legenda.
4. Para programar, use `mediaFlows.create` ou `POST /v1/platform/executions` com `mode: "apply"`, `source: "published"`, `expected_configuration_version`, as entradas do fluxo e `not_before` em RFC 3339, futuro em até sete dias. Use o modo `preview` para teste sem envio e deixe `not_before` fora do preview. Preserve o corpo e a `Idempotency-Key` ao conferir um pedido incerto.
5. Leia `GET /v1/platform/executions/{id}` e `GET /v1/platform/executions/{id}/events`. Exiba `not_before` como o horário a partir do qual o processamento pode começar. Mostre aprovação, pausa, retomada ou cancelamento só quando retornados em `allowed_actions`. Use `POST /v1/platform/executions/{id}/actions` com revisão atual, motivo e idempotência.
6. Após a etapa devolver um `message_id`, acompanhe `GET /v1/sdr/conversations/{id}/messages/{message_id}`. Separe pedido em fila, envio confirmado ao provedor e envio incerto. Preserve a decisão da equipe antes de repetir um envio incerto.

O backend revalida as permissões e o estado da conversa antes da entrega. O painel reflete o resultado e mantém o histórico.
