set search_path = app_arkom;

-- UUID histórico sem FK: permanece preenchido quando auth.users é removido.
-- Assim, recriar o mesmo e-mail com outro UUID não herda perfil/progresso/role.
alter table profiles
  add column if not exists auth_identity_id uuid;

update profiles
set auth_identity_id = auth_user_id
where auth_identity_id is null
  and auth_user_id is not null;

create unique index if not exists idx_profiles_auth_identity_id
  on profiles (auth_identity_id)
  where auth_identity_id is not null;

do $arkom_identity_constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'app_arkom.profiles'::regclass
      and conname = 'profiles_auth_identity_consistent'
  ) then
    alter table app_arkom.profiles
      add constraint profiles_auth_identity_consistent
      check (auth_user_id is null or auth_identity_id = auth_user_id);
  end if;
end
$arkom_identity_constraint$;

create or replace function app_arkom.prevent_auth_identity_reassignment()
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

drop trigger if exists profiles_auth_identity_immutable on app_arkom.profiles;
create trigger profiles_auth_identity_immutable
before update of auth_identity_id on app_arkom.profiles
for each row execute function app_arkom.prevent_auth_identity_reassignment();

-- Perfis legados jamais vinculados podem ser reclamados uma única vez por e-mail.
update app_arkom.profiles profile
set auth_user_id = central_user.id,
    auth_identity_id = central_user.id
from auth.users central_user
where profile.auth_user_id is null
  and profile.auth_identity_id is null
  and central_user.email is not null
  and lower(profile.email) = lower(central_user.email);

update app_arkom.profiles profile
set must_change_password = 1
from auth.users central_user
where profile.auth_user_id = central_user.id
  and central_user.raw_app_meta_data -> 'arkom_must_change_password' = 'true'::jsonb
  and profile.must_change_password = 0;

insert into app_arkom.profiles
  (auth_user_id, auth_identity_id, full_name, email, password_hash, role,
   status, must_change_password, registered_at)
select
  central_user.id,
  central_user.id,
  coalesce(
    nullif(btrim(central_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(central_user.raw_user_meta_data ->> 'name'), ''),
    split_part(lower(central_user.email), '@', 1)
  ),
  lower(central_user.email),
  null,
  case
    when central_user.raw_app_meta_data ->> 'arkom_role' = 'admin' then 'admin'
    else 'student'
  end,
  case
    when central_user.banned_until is not null
     and central_user.banned_until > now() then 'blocked'
    else 'active'
  end,
  case
    when central_user.raw_app_meta_data -> 'arkom_must_change_password' = 'true'::jsonb
      then 1
    else 0
  end,
  to_char(
    central_user.created_at at time zone 'utc',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  )
from auth.users central_user
where nullif(btrim(central_user.email), '') is not null
  and not exists (
    select 1
    from app_arkom.profiles profile
    where profile.auth_user_id = central_user.id
       or profile.auth_identity_id = central_user.id
       or lower(profile.email) = lower(central_user.email)
  )
on conflict do nothing;

do $arkom_identity_coverage$
begin
  if exists (
    select 1
    from auth.users central_user
    where nullif(btrim(central_user.email), '') is not null
      and not exists (
        select 1
        from app_arkom.profiles profile
        where profile.auth_user_id = central_user.id
          and profile.auth_identity_id = central_user.id
      )
  ) then
    raise exception
      'auth.users coverage failed: resolve UUID/email conflicts before migration';
  end if;

  if exists (
    select 1
    from app_arkom.profiles
    where auth_user_id is not null
      and auth_identity_id is distinct from auth_user_id
  ) then
    raise exception 'profiles contains an inconsistent Auth identity link';
  end if;
end
$arkom_identity_coverage$;

-- Atualiza apenas claims Arkom sob row lock, sem read-modify-write via GoTrue.
create or replace function app_arkom.set_central_arkom_claims(
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

revoke all on function app_arkom.prevent_auth_identity_reassignment() from public;
revoke all on function app_arkom.prevent_auth_identity_reassignment()
  from anon, authenticated, arkom_runtime;
revoke all on function app_arkom.set_central_arkom_claims(
  uuid, boolean, text, boolean, boolean
) from public, anon, authenticated;
grant execute on function app_arkom.set_central_arkom_claims(
  uuid, boolean, text, boolean, boolean
) to arkom_runtime;
