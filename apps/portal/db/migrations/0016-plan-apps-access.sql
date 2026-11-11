-- 0016-plan-apps-access.sql
-- ============================================================================
-- ALVO: schema `educacional` do banco central (auytmefqnuzbktyzcled).
--   NÃO toca `app_arkom`, NÃO toca `core`, NÃO cria tabela nova.
--
-- OBJETIVO (ClickUp 86ajrgzef — pedido do time comercial): o plano passa a
-- dizer se libera OU NÃO os "Apps e Templates". É um liga/desliga ÚNICO, do
-- plano inteiro — não há seleção app a app.
--
--   educacional.plans.apps_included boolean not null default true
--
-- ─── POR QUE UM BOOLEANO NO PLANO, E NÃO UMA `plan_app_access` (N:N) ───────
-- O pedido é explícito: "Não separados. Apenas liberar todos ou não liberar
-- nenhum." Uma tabela N:N (espelho de `plan_course_access`) criaria uma
-- segunda lista para a Carol manter em dia — e, pior, um app novo publicado
-- amanhã NÃO entraria nos planos existentes, então "liberar todos" viraria
-- "liberar os que existiam no dia em que o plano foi criado". O booleano
-- cobre inclusive os apps criados depois, que é o que "todos" significa.
--
-- ─── POR QUE `default true` ───────────────────────────────────────────────
-- `true` é EXATAMENTE o comportamento de hoje: todo aluno logado vê os Apps.
-- Aplicar esta migration, portanto, não muda nada para ninguém — nem antes,
-- nem depois do deploy do código. Só passa a existir a POSSIBILIDADE de um
-- plano ser criado com os apps fechados (o "plano de FUP" do comercial: o lead
-- entra, faz o curso da Arkom e vê o resto bloqueado).
--
-- Plano PERMISSIVO ignora a coluna por definição (catálogo inteiro): o valor
-- é normalizado para `true` na action do /admin, para o banco não guardar
-- contradição — mesma doutrina de duração/cota/cursos na 0011.
--
-- ADITIVA e IDEMPOTENTE: um único `add column if not exists` com default e um
-- comentário de coluna. Não altera nenhuma linha existente (o default vale para
-- as que já existem, e `true` = o direito que elas já davam na prática), não
-- cria índice, não mexe em RLS/grants (a tabela `plans` já os tem desde a 0011,
-- e coluna nova herda o ACL da tabela). Rodar duas vezes produz o mesmo estado.
--
-- ROLLBACK: `alter table educacional.plans drop column if exists apps_included;`
-- O código degrada sozinho se a coluna sumir (erro 42703 ⇒ apps liberados), do
-- mesmo jeito que a 0012 degradou o custo de crédito.
--
-- APLICAÇÃO: operador autorizado com direitos de OWNER — as roles de runtime
-- (`educacional_app`, `arkom_app_login`) NÃO fazem DDL. Na prática: Management
-- API do Supabase (roda como `postgres`).
-- ============================================================================

alter table educacional.plans
  add column if not exists apps_included boolean not null default true;

comment on column educacional.plans.apps_included is
  'true = o plano libera TODOS os apps e templates (inclusive os publicados depois); false = nenhum. Liga/desliga único, sem seleção app a app (ClickUp 86ajrgzef). Plano permissivo ignora e libera sempre.';
