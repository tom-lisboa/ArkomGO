"use server";

// Server actions — Admin > Universidade IA > Vitrine do catálogo.
// Fonte: `course_rails` + `course_rail_slots` (migration 0013-course-rails.sql).
// Toda mutação exige requireAdmin(); o efeito no /trainings depende da flag
// `course_rails_enabled` (ligada em /admin/settings).
//
// ⚠ Types são DECLARADOS aqui. NUNCA `export type { X } from "./y"` dentro de
// um módulo 'use server': vira ReferenceError em runtime e derruba TODAS as
// actions do módulo, com build/tsc passando (incidente PR#3 → fix PR#4).

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export type RailInput = {
  title: string;
  /** Identificador estável; vazio = derivado do título. */
  slug: string;
  mode: "manual" | "todos" | "top" | "em_breve";
  card_style: "rank" | "poster";
  icon: string;
  /** Teto de cursos exibidos. "" = sem teto. */
  item_limit: string;
  clickable: boolean;
  enabled: boolean;
};

const MIGRATION_HINT =
  "Tabelas de prateleiras ausentes. Aplique db/migrations/0013-course-rails.sql neste ambiente.";

const MODES = ["manual", "todos", "top", "em_breve"] as const;
const CARD_STYLES = ["rank", "poster"] as const;
const ICONS = [
  "trophy",
  "clock",
  "graduation",
  "sparkles",
  "flame",
  "star",
  "layers",
  "bookmark",
] as const;
const MAX_LIMIT = 24;

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string })?.code === "42P01";
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === "23505";
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function slugify(value: string): string {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function revalidate() {
  revalidatePath("/admin/trainings/rails");
  revalidatePath("/trainings");
}

type RailNormalizado = {
  title: string;
  slug: string;
  mode: (typeof MODES)[number];
  cardStyle: (typeof CARD_STYLES)[number];
  icon: (typeof ICONS)[number];
  itemLimit: number | null;
  clickable: boolean;
  enabled: boolean;
};

function normalizarRail(
  input: RailInput,
): { ok: true; value: RailNormalizado } | { ok: false; error: string } {
  const title = clean(input?.title);
  if (!title) return { ok: false, error: "Informe o título da prateleira." };
  if (title.length > 120) {
    return { ok: false, error: "O título é longo demais (máx. 120 caracteres)." };
  }

  const slug = slugify(input?.slug) || slugify(title);
  if (!slug) {
    return {
      ok: false,
      error: "Informe um identificador válido (letras, números e hífens).",
    };
  }

  const mode = MODES.includes(input?.mode as (typeof MODES)[number])
    ? (input.mode as (typeof MODES)[number])
    : null;
  if (!mode) return { ok: false, error: "Selecione um tipo de prateleira válido." };

  const cardStyle = CARD_STYLES.includes(input?.card_style as (typeof CARD_STYLES)[number])
    ? (input.card_style as (typeof CARD_STYLES)[number])
    : null;
  if (!cardStyle) return { ok: false, error: "Selecione um estilo de card válido." };

  const icon = ICONS.includes(input?.icon as (typeof ICONS)[number])
    ? (input.icon as (typeof ICONS)[number])
    : null;
  if (!icon) return { ok: false, error: "Selecione um ícone válido." };

  let itemLimit: number | null = null;
  const rawLimit = clean(input?.item_limit);
  if (rawLimit) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return {
        ok: false,
        error: `O limite precisa ser um número inteiro de 1 a ${MAX_LIMIT} (ou vazio, para mostrar todos).`,
      };
    }
    itemLimit = parsed;
  }

  return {
    ok: true,
    value: {
      title,
      slug,
      mode,
      cardStyle,
      icon,
      itemLimit,
      clickable: input?.clickable !== false,
      enabled: input?.enabled !== false,
    },
  };
}

/** Cria uma prateleira (no fim da ordem). */
export async function criarRail(input: RailInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  const normalizado = normalizarRail(input);
  if (!normalizado.ok) return normalizado;
  const rail = normalizado.value;

  const sql = getSql();
  try {
    const [{ next }] = await sql<{ next: number }[]>`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM course_rails
    `;
    await sql`
      INSERT INTO course_rails
        (slug, title, mode, card_style, icon, item_limit, clickable, sort_order, enabled)
      VALUES
        (${rail.slug}, ${rail.title}, ${rail.mode}, ${rail.cardStyle}, ${rail.icon},
         ${rail.itemLimit}, ${rail.clickable}, ${next}, ${rail.enabled})
    `;
    revalidate();
    return { ok: true, message: `Prateleira "${rail.title}" criada.` };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: `Já existe uma prateleira com o identificador "${rail.slug}". Escolha outro.`,
      };
    }
    console.error(`Erro em criarRail (slug=${rail.slug}, admin=${admin.email}):`, error);
    return { ok: false, error: "Não foi possível criar a prateleira. Tente novamente." };
  }
}

/** Edita uma prateleira. A composição manual não é afetada. */
export async function salvarRail(id: number, input: RailInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Prateleira inválida." };

  const normalizado = normalizarRail(input);
  if (!normalizado.ok) return normalizado;
  const rail = normalizado.value;

  const sql = getSql();
  try {
    const rows = await sql<{ id: number }[]>`
      UPDATE course_rails
         SET slug = ${rail.slug},
             title = ${rail.title},
             mode = ${rail.mode},
             card_style = ${rail.cardStyle},
             icon = ${rail.icon},
             item_limit = ${rail.itemLimit},
             clickable = ${rail.clickable},
             enabled = ${rail.enabled},
             updated_at = now()
       WHERE id = ${id}
      RETURNING id
    `;
    if (rows.length === 0) return { ok: false, error: "Prateleira não encontrada." };
    revalidate();
    return { ok: true, message: "Prateleira atualizada." };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: `Já existe uma prateleira com o identificador "${rail.slug}". Escolha outro.`,
      };
    }
    console.error(`Erro em salvarRail (rail=${id}, admin=${admin.email}):`, error);
    return { ok: false, error: "Não foi possível salvar a prateleira. Tente novamente." };
  }
}

/** Liga/desliga a prateleira (desligada não aparece para o aluno). */
export async function alternarRail(id: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Prateleira inválida." };

  const sql = getSql();
  try {
    const rows = await sql<{ enabled: boolean; title: string }[]>`
      UPDATE course_rails
         SET enabled = NOT enabled, updated_at = now()
       WHERE id = ${id}
      RETURNING enabled, title
    `;
    if (rows.length === 0) return { ok: false, error: "Prateleira não encontrada." };
    revalidate();
    return {
      ok: true,
      message: rows[0].enabled
        ? `"${rows[0].title}" está no ar.`
        : `"${rows[0].title}" saiu do ar.`,
    };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    console.error(`Erro em alternarRail (rail=${id}, admin=${admin.email}):`, error);
    return { ok: false, error: "Não foi possível alterar a prateleira. Tente novamente." };
  }
}

/** Exclui a prateleira (a composição manual dela vai junto; cursos ficam). */
export async function excluirRail(id: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Prateleira inválida." };

  const sql = getSql();
  try {
    const rows = await sql<{ id: number }[]>`
      DELETE FROM course_rails WHERE id = ${id} RETURNING id
    `;
    if (rows.length === 0) return { ok: false, error: "Prateleira não encontrada." };
    revalidate();
    return { ok: true, message: "Prateleira excluída. Nenhum curso foi apagado." };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    console.error(`Erro em excluirRail (rail=${id}, admin=${admin.email}):`, error);
    return { ok: false, error: "Não foi possível excluir a prateleira. Tente novamente." };
  }
}

/** Move a prateleira uma posição para cima/baixo (renumera a ordem inteira). */
export async function moverRail(
  id: number,
  direction: "up" | "down",
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Prateleira inválida." };

  const sql = getSql();
  try {
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM course_rails ORDER BY sort_order, id
    `;
    const idx = rows.findIndex((row) => row.id === id);
    if (idx < 0) return { ok: false, error: "Prateleira não encontrada." };
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target >= 0 && target < rows.length) {
      [rows[idx], rows[target]] = [rows[target], rows[idx]];
      await sql.begin(async (tx) => {
        for (const [position, row] of rows.entries()) {
          await tx`UPDATE course_rails SET sort_order = ${position} WHERE id = ${row.id}`;
        }
      });
    }
    revalidate();
    return { ok: true };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    console.error(`Erro em moverRail (rail=${id}, admin=${admin.email}):`, error);
    return { ok: false, error: "Não foi possível reordenar as prateleiras. Tente novamente." };
  }
}

/** Acrescenta um curso ao fim da composição manual da prateleira. */
export async function adicionarCursoNaRail(
  railId: number,
  courseId: number,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(railId) || railId <= 0) return { ok: false, error: "Prateleira inválida." };
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return { ok: false, error: "Selecione um curso válido." };
  }

  const sql = getSql();
  try {
    const [rail] = await sql<{ id: number; mode: string; title: string }[]>`
      SELECT id, mode, title FROM course_rails WHERE id = ${railId}
    `;
    if (!rail) return { ok: false, error: "Prateleira não encontrada." };
    if (rail.mode !== "manual") {
      return {
        ok: false,
        error: `"${rail.title}" é automática — mude o tipo para "Escolha manual" antes de montar a lista de cursos.`,
      };
    }

    const [curso] = await sql<{ id: number; title: string }[]>`
      SELECT id, title FROM courses WHERE id = ${courseId}
    `;
    if (!curso) return { ok: false, error: "Curso não encontrado." };

    const [ja] = await sql<{ id: number }[]>`
      SELECT id FROM course_rail_slots WHERE rail_id = ${railId} AND course_id = ${courseId}
    `;
    if (ja) return { ok: false, error: `"${curso.title}" já está nesta prateleira.` };

    const [{ next }] = await sql<{ next: number }[]>`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
        FROM course_rail_slots WHERE rail_id = ${railId}
    `;
    await sql`
      INSERT INTO course_rail_slots (rail_id, course_id, sort_order)
      VALUES (${railId}, ${courseId}, ${next})
    `;
    revalidate();
    return { ok: true, message: `"${curso.title}" entrou em "${rail.title}".` };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    console.error(
      `Erro em adicionarCursoNaRail (rail=${railId}, curso=${courseId}, admin=${admin.email}):`,
      error,
    );
    return { ok: false, error: "Não foi possível adicionar o curso. Tente novamente." };
  }
}

/** Tira um curso da composição manual (o curso em si não é afetado). */
export async function removerCursoDaRail(
  railId: number,
  courseId: number,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(railId) || railId <= 0) return { ok: false, error: "Prateleira inválida." };
  if (!Number.isInteger(courseId) || courseId <= 0) return { ok: false, error: "Curso inválido." };

  const sql = getSql();
  try {
    const rows = await sql<{ id: number }[]>`
      DELETE FROM course_rail_slots
       WHERE rail_id = ${railId} AND course_id = ${courseId}
      RETURNING id
    `;
    if (rows.length === 0) return { ok: false, error: "Este curso não está na prateleira." };
    revalidate();
    return { ok: true, message: "Curso removido da prateleira." };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    console.error(
      `Erro em removerCursoDaRail (rail=${railId}, curso=${courseId}, admin=${admin.email}):`,
      error,
    );
    return { ok: false, error: "Não foi possível remover o curso. Tente novamente." };
  }
}

/** Move o curso uma posição dentro da prateleira (renumera as posições). */
export async function moverCursoNaRail(
  railId: number,
  courseId: number,
  direction: "up" | "down",
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(railId) || railId <= 0) return { ok: false, error: "Prateleira inválida." };
  if (!Number.isInteger(courseId) || courseId <= 0) return { ok: false, error: "Curso inválido." };

  const sql = getSql();
  try {
    const rows = await sql<{ course_id: number }[]>`
      SELECT course_id FROM course_rail_slots
       WHERE rail_id = ${railId}
       ORDER BY sort_order, id
    `;
    const idx = rows.findIndex((row) => row.course_id === courseId);
    if (idx < 0) return { ok: false, error: "Este curso não está na prateleira." };
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target >= 0 && target < rows.length) {
      [rows[idx], rows[target]] = [rows[target], rows[idx]];
      await sql.begin(async (tx) => {
        for (const [position, row] of rows.entries()) {
          await tx`
            UPDATE course_rail_slots SET sort_order = ${position}
             WHERE rail_id = ${railId} AND course_id = ${row.course_id}
          `;
        }
      });
    }
    revalidate();
    return { ok: true };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    console.error(
      `Erro em moverCursoNaRail (rail=${railId}, curso=${courseId}, admin=${admin.email}):`,
      error,
    );
    return { ok: false, error: "Não foi possível reordenar os cursos. Tente novamente." };
  }
}
