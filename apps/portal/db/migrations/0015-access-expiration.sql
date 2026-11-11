-- 0015-access-expiration.sql
-- ============================================================================
-- ALVO: schema `educacional` do banco central (auytmefqnuzbktyzcled).
--   NÃO toca `app_arkom`, NÃO toca `core`, NÃO altera nenhuma tabela existente.
--
-- OBJETIVO (Tarefa 4): o PRAZO DE ACESSO ganha operação — relatório de
-- vencimentos (a ferramenta de renovação da Carol), edição individual de prazo
-- com motivo, e um job de expiração idempotente com alerta antecipado.
--
--   educacional.expiration_runs  — diário das execuções do job de expiração
--   + escopo padrão da flag `expiration_enforcement` (dias de antecedência do
--     alerta e janelas do relatório, configuráveis SEM deploy)
--
-- ─── O QUE ESTA MIGRATION **NÃO** FAZ (e por quê) ──────────────────────────
-- 1. NÃO cria tabela de auditoria de prazo. O prazo mora em
--    `profile_entitlements.expires_at` (0011) e a tabela JÁ tem as colunas de
--    auditoria — `reason`, `granted_by`, `granted_by_label`, `granted_at` — com
--    um CHECK (`profile_entitlements_manual_audit_ck`) que **recusa** um
--    entitlement `source='manual'` sem motivo, autor e carimbo de hora. Editar
--    o prazo = revogar a linha temporal vigente (ela FICA, como histórico) e
--    inserir uma nova `source='manual'`. O histórico é a própria sequência de
--    linhas revogadas: quem mudou, quando, para qual data e por quê. Uma tabela
--    de auditoria paralela guardaria a mesma informação num segundo lugar, com
--    o risco clássico de as duas discordarem.
-- 2. NÃO cria coluna nem tabela de "status expirado". **Expirado é estado
--    DERIVADO** (`expires_at <= now()`), nunca materializado. Materializar
--    seria pior do que redundante: `src/lib/entitlements.ts` só lê linhas com
--    `status='active'`, então um job que virasse a linha vencida para
--    `status='expired'` faria o aluno **voltar a parecer sem prazo** — o
--    oposto do pretendido. O job desta migration por isso NUNCA altera
--    `profile_entitlements`.
-- 3. NÃO usa `profiles.status='blocked'` para expirado. `blocked` revoga o
--    login inteiro e é operação manual do /admin; expirado continua entrando,
--    vendo catálogo (X1) e o próprio progresso (X3).
--
-- ─── O JOB E A IDEMPOTÊNCIA ────────────────────────────────────────────────
-- `expiration_runs` tem `run_key` ÚNICA (`<origem>:<AAAA-MM-DD>` no fuso de
-- São Paulo). O job faz `INSERT … ON CONFLICT (run_key) DO UPDATE … WHERE` os
-- números MUDARAM: rodar duas vezes no mesmo dia com o mesmo estado do banco
-- não escreve nada na segunda vez (nem `updated_at`), e nunca cria uma segunda
-- linha. Zero efeito colateral duplicado, e a prova é a própria linha.
--
-- ─── ALERTA ANTECIPADO CONFIGURÁVEL, SEM DEPLOY ────────────────────────────
-- Os dias de antecedência do alerta e as janelas do relatório vivem no `scope`
-- (jsonb) da flag `expiration_enforcement` — que já existe desde a 0010 e já
-- tem editor de escopo em /admin/settings. Criar uma tabela de configuração só
-- para dois números seria uma segunda fonte de verdade concorrendo com as
-- flags. O seed abaixo só preenche o escopo se ele estiver NULL: reaplicar não
-- desfaz o ajuste da Carol.
--
-- ADITIVA e IDEMPOTENTE: só CREATE TABLE/INDEX novos + RLS + grants + um UPDATE
-- guardado do escopo da flag. Reaplicar não altera nenhuma linha existente e
-- não muda a contagem de nenhuma tabela.
--
-- NEUTRA NO CUTOVER: nada muda para o aluno. O prazo só passa a barrar com a
-- flag `expiration_enforcement` LIGADA (e ela nasceu desligada na 0010), e hoje
-- NENHUM perfil tem prazo — os 58 estão no plano "Legado" (permissivo, sem
-- expiração). O relatório nasce, portanto, legitimamente VAZIO.
--
-- SEGURANÇA (padrão 0008/0009 BLOCO B/0010/0011/0012/0013/0014): RLS ligado SEM
-- policy — default-deny para `anon`/`authenticated`; quem lê/grava é a role de
-- runtime `educacional_app`, que tem BYPASSRLS (BYPASSRLS **não** dispensa o
-- GRANT de tabela, por isso os GRANTs abaixo são explícitos mesmo com o default
-- ACL do schema já cobrindo tabelas novas).
--
-- APLICAÇÃO: operador autorizado com direitos de OWNER (as roles de runtime
-- NÃO fazem DDL — `has_schema_privilege('educacional_app','educacional',
-- 'CREATE') = false`). Na prática: Management API do Supabase (roda como
-- `postgres`) ou psql com --single-transaction e ON_ERROR_STOP.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. expiration_runs — o diário do job de expiração
-- ---------------------------------------------------------------------------
--  run_key      '<origem>:<AAAA-MM-DD>' — a chave de idempotência do dia
--  source       'admin' (botão do /admin) · 'cron' (agendador futuro) · 'api'
--  lead_days    antecedência do alerta vigente na execução
--  com_prazo    perfis não excluídos COM data de expiração definida
--  ativos       dentro do prazo e fora da janela de alerta
--  expirando    dentro da janela de alerta (vence em até `lead_days` dias)
--  expirados    já venceram (estado DERIVADO — nada é gravado no entitlement)
--  detail       resumo em JSON: contagem por janela + IDs de perfil (sem PII)
-- ---------------------------------------------------------------------------

create table if not exists educacional.expiration_runs (
  id integer generated always as identity primary key,
  run_key text not null unique,
  source text not null default 'admin'
    check (source in ('admin', 'cron', 'api')),
  lead_days integer not null default 30
    check (lead_days >= 0 and lead_days <= 365),
  total_com_prazo integer not null default 0 check (total_com_prazo >= 0),
  total_ativos integer not null default 0 check (total_ativos >= 0),
  total_expirando integer not null default 0 check (total_expirando >= 0),
  total_expirados integer not null default 0 check (total_expirados >= 0),
  detail jsonb,
  ran_by text,
  ran_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_expiration_runs_ran_at
  on educacional.expiration_runs(ran_at desc);

comment on table educacional.expiration_runs is
  'Diário do job de expiração (src/lib/access-expiration.ts). Uma linha por dia e origem; rodar de novo com o mesmo estado não escreve nada.';
comment on column educacional.expiration_runs.run_key is
  'Chave de idempotência: <origem>:<AAAA-MM-DD> no fuso America/Sao_Paulo.';
comment on column educacional.expiration_runs.detail is
  'Resumo em JSON: contagem por janela (30/60/90) e IDs de perfil. Sem nome/e-mail — a PII fica em profiles.';

-- ---------------------------------------------------------------------------
-- 2. Segurança: RLS sem policy + revogação de anon/authenticated + grants
-- ---------------------------------------------------------------------------

alter table educacional.expiration_runs enable row level security;

revoke all on table educacional.expiration_runs from anon, authenticated;

grant usage on schema educacional to educacional_app;

grant select, insert, update, delete on table educacional.expiration_runs
  to educacional_app;

-- Sequence da identity (escopada — sem tocar as demais do schema).
do $expiration_runs_seq_grant$
declare
  seq text;
begin
  seq := pg_get_serial_sequence('educacional.expiration_runs', 'id');
  if seq is not null then
    execute format('grant usage, select on sequence %s to educacional_app', seq);
  end if;
end
$expiration_runs_seq_grant$;

-- ---------------------------------------------------------------------------
-- 3. Escopo padrão da flag `expiration_enforcement` (alerta configurável)
-- ---------------------------------------------------------------------------
--   alerta_dias : antecedência do alerta. Aluno que vence em até N dias entra
--                 como "Expirando" no relatório e no destaque do /admin.
--   janelas     : as janelas do relatório de vencimentos, em dias.
--
-- A Carol muda esses números em /admin/settings → "Prazo de acesso valendo" →
-- Editar escopo. Vale em segundos, sem deploy.
--
-- GUARDA DE REAPLICAÇÃO: só escreve quando o escopo está NULL. Reaplicar a
-- migration depois de a Carol ajustar os dias NÃO desfaz o ajuste dela.
-- ---------------------------------------------------------------------------

do $expiration_flag_scope$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'educacional' and table_name = 'feature_flags'
  ) then
    -- A flag já nasceu na 0010; o insert cobre o ambiente que só tem esta.
    insert into educacional.feature_flags (key, enabled, scope) values
      ('expiration_enforcement', false, null)
    on conflict (key) do nothing;

    update educacional.feature_flags
       set scope = '{"alerta_dias": 30, "janelas": [30, 60, 90]}'::jsonb
     where key = 'expiration_enforcement'
       and scope is null;
  end if;
end
$expiration_flag_scope$;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rode depois de aplicar)
-- ---------------------------------------------------------------------------
--
--   -- a tabela existe, com RLS ligado e ZERO policy (padrão do schema)
--   select c.relname, c.relrowsecurity,
--          (select count(*) from pg_policies p
--            where p.schemaname = 'educacional' and p.tablename = c.relname) as policies
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'educacional' and c.relname = 'expiration_runs';
--
--   -- grants da role de runtime (esperado: SELECT/INSERT/UPDATE/DELETE)
--   select table_name, string_agg(privilege_type, ',' order by privilege_type)
--     from information_schema.table_privileges
--    where table_schema = 'educacional' and grantee = 'educacional_app'
--      and table_name = 'expiration_runs'
--    group by 1;
--
--   -- o escopo do alerta e a flag (desligada)
--   select key, enabled, scope from educacional.feature_flags
--    where key = 'expiration_enforcement';
--
--   -- nasce vazia; e HOJE ninguém tem prazo (todos no plano Legado permissivo)
--   select (select count(*) from educacional.expiration_runs) as runs,          -- 0
--          (select count(*) from educacional.profile_entitlements
--            where kind = 'temporal' and status = 'active'
--              and expires_at is not null)                    as com_prazo;     -- 0
--
--   -- o relatório de vencimentos, em SQL (o mesmo recorte da tela)
--   select p.id, p.full_name, p.email, pl.name as plano,
--          e.source, e.expires_at,
--          (e.expires_at at time zone 'America/Sao_Paulo')::date
--            - (now() at time zone 'America/Sao_Paulo')::date as dias_restantes,
--          (e.expires_at <= now())                            as expirado
--     from educacional.profile_entitlements e
--     join educacional.profiles p on p.id = e.profile_id
--     left join educacional.plans pl on pl.id = e.plan_id
--    where e.kind = 'temporal' and e.status = 'active'
--      and e.expires_at is not null
--      and p.status <> 'deleted'
--      and (e.source = 'manual' or coalesce(pl.permissive, false) = false)
--    order by e.expires_at;
--
--   -- histórico de prazo de UM aluno (o que a ficha mostra)
--   select e.id, e.status, e.source, e.expires_at, e.reason,
--          e.granted_by_label, e.granted_at, e.created_at
--     from educacional.profile_entitlements e
--    where e.profile_id = <id> and e.kind = 'temporal'
--    order by e.created_at desc;
--
--   -- nada mudou nas tabelas existentes
--   select (select count(*) from educacional.profiles)            as profiles,      -- 58
--          (select count(*) from educacional.profile_entitlements) as entitlements,  -- 174
--          (select count(*) from educacional.mentorship_events)   as events,        -- 26
--          (select count(*) from educacional.event_confirmations) as confirmations; -- 37
--
-- ---------------------------------------------------------------------------
-- ROLLBACK (destrutivo apenas para o que esta migration criou; nenhuma tabela
-- existente é alterada). Com a tabela ausente o código degrada sozinho:
-- `src/lib/access-expiration.ts` trata 42P01 como "sem diário de execuções" —
-- o relatório continua funcionando (ele lê `profile_entitlements`) e o botão
-- "Processar expirações" avisa que o banco não está preparado.
-- ---------------------------------------------------------------------------
--
--   drop table if exists educacional.expiration_runs;
--   update educacional.feature_flags set scope = null
--    where key = 'expiration_enforcement';
--
-- ============================================================================
