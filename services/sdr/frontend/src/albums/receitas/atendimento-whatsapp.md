# Atendimento no WhatsApp

Use esta ficha para criar o painel de conexão e conversas. Combine com a empresa quem autoriza os contatos, quem pode assumir atendimentos e se o piloto deve ler áudios, imagens e PDFs.

## Conexão e permissão

1. Reutilize `request` de `src/api.ts` e a sessão existente, com base `https://sdk.arkom.ai/sdr-next`. Use `src/WhatsAppConnection.tsx`, `src/WhatsAppMessaging.tsx`, `src/LabApp.tsx` e `WHATSAPP.md` como referência. A empresa vem da sessão.
2. Leia `GET /v1/sdr/whatsapp` para conexão e pareamento. Em `POST /v1/sdr/whatsapp/connect`, use `{method:"qr"}`, `{method:"phone",phone}` ou `{method:"disconnect"}` conforme a ação autorizada. Envie `Idempotency-Key`; exiba QR ou código somente enquanto válido.
3. O administrador consulta ou salva `/v1/sdr/whatsapp/messaging`. No POST, envie `enabled`, `test_phones`, `media_enabled` se necessário, `expected_revision`, `reason` e `Idempotency-Key`. No piloto, limite a lista a três contatos autorizados, com DDI e DDD. Mostre a configuração aplicada quando `synced` for verdadeiro. A conexão do número e a ativação do atendimento são controles distintos.

## Conversas e equipe

1. Use `GET /v1/sdr/conversations`, `GET /v1/sdr/conversations/{id}` e `GET /v1/sdr/conversations/{id}/messages` para lista, estado e histórico. Preserve paginação e diferencie `channel: "whatsapp"` de `fake_whatsapp`.
2. Para assumir, pausar ou retomar, use `POST /v1/sdr/conversations/{id}/actions`, com `kind` igual a `takeover`, `pause` ou `resume`, revisão atual, motivo e idempotência. Use o estado retornado pelo backend. A tomada de controle é feita pelo painel.
3. Depois de assumir ou pausar, a equipe pode usar `POST /v1/sdr/conversations/{id}/messages` com `text` ou `media_id` conforme a permissão, revisão atual e idempotência. Mostre estados de entrega reais e peça conferência antes de repetir uma saída incerta. “Enviada” é confirmação do transporte, não leitura no celular.

O painel lê os estados da Arkom e envia apenas ações explícitas dos perfis autorizados. Os workers continuam cuidando de contexto, mídia e entrega.
