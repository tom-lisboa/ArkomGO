// lib/consultor/store.ts — persistência do Gestor IA (threads, mensagens e
// jornada). SQL relativa ao schema — getSql() aplica o search_path
// (ARKOM_RUNTIME_SCHEMA, prod=`educacional`); NUNCA prefixe o schema aqui.
// Tabelas: db/migrations/0017-consultor-ia.sql.

import { getSql } from "@/lib/db";
import type {
  ConsultorCard,
  ConsultorJourneyItem,
  ConsultorMessage,
  ConsultorMode,
  ConsultorThread,
  PlanoEstrategico,
} from "./tipos";

type MessageRow = {
  id: number;
  role: string;
  content: string;
  cards: ConsultorCard[] | null;
  followup: string | null;
  created_at: string;
};

function toMessage(row: MessageRow): ConsultorMessage {
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    cards: Array.isArray(row.cards) ? row.cards : [],
    followup: row.followup,
    created_at: row.created_at,
  };
}

export type OwnedThread = {
  id: number;
  mode: ConsultorMode;
  plan: PlanoEstrategico | null;
  /** última atualização da thread (ISO) — a view de apresentação usa como data */
  updatedAt: string;
};

export async function listThreads(userId: number): Promise<ConsultorThread[]> {
  const sql = getSql();
  return sql<ConsultorThread[]>`
    SELECT id, title, preview, message_count, pinned, mode, updated_at::text AS updated_at
    FROM consultor_threads
    WHERE user_id = ${userId}
    ORDER BY pinned DESC, updated_at DESC
    LIMIT 50
  `;
}

/** Thread do usuário (checa dono) — evita IDOR. Traz modo + plano. */
export async function getOwnedThread(threadId: number, userId: number): Promise<OwnedThread | null> {
  const sql = getSql();
  const rows = await sql<{ id: number; mode: string; plan: PlanoEstrategico | null; updated_at: string }[]>`
    SELECT id, mode, plan, updated_at::text AS updated_at
    FROM consultor_threads WHERE id = ${threadId} AND user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    mode: row.mode === "planejamento" ? "planejamento" : "consultor",
    plan: row.plan ?? null,
    updatedAt: row.updated_at,
  };
}

export async function createThread(
  userId: number,
  title: string,
  preview: string,
  mode: ConsultorMode = "consultor",
): Promise<number> {
  const sql = getSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO consultor_threads (user_id, title, preview, mode)
    VALUES (${userId}, ${title}, ${preview}, ${mode})
    RETURNING id
  `;
  return row.id;
}

/** Persiste o roadmap (já enriquecido) e promove o título gerado pelo plano. */
export async function savePlan(threadId: number, plan: PlanoEstrategico): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE consultor_threads
    SET plan = ${sql.json(plan)}, title = ${plan.titulo.slice(0, 80)}, updated_at = now()
    WHERE id = ${threadId}
  `;
}

/** Marca/desmarca um item do roadmap. Retorna o plano atualizado (ou null). */
export async function togglePlanItem(
  threadId: number,
  fase: number,
  item: number,
  done: boolean,
): Promise<PlanoEstrategico | null> {
  const sql = getSql();
  const rows = await sql<{ plan: PlanoEstrategico | null }[]>`
    SELECT plan FROM consultor_threads WHERE id = ${threadId}
  `;
  const plan = rows[0]?.plan;
  if (!plan || !plan.fases?.[fase]?.itens?.[item]) return null;
  plan.fases[fase].itens[item].done = done;
  await sql`
    UPDATE consultor_threads SET plan = ${sql.json(plan)}, updated_at = now() WHERE id = ${threadId}
  `;
  return plan;
}

/** Reordena um item dentro de uma fase do roadmap. Retorna o plano atualizado. */
export async function movePlanItem(
  threadId: number,
  fase: number,
  from: number,
  to: number,
): Promise<PlanoEstrategico | null> {
  const sql = getSql();
  const rows = await sql<{ plan: PlanoEstrategico | null }[]>`
    SELECT plan FROM consultor_threads WHERE id = ${threadId}
  `;
  const plan = rows[0]?.plan;
  const itens = plan?.fases?.[fase]?.itens;
  if (!plan || !itens || !itens[from] || to < 0 || to >= itens.length) return null;
  const [movido] = itens.splice(from, 1);
  itens.splice(to, 0, movido);
  await sql`
    UPDATE consultor_threads SET plan = ${sql.json(plan)}, updated_at = now() WHERE id = ${threadId}
  `;
  return plan;
}

export async function loadMessages(threadId: number): Promise<ConsultorMessage[]> {
  const sql = getSql();
  const rows = await sql<MessageRow[]>`
    SELECT id, role, content, cards, followup, created_at::text AS created_at
    FROM consultor_messages
    WHERE thread_id = ${threadId}
    ORDER BY created_at, id
  `;
  return rows.map(toMessage);
}

export async function loadJourney(threadId: number): Promise<ConsultorJourneyItem[]> {
  const sql = getSql();
  return sql<ConsultorJourneyItem[]>`
    SELECT id, kind, entity_ref AS ref, titulo, motivo, url
    FROM consultor_journey
    WHERE thread_id = ${threadId}
    ORDER BY added_at, id
  `;
}

export async function appendUserMessage(threadId: number, content: string): Promise<ConsultorMessage> {
  const sql = getSql();
  const [row] = await sql<MessageRow[]>`
    INSERT INTO consultor_messages (thread_id, role, content)
    VALUES (${threadId}, 'user', ${content})
    RETURNING id, role, content, cards, followup, created_at::text AS created_at
  `;
  return toMessage(row);
}

export async function appendAssistantMessage(
  threadId: number,
  content: string,
  cards: ConsultorCard[],
  followup: string
): Promise<ConsultorMessage> {
  const sql = getSql();
  const [row] = await sql<MessageRow[]>`
    INSERT INTO consultor_messages (thread_id, role, content, cards, followup)
    VALUES (${threadId}, 'assistant', ${content}, ${cards.length ? sql.json(cards) : null}, ${followup || null})
    RETURNING id, role, content, cards, followup, created_at::text AS created_at
  `;
  return toMessage(row);
}

/** Atualiza os metadados da thread após um turno completo (user + assistant). */
export async function touchThread(threadId: number, preview: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE consultor_threads
    SET preview = ${preview.slice(0, 200)},
        message_count = (SELECT count(*)::int FROM consultor_messages WHERE thread_id = ${threadId}),
        updated_at = now()
    WHERE id = ${threadId}
  `;
}

/** Registra as recomendações na jornada (o mesmo item não repete na thread). */
export async function addJourneyItems(threadId: number, cards: ConsultorCard[]): Promise<void> {
  if (!cards.length) return;
  const sql = getSql();
  for (const card of cards) {
    try {
      await sql`
        INSERT INTO consultor_journey (thread_id, kind, entity_ref, titulo, motivo, url)
        VALUES (${threadId}, ${card.kind}, ${card.ref}, ${card.titulo}, ${card.motivo}, ${card.url})
        ON CONFLICT (thread_id, kind, entity_ref) DO NOTHING
      `;
    } catch (error) {
      // a jornada é acessória: um CHECK desatualizado (ex.: 0019 ausente e o
      // card é genesis) não pode derrubar o turno com as mensagens já salvas
      console.warn(`[consultor] jornada recusou ${card.kind}:${card.ref}:`, error);
    }
  }
}

/** Mensagens enviadas pelo usuário nas últimas 24h — teto simples de consumo. */
export async function countUserMessages24h(userId: number): Promise<number> {
  const sql = getSql();
  const [row] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM consultor_messages m
    JOIN consultor_threads t ON t.id = m.thread_id
    WHERE t.user_id = ${userId} AND m.role = 'user' AND m.created_at > now() - interval '24 hours'
  `;
  return row?.count ?? 0;
}
