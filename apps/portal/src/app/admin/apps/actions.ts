"use server";

// Server actions — Admin > Apps e Templates (Story 1.6).
// CRUD de apps + gestão simples de categorias (criar/renomear/ordenar).
// Todas as mutações exigem requireAdmin().

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";

type AppAvailability = "available" | "coming_soon";
const APP_COMING_SOON_REDIRECT_PREFIX = "coming-soon:";

function normalizeAppAvailability(value: unknown): AppAvailability {
  return value === "coming_soon" ? "coming_soon" : "available";
}

function storedAppRedirectUrl(
  availability: AppAvailability,
  redirectUrl: string | null,
): string {
  const cleanUrl = redirectUrl?.startsWith(APP_COMING_SOON_REDIRECT_PREFIX)
    ? redirectUrl.slice(APP_COMING_SOON_REDIRECT_PREFIX.length).trim()
    : (redirectUrl?.trim() ?? "");
  return availability === "coming_soon"
    ? `${APP_COMING_SOON_REDIRECT_PREFIX}${cleanUrl}`
    : cleanUrl;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export type AppInput = {
  category_id: number;
  title: string;
  tagline: string;
  description: string;
  cover_url: string;
  video_provider: "youtube" | "panda" | "";
  video_url: string;
  button_label: string;
  redirect_url: string;
  availability: AppAvailability;
  sort_order: number;
  status: "draft" | "published";
};

function revalidate() {
  revalidatePath("/admin/apps");
  revalidatePath("/apps");
  revalidatePath("/home");
}

/** Cria (id = null) ou atualiza um app. */
export async function salvarApp(
  id: number | null,
  input: AppInput
): Promise<ActionResult> {
  const user = await requireAdmin();
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Informe o título do app." };
  const availability = normalizeAppAvailability(input.availability);
  const redirectUrl = input.redirect_url?.trim() || null;
  if (availability === "available" && !redirectUrl) {
    return { ok: false, error: "Informe a URL de redirecionamento." };
  }
  const storedRedirectUrl = storedAppRedirectUrl(availability, redirectUrl);

  const categoryId = Number(input.category_id);
  const sql = getSql();
  const category = (
    await sql<{ id: number }[]>`
      SELECT id FROM app_categories WHERE id = ${categoryId}
    `
  )[0];
  if (!category) return { ok: false, error: "Selecione uma categoria válida." };

  const videoUrl = input.video_url?.trim() || null;
  const provider = videoUrl
    ? input.video_provider === "panda"
      ? "panda"
      : "youtube"
    : null;
  const tagline = input.tagline?.trim() || null;
  const description = input.description?.trim() || null;
  const coverUrl = input.cover_url?.trim() || null;
  const buttonLabel = input.button_label?.trim() || "Acessar";
  const sortOrder = Math.floor(Number(input.sort_order) || 0);
  const status = input.status === "published" ? "published" : "draft";

  try {
    if (id !== null) {
      const updated = await sql<{ id: number }[]>`
        UPDATE apps
        SET category_id = ${categoryId}, title = ${title}, tagline = ${tagline},
            description = ${description}, cover_url = ${coverUrl}, video_provider = ${provider},
            video_url = ${videoUrl}, button_label = ${buttonLabel}, redirect_url = ${storedRedirectUrl},
            sort_order = ${sortOrder}, status = ${status}
        WHERE id = ${id}
        RETURNING id
      `;
      if (updated.length === 0) return { ok: false, error: "App não encontrado." };
    } else {
      await sql`
        INSERT INTO apps
          (category_id, title, tagline, description, cover_url, video_provider, video_url,
           button_label, redirect_url, sort_order, status, created_by)
        VALUES
          (${categoryId}, ${title}, ${tagline}, ${description}, ${coverUrl}, ${provider}, ${videoUrl},
           ${buttonLabel}, ${storedRedirectUrl}, ${sortOrder}, ${status}, ${user.id})
      `;
    }
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em salvarApp:", error);
    return { ok: false, error: "Não foi possível salvar o app. Tente novamente." };
  }
}

/** Exclui o app (avaliações e cliques caem em cascata). */
export async function excluirApp(id: number): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    const deleted = await sql<{ id: number }[]>`DELETE FROM apps WHERE id = ${id} RETURNING id`;
    if (deleted.length === 0) return { ok: false, error: "App não encontrado." };
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em excluirApp:", error);
    return { ok: false, error: "Não foi possível excluir o app. Tente novamente." };
  }
}

/** Publica/despublica rapidamente. */
export async function alternarStatusApp(id: number): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    const updated = await sql<{ id: number }[]>`
      UPDATE apps
      SET status = CASE status WHEN 'published' THEN 'draft' ELSE 'published' END
      WHERE id = ${id}
      RETURNING id
    `;
    if (updated.length === 0) return { ok: false, error: "App não encontrado." };
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em alternarStatusApp:", error);
    return { ok: false, error: "Não foi possível alterar o status. Tente novamente." };
  }
}

// ---------------------------------------------------------------- Categorias

/** Cria (id = null) ou renomeia uma categoria. O slug é gerado na criação e mantido no rename. */
export async function salvarCategoria(
  id: number | null,
  name: string
): Promise<ActionResult> {
  await requireAdmin();
  const trimmed = name?.trim();
  if (!trimmed) return { ok: false, error: "Informe o nome da categoria." };

  const sql = getSql();
  try {
    if (id !== null) {
      const updated = await sql<{ id: number }[]>`
        UPDATE app_categories SET name = ${trimmed} WHERE id = ${id} RETURNING id
      `;
      if (updated.length === 0) return { ok: false, error: "Categoria não encontrada." };
    } else {
      const slug = await uniqueSlug(sql, slugify(trimmed));
      const [{ next }] = await sql<{ next: number }[]>`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM app_categories
      `;
      await sql`
        INSERT INTO app_categories (name, slug, sort_order, status)
        VALUES (${trimmed}, ${slug}, ${next}, 'published')
      `;
    }
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em salvarCategoria:", error);
    return { ok: false, error: "Não foi possível salvar a categoria. Tente novamente." };
  }
}

/** Move a categoria uma posição para cima/baixo. */
export async function moverCategoria(
  id: number,
  direction: "up" | "down"
): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM app_categories ORDER BY sort_order, id
    `;
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return { ok: false, error: "Categoria não encontrada." };
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target >= 0 && target < rows.length) {
      [rows[idx], rows[target]] = [rows[target], rows[idx]];
      await sql.begin(async (sql) => {
        for (const [i, row] of rows.entries()) {
          await sql`UPDATE app_categories SET sort_order = ${i} WHERE id = ${row.id}`;
        }
      });
    }
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em moverCategoria:", error);
    return { ok: false, error: "Não foi possível reordenar. Tente novamente." };
  }
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "categoria";
}

async function uniqueSlug(sql: ReturnType<typeof getSql>, base: string): Promise<string> {
  let slug = base;
  let n = 2;
  while (
    (
      await sql<{ exists: number }[]>`
        SELECT 1 AS exists FROM app_categories WHERE slug = ${slug}
      `
    )[0]
  ) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}
