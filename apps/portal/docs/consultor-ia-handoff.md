# Gestor IA — Handoff de desenvolvimento

> Estado em 05/08/2026, branch `feature/gestor-ia-final`, tudo funcionando ao vivo em dev.
> Feature construída espelhando o Gestor IA da Viver de IA (app.viverdeia.ai/consultor-ia),
> validada com benchmark de 5 personas contra o produto deles (ver `docs/benchmark-consultor-ia.html`).

## Sessão 05/08 — SPIN + Resultados + Genesis

Três evoluções nos prompts/contratos (validadas com E2E de LLM real, 3 cenários, tudo verde):

- **SPIN nas conversas**: os dois prompts (`agente.ts`) conduzem por Situação → Problema →
  Implicação → Necessidade. No modo consultor o `followup` é o degrau SPIN que falta (problema →
  implicação com o custo em números → necessidade dita pelo aluno); no planejamento a entrevista
  capta a implicação em números do aluno e a entrega do plano fecha o payoff com esses números.
  Regra dura: NUNCA inventar estatística/benchmark/caso de cliente; números são os do aluno.
- **Resultados**: campo `resultado` em cards (`RESULT_SCHEMA`) e itens do plano
  (`PLAN_ITEM_SCHEMA`), com `semTravessao` na normalização e queda junto com o motivo quando
  `motivoTrocado` acusa. UI: linha "Resultado" (label mono gold-700) no RecommendationCard, no
  PlanPanel e no PDF (`.cp-resultado`). Regra de honestidade: só mecanismo do item + aritmética
  dos números que o aluno deu, nomeada como estimativa; sem nada honesto, vazio.
- **Genesis como caminho de produto**: kind novo `genesis` (ref canônica `genesis`) — card
  sintético no `enrichCard` (url `/genesis`, accent `#c58b5f`), `motivoTrocado` pula o kind,
  CHECK da jornada estendido na migration `0019-consultor-journey-genesis.sql` (aplicada no
  docker local). Seção GENESIS nos dois prompts: o que é (entrevista guiada → projeto em 8 etapas
  reais do builder: Base de Conhecimento, Framework, Arquitetura e Fluxos, Ferramentas, Plano de
  Ação em 3 sprints, Prompt Lovable, Conteúdos e Economia; quem constrói é o ALUNO, com o prompt
  do MVP pronto pro Lovable), quando entra
  (nada no catálogo cobre o núcleo da dor; catálogo primeiro, sempre), e a instrução OBRIGATÓRIA
  de preparação da entrevista quando há card genesis (processo de hoje, quem usa, dados/sistemas,
  resultado esperado). No plano: no máximo 1 item genesis, raramente na fase 1.
- **Didática por item** (`didatica` no `PLAN_ITEM_SCHEMA` + `PlanoItem`): 2-4 frases de professor
  explicando por que implementar/assistir agora, o que destrava nas fases seguintes e o que trava
  se pular; para aula/curso, o que o aluno sai sabendo FAZER. Planos novos nascem com ela;
  antigos ganham backfill (`runEnriquecerDidatica`) na primeira abertura da apresentação, junto
  com o do cenário. Exibida na apresentação ("O que isso destrava") e no PDF.
- **PDF escuro no idioma da plataforma** (reescrita 06/08): a folha de impressão virou o espelho
  da aplicação, fundo #0e0e0e de sangra a sangra (@page margin 0), cards escuros com acento por
  item (--cp-ac), Marcellus, micro-labels mono, blocos "Por que agora" / "O que isso destrava" /
  "Resultado esperado", fecho com anel de progresso, meta, próximo passo e assinatura.
- **Apresentação "A Constelação"** (`/consultor/plano/[id]`, botão Apresentar no painel): tela
  cheia de scroll vertical com fases como capítulos, linha de constelação acendendo por scroll e
  fecho assinado. O plano ganhou `cenario` no jsonb (negocio/meta/dores/execucao, SÓ com o que o
  aluno disse; PLAN_SCHEMA preenche nos planos novos e `runResumirCenario` faz backfill nos
  antigos ao abrir a apresentação). A página enriquece itens com a descrição REAL de catálogo
  (`enrichCard`) e computa o próximo passo. O Exportar PDF (chat e apresentação) virou documento
  editorial: capa Marcellus, grade do cenário, fases com objetivo serifado, resultado em caixa
  destacada, resumo com barras por fase, próximo passo e assinatura (`PlanPrintSheet` +
  `@media print` do consultor.css).

  ⚠️ **Correção 05/08 (PR #11)**: a versão original desta seção prometia um "botão Executar" que
  constrói na infra da Arkom, com banco e hospedagem inclusos. Isso veio da linha antiga da branch
  (`c5e0ac1`), onde a esteira `src/lib/genesis-build/` existia; ela foi REMOVIDA no `e8426a7`
  ("main prevalece em genesis/builder") e não existe na main. O texto do prompt veio junto no
  merge do PR #10 e ficou prometendo recurso inexistente. Ao mexer nesta seção, confira o que o
  builder REALMENTE entrega em `src/lib/builder-types.ts` (`STEP_META`).

## O que existe e funciona

Página `/consultor` (área do aluno) com DOIS modos sobre a mesma thread de chat:

- **Modo consultor**: pergunta → resposta consultiva + cards de recomendação (solução/curso/aula
  com deep-link real) + pergunta de follow-up. Painel lateral "Sua Jornada" acumula recomendações.
- **Modo planejamento estratégico**: botão no topo → fala inicial canned → entrevista conversacional
  (capta negócio, objetivo, dor, o que já tentou, quem implementa/tempo) → roadmap em 4 fases
  fixas no painel lateral, com progresso, checkbox persistente por item e esforço estimado.
  O painel também tem: **Exportar PDF** (window.print + folha de impressão própria), **reordenar
  itens** dentro da fase (setinhas, persiste no jsonb) e **regenerar fase** (nova versão via LLM
  com a mesma entrevista, sem repetir refs das outras fases).

### Garantia das 4 fases (fechado em 04/08/2026, à noite)

O plano NUNCA sai com menos de 4 fases. Três camadas em `montarPlano` (rota do chat):
1. prompt reforçado (refs conferidas letra a letra, 4 fases obrigatórias, motivo cita o item);
2. fase vazia após o enriquecimento → UM retry cirúrgico (`runPreencherFases`) pedindo ao modelo
   só as fases que faltam, proibindo refs já usadas (mesmo system prompt → cache hit);
3. ainda vazia → redistribuição determinística: fases vizinhas fartas cedem item (a anterior cede
   o último, a seguinte cede o primeiro), sem inventar nada.
Coerência motivo-item: `motivoTrocado` (catalogo.ts) detecta motivo que cita o NOME de outro item
do catálogo sem citar o próprio (whitelist para curso↔aula relacionados); quando acusa, o motivo
cai para a descrição real do item (`semTravessao` aplicado) e loga `[consultor] motivo trocado`.

### Arquivos (todos repo-relativos)

| Camada | Arquivo | Papel |
|---|---|---|
| Migrations | `db/migrations/0017-consultor-ia.sql` | `consultor_threads` (com `mode`), `consultor_messages` (cards jsonb, followup), `consultor_journey`. Padrão 0009 (RLS + policy arkom_runtime). |
| | `db/migrations/0018-consultor-plano.sql` | Coluna `plan` jsonb na thread (roadmap enriquecido + done por item). |
| Tipos | `src/lib/consultor/tipos.ts` | Contratos client/server: `ConsultorCard`, `PlanoEstrategico/PlanoFase/PlanoItem`, `FASES_PLANO` (nomes fixos das 4 fases), `ChatResponse`, `ThreadResponse`. |
| Grounding | `src/lib/consultor/catalogo.ts` | Monta o prompt-catálogo com dados REAIS: courses/lessons (com progresso do aluno!) + apps + o Mapa Arkom completo (`DEPARTMENTS` do skilltree) como camada de conhecimento não-recomendável. `enrichCard()` = anti-alucinação: ref fora do catálogo é descartada. Acento por item vem da paleta dos apps/cursos. |
| Agente | `src/lib/consultor/agente.ts` | Multi-provider (padrão do `lib/builder.ts`): anthropic direto (tool forçada + cache_control no system), openai via edge central `bai_builder-llm`, mock determinístico. Dois prompts (consultor/planejamento), dois schemas (`RESULT_SCHEMA`/`PLAN_SCHEMA` com gate `pronto`) + schemas de reparo (`refillSchema`/`REGEN_SCHEMA`). `runPreencherFases` (retry cirúrgico das fases vazias) e `runRegenerarFase` (nova versão de uma fase), ambos com mock. `semTravessao()` (exportada) remove travessões de TODA saída (diretriz do dono: nunca usar "—" ou " - " como pontuação; hífens intra-palavra preservados). |
| Store | `src/lib/consultor/store.ts` | Threads/mensagens/jornada/plano via `getSql()` (search_path do runtime — NUNCA prefixar schema). `togglePlanItem` = servidor é autoridade do jsonb. Rate limit simples `countUserMessages24h` (env `CONSULTOR_MAX_MSGS_24H`, default 50). |
| Rotas | `src/app/(aluno)/consultor/api/chat/route.ts` | POST: guard 401/403 (padrão `/api/dash`), `start:true`+`mode:'planejamento'` cria thread com abertura canned sem LLM; turno normal roda o agente, enriquece cards/plano, persiste. `montarPlano` = as 3 camadas da garantia de 4 fases. `maxDuration=120`. |
| | `src/app/(aluno)/consultor/api/thread/[id]/route.ts` | GET: mensagens + jornada + mode + plan (dono validado). |
| | `src/app/(aluno)/consultor/api/thread/[id]/plan/route.ts` | PATCH `{fase, item, done}` → toggle · `{fase, from, to}` → reordena (ambos no jsonb, servidor é autoridade). |
| | `src/app/(aluno)/consultor/api/thread/[id]/plan/regenerar/route.ts` | POST `{fase}` → nova versão da fase via `runRegenerarFase` (entrevista como contexto, refs válidas, sem repetir outras fases; done volta a false). `maxDuration=120`. |
| UI | `src/app/(aluno)/consultor/page.tsx` | Server Component: requireUser + threads + categorias; fallback amigável se migration ausente. |
| | `src/app/(aluno)/consultor/consultor-chat.tsx` | Client. Skin 100% tokens `st-*` (NUNCA usar vocabulário genesis `text-primary`/`bg-surface` fora do `.genesis-scope` — foi a causa do primeiro design ruim). Idioma das Capacitações: cards `rounded-[14px] border-st-line-2 bg-st-card` + relevo `--st-elev-*`, micro-labels mono uppercase, display Marcellus no hero, cobre `gold-700` como assinatura. `CardMedia` = idioma MediaSurface (thumb com onError → glow do acento + inicial; nunca imagem quebrada). Loader com variações sorteadas por turno (`LOADER_VARIANTS`). Avatar = `ArkomOrb` (só a bolinha; componente novo em `src/components/ArkomLogo.tsx`). Mic com Whisper-first. |
| | `src/app/(aluno)/consultor/consultor.css` | `.consultor-elev`, `.consultor-composer` (bevel+rest, foco = ring), animação de entrada, prefers-reduced-motion. |
| Compartilhado | `src/components/mic-btn.tsx` | Ditado por voz extraído do genesis/builder-wizard (que agora o importa). `prefer="whisper"` = grava e transcreve server-side via `/genesis/api/transcrever` (whisper-1 na edge `bai_builder-stt`); Web Speech como fallback. |
| Menu | `src/components/Shell.tsx` | Item `{ label: "Gestor IA", href: "/consultor", icon: MessagesSquare }` (padrão Genesis, sem i18n). |
| Benchmark | `docs/benchmark-consultor-ia.html` | Relatório completo Arkom vs VdI, 5 personas × 2 modos. |

### Ambiente local

- Postgres no docker `arkom-pg` (localhost:54330). Migrations aplicadas via
  `docker cp` + `docker exec arkom-pg psql -U postgres -d postgres -f ...` (o
  `genesis_migrator` NÃO tem CREATE em `app_arkom`; a credencial de operador
  `ARKOM_MIGRATION_DATABASE_URL` não existe nesta máquina).
- Em produção (`ARKOM_RUNTIME_SCHEMA=educacional`): aplicar 0017/0018/0019 trocando o
  search_path e pulando policies (nota no cabeçalho de cada migration). Sem a 0019 o card
  genesis não entra na jornada (o INSERT é tolerante e só loga warn, o turno não quebra).
- LLM real via `ANTHROPIC_API_KEY` do `.env.local` (auto-provider). Mock roda sem chave.
- Dev server: `npm run dev` (3000). Sessão de teste local: cookie `arkom_session`
  cunhado com `ARKOM_SESSION_SECRET` (uid=2 = João Silva do seed) — só para testes via API.

## Benchmark (resumo — detalhes no HTML)

Vencemos em: velocidade (7-12s vs 30-90s), estabilidade (VdI travou o stream de abertura
do planejamento 5/5 vezes), títulos sem vazamento (eles vazaram o negócio do usuário logado
3/5), personalização por progresso do aluno ("você já concluiu as aulas 1 a 5"), anti-alucinação.

Perdíamos em (estado do benchmark original): **profundidade de catálogo** (eles têm soluções
nichadas por setor + mentorias humanas), **riqueza do painel do plano** e **consistência dos
planos**. Os dois últimos foram FECHADOS em 04/08/2026 à noite: 4 fases garantidas em 3 camadas,
coerência motivo-item, PDF, reordenação e regeneração de fase (validado E2E com LLM real, duas
personas: Marina/agência via API e Carlos/e-commerce via UI).

Bug do benchmark capturado e fechado: card com motivo trocado (Paula: ref SOCIAL, texto
descrevia um CRM) → `motivoTrocado` + prompt.

## Backlog priorizado

1. Catálogo nichado por setor (maior gap restante; decisão de produto, não só código).
2. ~~Consistência: 4 fases sempre~~ ✅ 04/08/2026 (montarPlano em 3 camadas).
3. ~~Coerência motivo-item~~ ✅ 04/08/2026 (motivoTrocado no enriquecimento).
4. Tipo "mentoria" como card (tabela `mentorship_events` já existe no schema).
5. ~~Painel do plano: PDF + reordenar + regenerar fase~~ ✅ 04/08/2026.
6. Streaming da resposta.

## Convenções que NÃO podem ser violadas

- UI só com tokens `st-*`/`gold-700` (+ classes utilitárias das Capacitações); nada de
  `text-primary`/`bg-surface` fora de `.genesis-scope`.
- Nenhum travessão em texto exibido como fala da IA (prompt + `semTravessao`).
- SQL sempre relativa ao schema (o `getSql()` aplica o search_path).
- LLM devolve só refs; metadados vêm do `enrichCard` (anti-alucinação).
- Rotas de API: guard `getSessionUser` + `must_change_password` (401/403, nunca redirect).
- `tsc --noEmit` + eslint dos arquivos tocados antes de dar por pronto (lint do repo
  inteiro quebra nos bundles `.genesis-apps` — pré-existente, ignorar).
