"use server";

// Server actions — Admin > Soluções (mapa). Edita a tabela reativa
// solution_previews (no schema do runtime — app_arkom ou educacional, resolvido
// pelo search_path) que o mapa lê (preview de aula + link de remix por solução).
// Guard requireAdmin(). Upsert por slug.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";

export type ActionResult = { ok: true } | { ok: false; error: string };

function isValidUrl(v: string): boolean {
  // aceita URL absoluta (http/https) ou rota interna começando com "/"
  if (v.startsWith("/")) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function salvarPreviewSolucao(input: {
  solution_slug: string;
  preview_url: string;
  remix_url: string;
}): Promise<ActionResult> {
  await requireAdmin();

  const slug = input.solution_slug?.trim();
  if (!slug) return { ok: false, error: "Solução inválida." };

  const preview = input.preview_url?.trim() || null;
  const remix = input.remix_url?.trim() || null;

  if (preview && !isValidUrl(preview)) {
    return { ok: false, error: "URL do preview inválida (use http(s):// ou uma rota /interna)." };
  }
  if (remix && !isValidUrl(remix)) {
    return { ok: false, error: "URL de remix inválida (use http(s):// ou uma rota /interna)." };
  }

  const sql = getSql();
  try {
    await sql`
      INSERT INTO solution_previews (solution_slug, preview_url, remix_url, updated_at)
      VALUES (${slug}, ${preview}, ${remix}, now())
      ON CONFLICT (solution_slug) DO UPDATE SET
        preview_url = EXCLUDED.preview_url,
        remix_url = EXCLUDED.remix_url,
        updated_at = now()
    `;
  } catch (error) {
    console.error("[arkom] Falha ao salvar solution_preview:", error);
    return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  }

  revalidatePath("/admin/solutions");
  revalidatePath("/map");
  return { ok: true };
}
