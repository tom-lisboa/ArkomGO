# LEDGER — Converter o arkom-dash para o banco central (`educacional` como superset)

> **Objetivo (ordem do dono).** Mesmo banco central `auytmefqnuzbktyzcled`, schemas diferentes.
> **Converter o arkom-dash para rodar no schema `educacional`** (onde vivem os **dados reais**), **incluindo no
> `educacional` tudo que o `app_arkom` tem a mais** — de forma **aditiva e compatível com o bilhon-ai que está
> vivo** (`app.arkom.ai` = bilhon-solutions/bilhon-ai), **sem perder dados**. O `educacional` vira o **superset**.
>
> **Isto é o PRIMÁRIO.** Fechar o loop do aluno é secundário (e `/mentorships` já está em andamento na branch `marcar-mentoria`).

## Fatos verificados no `educacional` AO VIVO (introspecção read-only, 2026-07-11)

- Role do `EDUCACIONAL_DATABASE_URL` = **`educacional_app`**: `BYPASSRLS=true`, `CANLOGIN=true`, **sem CREATE no schema**, dona de **0 tabelas**, sem `CREATEROLE`. → roda o app (bypassa RLS, modelo do bilhon-ai), **mas não faz DDL nem cria role**.
- Role dedicada do arkom (app_arkom) = **`arkom_app_login`** (membro de `arkom_runtime`, **NÃO** bypassrls) — TRACKING §log.
- `educacional.profiles` **faltam**: `preferred_theme`, `session_version`, `auth_identity_id` (+ objetos da 0007). **Não existe** `solution_previews`. **0 policies** no `educacional` (irrelevante: `educacional_app` bypassa RLS). `arkom_runtime` já existe (role global do cluster).
- **Dados reais presentes** (não perder): ex. `courses=8` (Claude Code 7 aulas, Lovable 17, HeyGen 5…), `apps=12`, `app_clicks=194`, `lesson_progress=3`, `lesson_ratings=2`, `event_confirmations=4`. `builder_*` já vivem no `educacional`.
- **Sem credencial privilegiada** em nenhum `.env` (só `service_role` do central, `arkom_app_login`/`educacional_app` limitados). → **a DDL no `educacional` é aplicada por operador autorizado** (Supabase SQL editor como owner) ou via connection string privilegiada que o dono fornecer.

## Decisões fechadas

| # | Decisão | Valor |
|---|---|---|
| D1 | Estratégia | **B — apontar o runtime do arkom-dash para `educacional`** (tabelas literais, sem cópia de dados). |
| D2 | Paridade | Adicionar ao `educacional` tudo que só existe no `app_arkom` (colunas + `solution_previews` + funções 0007), **aditivo e idempotente**. |
| D3 | Compatibilidade | A DDL **não pode quebrar o bilhon-ai vivo** (que escreve `auth_user_id` sem `auth_identity_id`) → trigger BEFORE que auto-preenche `auth_identity_id := coalesce(new.auth_identity_id, new.auth_user_id)` ANTES do CHECK. |
| D4 | Runtime role em `educacional` | Modo `educacional` aceita `educacional_app` (bypassrls) — pula checagens de `arkom_runtime`/policies/ownership; mantém a checagem das 16 tabelas + colunas obrigatórias. |
| D5 | Aplicação da DDL | **NÃO executar** contra prod sem OK/credencial do dono. Entregar o SQL pronto + instruções. |
| D6 | Dados | **Não copiar** dados do `app_arkom` (está vazio/demo). Os reais já estão no `educacional`. |
| D7 | Mídia | `educacional` usa bucket `bilhon-media`; parametrizar `MEDIA_BUCKET`. |
| D8 | Flip do runtime | Config, não código: env `ARKOM_RUNTIME_SCHEMA` (default `app_arkom`; `educacional` no corte). O flip do Railway PROD → `educacional` é go/no-go do dono. |

---

## BLOCO A — SQL de paridade (`educacional` vira superset) · entregar, **não aplicar** (D5)

### MIG-A1 · `db/migrations/00XX-central-parity.sql` (target: schema `educacional`)
Espelhar, no `educacional`, o que o `app_arkom` tem a mais. Ler as fontes em `db/migrations/`:
`0005-user-theme-preference.sql`, `0006-session-version.sql`, `0007-auth-identity-integrity.sql`, e a DDL de `solution_previews`.
Tudo `IF NOT EXISTS`/idempotente, **aditivo**, **compatível com bilhon-ai vivo (D3)**:

1. `alter table educacional.profiles add column if not exists preferred_theme text check (preferred_theme is null or preferred_theme in ('light','dark'));`
2. `... add column if not exists session_version integer not null default 1 check (session_version > 0);`
3. `... add column if not exists auth_identity_id uuid;` + backfill `= auth_user_id where null` + unique index parcial.
4. **Trigger BEFORE INSERT OR UPDATE** em `educacional.profiles` que faz `new.auth_identity_id := coalesce(new.auth_identity_id, new.auth_user_id)` — **antes** de adicionar o CHECK `profiles_auth_identity_consistent (auth_user_id is null or auth_identity_id = auth_user_id)`. (Assim os INSERTs do bilhon-ai continuam válidos — D3.)
5. Trigger `..._immutable` (só barra reatribuição de `auth_identity_id` já preenchido) + função `prevent_auth_identity_reassignment()` no schema `educacional`.
6. Função `educacional.set_central_arkom_claims(uuid,boolean,text,boolean,boolean)` (idêntica à do app_arkom, `security definer`, `search_path=''`).
7. `create table if not exists educacional.solution_previews (solution_slug text primary key, preview_url text, remix_url text, updated_at timestamptz not null default now());` (confirmar tipos com o uso em `src/app/admin/solutions/actions.ts` + `scripts/probe-solutions.mjs`).
8. Grants para a role de runtime (`educacional_app`) nos objetos novos (`solution_previews`) — bypassrls não dispensa GRANT de tabela.
9. **Cabeçalho** com o snapshot obrigatório de contagens do `educacional` (antes/depois) — ver `db/migrations/README.md`.

> **NÃO** criar roles nem policies (não é preciso: `educacional_app` bypassa RLS). **NÃO** tocar em dados.

---

## BLOCO B — Código: arkom-dash roda no `educacional` (implementar agora; typecheck+build 0 erros)

### MIG-B1 · Parametrizar o schema do runtime
- `src/lib/db.ts` `getSql()`: `search_path` vem de `process.env.ARKOM_RUNTIME_SCHEMA` (default `app_arkom`).
- **Remover prefixos `app_arkom.` hardcoded** nas queries (grep `app_arkom.` em `src/`) para tudo resolver por `search_path` (ex.: `INSERT INTO app_arkom.solution_previews` em `src/app/admin/solutions/actions.ts` → relativo). Objetivo: **SQL agnóstico de schema**.

### MIG-B2 · Parametrizar `ensureDatabaseReady()` (`src/lib/db.ts`) por modo
- Modo `app_arkom` (atual): mantém checagens de `arkom_runtime` + 16 policies + role não-bypassrls (intocado).
- Modo `educacional` (quando `ARKOM_RUNTIME_SCHEMA=educacional`): **aceita** role bypassrls (`educacional_app`), **pula** as checagens de `arkom_runtime`/policies/ownership; **mantém**: 16 tabelas + colunas obrigatórias de `profiles` (`auth_user_id, auth_identity_id, must_change_password, password_hash nullable, preferred_theme, session_version`) + função `set_central_arkom_claims`. Falhar alto se a paridade (BLOCO A) não foi aplicada.

### MIG-B3 · Mídia parametrizada
- `MEDIA_BUCKET` (env) — no modo `educacional`, `bilhon-media`. Garantir que `src/app/api/media/[...path]/route.ts` + `src/lib/media-storage.ts` leiam o bucket configurado, e que `cover_url`/`resource.url` do `educacional` (apontam p/ `bilhon-media`) renderizem.

### MIG-B4 · Builder cross-schema
- `getEducacionalSql()` continua válido; no corte, runtime e builder apontam pro mesmo `educacional`. Confirmar que não há colisão de pool/singleton.

---

## BLOCO C — Validação da migração

### MIG-C1 · Boot local no `educacional` (read-only; após BLOCO A aplicado)
Rodar local com `ARKOM_RUNTIME_SCHEMA=educacional`, `ARKOM_DATABASE_URL=<url educacional>` (educacional_app), `MEDIA_BUCKET=bilhon-media`:
- `ensureDatabaseReady()` passa; `/trainings`, `/admin`, `/home` mostram **dados reais** do `educacional` (8 cursos etc.);
- login `admin@bilhon.ai` / `aluno@bilhon.ai` (`bilhon123`);
- **prova de leitura** (não fazer writes destrutivos no `educacional`).

### MIG-C2 · Runbook + go/no-go do flip PROD
Documentar o flip do serviço Railway `arkom-dash` PROD → `educacional` (setar `ARKOM_RUNTIME_SCHEMA`, `ARKOM_DATABASE_URL`, `MEDIA_BUCKET`), snapshot/rollback (basta reverter as envs; `educacional` intacto). **Executar só com OK do dono.**

---

## BLOCO D — Loop do aluno (SECUNDÁRIO; agnóstico de schema; parte já em `marcar-mentoria`)

> Só depois da migração validar. Código dos writes é **agnóstico de schema** (roda no `app_arkom` OU `educacional`).
> Persistir interações que o admin já alimenta e que o dashboard/exports já leem.

- **PA-01** progresso/like/nota reais: `src/app/(aluno)/trainings/actions.ts` (novo) + `lesson-view.tsx` + `data.ts` (hoje hardcode `progress:0/completed:false/skills:[]`). Tabelas: `lesson_progress`, `lesson_likes`, `lesson_ratings`.
- **PA-02** materiais ao aluno (`lesson_resources` → aba Materiais).
- **PA-03** `course_access_logs` ao abrir curso/aula.
- **PA-04** release-gating (`release_type`/`release_after_days` vs `registered_at`).
- **PA-05** `/home` reativo (hoje mock) — padrão `bilhon-ai/inicio`.
- **PA-06** `/apps` reativo + `app_clicks` (hoje mock `SOLUTIONS`).
- **PA-07** `/mentorships` + `event_confirmations` — **já em `marcar-mentoria`**; só integrar/não duplicar.

---

## BLOCO E — E2E gravado (Playwright)

- **PE-01** Local: validar a **migração** ponta-a-ponta — arkom-dash rodando no `educacional` renderiza uma **solução/curso real** (ex.: Claude Code, 7 aulas) para `aluno@`; `/admin` read-only para `admin@`. **Read-only** no `educacional` (D6). `video: on`. Se o loop do aluno (BLOCO D) estiver pronto, gravar o write-loop **contra `app_arkom`** (schema demo seguro), não no `educacional`.
- **PE-02** Produção: `BASE_URL=https://arkom-dash-production.up.railway.app`, admin **READ-ONLY**. `--output=test-results-prod`, vídeos → `e2e/videos/`.

---

## BLOCO F — Segundo Cérebro (`/brain`) — DIFERIDO
- **PSC-01** aguarda direção do dono ("tem que virar outra coisa"). Sem mudança agora.

## Gotchas
1. **Compatibilidade com o vivo (D3):** o trigger BEFORE que auto-preenche `auth_identity_id` é o que evita quebrar o bilhon-ai ao ligar o CHECK. Testar mentalmente um INSERT do bilhon-ai (auth_user_id set, auth_identity_id null) → deve passar.
2. **Aditivo/idempotente:** `IF NOT EXISTS` em tudo; a migração roda no banco compartilhado — não apagar/alterar o que já existe.
3. **`educacional_app` bypassa RLS:** por isso o modo `educacional` não exige policies; a segurança vem dos guards `requireUser()`/`requireAdmin()` (iguais ao bilhon-ai hoje).
4. **Snapshot obrigatório** de contagens do `educacional` antes/depois (README das migrations) — provar zero perda.
5. **Não copiar** dados do `app_arkom` (vazio/demo). Fonte real = `educacional`.
