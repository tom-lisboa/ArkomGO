-- Executado apenas no banco de homologação da Maia.
create or replace function app_multi._arkom_financeai_status(
  _org uuid, _actor uuid, _parcela uuid, _finance_org text, _conta text, _titular text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare resultado jsonb;
begin
  perform app_multi._exige_escopo_financeai_v1(_org,_finance_org,_conta,_titular);
  perform set_config('request.jwt.claim.sub',_actor::text,true);
  perform app_multi._exige_gestao(_org);
  select jsonb_build_object(
    'valor',p.valor::text,'vencimento',p.vencimento,'atualizada_em',p.updated_at,
    'descricao',p.descricao,'situacao',p.status,'titulo_id',v.titulo_id,'hoje',app_multi.hoje(),
    'conciliacao_id',v.conciliacao_id,'vinculavel',p.status='aberta' and p.valor>0 and c.status='ativo'
  ) into resultado
  from app_multi.parcelas p
  join app_multi.contratos c on c.id=p.contrato_id and c.org_id=p.org_id
  left join app_multi.financeai_parcelas_v1 v on v.parcela_id=p.id and v.org_id=p.org_id
  where p.id=_parcela and p.org_id=_org;
  if not found then raise sqlstate 'PT404'; end if;
  return resultado;
end $$;
revoke all on function app_multi._arkom_financeai_status(uuid,uuid,uuid,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function app_multi._arkom_financeai_status(uuid,uuid,uuid,text,text,text)
  to multi_finance_bridge;
