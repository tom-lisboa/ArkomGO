// GET /api/dash/[center]?range=… — dados de um dashboard de /dash.
//
// Resolve o builder no registry (lib/dash/registry): com builder liberado,
// devolve LiveCenter { center, state, source }; sem builder (ou erro no build),
// devolve { state: "demo" } e o client cai no snapshot estático — o /dash
// nunca quebra. Guard: sessão ativa (mesma regra da página, que vive no route
// group (aluno) → requireUser).

import { NextResponse } from "next/server";
import { CENTERS } from "@/components/dash/dash-data";
import { canAccessSolutionsDash } from "@/lib/app-mode";
import { getSessionUser } from "@/lib/auth";
import { builderFor } from "@/lib/dash/registry";
import type { DashApiPayload } from "@/lib/dash/types";

export const dynamic = "force-dynamic";

const DEMO: DashApiPayload = { state: "demo" };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ center: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // allowlist da dash dedicada (mesma regra dos guards de página).
  if (!canAccessSolutionsDash(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { center: centerId } = await params;
  const base = CENTERS.find((c) => c.id === centerId);
  if (!base) return NextResponse.json({ error: "unknown center" }, { status: 404 });

  const build = builderFor(base.id);
  if (!build) {
    return NextResponse.json(DEMO, { headers: { "Cache-Control": "no-store" } });
  }

  const range =
    new URL(req.url).searchParams.get("range")?.trim() ||
    base.defaultRange ||
    base.ranges?.[0] ||
    "";

  try {
    const live = await build(range, base, { userId: user.id });
    return NextResponse.json(live, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`[dash] builder ${base.id} falhou:`, error);
    return NextResponse.json(DEMO, { headers: { "Cache-Control": "no-store" } });
  }
}
