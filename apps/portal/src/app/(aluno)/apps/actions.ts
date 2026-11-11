"use server";

// Server actions da vertical Apps/Soluções (área do aluno).
// Mutação única: registrar 1 clique num app publicado e devolver a URL externa
// para o cliente abrir. Guards: sessão ativa (requireUser) + app publicado e
// NÃO "em breve" (redirect_url sem o prefixo `coming-soon:`).
//
// Estilo espelhado de src/app/(aluno)/mentorships/actions.ts e
// src/app/(aluno)/trainings/actions.ts (requireUser + getSql + guard de status +
// union tipada). SQL relativa ao schema (getSql aplica o search_path): sem
// prefixo de schema. Mesma tabela `app_clicks` lida pelo dashboard admin.

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { publicAppRedirectUrl } from "@/lib/apps";
import { getSql } from "@/lib/db";
import { hasAppsAccess } from "@/lib/entitlements";

/** Motivo único do bloqueio por plano (ClickUp 86ajrgzef) — a mesma frase nas
 *  duas actions, porque para o aluno é o mesmo fato. */
const SEM_APPS_NO_PLANO = "Seu plano não inclui a área de Sistemas.";

export type RegisterClickResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string };

export type RateAppResult = { ok: true; rating: number } | { ok: false; error: string };

/**
 * Registra/atualiza a avaliação (1–5) DESTE usuário para um app publicado.
 * Upsert manual (uma linha por usuário/app) — não depende de constraint ON CONFLICT.
 */
export async function rateApp(appId: number, rating: number): Promise<RateAppResult> {
  const user = await requireUser();
  const id = Number(appId);
  const value = Math.round(Number(rating));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "App inválido." };
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    return { ok: false, error: "A nota deve ser de 1 a 5." };
  }
  if (!(await hasAppsAccess(user.id))) return { ok: false, error: SEM_APPS_NO_PLANO };
  try {
    const sql = getSql();
    const app = (
      await sql<{ id: number }[]>`SELECT id FROM apps WHERE id = ${id} AND status = 'published'`
    )[0];
    if (!app) return { ok: false, error: "Este app não está disponível." };

    const existing = (
      await sql<{ id: number }[]>`
        SELECT id FROM app_ratings WHERE user_id = ${user.id} AND app_id = ${id} LIMIT 1
      `
    )[0];
    if (existing) {
      await sql`UPDATE app_ratings SET rating = ${value} WHERE user_id = ${user.id} AND app_id = ${id}`;
    } else {
      await sql`INSERT INTO app_ratings (user_id, app_id, rating) VALUES (${user.id}, ${id}, ${value})`;
    }
    revalidatePath(`/apps/${id}`);
    return { ok: true, rating: value };
  } catch (error) {
    console.error("Erro ao avaliar app:", error);
    return { ok: false, error: "Não foi possível salvar a avaliação. Tente novamente." };
  }
}

/**
 * Registra 1 clique em `app_clicks` e devolve a URL externa do app para o
 * cliente abrir em nova aba. Só apps publicados e disponíveis (não "em breve").
 */
export async function registerClick(appId: number): Promise<RegisterClickResult> {
  const user = await requireUser();

  const id = Number(appId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "App inválido." };
  }

  // Corte de plano ANTES de qualquer consulta: com os apps fechados, a URL
  // externa não é lida nem devolvida — chamar a action direto (sem passar pela
  // tela) não entrega o link.
  if (!(await hasAppsAccess(user.id))) return { ok: false, error: SEM_APPS_NO_PLANO };

  try {
    const sql = getSql();

    const app = (
      await sql<{ id: number; redirect_url: string | null }[]>`
        SELECT id, redirect_url
        FROM apps
        WHERE id = ${id}
          AND status = 'published'
          AND redirect_url NOT LIKE 'coming-soon:%'
      `
    )[0];

    if (!app) {
      return { ok: false, error: "Este app não está disponível no momento." };
    }

    const redirectUrl = publicAppRedirectUrl(app.redirect_url);
    if (!redirectUrl) {
      return { ok: false, error: "Este app ainda não possui URL de acesso." };
    }

    await sql`
      INSERT INTO app_clicks (user_id, app_id) VALUES (${user.id}, ${app.id})
    `;

    return { ok: true, redirectUrl };
  } catch (error) {
    console.error("Erro ao registrar clique no app:", error);
    return { ok: false, error: "Não foi possível abrir o app. Tente novamente." };
  }
}
