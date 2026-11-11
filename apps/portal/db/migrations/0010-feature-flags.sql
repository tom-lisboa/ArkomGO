-- 0010-feature-flags.sql
-- ============================================================================
-- ALVO: schema `educacional` do banco central (auytmefqnuzbktyzcled).
--   NÃO toca `app_arkom`, NÃO toca `core`, NÃO altera nenhuma tabela existente.
--
-- OBJETIVO: fundação do sistema de créditos/entitlements — uma tabela de
-- feature flags LIDA EM RUNTIME, para que cada etapa da entrega possa ser
-- ligada/desligada no /admin sem rebuild e sem redeploy (as flags de hoje são
-- `NEXT_PUBLIC_*`, inlinadas no bundle → exigem `railway up` para mudar).
--
--   educacional.feature_flags
--     key        text        — identificador estável usado no código
--     enabled    boolean     — o interruptor (default FALSE: nasce desligada)
--     scope      jsonb NULL  — parâmetros da flag (ex.: {"policy":"..."})
--     updated_by text  NULL  — e-mail do admin que mexeu por último
--     updated_at timestamptz — carimbo da última alteração
--
-- ADITIVA e IDEMPOTENTE: só CREATE TABLE novo + RLS + grants + seeds com
-- ON CONFLICT DO NOTHING. Reaplicar não altera flags já configuradas e não
-- muda nenhuma contagem de linhas das 22 tabelas existentes.
--
-- SEGURANÇA (padrão da 0008/0009 BLOCO B): RLS ligado SEM policy — default-deny
-- para `anon`/`authenticated`; quem lê/grava é a role de runtime
-- `educacional_app`, que tem BYPASSRLS (BYPASSRLS **não** dispensa o GRANT de
-- tabela, por isso os GRANTs abaixo são explícitos mesmo com o default ACL do
-- schema já cobrindo tabelas novas). Sem sequence: a PK é o próprio `key`.
--
-- APLICAÇÃO: operador autorizado com direitos de OWNER (as roles de runtime
-- `educacional_app`/`arkom_app_login` NÃO fazem DDL — `has_schema_privilege
-- ('educacional_app','educacional','CREATE') = false`). Na prática: Management
-- API do Supabase (roda como `postgres`) ou psql com --single-transaction e
-- ON_ERROR_STOP.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------

create table if not exists educacional.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  scope jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

comment on table educacional.feature_flags is
  'Feature flags lidas em runtime pelo arkom-dash (src/lib/feature-flags.ts). Toggle em /admin/settings.';
comment on column educacional.feature_flags.scope is
  'Parâmetros opcionais da flag, em JSON (ex.: {"policy":"on_confirmation"}). NULL = sem parâmetro.';
comment on column educacional.feature_flags.updated_by is
  'E-mail do admin que fez a última alteração (texto livre; sem FK, para sobreviver a exclusão de perfil).';

-- ---------------------------------------------------------------------------
-- Segurança: RLS sem policy + revogação de anon/authenticated + grants
-- ---------------------------------------------------------------------------

alter table educacional.feature_flags enable row level security;

revoke all on table educacional.feature_flags from anon, authenticated;

grant usage on schema educacional to educacional_app;
grant select, insert, update, delete on table educacional.feature_flags
  to educacional_app;

-- ---------------------------------------------------------------------------
-- Seeds — TODAS desligadas. Nenhum comportamento do app muda ao aplicar esta
-- migration; cada flag é ligada manualmente no /admin quando a etapa
-- correspondente estiver pronta e validada.
-- ---------------------------------------------------------------------------

insert into educacional.feature_flags (key, enabled, scope) values
  -- Substitui o entitlement provisório `isPro = role === 'admin'` pelo
  -- entitlement real por perfil (planos + prazo + catálogo).
  ('entitlements_enabled',    false, null),
  -- Créditos em modo sombra: registra o que SERIA debitado no ledger, sem
  -- afetar a experiência do aluno. Roda antes do bloqueio, para conferência.
  ('credit_shadow_mode',      false, null),
  -- Créditos valendo: saldo insuficiente passa a impedir a confirmação.
  ('credit_blocking_enabled', false, null),
  -- Prazo de acesso valendo: entitlement vencido para de consumir
  -- (aluno continua logando e vendo catálogo/progresso — X1/X3).
  ('expiration_enforcement',  false, null),
  -- Política de débito. Fase 1 = `on_confirmation` (debita ao confirmar
  -- presença). Política futura = `on_participation` (debita quando o mentor
  -- marca presença), habilitada pela Tarefa 2.
  ('debit_policy',            false, '{"policy":"on_confirmation"}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rode depois de aplicar — esperado: 5 linhas, todas enabled=f)
-- ---------------------------------------------------------------------------
--
--   select key, enabled, scope, updated_by, updated_at
--     from educacional.feature_flags
--    order by key;
--
--   select count(*) as flags from educacional.feature_flags;   -- 5
--
-- ---------------------------------------------------------------------------
-- ROLLBACK (destrutivo apenas para esta tabela nova; nenhuma tabela existente
-- é tocada por esta migration, então não há nada mais a reverter). O código
-- degrada sozinho: `src/lib/feature-flags.ts` trata `42P01` como "todas as
-- flags desligadas" e o /admin/settings mostra o estado vazio.
-- ---------------------------------------------------------------------------
--
--   drop table if exists educacional.feature_flags;
--
-- ============================================================================
