// lib/dash/centers/ads-mock.ts — mock do painel ADS (center `meta`).
//
// O painel real está travado por RLS/permissão na solução de origem; este
// builder fabrica os MESMOS blocks (6 KPIs, área de gasto, barras por campanha,
// sinais, tabela de campanhas) com valores brasileiros plausíveis. A UI não
// distingue — só a pill de procedência declara "demonstração" (state: "demo").

import type { Block, Cell, Center } from "@/components/dash/dash-data";
import type { LiveCenter } from "@/lib/dash/types";
import {
  areaSeries,
  brl0,
  brlCompact,
  chip,
  cp,
  nm,
  nu,
  num0,
  yLabels,
  yMoney,
} from "@/lib/dash/kit";

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
      { icon: "users", label: "Leads", value: num0(leads), badge: { up: true, txt: "+10,5%" }, foot: "Segurando firme ↗" },
      { icon: "target", label: "Custo por Lead", value: brl0(gastoTotal / leads), badge: { up: false, txt: "+7,7%" }, foot: "Subindo devagar ↘" },
      { icon: "click", label: "CTR do Link", value: "0,94%", badge: { up: false, txt: "-3,5%" }, foot: "Criativo enfraquecendo ↘" },
      { icon: "eye", label: "CPM", value: brl0(36), badge: { up: true, txt: "-0,7%" }, foot: "Leilão normal" },
      { icon: "repeat", label: "Frequência", value: "1,93", badge: { up: false, txt: "+0,2%" }, foot: "Espaço para escalar ↗" },
    ],
  };

  const pico = Math.max(...gastoDia);
  const area: Block = {
    type: "row",
    ratio: "2:1",
    left: {
      kind: "area",
      icon: "trend",
      title: "Investimento por dia",
      sub: `Gasto diário · últimos ${dias} dias`,
      seedKey: "ads-mock",
      yLabels: yLabels(pico, yMoney),
      xLabels: ["", "", "", "", "", "", ""],
      values: areaSeries(gastoDia),
      legend: [{ label: "investimento", color: "var(--a)" }],
    },
    right: {
      kind: "sections",
      icon: "grid",
      title: "Gasto por campanha",
      sections: [{
        type: "bars",
        fmt: "brl",
        bars: [
          { label: "Institucional · Reels", value: 10740, color: "var(--a)" },
          { label: "Remarketing · Carrinho", value: 8528, color: "var(--a)" },
          { label: "Prospecção · Interesses", value: 5686, color: "var(--a)" },
          { label: "Lookalike 1% · Compra", value: 3790, color: "var(--a)" },
        ],
      }],
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
      kind: "table",
      icon: "mega",
      title: "Campanhas",
      sub: "4 ativas · ordenadas por investimento",
      head: [
        { label: "Campanha" },
        { label: "Status" },
        { label: "Investido", num: true },
        { label: "Leads", num: true },
        { label: "CPL", num: true },
      ],
      rows: ([
        ["Institucional · Reels", "active", 10740, 447, 24.03],
        ["Remarketing · Carrinho", "fatigue", 8528, 203, 42.01],
        ["Prospecção · Interesses", "active", 5686, 132, 43.08],
        ["Lookalike 1% · Compra", "learning", 3790, 124, 30.56],
      ] as const).map(([nome, variante, inv, lds, cpl]): Cell[] => [
        nm(nome, "Meta Ads · Instagram + Facebook"),
        cp([chip(variante === "active" ? "Ativa" : variante === "fatigue" ? "Fadiga" : "Aprendizado", variante)]),
        nu(brl0(inv)),
        nu(num0(lds)),
        nu(brl0(cpl)),
      ]),
    },
  };

  return {
    // chrome tematizado com a solução da área (o preview do coverflow e o
    // cabeçalho do painel mostram a solução, não o snapshot "Brightline").
    center: {
      ...base,
      short: "ADS",
      name: "ADS · Aquisição Paga",
      sub: "Tráfego pago rodando sozinho · campanhas, criativos e verba",
      tools: ["ADS", "Meta"],
      blocks: [kpis, area, sinais, campanhas],
    },
    state: "demo", // honesto: é mock, não dado real
    source: "mock · demonstração (ADS)",
  };
}
