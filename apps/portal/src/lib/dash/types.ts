// lib/dash/types.ts — contrato da camada de dados dos dashboards (/dash).
//
// O fluxo: Dashboard.tsx → GET /api/dash/[center]?range=… → registry.builderFor
// → builder devolve LiveCenter (center pronto pra UI + procedência). Sem builder
// registrado/liberado, a API devolve { state: "demo" } e a UI cai no snapshot
// estático de components/dash/dash-data.ts (ou no engine client do Meta).
//
// A UI só conhece o shape `Center` — mock ou dado real chegam IGUAIS; a única
// diferença honesta é a pill de procedência (state + source).

import type { Center } from "@/components/dash/dash-data";

/** Procedência do dado exibido. Mock NUNCA deve declarar "live". */
export type DataState = "live" | "live-partial" | "live-empty" | "demo";

export interface LiveCenter {
  /** o chrome (nome/cor/ranges do base) + os blocks a exibir */
  center: Center;
  state: DataState;
  /** texto do tooltip da pill de procedência (ex.: "mock · demonstração") */
  source: string;
}

/** Contexto passado ao builder (expansível: org, flags…). */
export interface BuilderCtx {
  userId: number;
}

/** Um builder fabrica o Center de um range — lendo banco OU mockando. */
export type CenterBuilder = (
  range: string,
  base: Center,
  ctx: BuilderCtx,
) => Promise<LiveCenter>;

/** Payload da API: builder rodou (LiveCenter) ou não há builder (demo puro). */
export type DashApiPayload = LiveCenter | { state: "demo" };
