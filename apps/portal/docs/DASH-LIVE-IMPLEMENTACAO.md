# Dashboards unificados — o que foi implementado (Fase 1)

> Complementa `ARQUITETURA-DASH-UNIFICADO.md` (o plano). Este documento descreve o que **está rodando**.
> **Data:** 2026-07-14 · **Escopo entregue:** 4 dos 6 centers lendo dados reais do banco central.

---

## 1. O que ficou pronto — as 11 soluções nos 6 painéis

| Center | Soluções que ele compõe | Estado |
|---|---|---|
| C1 · ADS · Aquisição Paga (`meta`) | **ADS** | demo (a pedido) |
| **C2 · Funil Comercial** (`pipeline`) | **BIA SDR** + **PIPE** | **live** |
| **C3 · FINANCE · Financeiro** (`finance`) | **FINANCE** | **live** |
| C4 · SOCIAL · Conteúdo (`content`) | **SOCIAL Connect** | demo (a pedido) |
| **C5 · Outbound & Atendimento** (`outbound`) | **BIA SDR** | **live** |
| **C6 · Operações & Cliente** (`ops`) | **DESK** + **CS AI** + **ONBOARDING** + **HOLLY** + **HARVEY** + **ATLAS** | **live** |

As 11 soluções do `solutions.md` estão representadas. O C6 é o painel cross-solução: uma tabela com **uma linha por solução**, o indicador que resume cada uma, e o estado (`ativo` / `sem dados` / `sem acesso`).

Ligar/desligar um center é **configuração, não código**: `DASH_LIVE_CENTERS=pipeline,finance,outbound,ops`.

## 2. O login da Arkom é o login das soluções

Este é o coração da entrega, e ele tem **dois caminhos** porque as soluções vivem em dois lugares.

### 2.1 As 5 centralizadas (SOCIAL, BIA SDR, DESK, ADS, FINANCE)

Compartilham o `auth.users` do Supabase central. O login do arkom-dash **já era** esse GoTrue, então o JWT do usuário vale direto nos schemas `app_*`:

```
login Arkom (GoTrue central)
   └── JWT do usuário (cookie httpOnly)
         └── /api/dash/[center]  (server; exige sessão arkom_session)
               └── PostgREST accept-profile: app_sdr | app_financeai | app_atendimento
                     └── RLS por org_id  →  as linhas da organização DELE
```

### 2.2 As 6 satélites (PIPE, ONBOARDING, ATLAS, CS AI, HARVEY, HOLLY)

Cada uma tem **projeto Supabase próprio, com `auth.users` separado** — o token central não vale lá. A ponte (`lib/solutions/satellite-session.ts`):

1. **No login da Arkom**, com as credenciais que o usuário acabou de digitar, tentamos um sign-in em cada satélite. Onde a identidade dele existe, guardamos a sessão GoTrue resultante em `app_arkom.solution_sessions` (migration `0009`). **Nenhuma senha é armazenada** — só o refresh token que o GoTrue de lá devolveu.
2. **Ao montar o painel**, pegamos o access token daquele satélite e lemos os dados **com o JWT do usuário**. O RLS de cada projeto continua sendo a autorização.
3. Onde ele não tem conta, a solução aparece como **`sem acesso`** — nunca como zero, que seria mentira.

> **Por que no banco e não em cookie:** o refresh token do GoTrue **rotaciona a cada uso**. Com 6 painéis carregando em paralelo, duas renovações concorrentes com o mesmo token derrubariam a sessão. A linha é travada com `FOR UPDATE`, o que serializa a renovação.

Em nenhum dos dois caminhos existe `service_role` ou resolução de organização no código do dashboard. Não há parâmetro de org que um cliente possa forjar. O isolamento multi-tenant é o mesmo do produto, não uma reimplementação.

## 3. Arquitetura do código

```
src/lib/dash/
  solutions-read.ts   # leitor PostgREST com o JWT do usuário (server-only, sem service_role)
  kit.ts              # janelas de tempo, deltas, formatação BRL/pt-BR, séries
  types.ts            # DataState (live | live-empty | demo) e o contrato do builder
  registry.ts         # DASH_LIVE_CENTERS → quem constrói o quê
  centers/
    pipeline.ts       # app_sdr.deals + pipeline_stages
    finance.ts        # app_financeai.transactions + bills + taxes + orders + products
    outbound.ts       # app_sdr.messages + broadcasts + contacts + appointments
    ops.ts            # app_atendimento.whatsapp_*
src/app/api/dash/[center]/route.ts   # fronteira de segurança: sessão → build → Center JSON
```

**O shape `Center` da v1 não mudou.** `DashboardBody`, `charts.tsx`, `Coverflow` e `PeekPanel` não sabem — nem precisam saber — se os blocks vieram de um snapshot ou de uma agregação real. Foi exatamente o padrão que o `meta-center.ts` já provava (`buildMetaCenter(range, base) → Center`), generalizado.

Fluxo na UI: `DashView` carrega os 6 centers de uma vez (assim as **miniaturas do anel também mostram os números reais**, não a capa fake) e passa o resultado ao `Dashboard` como estado inicial — entrar num card não refaz a consulta. Trocar o range refaz.

## 4. Honestidade dos números (regra de projeto)

Uma pill diz sempre de onde veio o que está na tela — **no cabeçalho do painel e também no card do anel** (a capa não pode mentir sobre o miolo):

- **`dados reais`** (verde) — agregado do banco, completo.
- **`dados parciais`** (laranja) — leu de verdade, mas **alguma consulta falhou ou bateu no teto de 5.000 linhas**. Os números estão incompletos e um Sinal no topo diz exatamente o quê. Nunca se disfarça de completo.
- **`sem dados nesta organização`** (laranja) — a consulta rodou, o RLS respondeu, e a organização não tem dados. Mostra zeros **e explica nos Sinais**.
- **`demonstração`** (cinza) — snapshot sintético da v1 (ADS e SOCIAL).
- **`falha ao carregar`** (vermelho) — erro. **Não cai para o demo**: número fictício com aparência de real é pior que nenhum número (e o CTA também é trocado).

Decorrências no código:
- `Sparkline`/`AreaChart` sem série explícita desenham uma onda decorativa. Nos centers live, `spark: true` só é ligado quando há `sparkValues` reais.
- Sem base de comparação, `delta()` devolve `undefined` — o KPI não exibe badge de tendência em vez de inventar uma.
- KPI que já é percentual (margem, taxa de ganho, taxa de resolução) varia em **pontos percentuais** (`deltaPP`): escrever "+25%" ao lado de "25%" engana.
- Legenda do gráfico lista só a série efetivamente desenhada.
- Uma consulta que falha **não vira "sem dados"**: `read()` registra a falha e o center é rebaixado para parcial. Afirmar um vazio que nunca foi verificado é mentir.
- O **drill (peek) fica desligado nos centers live**: seu conteúdo é sintético (v1), e abri-lo a partir de uma linha real mostraria números falsos. Reconstruí-lo sobre o banco é a Fase 4.

## 5. Realidade dos dados hoje (login `aluno@bilhon.ai`)

**Banco central:**

| Schema | Situação |
|---|---|
| `app_financeai` | **148 transações**, 11 contatos, 6 pedidos, 11 produtos, 6 centros de custo, 2 contas a pagar → C3 renderiza rico |
| `app_sdr` | todas as tabelas de negócio **vazias** → C2 e C5 mostram zeros honestos |
| `app_atendimento` | todas as tabelas **vazias** → C6 mostra zeros honestos |

**Satélites** (sessão aberta pelo login da Arkom):

| Solução | Sessão | Dados visíveis |
|---|---|---|
| PIPE | ✅ | 1 contato, 1 pipeline — nenhum negócio |
| CS AI | ✅ | 0 (RLS ativo: anon recebe 401) |
| HARVEY | ✅ | 0 |
| HOLLY | ✅ | 0 |
| ATLAS | ✅ | 0 |
| ONBOARDING | ❌ **sem acesso** | o projeto tem dois refs divergentes no repo (`config.toml` diz `gmihrjyvkwyffomxburu`, o `vite.config` aponta `aqyryzyarspkhhjpebol`) e o login `aluno@bilhon.ai` não é aceito no que está configurado |

Os dashboards estão corretos; o que falta é dado. Assim que qualquer solução registrar a primeira linha para a organização do usuário, o painel passa a contar sozinho — sem mudança de código.

**Para o ONBOARDING acender:** confirme qual é o projeto Supabase correto e crie/valide um usuário nele. Basta ajustar `SATELLITE_ONBOARDING_URL` / `SATELLITE_ONBOARDING_ANON_KEY` — o resto já está pronto.

## 6. Ambiente local

O runtime transacional (`app_arkom`) **não** aponta para o banco central: roda num Postgres descartável em Docker.

```bash
# container arkom-pg (porta 54330, SSL habilitado — o db.ts exige)
docker start arkom-pg
npx next dev -p 3002          # a 3001 está ocupada pela v1 em ClaudeCode/arkomv2
```

> **Não rode `next build` com o `next dev` ativo no mesmo repositório.** Os dois disputam o
> diretório `.next` e o worker do dev server morre com `Jest worker encountered ... exceptions`
> (as rotas passam a devolver 500 em HTML). Se acontecer: pare o dev, `rm -rf .next`, suba de novo.

`.env.local` já está configurado: `ARKOM_RUNTIME_SCHEMA=app_arkom`, `ARKOM_DATABASE_URL` no container, `CENTRAL_SUPABASE_URL`/`ANON_KEY` do projeto `solutions` e `DASH_LIVE_CENTERS`. **`CENTRAL_SUPABASE_SERVICE_ROLE_KEY` fica vazia de propósito** — o dashboard não precisa dela.

Login de teste: `aluno@bilhon.ai` / `bilhon123` → `/dash`.

## 7. O que falta (próximos passos)

1. **Dados**: ligar a captura do SOCIAL (`analytics_snapshots`) e do ADS (cron server-side da Meta Graph API) — os dois pré-requisitos que você já sinalizou que vai corrigir.
2. **ONBOARDING**: resolver o ref divergente do projeto e o usuário (ver §5).
3. **Peek/drill**: as linhas das tabelas dos centers live não abrem o painel de drill (o `peek-data.ts` da v1 é indexado por nome e só tem conteúdo sintético). Reconstruir o drill sobre dados reais é a Fase 4.
4. **Centralizar os satélites** (Fase 3 canônica): repointar PIPE, CS AI, ONBOARDING, HOLLY, HARVEY e ATLAS para o banco central, como as 5 primeiras. Isso **elimina a ponte de sessão** — o token central passaria a valer neles. A ponte é a solução tática que entrega o resultado hoje, sem tocar nos bancos das soluções.
5. **`analytics_core`**: hoje cada center lê os schemas direto. Com mais volume, migrar para `kpi_daily`/`events` com rollups em `pg_cron` (Fase 2 do plano) — o front não muda, só troca o alimentador.
6. **Produção**: aplicar a migration **`0009-solution-sessions.sql`** (única mudança de schema — e apenas em `app_arkom`, o schema do próprio Arkom; **nada é criado ou alterado nos bancos das soluções**), configurar as envs `SATELLITE_*` e `DASH_LIVE_CENTERS`. O `db.ts` foi ajustado para contar as policies das 16 tabelas obrigatórias, de modo que a tabela nova não quebre a checagem de invariantes.
