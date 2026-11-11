set search_path = app_arkom;

alter table profiles
  add column if not exists auth_user_id uuid,
  add column if not exists must_change_password integer not null default 0 check (must_change_password in (0, 1));

alter table profiles
  alter column password_hash drop not null;

create unique index if not exists idx_profiles_auth_user_id
  on profiles (auth_user_id)
  where auth_user_id is not null;

do $arkom_auth_users_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'app_arkom.profiles'::regclass
      and conname = 'profiles_auth_user_id_fkey'
  ) then
    alter table app_arkom.profiles
      add constraint profiles_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end
$arkom_auth_users_fk$;
