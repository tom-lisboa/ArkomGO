-- 0008-central-parity.sql
-- ============================================================================
-- ALVO: schema `educacional` (NAO `app_arkom`).  MESMO banco fisico central
-- (auytmefqnuzbktyzcled), schema diferente.  Confirme a conexao antes de rodar.
--
-- OBJETIVO: tornar o `educacional` um SUPERSET do `app_arkom`, dobrando nele
-- tudo que o `app_arkom` tem a mais (colunas de `profiles` das migrations 0005,
-- 0006 e 0007, as funcoes/triggers de integridade de identidade, e a tabela
-- `solution_previews`).  A migration e ADITIVA, IDEMPOTENTE e COMPATIVEL com o
-- bilhon-ai que esta VIVO no `educacional` (app.arkom.ai).
--
-- COMPATIBILIDADE COM O BILHON-AI VIVO (critico):
--   O bilhon-ai faz INSERT em `profiles` com `auth_user_id` preenchido e
--   `auth_identity_id` NULL.  Por isso criamos, ANTES do CHECK
--   `profiles_auth_identity_consistent`, um trigger BEFORE INSERT OR UPDATE que
--   faz `new.auth_identity_id := coalesce(new.auth_identity_id, new.auth_user_id)`.
--   Assim, todo INSERT do bilhon-ai chega ao CHECK ja com
--   `auth_identity_id = auth_user_id` -> o CHECK sempre vale -> as escritas
--   vivas do bilhon-ai continuam funcionando sem nenhuma mudanca no bilhon-ai.
--
-- SEM criacao de ROLE.  SEM criacao de POLICY (a role de runtime
-- `educacional_app` tem BYPASSRLS; nao precisa de policy).  A unica escrita em
-- dados e a POPULACAO da coluna recem-adicionada `auth_identity_id` nas linhas
-- existentes (nao adiciona/remove/apaga linha, nao altera valor de negocio) --
-- por isso as CONTAGENS DE LINHAS abaixo permanecem identicas antes/depois.
--
-- APLICACAO: por operador autorizado com direitos de OWNER no `educacional`
-- (as roles de runtime `educacional_app`/`arkom_app_login` NAO fazem DDL).
-- Rode em uma unica transacao com ON_ERROR_STOP.  NAO aplicar sem OK do dono.
-- ============================================================================
--
-- SNAPSHOT OBRIGATORIO (prova de zero perda de dados) -- ver db/migrations/README.md.
-- Rode ANTES e DEPOIS e compare linha a linha; devem ser identicos.
--
--   select format(
--     'select %L as table_name, count(*)::bigint as row_count from educacional.%I;',
--     tablename,
--     tablename
--   )
--   from pg_tables
--   where schemaname = 'educacional'
--   order by tablename
--   \gexec
--
--   select n.nspname as schema_name,
--          count(distinct c.oid) filter (where c.relkind in ('r','p','v','m','S')) as relations,
--          count(distinct p.oid) as functions
--   from pg_namespace n
--   left join pg_class c on c.relnamespace = n.oid
--   left join pg_proc p on p.pronamespace = n.oid
--   where n.nspname in ('core', 'educacional')
--   group by n.nspname
--   order by n.nspname;
--
-- (Apos aplicar, `relations` do educacional aumenta em 1 -- a nova tabela
--  `solution_previews` -- e `functions` aumenta em 2 -- as duas funcoes novas.
--  Nenhuma CONTAGEM DE LINHAS pode mudar.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (0005) Preferencia de tema compativel com light/dark.
-- ---------------------------------------------------------------------------
alter table educacional.profiles
  add column if not exists preferred_theme text;

alter table educacional.profiles
  drop constraint if exists profiles_preferred_theme_check;

alter table educacional.profiles
  add constraint profiles_preferred_theme_check
  check (preferred_theme is null or preferred_theme in ('light', 'dark'));

-- ---------------------------------------------------------------------------
-- (0006) Versao de sessao (revoga sessoes locais em troca de senha/bloqueio).
-- ---------------------------------------------------------------------------
alter table educacional.profiles
  add column if not exists session_version integer not null default 1
  check (session_version > 0);

-- ---------------------------------------------------------------------------
-- (0007) UUID-tombstone imutavel `auth_identity_id` + integridade de identidade.
-- ---------------------------------------------------------------------------

-- UUID historico sem FK: permanece preenchido quando auth.users e removido.
-- Assim, recriar o mesmo e-mail com outro UUID nao herda perfil/progresso/role.
alter table educacional.profiles
  add column if not exists auth_identity_id uuid;

-- Popula apenas a coluna recem-adicionada nas linhas existentes (nao muda a
-- contagem de linhas; nao altera nenhum valor de negocio).  Roda ANTES de
-- qualquer trigger existir, portanto e um UPDATE plano.
update educacional.profiles
set auth_identity_id = auth_user_id
where auth_identity_id is null
  and auth_user_id is not null;

create unique index if not exists idx_profiles_auth_identity_id
  on educacional.profiles (auth_identity_id)
  where auth_identity_id is not null;

-- Trigger BEFORE que preenche `auth_identity_id` a partir de `auth_user_id`
-- quando o chamador (ex.: bilhon-ai vivo) nao informa `auth_identity_id`.
-- E CRIADO ANTES do CHECK abaixo, garantindo que todo INSERT/UPDATE chegue ao
-- CHECK ja consistente -> o CHECK sempre vale -> escritas do bilhon-ai continuam.
create or replace function educacional.apply_auth_identity_default()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.auth_identity_id := coalesce(new.auth_identity_id, new.auth_user_id);
  return new;
end
$function$;

drop trigger if exists profiles_auth_identity_default on educacional.profiles;
create trigger profiles_auth_identity_default
before insert or update on educacional.profiles
for each row execute function educacional.apply_auth_identity_default();

-- CHECK de consistencia: so agora, com o trigger BEFORE ja no lugar.
do $educacional_identity_constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'educacional.profiles'::regclass
      and conname = 'profiles_auth_identity_consistent'
  ) then
    alter table educacional.profiles
      add constraint profiles_auth_identity_consistent
      check (auth_user_id is null or auth_identity_id = auth_user_id);
  end if;
end
$educacional_identity_constraint$;

-- Imutabilidade: barra reatribuicao de `auth_identity_id` ja preenchido.
create or replace function educacional.prevent_auth_identity_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.auth_identity_id is not null
     and new.auth_identity_id is distinct from old.auth_identity_id then
    raise exception 'auth_identity_id is immutable after the first link';
  end if;
  return new;
end
$function$;

drop trigger if exists profiles_auth_identity_immutable on educacional.profiles;
create trigger profiles_auth_identity_immutable
before update of auth_identity_id on educacional.profiles
for each row execute function educacional.prevent_auth_identity_reassignment();

-- Atualiza apenas claims Arkom sob row lock, sem read-modify-write via GoTrue.
-- Identica a app_arkom.set_central_arkom_claims (security definer, search_path='').
create or replace function educacional.set_central_arkom_claims(
  p_auth_user_id uuid,
  p_set_role boolean,
  p_role text,
  p_set_must_change_password boolean,
  p_must_change_password boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  metadata jsonb;
begin
  if p_set_role and p_role is not null and p_role not in ('admin', 'student') then
    raise exception 'invalid Arkom role';
  end if;

  select coalesce(raw_app_meta_data, '{}'::jsonb)
  into metadata
  from auth.users
  where id = p_auth_user_id
  for update;

  if not found then
    raise exception 'central Auth user not found';
  end if;

  if p_set_role then
    if p_role is null then
      metadata := metadata - 'arkom_role';
    else
      metadata := metadata || jsonb_build_object('arkom_role', p_role);
    end if;
  end if;

  if p_set_must_change_password then
    metadata := metadata || jsonb_build_object(
      'arkom_must_change_password',
      p_must_change_password
    );
  end if;

  update auth.users
  set raw_app_meta_data = metadata,
      updated_at = now()
  where id = p_auth_user_id;
end
$function$;

revoke all on function educacional.apply_auth_identity_default() from public;
revoke all on function educacional.apply_auth_identity_default()
  from anon, authenticated;
revoke all on function educacional.prevent_auth_identity_reassignment() from public;
revoke all on function educacional.prevent_auth_identity_reassignment()
  from anon, authenticated;
revoke all on function educacional.set_central_arkom_claims(
  uuid, boolean, text, boolean, boolean
) from public, anon, authenticated;
-- A role de runtime do educacional (BYPASSRLS) precisa EXECUTE para o app chamar.
grant execute on function educacional.set_central_arkom_claims(
  uuid, boolean, text, boolean, boolean
) to educacional_app;

-- ---------------------------------------------------------------------------
-- solution_previews (paridade com app_arkom; hoje o app_arkom cria ad-hoc).
-- Colunas/tipos confirmados pelo uso em:
--   src/app/admin/solutions/actions.ts  -> INSERT (solution_slug, preview_url,
--       remix_url, updated_at) ... ON CONFLICT (solution_slug) DO UPDATE
--   src/app/admin/solutions/page.tsx    -> SELECT solution_slug, preview_url, remix_url
--   src/app/api/map/previews/route.ts   -> SELECT solution_slug, preview_url, remix_url
--   scripts/probe-solutions.mjs         -> SELECT ... ORDER BY solution_slug
--   scripts/clear-vdi-previews.mjs      -> UPDATE ... SET preview_url = NULL
-- => solution_slug e PK/conflict target; preview_url e remix_url sao nullable;
--    updated_at e not null default now().
-- ---------------------------------------------------------------------------
create table if not exists educacional.solution_previews (
  solution_slug text primary key,
  preview_url text,
  remix_url text,
  updated_at timestamptz not null default now()
);

-- Defesa em profundidade escopada apenas a esta tabela nova (nao toca objetos
-- existentes do educacional): RLS ligado sem policy (o runtime BYPASSRLS le/grava
-- normalmente; anon/authenticated ficam em default-deny caso o schema seja exposto).
alter table educacional.solution_previews enable row level security;
revoke all on table educacional.solution_previews from anon, authenticated;

-- BYPASSRLS nao dispensa GRANT de tabela: a role de runtime precisa do DML.
grant usage on schema educacional to educacional_app;
grant select, insert, update, delete on table educacional.solution_previews
  to educacional_app;
