-- 0011-entitlements-core.sql
-- ============================================================================
-- ALVO: schema `educacional` do banco central (auytmefqnuzbktyzcled).
--   NÃO toca `app_arkom`, NÃO toca `core`, NÃO altera nenhuma tabela existente.
--
-- OBJETIVO: o núcleo do sistema de créditos — planos, entitlements por perfil e
-- o ledger de créditos. É o alicerce das demais etapas (débito em mentoria,
-- prazo de acesso, rails por plano); nada aqui muda o comportamento do app
-- enquanto a flag `entitlements_enabled` (migration 0010) estiver desligada.
--
--   educacional.plans                — catálogo comercial de planos
--   educacional.plan_course_access   — cursos inclusos em cada plano (N:N)
--   educacional.profile_entitlements — o que CADA perfil tem direito, em três
--                                      dimensões: temporal (validade),
--                                      quantitative (créditos de mentoria) e
--                                      catalog (cursos liberados)
--   educacional.credit_ledger        — APPEND-ONLY. Todo movimento de crédito.
--
-- ⚠ REGRA DE OURO — NÃO EXISTE COLUNA DE SALDO EM LUGAR NENHUM.
--   Saldo de um perfil = SUM(delta) do `credit_ledger`. Qualquer correção é um
--   movimento novo (compensatório), nunca um UPDATE. A tabela é protegida por
--   trigger (UPDATE/DELETE/TRUNCATE levantam exceção) E por grant (a role de
--   runtime só recebe SELECT/INSERT).
--
-- ⚠ IDEMPOTÊNCIA DO LEDGER — cada movimento carrega uma `operation_key` com
--   índice ÚNICO. Repetir a mesma operação (retry de rede, duplo clique,
--   confirmar→desconfirmar→confirmar numa mentoria) NÃO duplica crédito: o
--   INSERT cai em ON CONFLICT DO NOTHING e o chamador recebe o movimento que
--   já existia.
--
-- ADITIVA e IDEMPOTENTE: só CREATE TABLE/INDEX/TRIGGER novos + RLS + grants +
-- seed/backfill com ON CONFLICT DO NOTHING. Rodar duas vezes seguidas produz
-- exatamente o mesmo estado e não muda nenhuma contagem das tabelas existentes.
--
-- SEGURANÇA (padrão 0008/0009 BLOCO B / 0010): RLS ligado SEM policy —
-- default-deny para `anon`/`authenticated`; quem lê/grava é a role de runtime
-- `educacional_app`, que tem BYPASSRLS (BYPASSRLS **não** dispensa o GRANT de
-- tabela, por isso os GRANTs abaixo são explícitos mesmo com o default ACL do
-- schema já cobrindo tabelas novas).
--
-- APLICAÇÃO: operador autorizado com direitos de OWNER — as roles de runtime
-- (`educacional_app`, `arkom_app_login`) NÃO fazem DDL. Na prática: Management
-- API do Supabase (roda como `postgres`).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. plans — o catálogo comercial
-- ---------------------------------------------------------------------------
--  duration_months    NULL = plano sem prazo (vitalício)
--  mentorship_credits NULL = mentorias ilimitadas; 0..N = cota
--  credit_period      'total' = a cota vale para todo o plano
--                     'month' = a cota é por mês de vigência
--  permissive         TRUE  = plano permissivo: acesso a TODO o catálogo,
--                     mentorias ilimitadas e sem prazo. É o que o plano
--                     "Legado" usa para preservar o acesso de quem já existia
--                     antes do sistema de créditos.
-- ---------------------------------------------------------------------------

create table if not exists educacional.plans (
  id integer generated always as identity primary key,
  slug text not null unique,
  name text not null,
  description text,
  duration_months integer
    check (duration_months is null or (duration_months >= 1 and duration_months <= 240)),
  mentorship_credits integer
    check (mentorship_credits is null or mentorship_credits >= 0),
  credit_period text not null default 'total'
    check (credit_period in ('month', 'total')),
  permissive boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  sort_order integer not null default 0,
  created_by integer references educacional.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_plans_sort on educacional.plans(sort_order, id);

comment on table educacional.plans is
  'Catálogo de planos do arkom-dash. Materializados por perfil em profile_entitlements.';
comment on column educacional.plans.duration_months is
  'Duração em meses. NULL = sem prazo (vitalício).';
comment on column educacional.plans.mentorship_credits is
  'Cota de mentorias. NULL = ilimitado. Nunca é saldo: o saldo vive no credit_ledger.';
comment on column educacional.plans.permissive is
  'Plano permissivo: catálogo inteiro + mentorias ilimitadas + sem prazo (plano Legado).';

-- ---------------------------------------------------------------------------
-- 2. plan_course_access — cursos inclusos no plano
-- ---------------------------------------------------------------------------
-- Plano permissivo NÃO precisa de linhas aqui: `permissive = true` já significa
-- catálogo inteiro (inclusive cursos criados depois do plano).
-- ---------------------------------------------------------------------------

create table if not exists educacional.plan_course_access (
  plan_id integer not null references educacional.plans(id) on delete cascade,
  course_id integer not null references educacional.courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, course_id)
);

create index if not exists idx_plan_course_access_course
  on educacional.plan_course_access(course_id);

comment on table educacional.plan_course_access is
  'Cursos inclusos em cada plano. Vazio + plans.permissive=true ⇒ catálogo inteiro.';

-- ---------------------------------------------------------------------------
-- 3. profile_entitlements — o direito, por perfil, em três dimensões
-- ---------------------------------------------------------------------------
--  kind = 'temporal'      → até quando o acesso vale (expires_at NULL = sem prazo)
--  kind = 'quantitative'  → direito a mentorias (o saldo em si está no ledger)
--  kind = 'catalog'       → quais cursos (via plan_course_access ou permissive)
--
--  source = 'plan'   → materializado a partir de um plano (exige plan_id)
--  source = 'manual' → concessão avulsa do admin: exige MOTIVO + AUTOR +
--                      CARIMBO DE HORA (CHECK abaixo torna as colunas
--                      obrigatórias nesse caso).
--
--  Um perfil tem no máximo UM entitlement ativo por dimensão (índice único
--  parcial) — é isso que torna o backfill reaplicável sem duplicar.
-- ---------------------------------------------------------------------------

create table if not exists educacional.profile_entitlements (
  id integer generated always as identity primary key,
  profile_id integer not null references educacional.profiles(id) on delete cascade,
  plan_id integer references educacional.plans(id),
  kind text not null
    check (kind in ('temporal', 'quantitative', 'catalog')),
  source text not null default 'plan'
    check (source in ('plan', 'manual')),
  status text not null default 'active'
    check (status in ('active', 'expired', 'revoked')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  granted_by integer references educacional.profiles(id),
  granted_by_label text,
  granted_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_entitlements_plan_ck
    check (source <> 'plan' or plan_id is not null),
  constraint profile_entitlements_manual_audit_ck
    check (
      source <> 'manual'
      or (
        reason is not null and btrim(reason) <> ''
        and granted_by is not null
        and granted_at is not null
      )
    )
);

create unique index if not exists uq_profile_entitlement_active_kind
  on educacional.profile_entitlements(profile_id, kind)
  where status = 'active';

create index if not exists idx_profile_entitlement_profile
  on educacional.profile_entitlements(profile_id);

create index if not exists idx_profile_entitlement_plan
  on educacional.profile_entitlements(plan_id);

create index if not exists idx_profile_entitlement_expires
  on educacional.profile_entitlements(expires_at)
  where status = 'active';

comment on table educacional.profile_entitlements is
  'Direitos por perfil em 3 dimensões (temporal/quantitative/catalog). Um ativo por dimensão.';
comment on constraint profile_entitlements_manual_audit_ck on educacional.profile_entitlements is
  'Concessão manual exige motivo, autor e carimbo de hora — auditoria não é opcional.';

-- ---------------------------------------------------------------------------
-- 4. credit_ledger — APPEND-ONLY. Saldo = SUM(delta).
-- ---------------------------------------------------------------------------
--  delta            +N concessão · -N débito · nunca 0
--  reason           categoria estável do movimento (código)
--  note             motivo em texto livre (OBRIGATÓRIO nas operações manuais)
--  ref              referência livre da operação (ex.: 'evento:45')
--  operation_key    CHAVE DE IDEMPOTÊNCIA (índice único). Ex.:
--                     'debit:evt=45:profile=2'  ·  'plan_grant:ent=311'
--  actor_profile_id quem fez (admin); NULL = o próprio sistema
--
--  profile_id usa ON DELETE RESTRICT de propósito: o ledger é registro
--  contábil e a exclusão de aluno no app é LÓGICA (status='deleted'), então
--  nada aqui é apagado por efeito colateral.
-- ---------------------------------------------------------------------------

create table if not exists educacional.credit_ledger (
  id bigint generated always as identity primary key,
  profile_id integer not null references educacional.profiles(id) on delete restrict,
  delta integer not null check (delta <> 0),
  reason text not null
    check (reason in (
      'plan_grant',    -- créditos concedidos ao materializar um plano
      'plan_revoke',   -- créditos retirados ao encerrar/trocar um plano
      'event_debit',   -- débito por confirmação/participação em mentoria
      'event_refund',  -- estorno (cancelamento do aluno ou do Arkom)
      'admin_grant',   -- concessão manual do admin (exige note + ator)
      'admin_revoke'   -- remoção manual do admin (exige note + ator)
    )),
  note text,
  ref text,
  operation_key text not null,
  event_id integer references educacional.mentorship_events(id) on delete set null,
  entitlement_id integer references educacional.profile_entitlements(id) on delete set null,
  actor_profile_id integer references educacional.profiles(id),
  actor_label text,
  created_at timestamptz not null default now(),
  constraint credit_ledger_manual_audit_ck
    check (
      reason not in ('admin_grant', 'admin_revoke')
      or (
        note is not null and btrim(note) <> ''
        and actor_profile_id is not null
      )
    )
);

create unique index if not exists uq_credit_ledger_operation
  on educacional.credit_ledger(operation_key);

create index if not exists idx_credit_ledger_profile
  on educacional.credit_ledger(profile_id, created_at desc);

create index if not exists idx_credit_ledger_event
  on educacional.credit_ledger(event_id)
  where event_id is not null;

comment on table educacional.credit_ledger is
  'Ledger append-only de créditos. Saldo = SUM(delta). Nunca UPDATE/DELETE: corrija com movimento compensatório.';
comment on column educacional.credit_ledger.operation_key is
  'Chave de idempotência (índice único). Repetir a operação não duplica o movimento.';

-- Append-only de verdade: nem o owner altera linha do ledger sem derrubar o
-- trigger antes. Correção = movimento compensatório.
create or replace function educacional.credit_ledger_append_only()
returns trigger
language plpgsql
as $credit_ledger_append_only$
begin
  raise exception
    'educacional.credit_ledger é append-only: % não é permitido. Registre um movimento compensatório (saldo = SUM(delta)).',
    tg_op
    using errcode = 'restrict_violation';
  return null;
end;
$credit_ledger_append_only$;

drop trigger if exists credit_ledger_no_update_delete on educacional.credit_ledger;
create trigger credit_ledger_no_update_delete
  before update or delete on educacional.credit_ledger
  for each row execute function educacional.credit_ledger_append_only();

drop trigger if exists credit_ledger_no_truncate on educacional.credit_ledger;
create trigger credit_ledger_no_truncate
  before truncate on educacional.credit_ledger
  for each statement execute function educacional.credit_ledger_append_only();

-- ---------------------------------------------------------------------------
-- 5. Segurança: RLS sem policy + revogação de anon/authenticated + grants
-- ---------------------------------------------------------------------------

alter table educacional.plans                enable row level security;
alter table educacional.plan_course_access   enable row level security;
alter table educacional.profile_entitlements enable row level security;
alter table educacional.credit_ledger        enable row level security;

revoke all on table educacional.plans                from anon, authenticated;
revoke all on table educacional.plan_course_access   from anon, authenticated;
revoke all on table educacional.profile_entitlements from anon, authenticated;
revoke all on table educacional.credit_ledger        from anon, authenticated;

grant usage on schema educacional to educacional_app;

grant select, insert, update, delete on table educacional.plans
  to educacional_app;
grant select, insert, update, delete on table educacional.plan_course_access
  to educacional_app;
grant select, insert, update, delete on table educacional.profile_entitlements
  to educacional_app;

-- Ledger: SOMENTE leitura e inserção. O default ACL do schema concede `arwd`
-- a tabelas novas, então a revogação de UPDATE/DELETE/TRUNCATE é explícita.
grant select, insert on table educacional.credit_ledger to educacional_app;
revoke update, delete, truncate on table educacional.credit_ledger
  from educacional_app;

-- Sequences das identities (escopadas — sem tocar as demais do schema).
do $entitlements_seq_grants$
declare
  target text;
  seq text;
begin
  foreach target in array array[
    'educacional.plans',
    'educacional.profile_entitlements',
    'educacional.credit_ledger'
  ] loop
    seq := pg_get_serial_sequence(target, 'id');
    if seq is not null then
      execute format('grant usage, select on sequence %s to educacional_app', seq);
    end if;
  end loop;
end
$entitlements_seq_grants$;

-- ---------------------------------------------------------------------------
-- 6. SEED — o plano "Legado"
-- ---------------------------------------------------------------------------
-- Permissivo: catálogo inteiro, mentorias ilimitadas, sem expiração. Preserva
-- exatamente o acesso que os perfis já existentes tinham antes desta migration.
-- Sem linhas em plan_course_access: `permissive = true` já cobre todo o
-- catálogo, inclusive cursos futuros.
-- ---------------------------------------------------------------------------

insert into educacional.plans
  (slug, name, description, duration_months, mentorship_credits, credit_period,
   permissive, status, sort_order)
values
  ('legado',
   'Legado',
   'Plano herdado por todos os perfis que já existiam antes do sistema de créditos: acesso total ao catálogo, mentorias ilimitadas e sem prazo de expiração.',
   null, null, 'total', true, 'published', 0)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 7. BACKFILL — TODOS os perfis, nas três dimensões
-- ---------------------------------------------------------------------------
-- Cobre os 58 perfis, INCLUSIVE os 12 com status='deleted' (decisão do
-- orquestrador, D6 do TRACKING): a exclusão no app é lógica e um perfil
-- "deleted" pode ser reativado pelo fluxo de criação de aluno
-- (src/lib/create-user.ts). Cobrir todo mundo garante "zero órfãos" de forma
-- estável e mantém a reaplicação inerte; a reconciliação
-- (docs/credit-system/reconciliacao.sql) reporta os ativos em separado.
--
-- Idempotência: o índice único parcial (profile_id, kind) WHERE status='active'
-- é inferido pelo ON CONFLICT. Reaplicar não cria linha nova nem toca as
-- existentes. Nenhum movimento vai para o ledger — o plano Legado é ilimitado,
-- e "ilimitado" não é um número de créditos.
-- ---------------------------------------------------------------------------

insert into educacional.profile_entitlements
  (profile_id, plan_id, kind, source, status, starts_at, expires_at)
select
  p.id,
  legado.id,
  k.kind,
  'plan',
  'active',
  now(),
  null
from educacional.profiles p
cross join (select id from educacional.plans where slug = 'legado') legado
cross join (values ('temporal'::text), ('quantitative'), ('catalog')) as k(kind)
on conflict (profile_id, kind) where status = 'active' do nothing;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rode depois de aplicar)
-- ---------------------------------------------------------------------------
--
--   -- 1 plano, 0 cursos amarrados (permissivo), 58*3 = 174 entitlements, 0 ledger
--   select
--     (select count(*) from educacional.plans)                as plans,
--     (select count(*) from educacional.plan_course_access)   as plan_course_access,
--     (select count(*) from educacional.profile_entitlements) as entitlements,
--     (select count(*) from educacional.credit_ledger)        as ledger;
--
--   -- ZERO órfãos: todo perfil tem as 3 dimensões ativas
--   select count(*) as perfis_sem_plano
--     from educacional.profiles p
--    where not exists (
--      select 1 from educacional.profile_entitlements e
--       where e.profile_id = p.id and e.status = 'active'
--    );
--
--   -- Contagens das tabelas pré-existentes (têm de ficar idênticas)
--   select
--     (select count(*) from educacional.profiles)            as profiles,
--     (select count(*) from educacional.mentorship_events)   as mentorship_events,
--     (select count(*) from educacional.event_confirmations) as event_confirmations,
--     (select count(*) from educacional.courses)             as courses;
--
--   -- Reconciliação semanal completa: docs/credit-system/reconciliacao.sql
--
-- ---------------------------------------------------------------------------
-- ROLLBACK (destrutivo apenas para as tabelas novas — nenhuma tabela existente
-- é alterada por esta migration, então não há mais nada a reverter). O código
-- degrada sozinho: `src/lib/entitlements.ts` e `src/lib/credit-ledger.ts`
-- tratam `42P01` como "sem entitlements" e o app volta ao comportamento legado
-- (isPro = role === 'admin').
-- ---------------------------------------------------------------------------
--
--   drop table if exists educacional.credit_ledger;
--   drop table if exists educacional.profile_entitlements;
--   drop table if exists educacional.plan_course_access;
--   drop table if exists educacional.plans;
--   drop function if exists educacional.credit_ledger_append_only();
--
-- ============================================================================
