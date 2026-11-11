-- 0012-event-kind-credit.sql
-- ============================================================================
-- ALVO: schema `educacional` do banco central (auytmefqnuzbktyzcled).
--   NÃO toca `app_arkom`, NÃO toca `core`, NÃO remove nada.
--
-- OBJETIVO: Tarefa 1 do sistema de créditos — dizer QUAIS eventos custam
-- crédito e criar o diário de bordo do modo sombra.
--
--   educacional.mentorship_events.event_kind    (coluna nova)
--   educacional.mentorship_events.credit_cost   (coluna nova)
--   educacional.mentorship_events.cancelled_at  (coluna nova)
--   educacional.mentorship_events.cancelled_by  (coluna nova)
--   educacional.credit_shadow_log               (tabela nova, append-only)
--
-- NADA muda no comportamento do app enquanto `credit_shadow_mode` e
-- `credit_blocking_enabled` (migration 0010) estiverem desligadas: as colunas
-- só são LIDAS pelo caminho de confirmação, e com as flags desligadas ele nem
-- consulta o saldo.
--
-- ⚠ CLASSIFICAÇÃO É POR ID, NUNCA POR REGEX DE TÍTULO. Os 26 eventos de
--   produção têm grafias divergentes para a mesma coisa ("Raio-X" vs "Raio X",
--   "Mentoria Implementação" vs "Mentoria de Implementação"). Qualquer
--   heurística de texto erra — e errar aqui é cobrar crédito de aluno por um
--   evento que não deveria cobrar. A lista de IDs abaixo é explícita e está
--   replicada em docs/credit-system/TRACKING.md para a Carol conferir.
--
-- ⚠ DIREÇÃO SEGURA DO DEFAULT: `event_kind` nasce 'live_comunidade' (não
--   cobra). Evento criado por qualquer caminho que ainda não conheça a coluna
--   (seed, script antigo, INSERT manual) NUNCA cobra crédito por acidente.
--
-- ADITIVA e IDEMPOTENTE: só ADD COLUMN IF NOT EXISTS, CREATE TABLE/INDEX/
-- TRIGGER novos, constraints guardadas por DO-block e um backfill que só roda
-- enquanto a classificação ainda não existe. Rodar duas vezes seguidas produz
-- exatamente o mesmo estado e não muda nenhuma contagem de linha.
--
-- SEGURANÇA (padrão 0008/0009 BLOCO B / 0010 / 0011): RLS ligado SEM policy —
-- default-deny para `anon`/`authenticated`; quem lê/grava é a role de runtime
-- `educacional_app`, que tem BYPASSRLS (BYPASSRLS **não** dispensa o GRANT de
-- tabela, por isso os GRANTs abaixo são explícitos).
--
-- APLICAÇÃO: operador autorizado com direitos de OWNER — as roles de runtime
-- (`educacional_app`, `arkom_app_login`) NÃO fazem DDL. Na prática: Management
-- API do Supabase (roda como `postgres`).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. mentorship_events — tipo do evento, custo e carimbo de cancelamento
-- ---------------------------------------------------------------------------
--  event_kind   'mentoria_arkom'  → mentoria do Arkom: consome crédito
--               'live_comunidade' → live/laboratório aberto: NÃO consome
--               (dois valores só: o texto + CHECK faz o papel de enum sem
--                criar um tipo novo no schema — acrescentar um terceiro valor
--                amanhã é um ALTER de constraint, não um ALTER TYPE que
--                precisa de commit próprio)
--
--  credit_cost  custo em créditos de UMA confirmação. Default 1 = "uma
--               mentoria custa um crédito". O custo EFETIVO é
--               `event_kind = 'mentoria_arkom' ? credit_cost : 0` (regra em
--               src/lib/credit-policy.ts): live nunca cobra, mesmo que a
--               linha tenha ficado com custo 1 por ter nascido do default.
--               Sem CHECK cruzando as duas colunas de propósito — um CHECK
--               assim faria o INSERT atual do /admin (que não cita as colunas
--               novas) estourar, mudando comportamento com as flags OFF.
--
--  cancelled_at cancelamento do evento PELO ARKOM (regra E3). Cancelar não
--  cancelled_by apaga o evento nem as confirmações: despublica, carimba aqui e
--               estorna os débitos. Coluna nova em vez de um valor novo em
--               `status` — mexer no CHECK de status de uma tabela viva é risco
--               desnecessário.
-- ---------------------------------------------------------------------------

alter table educacional.mentorship_events
  add column if not exists event_kind text not null default 'live_comunidade';

alter table educacional.mentorship_events
  add column if not exists credit_cost integer not null default 1;

alter table educacional.mentorship_events
  add column if not exists cancelled_at timestamptz;

alter table educacional.mentorship_events
  add column if not exists cancelled_by integer;

-- Constraints guardadas (não existe `add constraint if not exists`).
do $mentorship_events_credit_constraints$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'mentorship_events_event_kind_ck'
       and conrelid = 'educacional.mentorship_events'::regclass
  ) then
    alter table educacional.mentorship_events
      add constraint mentorship_events_event_kind_ck
      check (event_kind in ('mentoria_arkom', 'live_comunidade'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'mentorship_events_credit_cost_ck'
       and conrelid = 'educacional.mentorship_events'::regclass
  ) then
    alter table educacional.mentorship_events
      add constraint mentorship_events_credit_cost_ck
      check (credit_cost >= 0 and credit_cost <= 100);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'mentorship_events_cancelled_by_fk'
       and conrelid = 'educacional.mentorship_events'::regclass
  ) then
    alter table educacional.mentorship_events
      add constraint mentorship_events_cancelled_by_fk
      foreign key (cancelled_by) references educacional.profiles(id);
  end if;
end
$mentorship_events_credit_constraints$;

comment on column educacional.mentorship_events.event_kind is
  'mentoria_arkom = consome crédito · live_comunidade = aberta (não consome). Default seguro: live.';
comment on column educacional.mentorship_events.credit_cost is
  'Custo em créditos de uma confirmação. Custo efetivo = 0 quando event_kind = live_comunidade.';
comment on column educacional.mentorship_events.cancelled_at is
  'Cancelamento pelo Arkom (regra E3): despublica + estorna todos os débitos do evento.';

create index if not exists idx_mentorship_events_kind
  on educacional.mentorship_events(event_kind);

-- ---------------------------------------------------------------------------
-- 2. CLASSIFICAÇÃO DOS 26 EVENTOS DE PRODUÇÃO — POR ID
-- ---------------------------------------------------------------------------
-- MENTORIA ARKOM (18) — cobra 1 crédito:
--   21 Mentoria Geral
--   22, 23, 24, 27, 37, 38, 41, 42, 43, 44, 45   Mentoria
--   28, 30, 31, 34, 36                            Mentoria Implementação
--   49                                            Mentoria de Implementação
--
-- LIVE DA COMUNIDADE (8) — não cobra:
--   25, 32, 39   Laboratório                                  (revisar ⚠)
--   29           Criação de PRD no MegaBrain                  (revisar ⚠)
--   35           Sinkronizando Operações                      (revisar ⚠)
--   46           Raio-X | Análise de Campanhas e Funis         (revisar ⚠)
--   47, 48       Raio X | Análise de Campanhas                 (revisar ⚠)
--
-- ⚠ Os 8 marcados como "revisar" foram classificados como LIVE por regra de
--   prudência (na dúvida, não cobra) — nenhum deles se chama "mentoria". A
--   Carol confirma um a um no /admin/mentorships; a coluna é editável lá.
--
-- IDEMPOTÊNCIA: o bloco só roda enquanto NENHUM evento estiver classificado
-- como mentoria (ou seja, enquanto a coluna estiver no default de fábrica em
-- todas as linhas). Reaplicar a migration depois da revisão da Carol não
-- desfaz o trabalho dela.
-- ---------------------------------------------------------------------------

do $event_kind_backfill$
declare
  ja_classificados integer;
  virou_mentoria integer;
begin
  select count(*) into ja_classificados
    from educacional.mentorship_events
   where event_kind <> 'live_comunidade';

  if ja_classificados > 0 then
    raise notice
      '0012: classificação já aplicada (% evento(s) como mentoria_arkom) — backfill ignorado.',
      ja_classificados;
    return;
  end if;

  update educacional.mentorship_events
     set event_kind = 'mentoria_arkom'
   where id in (21, 22, 23, 24, 27, 28, 30, 31, 34, 36,
                37, 38, 41, 42, 43, 44, 45, 49);
  get diagnostics virou_mentoria = row_count;

  -- Custo coerente com o tipo: mentoria 1, live 0.
  update educacional.mentorship_events
     set credit_cost = case when event_kind = 'mentoria_arkom' then 1 else 0 end;

  raise notice '0012: % evento(s) classificados como mentoria_arkom.', virou_mentoria;
end
$event_kind_backfill$;

-- ---------------------------------------------------------------------------
-- 3. credit_shadow_log — o diário do modo sombra (APPEND-ONLY)
-- ---------------------------------------------------------------------------
-- Existe para responder, ANTES de ligar o bloqueio: "quem teria sido barrado,
-- em qual evento, com qual saldo e por quê?". O modo sombra NÃO escreve no
-- ledger — sombra observa, não cria dívida. O que ela escreve é aqui.
--
--   action          'confirm' | 'unconfirm'  — o que o aluno tentou fazer
--   mode            'shadow'  | 'enforce'    — flag vigente no momento
--   policy          'on_confirmation' | 'on_participation'
--   verdict         o veredito que a política deu (ver src/lib/credit-policy.ts)
--   enforced        o veredito VALEU de fato (bloqueou/debitou)? Em sombra é
--                   sempre false — é isso que separa "teria" de "foi".
--   balance_before  saldo no instante da decisão. NULL = plano ilimitado.
--
-- Append-only pelo mesmo par de mecanismos do credit_ledger: trigger que
-- recusa UPDATE/DELETE/TRUNCATE + grant só de SELECT/INSERT para a role de
-- runtime (o default ACL do schema concede `arwd`, então a revogação é
-- explícita).
-- ---------------------------------------------------------------------------

create table if not exists educacional.credit_shadow_log (
  id bigint generated always as identity primary key,
  profile_id integer not null references educacional.profiles(id) on delete restrict,
  event_id integer references educacional.mentorship_events(id) on delete set null,
  event_title text,
  event_kind text,
  action text not null
    check (action in ('confirm', 'unconfirm')),
  mode text not null
    check (mode in ('shadow', 'enforce')),
  policy text not null
    check (policy in ('on_confirmation', 'on_participation')),
  verdict text not null
    check (verdict in (
      'would_allow',                -- confirmaria e debitaria (ou não havia o que debitar)
      'would_block_saldo',          -- saldo insuficiente
      'would_block_expirado',       -- acesso vencido
      'would_block_fora_do_plano',  -- o plano do aluno não inclui mentorias
      'would_refund',               -- desconfirmação dentro da janela: estornaria
      'would_skip_refund'           -- desconfirmação fora da janela (E1): não estornaria
    )),
  enforced boolean not null default false,
  credit_cost integer not null default 0,
  balance_before integer,
  unlimited boolean not null default false,
  plan_slug text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_shadow_log_created
  on educacional.credit_shadow_log(created_at desc);

create index if not exists idx_credit_shadow_log_profile
  on educacional.credit_shadow_log(profile_id, created_at desc);

create index if not exists idx_credit_shadow_log_event
  on educacional.credit_shadow_log(event_id)
  where event_id is not null;

create index if not exists idx_credit_shadow_log_verdict
  on educacional.credit_shadow_log(verdict, created_at desc);

comment on table educacional.credit_shadow_log is
  'Diário append-only do modo sombra de créditos: o veredito que a política daria em cada confirmação. Não é ledger — nenhum saldo sai daqui.';
comment on column educacional.credit_shadow_log.enforced is
  'false = só observação (modo sombra). true = o veredito valeu de verdade (bloqueio/débito).';
comment on column educacional.credit_shadow_log.balance_before is
  'Saldo do aluno no instante da decisão. NULL = plano com mentorias ilimitadas.';

create or replace function educacional.credit_shadow_log_append_only()
returns trigger
language plpgsql
as $credit_shadow_log_append_only$
begin
  raise exception
    'educacional.credit_shadow_log é append-only: % não é permitido. O registro do modo sombra é histórico e não se corrige — grave um registro novo.',
    tg_op
    using errcode = 'restrict_violation';
  return null;
end;
$credit_shadow_log_append_only$;

drop trigger if exists credit_shadow_log_no_update_delete on educacional.credit_shadow_log;
create trigger credit_shadow_log_no_update_delete
  before update or delete on educacional.credit_shadow_log
  for each row execute function educacional.credit_shadow_log_append_only();

drop trigger if exists credit_shadow_log_no_truncate on educacional.credit_shadow_log;
create trigger credit_shadow_log_no_truncate
  before truncate on educacional.credit_shadow_log
  for each statement execute function educacional.credit_shadow_log_append_only();

-- ---------------------------------------------------------------------------
-- 4. Segurança: RLS sem policy + revogação de anon/authenticated + grants
-- ---------------------------------------------------------------------------

alter table educacional.credit_shadow_log enable row level security;

revoke all on table educacional.credit_shadow_log from anon, authenticated;

grant usage on schema educacional to educacional_app;

grant select, insert on table educacional.credit_shadow_log to educacional_app;
revoke update, delete, truncate on table educacional.credit_shadow_log
  from educacional_app;

do $credit_shadow_log_seq_grant$
declare
  seq text;
begin
  seq := pg_get_serial_sequence('educacional.credit_shadow_log', 'id');
  if seq is not null then
    execute format('grant usage, select on sequence %s to educacional_app', seq);
  end if;
end
$credit_shadow_log_seq_grant$;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rode depois de aplicar)
-- ---------------------------------------------------------------------------
--
--   -- 18 mentorias (custo 1) + 8 lives (custo 0) = 26 eventos
--   select event_kind, credit_cost, count(*)
--     from educacional.mentorship_events
--    group by 1, 2 order by 1, 2;
--
--   -- A lista nominal, para a Carol conferir
--   select id, event_kind, credit_cost, title, event_date, starts_at
--     from educacional.mentorship_events order by id;
--
--   -- Contagens das tabelas existentes (têm de ficar idênticas)
--   select
--     (select count(*) from educacional.profiles)            as profiles,      -- 58
--     (select count(*) from educacional.mentorship_events)   as events,        -- 26
--     (select count(*) from educacional.event_confirmations) as confirmations, -- 37
--     (select count(*) from educacional.credit_ledger)       as ledger,
--     (select count(*) from educacional.credit_shadow_log)   as shadow_log;    -- 0
--
--   -- O que a sombra viu (depois de ligar `credit_shadow_mode`)
--   select verdict, count(*)
--     from educacional.credit_shadow_log
--    where action = 'confirm'
--    group by 1 order by 2 desc;
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- As colunas novas são todas nullable ou com DEFAULT e nenhuma tabela
-- existente teve coluna alterada/removida, então o DROP volta ao estado
-- anterior sem perda. O código degrada sozinho: `src/lib/credit-policy.ts`
-- trata `42703` (coluna ausente) e `42P01` (tabela ausente) como "sem sistema
-- de créditos" e a confirmação de presença volta ao toggle puro.
-- ---------------------------------------------------------------------------
--
--   drop table if exists educacional.credit_shadow_log;
--   drop function if exists educacional.credit_shadow_log_append_only();
--   alter table educacional.mentorship_events
--     drop constraint if exists mentorship_events_event_kind_ck,
--     drop constraint if exists mentorship_events_credit_cost_ck,
--     drop constraint if exists mentorship_events_cancelled_by_fk;
--   alter table educacional.mentorship_events
--     drop column if exists event_kind,
--     drop column if exists credit_cost,
--     drop column if exists cancelled_at,
--     drop column if exists cancelled_by;
--
-- ============================================================================
