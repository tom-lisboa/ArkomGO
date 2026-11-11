# Guia — Mockar dados NO DASHBOARD (sem tocar nas soluções)

> Para o desenvolvedor. Como preencher os dashboards da Arkom com dados de demonstração
> **na camada do próprio dashboard** (arkom-dash), sem depender de gravar no banco de cada
> solução. Serve para os painéis que estão travados por RLS/permissão (ADS, CS AI,
> ONBOARDING) ou ainda em modo demo (SOCIAL).
>
> **Regra de ouro:** o dado mockado é fabricado no código do dashboard e devolvido no
> mesmo formato que um dado real teria. A UI (`DashboardBody`, gráficos, coverflow) **não
> muda nada** — ela só conhece o shape `Center`.

---

## 1. Como o dashboard obtém os dados (o fluxo)

```
/dash  →  Dashboard.tsx  →  GET /api/dash/[center]?range=…
                                     │
                                     ▼
                       registry.ts  →  builderFor(centerId)
                                     │
                    ┌────────────────┴─────────────────┐
                    ▼                                    ▼
          builder existe (LIVE)                  não existe (DEMO)
     src/lib/dash/centers/<x>.ts          usa o snapshot de dash-data.ts
                    │                                    │
                    ▼                                    ▼
        LiveCenter { center, state, source }   { state: "demo" }
                    │
                    ▼
        Dashboard.tsx renderiza center.blocks (a UI)
```

O ponto de injeção é o **builder**: uma função `(range, base, ctx) => Promise<LiveCenter>`
que devolve um objeto `Center` com os `blocks` a exibir. **Mockar = escrever um builder
que fabrica os blocks em vez de ler o banco.**

Arquivos-chave:
- `src/lib/dash/registry.ts` — mapa `BUILDERS` (qual center usa qual builder) + `DASH_LIVE_CENTERS` (env).
- `src/lib/dash/types.ts` — `LiveCenter`, `DataState`, `CenterBuilder`.
- `src/lib/dash/kit.ts` — helpers de formatação/série (use estes, não reinvente).
- `src/components/dash/dash-data.ts` — os tipos `Center`/`Block`/`Kpi`/`Signal`/`Panel`/`Cell`.
- `src/lib/dash/centers/*.ts` — os builders reais já prontos (copie a estrutura).

---

## 2. O contrato de dados (o que um mock precisa devolver)

Um builder devolve `LiveCenter`:

```ts
type LiveCenter = {
  center: Center;      // o chrome (nome/cor/ranges) + os blocks a exibir
  state: DataState;    // "live" | "live-partial" | "live-empty" | "demo"
  source: string;      // texto do tooltip da pill ("mock · demonstração")
};
```

`Center.blocks` é um array de `Block`. Os 4 tipos de bloco:

```ts
// 1) Cartões de KPI (a linha de números no topo)
{ type: "kpis", items: Kpi[] }
type Kpi = {
  icon: IconKey;                       // ver lista na §5
  label: string;                       // "Receita do Mês"
  value: string;                       // "R$ 226,2 mil"  (JÁ formatado — string)
  badge?: { up: boolean; txt: string };// seta ↗/↘ + "+12,4%"  (up=true → verde)
  foot?: string;                       // legenda pequena embaixo
  spark?: boolean;                     // liga a mini-linha
  sparkValues?: number[];              // série 0..1 (SÓ ligue spark se tiver isto!)
};

// 2) Sinais (as 3 tarjas de alerta/insight)
{ type: "signals", items: Signal[] }
type Signal = { tone: "good"|"warn"|"info"; icon: IconKey; lead: string; rest?: string };

// 3) Duas colunas lado a lado
{ type: "row", ratio?: "2:1"|"1:2"|"1:1", left: Panel, right: Panel }

// 4) Um painel de largura total
{ type: "panel", panel: Panel }
```

`Panel` é um de cinco tipos (discriminados por `kind`):

```ts
// área (gráfico de linha)
{ kind: "area", icon, title, sub?, seedKey: string, yLabels: string[], xLabels: string[],
  height?: number, values?: number[] /* série 0..1 */, legend?: {label,color}[] }

// barras horizontais + subtítulos + tabelinha
{ kind: "sections", icon?, title?, sub?, sections: Section[] }
//   Section de barras: { type:"bars", fmt:"usd"|"num"|"pct"|"brl", bars:{label,value,color?}[] }
//   Section de subtítulo: { type:"subhead", icon, title }
//   Section de tabela: { type:"table", head:{label,num?}[], rows: Cell[][] }

// tabela cheia
{ kind: "table", icon, title, sub?, head: {label,num?}[], rows: Cell[][] }

// feed (timeline)
{ kind: "feed", icon, title, sub?, rows: {time,text,role}[] }

// pacing (barras de progresso com chip)
{ kind: "pacing", icon, title, sub?, rows: {label,pct,state,variant}[] }
```

Célula de tabela (`Cell`) — os 5 formatos:

```ts
nm("Nome", "subtítulo")      // nome + linha secundária
tx("texto", danger?)         // texto (danger=true → vermelho)
nu("R$ 1.234", danger?)      // número alinhado à direita
cp([chip("Ativo","active")]) // chips coloridos
pg(72, danger?)              // barra de progresso 0..100
```

> **Sempre importe os helpers `nm/tx/nu/cp/pg/chip` de `@/lib/dash/kit`** — eles já
> produzem o shape certo.

---

## 3. Onde plugar o mock — escolha por caso

### Caso A — Dashboard inteiro em mock (ADS, SOCIAL)
Crie `src/lib/dash/centers/<center>-mock.ts` exportando um builder, e registre em
`registry.ts`. É o caminho recomendado (dado rico, controlado, tipado). Exemplo completo na §6.

### Caso B — Uma solução dentro de um center composto (CS AI, ONBOARDING no center `ops`)
O center `ops` já lê 6 soluções. DESK/HOLLY/HARVEY/ATLAS têm dado; CS AI e ONBOARDING
voltam "sem acesso". Em `src/lib/dash/centers/ops.ts`, onde hoje se testa
`csContracts.available`, troque o ramo "sem acesso" por **valores mockados**:

```ts
// hoje:
value: csContracts.available ? brlCompact(mrr) : "sem acesso",
// vira (mock quando não há acesso real):
value: csContracts.available ? brlCompact(mrr) : brlCompact(48200), // MRR mockado
```

Faça o mesmo nas linhas da tabela "As soluções da operação" (a `solutionsTable`) e nos
sinais. Assim o painel de operação fica completo sem depender do banco do CS AI/ONBOARDING.

### Caso C — Snapshot estático (o mais simples)
`meta` (ADS) e `content` (SOCIAL) hoje caem no snapshot sintético de `dash-data.ts`
(negócio fictício "Brightline", em inglês). Você pode **editar esse snapshot** para
valores brasileiros da Bloom. É rápido, mas menos flexível que um builder (não reage a
range nem a dado real futuro). Prefira o Caso A.

---

## 4. Como ligar um builder mockado

Em `src/lib/dash/registry.ts`:

```ts
import { buildAdsMock } from "@/lib/dash/centers/ads-mock";

const BUILDERS: Partial<Record<CenterId, CenterBuilder>> = {
  pipeline: buildPipelineCenter,
  finance:  buildFinanceCenter,
  outbound: buildOutboundCenter,
  ops:      buildOpsCenter,
  meta:     buildAdsMock,      // ← ADS agora usa o mock
  content:  buildSocialMock,   // ← SOCIAL agora usa o mock
};
```

E no `.env.local` inclua os ids no `DASH_LIVE_CENTERS`:
```
DASH_LIVE_CENTERS=pipeline,finance,outbound,ops,meta,content
```

> **Honestidade (importante):** hoje a UI mostra uma pill de procedência. Um mock **não é
> dado real** — devolva `state: "demo"` (pill cinza "demonstração") para nunca mentir
> como "dados reais". Se para a demcomercial você quiser a pill limpa, crie um estado
> `"mock"` novo em `types.ts` + `Dashboard.tsx` (PILL) com tom neutro, controlado por env
> (ex.: `DASH_DEMO_MODE=true`), para que **produção nunca** exiba mock como real.

---

## 5. Referência rápida

**Ícones (`IconKey`)** — use só estes:
`dollar users target click eye repeat trend grid mega clock check alert send reply play file heart shield zap bank terminal`

**Chips (`ChipVariant`)** — cor por variante:
`active` (verde/azul, "ativo") · `quality` (verde, "bom") · `learning` (neutro) ·
`qavg` (âmbar, "médio") · `fatigue` (vermelho, "atenção/ruim") · `paused` (cinza)

**Formato de barras (`BarFmt`)**: `"brl"` (R$) · `"num"` · `"pct"` (%) · `"usd"` ($)

**Helpers de `@/lib/dash/kit`** (não reinvente):
- Formatação: `brl0(1234)`→"R$ 1.234" · `brl2` · `brlCompact(226200)`→"R$ 226,2 mil" · `num0` · `pct1(23.7)`→"23,7%" · `minutes(4)` · `days(24)`
- Badge/tendência: `delta(atual, anterior, inverse?)` (badge %) · `deltaPP(atual, anterior)` (pontos percentuais — use em métrica que já é %)
- Séries p/ gráfico: `dailyCounts(timestamps, w)` · `areaSeries(valores)` (→0..1 p/ area/spark) · `normalize` · `yLabels(pico, fmt)` · `yMoney` · `xLabelsForWindow(w)`
- Tempo: `windowOfDays(30)` (janela atual+anterior) · `iso` · `isoDate` · `ago` · `until`
- Células: `nm tx nu cp pg chip`
- Agregação: `sum` · `avg`

---

## 6. Exemplo completo — mock do ADS (center `meta`)

Copie, ajuste os números, e registre no `BUILDERS`. Reproduz a estrutura do painel real
(6 KPIs, área de gasto, barras por campanha, sinais, tabela) com valores brasileiros.

```ts
// src/lib/dash/centers/ads-mock.ts
import type { Block, Cell, Center } from "@/components/dash/dash-data";
import type { LiveCenter } from "@/lib/dash/types";
import { areaSeries, brl0, brlCompact, chip, cp, nm, nu, num0, pct1, yLabels, yMoney } from "@/lib/dash/kit";

const parseRange = (r: string) => Number.parseInt(r, 10) || 30;

export async function buildAdsMock(range: string, base: Center): Promise<LiveCenter> {
  const dias = parseRange(range);

  // série de gasto diária (curva suave, plausível) — só valores, o gráfico normaliza
  const gastoDia = Array.from({ length: dias }, (_, i) =>
    900 + Math.round(500 * Math.sin(i / 4) + i * 12));
  const gastoTotal = gastoDia.reduce((a, b) => a + b, 0);
  const leads = 1049;

  const kpis: Block = {
    type: "kpis",
    items: [
      { icon: "dollar", label: "Investimento", value: brlCompact(gastoTotal), badge: { up: true, txt: "+19,0%" }, foot: "Em alta ↗", spark: true, sparkValues: areaSeries(gastoDia) },
      { icon: "users",  label: "Leads", value: num0(leads), badge: { up: true, txt: "+10,5%" }, foot: "Segurando firme ↗" },
      { icon: "target", label: "Custo por Lead", value: brl0(gastoTotal / leads), badge: { up: false, txt: "+7,7%" }, foot: "Subindo devagar ↘" },
      { icon: "click",  label: "CTR do Link", value: "0,94%", badge: { up: false, txt: "-3,5%" }, foot: "Criativo enfraquecendo ↘" },
      { icon: "eye",    label: "CPM", value: brl0(36), badge: { up: true, txt: "-0,7%" }, foot: "Leilão normal" },
      { icon: "repeat", label: "Frequência", value: "1,93", badge: { up: false, txt: "+0,2%" }, foot: "Espaço para escalar ↗" },
    ],
  };

  const pico = Math.max(...gastoDia);
  const area: Block = {
    type: "row", ratio: "2:1",
    left: {
      kind: "area", icon: "trend", title: "Investimento por dia",
      sub: `Gasto diário · últimos ${dias} dias`, seedKey: "ads-mock",
      yLabels: yLabels(pico, yMoney), xLabels: ["", "", "", "", "", "", ""],
      values: areaSeries(gastoDia), legend: [{ label: "investimento", color: "var(--a)" }],
    },
    right: {
      kind: "sections", icon: "grid", title: "Gasto por campanha",
      sections: [{ type: "bars", fmt: "brl", bars: [
        { label: "Institucional · Reels", value: 10740, color: "var(--a)" },
        { label: "Remarketing · Carrinho", value: 8528, color: "var(--a)" },
        { label: "Prospecção · Interesses", value: 5686, color: "var(--a)" },
        { label: "Lookalike 1% · Compra", value: 3790, color: "var(--a)" },
      ] }],
    },
  };

  const sinais: Block = {
    type: "signals",
    items: [
      { tone: "warn", icon: "alert", lead: "Remarketing · Carrinho com frequência 3,1", rest: " · CPL subindo 28% em 14d. Gire o criativo antes de escalar." },
      { tone: "good", icon: "check", lead: "Lookalike 1% Compra bate o interesse em CPL por 31%", rest: " · realoque orçamento para o público que converte." },
      { tone: "info", icon: "target", lead: "Prospecção em fase de aprendizado", rest: " · 38 conv/sem vs as 50 que precisa. Consolide os conjuntos." },
    ],
  };

  const campanhas: Block = {
    type: "panel",
    panel: {
      kind: "table", icon: "mega", title: "Campanhas", sub: "4 ativas · ordenadas por investimento",
      head: [{ label: "Campanha" }, { label: "Status" }, { label: "Investido", num: true }, { label: "Leads", num: true }, { label: "CPL", num: true }],
      rows: ([
        ["Institucional · Reels", "active", 10740, 447, 24.03],
        ["Remarketing · Carrinho", "fatigue", 8528, 203, 42.01],
        ["Prospecção · Interesses", "active", 5686, 132, 43.08],
        ["Lookalike 1% · Compra", "learning", 3790, 124, 30.56],
      ] as const).map(([nome, variante, inv, lds, cpl]): Cell[] => [
        nm(nome, "Meta Ads · Instagram + Facebook"),
        cp([chip(variante === "active" ? "Ativa" : variante === "fatigue" ? "Fadiga" : "Aprendizado", variante)]),
        nu(brl0(inv)), nu(num0(lds)), nu(brl0(cpl)),
      ]),
    },
  };

  return {
    center: { ...base, blocks: [kpis, area, sinais, campanhas] },
    state: "demo",                       // ← honesto: é mock, não dado real
    source: "mock · demonstração (ADS)",
  };
}
```

---

## 7. O que mockar em cada dashboard faltante (lista de compras)

### ADS · `meta` (mock — ver §6)
KPIs: **Investimento, Leads, CPL, CTR, CPM, Frequência**. Painéis: área de gasto diário,
barras por campanha, sinais de fadiga/aprendizado, tabela de campanhas. Valores realistas:
investimento R$ 25–45 mil/mês, CPL R$ 25–45, CTR 0,8–1,2%.

### SOCIAL · `content`
> Obs.: **já existem dados reais em `app_social`** (seed feito). Você pode escrever um
> builder REAL (leia `analytics_snapshots`/`autopilot_posts` como os outros builders) em
> vez de mock. Se preferir mock: KPIs **Seguidores, Engajamento %, Posts publicados,
> Posts agendados, Alcance**; barras seguidores por rede; tabela de top posts.

### CS AI (dentro de `ops`, Caso B)
Números para o mock quando "sem acesso": **MRR R$ 40–60 mil** (soma de contratos ativos),
**NPS 30–60**, distribuição de saúde (ex.: 8 verde / 4 amarelo / 2 vermelho),
**tickets abertos 12–25** (2–4 com SLA em risco), **alertas críticos 1–3**.

### ONBOARDING (dentro de `ops`, Caso B)
**Onboardings ativos 6–12**, **1–3 atrasados**, **progresso médio 55–75%**,
**eNPS 60–80**, **taxa de coleta de documentos 70–90%**.

---

## 8. Checklist para o dev
- [ ] Mock devolve `LiveCenter` com `state: "demo"` (ou `"mock"` novo) — **nunca "live"**.
- [ ] Números formatados com os helpers de `kit.ts` (R$/%/datas em pt-BR).
- [ ] `spark: true` **só** com `sparkValues`; senão a UI desenha uma onda decorativa fake.
- [ ] Legenda do gráfico lista só a curva que é de fato desenhada (o `AreaChart` desenha 1).
- [ ] Enums de chip/ícone dentro das listas da §5 (fora disso, quebra o tipo).
- [ ] `npx tsc --noEmit` limpo antes de subir.
- [ ] Registrar o builder no `BUILDERS` e adicionar o id ao `DASH_LIVE_CENTERS`.
