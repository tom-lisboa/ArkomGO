// lib/dash/centers/outbound-mock.ts — mock do painel de PROSPECÇÃO (center `outbound`).
//
// Tematizado com as soluções da área: SDR (cadências de e-mail) e Social
// Selling (LinkedIn). Envios/respostas/reuniões com números plausíveis.
// Pill declara "demonstração" (state: "demo").

import type { Block, Cell, Center } from "@/components/dash/dash-data";
import type { LiveCenter } from "@/lib/dash/types";
import { areaSeries, chip, cp, nm, nu, num0, pct1, yLabels } from "@/lib/dash/kit";

const parseRange = (r: string) => Number.parseInt(r, 10) || 30;

export async function buildOutboundMock(range: string, base: Center): Promise<LiveCenter> {
  const dias = parseRange(range);

  // envios por dia (dias úteis fortes, fins de semana fracos)
  const enviosDia = Array.from({ length: dias }, (_, i) =>
    i % 7 >= 5 ? 14 : 120 + Math.round(28 * Math.sin(i / 3)));
  const envios = enviosDia.reduce((a, b) => a + b, 0);
  const respostas = Math.round(envios * 0.062);

  const kpis: Block = {
    type: "kpis",
    items: [
      { icon: "send", label: "Mensagens enviadas", value: num0(envios), badge: { up: true, txt: "+11,8%" }, foot: "E-mail + LinkedIn ↗", spark: true, sparkValues: areaSeries(enviosDia) },
      { icon: "reply", label: "Respostas", value: num0(respostas), badge: { up: true, txt: "+17,4%" }, foot: "Interesse subindo ↗" },
      { icon: "target", label: "Taxa de resposta", value: pct1(6.2), badge: { up: true, txt: "+0,9 pp" }, foot: "Acima do benchmark (4%)" },
      { icon: "clock", label: "Reuniões geradas", value: num0(19), badge: { up: true, txt: "+6 vs período ant." }, foot: "Handoff pra BIA ↗" },
      { icon: "users", label: "Conexões novas", value: num0(214), badge: { up: true, txt: "LinkedIn" }, foot: "Social Selling ↗" },
    ],
  };

  const pico = Math.max(...enviosDia);
  const area: Block = {
    type: "row",
    ratio: "2:1",
    left: {
      kind: "area",
      icon: "trend",
      title: "Envios por dia",
      sub: `Cadências ativas · últimos ${dias} dias`,
      seedKey: "outbound-mock",
      yLabels: yLabels(pico, (v) => num0(v)),
      xLabels: ["", "", "", "", "", "", ""],
      values: areaSeries(enviosDia),
      legend: [{ label: "envios", color: "var(--a)" }],
    },
    right: {
      kind: "sections",
      icon: "grid",
      title: "Respostas por canal",
      sections: [{
        type: "bars",
        fmt: "num",
        bars: [
          { label: "E-mail · cadência fria", value: 96, color: "var(--a)" },
          { label: "LinkedIn · conexão + DM", value: 71, color: "var(--a)" },
          { label: "E-mail · reativação", value: 34, color: "var(--a)" },
          { label: "WhatsApp · follow-up", value: 22, color: "var(--a)" },
        ],
      }],
    },
  };

  const sinais: Block = {
    type: "signals",
    items: [
      { tone: "good", icon: "check", lead: "Cadência 'dor específica' responde 2,3x mais", rest: " · o copy com case do segmento venceu o teste A/B." },
      { tone: "warn", icon: "alert", lead: "Domínio 2 com abertura caindo (31% → 22%)", rest: " · warm-up reforçado e volume reduzido por 7 dias." },
      { tone: "info", icon: "clock", lead: "Lista de logística esgota em 9 dias", rest: " · próximo lote de 400 contatos já enriquecido pelo PIPE." },
    ],
  };

  const cadencias: Block = {
    type: "panel",
    panel: {
      kind: "table",
      icon: "send",
      title: "Cadências",
      sub: "Ativas · ordenadas por reuniões geradas",
      head: [
        { label: "Cadência" },
        { label: "Status" },
        { label: "Enviadas", num: true },
        { label: "Respostas", num: true },
        { label: "Reuniões", num: true },
      ],
      rows: ([
        ["Logística · dor específica", "E-mail · 5 toques", "Ativa", "active", 1240, 89, 9, false],
        ["Clínicas · social selling", "LinkedIn · conexão + 3 DMs", "Ativa", "active", 680, 52, 6, false],
        ["Advocacia · reativação", "E-mail · base fria antiga", "Ativa", "learning", 410, 27, 3, false],
        ["Educação · piloto", "E-mail + WhatsApp", "Pausada", "paused", 180, 9, 1, false],
      ] as const).map(([nome, sub, rotulo, variante, env, resp, meet, danger]): Cell[] => [
        nm(nome, sub),
        cp([chip(rotulo, variante)]),
        nu(num0(env)),
        nu(num0(resp), danger),
        nu(num0(meet)),
      ]),
    },
  };

  return {
    center: {
      ...base,
      short: "Prospecção",
      name: "SDR · Prospecção Outbound",
      sub: "Cadências de e-mail + Social Selling no LinkedIn, sem humano no loop",
      tools: ["SDR", "Social Selling"],
      blocks: [kpis, area, sinais, cadencias],
    },
    state: "demo",
    source: "mock · demonstração (SDR + Social Selling)",
  };
}
