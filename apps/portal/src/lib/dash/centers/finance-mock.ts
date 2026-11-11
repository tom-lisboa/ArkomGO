// lib/dash/centers/finance-mock.ts — mock do painel FINANCEIRO (center `finance`).
//
// Tematizado com a solução da área: FINANCE (gestão financeira com IA).
// Receita/despesa/margem/inadimplência em R$, categorias e contas com nomes
// brasileiros plausíveis. Pill declara "demonstração" (state: "demo").

import type { Block, Cell, Center } from "@/components/dash/dash-data";
import type { LiveCenter } from "@/lib/dash/types";
import { areaSeries, brl0, brlCompact, chip, cp, nm, nu, pct1, yLabels, yMoney } from "@/lib/dash/kit";

export async function buildFinanceMock(_range: string, base: Center): Promise<LiveCenter> {
  // receita mensal (12 meses, crescimento com sazonalidade leve)
  const receitaMes = Array.from({ length: 12 }, (_, i) =>
    148000 + Math.round(i * 6800 + 12000 * Math.sin(i / 2)));
  const receita = receitaMes[receitaMes.length - 1];
  const despesas = 131400;

  const kpis: Block = {
    type: "kpis",
    items: [
      { icon: "bank", label: "Receita do mês", value: brlCompact(receita), badge: { up: true, txt: "+8,3%" }, foot: "Em alta ↗", spark: true, sparkValues: areaSeries(receitaMes) },
      { icon: "dollar", label: "Despesas", value: brlCompact(despesas), badge: { up: true, txt: "-2,1%" }, foot: "Sob controle ↗" },
      { icon: "trend", label: "Margem", value: pct1(((receita - despesas) / receita) * 100), badge: { up: true, txt: "+4,6 pp" }, foot: "Operação saudável ↗" },
      { icon: "clock", label: "A receber (30d)", value: brlCompact(87300), badge: { up: true, txt: "14 títulos" }, foot: "Cobranças automáticas" },
      { icon: "alert", label: "Inadimplência", value: pct1(3.2), badge: { up: false, txt: "+0,4 pp" }, foot: "2 clientes em régua ↘" },
    ],
  };

  const pico = Math.max(...receitaMes);
  const fluxo: Block = {
    type: "row",
    ratio: "2:1",
    left: {
      kind: "area",
      icon: "trend",
      title: "Receita por mês",
      sub: "Últimos 12 meses · reconhecida no caixa",
      seedKey: "finance-mock",
      yLabels: yLabels(pico, yMoney),
      xLabels: ["", "", "", "", "", "", ""],
      values: areaSeries(receitaMes),
      legend: [{ label: "receita", color: "var(--a)" }],
    },
    right: {
      kind: "sections",
      icon: "grid",
      title: "Despesas por categoria",
      sections: [{
        type: "bars",
        fmt: "brl",
        bars: [
          { label: "Pessoas", value: 58200, color: "var(--a)" },
          { label: "Marketing (ADS)", value: 33300, color: "var(--a)" },
          { label: "Ferramentas & IA", value: 18700, color: "var(--a)" },
          { label: "Estrutura", value: 21200, color: "var(--a)" },
        ],
      }],
    },
  };

  const sinais: Block = {
    type: "signals",
    items: [
      { tone: "warn", icon: "alert", lead: "2 títulos vencidos somam R$ 12,4 mil", rest: " · régua de cobrança no passo 2 de 4; pix de quitação enviado." },
      { tone: "good", icon: "check", lead: "Margem 4,6 pp acima do trimestre anterior", rest: " · corte de ferramentas ociosas segurou a despesa." },
      { tone: "info", icon: "clock", lead: "Folha + impostos saem dia 5", rest: " · caixa cobre 3,4 meses de operação no ritmo atual." },
    ],
  };

  const contas: Block = {
    type: "panel",
    panel: {
      kind: "table",
      icon: "file",
      title: "Contas a receber",
      sub: "Próximos vencimentos · cobrança automática",
      head: [
        { label: "Cliente" },
        { label: "Status" },
        { label: "Valor", num: true },
        { label: "Vence", num: true },
      ],
      rows: ([
        ["Grupo Andrade Log", "Mensalidade · contrato anual", "Em dia", "active", 12800, "05/08", false],
        ["Clínica Vitalle", "Implantação · parcela 2/3", "Em dia", "active", 9600, "08/08", false],
        ["Onix Motors", "Mensalidade", "Vencido 12d", "fatigue", 7400, "03/07", true],
        ["Escola Lumiar Kids", "Mensalidade", "Vencido 4d", "qavg", 5000, "11/07", true],
        ["Souza & Prado Advogados", "Mensalidade", "Em dia", "active", 6900, "15/08", false],
      ] as const).map(([nome, sub, rotulo, variante, valor, vence, danger]): Cell[] => [
        nm(nome, sub),
        cp([chip(rotulo, variante)]),
        nu(brl0(valor)),
        nu(vence, danger),
      ]),
    },
  };

  return {
    center: {
      ...base,
      short: "Financeiro",
      name: "FINANCE · Financeiro",
      sub: "Caixa, cobrança e margem no automático · fechamento sem planilha",
      tools: ["FINANCE"],
      blocks: [kpis, fluxo, sinais, contas],
    },
    state: "demo",
    source: "mock · demonstração (FINANCE)",
  };
}
