# Runbook — e-mail de acesso (definir/trocar senha)

Quem envia os e-mails de acesso do Arkom não é o app: é o **Auth do Supabase
central** (`auytmefqnuzbktyzcled`). O app só pede o envio
(`sendCentralPasswordSetupEmail` em `src/lib/central-auth.ts`), a partir de
três telas:

- `/admin/students` — botão de envelope na linha do membro (reenviar acesso);
- `/admin/students` — criação de usuário e importação por CSV;
- `/recuperar-senha` — o próprio aluno pedindo o link.

## Onde fica a configuração de envio

No projeto central, em **Authentication → SMTP Settings** (ou via Management
API, `PATCH /v1/projects/<ref>/config/auth`). Estado vigente:

| campo | valor |
| --- | --- |
| `smtp_host` / `smtp_port` | `mail.arkom.ai` / `587` (STARTTLS) |
| `smtp_user` / `smtp_admin_email` | `noreply@arkom.ai` |
| `smtp_sender_name` | `Arkom` |
| `rate_limit_email_sent` | `100` por hora (projeto inteiro) |
| `smtp_max_frequency` | `10` segundos entre envios ao MESMO endereço |

A **senha do SMTP não fica no repositório** — vive só na configuração do
projeto central. O domínio `arkom.ai` tem SPF, DKIM (`default._domainkey`) e
DMARC publicados, e o servidor de envio está dentro do SPF.

## Sintomas e o que significam

O motivo real do servidor sobe para a tela (toast do admin) — não existe mais
mensagem genérica de "não foi possível". A tradução está em
`friendlyEmailSendError`:

- **"aguarde Ns e tente de novo"** → `smtp_max_frequency`: dois pedidos para o
  mesmo endereço em menos de 10s. Passageiro, é só esperar.
- **"Limite de envio de e-mails do projeto central atingido nesta hora"** →
  estourou `rate_limit_email_sent`. Passageiro; se acontecer em rotina (ex.:
  importação grande de CSV), suba o teto no projeto central.
- **"O servidor de e-mail recusou o envio"** → falha no SMTP em si (host,
  usuário ou senha). Aí é configuração, não espera.
- **"A URL pública do Arkom não está configurada"** → `APP_URL` /
  `NEXT_PUBLIC_APP_URL` ausente ou não-HTTPS em produção. Sem ela o link do
  e-mail apontaria para o endereço errado, então o envio nem sai.

> Histórico: até 30/07/2026 o projeto central estava **sem SMTP próprio** e
> caía no mailer embutido do Supabase, com teto de **2 e-mails por hora**. Era
> a causa do report "Não foi possível enviar o e-mail pelo Supabase."
> (ClickUp 86ajrcy5c) — a partir do terceiro envio do dia, qualquer reenvio
> morria em 429.

## Conferindo um envio

O destino do link é `APP_URL/definir-senha`, e o endereço precisa estar na
allowlist de redirect do projeto central (`uri_allow_list`). Regressão do
fluxo: `e2e/reenvio-acesso-email.spec.ts` (com `E2E_CADENCIA=1` vira take de
vídeo; `E2E_EMAIL_REENVIO` aponta para uma caixa real).
