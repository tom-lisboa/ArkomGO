// lib/dash/registry.ts — qual center de /dash usa qual builder.
//
// Dupla trava: (1) o builder precisa estar no mapa BUILDERS; (2) o id precisa
// estar liberado na env DASH_LIVE_CENTERS (csv, ex.: "meta,content,ops").
// Sem as duas, a API devolve { state: "demo" } e a UI usa o snapshot estático
// de dash-data.ts — produção sem a env fica exatamente como era.

import { CENTERS, type Center, type CenterId } from "@/components/dash/dash-data";
import type { BuilderCtx, CenterBuilder } from "@/lib/dash/types";
import { buildAdsMock } from "@/lib/dash/centers/ads-mock";
import { buildSocialMock } from "@/lib/dash/centers/social-mock";
import { buildOpsMock } from "@/lib/dash/centers/ops-mock";
import { buildPipelineMock } from "@/lib/dash/centers/pipeline-mock";
import { buildFinanceMock } from "@/lib/dash/centers/finance-mock";
import { buildOutboundMock } from "@/lib/dash/centers/outbound-mock";

const BUILDERS: Partial<Record<CenterId, CenterBuilder>> = {
  meta: buildAdsMock,
  content: buildSocialMock,
  ops: buildOpsMock,
  pipeline: buildPipelineMock,
  finance: buildFinanceMock,
  outbound: buildOutboundMock,
};

/** Ids liberados pela env (lida a cada request — flip sem rebuild). */
function liveCenterIds(): Set<string> {
  return new Set(
    (process.env.DASH_LIVE_CENTERS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function builderFor(centerId: CenterId): CenterBuilder | null {
  if (!liveCenterIds().has(centerId)) return null;
  return BUILDERS[centerId] ?? null;
}

/**
 * CENTERS "efetivos" para o /dash server-side: cada center liberado é
 * substituído pelo resultado do builder (range default) — assim o PREVIEW do
 * coverflow mostra os MESMOS indicadores do painel entrado (soluções da área),
 * não o snapshot estático. Builder que falhar mantém o estático (nunca quebra).
 */
export async function buildEffectiveCenters(ctx: BuilderCtx): Promise<Center[]> {
  return Promise.all(
    CENTERS.map(async (base) => {
      const build = builderFor(base.id);
      if (!build) return base;
      try {
        const range = base.defaultRange ?? base.ranges?.[0] ?? "";
        return (await build(range, base, ctx)).center;
      } catch (error) {
        console.error(`[dash] builder ${base.id} falhou no preview:`, error);
        return base;
      }
    }),
  );
}
