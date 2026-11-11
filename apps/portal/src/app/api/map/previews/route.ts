// GET /api/map/previews — previews de aula + links de remix por solução, LIDOS
// DO BANCO (solution_previews, no schema do runtime) para o mapa ser reativo: o admin edita
// a tabela e o mapa reflete. Falha fechada suave: se o banco estiver indisponível,
// retorna {} e o mapa usa o seed hardcoded (SOLUTION_PREVIEW/solutionHref) como
// fallback — o mapa nunca quebra.

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export type SolutionPreviewRow = {
  preview_url: string | null;
  remix_url: string | null;
};

export async function GET(): Promise<NextResponse> {
  try {
    const sql = getSql();
    const rows = await sql<
      { solution_slug: string; preview_url: string | null; remix_url: string | null }[]
    >`select solution_slug, preview_url, remix_url from solution_previews`;

    const map: Record<string, SolutionPreviewRow> = {};
    for (const r of rows) {
      map[r.solution_slug] = { preview_url: r.preview_url, remix_url: r.remix_url };
    }
    return NextResponse.json(map, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[arkom] Falha ao ler solution_previews:", error);
    // fallback: vazio → o mapa usa o seed do código
    return NextResponse.json(
      {},
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
