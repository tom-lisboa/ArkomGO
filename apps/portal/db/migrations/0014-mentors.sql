-- 0014-mentors.sql
-- ============================================================================
-- ALVO: schema `educacional` do banco central (auytmefqnuzbktyzcled).
--   NÃO toca `app_arkom`, NÃO toca `core`, NÃO altera nenhuma tabela existente.
--
-- OBJETIVO (Tarefa 2): dar rosto às mentorias e criar a superfície onde a
-- PRESENÇA é aferida — a fonte do débito `on_participation` da Tarefa 1.
--
--   educacional.mentors           — o mentor (nome, especialidade, bio, foto)
--   educacional.event_mentors     — quem conduz cada evento (N:N, com ordem)
--   educacional.event_attendance  — quem ESTEVE no evento (lista de presença)
--
-- ─── CONFIRMAÇÃO ≠ PRESENÇA ────────────────────────────────────────────────
-- `event_confirmations` (que já existe) é RSVP: o aluno diz que pretende ir.
-- `event_attendance` (nova) é o fato: o mentor/admin afere quem apareceu. São
-- duas tabelas porque são dois eventos do mundo em momentos diferentes, e a
-- política `on_participation` cobra pela SEGUNDA, não pela primeira. Nenhuma
-- linha de `event_confirmations` é lida, escrita ou alterada por esta
-- migration.
--
-- ─── STATEFUL COM AUDITORIA (e por que NÃO é append-only) ──────────────────
-- `credit_ledger` (0011) e `credit_shadow_log` (0012) são append-only porque
-- registram DINHEIRO e DECISÃO — corrigir é lançar um movimento novo.
-- `event_attendance` é diferente: registra um FATO do mundo que o mentor pode
-- ter digitado errado ("marquei o aluno errado"). Guardar cada correção como
-- linha nova exigiria que toda leitura fizesse "a última linha vence" — mais
-- caro e mais fácil de errar do que um UPSERT com `unique (event_id,
-- profile_id)`. A auditoria fica em `marked_by` + `marked_at`, reescritos a
-- cada mudança. E a consequência financeira NÃO mora aqui: mora no ledger,
-- que é append-only — então corrigir presença nunca reescreve a história do
-- dinheiro. Desmarcar presença NÃO estorna: o estorno é concessão manual pelo
-- /admin, com motivo e autor (mesma doutrina do movimento compensatório).
--
-- ─── SEM MENTOR FICTÍCIO ───────────────────────────────────────────────────
-- Esta migration NÃO semeia nenhum mentor. Nome, foto e bio dos 3 mentores
-- reais são conteúdo da Carol; a UI nasce vazia com estado vazio próprio, no
-- /admin e no aluno. Semear "Mentor 1/2/3" só criaria lixo para apagar em
-- produção.
--
-- ADITIVA e IDEMPOTENTE: só CREATE TABLE/INDEX novos + RLS + grants + o seed
-- da flag com ON CONFLICT DO NOTHING. Reaplicar não altera nenhuma linha e não
-- muda a contagem de nenhuma tabela existente.
--
-- NEUTRA NO CUTOVER: a flag nova `mentors_enabled` nasce DESLIGADA — a área do
-- aluno segue byte a byte como hoje. O /admin ganha a tela de mentores e a
-- lista de presença (ferramenta interna, sem efeito para o aluno) e o débito
-- por participação continua dependendo de `credit_blocking_enabled` +
-- `entitlements_enabled` + `debit_policy = on_participation`.
--
-- SEGURANÇA (padrão 0008/0009 BLOCO B/0010/0011/0012/0013): RLS ligado SEM
-- policy — default-deny para `anon`/`authenticated`; quem lê/grava é a role de
-- runtime `educacional_app`, que tem BYPASSRLS (BYPASSRLS **não** dispensa o
-- GRANT de tabela, por isso os GRANTs abaixo são explícitos mesmo com o
-- default ACL do schema já cobrindo tabelas novas).
--
-- APLICAÇÃO: operador autorizado com direitos de OWNER (as roles de runtime
-- NÃO fazem DDL — `has_schema_privilege('educacional_app','educacional',
-- 'CREATE') = false`). Na prática: Management API do Supabase (roda como
-- `postgres`) ou psql com --single-transaction e ON_ERROR_STOP.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. mentors — a vitrine
-- ---------------------------------------------------------------------------
--  slug        identificador estável (React key, futura rota /mentores/<slug>).
--              Derivado do nome pela action, com sufixo numérico em colisão.
--  specialty   UMA linha curta ("Tráfego pago e funis") — o chip abaixo do
--              nome. Um `text[]` de especialidades foi descartado: com 3
--              mentores ele só acrescentaria um editor de lista ao /admin sem
--              mudar nada na tela do aluno.
--  bio         descrição longa, exibida no modal do mentor.
--  photo_url   caminho servido pela rota autenticada de mídia
--              ('/api/media/covers/mentors/…'). Nome `photo_url` — e não
--              `photo_path` — para casar com `cover_url` das outras 4 tabelas
--              de conteúdo: o valor guardado É a URL que o <img> consome.
--              NULL é estado de primeira classe: a UI cai nas iniciais.
--  status      'draft' | 'published' em vez de um booleano `ativo`, para
--              reusar o vocabulário (e o <StatusBadge>) de courses/apps/
--              mentorship_events. Rascunho = mentor cadastrado que o aluno
--              ainda não vê.
--  profile_id  opcional: o dia em que o mentor tiver login, é por aqui que a
--              lista de presença sai do /admin sem precisar de uma 4ª role em
--              `profiles.role` (o CHECK só aceita admin|student e alterá-lo é
--              mudança quebradora). Hoje ninguém escreve nesta coluna.
-- ---------------------------------------------------------------------------

create table if not exists educacional.mentors (
  id integer generated always as identity primary key,
  slug text not null unique,
  full_name text not null,
  specialty text,
  bio text,
  photo_url text,
  profile_id integer references educacional.profiles(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  sort_order integer not null default 0,
  created_by integer references educacional.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table educacional.mentors is
  'Mentores do Arkom: vitrine na página de mentorias do aluno (flag mentors_enabled) e vínculo com eventos via event_mentors. Editado em /admin/mentorships/mentors.';
comment on column educacional.mentors.photo_url is
  'Caminho na rota autenticada de mídia (/api/media/covers/mentors/…). NULL = a UI usa as iniciais do nome.';
comment on column educacional.mentors.status is
  'draft = cadastrado mas invisível para o aluno; published = aparece na vitrine.';
comment on column educacional.mentors.profile_id is
  'Perfil do mentor, quando ele tiver login. Reservado: nenhum caminho escreve aqui hoje.';

create index if not exists idx_mentors_order
  on educacional.mentors(sort_order, id);

create index if not exists idx_mentors_status
  on educacional.mentors(status);

-- Um perfil não pode ser dois mentores. Índice PARCIAL: vários mentores sem
-- perfil vinculado convivem sem colidir.
create unique index if not exists uq_mentors_profile
  on educacional.mentors(profile_id)
  where profile_id is not null;

-- ---------------------------------------------------------------------------
-- 2. event_mentors — quem conduz cada evento (N:N, com ordem)
-- ---------------------------------------------------------------------------
-- Vale para mentoria do Arkom E para live da comunidade: `event_kind` (0012)
-- diz se cobra crédito, não quem apresenta.
-- PK composta = o UNIQUE pedido (um mentor entra uma vez por evento).
-- ---------------------------------------------------------------------------

create table if not exists educacional.event_mentors (
  event_id integer not null
    references educacional.mentorship_events(id) on delete cascade,
  mentor_id integer not null
    references educacional.mentors(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (event_id, mentor_id)
);

comment on table educacional.event_mentors is
  'Mentores de cada evento (N:N). sort_order define a ordem de exibição na capa do evento.';

create index if not exists idx_event_mentors_order
  on educacional.event_mentors(event_id, sort_order);

-- "Próximos eventos deste mentor" (modal do aluno) varre por mentor.
create index if not exists idx_event_mentors_mentor
  on educacional.event_mentors(mentor_id);

-- ---------------------------------------------------------------------------
-- 3. event_attendance — a lista de presença (regra E4)
-- ---------------------------------------------------------------------------
--  attended   true = esteve · false = faltou. A AUSÊNCIA DE LINHA é um terceiro
--             estado ("ainda não aferido") e é diferente de `attended = false`
--             ("o mentor conferiu e o aluno não veio") — é essa distinção que
--             permite dizer, depois, quantos eventos foram efetivamente
--             chamados.
--  marked_by  quem aferiu. Hoje é sempre um admin (`requireAdmin`); com
--             `mentors.profile_id` preenchido, passa a ser o mentor. ON DELETE
--             SET NULL: o carimbo sobrevive à exclusão do autor.
--  marked_at  reescrito a cada mudança (ver o cabeçalho: stateful, não
--             append-only).
--
-- SEM coluna de "crédito debitado": quem sabe disso é o `credit_ledger`, pela
-- chave de idempotência `participation:evt=<e>:perfil=<p>`. Duplicar o fato
-- aqui criaria duas verdades sobre o mesmo débito.
-- ---------------------------------------------------------------------------

create table if not exists educacional.event_attendance (
  id integer generated always as identity primary key,
  event_id integer not null
    references educacional.mentorship_events(id) on delete cascade,
  profile_id integer not null
    references educacional.profiles(id) on delete cascade,
  attended boolean not null default true,
  marked_by integer references educacional.profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (event_id, profile_id)
);

comment on table educacional.event_attendance is
  'Lista de presença aferida por evento (regra E4). Stateful com auditoria: UPSERT por (event_id, profile_id), marked_by/marked_at reescritos a cada correção. A consequência financeira mora no credit_ledger, que é append-only.';
comment on column educacional.event_attendance.attended is
  'true = esteve · false = faltou · linha ausente = ainda não aferido (três estados).';
comment on column educacional.event_attendance.marked_by is
  'Perfil que aferiu a presença (admin hoje; mentor quando mentors.profile_id existir).';

create index if not exists idx_event_attendance_event
  on educacional.event_attendance(event_id);

create index if not exists idx_event_attendance_profile
  on educacional.event_attendance(profile_id);

-- Contagem de presentes por evento (coluna "Presenças" do /admin).
create index if not exists idx_event_attendance_present
  on educacional.event_attendance(event_id)
  where attended;

-- ---------------------------------------------------------------------------
-- 4. Segurança: RLS sem policy + revogação de anon/authenticated + grants
-- ---------------------------------------------------------------------------

alter table educacional.mentors enable row level security;
alter table educacional.event_mentors enable row level security;
alter table educacional.event_attendance enable row level security;

revoke all on table educacional.mentors from anon, authenticated;
revoke all on table educacional.event_mentors from anon, authenticated;
revoke all on table educacional.event_attendance from anon, authenticated;

grant usage on schema educacional to educacional_app;
grant select, insert, update, delete on table educacional.mentors
  to educacional_app;
grant select, insert, update, delete on table educacional.event_mentors
  to educacional_app;
grant select, insert, update, delete on table educacional.event_attendance
  to educacional_app;

-- Sequences das identities, escopadas (sem tocar as demais do educacional).
do $educacional_mentors_seq$
declare
  seq text;
begin
  foreach seq in array array[
    pg_get_serial_sequence('educacional.mentors', 'id'),
    pg_get_serial_sequence('educacional.event_attendance', 'id')
  ] loop
    if seq is not null then
      execute format('grant usage, select on sequence %s to educacional_app', seq);
    end if;
  end loop;
end
$educacional_mentors_seq$;

-- ---------------------------------------------------------------------------
-- 5. Flag de runtime (tabela da 0010). Nasce DESLIGADA.
-- ---------------------------------------------------------------------------
-- Com ela desligada, a página de mentorias do aluno não carrega nem renderiza
-- nada de mentor — nem a vitrine, nem a faixa na capa do evento. O /admin
-- continua liberado (cadastrar mentor e conferir presença é trabalho interno e
-- precisa acontecer ANTES de ligar a vitrine).
-- ---------------------------------------------------------------------------

do $educacional_mentors_flag$
begin
  if to_regclass('educacional.feature_flags') is not null then
    insert into educacional.feature_flags (key, enabled, scope) values
      ('mentors_enabled', false, null)
    on conflict (key) do nothing;
  end if;
end
$educacional_mentors_flag$;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rode depois de aplicar)
-- ---------------------------------------------------------------------------
--
--   -- as 3 tabelas existem, com RLS ligado e ZERO policy (padrão do schema)
--   select c.relname, c.relrowsecurity,
--          (select count(*) from pg_policies p
--            where p.schemaname = 'educacional' and p.tablename = c.relname) as policies
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'educacional'
--      and c.relname in ('mentors', 'event_mentors', 'event_attendance')
--    order by 1;
--
--   -- grants da role de runtime (esperado: SELECT/INSERT/UPDATE/DELETE)
--   select table_name, string_agg(privilege_type, ',' order by privilege_type)
--     from information_schema.table_privileges
--    where table_schema = 'educacional' and grantee = 'educacional_app'
--      and table_name in ('mentors', 'event_mentors', 'event_attendance')
--    group by 1 order by 1;
--
--   -- nasce vazio (sem mentor fictício) e a flag desligada
--   select (select count(*) from educacional.mentors)          as mentors,          -- 0
--          (select count(*) from educacional.event_mentors)    as event_mentors,    -- 0
--          (select count(*) from educacional.event_attendance) as event_attendance; -- 0
--   select key, enabled from educacional.feature_flags where key = 'mentors_enabled';
--
--   -- nada mudou nas tabelas existentes
--   select (select count(*) from educacional.profiles)            as profiles,      -- 58
--          (select count(*) from educacional.mentorship_events)   as events,        -- 26
--          (select count(*) from educacional.event_confirmations) as confirmations; -- 37
--
--   -- confirmados × presentes por evento (o contador do /admin)
--   select e.id, e.title,
--          (select count(*) from educacional.event_confirmations c
--            where c.event_id = e.id and c.confirmed = 1) as confirmados,
--          (select count(*) from educacional.event_attendance a
--            where a.event_id = e.id and a.attended)      as presentes
--     from educacional.mentorship_events e
--    order by e.event_date desc, e.id desc;
--
-- ---------------------------------------------------------------------------
-- ROLLBACK (destrutivo apenas para o que esta migration criou; nenhuma tabela
-- existente é alterada). Com as tabelas ausentes o código degrada sozinho:
-- `src/lib/mentors.ts` e as actions tratam 42P01 como "sem mentores", a
-- vitrine some e o /admin mostra "Banco ainda não preparado".
-- ---------------------------------------------------------------------------
--
--   drop table if exists educacional.event_attendance;
--   drop table if exists educacional.event_mentors;
--   drop table if exists educacional.mentors;
--   delete from educacional.feature_flags where key = 'mentors_enabled';
--
-- ============================================================================
