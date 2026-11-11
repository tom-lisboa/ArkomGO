-- ============================================================================
-- reconciliacao.sql — conferência SEMANAL do núcleo de entitlements + créditos
-- ============================================================================
-- Alvo: schema `educacional` do banco central (auytmefqnuzbktyzcled).
-- Aplicação: read-only. Rode como `postgres` (Management API do Supabase) ou
-- com qualquer role que tenha SELECT no schema.
--
--   node docs/tools/apply_sql.cjs docs/credit-system/reconciliacao.sql
--   (SUPABASE_ACCESS_TOKEN + REF=auytmefqnuzbktyzcled no ambiente)
--
-- O QUE ESTA QUERY RESPONDE
--   1. Todo perfil tem plano? (o backfill da 0011 cobriu os 58 — se aparecer
--      alguém aqui, é perfil nascido depois, pelo auto-provisionamento do
--      primeiro login, sem plano atribuído.)
--   2. O saldo de cada aluno bate com o que o plano dele deveria ter concedido?
--      saldo = SUM(delta) do ledger · esperado = cota do plano - consumo
--   3. Sobrou alguma inconsistência estrutural (saldo negativo, entitlement
--      ativo apontando para plano inexistente, chave de idempotência repetida)?
--
-- NADA AQUI ESCREVE. Divergência encontrada se resolve com um movimento
-- compensatório no ledger (o ledger é append-only por trigger).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- BLOCO 1 — Panorama: contagens + órfãos
-- ---------------------------------------------------------------------------
select
  'panorama' as bloco,
  (select count(*) from educacional.profiles)                              as perfis_total,
  (select count(*) from educacional.profiles where status <> 'deleted')    as perfis_nao_excluidos,
  (select count(*) from educacional.plans)                                 as planos,
  (select count(*) from educacional.plans where status = 'published')      as planos_publicados,
  (select count(*) from educacional.profile_entitlements
    where status = 'active')                                               as entitlements_ativos,
  (select count(distinct profile_id) from educacional.profile_entitlements
    where status = 'active')                                               as perfis_com_direito,
  (select count(*) from educacional.credit_ledger)                         as lancamentos_no_ledger,
  (select coalesce(sum(delta), 0) from educacional.credit_ledger)          as saldo_global,
  -- Estes DOIS têm de ser ZERO.
  (select count(*) from educacional.profiles p
    where not exists (select 1 from educacional.profile_entitlements e
                       where e.profile_id = p.id and e.status = 'active')) as perfis_sem_plano,
  (select count(*) from educacional.profiles p
    where p.status <> 'deleted'
      and not exists (select 1 from educacional.profile_entitlements e
                       where e.profile_id = p.id and e.status = 'active')) as perfis_ativos_sem_plano;


-- ---------------------------------------------------------------------------
-- BLOCO 2 — Alunos SEM plano (esperado: nenhuma linha)
-- ---------------------------------------------------------------------------
select
  'sem_plano' as bloco,
  p.id, p.full_name, p.email, p.role, p.status, p.registered_at
from educacional.profiles p
where not exists (
  select 1 from educacional.profile_entitlements e
   where e.profile_id = p.id and e.status = 'active'
)
order by (p.status <> 'deleted') desc, p.registered_at desc;


-- ---------------------------------------------------------------------------
-- BLOCO 3 — Saldo por ledger × esperado por plano, aluno a aluno
-- ---------------------------------------------------------------------------
-- `esperado_por_plano` só existe para plano com cota FINITA (`total`):
--     esperado = cota do plano + ajustes manuais - consumo (débitos/estornos)
-- Plano permissivo ou cota NULL = ilimitado: não há número a bater, a coluna
-- vem NULL e a situação sai como 'ilimitado'.
-- ---------------------------------------------------------------------------
with direito as (
  select
    e.profile_id,
    max(pl.id)                                                             as plan_id,
    max(pl.name)                                                           as plan_name,
    bool_or(pl.permissive)                                                 as permissive,
    max(pl.mentorship_credits)                                             as cota,
    max(pl.credit_period)                                                  as periodo,
    max(e.expires_at) filter (where e.kind = 'temporal')                   as expira_em,
    bool_or(e.kind = 'temporal'
            and e.expires_at is not null
            and e.expires_at <= now())                                     as vencido
  from educacional.profile_entitlements e
  left join educacional.plans pl on pl.id = e.plan_id
  where e.status = 'active'
  group by e.profile_id
),
ledger as (
  select
    profile_id,
    coalesce(sum(delta), 0)                                                as saldo,
    coalesce(sum(delta) filter (where reason = 'plan_grant'), 0)           as concedido_por_plano,
    coalesce(sum(delta) filter (where reason in ('admin_grant','admin_revoke')), 0) as ajuste_manual,
    coalesce(-sum(delta) filter (where reason = 'event_debit'), 0)         as consumido,
    coalesce(sum(delta) filter (where reason = 'event_refund'), 0)         as estornado,
    count(*)                                                               as lancamentos,
    max(created_at)                                                        as ultimo_lancamento
  from educacional.credit_ledger
  group by profile_id
)
select
  'saldo_por_aluno' as bloco,
  p.id,
  p.full_name,
  p.email,
  p.status                                                                 as status_do_perfil,
  d.plan_name,
  d.permissive,
  d.cota,
  d.periodo,
  d.expira_em,
  coalesce(d.vencido, false)                                               as vencido,
  coalesce(l.saldo, 0)                                                     as saldo_por_ledger,
  coalesce(l.concedido_por_plano, 0)                                       as concedido_por_plano,
  coalesce(l.ajuste_manual, 0)                                             as ajuste_manual,
  coalesce(l.consumido, 0)                                                 as consumido,
  coalesce(l.estornado, 0)                                                 as estornado,
  coalesce(l.lancamentos, 0)                                               as lancamentos,
  l.ultimo_lancamento,
  case
    when d.plan_id is null then null
    when d.permissive or d.cota is null or d.periodo <> 'total' then null
    else d.cota + coalesce(l.ajuste_manual, 0)
         - coalesce(l.consumido, 0) + coalesce(l.estornado, 0)
  end                                                                      as esperado_por_plano,
  case
    when d.plan_id is null                                    then 'SEM PLANO'
    when d.permissive                                         then 'ilimitado (permissivo)'
    when d.cota is null                                       then 'ilimitado (sem cota)'
    when d.periodo <> 'total'                                 then 'cota mensal (confira manualmente)'
    when coalesce(l.saldo, 0) < 0                             then 'SALDO NEGATIVO'
    when coalesce(l.saldo, 0) =
         d.cota + coalesce(l.ajuste_manual, 0)
         - coalesce(l.consumido, 0) + coalesce(l.estornado, 0) then 'ok'
    else 'DIVERGENTE'
  end                                                                      as situacao
from educacional.profiles p
left join direito d on d.profile_id = p.id
left join ledger  l on l.profile_id = p.id
where p.status <> 'deleted'          -- perfis excluídos ficam de fora do relatório
order by
  case
    when d.plan_id is null then 0
    when coalesce(l.saldo, 0) < 0 then 1
    when not d.permissive and d.cota is not null and d.periodo = 'total'
         and coalesce(l.saldo, 0) <> d.cota + coalesce(l.ajuste_manual, 0)
             - coalesce(l.consumido, 0) + coalesce(l.estornado, 0) then 2
    else 9
  end,
  p.full_name;


-- ---------------------------------------------------------------------------
-- BLOCO 4 — Sanidade estrutural (todas as contagens têm de ser ZERO)
-- ---------------------------------------------------------------------------
select
  'sanidade' as bloco,
  (select count(*) from (
     select profile_id from educacional.credit_ledger
      group by profile_id having sum(delta) < 0) s)                        as alunos_com_saldo_negativo,
  (select count(*) from educacional.profile_entitlements e
    where e.status = 'active' and e.source = 'plan' and e.plan_id is null) as entitlement_de_plano_sem_plano,
  (select count(*) from educacional.profile_entitlements e
    where e.source = 'manual'
      and (e.reason is null or e.granted_by is null or e.granted_at is null)) as manual_sem_auditoria,
  (select count(*) from educacional.credit_ledger
    where reason in ('admin_grant','admin_revoke')
      and (note is null or actor_profile_id is null))                      as ajuste_manual_sem_auditoria,
  (select count(*) from (
     select operation_key from educacional.credit_ledger
      group by operation_key having count(*) > 1) s)                       as chaves_de_idempotencia_repetidas,
  (select count(*) from (
     select profile_id, kind from educacional.profile_entitlements
      where status = 'active'
      group by profile_id, kind having count(*) > 1) s)                    as dimensao_ativa_duplicada,
  (select count(*) from educacional.profile_entitlements
    where status = 'active' and kind not in ('temporal','quantitative','catalog')) as dimensao_desconhecida;


-- ---------------------------------------------------------------------------
-- BLOCO 5 — Uso por plano
-- ---------------------------------------------------------------------------
select
  'por_plano' as bloco,
  pl.id,
  pl.slug,
  pl.name,
  pl.status,
  pl.permissive,
  pl.duration_months,
  pl.mentorship_credits,
  pl.credit_period,
  (select count(*) from educacional.plan_course_access a where a.plan_id = pl.id) as cursos_inclusos,
  count(distinct e.profile_id) filter (
    where e.status = 'active' and p.status <> 'deleted')                   as alunos_ativos,
  count(distinct e.profile_id) filter (where e.status = 'active')          as perfis_ativos_incl_excluidos,
  count(distinct e.profile_id) filter (where e.status = 'revoked')         as perfis_no_historico
from educacional.plans pl
left join educacional.profile_entitlements e on e.plan_id = pl.id
left join educacional.profiles p on p.id = e.profile_id
group by pl.id, pl.slug, pl.name, pl.status, pl.permissive,
         pl.duration_months, pl.mentorship_credits, pl.credit_period
order by pl.sort_order, pl.id;

-- ---------------------------------------------------------------------------
-- BLOCO 6 — Prazo de acesso (Tarefa 4)
-- ---------------------------------------------------------------------------
-- "Expirado" é DERIVADO (`expires_at <= now()`), nunca materializado: não
-- existe (e não deve existir) linha com status='expired' marcada por script —
-- o app só lê entitlements ativos, e marcar faria o vencido sumir da leitura.
-- O recorte é o MESMO da tela /admin/plans/expirations e do CSV: plano
-- permissivo não tem prazo, salvo prazo definido à mão.
select
  'prazo_resumo' as bloco,
  count(*)                                                    as com_prazo,
  count(*) filter (where e.expires_at <= now())               as expirados,
  count(*) filter (where e.expires_at > now()
                     and (e.expires_at at time zone 'America/Sao_Paulo')::date
                         - (now() at time zone 'America/Sao_Paulo')::date <= 30) as vence_em_30,
  count(*) filter (where e.expires_at > now()
                     and (e.expires_at at time zone 'America/Sao_Paulo')::date
                         - (now() at time zone 'America/Sao_Paulo')::date <= 60) as vence_em_60,
  count(*) filter (where e.expires_at > now()
                     and (e.expires_at at time zone 'America/Sao_Paulo')::date
                         - (now() at time zone 'America/Sao_Paulo')::date <= 90) as vence_em_90,
  count(*) filter (where e.source = 'manual')                 as definidos_a_mao,
  (select count(*) from educacional.profiles p2
    where p2.status <> 'deleted')                             as perfis_nao_excluidos
from educacional.profile_entitlements e
join educacional.profiles p on p.id = e.profile_id
left join educacional.plans pl on pl.id = e.plan_id
where e.kind = 'temporal' and e.status = 'active' and e.expires_at is not null
  and p.status <> 'deleted'
  and (e.source = 'manual' or coalesce(pl.permissive, false) = false);

-- Prazo definido à mão SEM auditoria completa: tem de dar ZERO linhas (o CHECK
-- profile_entitlements_manual_audit_ck impede, mas conferir é barato).
select
  'prazo_sem_auditoria' as bloco,
  e.id, e.profile_id, e.expires_at, e.reason, e.granted_by, e.granted_at
from educacional.profile_entitlements e
where e.source = 'manual'
  and (e.reason is null or btrim(e.reason) = ''
       or e.granted_by is null or e.granted_at is null);

-- Execuções do job de expiração (uma linha por dia e origem; rodar de novo com
-- o mesmo estado não escreve nada, então ran_at = updated_at é o normal).
select
  'prazo_execucoes' as bloco,
  run_key, source, lead_days, total_com_prazo, total_ativos,
  total_expirando, total_expirados, ran_by, ran_at, updated_at
from educacional.expiration_runs
order by ran_at desc
limit 10;
