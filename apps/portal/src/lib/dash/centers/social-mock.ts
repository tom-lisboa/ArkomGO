// lib/dash/centers/social-mock.ts — mock do painel SOCIAL (center `content`).
//
// A solução SOCIAL já tem seed em app_social; enquanto o builder REAL
// (analytics_snapshots/autopilot_posts) não é escrito, este mock preenche o
// painel com o shape final: KPIs (Seguidores, Engajamento, Publicados,
// Agendados, Alcance), área de seguidores/dia, barras por rede, sinais e a
// tabela de top posts. Pill declara "demonstração" (state: "demo").

import type { Block, Cell, Center } from "@/components/dash/dash-data";
import type { LiveCenter } from "@/lib/dash/types";
import {
  areaSeries,
  chip,
  cp,
  nm,
  nu,
  num0,
  pct1,
  yLabels,
} from "@/lib/dash/kit";

const parseRange = (r: string) => Number.parseInt(r, 10) || 28;

export async function buildSocialMock(range: string, base: Center): Promise<LiveCenter> {
  const dias = parseRange(range);

  // seguidores acumulados por dia (crescimento suave com fins de semana fracos)
  const seguidoresDia = Array.from({ length: dias }, (_, i) =>
    48400 + Math.round(i * 96 + 220 * Math.sin(i / 3)));
  const seguidores = seguidoresDia[seguidoresDia.length - 1];

  const kpis: Block = {
    type: "kpis",
    items: [
      { icon: "users", label: "Seguidores", value: num0(seguidores), badge: { up: true, txt: "+5,6%" }, foot: "Crescendo ↗", spark: true, sparkValues: areaSeries(seguidoresDia) },
      { icon: "heart", label: "Engajamento", value: pct1(4.7), badge: { up: true, txt: "+0,8 pp" }, foot: "Acima da média do nicho ↗" },
      { icon: "send", label: "Posts publicados", value: num0(Math.round(dias * 1.4)), badge: { up: true, txt: "+12,0%" }, foot: "Cadência mantida" },
      { icon: "clock", label: "Posts agendados", value: num0(18), badge: { up: true, txt: "7 dias" }, foot: "Fila do autopilot cheia" },
      { icon: "eye", label: "Alcance", value: num0(412300), badge: { up: true, txt: "+23,4%" }, foot: "Reels puxando ↗" },
    ],
  };

  const pico = Math.max(...seguidoresDia);
  const area: Block = {
    type: "row",
    ratio: "2:1",
    left: {
      kind: "area",
      icon: "trend",
      title: "Seguidores por dia",
      sub: `Base acumulada · últimos ${dias} dias`,
      seedKey: "social-mock",
      yLabels: yLabels(pico, (v) => num0(v / 1000) + " mil"),
      xLabels: ["", "", "", "", "", "", ""],
      values: areaSeries(seguidoresDia),
      legend: [{ label: "seguidores", color: "var(--a)" }],
    },
    right: {
      kind: "sections",
      icon: "grid",
      title: "Seguidores por rede",
      sections: [{
        type: "bars",
        fmt: "num",
        bars: [
          { label: "Instagram", value: 31200, color: "var(--a)" },
          { label: "TikTok", value: 12400, color: "var(--a)" },
          { label: "LinkedIn", value: 5100, color: "var(--a)" },
          { label: "YouTube", value: 2300, color: "var(--a)" },
        ],
      }],
    },
  };

  const sinais: Block = {
    type: "signals",
    items: [
      { tone: "good", icon: "play", lead: "Reels de bastidores rendem 3,1x o alcance médio", rest: " · o autopilot já priorizou o formato na fila da semana." },
      { tone: "warn", icon: "alert", lead: "TikTok caiu 18% em alcance em 14d", rest: " · frequência abaixo de 1 post/dia. Reforce a fila da rede." },
      { tone: "info", icon: "clock", lead: "Melhor janela: ter/qui 19h–21h", rest: " · 62% do engajamento da semana veio dessas faixas." },
    ],
  };

  const topPosts: Block = {
    type: "panel",
    panel: {
      kind: "table",
      icon: "heart",
      title: "Top posts",
      sub: `Melhores do período · últimos ${dias} dias`,
      head: [
        { label: "Post" },
        { label: "Desempenho" },
        { label: "Alcance", num: true },
        { label: "Engajamento", num: true },
        { label: "Salvos", num: true },
      ],
      rows: ([
        ["Bastidores da operação com agentes", "Instagram · Reels", "quality", "Acima da média", 88400, 6.8, 1240],
        ["3 erros ao contratar IA no comercial", "TikTok · Vídeo", "quality", "Acima da média", 64100, 5.9, 890],
        ["Antes/depois do atendimento com BIA", "Instagram · Carrossel", "active", "Na média", 39800, 4.4, 1510],
        ["Rotina de um SDR de IA", "LinkedIn · Post", "active", "Na média", 21500, 3.8, 320],
        ["Corte da mentoria · funil enxuto", "YouTube · Short", "qavg", "Abaixo da média", 9800, 2.1, 110],
      ] as const).map(([titulo, origem, variante, rotulo, alcance, eng, salvos]): Cell[] => [
        nm(titulo, origem),
        cp([chip(rotulo, variante)]),
        nu(num0(alcance)),
        nu(pct1(eng)),
        nu(num0(salvos)),
      ]),
    },
  };

  return {
    // chrome tematizado com a solução da área (preview + cabeçalho do painel).
    center: {
      ...base,
      short: "SOCIAL",
      name: "SOCIAL · Redes Sociais",
      sub: "Conteúdo no autopilot · Instagram, TikTok, LinkedIn e YouTube",
      tools: ["SOCIAL"],
      blocks: [kpis, area, sinais, topPosts],
    },
    state: "demo",
    source: "mock · demonstração (SOCIAL)",
  };
}
