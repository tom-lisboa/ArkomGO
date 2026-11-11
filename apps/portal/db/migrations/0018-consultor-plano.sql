-- 0018 — Gestor IA · modo Planejamento estratégico.
--
-- O roadmap gerado (título + 4 fases com itens do catálogo e estado de
-- conclusão por item) vive como jsonb na PRÓPRIA thread — um plano por
-- conversa, sempre enriquecido no servidor antes de persistir (refs validadas
-- contra o catálogo, igual aos cards do chat).
--
-- Aplicação (mesmo runbook da 0017): demo (app_arkom) como está; prod
-- (educacional) trocando o search_path. Sem policy/grant novos — a coluna
-- herda o contrato da tabela criada na 0017.
--
-- Idempotente: pode ser reaplicada sem efeito colateral.

set search_path = app_arkom;

alter table consultor_threads
  add column if not exists plan jsonb;
