-- 0013-course-rails.sql
-- ============================================================================
-- ALVO: schema `educacional` do banco central (auytmefqnuzbktyzcled).
--   NÃO toca `app_arkom`, NÃO toca `core`, NÃO altera nenhuma tabela existente.
--
-- OBJETIVO (Tarefa 3): as prateleiras ("rails") do catálogo da Universidade IA
-- deixam de ser código e viram DADO editável no /admin. Hoje elas estão
-- hardcoded em `src/components/trainings/trainings-body.tsx:37-56` — duas
-- <CourseRail>: "Top {n} cursos no Brasil" (cursos COM aulas) e "Em breve"
-- (cursos publicados SEM aulas). Com 7+ cursos reais subindo, a Carol precisa
-- montar/ordenar/limitar essas prateleiras sem deploy.
--
--   educacional.course_rails        — uma linha por prateleira
--     slug        text  UNIQUE  — identificador estável (usado como React key)
--     title       text          — título exibido; aceita o marcador {n}, que o
--                                 render troca pela quantidade EFETIVA de
--                                 cursos da prateleira ("Top {n} cursos no
--                                 Brasil" → "Top 5 cursos no Brasil")
--     mode        text          — de onde vêm os cursos:
--                                   'manual'   = só os escolhidos à mão
--                                   'todos'    = catálogo publicado inteiro
--                                   'top'      = publicados COM aulas
--                                   'em_breve' = publicados SEM aulas
--     card_style  text          — 'rank' (número gigante) | 'poster'
--     icon        text          — chave do ícone lucide (allowlist no código)
--     item_limit  int  NULL     — teto de cursos exibidos; NULL = sem teto
--     clickable   boolean       — false = cards não navegam (regra do plano
--                                 para a prateleira "Em breve")
--     sort_order  int           — ordem das prateleiras na página
--     enabled     boolean       — prateleira desligada não renderiza
--
--   educacional.course_rail_slots  — composição MANUAL (mode='manual')
--     rail_id + course_id UNIQUE  — um curso entra uma vez por prateleira
--     sort_order                  — posição dentro da prateleira
--
-- Espelha o par `home_settings` / `home_featured_slots` da 0009 BLOCO B
-- (config + slots manuais), com uma diferença deliberada: aqui NÃO há colunas
-- de override (título/capa/cor por slot). O card do curso já é derivado de
-- `courses`; duplicar esses campos criaria um segundo catálogo para manter.
--
-- ADITIVA e IDEMPOTENTE: só CREATE TABLE/INDEX novos + RLS + grants + seeds
-- com ON CONFLICT DO NOTHING e um DO-block guardado. Reaplicar não altera
-- nenhuma prateleira já curada e não muda a contagem de linhas de nenhuma das
-- tabelas existentes.
--
-- NEUTRA NO CUTOVER: o seed reproduz exatamente o layout hardcoded de hoje, e
-- a flag nova `course_rails_enabled` nasce DESLIGADA — com ela desligada o
-- app segue renderizando o código atual, byte a byte.
--
-- SEGURANÇA (padrão 0008/0009 BLOCO B/0010/0011/0012): RLS ligado SEM policy —
-- default-deny para `anon`/`authenticated`; quem lê/grava é a role de runtime
-- `educacional_app`, que tem BYPASSRLS (BYPASSRLS **não** dispensa o GRANT de
-- tabela, por isso os GRANTs abaixo são explícitos mesmo com o default ACL do
-- schema já cobrindo tabelas novas).
--
-- APLICAÇÃO: operador autorizado com direitos de OWNER (as roles de runtime
-- NÃO fazem DDL — `has_schema_privilege('educacional_app','educacional',
-- 'CREATE') = false`). Na prática: Management API do Supabase (roda como
-- `postgres`) ou psql com --single-transaction e ON_ERROR_STOP.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists educacional.course_rails (
  id integer generated always as identity primary key,
  slug text not null unique,
  title text not null,
  mode text not null default 'manual'
    check (mode in ('manual', 'todos', 'top', 'em_breve')),
  card_style text not null default 'poster'
    check (card_style in ('rank', 'poster')),
  icon text not null default 'graduation',
  item_limit integer check (item_limit is null or item_limit between 1 and 24),
  clickable boolean not null default true,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table educacional.course_rails is
  'Prateleiras do catálogo da Universidade IA, editáveis em /admin/trainings/rails. Renderizadas por src/components/trainings/trainings-body.tsx quando a flag course_rails_enabled está ligada.';
comment on column educacional.course_rails.title is
  'Título exibido. O marcador {n} é trocado pela quantidade efetiva de cursos da prateleira (ex.: "Top {n} cursos no Brasil").';
comment on column educacional.course_rails.mode is
  'De onde vêm os cursos: manual (slots), todos (catálogo publicado), top (publicados com aulas), em_breve (publicados sem aulas).';
comment on column educacional.course_rails.item_limit is
  'Teto de cursos exibidos. NULL = sem teto.';
comment on column educacional.course_rails.clickable is
  'false = os cards da prateleira não navegam (regra do plano para "Em breve").';

create index if not exists idx_course_rails_order
  on educacional.course_rails(sort_order, id);

create table if not exists educacional.course_rail_slots (
  id integer generated always as identity primary key,
  rail_id integer not null references educacional.course_rails(id) on delete cascade,
  course_id integer not null references educacional.courses(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (rail_id, course_id)
);

comment on table educacional.course_rail_slots is
  'Composição manual de uma prateleira (course_rails.mode = manual). Sem overrides: o card é sempre derivado de courses.';

create index if not exists idx_course_rail_slots_sort
  on educacional.course_rail_slots(rail_id, sort_order);

-- ---------------------------------------------------------------------------
-- Segurança: RLS sem policy + revogação de anon/authenticated + grants
-- ---------------------------------------------------------------------------

alter table educacional.course_rails enable row level security;
alter table educacional.course_rail_slots enable row level security;

revoke all on table educacional.course_rails from anon, authenticated;
revoke all on table educacional.course_rail_slots from anon, authenticated;

grant usage on schema educacional to educacional_app;
grant select, insert, update, delete on table educacional.course_rails
  to educacional_app;
grant select, insert, update, delete on table educacional.course_rail_slots
  to educacional_app;

-- Sequences das identities, escopadas (sem tocar as demais do educacional).
do $educacional_rails_seq$
declare
  seq text;
begin
  foreach seq in array array[
    pg_get_serial_sequence('educacional.course_rails', 'id'),
    pg_get_serial_sequence('educacional.course_rail_slots', 'id')
  ] loop
    if seq is not null then
      execute format('grant usage, select on sequence %s to educacional_app', seq);
    end if;
  end loop;
end
$educacional_rails_seq$;

-- ---------------------------------------------------------------------------
-- Flag de runtime (tabela da 0010). Nasce DESLIGADA: com ela desligada o
-- /trainings continua renderizando as duas rails hardcoded de hoje.
-- ---------------------------------------------------------------------------

do $educacional_rails_flag$
begin
  if to_regclass('educacional.feature_flags') is not null then
    insert into educacional.feature_flags (key, enabled, scope) values
      ('course_rails_enabled', false, null)
    on conflict (key) do nothing;
  end if;
end
$educacional_rails_flag$;

-- ---------------------------------------------------------------------------
-- SEED — replica o layout HARDCODED de hoje (trainings-body.tsx:37-56).
--
--   1) "Top {n} cursos no Brasil"  · ícone troféu · cards com ranking
--      Hoje = todos os cursos publicados COM aulas, na ordem do catálogo.
--      Vira composição MANUAL com exatamente esses cursos: assim, cadastrar um
--      curso novo NÃO altera o Top (regra do plano). A Carol muda a composição
--      no /admin quando quiser.
--   2) "Em breve" · ícone relógio · cards pôster · NÃO clicável
--      Fica automática (mode='em_breve'): curso publicado sem aulas entra
--      sozinho, e sai sozinho quando ganha a primeira aula.
--   3) "Todos os cursos" · catálogo inteiro · nasce DESLIGADA
--      Deixa a seção pronta para a Carol ligar em um clique, sem mudar nada
--      hoje (ligada, ela duplicaria os cursos já mostrados acima).
--
-- ON CONFLICT (slug) DO NOTHING: reaplicar não sobrescreve edição da Carol.
-- ---------------------------------------------------------------------------

insert into educacional.course_rails
  (slug, title, mode, card_style, icon, item_limit, clickable, sort_order, enabled)
values
  ('top',      'Top {n} cursos no Brasil', 'manual',   'rank',   'trophy',     null, true,  0, true),
  ('em-breve', 'Em breve',                 'em_breve', 'poster', 'clock',      null, false, 1, true),
  ('todos',    'Todos os cursos',          'todos',    'poster', 'graduation', null, true,  2, false)
on conflict (slug) do nothing;

-- Composição manual do "Top": os cursos publicados que HOJE têm aula, na
-- ordem do catálogo (`sort_order, id`) — exatamente o que o código monta.
--
-- GUARDA DE REAPLICAÇÃO: só semeia enquanto a prateleira estiver VAZIA. Depois
-- que a Carol curar a composição (inclusive removendo cursos), reaplicar a
-- migration não desfaz o trabalho dela.
do $educacional_rails_top_seed$
declare
  v_rail integer;
  v_slots integer;
begin
  select id into v_rail from educacional.course_rails where slug = 'top';
  if v_rail is null then
    return;
  end if;

  select count(*) into v_slots
    from educacional.course_rail_slots where rail_id = v_rail;
  if v_slots > 0 then
    return;   -- já composta: nada a fazer
  end if;

  insert into educacional.course_rail_slots (rail_id, course_id, sort_order)
  select v_rail,
         c.id,
         (row_number() over (order by c.sort_order, c.id))::int - 1
    from educacional.courses c
   where c.status = 'published'
     and exists (
       select 1
         from educacional.lessons l
         join educacional.course_modules m on m.id = l.module_id
        where l.course_id = c.id
          and l.status = 'published'
          and m.status = 'published'
     )
  on conflict (rail_id, course_id) do nothing;
end
$educacional_rails_top_seed$;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rode depois de aplicar)
-- ---------------------------------------------------------------------------
--
--   -- 3 prateleiras; 'todos' desligada
--   select slug, title, mode, card_style, icon, item_limit, clickable,
--          sort_order, enabled
--     from educacional.course_rails order by sort_order, id;
--
--   -- composição manual do Top (esperado hoje: 5 cursos com aula)
--   select r.slug, s.sort_order, c.id, c.title
--     from educacional.course_rail_slots s
--     join educacional.course_rails r on r.id = s.rail_id
--     join educacional.courses c on c.id = s.course_id
--    order by r.sort_order, s.sort_order, s.id;
--
--   -- a flag existe e está desligada
--   select key, enabled from educacional.feature_flags
--    where key = 'course_rails_enabled';
--
--   -- nada mudou nas tabelas existentes
--   select (select count(*) from educacional.courses)  as courses,   -- 8
--          (select count(*) from educacional.profiles) as profiles;  -- 58
--
-- ---------------------------------------------------------------------------
-- ROLLBACK (destrutivo apenas para o que esta migration criou; nenhuma tabela
-- existente é alterada). Com as tabelas ausentes o código degrada sozinho:
-- `src/components/trainings/rails.ts` trata 42P01 como "sem configuração" e o
-- /trainings volta às rails hardcoded; o /admin mostra o estado vazio.
-- ---------------------------------------------------------------------------
--
--   drop table if exists educacional.course_rail_slots;
--   drop table if exists educacional.course_rails;
--   delete from educacional.feature_flags where key = 'course_rails_enabled';
--
-- ============================================================================
