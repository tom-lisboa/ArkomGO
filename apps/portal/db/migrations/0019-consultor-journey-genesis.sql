-- 0019 — Gestor IA: a jornada aceita o card "genesis" (construir a solução
-- que não existe no catálogo, via /genesis).
--
-- O kind 'genesis' entrou em src/lib/consultor/tipos.ts: card sintético com
-- ref fixa "genesis" (enrichCard), sem item de catálogo por trás. Só a
-- consultor_journey tem CHECK de kind; consultor_messages guarda cards em
-- jsonb e não precisa de nada.
--
-- Aplicação (mesmo runbook do db/migrations/README.md):
--   • demo  (app_arkom):    aplicar como está.
--   • prod  (educacional):  trocar o search_path para `educacional`.
--
-- Idempotente: pode ser reaplicada sem efeito colateral.

set search_path = app_arkom;

alter table consultor_journey
  drop constraint if exists consultor_journey_kind_check;

alter table consultor_journey
  add constraint consultor_journey_kind_check
  check (kind in ('solucao', 'curso', 'aula', 'genesis'));
