"use server";

// Server actions — Admin > Mentorias (Story 1.6).
// Recorrência diária/semanal é MATERIALIZADA no cadastro: um INSERT por
// ocorrência até recurrence_until (máx. 60 eventos). Editar afeta só a ocorrência.

import { revalidatePath } from "next/cache";
import { addDays, format, isValid, parseISO } from "date-fns";
import type postgres from "postgres";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { creditCreditIn, debitCreditIn } from "@/lib/credit-ledger";
import {
  motivoParaNaoExcluir,
  type VinculosDeCredito,
} from "@/lib/mentorship-delete-guard";
import {
  countEventMovements,
  debitForParticipation,
  debitOperationKey,
  getCreditRuntime,
  loadEventCredit,
  refundOperationKey,
} from "@/lib/credit-policy";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export type MentoriaInput = {
  title: string;
  description: string;
  cover_url: string;
  event_date: string; // 'YYYY-MM-DD'
  starts_at: string; // 'HH:MM'
  ends_at: string; // 'HH:MM' ou ''
  redirect_url: string;
  recurrence_type: "none" | "daily" | "weekly";
  recurrence_until: string; // 'YYYY-MM-DD' ou ''
  status: "draft" | "published";
  /** 'mentoria_arkom' consome crédito; 'live_comunidade' é aberta (0012). */
  event_kind: "mentoria_arkom" | "live_comunidade";
  /** Custo em créditos. Ignorado (forçado a 0) quando o evento é live. */
  credit_cost: number;
  /** Mentores do encontro, na ordem de exibição (0014). Vale para mentoria E
   *  para live da comunidade — quem apresenta independe de cobrar crédito. */
  mentor_ids: number[];
};

const MAX_OCCURRENCES = 60;
const MAX_CREDIT_COST = 100;
const MAX_MENTORES_POR_EVENTO = 20;

/**
 * A migration 0012 existe neste ambiente? O /admin roda no mesmo código em
 * ambientes que ainda não a aplicaram (dev em `app_arkom`), e escrever numa
 * coluna inexistente derrubaria o cadastro de mentoria — que é anterior aos
 * créditos e não pode depender deles.
 */
async function temColunasDeCredito(sql: postgres.Sql): Promise<boolean> {
  try {
    const [row] = await sql<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
        FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'mentorship_events'
         AND column_name IN ('event_kind', 'credit_cost')
    `;
    return (row?.total ?? 0) === 2;
  } catch (error) {
    console.error("Erro ao checar as colunas de crédito de mentorship_events:", error);
    return false;
  }
}

/**
 * A migration 0014 existe neste ambiente? Mesmo motivo de
 * `temColunasDeCredito`: o cadastro de mentoria é anterior aos mentores e não
 * pode quebrar onde a tabela ainda não existe.
 */
async function temTabela(sql: postgres.Sql, tabela: string): Promise<boolean> {
  try {
    const [row] = await sql<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
        FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = ${tabela}
    `;
    return (row?.total ?? 0) > 0;
  } catch (error) {
    console.error(`Erro ao checar a tabela ${tabela}:`, error);
    return false;
  }
}

/** Ids de mentor únicos, inteiros e positivos, preservando a ordem escolhida. */
function normalizarMentores(input: MentoriaInput): number[] {
  const brutos = Array.isArray(input.mentor_ids) ? input.mentor_ids : [];
  const vistos = new Set<number>();
  const ids: number[] = [];
  for (const bruto of brutos) {
    const id = Number(bruto);
    if (!Number.isInteger(id) || id <= 0 || vistos.has(id)) continue;
    vistos.add(id);
    ids.push(id);
    if (ids.length >= MAX_MENTORES_POR_EVENTO) break;
  }
  return ids;
}

/**
 * Substitui o conjunto de mentores de um evento pela lista informada, na ordem
 * recebida. Roda DENTRO da transação do evento: ou o evento e os mentores vão
 * juntos, ou nenhum dos dois. Id de mentor inexistente é ignorado em silêncio
 * (o `WHERE EXISTS` evita estourar por corrida com uma exclusão de mentor).
 */
async function sincronizarMentores(
  tx: postgres.TransactionSql,
  eventId: number,
  mentorIds: number[],
): Promise<void> {
  // Vínculo é conjunto pequeno (poucos mentores por evento) e a tela envia o
  // conjunto inteiro: apagar e reinserir na ordem é mais simples — e mais
  // difícil de errar — do que calcular o diff.
  await tx`DELETE FROM event_mentors WHERE event_id = ${eventId}`;
  for (const [posicao, mentorId] of mentorIds.entries()) {
    await tx`
      INSERT INTO event_mentors (event_id, mentor_id, sort_order)
      SELECT ${eventId}, ${mentorId}, ${posicao}
       WHERE EXISTS (SELECT 1 FROM mentors WHERE id = ${mentorId})
      ON CONFLICT (event_id, mentor_id) DO UPDATE SET sort_order = excluded.sort_order
    `;
  }
}

/** Normaliza tipo + custo: live NUNCA guarda custo. */
function normalizarCredito(input: MentoriaInput): {
  kind: "mentoria_arkom" | "live_comunidade";
  cost: number;
} {
  const kind = input.event_kind === "mentoria_arkom" ? "mentoria_arkom" : "live_comunidade";
  if (kind === "live_comunidade") return { kind, cost: 0 };
  const cost = Number(input.credit_cost);
  if (!Number.isFinite(cost) || cost < 0) return { kind, cost: 1 };
  return { kind, cost: Math.min(Math.trunc(cost), MAX_CREDIT_COST) };
}

export type ConfirmacaoRow = {
  user_id: number;
  full_name: string;
  email: string;
  /** ISO UTC ('YYYY-MM-DDTHH:MM:SS.MSZ') — null em confirmações antigas sem carimbo */
  confirmed_at: string | null;
};

/** Quem confirmou presença no evento (p/ o modal da coluna "Presenças"). */
export async function listarConfirmacoes(
  eventId: number
): Promise<{ ok: true; rows: ConfirmacaoRow[] } | { ok: false; error: string }> {
  await requireAdmin();
  const id = Number(eventId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Evento inválido." };
  }
  const sql = getSql();
  try {
    const rows = await sql<ConfirmacaoRow[]>`
      SELECT p.id AS user_id, p.full_name, p.email, ec.confirmed_at
        FROM event_confirmations ec
        JOIN profiles p ON p.id = ec.user_id
       WHERE ec.event_id = ${id} AND ec.confirmed = 1
       ORDER BY ec.confirmed_at DESC NULLS LAST, p.full_name
    `;
    return { ok: true, rows };
  } catch (error) {
    console.error("Erro em listarConfirmacoes:", error);
    return { ok: false, error: "Não foi possível carregar as confirmações." };
  }
}

function revalidate() {
  revalidatePath("/admin/mentorships");
  revalidatePath("/mentorships");
  revalidatePath("/home");
}

function validarCampos(input: MentoriaInput): { error?: string } {
  if (!input.title?.trim()) return { error: "Informe o título da mentoria." };
  if (input.event_kind === "mentoria_arkom") {
    const cost = Number(input.credit_cost);
    if (!Number.isInteger(cost) || cost < 0 || cost > MAX_CREDIT_COST) {
      return {
        error: `O custo em créditos precisa ser um número inteiro de 0 a ${MAX_CREDIT_COST}.`,
      };
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.event_date) || !isValid(parseISO(input.event_date))) {
    return { error: "Informe uma data válida para o evento." };
  }
  if (!/^\d{2}:\d{2}/.test(input.starts_at)) {
    return { error: "Informe o horário de início." };
  }
  if (input.ends_at && input.ends_at <= input.starts_at) {
    return { error: "O horário de fim deve ser depois do início." };
  }
  return {};
}

/** Cria a mentoria. Com recorrência, gera um evento concreto por ocorrência (máx. 60). */
export async function criarMentoria(input: MentoriaInput): Promise<ActionResult> {
  const user = await requireAdmin();
  const invalid = validarCampos(input);
  if (invalid.error) return { ok: false, error: invalid.error };

  const recurrence = ["daily", "weekly"].includes(input.recurrence_type)
    ? (input.recurrence_type as "daily" | "weekly")
    : "none";
  const until = input.recurrence_until?.trim() || null;

  // Materialização das datas das ocorrências.
  const dates: string[] = [];
  if (recurrence === "none") {
    dates.push(input.event_date);
  } else {
    if (!until || !/^\d{4}-\d{2}-\d{2}$/.test(until) || !isValid(parseISO(until))) {
      return { ok: false, error: "Informe a data final da recorrência." };
    }
    const untilDate = parseISO(until);
    let cursor = parseISO(input.event_date);
    if (cursor.getTime() > untilDate.getTime()) {
      return { ok: false, error: "A data final da recorrência deve ser igual ou depois da data do evento." };
    }
    const step = recurrence === "daily" ? 1 : 7;
    while (cursor.getTime() <= untilDate.getTime() && dates.length < MAX_OCCURRENCES) {
      dates.push(format(cursor, "yyyy-MM-dd"));
      cursor = addDays(cursor, step);
    }
  }

  const sql = getSql();
  const comCredito = await temColunasDeCredito(sql);
  const mentorIds = normalizarMentores(input);
  const comMentores = mentorIds.length > 0 && (await temTabela(sql, "event_mentors"));
  const { kind, cost } = normalizarCredito(input);

  try {
    await sql.begin(async (sql) => {
      for (const date of dates) {
        let novoId: number | null = null;
        if (comCredito) {
          const [criado] = await sql<{ id: number }[]>`
            INSERT INTO mentorship_events
              (title, description, cover_url, event_date, starts_at, ends_at, redirect_url,
               recurrence_type, recurrence_until, status, created_by, event_kind, credit_cost)
            VALUES (
              ${input.title.trim()},
              ${input.description?.trim() || null},
              ${input.cover_url?.trim() || null},
              ${date},
              ${input.starts_at},
              ${input.ends_at?.trim() || null},
              ${input.redirect_url?.trim() || null},
              ${recurrence},
              ${recurrence === "none" ? null : until},
              ${input.status === "draft" ? "draft" : "published"},
              ${user.id},
              ${kind},
              ${cost}
            )
            RETURNING id
          `;
          novoId = criado?.id ?? null;
        } else {
          const [criado] = await sql<{ id: number }[]>`
            INSERT INTO mentorship_events
              (title, description, cover_url, event_date, starts_at, ends_at, redirect_url,
               recurrence_type, recurrence_until, status, created_by)
            VALUES (
              ${input.title.trim()},
              ${input.description?.trim() || null},
              ${input.cover_url?.trim() || null},
              ${date},
              ${input.starts_at},
              ${input.ends_at?.trim() || null},
              ${input.redirect_url?.trim() || null},
              ${recurrence},
              ${recurrence === "none" ? null : until},
              ${input.status === "draft" ? "draft" : "published"},
              ${user.id}
            )
            RETURNING id
          `;
          novoId = criado?.id ?? null;
        }

        // A recorrência materializa uma ocorrência por data: os mesmos
        // mentores são vinculados a TODAS elas (é a mesma série).
        if (comMentores && novoId !== null) {
          await sincronizarMentores(sql, novoId, mentorIds);
        }
      }
    });
    revalidate();
    return { ok: true };
  } catch (error) {
    console.error("Erro em criarMentoria:", error);
    return { ok: false, error: "Não foi possível criar a mentoria. Tente novamente." };
  }
}

/** Atualiza UMA ocorrência (não regenera a recorrência). */
export async function atualizarMentoria(
  id: number,
  input: MentoriaInput
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const invalid = validarCampos(input);
  if (invalid.error) return { ok: false, error: invalid.error };

  const sql = getSql();
  const comCredito = await temColunasDeCredito(sql);
  const mentorIds = normalizarMentores(input);
  const comMentores = await temTabela(sql, "event_mentors");
  const { kind, cost } = normalizarCredito(input);

  try {
    // Evento e mentores na MESMA transação: salvar o encontro e trocar quem o
    // conduz é uma edição só — não pode haver o estado intermediário em que o
    // título mudou e os mentores não.
    let statusAnterior: string | null = null;
    const salvo = await sql.begin<boolean>(async (tx) => {
      const [antes] = await tx<{ status: string }[]>`
        SELECT status FROM mentorship_events WHERE id = ${id} FOR UPDATE
      `;
      if (!antes) return false;
      statusAnterior = antes.status;
      const updated = comCredito
        ? await tx<{ id: number }[]>`
            UPDATE mentorship_events
            SET title = ${input.title.trim()},
                description = ${input.description?.trim() || null},
                cover_url = ${input.cover_url?.trim() || null},
                event_date = ${input.event_date},
                starts_at = ${input.starts_at},
                ends_at = ${input.ends_at?.trim() || null},
                redirect_url = ${input.redirect_url?.trim() || null},
                status = ${input.status === "draft" ? "draft" : "published"},
                event_kind = ${kind},
                credit_cost = ${cost}
            WHERE id = ${id}
            RETURNING id
          `
        : await tx<{ id: number }[]>`
            UPDATE mentorship_events
            SET title = ${input.title.trim()},
                description = ${input.description?.trim() || null},
                cover_url = ${input.cover_url?.trim() || null},
                event_date = ${input.event_date},
                starts_at = ${input.starts_at},
                ends_at = ${input.ends_at?.trim() || null},
                redirect_url = ${input.redirect_url?.trim() || null},
                status = ${input.status === "draft" ? "draft" : "published"}
            WHERE id = ${id}
            RETURNING id
          `;
      if (updated.length === 0) return false;

      // O conjunto enviado SUBSTITUI o atual (lista vazia = sem mentores).
      if (comMentores) await sincronizarMentores(tx, id, mentorIds);
      return true;
    });

    if (!salvo) return { ok: false, error: "Mentoria não encontrada." };

    // Rascunho → publicado pela edição = republicação: mesma revalidação do toggle.
    let message: string | undefined;
    if (statusAnterior !== "published" && input.status !== "draft") {
      try {
        message = fraseRecontabilizacao(await recontabilizarConfirmacoes(admin, id));
      } catch (error) {
        console.error(`Erro ao recontabilizar a republicação (evento=${id}):`, error);
        message =
          "Atenção: a mentoria foi republicada, mas a recontabilização das confirmações falhou — despublique e publique de novo.";
      }
    }

    revalidate();
    return { ok: true, message };
  } catch (error) {
    console.error("Erro em atualizarMentoria:", error);
    return { ok: false, error: "Não foi possível salvar a mentoria. Tente novamente." };
  }
}

/**
 * Vínculos de crédito de um evento, para a regra "mentoria com histórico não se
 * exclui" (ver `src/lib/mentorship-delete-guard.ts`). Conta as DUAS tabelas: o
 * diário de sombra bloqueia sozinho, mesmo com o extrato zerado.
 *
 * `42P01` = ambiente sem as migrations 0011/0012 (dev em `app_arkom`): sem
 * essas tabelas não existe vínculo nenhum e o DELETE segue como sempre seguiu.
 */
async function contarVinculosDeCredito(
  sql: postgres.Sql,
  id: number,
): Promise<VinculosDeCredito> {
  const contar = async <T>(query: Promise<T[]>): Promise<T | null> => {
    try {
      return (await query)[0] ?? null;
    } catch (error) {
      if ((error as { code?: string })?.code !== "42P01") throw error;
      return null;
    }
  };

  const extrato = await contar(sql<{ total: number; alunos: number }[]>`
    SELECT COUNT(*)::int AS total, COUNT(DISTINCT profile_id)::int AS alunos
      FROM credit_ledger WHERE event_id = ${id}
  `);
  const sombra = await contar(sql<{ total: number }[]>`
    SELECT COUNT(*)::int AS total FROM credit_shadow_log WHERE event_id = ${id}
  `);

  return {
    lancamentos: extrato?.total ?? 0,
    alunos: extrato?.alunos ?? 0,
    sombra: sombra?.total ?? 0,
  };
}

/** `cancelled_at` só existe a partir da 0012 — ambiente sem ela responde false. */
async function eventoCancelado(sql: postgres.Sql, id: number): Promise<boolean> {
  try {
    const [row] = await sql<{ cancelada: boolean }[]>`
      SELECT cancelled_at IS NOT NULL AS cancelada
        FROM mentorship_events WHERE id = ${id}
    `;
    return row?.cancelada ?? false;
  } catch (error) {
    if ((error as { code?: string })?.code !== "42703") throw error;
    return false;
  }
}

/**
 * Exclui uma ocorrência (confirmações, presenças e vínculos de mentor caem em
 * cascata). Mentoria com histórico de crédito NÃO é excluída: volta o MOTIVO,
 * não um "tente novamente" — retentar nunca resolveria.
 */
export async function excluirMentoria(id: number): Promise<ActionResult> {
  await requireAdmin();
  const sql = getSql();
  try {
    const [evento] = await sql<{ id: number }[]>`
      SELECT id FROM mentorship_events WHERE id = ${id}
    `;
    if (!evento) return { ok: false, error: "Mentoria não encontrada." };

    const impedimento = motivoParaNaoExcluir(
      await contarVinculosDeCredito(sql, id),
      await eventoCancelado(sql, id),
    );
    if (impedimento) return { ok: false, error: impedimento };

    const deleted = await sql<{ id: number }[]>`
      DELETE FROM mentorship_events WHERE id = ${id} RETURNING id
    `;
    if (deleted.length === 0) return { ok: false, error: "Mentoria não encontrada." };
    revalidate();
    return { ok: true };
  } catch (error) {
    // Rede de segurança da corrida: um aluno confirmou (gerando lançamento)
    // entre a contagem e o DELETE. O banco recusa com `restrict_violation` e o
    // admin merece o motivo, não um "tente novamente".
    if ((error as { code?: string })?.code === "23001") {
      console.error(`excluirMentoria: histórico de crédito barrou o DELETE (evento=${id}).`);
      return {
        ok: false,
        error:
          "Esta mentoria ganhou lançamentos de crédito enquanto a tela estava aberta e não pode mais ser excluída — o extrato é histórico e não se apaga. Atualize a página para ver a situação atual.",
      };
    }
    console.error("Erro em excluirMentoria:", error);
    return { ok: false, error: "Não foi possível excluir a mentoria. Tente novamente." };
  }
}

/**
 * CANCELAMENTO PELO ARKOM (regra E3) — despublica o evento e ESTORNA todos os
 * débitos que ele gerou, de todos os alunos, de uma vez.
 *
 * O que não faz: não exclui o evento, não apaga confirmação, não mexe em
 * lançamento nenhum do passado. Cada estorno é um LANÇAMENTO NOVO
 * (`event_refund`), com o motivo e o admin que cancelou.
 *
 * Idempotente por construção: a chave de cada estorno é
 * `refund:evt=…:perfil=…:n=…` e só há estorno enquanto houver débito em aberto.
 * Cancelar duas vezes devolve "0 estorno(s)" na segunda.
 */
export async function cancelarEventoComEstorno(
  id: number,
  motivo?: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Mentoria inválida." };

  const sql = getSql();
  const comCredito = await temColunasDeCredito(sql);

  try {
    const [evento] = await sql<{ id: number; title: string }[]>`
      SELECT id, title FROM mentorship_events WHERE id = ${id}
    `;
    if (!evento) return { ok: false, error: "Mentoria não encontrada." };

    // Quem tem débito em aberto neste evento. Ordenado por perfil: as travas
    // são tomadas sempre na mesma ordem, então dois cancelamentos simultâneos
    // não se enroscam.
    let candidatos: { profile_id: number }[] = [];
    let ledgerAusente = false;
    try {
      candidatos = await sql<{ profile_id: number }[]>`
        SELECT profile_id
          FROM credit_ledger
         WHERE event_id = ${id}
         GROUP BY profile_id
        HAVING COALESCE(-SUM(delta) FILTER (WHERE reason = 'event_debit'), 0)
             > COALESCE(SUM(delta)  FILTER (WHERE reason = 'event_refund'), 0)
         ORDER BY profile_id
      `;
    } catch (error) {
      if ((error as { code?: string })?.code !== "42P01") throw error;
      ledgerAusente = true; // ambiente sem a 0011: só cancela
    }

    const nota = motivo?.trim()
      ? `Cancelamento de "${evento.title}" pelo Arkom: ${motivo.trim()}`
      : `Cancelamento de "${evento.title}" pelo Arkom`;

    const estornados = await sql.begin<number>(async (tx) => {
      let total = 0;
      for (const { profile_id: profileId } of candidatos) {
        await tx`SELECT pg_advisory_xact_lock(424211::int, ${profileId}::int)`;
        const movimentos = await countEventMovements(tx, id, profileId);
        if (movimentos.outstanding <= 0) continue;

        const lancamento = await creditCreditIn(tx, {
          profileId,
          amount: movimentos.outstanding,
          operationKey: refundOperationKey(id, profileId, movimentos.refunds + 1),
          reason: "event_refund",
          note: nota,
          ref: `evento:${id}`,
          eventId: id,
          actor: { profileId: admin.id, label: admin.email ?? `profile:${admin.id}` },
        });
        if (!lancamento.ok) {
          throw new Error(
            `Falha ao estornar o crédito do aluno ${profileId}: ${lancamento.error}`,
          );
        }
        if (!lancamento.duplicated) total += 1;
      }

      if (comCredito) {
        await tx`
          UPDATE mentorship_events
             SET status = 'draft',
                 cancelled_at = COALESCE(cancelled_at, now()),
                 cancelled_by = COALESCE(cancelled_by, ${admin.id})
           WHERE id = ${id}
        `;
      } else {
        await tx`UPDATE mentorship_events SET status = 'draft' WHERE id = ${id}`;
      }

      return total;
    });

    revalidate();
    return {
      ok: true,
      message: ledgerAusente
        ? "Mentoria cancelada (despublicada)."
        : `Mentoria cancelada (despublicada) e ${estornados} estorno(s) lançado(s) no extrato dos alunos.`,
    };
  } catch (error) {
    console.error(`Erro em cancelarEventoComEstorno (evento=${id}, admin=${admin.email}):`, error);
    return {
      ok: false,
      error: "Não foi possível cancelar a mentoria e estornar os créditos. Tente novamente.",
    };
  }
}

/**
 * RECONTABILIZAÇÃO NA REPUBLICAÇÃO (achado do dono no QA manual, 2026-07-28).
 *
 * O furo: cancelar pelo Arkom ESTORNA os débitos mas mantém as confirmações
 * (histórico, de propósito). Republicar o evento ressuscitava esses assentos
 * sem lastro — e um aluno que gastou o estorno em outras mentorias ficava com
 * mais horas confirmadas do que o plano cobre.
 *
 * A regra agora: ao voltar a `published`, cada confirmação sem débito em
 * aberto é revalidada contra o saldo ATUAL do aluno —
 *   · saldo cobre o custo  ⇒ RECOBRA (volta ao estado de antes do cancelamento);
 *   · saldo não cobre      ⇒ a confirmação é REMOVIDA (o aluno reconfirma
 *     quando tiver horas; assento nunca fica sem lastro).
 *
 * Idempotente: a chave do débito é a MESMA do fluxo de confirmação do aluno
 * (`debitOperationKey` por ciclo de estornos) — recobrar aqui e o aluno clicar
 * depois não cobra duas vezes. Só age em modo enforce, em mentoria do Arkom
 * com custo > 0, e nunca num evento que já terminou (encerrada é história).
 */
type Recontabilizacao = { recobrados: number; removidos: number } | null;

async function recontabilizarConfirmacoes(
  admin: { id: number; email: string | null },
  eventId: number,
): Promise<Recontabilizacao> {
  const sql = getSql();
  const runtime = await getCreditRuntime();
  if (runtime.mode !== "enforce") return null;

  const event = await loadEventCredit(sql, eventId);
  if (
    !event ||
    event.columnsMissing ||
    event.kind !== "mentoria_arkom" ||
    event.cost <= 0 ||
    event.hasEnded
  ) {
    return null;
  }

  let confirmados: { user_id: number }[] = [];
  try {
    confirmados = await sql<{ user_id: number }[]>`
      SELECT user_id FROM event_confirmations
       WHERE event_id = ${eventId} AND confirmed = 1
       ORDER BY user_id
    `;
  } catch (error) {
    if ((error as { code?: string })?.code !== "42P01") throw error;
    return null;
  }
  if (confirmados.length === 0) return { recobrados: 0, removidos: 0 };

  return await sql.begin<Exclude<Recontabilizacao, null>>(async (tx) => {
    let recobrados = 0;
    let removidos = 0;
    for (const { user_id: perfilId } of confirmados) {
      // Mesmo lock do cancelamento (E3): republicar e cancelar em paralelo
      // disputam o mesmo aluno na mesma ordem, sem se enroscar.
      await tx`SELECT pg_advisory_xact_lock(424211::int, ${perfilId}::int)`;
      const movimentos = await countEventMovements(tx, eventId, perfilId);
      if (movimentos.outstanding > 0) continue; // assento com lastro: nada a fazer

      const lancamento = await debitCreditIn(tx, {
        profileId: perfilId,
        amount: event.cost,
        operationKey: debitOperationKey(eventId, perfilId, movimentos.refunds),
        reason: "event_debit",
        note: `Recobrança na republicação de "${event.title}"`,
        ref: `evento:${eventId}`,
        eventId,
        enforceBalance: true,
        actor: { profileId: admin.id, label: admin.email ?? `profile:${admin.id}` },
      });
      if (lancamento.ok) {
        if (!lancamento.duplicated) recobrados += 1;
      } else {
        await tx`
          UPDATE event_confirmations
             SET confirmed = 0, confirmed_at = NULL
           WHERE event_id = ${eventId} AND user_id = ${perfilId}
        `;
        removidos += 1;
      }
    }
    return { recobrados, removidos };
  });
}

function fraseRecontabilizacao(r: Recontabilizacao): string | undefined {
  if (!r || (r.recobrados === 0 && r.removidos === 0)) return undefined;
  const partes: string[] = [];
  if (r.recobrados > 0) partes.push(`${r.recobrados} recobrança(s) lançada(s) no extrato`);
  if (r.removidos > 0) {
    partes.push(`${r.removidos} confirmação(ões) removida(s) por falta de saldo`);
  }
  return `Recontabilização da republicação: ${partes.join(" e ")}.`;
}

/** Publica/despublica rapidamente. Republicar recontabiliza as confirmações. */
export async function alternarStatusMentoria(id: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  const sql = getSql();
  try {
    const updated = await sql<{ id: number; status: string }[]>`
      UPDATE mentorship_events
      SET status = CASE status WHEN 'published' THEN 'draft' ELSE 'published' END
      WHERE id = ${id}
      RETURNING id, status
    `;
    if (updated.length === 0) return { ok: false, error: "Mentoria não encontrada." };

    let message: string | undefined;
    if (updated[0].status === "published") {
      try {
        message = fraseRecontabilizacao(await recontabilizarConfirmacoes(admin, id));
      } catch (error) {
        // A republicação em si valeu; o admin fica sabendo que a revalidação não.
        console.error(`Erro ao recontabilizar a republicação (evento=${id}):`, error);
        message =
          "Atenção: a mentoria foi republicada, mas a recontabilização das confirmações falhou — despublique e publique de novo.";
      }
    }

    revalidate();
    return { ok: true, message };
  } catch (error) {
    console.error("Erro em alternarStatusMentoria:", error);
    return { ok: false, error: "Não foi possível alterar o status. Tente novamente." };
  }
}

// ---------------------------------------------------------------------------
// LISTA DE PRESENÇA (regra E4, migration 0014)
// ---------------------------------------------------------------------------
//
// `event_confirmations` é RSVP ("pretendo ir"); `event_attendance` é o fato
// ("esteve"). A lista abaixo parte dos CONFIRMADOS e acrescenta quem já tem
// presença aferida sem ter confirmado — assim uma marcação feita por engano
// nunca fica invisível na tela que deveria corrigi-la.
//
// TRÊS ESTADOS por aluno: `attended = null` (não aferido), `true` (presente),
// `false` (ausente). Marcar não apaga a confirmação, e desmarcar NÃO estorna
// crédito (ver `marcarPresenca`).

export type PresencaRow = {
  user_id: number;
  full_name: string;
  email: string;
  /** Confirmou presença (RSVP)? */
  confirmed: boolean;
  confirmed_at: string | null;
  /** null = ainda não aferido. */
  attended: boolean | null;
  marked_at: string | Date | null;
  marked_by_name: string | null;
};

export type PresencaContexto = {
  /** A migration 0014 existe neste ambiente? */
  disponivel: boolean;
  /** Marcar PRESENTE debita crédito agora? (política + flags + tipo do evento) */
  debitaAoMarcar: boolean;
  /** Custo efetivo por participação (0 = live da comunidade). */
  cost: number;
  kind: "mentoria_arkom" | "live_comunidade";
  policy: "on_confirmation" | "on_participation";
  mode: "off" | "shadow" | "enforce";
};

export type PresencasResult =
  | { ok: true; rows: PresencaRow[]; contexto: PresencaContexto }
  | { ok: false; error: string };

/** A lista de presença do evento (confirmados + já aferidos). */
export async function listarPresencas(eventId: number): Promise<PresencasResult> {
  await requireAdmin();
  const id = Number(eventId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Evento inválido." };
  }

  const sql = getSql();
  try {
    const runtime = await getCreditRuntime();
    const evento = await loadEventCredit(sql, id);
    const contexto: PresencaContexto = {
      disponivel: true,
      kind: evento?.kind ?? "live_comunidade",
      cost: evento?.cost ?? 0,
      policy: runtime.policy,
      mode: runtime.mode,
      debitaAoMarcar:
        runtime.mode === "enforce" &&
        runtime.policy === "on_participation" &&
        (evento?.cost ?? 0) > 0,
    };

    let rows: PresencaRow[];
    try {
      rows = await sql<PresencaRow[]>`
        SELECT p.id AS user_id, p.full_name, p.email,
               COALESCE(ec.confirmed, 0) = 1 AS confirmed,
               ec.confirmed_at,
               ea.attended,
               ea.marked_at,
               mb.full_name AS marked_by_name
          FROM profiles p
          LEFT JOIN event_confirmations ec
                 ON ec.user_id = p.id AND ec.event_id = ${id}
          LEFT JOIN event_attendance ea
                 ON ea.profile_id = p.id AND ea.event_id = ${id}
          LEFT JOIN profiles mb ON mb.id = ea.marked_by
         WHERE ec.confirmed = 1 OR ea.id IS NOT NULL
         ORDER BY p.full_name
      `;
    } catch (error) {
      if ((error as { code?: string })?.code !== "42P01") throw error;
      // Ambiente sem a 0014: mostra só quem confirmou, sem marcação.
      contexto.disponivel = false;
      contexto.debitaAoMarcar = false;
      rows = await sql<PresencaRow[]>`
        SELECT p.id AS user_id, p.full_name, p.email,
               TRUE AS confirmed, ec.confirmed_at,
               NULL::boolean AS attended,
               NULL::timestamptz AS marked_at,
               NULL::text AS marked_by_name
          FROM event_confirmations ec
          JOIN profiles p ON p.id = ec.user_id
         WHERE ec.event_id = ${id} AND ec.confirmed = 1
         ORDER BY p.full_name
      `;
    }

    return { ok: true, rows, contexto };
  } catch (error) {
    console.error("Erro em listarPresencas:", error);
    return { ok: false, error: "Não foi possível carregar a lista de presença." };
  }
}

/**
 * Marca (ou corrige) a presença de UM aluno num evento.
 *
 * PRESENTE + política `on_participation` valendo ⇒ chama
 * `debitForParticipation`, que é idempotente por
 * `participation:evt=<e>:perfil=<p>`: marcar duas vezes, ou marcar → desmarcar
 * → marcar, debita UMA vez. Live da comunidade (custo 0) nunca debita.
 *
 * O débito acontece DEPOIS de a presença estar gravada, e fora da transação
 * dela, de propósito: a aferição do mentor não pode ser desfeita por uma falha
 * do ledger. Se o lançamento falhar, a presença fica marcada, o admin vê o
 * aviso e a próxima marcação (ou o retry) reaproveita a mesma chave.
 *
 * DESMARCAR NÃO ESTORNA. Estorno é movimento compensatório com motivo e autor,
 * feito em Planos › extrato do aluno — a mesma doutrina do cancelamento pelo
 * Arkom (E3).
 */
export async function marcarPresenca(
  eventId: number,
  profileId: number,
  presente: boolean,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const evento = Number(eventId);
  const perfil = Number(profileId);
  if (!Number.isInteger(evento) || evento <= 0) {
    return { ok: false, error: "Evento inválido." };
  }
  if (!Number.isInteger(perfil) || perfil <= 0) {
    return { ok: false, error: "Aluno inválido." };
  }

  const sql = getSql();
  try {
    await sql`
      INSERT INTO event_attendance (event_id, profile_id, attended, marked_by, marked_at)
      VALUES (${evento}, ${perfil}, ${presente}, ${admin.id}, now())
      ON CONFLICT (event_id, profile_id) DO UPDATE
        SET attended = excluded.attended,
            marked_by = excluded.marked_by,
            marked_at = now()
    `;
  } catch (error) {
    if ((error as { code?: string })?.code === "42P01") {
      return {
        ok: false,
        error:
          "A lista de presença ainda não existe neste ambiente. Aplique a migration db/migrations/0014-mentors.sql.",
      };
    }
    console.error("Erro em marcarPresenca:", error);
    return { ok: false, error: "Não foi possível registrar a presença. Tente novamente." };
  }

  let aviso: string | undefined;
  if (presente) {
    const lancamento = await debitForParticipation(evento, perfil);
    if (!lancamento.ok) {
      aviso = `Presença registrada, mas o débito do crédito falhou (${lancamento.error}). Marque de novo para tentar outra vez.`;
      console.error(
        `Falha no débito por participação (evento=${evento}, perfil=${perfil}):`,
        lancamento,
      );
    } else if (!lancamento.skipped && !lancamento.duplicated) {
      aviso = `1 participação debitada. Saldo do aluno: ${lancamento.balance} crédito(s).`;
    }
  }

  revalidatePath("/admin/mentorships");
  return { ok: true, message: aviso };
}
