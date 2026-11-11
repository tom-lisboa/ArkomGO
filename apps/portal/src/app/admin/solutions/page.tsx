// /admin/solutions — edição dos previews de aula + links de remix do MAPA.
// Reativo ao banco: o que for salvo aqui (solution_previews, no schema do
// runtime) o mapa reflete no drawer do nó-solução. Guard requireAdmin() no
// layout admin.

import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { SOLUTION_NAME } from "@/components/map/skilltree-data";
import {
  SolutionPreviewsManager,
  type AdminSolutionPreview,
} from "@/components/admin-conteudo/solution-previews-manager";

export const metadata: Metadata = { title: "Soluções (mapa)" };
export const dynamic = "force-dynamic";

export default async function AdminSolucoesPage() {
  await requireAdmin();
  const sql = getSql();

  let rows: { solution_slug: string; preview_url: string | null; remix_url: string | null }[] = [];
  try {
    rows = await sql`
      SELECT solution_slug, preview_url, remix_url
        FROM solution_previews
    `;
  } catch (error) {
    console.error("[arkom] Falha ao ler solution_previews no admin:", error);
  }

  const bySlug = new Map(rows.map((r) => [r.solution_slug, r]));

  // uma linha por solução do mapa (SOLUTION_NAME é a fonte dos slugs canônicos)
  const solucoes: AdminSolutionPreview[] = Object.entries(SOLUTION_NAME).map(
    ([slug, name]) => {
      const r = bySlug.get(slug);
      return {
        solution_slug: slug,
        name,
        preview_url: r?.preview_url ?? "",
        remix_url: r?.remix_url ?? "",
      };
    },
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-display font-extrabold tracking-display text-primary">
          Soluções (mapa)
        </h1>
        <p className="mt-1 text-base text-secondary">
          Preview de aula (embed do Panda) e link de remix por solução. O que você salvar aqui
          o mapa reflete no drawer de cada solução. Deixe o preview vazio para não mostrar vídeo
          (fica só a descrição). O link de remix, se vazio, usa o padrão da solução.
        </p>
      </div>
      <SolutionPreviewsManager solucoes={solucoes} />
    </div>
  );
}
