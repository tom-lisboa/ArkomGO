// lib/dash/centers/pipeline-mock.ts — mock do painel COMERCIAL (center `pipeline`).
//
// Tematizado com a solução da área: BIA SDR (qualificação + agendamento) e o
// PIPE/CRM. Fabrica pipeline em R$, estágios e negócios com nomes brasileiros
// plausíveis. Pill declara "demonstração" (state: "demo").

import type { Block, Cell, Center } from "@/components/dash/dash-data";
import type { LiveCenter } from "@/lib/dash/types";
import { brl0, brlCompact, chip, cp, days, nm, nu, num0, pct1 } from "@/lib/dash/kit";

export async function buildPipelineMock(_range: string, base: Center): Promise<LiveCenter> {
  const pipelineTotal = 386000;

  const kpis: Block = {
    type: "kpis",
    items: [
      { icon: "target", label: "Pipeline aberto", value: brlCompact(pipelineTotal), badge: { up: true, txt: "+14,2%" }, foot: "23 negócios ativos ↗" },
      { icon: "users", label: "Leads qualificados", value: num0(87), badge: { up: true, txt: "+21,0%" }, foot: "BIA qualificando 24/7 ↗" },
      { icon: "clock", label: "Reuniões marcadas", value: num0(31), badge: { up: true, txt: "+9 vs mês ant." }, foot: "Agenda cheia ↗" },
      { icon: "check", label: "Taxa de fechamento", value: pct1(23.5), badge: { up: true, txt: "+2,1 pp" }, foot: "Últimos 90 dias" },
      { icon: "repeat", label: "Ciclo médio", value: days(24), badge: { up: true, txt: "-3 dias" }, foot: "Do lead ao contrato ↗" },
    ],
  };

  const sinais: Block = {
    type: "signals",
    items: [
      { tone: "warn", icon: "alert", lead: "3 negócios parados há 10+ dias", rest: " · R$ 74 mil em proposta sem resposta. BIA já disparou o follow-up." },
      { tone: "good", icon: "check", lead: "Leads do ADS fecham 31% mais", rest: " · origem tráfego pago está batendo indicação em conversão." },
      { tone: "info", icon: "clock", lead: "5 propostas vencem esta semana", rest: " · follow-ups agendados; 2 com sinal de compra forte." },
    ],
  };

  const estagios: Block = {
    type: "row",
    ratio: "1:2",
    left: {
      kind: "sections",
      icon: "grid",
      title: "Pipeline por estágio",
      sub: "23 negócios · valor em aberto",
      sections: [{
        type: "bars",
        fmt: "brl",
        bars: [
          { label: "Qualificação (BIA)", value: 92000, color: "var(--a)" },
          { label: "Reunião marcada", value: 118000, color: "var(--a)" },
          { label: "Proposta enviada", value: 131000, color: "var(--a)" },
          { label: "Negociação", value: 45000, color: "var(--a)" },
        ],
      }],
    },
    right: {
      kind: "table",
      icon: "target",
      title: "Negócios",
      sub: "Maiores em aberto · ordenados por valor",
      head: [
        { label: "Negócio" },
        { label: "Estágio" },
        { label: "Valor", num: true },
        { label: "Fecha em", num: true },
      ],
      rows: ([
        ["Grupo Andrade Log", "Fernanda · Diretora de Ops", "Proposta enviada", "active", 68000, "12 dias", false],
        ["Clínica Vitalle", "Dr. Rafael · Sócio", "Negociação", "quality", 45000, "5 dias", false],
        ["Onix Motors", "Caue · Ger. Comercial", "Reunião marcada", "active", 38000, "18 dias", false],
        ["Souza & Prado Advogados", "Marina · Sócia", "Proposta enviada", "fatigue", 34000, "parado 11d", true],
        ["Escola Lumiar Kids", "Patrícia · Diretora", "Qualificação (BIA)", "learning", 22000, "novo", false],
      ] as const).map(([nome, contato, estagio, variante, valor, prazo, danger]): Cell[] => [
        nm(nome, contato),
        cp([chip(estagio, variante)]),
        nu(brl0(valor)),
        nu(prazo, danger),
      ]),
    },
  };

  const atividade: Block = {
    type: "panel",
    panel: {
      kind: "feed",
      icon: "zap",
      title: "Hoje, feito pela BIA",
      sub: "Cada linha é a SDR de IA trabalhando o funil",
      rows: [
        { time: "09:52", text: "Lead do ADS qualificado · orçamento e dor confirmados, reunião oferecida", role: "BIA SDR" },
        { time: "09:24", text: "Follow-up 3 enviado ao Grupo Andrade · proposta reforçada com case", role: "BIA SDR" },
        { time: "08:47", text: "Reunião marcada com Onix Motors · qui 14h, brief enviado ao closer", role: "BIA SDR" },
        { time: "08:15", text: "12 leads novos enriquecidos e priorizados por fit", role: "PIPE" },
        { time: "07:40", text: "Negócio Souza & Prado marcado como parado · resgate agendado", role: "PIPE" },
      ],
    },
  };

  return {
    center: {
      ...base,
      short: "Comercial",
      name: "BIA SDR · Pipeline Comercial",
      sub: "Do lead à reunião marcada · a SDR de IA trabalhando o funil",
      tools: ["BIA SDR", "PIPE"],
      blocks: [kpis, sinais, estagios, atividade],
    },
    state: "demo",
    source: "mock · demonstração (BIA SDR + PIPE)",
  };
}
