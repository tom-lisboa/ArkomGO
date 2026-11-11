# TRACKING — credit-system (plataforma do aluno: entitlements · créditos · mentor · catálogo · prazo)

> Substitui os cards do ClickUp (decisão do dono, 2026-07-25): tracking vive no repo, na branch `credit-system`.
> Plano-fonte: `solutions/docs/arkom-plano-corrigido.md` (workspace bilhonos). Execução orquestrada com agentes opus-5.

## Registro de decisões

### D1 — Schema alvo das migrations (2026-07-25)
**Decisão (dono):** `educacional` REAL (não `educacional_test`). Tabelas novas aditivas + backfill direto no schema de prod, tudo atrás de flag desligada. Rollback = DROP das tabelas novas (nenhuma tabela existente é alterada além de colunas nullable aditivas).

### D2 — DoR de backup (2026-07-25)
**Decisão (dono):** dump + restore-test real ANTES de qualquer DDL. **Cumprido:**
- `pg_dump --schema=educacional` (custom + plain) → `C:\Users\tech\backups\educacional-20260725\` (932KB / 3MB).
- Restore-test em cluster PostgreSQL 17.5 local scratch (initdb + pg_restore, stub `auth.users` p/ a única FK cross-schema) — **exit 0, zero erros**.
- Validação fonte × restaurado: **22 tabelas · 58 profiles · 26 mentorship_events · 37 event_confirmations · 8 courses** — idêntico.
- Cluster scratch destruído após o teste; dump guardado em disco (fora do repo).

### D3 — Tracking (2026-07-25)
**Decisão (dono):** registrar no repo (este arquivo) em vez de cards no ClickUp.

### D4 — Regras comerciais (defaults do plano, sem veto)
- E0: débito como POLICY (`on_confirmation` | `on_participation`); fase 1 = `on_confirmation`.
- E1: estorno de cancelamento até 30 min antes do evento.
- E2: no-show cobra sob `on_confirmation`; não cobra sob `on_participation` (alvo).
- E3: cancelamento pelo Arkom = estorno automático para todos.
- E4: mentor marca presença por evento (sub-feature da Tarefa 2) → habilita `on_participation`.
- X1: expirado mantém ver catálogo, não consome. X2: grace 0 (sem corte durante mentoria em andamento). X3: expirado vê o próprio progresso.

### D5 — Fundação de feature flags (C4, 2026-07-25)
Ambiguidades resolvidas pelo builder da fundação (nenhuma exigiu veto do dono):
- **`updated_by` é TEXT livre** (e-mail do admin da sessão), não FK `integer → profiles(id)` como no esboço do recon: o carimbo de auditoria precisa sobreviver à exclusão do perfil e não pode criar dependência de escrita entre tabelas.
- **Sem coluna `description` no banco.** A copy pt-BR de cada flag é UI e vive no código (`FLAG_CATALOG` em `src/app/admin/settings/feature-flags-manager.tsx`); flag desconhecida cai no fallback com a própria chave.
- **Rota `/admin/settings`** (label pt-BR "Configurações" na nav) — as rotas do /admin são todas em inglês; só os labels são pt-BR. Manager co-locado com a rota (como `admin-nav.tsx`), por ser chrome de uma tela só e não conteúdo/dados.
- **Cache do helper: 30s + `invalidateFlagCache()` na action.** Uma query traz todas as flags (checar N flags numa request custa uma). Erro/tabela ausente ⇒ tudo desligado, com TTL curto (5s) para não grudar num blip.
- ⚠ **`npm run check` já falhava antes desta branch:** 9 erros de lint (`react-hooks/set-state-in-effect`, `refs`, `use-memo`) em 8 arquivos do aluno, vindos das regras novas do `eslint-config-next@16.2.1`. Nenhum é de arquivo tocado aqui; typecheck e build passam limpos. Decidir em C10 se o baseline de lint entra no escopo.

### D6 — Núcleo de entitlements + ledger (C5, 2026-07-25)
Decisões do builder da Tarefa 0 (nenhuma exigiu veto do dono):
- **Backfill cobre os 58 perfis, inclusive os 12 `deleted`** (decisão do orquestrador, contra a recomendação "só os 46" do recon). Motivo: a exclusão no app é lógica e um perfil `deleted` volta a ser usado pelo fluxo de criação de aluno (`create-user.ts` reativa por e-mail); cobrir todo mundo dá "zero órfãos" estável e reaplicação inerte. A **reconciliação reporta os ativos em separado** (`perfis_ativos_sem_plano`, e o BLOCO 3 filtra `status <> 'deleted'`).
- **Entitlement é materializado em TRÊS linhas por perfil** (`temporal` · `quantitative` · `catalog`) — 58 × 3 = 174. É o que dá sentido ao índice único parcial `(profile_id, kind) WHERE status='active'` do esboço do recon e o que torna o backfill idempotente por `ON CONFLICT`.
- **Duração do plano em MESES** (`plans.duration_months`), não em dias como no esboço: é a unidade comercial real. `NULL` = vitalício. Materializa `expires_at = now() + make_interval(months => N)`.
- **Cota de mentorias com período** (`mentorship_credits` + `credit_period` `'total'|'month'`): o esboço tinha só o número. `NULL` = ilimitado.
- **Flag `permissive` no plano** = catálogo inteiro + mentorias ilimitadas + sem prazo. O plano "Legado" é permissivo, e por isso **não tem linha em `plan_course_access`** — permissivo cobre inclusive cursos criados depois. A action zera duração/cota/cursos quando o plano é permissivo, para o banco não guardar contradição.
- **Ledger append-only de verdade**: além de não ter coluna de saldo, `credit_ledger` tem trigger que levanta exceção em UPDATE/DELETE/TRUNCATE **e** a role de runtime só recebe `SELECT, INSERT` (o `revoke update, delete, truncate` é explícito porque o default ACL do schema concede `arwd`). Correção = movimento compensatório. `profile_id` usa `ON DELETE RESTRICT` (registro contábil).
- **Auditoria obrigatória por CHECK**: entitlement `source='manual'` exige `reason` + `granted_by` + `granted_at`; lançamento `admin_grant`/`admin_revoke` exige `note` + `actor_profile_id`. Não dá para conceder crédito manual sem motivo nem autor, mesmo por SQL cru.
- **Idempotência da concessão manual vem do cliente**: o modal gera um `crypto.randomUUID()` ao abrir e envia como chave — duplo clique/retry não lança duas vezes. Chave por tempo (`Date.now()`) seria idempotência de mentira.
- **`sessionPayload` virou `async`** (`src/app/api/auth/_shared.ts`) para os DOIS produtores do perfil (`_shared.ts` e `layout.tsx`) derivarem `isPro` da mesma função `isPro()` de `src/lib/entitlements.ts`. Callers (`/api/auth/session`, `/api/auth/login`) passaram a `await`.
- **⚠ O que muda quando `entitlements_enabled` for LIGADA:** hoje `isPro` = só admin. Ligada, `isPro` passa a ser "tem entitlement ativo e dentro do prazo" — e como o backfill deu o plano **Legado permissivo** a todo mundo, **todos os 46 alunos ativos viram Pro**. É o comportamento pretendido (o Legado preserva/normaliza o acesso de quem já era aluno), mas é uma mudança visível de UI (paywall, brain, tree). Ligar só com o dono ciente.
- **`hasCourseAccess` é fail-OPEN**: flag desligada, perfil sem plano ou erro de banco ⇒ `true`. Entitlement mal lido não pode trancar aluno fora do produto.
- **`debitCredit` não bloqueia por saldo por padrão** (`enforceBalance` opcional): quem decide a política de bloqueio é a Tarefa 1, atrás de flag. Quando ligado, a checagem "conferir saldo → gravar" roda sob `pg_advisory_xact_lock(424211, profile_id)`, então dois débitos simultâneos não furam o zero. A remoção manual pelo /admin usa `enforceBalance: true`.
- **Reatribuir o MESMO plano é recusado** ("o aluno já está no plano X"): mata o duplo clique e evita concessão dupla de créditos. Renovação explícita fica para a Tarefa 4.
- **`sort_order` do plano é automático** (`MAX+1`) — não há reordenação manual nesta etapa; a ordem só afeta a listagem do /admin.

### D7 — Créditos na confirmação de presença (C6, 2026-07-25)
Decisões do builder da Tarefa 1 (nenhuma exigiu veto do dono):
- **`event_kind` é TEXT + CHECK com DOIS valores** (`mentoria_arkom` | `live_comunidade`), não um `enum` nem os três valores do esboço do recon (`mentoria`/`live`/`laboratorio`). Motivo: a pergunta que o produto faz é binária — *cobra ou não cobra*. `laboratorio` seria um terceiro rótulo sem consequência comercial, e um `enum` de verdade tornaria "acrescentar um valor" um `ALTER TYPE` (que não roda em qualquer transação) em vez de um `ALTER` de constraint.
- **Default de `event_kind` = `live_comunidade`** (não cobra). Qualquer caminho que ainda não conheça a coluna (seed, script antigo, INSERT manual) cria evento que **não cobra crédito**. O erro possível é deixar de cobrar, nunca cobrar sem querer.
- **`credit_cost` NOT NULL DEFAULT 1, sem CHECK cruzado com `event_kind`.** Um CHECK do tipo "live ⇒ custo 0" faria o INSERT atual do /admin (que não cita as colunas novas) estourar — mudança de comportamento com as flags desligadas, inaceitável. A coerência é garantida em dois lugares mais baratos: o custo EFETIVO é `kind = 'mentoria_arkom' ? credit_cost : 0` (`src/lib/credit-policy.ts` e `eventCreditCost`), e a action do /admin zera o custo quando o evento é live.
- **Classificação dos 26 por ID, com guarda de reaplicação.** O backfill da 0012 só roda enquanto NENHUM evento estiver marcado como mentoria (ou seja, enquanto a coluna estiver no default de fábrica em todas as linhas). Reaplicar a migration depois de a Carol revisar não desfaz o trabalho dela — testado no banco com rollback.
- **Cancelamento pelo Arkom não inventa `status='cancelled'`.** Mexer no CHECK de `status` de uma tabela viva é risco à toa: o cancelamento **despublica** (o evento some do calendário do aluno) e carimba as colunas novas `cancelled_at`/`cancelled_by`. Confirmações e histórico ficam intactos.
- **A chave de idempotência do débito é por CICLO: `confirm:evt=<e>:perfil=<p>:c=<n>`**, com `n` = quantos estornos aquele par já teve. Com a chave "estável pura" do plano (`confirm:{event}:{profile}`) o toggle vira impressora de dinheiro: confirmar (−1) → cancelar (+1) → confirmar (chave repetida, **não** cobra) → cancelar (+1) e o aluno termina com crédito a mais. Dentro do mesmo ciclo a chave não varia, então duplo clique/retry/duas abas continuam dando **um** débito. Estorno usa `refund:evt=<e>:perfil=<p>:n=<k>` e só existe enquanto houver débito em aberto.
- **O estorno devolve o que FOI debitado, não o custo atual do evento** (o /admin pode ter editado `credit_cost` no meio). Vem de `SUM` do ledger daquele par.
- **Plano ilimitado/permissivo não gera lançamento nenhum.** "Ilimitado" não é um número: debitar quem tem o plano Legado só produziria saldo negativo sem significado. Ilimitado ⇒ confirma, não debita, não bloqueia — e a UI mostra "mentorias ilimitadas".
- **`credit_blocking_enabled` sozinha NÃO bloqueia**: sem `entitlements_enabled` não existe plano, prazo nem cota, e barrar no vácuo seria barrar por engano. Nesse estado o sistema **cai para o modo sombra** (registra, não bloqueia). A copy da flag em `/admin/settings` avisa.
- **O veredito `expirado` é calculado sempre, mas só bloqueia com `expiration_enforcement` ligada** (a flag é da Tarefa 4). Até lá, vencido com saldo ainda confirma — e a sombra registra `would_block_expirado`, que é justamente como se mede o impacto antes de ligar. Por isso a decisão carrega dois campos: `verdict` (real, vai para o diário) e `verdictAplicado` (o que a flag de hoje aplica, de onde sai a mensagem).
- **Sombra grava em tabela própria (`credit_shadow_log`), nunca no ledger.** Sombra observa; não escreve dívida. O diário também é append-only (trigger + grant só de SELECT/INSERT) e registra tanto o modo `shadow` quanto o `enforce` (a coluna `enforced` separa "teria" de "foi").
- **Estorno acontece mesmo em modo sombra** se houver débito em aberto (dinheiro que já saiu tem de poder voltar, independentemente de flag).
- **Janela E1 medida pelo relógio do BANCO, em `America/Sao_Paulo`.** `event_date`/`starts_at` são TEXT sem fuso; o servidor roda em UTC. Fixar o fuso do produto no SQL evita mandar o aluno para a janela errada por 3 horas. Dado malformado ⇒ janela considerada aberta (a favor do aluno).
- **`debitCredit`/`creditCredit` ganharam irmãs transacionais** (`debitCreditIn`/`creditCreditIn`, mesmo miolo) porque a confirmação precisa que o upsert em `event_confirmations`, o lançamento no ledger e o registro da sombra caiam ou passem JUNTOS. Nada foi reimplementado: as versões públicas agora são `sql.begin(tx => …In(tx, …))`.
- **Política `on_participation` já tem o gancho pronto**: `debitForParticipation(eventId, profileId)` em `credit-policy.ts` (idempotente por `participation:evt=…:perfil=…`, sem `enforceBalance` — presença já aconteceu, não se reescreve o passado). A Tarefa 2 só precisa chamá-la.
- **Degradação por `42703`** (coluna ausente) além do `42P01` já usado no repo: ambiente sem a 0012 (dev em `app_arkom`) cai no toggle puro, e o /admin esconde os campos de crédito.

#### Classificação dos 26 eventos — **para a Carol revisar**
`mentoria_arkom` = consome 1 crédito · `live_comunidade` = aberta, não consome.

| Classificação | Qtd | IDs | Títulos |
|---|---|---|---|
| ✅ `mentoria_arkom` | 18 | 21, 22, 23, 24, 27, 28, 30, 31, 34, 36, 37, 38, 41, 42, 43, 44, 45, 49 | "Mentoria", "Mentoria Geral", "Mentoria Implementação", "Mentoria de Implementação" |
| ⚠ `live_comunidade` (revisar) | 3 | 25, 32, 39 | Laboratório |
| ⚠ `live_comunidade` (revisar) | 1 | 29 | Criação de PRD no MegaBrain |
| ⚠ `live_comunidade` (revisar) | 1 | 35 | Sinkronizando Operações |
| ⚠ `live_comunidade` (revisar) | 1 | 46 | Raio-X \| Análise de Campanhas e Funis |
| ⚠ `live_comunidade` (revisar) | 2 | 47, 48 | Raio X \| Análise de Campanhas |

Os 8 marcados com ⚠ **não têm "mentoria" no título** e foram classificados como live por prudência (na dúvida, não cobra). Se algum deles for mentoria paga, a Carol muda em `/admin/mentorships` → coluna "Tipo / custo" → editar. Vale na hora, sem deploy.

### D8 — Rails de curso configuráveis (C7, 2026-07-25)
Decisões do builder da Tarefa 3 (nenhuma exigiu veto do dono):
- **O "Top" foi semeado como composição MANUAL, não como filtro automático.** A regra do plano ("cadastrar curso novo NÃO altera o Top 5") só se sustenta com curadoria: qualquer modo automático mexeria no Top a cada curso publicado. O modo automático equivalente ao código de hoje (`top` = publicados com aula) **existe** na tabela e fica à disposição da Carol — provado no banco: com um 9º curso fictício, `manual` fica em 5 e `top` iria a 6.
- **Quatro modos, não três** (`manual` · `todos` · `top` · `em_breve`). `em_breve` é automático de propósito: curso publicado sem aula entra sozinho e **sai sozinho** quando ganha a primeira aula — é exatamente o comportamento de hoje, e transformá-lo em manual criaria trabalho recorrente para a Carol.
- **Título com o marcador `{n}`.** Hoje o título é i18n com contagem viva (`Top ${n} cursos no Brasil`). Vindo do banco vira texto livre; o `{n}` preserva a contagem. **Consequência assumida:** com a flag ligada o título da prateleira deixa de ser traduzido para EN (é conteúdo da Carol, não chrome) — mesmo precedente de `home_settings.featured_title` (0009). Flag desligada, os títulos i18n continuam.
- **Sem colunas de override por slot** (título/capa/cor/link, que `home_featured_slots` tem). Lá o card da vitrine é diferente do card do app; aqui o card do curso já é derivado de `courses`, e overrides criariam um segundo catálogo para manter em dia.
- **`gap` e `peek` não são configuráveis — derivam do estilo do card.** `rank` → gap 32 + 4,5 cards visíveis (exatamente o hardcoded do Top); `poster` → gap 24, larguras naturais. Assim a prateleira cabe no desktop padrão sem scroll quebrado, o mobile mantém o comportamento atual do `CourseRail` (arrastar + chevrons), e o componente compartilhado **não foi tocado**. Pelo mesmo motivo não existe `subtitle`: o cabeçalho do rail é ícone + título, e um subtítulo mudaria o componente.
- **Estado vazio: prateleira sem curso não renderiza** (idêntico ao `cards.length > 0 ? … : null` de hoje). E se NENHUMA prateleira habilitada produzir curso, o loader devolve `null` e a página **cai de volta para o layout hardcoded** — configuração ruim nunca deixa o aluno com catálogo em branco (mesma doutrina fail-open do `hasCourseAccess`).
- **A única mudança de comportamento do cutover é "Em breve" deixar de ser clicável** (regra do plano). Visualmente o card é o mesmo; ele só não navega mais. Virou a coluna `clickable`, então a Carol reverte sem deploy. `PortraitCard`/`TopNineCard` ganharam a prop opcional `disabled` (default = clicável ⇒ flag desligada não muda nada).
- **A prateleira "Todos os cursos" foi semeada DESLIGADA.** A seção pedida pelo plano fica pronta a um clique, sem quebrar a neutralidade do cutover — ligada hoje, ela repetiria os 8 cursos já mostrados nas outras duas.
- **`item_limit` semeado NULL** (sem teto), de novo por neutralidade. O teto configurável do "Em breve" existe (1 a 24) e é decisão da Carol.
- **Guarda de reaplicação no seed do Top**: a composição só é semeada enquanto a prateleira estiver **vazia**. Testado no banco dentro de transação com rollback — removi o HeyGen do Top, reapliquei o bloco da migration e ele **não** voltou.
- **Rota `/admin/trainings/rails`** ("Vitrine do catálogo"), com botão no cabeçalho de `/admin/trainings`, em vez de um 11º item na nav lateral: prateleira é conteúdo da Universidade IA, não uma área própria. Mantém a convenção rota-em-inglês / label-pt-BR (D5).
- **O preview do /admin usa a MESMA função de resolução do /trainings** (`resolveRailCourseIds`, em `src/components/trainings/rails.ts`): o que a Carol vê no preview é, por construção, o que o aluno vê.
- **Degradação por `42P01`** (ambiente sem a 0013, ex.: dev em `app_arkom`): loader devolve `null` (rails hardcoded) e o /admin mostra "Banco ainda não preparado".

#### Composição efetiva com o seed (8 cursos reais, flag ligada)
| # | Prateleira | Modo | Estilo | Clicável | Título renderizado | Cursos |
|---|---|---|---|---|---|---|
| 0 | `top` | manual | ranking | sim | **Top 5 cursos no Brasil** | 15 N8N · 11 Claude Code · 12 Lovable · 13 HeyGen · 16 CODEX |
| 1 | `em-breve` | automático | pôster | **não** | **Em breve** | 17 GPT · 19 SHOPIFY · 20 Antigravity |
| 2 | `todos` (desligada) | automático | pôster | sim | Todos os cursos | os 8, na ordem do catálogo |

Idêntico ao que o código hardcoded renderiza hoje (mesmas rails, mesma composição, mesma ordem).

### D9 — Mentores + lista de presença (C8, 2026-07-25)
Decisões do builder da Tarefa 2 (nenhuma exigiu veto do dono):
- **`event_attendance` é STATEFUL, não append-only** — ao contrário de `credit_ledger` (0011) e `credit_shadow_log` (0012). O ledger é append-only porque registra DINHEIRO: corrigir é lançar um movimento novo. A presença registra um FATO do mundo que o mentor pode ter digitado errado; guardar cada correção como linha nova obrigaria toda leitura a fazer "a última linha vence" — mais caro e mais fácil de errar do que um UPSERT com `unique (event_id, profile_id)`. A auditoria vive em `marked_by` + `marked_at`, reescritos a cada mudança, e a consequência financeira continua no ledger append-only: **corrigir presença nunca reescreve a história do dinheiro**.
- **TRÊS estados de presença, não dois**: linha ausente = "ainda não aferido", `attended = true` = presente, `attended = false` = o mentor conferiu e o aluno faltou. Sem o terceiro estado não dá para responder "quantos eventos foram efetivamente chamados" nem distinguir no-show de lista não conferida.
- **Desmarcar presença NÃO estorna.** Marcar → desmarcar é correção do mentor, não devolução de dinheiro. O estorno segue sendo movimento compensatório com motivo e autor (a mesma doutrina do cancelamento pelo Arkom, E3). A tela avisa isso em texto, no rodapé da lista.
- **A chave de idempotência do débito por participação NÃO tem ciclo** (`participation:evt=<e>:perfil=<p>`), diferente da chave da confirmação (`confirm:…:c=<n>`, D7). Lá o ciclo existe porque o toggle do aluno é reversível e cada novo ciclo é um assento novo; aqui, desmarcar não estorna, então não há ciclo a numerar — e a chave estável é justamente o que garante que corrigir a lista três vezes cobre uma vez só. **Provado no banco** (ver abaixo).
- **O débito roda DEPOIS e FORA da transação da presença.** A aferição do mentor não pode ser desfeita por uma falha do ledger: primeiro a presença é gravada e commitada, depois `debitForParticipation` é chamada. Se o lançamento falhar, a presença fica marcada, o /admin mostra o aviso, e a marcação seguinte reaproveita a mesma chave (retry seguro).
- **`photo_url`, não `photo_path`** (o esboço do recon dizia `photo_path`): o valor guardado É a URL que o `<img>` consome (`/api/media/covers/mentors/…`), e as outras quatro tabelas de conteúdo do schema já chamam isso de `cover_url`.
- **`status draft|published` em vez de um booleano `ativo`**: reusa o vocabulário e o `<StatusBadge>` de `courses`/`apps`/`mentorship_events`. "Desativar" = despublicar — o mentor some da vitrine e continua vinculado aos eventos.
- **`specialty` é UM texto curto, não `text[]`.** Com 3 mentores, um array só acrescentaria um editor de lista ao /admin sem mudar nada na tela do aluno.
- **`mentors.profile_id` existe e ninguém escreve nele.** É o gancho para o dia em que o mentor tiver login: a lista de presença sai do /admin sem precisar de uma 4ª role em `profiles.role` (o CHECK só aceita `admin|student`, e alterá-lo é mudança quebradora). Índice único PARCIAL, para vários mentores sem perfil conviverem.
- **Rota `/admin/mentorships/mentors`** ("Mentores"), com botão no cabeçalho de `/admin/mentorships`, em vez de um 11º item na nav lateral — mesmo precedente da `/admin/trainings/rails` (D8): mentor é conteúdo da área de Mentorias.
- **Vínculo mentor↔evento é edição de EVENTO**, então mora nas actions de mentoria (`mentor_ids` no `MentoriaInput`), na MESMA transação do UPDATE do evento. Cadastro com recorrência vincula os mesmos mentores a **todas** as ocorrências (é a mesma série). Sincronização = apagar e reinserir na ordem: o conjunto é pequeno e a tela manda ele inteiro; calcular diff seria mais código para errar.
- **Mentor de live comunitária também é vinculável** — `event_kind` (0012) diz se cobra crédito, não quem apresenta.
- **UM MODAL POR VEZ no aluno.** Clicar num mentor dentro da capa do evento FECHA a capa e abre o perfil (o modal do mentor mora em `mentorias-body.tsx`, não no calendário). Empilhar dois `<Modal>` — ambos portais em `z-50` — faria o Esc fechar os dois e o `overflow:hidden` do `<body>` ser desfeito pelo de dentro ao desmontar. Como o perfil já lista os próximos encontros do mentor, não se perde contexto.
- **Sem foto é estado normal, não erro**: o `<CoverImage>` compartilhado já cai num gradiente com as iniciais (o mesmo fallback das capas de curso/mentoria, inclusive para erro de carregamento, e o mesmo `<img>` da rota autenticada `/api/media`). Zero componente novo de imagem.
- **`mentors_enabled` governa só a superfície do ALUNO.** Com a flag desligada, `loadMentorsShowcase()` devolve vazio **sem tocar no banco** e a página do aluno é byte a byte a de hoje. O /admin (cadastro, vínculo, lista de presença) fica liberado de qualquer jeito: cadastrar mentor e conferir presença é trabalho interno que precisa acontecer ANTES de ligar a vitrine. Consequência assumida: aplicada a 0014, a coluna "Presenças" do /admin vira "Confirmados / presentes" mesmo com a flag desligada.
- **Nenhum mentor fictício foi semeado.** Nome, foto e bio dos 3 mentores reais são conteúdo da Carol; a UI nasce vazia com estado vazio próprio nos dois lados.
- **Degradação por `42P01` em todos os caminhos novos** (`src/lib/mentors.ts`, a página do /admin, as actions e a lista de presença): ambiente sem a 0014 (dev em `app_arkom`) não vê mentor nenhum e nada quebra.

#### Prova no banco (transação com ROLLBACK, schema `educacional` real)
Réplica exata do SQL que o código emite (UPSERT da presença + `INSERT … ON CONFLICT (operation_key) DO NOTHING` com `participation:evt=<e>:perfil=<p>`), com marcar → marcar de novo → ausente → presente:

| medida | resultado |
|---|---|
| linhas em `event_attendance` (mentoria + live) | **2** (a da mentoria foi upsertada 4×) |
| estado final da mentoria | `attended = true` |
| lançamentos no ledger (mentoria) | **1** · soma `-1` · chave `participation:evt=50:perfil=96` |
| lançamentos no ledger (live, custo efetivo 0) | **0** |
| vínculos `event_mentors` do mentor de teste | 2 (mentoria + live) |

`ROLLBACK` conferido: 58 profiles · 26 eventos · 37 confirmações · 0 mentors · 0 event_mentors · 0 event_attendance · 0 ledger — idêntico ao estado anterior.

#### Prova de layout da vitrine (1 · 3 · 8 mentores, medido em navegador)
Grid `repeat(auto-fit, minmax(160px, 196px))` (mobile: 2 colunas fixas), nas larguras ÚTEIS reais do Shell (`max-w-1360` + `sm:px-10`, sidebar 208/236px):

| container | 1 mentor | 3 mentores | 8 mentores | largura do card |
|---|---|---|---|---|
| 358px (mobile 390) | 1 | 2+1 | 2+2+2+2 | 173px |
| 452px (tablet 768) | 1 | 2+1 | 2+2+2+2 | 196px |
| 964px (desktop 1280) | 1 | 3 | 4+4 | 196px |
| 1124px (desktop 1440) | 1 | 3 | 5+3 | 196px |

Zero transbordo em qualquer combinação. O ponto: a trilha tem **máximo fixo** (196px) em vez de `1fr`, então o card tem o mesmo tamanho com 3 e com 8 e a fileira fica alinhada à esquerda — com `1fr`, 3 mentores esticariam para preencher a linha inteira e a seção pareceria um vazio decorado.

#### Pendência explícita
⏳ **Assets dos 3 mentores estão com a Carol** (nome, foto e bio de cada um). A tabela nasceu vazia de propósito. Enquanto não chegarem: `/admin/mentorships/mentors` mostra o estado vazio, a vitrine do aluno não renderiza (e a flag `mentors_enabled` segue desligada). Ligar a flag só depois de cadastrar os três.

### D10 — Prazo de acesso + relatório de vencimentos (C9, 2026-07-25)
Decisões do builder da Tarefa 4 (nenhuma exigiu veto do dono):
- **"Expirado" continua sendo estado DERIVADO — o job NÃO materializa nada.** A tentação óbvia (um job que marca `profile_entitlements.status = 'expired'`) faria o oposto do pretendido: `src/lib/entitlements.ts` só lê linhas `status='active'`, então a linha marcada como expirada **sumiria da leitura** e o aluno voltaria a parecer sem prazo. Expirado é `expires_at <= now()`, calculado na hora, e por isso "reverter" é só limpar a data. Registrado também no cabeçalho da 0015 e no runbook, porque é o erro que alguém vai querer cometer no futuro.
- **Nenhuma tabela de auditoria nova.** `profile_entitlements` (0011) já tem `reason` + `granted_by` + `granted_by_label` + `granted_at` **e** o CHECK `profile_entitlements_manual_audit_ck`, que recusa entitlement manual sem os três. Editar prazo = revogar a linha vigente (vira histórico) + inserir uma `source='manual'`. O histórico do prazo é a própria sequência de linhas temporais — quem mudou, quando, para qual data e por quê —, e a ficha do aluno mostra isso num "Histórico". Uma tabela paralela guardaria a mesma informação num segundo lugar, com o risco clássico de as duas discordarem.
- **Prazo definido à mão VENCE o plano permissivo.** Sem essa precedência (2 linhas em `getEntitlements`), definir data para quem está no "Legado" não teria efeito nenhum — e é exatamente esse o caso real (todos os 58 estão no Legado). O relatório e o CSV usam o mesmo recorte: `source = 'manual' OR NOT permissive`.
- **A `expiration_enforcement` é uma porta PRÓPRIA na confirmação de presença.** Antes desta tarefa o veredito `expirado` só bloqueava se `credit_blocking_enabled` também estivesse ligada (o modo `enforce` da T1). Agora vencido é barrado com `expiration_enforcement` + `entitlements_enabled`, mesmo com os créditos desligados — a flag do prazo é a do prazo. Continua exigindo `entitlements_enabled` porque sem plano não existe prazo, e barrar no vácuo barraria por engano (mesma doutrina de D7).
- **`isPro` também passou a respeitar a flag do prazo.** Vencido só deixa de ser Pro com `expiration_enforcement` ligada; antes, qualquer data vencida derrubava o `isPro` assim que `entitlements_enabled` fosse ligada. Como hoje ninguém tem prazo, a mudança é neutra — e deixa uma flag só governando toda a dimensão temporal.
- **O ponto de consumo de curso é `toggleProgress` (marcar aula concluída), não o player.** É lá que o aluno registra consumo, é lá que existe canal de mensagem (toast) e é o que preserva X1/X3: vencido continua vendo o catálogo, abrindo aula, vendo e **desmarcando** o próprio progresso, curtindo e avaliando. Bloquear o player exigiria uma tela de renovação nova na área do aluno (com i18n pt/en) e atropelaria "ver o próprio progresso" — decisão consciente de não fazer agora; fica registrado como o próximo passo natural se o dono quiser apertar.
- **Live da comunidade não é barrada pelo prazo.** Só `event_kind = 'mentoria_arkom'`. Mantém a regra da T1 ("live nunca cobra e nunca barra") e é coerente com X1: o que é aberto continua aberto para quem venceu.
- **X2 por construção, não por esforço:** o enforcement só olha para a ação NOVA (`confirmando === true`, `next === 1`). Desconfirmar nunca é barrado, presença já confirmada não é tocada, progresso já concluído não é apagado, `session_version` não é bumpado (vencer não derruba sessão) e o job não escreve em `event_confirmations`/`lesson_progress`. Provado no banco: com o aluno vencido, a confirmação dele continua `confirmed=1` depois de tudo.
- **Grace = 0 é a ausência de código**, não uma constante: não existe tolerância nenhuma entre `expires_at` e o bloqueio. A "não interrupção" que o X2 pede vem de só barrar ação nova. O que existe de configurável é o **alerta** (aviso antecipado), que é outra coisa.
- **Alerta configurável no `scope` da flag, sem tabela nova:** `expiration_enforcement.scope = {"alerta_dias": 30, "janelas": [30,60,90]}`, editável em /admin/settings (editor de escopo que já existe desde D5). Uma tabela de configuração para dois números seria uma segunda fonte de verdade concorrendo com as flags. Valores fora da faixa ou malformados caem no padrão (30 / 30-60-90). O seed da 0015 só escreve se o escopo estiver NULL — reaplicar não desfaz o ajuste da Carol (testado no banco, com rollback).
- **O job é idempotente por CONTEÚDO, não só por chave.** `expiration_runs.run_key = '<origem>:<AAAA-MM-DD>'` e o `ON CONFLICT … DO UPDATE` tem `WHERE (…) IS DISTINCT FROM (…)`: rodar de novo no mesmo dia com o mesmo estado **não escreve nada** — nem `updated_at`, nem `ran_by`. O `RETURNING` volta vazio e a action responde "Nada mudou". Assim a prova de idempotência é a própria linha, e não uma promessa.
- **Sem cron: o job é uma action, e a função está pronta para um.** `runExpirationJob({ source: 'cron' })` não depende de sessão, request nem UI; o Railway deste serviço não tem agendador hoje, então quem dispara é o botão "Processar expirações". Optei por **não** criar um route handler agora: seria uma superfície HTTP a mais para guardar sem ninguém para chamá-la.
- **Rota `/admin/plans/expirations` ("Vencimentos")**, com botão no cabeçalho de `/admin/plans` — mesmo precedente de D8/D9 (sub-rota da área dona do assunto, sem 11º item na nav). Como a ferramenta é de uso diário da Carol, a **contagem também aparece no `/admin`** (card "Vencimentos" com vencidos / vencendo / janelas e link), que é a porta de entrada dela.
- **Exportação seguiu o padrão de `/admin/exports`** (`?type=vencimentos`, CSV com BOM). De quebra, a rota de exportação deixou de responder 500 quando a tabela não existe naquele ambiente: agora é 409 com mensagem em pt-BR.
- **Estado vazio DESENHADO, porque hoje o relatório é legitimamente vazio:** os 58 perfis estão no plano "Legado" (permissivo, sem expiração), então ninguém vence. A tela diz isso com todas as letras e ensina os dois caminhos para dar prazo (plano com duração em meses, que já materializa a data na atribuição; ou a data à mão na ficha do aluno). Nenhuma data de contrato foi inventada.
- **A materialização da T0 já calculava a expiração** (`now() + make_interval(months => N)` em `atribuirPlanoAoAluno`): conferido, nada a completar. Aluno novo que recebe plano de N meses nasce com a data certa.
- **Definir prazo exige plano.** Sem linha temporal ativa (aluno sem plano), a action recusa e manda atribuir plano antes — em vez de criar um entitlement "meio materializado" que mudaria o comportamento de crédito do aluno por efeito colateral.
- **O dia escolhido vale inteiro:** `expires_at = 23:59:59 do dia, em America/Sao_Paulo`. Dias restantes e rótulos são calculados **no banco**, no mesmo fuso — o servidor roda em UTC e "faltam 2 dias" calculado em UTC erra por 3 horas todo fim de dia.

#### Prova no banco (transação com ROLLBACK, schema `educacional` real)
Duas passadas: (1) replay em SQL puro pela Management API e (2) **smoke com o driver real** (`postgres.js`, mesmas queries e mesmos parâmetros que o código emite — pega erro de binding que o replay não pega).

| medida | resultado |
|---|---|
| relatório ANTES de definir prazo | **0 linhas** (ninguém tem prazo — o estado real de hoje) |
| aluno com data +200 dias | `dias=200` · estado **ativo** |
| aluno com data +10 dias | `dias=10` · estado **expirando** (alerta = 30) |
| aluno com data −5 dias | `dias=-5` · estado **expirado** |
| plano dos três | **Legado (permissivo)** — prova a precedência do prazo manual |
| job — 1ª execução | 1 linha gravada · `com_prazo=3 ativos=1 expirando=1 expirados=1` · `detail={"janelas":{"30":1,"60":1,"90":1},…}` |
| job — 2ª execução (mesmo estado, outro autor) | **0 linhas gravadas** · diário com 1 linha · `ran_at = updated_at` · autor = o da 1ª |
| reverter (limpar a data) | `expires_at = NULL` · expirado = **false** · o aluno sai do relatório |
| auditoria do revertido | `revoked/plan/sem prazo` → `revoked/manual/20/07/2026/"prazo de teste"` → `active/manual/sem prazo/"prazo removido"` |
| X2 — confirmação do aluno vencido | `confirmed=1` **antes e depois** de tudo (nada foi desconfirmado) |

`ROLLBACK` conferido: 58 profiles · 174 entitlements · 26 eventos · 37 confirmações · 0 ledger · 0 `expiration_runs` — idêntico ao estado anterior. Migration **aplicada 2× em sequência** (mesmo resultado; tabelas do schema 33 → 34, só `expiration_runs`), e a guarda do escopo da flag testada em transação: escopo customizado (`alerta_dias: 45`) **sobrevive** à reaplicação.

#### Pendências explícitas
- ⏳ **E-mail de aviso de vencimento não existe.** Não há infra de e-mail transacional mapeada no app (o único envio é o link de definir-senha, que sai pelo GoTrue do Supabase). O alerta antecipado de hoje é o destaque no relatório + a contagem na Visão geral. Fazer o e-mail exige escolher provedor e template — decisão do dono.
- ⏳ **Datas reais dos contratos não-padrão estão com a Carol** (ex.: o pacote de 3 meses do Marcondes). Nenhuma data foi inventada: os 58 perfis seguem sem prazo. Quando a Carol trouxer os contratos, o caminho é plano com duração (para os padronizados) ou "Definir prazo" com motivo (para os avulsos).
- ⏳ **Bloqueio do player de aula** (hoje o vencido ainda assiste; só não registra conclusão). Se o dono quiser apertar, é uma tela de renovação na área do aluno, com i18n — trabalho de UI, não de regra.

## Cards

| # | Tarefa | Estimativa | Status | Tempo real |
|---|---|---|---|---|
| C1 | Setup (branch/env/deps/pg-client) | 0.5h | ✅ done | ~0.5h |
| C2 | DoR dump + restore-test | 0.5h | ✅ done | ~0.5h |
| C3 | Recon código + schema (agente opus) | 1h | ✅ done | ~0.5h |
| C4 | Fundação: feature-flags runtime + /admin | 2h | ✅ done | ~1h |
| C5 | Tarefa 0: entitlements/ledger + backfill 58 | 4h | ✅ done | ~2h |
| C6 | Tarefa 1: créditos (sombra→flag) + event_kind | 4h | ✅ done | ~2h |
| C7 | Tarefa 3: rails de curso configuráveis | 2h | ✅ done | ~1.5h |
| C8 | Tarefa 2: mentores + lista de presença | 3h | ✅ done | ~2h |
| C9 | Tarefa 4: prazo + relatório vencimentos | 3h | ✅ done | ~2h |
| C10 | Final: build 0 + reconciliação + push | 1h | ✅ done | ~1h |

### C10 — Verificação final (2026-07-25)
- **Build fresco do zero** (`.next` removido): `tsc --noEmit` 0 erros · `next build` 0 erros.
- **Banco (educacional real):** 7 flags TODAS desligadas · 58 profiles / 1 plano / 174 entitlements / **0 perfis sem plano** · ledger **0** · shadow **0** · mentors 0 · attendance 0 · rails 3 (+5 slots) · expiration_runs 0 · 18 mentorias + 8 lives · 37 confirmações e 8 cursos intactos. Nenhum dado inventado em prod.
- **Smoke navegado** (server de produção local porta 3012, cookies de sessão cunhados p/ admin uid=1 e aluno uid=2): aluno `/home /trainings /mentorships /apps` → 200; admin `/admin /admin/settings /admin/plans /admin/plans/expirations /admin/trainings/rails /admin/mentorships /admin/mentorships/mentors /admin/students` → 200; `/solutions` 404 **by design** (rota exclusiva do modo `ARKOM_APP_MODE=solutions`). Browser: `/mentorships` do aluno renderiza o calendário com os 26 eventos reais SEM resumo de créditos (contrato flags-off) e `/admin/settings` lista as 7 flags com escopo — **console com 0 erros**.
- **Lint:** baseline pré-existente de 9 erros + 2 warnings em arquivos alheios à branch (regras novas do `eslint-config-next@16.2.1` — ver D5). Nenhum erro em arquivo tocado pela branch. Corrigir o baseline = decisão à parte do dono (mexe em 8 arquivos do aluno fora deste escopo).

### D11 — Contador de créditos no cabeçalho + aluno de teste (2026-07-25, pedido do dono)
- **Contador visível fora do modal** (referência VDI "PLANO 8/8"): badge no cabeçalho de `/mentorships` — "Plano · X/Y" (saldo/cota), "Ilimitado" no permissivo, vermelho quando enforce ligado e saldo 0. Tooltip = nome do plano. Saldo VIVO içado do Calendar para o MentoriasBody (`liveBalance`/`onLiveBalanceChange`) — badge e capa do evento compartilham o mesmo número. Flag OFF ⇒ cabeçalho byte a byte como antes. `quota`/`planName` adicionados ao `StudentCreditSummary`/`StudentCreditView`.
- **Aluno de teste com plano limitado** (criado pelos fluxos REAIS do /admin, validando os critérios da T0): perfil 104 `aluno.teste.creditos@bilhon.ai`, plano "Plano Teste (3 mentorias)" (`plano-teste-3-mentorias`, 12 meses, 3 créditos no total, cursos N8N+Claude Code, publicado). Ciclo provado no navegador com login real: 3/3 → confirmar mentoria → **2/3 ao vivo** → desconfirmar (janela E1) → **3/3** (estorno como lançamento novo).
- Guard descoberto: criar conta ativa exige URL pública canônica **https** — e `NEXT_PUBLIC_APP_URL` é inlined no BUILD (env local com localhost quebra o guard mesmo após restart; rebuild com `https://app.arkom.ai` resolve). Vale para qualquer ambiente novo.
- Estado das flags ao final desta rodada: `entitlements_enabled=true`, `credit_blocking_enabled=true`, `credit_shadow_mode=true` (dono), demais false. Efeito restrito ao serviço isolado/local (prod roda código antigo sem feature_flags). **Desligar antes de promover o código novo pro serviço de prod, ou promover ciente.**

### D12 — Rodada de decisões comerciais do dono (2026-07-25, supersede parte de D4)
Respostas do dono às 5 perguntas de planos:
1. **No-show cobra** (padrão = `on_confirmation`, sem check-in viável no Meet). A alternativa (b) "só cobra quem participou" **já está construída**: lista de presença do mentor (T2/E4) + policy `on_participation` — migrar é trocar o escopo da flag `debit_policy`, sem refazer nada.
2. **Cancelou, DEVOLVE — sem janela de 30 min** (supersede E1/D4). Implementado: `REFUND_WINDOW_MINUTES 30 → 0` — estorno vale até o INÍCIO do evento; após o início não devolve (impede confirmar→assistir→desconfirmar = crédito grátis; decisão do orquestrador, exposta ao dono). Copy do aviso, diário sombra e runbook atualizados. Cancelamento pelo Arkom segue devolvendo pra todos (E3), qualquer cenário.
3. **Live da comunidade não gasta** ✓ (já era). O controle no admin **já existe**: criar/editar evento tem "Tipo do evento" (Live da comunidade × Mentoria do Arkom + custo em créditos); evento novo nasce como live (nunca cobra por engano). Zero mudança.
4. **Expirado = item (a)** ✓ (X1/X3 já implementados assim). Zero mudança.
5. **Prazo do Diego**: gestão manual pelo dono — nenhum dado alterado.

### D13 — Planos comerciais configurados (2026-07-25, imagem "Escolha o plano do seu momento")
Criados no /admin/plans (dado no `educacional` real — valem no serviço isolado na hora, sem deploy):
- **Básico** `basico` — 12 meses · **4 créditos/mês** · 9 cursos (todos) · publicado. (R$ 1.797/mês, até 3 acessos.)
- **Tração** `tracao` — 12 meses · **12 créditos/mês** · 9 cursos · publicado. (R$ 2.627/mês, até 12 acessos, evento anual + grupo WhatsApp na descrição.)
- **Enterprise** `enterprise` — 12 meses · **mentorias ilimitadas** · 9 cursos · publicado. (R$ 4.297/mês; mentoria particular mensal e treinamento com Marcondes na descrição — não modelados.)

**Tradução assumida (ajustável no /admin sem deploy):** horas semanais → créditos mensais com mentoria típica de 2h: Básico 2h/sem = 4/mês; Tração 6h/sem = 12/mês; Enterprise = ilimitadas (tier topo). "Acessos" (3/12/ilimitados) = contas por empresa — NÃO modelado (plataforma é por profile); registrado nas descrições. Preço não é modelado no app. Nenhum aluno foi movido de plano: os 47 seguem no Legado, aluno de teste no Plano Teste.

### D14 — Redesenho da Universidade IA (2026-07-25, pedido do dono — supersede parte de D8)
- **Top 5 DINÂMICO por assistidos** (não mais manual): modo `top` ranqueia por aulas concluídas por curso (`lesson_progress`), empate/sem dado cai na ordem do catálogo (o "montado" que a Carol controla via sort_order; 100% manual continua disponível trocando o modo no /admin). Ranking real hoje: Claude Code (5) › Lovable (4) › N8N (1) › resto pela ordem. Admin preview usa a MESMA pontuação (`loadCourseWatchScores`).
- ~~Blocos de categoria estilo Netflix (lado a lado + popover)~~ — **substituído no mesmo dia pelo dono**: layout final = trilhos cheios EMPILHADOS na ordem **Top 5 → Todos os cursos → Em breve**. Os componentes de bloco/popover foram removidos (existiram por ~1h, commit `ca57264`).
- Config no banco: rail `top` → mode `top` + limit 5; rail `todos` LIGADA (ordem: top, todos, em-breve). "Em breve" não navegável ✓; curso comingSoon não navega nem dentro do "Todos".
- Por que "mesmo com a flag ligada tava igual": o seed da 0013 replicava o layout hardcoded DE PROPÓSITO (cutover neutro, D8) — a flag servia a config, e a config era uma cópia do antigo.

### D15 — Unidade vira HORA de mentoria (2026-07-25, dono) + polimento do modal
- **1 crédito ≡ 1 hora**: os planos comerciais são vendidos em HORAS (2h/sem, 6h/sem) — o sistema passa a falar horas em toda a UI. **Colunas do banco mantêm o nome** (`mentorship_credits`, `credit_cost`, `credit_ledger`) — renomear seria churn sem ganho; a semântica agora é horas (registrado aqui e nos comentários).
- **Custo do evento = duração** (arredondada, mínimo 1h): 18 mentorias atualizadas (16×2h, 2×1h; 20h48–22h52 → 2h). No form do admin, campo "Horas de mentoria (custo)" vazio ⇒ duração do evento calculada na criação.
- **Cotas**: Básico 2h/sem = **8h/mês**; Tração 6h/sem = **24h/mês**; Enterprise ilimitadas. Contador do aluno agora "Xh/Yh".
- Copy: 3 mensagens do suporte, i18n pt/en, admin (planos, eventos, ficha do aluno, flags) — tudo em horas; runbook atualizado.
- **Modal do evento**: entrada animada (fade+scale, motion-safe), raio 18px, capa com gradiente-base + fade-in da foto, `Cache-Control: private, max-age=604800, immutable` no /api/media (URLs de upload são únicas ⇒ imutáveis) e preload das capas dos próximos 12 eventos em idle.

### D16 — Suíte E2E v2: a matriz completa (2026-07-27, pedido do dono) + 4 achados corrigidos
Regravação TOTAL (nada da v1 aproveitado): 29 cenários em 7 blocos (`e2e/credit-system-v2.spec.ts`), um aluno POR plano criado na câmera, login digitado em toda jornada de persona, todos os estados de conta (ativo/sem plano/vencido/bloqueado/excluído/1º acesso) e de consumo (suficiente/insuficiente/zero/ilimitado/fora-do-plano/fora-da-janela/sombra), CRUDs completos (usuário, plano, evento, mentor), relatórios+CSV, flags ao vivo, E3. Vídeos no bucket `resources/qa-jornadas-v2/` (página /jornadas reescrita com a matriz).

**Achados da gravação (todos corrigidos no ato):**
1. **Furo de cobrança:** aluno SEM plano confirmava mentoria de graça — o fail-open tratava "sem entitlement (leitura limpa)" igual a "banco indisponível". Fix: `lerEntitlements` distingue os casos; ausência limpa de plano = `evento_fora_do_plano` (barra com a mensagem certa); erro de banco segue fail-open.
2. **Erro engolido no player:** vencido clicando "Concluir aula" só via o botão reverter — a mensagem de renovação do servidor era descartada (`lesson-view` sem canal). Fix: ToastProvider + toast de erro com o motivo.
3. **Copy perigosa:** o ConfirmDialog do "Cancelar pelo Arkom" usava o default "Excluir". Fix: "Cancelar e estornar"/"Cancelando…"/"Voltar".
4. **Toasts transparentes** (apontado pelo dono): `bg-surface-inverse-panel` translúcido sumia no fundo escuro. Fix: casco sólido (rgba(16,20,29,.98)) com borda por variante.

**Regras confirmadas em vídeo:** plano e evento com lançamentos no extrato NÃO podem ser excluídos (histórico financeiro imexível); cancelamento pelo Arkom estorna todos automaticamente; vencer não derruba a conta (bloquear sim); sombra permite e não debita.

### D17 — Mentoria encerrada congela + revalidação 29/29 (2026-07-27, pedido do dono)
Regra nova: confirmação de presença e acesso valem SÓ até o FIM do horário do evento (GMT-3 fixo). Corte autoritativo no relógio do banco (`loadEventCredit.hasEnded`; sem `ends_at` = início+60min; dado torto a favor do aluno), aplicado em todos os caminhos da action — flags ligadas ou desligadas. Encerrada também não desconfirma (histórico congelado). Capa: chip "Mentoria encerrada"/"Presença confirmada", sem botão, sem link de acesso, banner explicando. Commits `aa49841` (regra) e `9baa258` (suíte).

Suíte v2 revalidada 29/29 sob a regra: S09 reescrito (capa congelada + E1 com evento EM ANDAMENTO criado pelo relógio da rodada e despublicado ao fim — a lista de próximos encontros tem 6 vagas), S12 autossuficiente (cria o próprio plano de 3h), `beforeAll` despublica sobras de rodadas anteriores. Aprendizado de harness: eventos E2E acumulados empurram eventos reais para fora da lista e quebram cenários de consumo.

Banco devolvido limpo: 6 planos/2 eventos de teste + 14 perfis expurgados (D16), extrato de teste zerado, 21 contas sintéticas apagadas do Auth central (a `convidado@bilhon.ai` fica — é a conta-convidada do ecossistema inteiro, dona de 11 app_instances no core). Gatilhos append-only religados após cada expurgo.

### D19 — QA manual do dono: 2 furos achados e corrigidos (2026-07-28/29)
1. **Mensagem contraditória (cenário 13):** saldo INSUFICIENTE dizia "suas horas acabaram" com 1h no contador. Fix: `mensagemSaldoInsuficiente(custo, saldo)` — "Esta mentoria usa Xh e você tem Yh de saldo"; o "acabaram" ficou exclusivo do zero/negativo. Verificado ao vivo nas duas pontas; cast S30 gravado e publicado no /jornadas (bloco H). Runbook 1a/1b. Commits `901aa6b` + `45c67d8`.
2. **Republicar ressuscitava assento sem lastro:** cancelar pelo Arkom estorna e mantém confirmações; republicar (toggle ou edição) devolvia o assento de graça — aluno que gastou o estorno noutras mentorias ficava com mais horas confirmadas do que o plano. Fix: `recontabilizarConfirmacoes` nos DOIS caminhos de republicação — com saldo RECOBRA (mesma chave de idempotência do fluxo do aluno, ator = admin), sem saldo REMOVE a confirmação; toast do admin resume; nunca age em evento encerrado nem fora do enforce. Prova de regressão `e2e/republicacao-recontabiliza.spec.ts` (furador × recobrado × idempotência). Runbook: seção "Republicação recontabiliza".

### D18 — Acesso à mentoria só com presença confirmada (2026-07-29, bug reportado pelo dono)
**Furo:** "Acessar mentoria" era um `<a>` cru para o `redirect_url`, servido a TODO evento publicado — dava para entrar na sala clicando direto em "Acessar", sem confirmar presença e portanto sem debitar as horas do plano. Pior: a URL da sala viajava no payload de /mentorships para qualquer aluno, confirmado ou não.

**Fechamento em duas camadas, com o corte de verdade no servidor:**
- **`redirect_url` nunca mais chega ao navegador do aluno**: o SELECT de /mentorships manda só `has_access_link` (boolean calculado no banco).
- **Rota gateada `/api/mentorships/go/<eventId>`**: exige sessão + evento publicado + NÃO encerrado (D17, via `loadEventCredit.hasEnded`) + presença CONFIRMADA — revalidado a cada clique. Qualquer condição falhando → 302 de volta a /mentorships, sem vazar se o evento existe nem qual é o link. A confirmação continua sendo o ÚNICO caminho que debita; a rota apenas exige que ela tenha acontecido.
- **Capa (EventModal)**: sem confirmação o botão dourado fica TRAVADO (cadeado, opacidade baixa) e o clique explica em toast ("Confirme sua presença primeiro") — exatamente o gesto do bug report vira orientação. Confirmou → o `<a>` real aparece, apontando para a rota gateada. Desconfirmou → trava de novo (estorno segue E1/D12: só antes do início).
- Regra de CALENDÁRIO como a D17 — vale com flags ligadas OU desligadas. Com créditos OFF confirmar é grátis e instantâneo; o gate só formaliza "para entrar, confirme".
- E2E: `solution-mentoria.spec.ts` agora valida o ciclo travado→confirma→destrava (href da rota gateada)→desfaz→trava. Suíte v2 intacta (S09 já asserta ausência de acesso na encerrada; nenhum cenário clicava no acesso). i18n pt/en: `accessLockedTitle`/`accessLockedHint`.

### D20 — "Conta salva, mas plano não atribuído" no recadastro (2026-07-29, QA 86ajrcd65)
**Report da QA (28/07, horas antes do fix existir):** recadastrar um e-mail de conta excluída escolhendo plano no formulário salvava a conta mas devolvia "Conta salva, mas o plano não foi atribuído — já está no plano X". Causa raiz: a exclusão não encerrava a vida financeira do perfil — o entitlement ativo da vida anterior sobrevivia, e o guard anti-duplicata (linha 51 acima) barrava a conta restaurada como se fosse duplo clique.

**Fechado por `dd9af6b` (recadastro sano, QA 86ajrd3t8):** excluir E recadastrar encerram a vida financeira anterior via `resetCreditsForProfile` — entitlements ativos → `revoked`, saldo positivo compensado com `plan_revoke` (ledger append-only: zerar É lançar), chaves idempotentes `delete_zero`/`restore_zero`. Contas excluídas ANTES do fix também recadastram limpas: o reset roda de novo no recadastro.

**Prova de regressão desta task: `e2e/recadastro-plano.spec.ts`** (modo duplo — regressão rápida por default, `E2E_CADENCIA=1` = take de vídeo): criar aluno JÁ com plano 2h → excluir (assert no banco: saldo compensado, zero entitlements ativos) → recadastrar o MESMO e-mail com o MESMO plano → credenciais SEM erro de plano, saldo 2h sem dobra, mesmos direitos da 1ª vida → a ficha conta a história ("Conta excluída — créditos remanescentes revogados") → e o guard segue barrando duplicata REAL ("Trocar plano" → mesmo plano recusado na conta ativa). Vídeo em `resources/qa-bugs/` e anexado na task.

### D21 — "Tente novamente" numa exclusão que nunca ia funcionar (2026-07-29, ClickUp 86ajrcafy)
**Report do dono:** excluir uma mentoria **cancelada e estornada** devolvia só
"Não foi possível excluir a mentoria. Tente novamente." — e retentar nunca
resolvia. A mensagem sugeria falha transitória onde havia **regra**.

**Causa raiz:** `credit_ledger.event_id` e `credit_shadow_log.event_id`
referenciam o evento com `ON DELETE SET NULL`. Apagar a mentoria faz o Postgres
tentar ZERAR esse vínculo — um UPDATE — nas duas tabelas append-only, cujos
triggers levantam `23001` (`restrict_violation`). O `catch` genérico de
`excluirMentoria` traduzia esse "não" em "tente novamente". Confirmado no banco
real em transação revertida (evento #68, cancelado, 1 débito + 1 estorno).
**O diário de sombra bloqueia sozinho**: evento com 0 lançamento no extrato e 1
registro de sombra também não sai (evento #63) — checar só o ledger deixaria
metade do bug vivo.

**Fechamento em duas camadas:**
- **Servidor (decide)**: `excluirMentoria` conta os vínculos nas DUAS tabelas
  antes do DELETE e devolve o MOTIVO com números; o `23001` vira rede de
  segurança da corrida (aluno confirma entre a contagem e o DELETE), com frase
  própria. Ambiente sem as 0011/0012 (`42P01`) segue como sempre seguiu.
- **UI (espelha e explica)**: a lista traz `delete_block_reason` (duas
  agregações para a tela inteira, não uma consulta por linha) e o botão Excluir
  fica travado com `aria-disabled` — não `disabled`, para que o clique ainda
  chegue e EXPLIQUE em toast. Botão morto deixaria o admin sem saber por quê.
- Texto único em `src/lib/mentorship-delete-guard.ts` (`motivoParaNaoExcluir`),
  consumido pelo servidor e pela lista — a tela e o servidor dizem a mesma coisa.
  Mora fora da action porque módulo `"use server"` só exporta função async.

**Prova de regressão: `e2e/excluir-mentoria-com-extrato.spec.ts`** (modo duplo).
Quatro cenas: (1) mentoria cancelada+estornada com Excluir travado e o motivo na
tela; (2) **corrida** — a lista carrega excluível, o extrato nasce com a tela
aberta e o servidor barra assim mesmo (prova de que quem decide é o servidor);
(3) mentoria sem lançamento exclui normalmente — a regra não é geral; (4) o
extrato do aluno com débito e estorno, o histórico que a regra protege. Banco
devolvido byte a byte (expurgo pela Management API + conferência de saldo,
sobras e gatilhos religados). Runbook: seção "Mentoria com extrato NÃO se
exclui". Vídeo em `resources/qa-bugs/` e anexado na task.

### D22 — Integração n8n concede plano na criação do aluno (2026-07-29, pedido do dono)
**Contexto:** a `main` ganhou o `POST /api/integrations/students` (PR #6 do Áquila, mergeado 2026-07-28) — cadastro de aluno para automações com Bearer `ARKOM_USERS_API_KEY`. Sem ponte com o sistema de planos, todo aluno criado por automação nascia sem entitlement → fallback Legado permissivo (acesso total de graça). O dono pediu a ponte NESTA branch, para entrar no release.

- **Merge da `main` na branch** (endpoint + guard de propriedade de senha). Conflitos resolvidos a favor do modelo `passwordApplied` da main (supersede o `restauracaoVinculada` local — o guard em `syncCentralAuthUser` cobre os mesmos casos) e do modal persistente de credenciais da branch (supersede o toast da main; o modal já exibe e-mail/planError).
- **Núcleo extraído** para `src/lib/plan-grant.ts` (`concederPlano` + lookups): a MESMA transação do `atribuirPlanoAoAluno` (revoga vigentes → 3 dimensões → `plan_grant` idempotente por entitlement), com ator parametrizado. A action do admin agora chama o núcleo; comportamento byte-a-byte.
- **Endpoint aceita `plan` OPCIONAL** (retrocompatível — sem o campo, contrato original intocado): slug de plano `published AND permissive=false` (hoje: `basico` | `tracao` | `enterprise`; a lista vive no banco). Slug inválido → 400 ANTES de criar o aluno, listando os válidos. Ator no ledger: `actor_profile_id=null` + label `integração:students-api` (colunas nullable by design; só ajuste MANUAL exige admin).
- **Falha na concessão pós-criação** espelha o fluxo admin: conta fica, resposta segue 200 `created` com `planAssigned: false` + `planError` (automação alerta humano; retry às cegas cairia em `already_exists`).
- **`already_exists` NÃO aplica plano** (`planApplied: false` na resposta): troca de plano de aluno existente é manual no admin — replay de automação não pode revogar/recreditar direito vigente.
- Casa com o D20 acima: recadastro pelo endpoint reaproveita o perfil excluído já ZERADO (`resetCreditsForProfile` no restore) e o `concederPlano` revoga qualquer vigente antes de conceder — sem dobra de créditos em nenhuma ordem.

### D23 — Plano decide os Sistemas, e os "Cursos inclusos" passam a VALER (2026-07-30, ClickUp 86ajrgzef)
**Pedido (Carol, "zero prioridade — insight do teste"):** na criação do plano existem as caixas de cursos; faltava dizer se o plano libera **os apps**, num liga/desliga só ("todos ou nenhum"), para o plano de FUP do comercial — o lead entra, faz o curso da Arkom e vê o resto bloqueado.

**Achado ao abrir o código (metade que faltava):** as caixas "Cursos inclusos" só GRAVAVAM. `hasCourseAccess()` existia em `src/lib/entitlements.ts` e **não era chamada em lugar nenhum**; `/trainings` listava todo curso publicado. Com `entitlements_enabled` LIGADA em produção, os planos Básico/Tração/Enterprise tinham os 9 cursos marcados — a restrição nunca teve efeito e ninguém notou. O dono aprovou entregar as duas metades juntas.

- **Migration 0016 (aditiva):** `plans.apps_included boolean not null default true`. Booleano no plano, não uma `plan_app_access` N:N — o pedido é all-or-nothing, e uma lista N:N faria "liberar todos" significar "os que existiam no dia em que o plano foi criado" (app novo não entraria). `default true` = comportamento de hoje: aplicar a migration não muda nada para ninguém. Permissivo ignora (normalizado para `true` na action).
- **Corte no SERVIDOR, não na UI:** `/apps` e `/apps/[id]` não chegam a carregar os apps (nome, capa e URL externa fora do payload); `registerClick`/`rateApp` recusam antes de qualquer consulta — chamar a action direto não entrega o link; a vitrine da home não é montada. A UI só EXPLICA ("Sistemas · Não incluso no seu plano", com o nome do plano).
- **Catálogo:** `allowedCourseIds(profileId)` (uma consulta para o catálogo inteiro, não N+1) alimenta `getCatalog`/`getCourseDetail`/`getLessonRef`. Curso fora do plano vira `locked` com `lockReason='plan'` — capa em P&B e cadeado com o MOTIVO ("Não incluso no seu plano" ≠ "Libera em N dias"); módulos e aulas nunca são carregados, e a URL direta devolve ao catálogo pelo guard que já existia. `PortraitCard` ganhou o estado bloqueado que só o `TopNineCard` tinha — antes o poster travado continuava clicável e a página empurrava o aluno de volta sem explicar.
- **Fail-open em cinco caminhos** (doutrina do módulo): flag desligada, aluno sem entitlement, plano permissivo, entitlement de catálogo sem plano e erro/coluna ausente (`42703`) ⇒ libera. Direito mal lido não tranca aluno fora do produto. Set VAZIO ≠ `null`: plano sem curso marcado bloqueia o catálogo inteiro — é o que o próprio formulário avisa em texto.
- **Vocabulário:** a área se chama **Sistemas** na barra do aluno e do admin (`shell.nav.apps`); "apps" é o nome interno (rota `/apps`, tabela `apps`). Toda a copy nova fala "Sistemas".
- **Efeito imediato, sem reatribuir:** cursos e sistemas são lidos do plano na navegação (não são materializados no entitlement, ao contrário de prazo e cota). A mensagem do "Salvar alterações" passou a dizer isso.
- **Impacto medido no banco antes de entregar:** 9 cursos publicados; Básico/Tração/Enterprise com os 9 marcados (nada muda para os 12 alunos deles); 67 alunos no Legado permissivo (fora da restrição); 4 perfis ativos sem entitlement (fail-open). Só o plano de QA (1 curso, 1 conta de teste) passa a restringir. **A partir daqui, curso NOVO publicado não entra sozinho nos planos comerciais** — é preciso marcá-lo no plano, e isso agora tem consequência visível.
- **Prova:** `e2e/plano-libera-apps.spec.ts` (dois modos, `E2E_CADENCIA=1` para o take) — plano fechado → aluno barrado com motivo → URL direta do app não fura → HTML sem nome de app → catálogo com o cadeado explicado → admin religa → aluno recupera os dois na hora. Vídeo em `resources/qa-bugs/86ajrgzef-plano-libera-sistemas.webm`.

## Regras operacionais (do plano)
- Migrations: aditivas, idempotentes, reversíveis, no `educacional`. NUNCA tocar `core` de forma quebradora.
- Deploy: **do dono** (`railway up` no serviço isolado `2d8d382d…`, projeto arkom-dash — NUNCA no serviço prod). Eu só commito na branch.
- Edges tocadas ganham cópia prefixada (`credit_<fn>`), deploy via Management API.
- Build 0 antes de commitar; UI pt-BR; nada removido sem instrução por-item.
- Nunca cortar: ledger append-only, idempotência do débito, flag runtime, backfill sem órfãos, sombra antes do bloqueio.
