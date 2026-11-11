"use server";

// Server actions — Admin > Home (banner do topo + vitrine "Soluções em destaque").
// Config única em home_settings (linha id=1) + slots manuais em
// home_featured_slots (migration 0009). Todas as mutações exigem requireAdmin().

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type HomeConfigInput = {
  featured_title: string;
  featured_subtitle: string;
  featured_limit: number;
  banner_enabled: boolean;
  banner_image_url: string;
  banner_pill: string;
  banner_title: string;
  banner_description: string;
  banner_cta_label: string;
  banner_cta_href: string;
};

export type DestaqueInput = {
  title: string;
  strap: string;
  cover_url: string;
  accent: string;
  href: string;
};

function revalidate() {
  revalidatePath("/admin/home");
  revalidatePath("/home");
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Acento em hex #RRGGBB (mesma regra do CHECK da tabela); vazio = herdado. */
function normalizeAccent(value: string): string | null | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return undefined;
  return trimmed;
}

/** Link relativo (/rota) ou absoluto http(s); vazio = detalhe do app. */
function normalizeHref(value: string): string | null | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed)) return trimmed;
  return undefined;
}

/** Salva a config única da home (upsert da linha id=1). */
export async function salvarConfigHome(
  input: HomeConfigInput
): Promise<ActionResult> {
  await requireAdmin();

  const limit = Math.floor(Number(input.featured_limit));
  if (!Number.isInteger(limit) || limit < 1 || limit > 12) {
    return { ok: false, error: "O limite de destaques deve ficar entre 1 e 12." };
  }
  const bannerCtaHref = normalizeHref(input.banner_cta_href);
  if (bannerCtaHref === undefined) {
    return {
      ok: false,
      error: "Link do banner inválido: use /rota interna ou https://…",
    };
  }

  const sql = getSql();
  try {
    await sql`
      INSERT INTO home_settings (
        id, featured_title, featured_subtitle, featured_limit,
        banner_enabled, banner_image_url, banner_pill, banner_title,
        banner_description, banner_cta_label, banner_cta_href
      ) VALUES (
        1, ${clean(input.featured_title)}, ${clean(input.featured_subtitle)}, ${limit},
        ${input.banner_enabled === true}, ${clean(input.banner_image_url)},
        ${clean(input.banner_pill)}, ${clean(input.banner_title)},
        ${clean(input.banner_description)}, ${clean(input.banner_cta_label)},
        ${bannerCtaHref}
      )
      ON CONFLICT (id) DO UPDATE SET
        featured_title = EXCLUDED.featured_title,
        featured_subtitle = EXCLUDED.featured_subtitle,
        featured_limit = EXCLUDED.featured_limit,
        banner_enabled = EXCLUDED.banner_enabled,
        banner_image_url = EXCLUDED.banner_image_url,
        banner_pill = EXCLUDED.banner_pill,
        banner_title = EXCLUDED.banner_title,
        banner_description = EXCLUDED.banner_description,
        banner_cta_label = EXCLUDED.banner_cta_label,
        banner_cta_href = EXCLUDED.banner_cta_href,
        updated_at = now()
    `;
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em salvarConfigHome:", error);
    return { ok: false, error: "Não foi possível salvar a configuração. Tente novamente." };
  }
}

/** Adiciona um app à vitrine (no fim da ordem). */
export async function adicionarDestaque(appId: number): Promise<ActionResult> {
  await requireAdmin();
  const id = Number(appId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Selecione uma solução válida." };
  }

  const sql = getSql();
  try {
    const app = (
      await sql<{ id: number }[]>`SELECT id FROM apps WHERE id = ${id}`
    )[0];
    if (!app) return { ok: false, error: "Solução não encontrada." };

    const exists = (
      await sql<{ id: number }[]>`
        SELECT id FROM home_featured_slots WHERE app_id = ${id}
      `
    )[0];
    if (exists) return { ok: false, error: "Essa solução já está na vitrine." };

    const [{ next }] = await sql<{ next: number }[]>`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM home_featured_slots
    `;
    await sql`
      INSERT INTO home_featured_slots (app_id, sort_order)
      VALUES (${id}, ${next})
    `;
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em adicionarDestaque:", error);
    return { ok: false, error: "Não foi possível adicionar o destaque. Tente novamente." };
  }
}

/** Salva os overrides de um card da vitrine (vazio = herda do cadastro do app). */
export async function salvarDestaque(
  id: number,
  input: DestaqueInput
): Promise<ActionResult> {
  await requireAdmin();

  const accent = normalizeAccent(input.accent);
  if (accent === undefined) {
    return { ok: false, error: "Cor inválida: use o formato #RRGGBB (ex.: #FF9D5C)." };
  }
  const href = normalizeHref(input.href);
  if (href === undefined) {
    return { ok: false, error: "Link inválido: use /rota interna ou https://…" };
  }

  const sql = getSql();
  try {
    const updated = await sql<{ id: number }[]>`
      UPDATE home_featured_slots
      SET title = ${clean(input.title)}, strap = ${clean(input.strap)},
          cover_url = ${clean(input.cover_url)}, accent = ${accent}, href = ${href}
      WHERE id = ${id}
      RETURNING id
    `;
    if (updated.length === 0) return { ok: false, error: "Destaque não encontrado." };
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em salvarDestaque:", error);
    return { ok: false, error: "Não foi possível salvar o destaque. Tente novamente." };
  }
}

/** Remove um card da vitrine (o app em si não é afetado). */
export async function removerDestaque(id: number): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    const deleted = await sql<{ id: number }[]>`
      DELETE FROM home_featured_slots WHERE id = ${id} RETURNING id
    `;
    if (deleted.length === 0) return { ok: false, error: "Destaque não encontrado." };
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em removerDestaque:", error);
    return { ok: false, error: "Não foi possível remover o destaque. Tente novamente." };
  }
}

/** Move o card uma posição para cima/baixo (renumera a ordem inteira). */
export async function moverDestaque(
  id: number,
  direction: "up" | "down"
): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM home_featured_slots ORDER BY sort_order, id
    `;
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return { ok: false, error: "Destaque não encontrado." };
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target >= 0 && target < rows.length) {
      [rows[idx], rows[target]] = [rows[target], rows[idx]];
      await sql.begin(async (sql) => {
        for (const [i, row] of rows.entries()) {
          await sql`UPDATE home_featured_slots SET sort_order = ${i} WHERE id = ${row.id}`;
        }
      });
    }
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em moverDestaque:", error);
    return { ok: false, error: "Não foi possível reordenar. Tente novamente." };
  }
}
