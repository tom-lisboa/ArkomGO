"use server";

// Server actions — Admin > Capacitações > Módulos e Aulas (Story 1.6).
// CRUD + reordenação de módulos, aulas (com mover entre módulos) e materiais.
// Todas as mutações exigem requireAdmin().

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type ModuleInput = {
  title: string;
  description: string;
  status: "draft" | "published";
};

export type LessonInput = {
  module_id: number;
  title: string;
  description: string;
  video_provider: "youtube" | "panda";
  video_url: string;
  status: "draft" | "published";
};

export type ResourceInput = {
  title: string;
  resource_type: "pdf" | "image" | "zip" | "external_link";
  url: string;
};

function revalidate(courseId: number) {
  revalidatePath(`/admin/trainings/${courseId}/lessons`);
  revalidatePath("/admin/trainings");
  revalidatePath(`/trainings/${courseId}`);
  revalidatePath("/trainings");
}

// ---------------------------------------------------------------- Módulos

/** Cria (id = null) ou atualiza um módulo do curso. */
export async function salvarModulo(
  courseId: number,
  id: number | null,
  input: ModuleInput
): Promise<ActionResult> {
  await requireAdmin();
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Informe o título do módulo." };
  const description = input.description?.trim() || null;
  const status = input.status === "draft" ? "draft" : "published";

  const sql = getSql();
  try {
    if (id !== null) {
      const updated = await sql<{ id: number }[]>`
        UPDATE course_modules
        SET title = ${title}, description = ${description}, status = ${status}
        WHERE id = ${id} AND course_id = ${courseId}
        RETURNING id
      `;
      if (updated.length === 0) return { ok: false, error: "Módulo não encontrado." };
    } else {
      const [{ next }] = await sql<{ next: number }[]>`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
        FROM course_modules
        WHERE course_id = ${courseId}
      `;
      await sql`
        INSERT INTO course_modules (course_id, title, description, sort_order, status)
        VALUES (${courseId}, ${title}, ${description}, ${next}, ${status})
      `;
    }
    revalidate(courseId);
    return { ok: true };
  } catch (error) {
    console.error("Erro em salvarModulo:", error);
    return { ok: false, error: "Não foi possível salvar o módulo. Tente novamente." };
  }
}

/** Exclui o módulo em cascata (aulas, materiais e progresso). */
export async function excluirModulo(
  courseId: number,
  id: number
): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    const deleted = await sql<{ id: number }[]>`
      DELETE FROM course_modules WHERE id = ${id} AND course_id = ${courseId} RETURNING id
    `;
    if (deleted.length === 0) return { ok: false, error: "Módulo não encontrado." };
    revalidate(courseId);
    return { ok: true };
  } catch (error) {
    console.error("Erro em excluirModulo:", error);
    return { ok: false, error: "Não foi possível excluir o módulo. Tente novamente." };
  }
}

/** Move o módulo uma posição para cima/baixo dentro do curso. */
export async function moverModulo(
  courseId: number,
  id: number,
  direction: "up" | "down"
): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    await swapOrder(sql, "course_modules", "course_id", courseId, id, direction);
    revalidate(courseId);
    return { ok: true };
  } catch (error) {
    console.error("Erro em moverModulo:", error);
    return { ok: false, error: "Não foi possível reordenar. Tente novamente." };
  }
}

// ---------------------------------------------------------------- Aulas

/** Cria (id = null) ou atualiza uma aula. Trocar module_id move a aula para o fim do módulo destino. */
export async function salvarAula(
  courseId: number,
  id: number | null,
  input: LessonInput
): Promise<ActionResult> {
  await requireAdmin();
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Informe o título da aula." };
  const videoUrl = input.video_url?.trim();
  if (!videoUrl) return { ok: false, error: "Informe a URL do vídeo." };
  const provider = input.video_provider === "panda" ? "panda" : "youtube";
  const status = input.status === "draft" ? "draft" : "published";
  const description = input.description?.trim() || null;
  const moduleId = Number(input.module_id);

  const sql = getSql();
  try {
    const targetModule = (
      await sql<{ id: number }[]>`
        SELECT id FROM course_modules WHERE id = ${moduleId} AND course_id = ${courseId}
      `
    )[0];
    if (!targetModule) return { ok: false, error: "Selecione um módulo válido." };

    if (id !== null) {
      const current = (
        await sql<{ module_id: number }[]>`
          SELECT module_id FROM lessons WHERE id = ${id} AND course_id = ${courseId}
        `
      )[0];
      if (!current) return { ok: false, error: "Aula não encontrada." };

      if (current.module_id !== moduleId) {
        // Mover entre módulos: entra no fim do módulo destino.
        const [{ next }] = await sql<{ next: number }[]>`
          SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM lessons WHERE module_id = ${moduleId}
        `;
        await sql`
          UPDATE lessons
          SET module_id = ${moduleId}, title = ${title}, description = ${description},
              video_provider = ${provider}, video_url = ${videoUrl}, status = ${status}, sort_order = ${next}
          WHERE id = ${id}
        `;
      } else {
        await sql`
          UPDATE lessons
          SET title = ${title}, description = ${description}, video_provider = ${provider},
              video_url = ${videoUrl}, status = ${status}
          WHERE id = ${id}
        `;
      }
    } else {
      const [{ next }] = await sql<{ next: number }[]>`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM lessons WHERE module_id = ${moduleId}
      `;
      await sql`
        INSERT INTO lessons
          (course_id, module_id, title, description, video_provider, video_url, sort_order, status)
        VALUES (${courseId}, ${moduleId}, ${title}, ${description}, ${provider}, ${videoUrl}, ${next}, ${status})
      `;
    }
    revalidate(courseId);
    return { ok: true };
  } catch (error) {
    console.error("Erro em salvarAula:", error);
    return { ok: false, error: "Não foi possível salvar a aula. Tente novamente." };
  }
}

/** Exclui a aula em cascata (materiais, progresso, likes e avaliações). */
export async function excluirAula(
  courseId: number,
  id: number
): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    const deleted = await sql<{ id: number }[]>`
      DELETE FROM lessons WHERE id = ${id} AND course_id = ${courseId} RETURNING id
    `;
    if (deleted.length === 0) return { ok: false, error: "Aula não encontrada." };
    revalidate(courseId);
    return { ok: true };
  } catch (error) {
    console.error("Erro em excluirAula:", error);
    return { ok: false, error: "Não foi possível excluir a aula. Tente novamente." };
  }
}

/** Move a aula uma posição para cima/baixo dentro do módulo. */
export async function moverAula(
  courseId: number,
  moduleId: number,
  id: number,
  direction: "up" | "down"
): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    await swapOrder(sql, "lessons", "module_id", moduleId, id, direction);
    revalidate(courseId);
    return { ok: true };
  } catch (error) {
    console.error("Erro em moverAula:", error);
    return { ok: false, error: "Não foi possível reordenar. Tente novamente." };
  }
}

// ---------------------------------------------------------------- Materiais

/** Cria (id = null) ou atualiza um material (botão de redirecionamento) da aula. */
export async function salvarMaterial(
  courseId: number,
  lessonId: number,
  id: number | null,
  input: ResourceInput
): Promise<ActionResult> {
  await requireAdmin();
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Informe o título do material." };
  const url = input.url?.trim();
  if (!url) return { ok: false, error: "Informe a URL do material." };
  const validTypes = ["pdf", "image", "zip", "external_link"] as const;
  const type = validTypes.includes(input.resource_type)
    ? input.resource_type
    : "external_link";

  const sql = getSql();
  try {
    const lesson = (
      await sql<{ id: number }[]>`
        SELECT id FROM lessons WHERE id = ${lessonId} AND course_id = ${courseId}
      `
    )[0];
    if (!lesson) return { ok: false, error: "Aula não encontrada." };

    if (id !== null) {
      const updated = await sql<{ id: number }[]>`
        UPDATE lesson_resources
        SET title = ${title}, resource_type = ${type}, url = ${url}
        WHERE id = ${id} AND lesson_id = ${lessonId}
        RETURNING id
      `;
      if (updated.length === 0) return { ok: false, error: "Material não encontrado." };
    } else {
      const [{ next }] = await sql<{ next: number }[]>`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
        FROM lesson_resources
        WHERE lesson_id = ${lessonId}
      `;
      await sql`
        INSERT INTO lesson_resources (lesson_id, title, resource_type, url, sort_order)
        VALUES (${lessonId}, ${title}, ${type}, ${url}, ${next})
      `;
    }
    revalidate(courseId);
    return { ok: true };
  } catch (error) {
    console.error("Erro em salvarMaterial:", error);
    return { ok: false, error: "Não foi possível salvar o material. Tente novamente." };
  }
}

/** Exclui um material da aula. */
export async function excluirMaterial(
  courseId: number,
  id: number
): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    const deleted = await sql<{ id: number }[]>`
      DELETE FROM lesson_resources WHERE id = ${id} RETURNING id
    `;
    if (deleted.length === 0) return { ok: false, error: "Material não encontrado." };
    revalidate(courseId);
    return { ok: true };
  } catch (error) {
    console.error("Erro em excluirMaterial:", error);
    return { ok: false, error: "Não foi possível excluir o material. Tente novamente." };
  }
}

async function swapOrder(
  sql: ReturnType<typeof getSql>,
  table: "course_modules" | "lessons",
  parentColumn: "course_id" | "module_id",
  parentId: number,
  id: number,
  direction: "up" | "down"
): Promise<boolean> {
  if (
    (table === "course_modules" && parentColumn !== "course_id") ||
    (table === "lessons" && parentColumn !== "module_id")
  ) {
    throw new Error("invalid_reorder_scope");
  }
  const rows = await sql.unsafe<{ id: number }[]>(
    `SELECT id FROM ${table} WHERE ${parentColumn} = $1 ORDER BY sort_order, id`,
    [parentId]
  );
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= rows.length) return false;
  [rows[idx], rows[target]] = [rows[target], rows[idx]];
  await sql.begin(async (sql) => {
    for (const [i, row] of rows.entries()) {
      await sql.unsafe(`UPDATE ${table} SET sort_order = $1 WHERE id = $2`, [i, row.id]);
    }
  });
  return true;
}
