-- Install against the dedicated FinanceAI homologation database as its owner.
begin;
create schema if not exists arkomgo_homolog;
revoke all on schema arkomgo_homolog from public;
create or replace function arkomgo_homolog.bridge_token(
  tenant text, external_owner text, digest text, actor_name text
) returns text language plpgsql security definer set search_path='' as $$
declare permissions text[];
begin
  if actor_name = 'arkom-maia-finance_token' then
    permissions := array['banking.read','finance.read'];
  elsif actor_name = 'arkom-maia-title_token' then
    permissions := array['finance.write'];
  else
    raise exception 'invalid bridge scope';
  end if;
  if external_owner !~ '^org_h-[a-f0-9]{32}$' or digest !~ '^[a-f0-9]{64}$'
    or not exists (select 1 from public.fc_organizations
      where id=tenant and external_namespace='arkom' and external_reference=external_owner and active) then
    raise exception 'invalid homologation finance organization';
  end if;
  insert into public.fc_tokens(hash,organization_id,actor,scopes) values(digest,tenant,actor_name,permissions)
    on conflict(hash) do nothing;
  if not exists(select 1 from public.fc_tokens where hash=digest and organization_id=tenant and actor=actor_name
      and scopes=permissions and token_kind='lab' and active and expires_at is null) then
    raise exception 'invalid finance credential';
  end if;
  return 'ready';
end $$;
revoke all on function arkomgo_homolog.bridge_token(text,text,text,text) from public;
grant usage on schema arkomgo_homolog to arkomgo_signup;
grant execute on function arkomgo_homolog.bridge_token(text,text,text,text) to arkomgo_signup;
commit;
