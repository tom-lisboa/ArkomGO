-- 0017 — Gestor IA (chat consultivo que recomenda soluções e aulas do catálogo).
--
-- Três tabelas, todas por-usuário, no schema de RUNTIME do arkom-dash:
--   consultor_threads   — uma conversa (título derivado da 1ª pergunta, preview, pin)
--   consultor_messages  — as mensagens (role user/assistant; cards jsonb nas do assistant)
--   consultor_journey   — a "Sua Jornada": cada recomendação aceita numa thread
--
-- O catálogo em si NÃO vive aqui: o Gestor lê courses/lessons/apps ao vivo
-- (src/lib/consultor/catalogo.ts) e o LLM só devolve REFERÊNCIAS a itens reais.
--
-- Aplicação (mesmo runbook do db/migrations/README.md):
--   • demo  (app_arkom):    aplicar como está.
--   • prod  (educacional):  trocar o search_path para `educacional` e PULAR o bloco
--     de policy/grants do arkom_runtime (a role de runtime de lá tem BYPASSRLS,
--     mesma regra da 0008).
--
-- Idempotente: pode ser reaplicada sem efeito colateral.

set search_path = app_arkom;

create table if not exists consultor_threads (
  id            bigserial primary key,
  user_id       integer not null references profiles(id) on delete cascade,
  title         text not null,
  -- última fala da conversa (para a lista do Histórico)
  preview       text not null default '',
  message_count integer not null default 0,
  -- 0|1 (mesma convenção de lesson_progress.completed)
  pinned        integer not null default 0,
  -- 'consultor' (recomendações) | 'planejamento' (roadmap — modo futuro)
  mode          text not null default 'consultor'
                  check (mode in ('consultor', 'planejamento')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists consultor_threads_user_idx
  on consultor_threads (user_id, pinned desc, updated_at desc);

create table if not exists consultor_messages (
  id         bigserial primary key,
  thread_id  bigint not null references consultor_threads(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  -- cards de recomendação ENRIQUECIDOS no servidor (kind/ref/titulo/motivo/url/…);
  -- null nas mensagens do usuário e nas do assistant sem recomendação
  cards      jsonb,
  -- pergunta de follow-up do assistant (renderizada como bolha própria)
  followup   text,
  created_at timestamptz not null default now()
);

create index if not exists consultor_messages_thread_idx
  on consultor_messages (thread_id, created_at);

create table if not exists consultor_journey (
  id         bigserial primary key,
  thread_id  bigint not null references consultor_threads(id) on delete cascade,
  -- 'solucao' | 'curso' | 'aula' — espelha ConsultorCardKind
  kind       text not null check (kind in ('solucao', 'curso', 'aula')),
  -- referência ao item real do catálogo (id do app, slug do curso, id de rota da aula)
  entity_ref text not null,
  titulo     text not null,
  motivo     text not null default '',
  url        text not null default '',
  added_at   timestamptz not null default now(),
  -- a jornada não repete o mesmo item na mesma thread
  unique (thread_id, kind, entity_ref)
);

create index if not exists consultor_journey_thread_idx
  on consultor_journey (thread_id, added_at);

-- ── Contrato de acesso (só no modo app_arkom; ver cabeçalho) ────────────────

alter table consultor_threads enable row level security;
alter table consultor_messages enable row level security;
alter table consultor_journey enable row level security;

do $consultor_policies$
declare
  t text;
begin
  foreach t in array array['consultor_threads', 'consultor_messages', 'consultor_journey'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'app_arkom'
        and tablename = t
        and policyname = 'arkom runtime full access'
    ) then
      execute format(
        'create policy "arkom runtime full access" on app_arkom.%I for all to arkom_runtime using (true) with check (true)',
        t
      );
    end if;
  end loop;
end
$consultor_policies$;

grant select, insert, update, delete
  on app_arkom.consultor_threads, app_arkom.consultor_messages, app_arkom.consultor_journey
  to arkom_runtime;
grant usage, select
  on sequence app_arkom.consultor_threads_id_seq, app_arkom.consultor_messages_id_seq, app_arkom.consultor_journey_id_seq
  to arkom_runtime;

revoke all on app_arkom.consultor_threads, app_arkom.consultor_messages, app_arkom.consultor_journey
  from public, anon, authenticated;
