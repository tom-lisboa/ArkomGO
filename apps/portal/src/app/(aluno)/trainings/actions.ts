"use server";

// Server actions da vertical Capacitações (área do aluno) — o "learning loop".
// Persistem, para o aluno logado: conclusão (lesson_progress), curtida
// (lesson_likes) e avaliação 1–5 (lesson_ratings). Todas revalidam requireUser()
// E reconferem que a aula está PUBLICADA e o curso está LIBERADO (release-gating)
// antes de gravar — rascunho/bloqueado é invisível e imutável para o aluno.
//
// Port de bilhon-ai/app/(aluno)/capacitacoes/actions.ts (getAccessibleLesson +
// upserts), no estilo de src/app/(aluno)/mentorships/actions.ts (requireUser +
// getSql + guard de status + upsert ON CONFLICT + revalidatePath + union tipada).
// SQL relativa ao schema (getSql aplica o search_path): sem prefixo de schema.

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { isCourseReleased } from "@/lib/utils";
import { checkExpirationForConsumption } from "@/lib/access-expiration";

type ActionError = { ok: false; error: string };

type AccessibleLesson = {
  id: number;
  course_id: number;
  release_type: string;
  release_after_days: number;
};

const ERRO_AULA = "Esta aula não está disponível para você.";

/**
 * Retorna a aula somente se: aula publicada + módulo publicado + curso publicado
 * + curso liberado para o aluno. Caso contrário, null (rascunho/bloqueado são
 * invisíveis e imutáveis para o aluno).
 */
async function getAccessibleLesson(
  lessonId: number,
  registeredAt: string
): Promise<AccessibleLesson | null> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) return null;

  const sql = getSql();
  const row = (
    await sql<AccessibleLesson[]>`
      SELECT l.id, l.course_id, c.release_type, c.release_after_days
      FROM lessons l
      JOIN course_modules m ON m.id = l.module_id
      JOIN courses c ON c.id = l.course_id
      WHERE l.id = ${lessonId}
        AND l.status = 'published'
        AND m.status = 'published'
        AND c.status = 'published'
    `
  )[0];

  if (!row) return null;
  if (!isCourseReleased(row, registeredAt)) return null;
  return row;
}

/** Rotas do aluno que dependem do estado da aula (barra/checks/continuar). */
function revalidateTrainings(): void {
  revalidatePath("/trainings");
  revalidatePath("/home");
}

/**
 * Marca/desmarca a aula como concluída (toggle em lesson_progress).
 *
 * ─── PRAZO DE ACESSO (Tarefa 4) ────────────────────────────────────────────
 * Este é o PONTO DE CONSUMO de aula: é aqui que o aluno registra que consumiu
 * conteúdo novo. Com `expiration_enforcement` (+ `entitlements_enabled`)
 * ligada, o aluno vencido não conclui aula NOVA e recebe a mensagem de
 * renovação. O que continua liberado, de propósito:
 *   · ver o catálogo e abrir aula (X1),
 *   · ver e DESMARCAR o próprio progresso — histórico é dele (X3),
 *   · curtir e avaliar (não são consumo).
 * Nada do que já estava concluído é apagado ou desmarcado: ligar a flag não
 * reescreve o passado.
 */
export async function toggleProgress(
  lessonDbId: number
): Promise<{ ok: true; completed: boolean } | ActionError> {
  const user = await requireUser();

  try {
    const lesson = await getAccessibleLesson(lessonDbId, user.registered_at);
    if (!lesson) return { ok: false, error: ERRO_AULA };

    const sql = getSql();
    const existing = (
      await sql<{ completed: number }[]>`
        SELECT completed FROM lesson_progress WHERE user_id = ${user.id} AND lesson_id = ${lesson.id}
      `
    )[0];

    const next = existing?.completed === 1 ? 0 : 1;

    // Só a CONCLUSÃO nova passa pela porta do prazo: desmarcar é correção do
    // próprio histórico e nunca é barrado.
    if (next === 1) {
      const prazo = await checkExpirationForConsumption(user.id, "aula");
      if (prazo.blocked && prazo.message) {
        return { ok: false, error: prazo.message };
      }
    }

    await sql`
      INSERT INTO lesson_progress (user_id, lesson_id, completed, completed_at)
      VALUES (${user.id}, ${lesson.id}, ${next}, ${next === 1 ? new Date().toISOString() : null})
      ON CONFLICT (user_id, lesson_id)
      DO UPDATE SET completed = excluded.completed, completed_at = excluded.completed_at
    `;

    revalidateTrainings();
    return { ok: true, completed: next === 1 };
  } catch (error) {
    console.error("Erro ao alternar conclusão da aula:", error);
    return { ok: false, error: "Não foi possível salvar seu progresso. Tente novamente." };
  }
}

/** Curte/descurte a aula (toggle em lesson_likes). */
export async function toggleLike(
  lessonDbId: number
): Promise<{ ok: true; liked: boolean } | ActionError> {
  const user = await requireUser();

  try {
    const lesson = await getAccessibleLesson(lessonDbId, user.registered_at);
    if (!lesson) return { ok: false, error: ERRO_AULA };

    const sql = getSql();
    const existing = (
      await sql<{ liked: number }[]>`
        SELECT liked FROM lesson_likes WHERE user_id = ${user.id} AND lesson_id = ${lesson.id}
      `
    )[0];

    const next = existing?.liked === 1 ? 0 : 1;
    await sql`
      INSERT INTO lesson_likes (user_id, lesson_id, liked)
      VALUES (${user.id}, ${lesson.id}, ${next})
      ON CONFLICT (user_id, lesson_id) DO UPDATE SET liked = excluded.liked
    `;

    revalidateTrainings();
    return { ok: true, liked: next === 1 };
  } catch (error) {
    console.error("Erro ao alternar curtida da aula:", error);
    return { ok: false, error: "Não foi possível salvar sua curtida. Tente novamente." };
  }
}

/** Avalia a aula de 1 a 5 estrelas (upsert em lesson_ratings — sempre alterável). */
export async function rateLesson(
  lessonDbId: number,
  rating: number
): Promise<{ ok: true; rating: number } | ActionError> {
  const user = await requireUser();

  const stars = Number(rating);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return { ok: false, error: "A avaliação deve ser de 1 a 5 estrelas." };
  }

  try {
    const lesson = await getAccessibleLesson(lessonDbId, user.registered_at);
    if (!lesson) return { ok: false, error: ERRO_AULA };

    const sql = getSql();
    await sql`
      INSERT INTO lesson_ratings (user_id, lesson_id, rating)
      VALUES (${user.id}, ${lesson.id}, ${stars})
      ON CONFLICT (user_id, lesson_id) DO UPDATE SET rating = excluded.rating
    `;

    revalidateTrainings();
    return { ok: true, rating: stars };
  } catch (error) {
    console.error("Erro ao avaliar a aula:", error);
    return { ok: false, error: "Não foi possível salvar sua avaliação. Tente novamente." };
  }
}
