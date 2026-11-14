-- Install against the dedicated Maia homologation database as its administrator.
begin;
do $$
begin
  if not exists(select 1 from homolog.environment where id and name='arkom-multi-homolog') then
    raise exception 'ArkomGO signup requires the Maia homologation database';
  end if;
end $$;

create or replace function homolog.arkomgo_signup(
  tenant uuid, actor uuid, technical_email text, company_name text,
  bridge_login text, bridge_password text, finance_org_id text, finance_account_id text, finance_subject_id text
) returns text language plpgsql security definer set search_path='' as $$
begin
  if technical_email <> 'h-' || replace(tenant::text, '-', '') || '@maia.arkom.test'
     or length(company_name) not between 1 and 100
     or bridge_login !~ '^multi_finance_[a-f0-9]{16}$'
     or bridge_password !~ '^[a-f0-9]{64}$'
     or finance_org_id !~ '^[a-zA-Z0-9_-]{1,128}$'
     or finance_account_id !~ '^[a-zA-Z0-9_-]{1,128}$'
     or finance_subject_id !~ '^[a-zA-Z0-9_-]{1,128}$'
     or not exists(select 1 from auth.users where id=actor and email=technical_email)
     or exists(select 1 from core.memberships where user_id=actor and org_id<>tenant) then
    raise exception 'invalid signup scope';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(tenant::text,0));
  insert into core.organizations(id, name, kind) values(tenant, company_name, 'arkomgo-homolog')
    on conflict(id) do nothing;
  if not exists(select 1 from core.organizations where id=tenant and kind='arkomgo-homolog' and name=company_name) then
    raise exception 'signup organization already belongs to another account';
  end if;
  insert into core.memberships(org_id,user_id,role) values(tenant,actor,'admin') on conflict(org_id,user_id) do nothing;
  if not exists(select 1 from core.memberships where org_id=tenant and user_id=actor and role='admin') then
    raise exception 'signup membership mismatch';
  end if;
  insert into core.app_instances(org_id,solution,status) values(tenant,'multi','active') on conflict(org_id,solution) do nothing;
  insert into core.profiles(user_id,email,full_name) values(actor,technical_email,company_name) on conflict(user_id) do nothing;
  if not exists(select 1 from pg_roles where rolname=bridge_login) then
    execute format('create role %I login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password %L',
      bridge_login, bridge_password);
  end if;
  insert into app_multi.financeai_credenciais_v1(login,org_id,finance_org,conta_id,titular_id)
    values(bridge_login,tenant,finance_org_id,finance_account_id,finance_subject_id)
    on conflict(login) do nothing;
  if not exists(select 1 from app_multi.financeai_credenciais_v1
    where login=bridge_login and org_id=tenant and finance_org=finance_org_id
      and conta_id=finance_account_id and titular_id=finance_subject_id) then
    raise exception 'signup finance binding mismatch';
  end if;
  execute format('grant multi_finance_bridge to %I',bridge_login);
  return 'ready';
end $$;
revoke all on function homolog.arkomgo_signup(uuid,uuid,text,text,text,text,text,text,text) from public, anon, authenticated, service_role;
grant usage on schema homolog to arkomgo_signup;
grant execute on function homolog.arkomgo_signup(uuid,uuid,text,text,text,text,text,text,text) to arkomgo_signup;
commit;
