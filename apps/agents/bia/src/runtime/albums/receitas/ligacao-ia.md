# Ligação por IA no WhatsApp

Use esta receita quando o cliente pedir para construir a skill. Mantenha a biblioteca como referência e preserve a navegação, a sessão e a identidade visual do Remix. Monte apenas os controles que a empresa pediu. Use `src/VoiceConsole.tsx` como referência de comportamento e `platform-openapi.json` como contrato.

## Antes de desenhar

Combine com a empresa o objetivo da ligação, a abertura, os assuntos autorizados, quando a equipe assume e se a interface deve ter teste próprio, ligação a partir de uma conversa ou ambos. Se houver um playbook de profissão, leia a ficha correspondente antes de propor texto ou campos.

## Integração

Use a sessão do usuário e o cliente HTTP existente em `src/api.ts`, com o backend Go da Arkom em `https://sdk.arkom.ai/sdr-next`. Envie o Bearer da sessão apenas para a Arkom. A empresa é determinada pelo servidor. Para uma nova origem do Remix, confirme a autorização da origem com a Arkom se o navegador bloquear a API.

| Etapa | API e comportamento |
|---|---|
| Ler capacidade | `GET /v1/sdr/voice`. Use `available`, `configured`, `enabled`, `can_configure` e `revision`. Com `available: false`, mostre “Ainda indisponível neste ambiente”. |
| Salvar | `POST /v1/sdr/voice/config` com `expected_revision`, `account_sid` (AC), `sender_sid` (XE), `template_sid` (HX), `profile`, `test_phone` opcional em E.164, `twilio_auth_token` e `openai_api_key` próprios da empresa. Exija os segredos no primeiro cadastro. Depois, omita os campos vazios e só envie novas chaves quando a empresa as substituir. |
| Perfil | `profile` inclui `name`, `greeting`, `instructions`, `model`, `voice` e `max_seconds`. Use os limites e opções do contrato e da tela de referência. Nome até 80 caracteres, saudação até 400, instruções até 4.000, duração de 30 a 300 segundos. Use valores existentes para controles avançados que não estejam visíveis. |
| Configurar Twilio | Exiba apenas ao administrador as URLs `messaging_webhook` e `voice_webhook` retornadas pelo backend. A empresa as configura como POST no remetente WhatsApp e na TwiML App, respectivamente. Requer remetente ativo com a TwiML App vinculada e template nativo Voice Call Request aprovado, sem variáveis. |
| Validar ou desativar | `POST /v1/sdr/voice/activate` e `POST /v1/sdr/voice/disable`, com a `expected_revision` atual, só para administrador. Salvar mudanças requer nova validação. Em conflito de revisão, releia e preserve o rascunho local para a pessoa conferir. |
| Solicitar | `POST /v1/sdr/voice/calls` com `Idempotency-Key` e exatamente um corpo: `{"test":true}` para administrador com número próprio configurado, ou `{"conversation_id":"…"}` para administrador/operador em conversa WhatsApp autorizada e com automação ativa. Use a mesma chave e o mesmo corpo para confirmar um envio de resultado incerto. Não faça chamadas ao abrir a tela. |
| Acompanhar | `GET /v1/sdr/voice/calls` e `GET /v1/sdr/voice/calls/{id}`. HTTP 202 significa solicitação na fila. Traduza os estados reais, incluindo aguardando aceite, chamando, em ligação, concluída, recusada, expirada, ocupada, sem resposta, falha e resultado incerto. Mostre o erro acionável retornado pelo servidor. |
| Controle humano | Reutilize a tela de Conversas e a ação existente de assumir atendimento. A tomada de controle invalida pedidos e interrompe uma chamada vinculada à conversa. O teste avulso usa um número próprio e não fica associado a uma conversa. |

## Regras de interface

- Deixe credenciais em uma área administrativa. Use campos de senha e limpe os valores ao terminar a solicitação. Envie-os exclusivamente ao backend Arkom por HTTPS, sem gravar em storage do navegador, console, telemetria, fonte ou chat do Lovable. Mantenha a chave da voz separada da usada para texto.
- A conversa de voz depende do aceite nativo ou de permissão permanente confirmada pelo provedor. A interface nunca simula consentimento ou dispara chamadas diretamente na Twilio.
- O histórico da voz contém estados e falhas. Uma ligação concluída não prova confirmação de consulta ou reunião. O recurso não retorna gravação, transcrição ou resultado comercial estruturado.
- Preserve a mesma arquitetura do Remix. Chame somente contratos existentes da Arkom. Se faltar uma capacidade, mantenha o passo na equipe e descreva a integração necessária. Não crie backend paralelo, banco adicional ou proxy de credenciais.
- Valide a tela com dados fictícios e testes sem efeitos. Só dispare uma ligação real quando um administrador solicitar o teste para um número que controla.

[Documentação da Twilio](https://www.twilio.com/docs/voice/whatsapp-business-calling)
