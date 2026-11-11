"use server";

// Server actions — Admin > Capacitações (Story 1.6).
// Todas as mutações exigem requireAdmin(). Retorno padrão: ActionResult.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type CourseInput = {
  title: string;
  description: string;
  cover_url: string;
  release_type: "immediate" | "after_days";
  release_after_days: number;
  status: "draft" | "published";
};

function revalidate() {
  revalidatePath("/admin/trainings");
  revalidatePath("/trainings");
  revalidatePath("/home");
}

/** Cria (id = null) ou atualiza um curso. */
export async function salvarCurso(
  id: number | null,
  input: CourseInput
): Promise<ActionResult> {
  const user = await requireAdmin();
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Informe o título do curso." };

  const releaseType = input.release_type === "after_days" ? "after_days" : "immediate";
  const releaseDays =
    releaseType === "after_days" ? Math.floor(Number(input.release_after_days) || 0) : 0;
  if (releaseType === "after_days" && releaseDays < 1) {
    return { ok: false, error: "Informe após quantos dias o curso será liberado." };
  }
  const status = input.status === "published" ? "published" : "draft";
  const description = input.description?.trim() || null;
  const coverUrl = input.cover_url?.trim() || null;

  const sql = getSql();
  try {
    if (id !== null) {
      const updated = await sql<{ id: number }[]>`
        UPDATE courses
        SET title = ${title}, description = ${description}, cover_url = ${coverUrl},
            release_type = ${releaseType}, release_after_days = ${releaseDays}, status = ${status}
        WHERE id = ${id}
        RETURNING id
      `;
      if (updated.length === 0) return { ok: false, error: "Curso não encontrado." };
    } else {
      const [{ next }] = await sql<{ next: number }[]>`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM courses
      `;
      await sql`
        INSERT INTO courses
          (title, description, cover_url, release_type, release_after_days, sort_order, status, created_by)
        VALUES (${title}, ${description}, ${coverUrl}, ${releaseType}, ${releaseDays}, ${next}, ${status}, ${user.id})
      `;
    }
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em salvarCurso:", error);
    return { ok: false, error: "Não foi possível salvar o curso. Tente novamente." };
  }
}

/** Exclui o curso em cascata (módulos, aulas, materiais e progresso — FK ON DELETE CASCADE). */
export async function excluirCurso(id: number): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    const deleted = await sql<{ id: number }[]>`DELETE FROM courses WHERE id = ${id} RETURNING id`;
    if (deleted.length === 0) return { ok: false, error: "Curso não encontrado." };
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em excluirCurso:", error);
    return { ok: false, error: "Não foi possível excluir o curso. Tente novamente." };
  }
}

/** Publica/despublica rapidamente. */
export async function alternarStatusCurso(id: number): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    const updated = await sql<{ id: number }[]>`
      UPDATE courses
      SET status = CASE status WHEN 'published' THEN 'draft' ELSE 'published' END
      WHERE id = ${id}
      RETURNING id
    `;
    if (updated.length === 0) return { ok: false, error: "Curso não encontrado." };
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em alternarStatusCurso:", error);
    return { ok: false, error: "Não foi possível alterar o status. Tente novamente." };
  }
}

/** Move o curso uma posição para cima/baixo (troca de sort_order, normalizando a sequência). */
export async function moverCurso(
  id: number,
  direction: "up" | "down"
): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    const moved = await swapCourseOrder(sql, id, direction);
    if (!moved) return { ok: true }; // já está na ponta — nada a fazer
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em moverCurso:", error);
    return { ok: false, error: "Não foi possível reordenar. Tente novamente." };
  }
}

async function swapCourseOrder(
  sql: ReturnType<typeof getSql>,
  id: number,
  direction: "up" | "down"
): Promise<boolean> {
  const rows = await sql<{ id: number }[]>`
    SELECT id FROM courses ORDER BY sort_order, id
  `;
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= rows.length) return false;
  [rows[idx], rows[target]] = [rows[target], rows[idx]];
  await sql.begin(async (sql) => {
    for (const [i, row] of rows.entries()) {
      await sql`UPDATE courses SET sort_order = ${i} WHERE id = ${row.id}`;
    }
  });
  return true;
}
