-- 0009-home-showcase.sql
-- ============================================================================
-- ALVO: os DOIS schemas do banco central (auytmefqnuzbktyzcled):
--   · `app_arkom`   — schema demo/seed (dev local, ARKOM_RUNTIME_SCHEMA default)
--   · `educacional` — schema de PROD (dados reais do bilhon-ai)
--
-- OBJETIVO: vitrine "Soluções em destaque" + banner do topo da /home editáveis
-- no /admin/home. Duas tabelas novas por schema:
--   · home_settings        — 1 linha (id=1): copy da seção, limite de vagas e
--                            os campos do banner do topo. SEM linha = /home
--                            mantém o comportamento automático atual.
--   · home_featured_slots  — cards escolhidos manualmente: app + ordem +
--                            overrides opcionais (título, texto, capa, cor,
--                            link). Vagas restantes até o limite são
--                            preenchidas pelo ranking de cliques.
--
-- ADITIVA e IDEMPOTENTE: só CREATE TABLE/INDEX novos + RLS + grants. Nenhuma
-- linha existente é lida ou alterada; contagens de linhas ficam idênticas.
--
-- ⚠ POLICY DO app_arkom COM NOME PRÓPRIO ("arkom runtime home access"):
--   `ensureAppArkomReady` (src/lib/db.ts) exige EXATAMENTE 16 policies com o
--   nome "arkom runtime full access". Reusar aquele nome nas tabelas novas
--   quebraria o boot do app. NÃO renomeie para "arkom runtime full access".
--
-- No `educacional`, o padrão é o da 0008 (solution_previews): RLS ligado sem
-- policy (default-deny p/ anon/authenticated) + GRANT de tabela para a role de
-- runtime `educacional_app` (BYPASSRLS não dispensa GRANT).
--
-- APLICAÇÃO: operador autorizado com direitos de owner (roles de runtime não
-- fazem DDL). Uma única transação com ON_ERROR_STOP.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- BLOCO A — app_arkom (demo/dev)
-- ---------------------------------------------------------------------------

create table if not exists app_arkom.home_settings (
  id integer primary key default 1 check (id = 1),
  featured_title text,
  featured_subtitle text,
  featured_limit integer not null default 4 check (featured_limit between 1 and 12),
  banner_enabled boolean not null default true,
  banner_image_url text,
  banner_pill text,
  banner_title text,
  banner_description text,
  banner_cta_label text,
  banner_cta_href text,
  updated_at timestamptz not null default now()
);

create table if not exists app_arkom.home_featured_slots (
  id integer generated always as identity primary key,
  app_id integer not null unique references app_arkom.apps(id) on delete cascade,
  sort_order integer not null default 0,
  title text,
  strap text,
  cover_url text,
  accent text check (accent is null or accent ~ '^#[0-9A-Fa-f]{6}$'),
  href text,
  created_at timestamptz not null default now()
);

create index if not exists idx_home_featured_sort
  on app_arkom.home_featured_slots(sort_order);

alter table app_arkom.home_settings enable row level security;
alter table app_arkom.home_featured_slots enable row level security;

-- Nome deliberadamente DIFERENTE de "arkom runtime full access" (ver header).
drop policy if exists "arkom runtime home access" on app_arkom.home_settings;
create policy "arkom runtime home access" on app_arkom.home_settings
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime home access" on app_arkom.home_featured_slots;
create policy "arkom runtime home access" on app_arkom.home_featured_slots
  for all to arkom_runtime using (true) with check (true);

revoke all on table app_arkom.home_settings from public;
revoke all on table app_arkom.home_settings from anon, authenticated;
revoke all on table app_arkom.home_featured_slots from public;
revoke all on table app_arkom.home_featured_slots from anon, authenticated;

grant select, insert, update, delete on table app_arkom.home_settings
  to arkom_runtime;
grant select, insert, update, delete on table app_arkom.home_featured_slots
  to arkom_runtime;

-- Sequence da identity (INSERT com identity não exige USAGE separado, mas os
-- grants explícitos seguem o cinto-e-suspensório da 0001).
grant usage, select on all sequences in schema app_arkom to arkom_runtime;

-- ---------------------------------------------------------------------------
-- BLOCO B — educacional (PROD)
-- ---------------------------------------------------------------------------

create table if not exists educacional.home_settings (
  id integer primary key default 1 check (id = 1),
  featured_title text,
  featured_subtitle text,
  featured_limit integer not null default 4 check (featured_limit between 1 and 12),
  banner_enabled boolean not null default true,
  banner_image_url text,
  banner_pill text,
  banner_title text,
  banner_description text,
  banner_cta_label text,
  banner_cta_href text,
  updated_at timestamptz not null default now()
);

create table if not exists educacional.home_featured_slots (
  id integer generated always as identity primary key,
  app_id integer not null unique references educacional.apps(id) on delete cascade,
  sort_order integer not null default 0,
  title text,
  strap text,
  cover_url text,
  accent text check (accent is null or accent ~ '^#[0-9A-Fa-f]{6}$'),
  href text,
  created_at timestamptz not null default now()
);

create index if not exists idx_home_featured_sort
  on educacional.home_featured_slots(sort_order);

-- Defesa em profundidade (padrão 0008): RLS ligado sem policy — o runtime
-- `educacional_app` (BYPASSRLS) lê/grava; anon/authenticated ficam default-deny.
alter table educacional.home_settings enable row level security;
alter table educacional.home_featured_slots enable row level security;

revoke all on table educacional.home_settings from anon, authenticated;
revoke all on table educacional.home_featured_slots from anon, authenticated;

-- BYPASSRLS não dispensa GRANT de tabela.
grant usage on schema educacional to educacional_app;
grant select, insert, update, delete on table educacional.home_settings
  to educacional_app;
grant select, insert, update, delete on table educacional.home_featured_slots
  to educacional_app;

-- Sequence da identity de home_featured_slots, escopada (sem tocar as demais
-- sequences do educacional).
do $educacional_home_seq$
declare
  seq text := pg_get_serial_sequence('educacional.home_featured_slots', 'id');
begin
  if seq is not null then
    execute format('grant usage, select on sequence %s to educacional_app', seq);
  end if;
end
$educacional_home_seq$;
