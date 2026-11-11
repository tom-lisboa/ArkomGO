// lib/dash/centers/ops-mock.ts — mock do painel de OPERAÇÃO (center `ops`).
//
// O center composto da operação lê as soluções internas; CS AI e ONBOARDING
// estão travados por RLS/permissão na origem — aqui o painel inteiro vem
// mockado com números plausíveis (MRR, NPS, saúde da carteira, tickets,
// onboardings) até os builders reais existirem. Pill declara "demonstração".

import type { Block, Cell, Center } from "@/components/dash/dash-data";
import type { LiveCenter } from "@/lib/dash/types";
import { brlCompact, chip, cp, nm, num0, nu, pct1, tx } from "@/lib/dash/kit";

export async function buildOpsMock(_range: string, base: Center): Promise<LiveCenter> {
  // CS AI (mock §7): carteira 14 contas · MRR 48,2 mil · NPS 42 · saúde 8/4/2
  const mrr = 48200;
  const contas = 14;

  const kpis: Block = {
    type: "kpis",
    items: [
      { icon: "bank", label: "MRR da carteira", value: brlCompact(mrr), badge: { up: true, txt: "+6,2%" }, foot: `${contas} contratos ativos ↗` },
      { icon: "heart", label: "NPS", value: num0(42), badge: { up: true, txt: "+8 pts" }, foot: "Última onda · 30d" },
      { icon: "alert", label: "Tickets abertos", value: num0(18), badge: { up: false, txt: "3 SLA em risco" }, foot: "CS AI monitorando ↘" },
      { icon: "users", label: "Onboardings ativos", value: num0(9), badge: { up: false, txt: "2 atrasados" }, foot: "Do kickoff ao go-live" },
      { icon: "check", label: "Progresso médio", value: pct1(68), badge: { up: true, txt: "+5 pp" }, foot: "Onboarding · etapas concluídas ↗" },
    ],
  };

  const sinais: Block = {
    type: "signals",
    items: [
      { tone: "warn", icon: "alert", lead: "2 contas em saúde vermelha", rest: " · sem login há 12 dias e ticket crítico aberto. CS AI já disparou o resgate." },
      { tone: "good", icon: "check", lead: "eNPS do onboarding em 72", rest: " · coleta de documentos em 84% — acima da meta de 80%." },
      { tone: "info", icon: "clock", lead: "3 go-lives previstos esta semana", rest: " · nenhum bloqueio aberto; checklists a 90%+." },
    ],
  };

  const saude: Block = {
    type: "row",
    ratio: "1:1",
    left: {
      kind: "sections",
      icon: "shield",
      title: "Saúde da carteira",
      sub: `${contas} contas · classificação do CS AI`,
      sections: [{
        type: "bars",
        fmt: "num",
        bars: [
          { label: "Saudáveis", value: 8, color: "var(--good)" },
          { label: "Atenção", value: 4, color: "var(--a)" },
          { label: "Críticas", value: 2, color: "var(--bad)" },
        ],
      }],
    },
    right: {
      kind: "pacing",
      icon: "clock",
      title: "Onboardings em andamento",
      sub: "9 ativos · progresso vs prazo",
      rows: [
        { label: "Clínica Vitalle", pct: 92, state: "go-live sex", variant: "quality" },
        { label: "Grupo Andrade Log", pct: 74, state: "no prazo", variant: "active" },
        { label: "Escola Lumiar Kids", pct: 61, state: "no prazo", variant: "active" },
        { label: "Souza & Prado Advogados", pct: 43, state: "atrasado 4d", variant: "fatigue" },
        { label: "Onix Motors", pct: 28, state: "atrasado 2d", variant: "fatigue" },
      ],
    },
  };

  const solucoes: Block = {
    type: "panel",
    panel: {
      kind: "table",
      icon: "grid",
      title: "As soluções da operação",
      sub: "O que cada agente entregou no período",
      head: [
        { label: "Solução" },
        { label: "Status" },
        { label: "Métrica-chave" },
        { label: "Valor", num: true },
      ],
      rows: ([
        ["DESK", "Atendimento · tickets resolvidos", "active", "Ativa", "Resolução sem humano", "78%", false],
        ["HOLLY RH", "Recrutamento · triagens", "active", "Ativa", "Candidatos triados", "312", false],
        ["HARVEY", "Jurídico · contratos revisados", "active", "Ativa", "Contratos no mês", "47", false],
        ["ATLAS", "Estratégia · relatórios gerados", "active", "Ativa", "Relatórios no mês", "26", false],
        ["CS AI", "Customer Success · carteira", "learning", "Mock", "MRR monitorado", brlCompact(mrr), false],
        ["ONBOARDING", "Implantação · clientes novos", "learning", "Mock", "eNPS do onboarding", "72", false],
      ] as const).map(([nome, sub, variante, rotulo, metrica, valor, danger]): Cell[] => [
        nm(nome, sub),
        cp([chip(rotulo, variante)]),
        tx(metrica),
        nu(valor, danger),
      ]),
    },
  };

  // documentos coletados — barra final de acompanhamento do onboarding
  const coleta: Block = {
    type: "panel",
    panel: {
      kind: "pacing",
      icon: "file",
      title: "Coleta de documentos (onboarding)",
      sub: "Taxa por cliente · meta 80%",
      rows: [
        { label: "Clínica Vitalle", pct: 100, state: "completo", variant: "quality" },
        { label: "Grupo Andrade Log", pct: 88, state: "no prazo", variant: "active" },
        { label: "Escola Lumiar Kids", pct: 81, state: "no prazo", variant: "active" },
        { label: "Souza & Prado Advogados", pct: 64, state: "pendências", variant: "qavg" },
        { label: "Onix Motors", pct: 52, state: "pendências", variant: "fatigue" },
      ],
    },
  };

  return {
    // chrome tematizado com as soluções da operação (preview + cabeçalho).
    center: {
      ...base,
      short: "Operação",
      name: "Operação · Entrega ao Cliente",
      sub: "Seis soluções, uma sala de operação · agentes fazendo o trabalho",
      tools: ["DESK", "HOLLY", "HARVEY", "ATLAS", "CS AI", "ONB"],
      blocks: [kpis, sinais, saude, solucoes, coleta],
    },
    state: "demo",
    source: "mock · demonstração (CS AI + ONBOARDING)",
  };
}
