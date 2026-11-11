"use server";

// Server actions — Admin > Mentorias > Mentores (Tarefa 2, migration 0014).
//
// CRUD do cadastro de mentor: nome, especialidade, bio, foto, ordem e
// publicação. O vínculo mentor↔evento vive nas actions de
// `src/app/admin/mentorships/actions.ts` (é edição de EVENTO, não de mentor).
//
// Degradação: ambiente sem a 0014 (dev em `app_arkom`) devolve erro em pt-BR
// em vez de estourar — o /admin de mentorias é anterior aos mentores e não
// pode depender deles.
//
// ⚠ `'use server'`: types DECLARADOS aqui. Nunca `export type { X } from "…"`
//    (vira ReferenceError em runtime e derruba todas as actions do módulo).

import { revalidatePath } from "next/cache";
import type postgres from "postgres";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export type MentorInput = {
  full_name: string;
  specialty: string;
  bio: string;
  photo_url: string;
  status: "draft" | "published";
};

const MAX_NOME = 120;
const MAX_ESPECIALIDADE = 120;
const MAX_BIO = 4000;

const ERRO_SEM_MIGRATION =
  "O cadastro de mentores ainda não existe neste ambiente. Aplique a migration db/migrations/0014-mentors.sql.";

function tabelaAusente(error: unknown): boolean {
  return (error as { code?: string })?.code === "42P01";
}

function limpar(value: string | null | undefined, max: number): string | null {
  const clean = (value ?? "").trim();
  if (!clean) return null;
  return clean.slice(0, max);
}

function revalidate() {
  revalidatePath("/admin/mentorships/mentors");
  revalidatePath("/admin/mentorships");
  revalidatePath("/mentorships");
}

/** 'Carolina Fürst' → 'carolina-furst'. Vazio vira 'mentor' (o unificador de
 *  colisão abaixo garante que dois "mentor" não briguem). */
function slugBase(nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "mentor";
}

/** Primeiro slug livre a partir da base ('joao', 'joao-2', 'joao-3'…). */
async function slugUnico(
  sql: postgres.Sql,
  nome: string,
  ignorarId: number | null,
): Promise<string> {
  const base = slugBase(nome);
  const usados = await sql<{ slug: string }[]>`
    SELECT slug FROM mentors
     WHERE (slug = ${base} OR slug LIKE ${`${base}-%`})
       AND (${ignorarId}::int IS NULL OR id <> ${ignorarId})
  `;
  const set = new Set(usados.map((row) => row.slug));
  if (!set.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const tentativa = `${base}-${n}`;
    if (!set.has(tentativa)) return tentativa;
  }
  return `${base}-${Date.now()}`;
}

function validar(input: MentorInput): { error?: string } {
  if (!input.full_name?.trim()) return { error: "Informe o nome do mentor." };
  if (input.full_name.trim().length > MAX_NOME) {
    return { error: `O nome pode ter no máximo ${MAX_NOME} caracteres.` };
  }
  if ((input.specialty ?? "").trim().length > MAX_ESPECIALIDADE) {
    return {
      error: `A especialidade pode ter no máximo ${MAX_ESPECIALIDADE} caracteres.`,
    };
  }
  if ((input.bio ?? "").trim().length > MAX_BIO) {
    return { error: `A descrição pode ter no máximo ${MAX_BIO} caracteres.` };
  }
  return {};
}

export async function criarMentor(input: MentorInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  const invalido = validar(input);
  if (invalido.error) return { ok: false, error: invalido.error };

  const sql = getSql();
  try {
    const slug = await slugUnico(sql, input.full_name, null);
    await sql`
      INSERT INTO mentors
        (slug, full_name, specialty, bio, photo_url, status, sort_order, created_by)
      VALUES (
        ${slug},
        ${input.full_name.trim().slice(0, MAX_NOME)},
        ${limpar(input.specialty, MAX_ESPECIALIDADE)},
        ${limpar(input.bio, MAX_BIO)},
        ${limpar(input.photo_url, 500)},
        ${input.status === "published" ? "published" : "draft"},
        (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM mentors),
        ${admin.id}
      )
    `;
    revalidate();
    return { ok: true };
  } catch (error) {
    if (tabelaAusente(error)) return { ok: false, error: ERRO_SEM_MIGRATION };
    console.error("Erro em criarMentor:", error);
    return { ok: false, error: "Não foi possível cadastrar o mentor. Tente novamente." };
  }
}

export async function atualizarMentor(
  id: number,
  input: MentorInput,
): Promise<ActionResult> {
  await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Mentor inválido." };
  const invalido = validar(input);
  if (invalido.error) return { ok: false, error: invalido.error };

  const sql = getSql();
  try {
    // O slug acompanha o nome (é ele que vira chave de render e, amanhã, rota).
    const slug = await slugUnico(sql, input.full_name, id);
    const atualizado = await sql<{ id: number }[]>`
      UPDATE mentors
         SET slug = ${slug},
             full_name = ${input.full_name.trim().slice(0, MAX_NOME)},
             specialty = ${limpar(input.specialty, MAX_ESPECIALIDADE)},
             bio = ${limpar(input.bio, MAX_BIO)},
             photo_url = ${limpar(input.photo_url, 500)},
             status = ${input.status === "published" ? "published" : "draft"},
             updated_at = now()
       WHERE id = ${id}
      RETURNING id
    `;
    if (atualizado.length === 0) return { ok: false, error: "Mentor não encontrado." };
    revalidate();
    return { ok: true };
  } catch (error) {
    if (tabelaAusente(error)) return { ok: false, error: ERRO_SEM_MIGRATION };
    console.error("Erro em atualizarMentor:", error);
    return { ok: false, error: "Não foi possível salvar o mentor. Tente novamente." };
  }
}

/** Publica/despublica (o "desativar" do cadastro: some da vitrine do aluno,
 *  continua vinculado aos eventos e no /admin). */
export async function alternarStatusMentor(id: number): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    const atualizado = await sql<{ id: number; status: string }[]>`
      UPDATE mentors
         SET status = CASE status WHEN 'published' THEN 'draft' ELSE 'published' END,
             updated_at = now()
       WHERE id = ${id}
      RETURNING id, status
    `;
    if (atualizado.length === 0) return { ok: false, error: "Mentor não encontrado." };
    revalidate();
    return {
      ok: true,
      message:
        atualizado[0].status === "published"
          ? "O mentor passa a aparecer para os alunos."
          : "O mentor saiu da vitrine do aluno (segue cadastrado).",
    };
  } catch (error) {
    if (tabelaAusente(error)) return { ok: false, error: ERRO_SEM_MIGRATION };
    console.error("Erro em alternarStatusMentor:", error);
    return { ok: false, error: "Não foi possível alterar o status. Tente novamente." };
  }
}

/** Exclui o cadastro. Os vínculos com eventos caem em cascata; nenhuma
 *  confirmação, presença ou lançamento de crédito é tocado. */
export async function excluirMentor(id: number): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    const removido = await sql<{ id: number }[]>`
      DELETE FROM mentors WHERE id = ${id} RETURNING id
    `;
    if (removido.length === 0) return { ok: false, error: "Mentor não encontrado." };
    revalidate();
    return { ok: true };
  } catch (error) {
    if (tabelaAusente(error)) return { ok: false, error: ERRO_SEM_MIGRATION };
    console.error("Erro em excluirMentor:", error);
    return { ok: false, error: "Não foi possível excluir o mentor. Tente novamente." };
  }
}

/** Sobe/desce um mentor na vitrine (mesmo padrão de /admin/home e trainings:
 *  troca com o vizinho e renumera tudo dentro da transação). */
export async function moverMentor(id: number, direcao: -1 | 1): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    await sql.begin(async (tx) => {
      const linhas = await tx<{ id: number }[]>`
        SELECT id FROM mentors ORDER BY sort_order, id
      `;
      const atual = linhas.findIndex((linha) => linha.id === id);
      if (atual === -1) throw new Error("mentor-nao-encontrado");
      const alvo = atual + direcao;
      if (alvo < 0 || alvo >= linhas.length) return;

      const ordenados = [...linhas];
      [ordenados[atual], ordenados[alvo]] = [ordenados[alvo], ordenados[atual]];
      for (let i = 0; i < ordenados.length; i += 1) {
        await tx`UPDATE mentors SET sort_order = ${i} WHERE id = ${ordenados[i].id}`;
      }
    });
    revalidate();
    return { ok: true };
  } catch (error) {
    if (tabelaAusente(error)) return { ok: false, error: ERRO_SEM_MIGRATION };
    if (error instanceof Error && error.message === "mentor-nao-encontrado") {
      return { ok: false, error: "Mentor não encontrado." };
    }
    console.error("Erro em moverMentor:", error);
    return { ok: false, error: "Não foi possível reordenar. Tente novamente." };
  }
}
