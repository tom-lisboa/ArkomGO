// lib/dash/kit.ts — helpers de formatação/série/célula para builders de /dash.
// Fonte única: builders (reais ou mock) importam DAQUI — não reinvente formato.
// Tudo pt-BR (R$, vírgula decimal), casando com a UI dos dashboards.

import type { Cell, ChipSpec, Kpi } from "@/components/dash/dash-data";
import type { ChipVariant } from "@/components/dash/icons";

/* ---------- formatação ---------- */

/** "R$ 1.234" */
export const brl0 = (v: number): string =>
  "R$ " + Math.round(v).toLocaleString("pt-BR");

/** "R$ 1.234,56" */
export const brl2 = (v: number): string =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "R$ 226,2 mil" · "R$ 1,4 mi" */
export const brlCompact = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return "R$ " + (v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
  if (abs >= 1_000) return "R$ " + (v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  return brl0(v);
};

/** "1.049" */
export const num0 = (v: number): string => Math.round(v).toLocaleString("pt-BR");

/** "23,7%" */
export const pct1 = (v: number): string =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";

/** "4 min" */
export const minutes = (v: number): string => `${Math.round(v)} min`;

/** "24 dias" */
export const days = (v: number): string => `${Math.round(v)} ${Math.round(v) === 1 ? "dia" : "dias"}`;

/* ---------- badge / tendência ---------- */

/** Badge % de variação atual vs anterior. `inverse` = queda é boa (ex.: CPL). */
export function delta(atual: number, anterior: number, inverse = false): Kpi["badge"] {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior) || anterior === 0) return undefined;
  const pct = ((atual - anterior) / Math.abs(anterior)) * 100;
  const up = inverse ? pct <= 0 : pct >= 0;
  const txt = (pct >= 0 ? "+" : "") + pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  return { up, txt };
}

/** Badge em PONTOS PERCENTUAIS — use em métrica que já é % (ex.: CTR). */
export function deltaPP(atual: number, anterior: number, inverse = false): Kpi["badge"] {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior)) return undefined;
  const pp = atual - anterior;
  const up = inverse ? pp <= 0 : pp >= 0;
  const txt = (pp >= 0 ? "+" : "") + pp.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " pp";
  return { up, txt };
}

/* ---------- séries p/ gráfico (area/spark esperam 0..1) ---------- */

/** min-max normaliza uma série para 0..1 (série constante → 0.5). */
export const normalize = (vals: number[]): number[] => {
  if (!vals.length) return [];
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const d = mx - mn;
  return d === 0 ? vals.map(() => 0.5) : vals.map((v) => (v - mn) / d);
};

/** Série de VALORES → série 0..1 pronta pra `values`/`sparkValues`. */
export const areaSeries = (valores: number[]): number[] => normalize(valores);

/** Janela de tempo: dias atual + os mesmos dias imediatamente anteriores. */
export interface DayWindow {
  dias: number;
  /** início da janela atual (00:00 local) */
  start: Date;
  /** início da janela anterior */
  prevStart: Date;
  end: Date;
}

export function windowOfDays(dias: number): DayWindow {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - dias);
  start.setHours(0, 0, 0, 0);
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - dias);
  return { dias, start, prevStart, end };
}

/** Conta timestamps por dia dentro da janela atual → série diária (length=dias). */
export function dailyCounts(timestamps: (Date | string)[], w: DayWindow): number[] {
  const counts = new Array<number>(w.dias).fill(0);
  const dayMs = 86_400_000;
  for (const t of timestamps) {
    const d = t instanceof Date ? t : new Date(t);
    const idx = Math.floor((d.getTime() - w.start.getTime()) / dayMs);
    if (idx >= 0 && idx < w.dias) counts[idx] += 1;
  }
  return counts;
}

/** Labels do eixo Y (4 ticks: pico → 0), formatados por `fmt`. */
export function yLabels(pico: number, fmt: (v: number) => string): string[] {
  const p = Math.max(pico, 1);
  return [p, (p * 2) / 3, p / 3, 0].map((v) => fmt(v));
}

/** Formatador de eixo monetário compacto ("R$ 1,2 mil"). */
export const yMoney = (v: number): string => brlCompact(v);

/** Labels do eixo X para uma janela de N dias (7 ticks: dd/mm … "hoje"). */
export function xLabelsForWindow(w: DayWindow): string[] {
  const ticks = 7;
  const out: string[] = [];
  const span = w.end.getTime() - w.start.getTime();
  for (let i = 0; i < ticks; i++) {
    const d = new Date(w.start.getTime() + (span * i) / (ticks - 1));
    out.push(
      i === ticks - 1
        ? "hoje"
        : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    );
  }
  return out;
}

/* ---------- tempo ---------- */

export const iso = (d: Date): string => d.toISOString();
export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
/** Date de N dias atrás. */
export const ago = (diasAtras: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d;
};
/** Date de N dias à frente. */
export const until = (diasAFrente: number): Date => ago(-diasAFrente);

/* ---------- células de tabela ---------- */

export const nm = (text: string, sub: string): Cell => ({ kind: "name", text, sub });
export const tx = (text: string, danger = false): Cell => ({ kind: "text", text, danger });
export const nu = (text: string, danger = false): Cell => ({ kind: "num", text, danger });
export const cp = (chips: ChipSpec[]): Cell => ({ kind: "chips", chips });
export const pg = (pct: number, danger = false): Cell => ({ kind: "progress", pct, danger });
export const chip = (label: string, variant: ChipVariant): ChipSpec => ({ label, variant });

/* ---------- agregação ---------- */

export const sum = (vals: number[]): number => vals.reduce((a, b) => a + b, 0);
export const avg = (vals: number[]): number => (vals.length ? sum(vals) / vals.length : 0);
