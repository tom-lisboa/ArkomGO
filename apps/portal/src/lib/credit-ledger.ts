// lib/credit-ledger.ts — escrita no ledger de créditos, server-only.
//
// Fonte: `credit_ledger` (migration 0011-entitlements-core.sql).
//
// ⚠ AS TRÊS REGRAS QUE NÃO SE NEGOCIAM
//   1. APPEND-ONLY. Só INSERT. Corrigir um lançamento errado é lançar o
//      movimento compensatório — o banco recusa UPDATE/DELETE por trigger e a
//      role de runtime nem tem o grant.
//   2. SALDO = SUM(delta). Não existe coluna de saldo em lugar nenhum.
//   3. IDEMPOTÊNCIA PELA `operationKey`. Repetir a MESMA operação (retry de
//      rede, duplo clique, confirmar→desconfirmar→confirmar numa mentoria) NÃO
//      duplica crédito: o INSERT cai em ON CONFLICT DO NOTHING e o chamador
//      recebe de volta o movimento que já existia, com `duplicated: true`.
//      A chave tem de ser DETERMINÍSTICA para a intenção do usuário — ex.:
//      `debito:evento=45:perfil=12`, nunca `Date.now()`.
//
// Consumidores: o /admin (concessão de plano e ajuste manual) e o débito por
// mentoria (Tarefa 1), atrás das flags `credit_shadow_mode` /
// `credit_blocking_enabled`.
//
// DUAS PORTAS, MESMA REGRA:
//   · `debitCredit` / `creditCredit` abrem a própria transação e devolvem
//     `LedgerResult` (nunca lançam).
//   · `debitCreditIn` / `creditCreditIn` recebem o executor de uma transação
//     JÁ ABERTA — é o que a confirmação de presença usa, para que o upsert em
//     `event_confirmations` e o lançamento no ledger caiam ou passem juntos.
//     Essas PROPAGAM erro de banco (é o que faz o `sql.begin` do chamador
//     desfazer tudo).

import type postgres from "postgres";
import { getSql } from "@/lib/db";

if (typeof window !== "undefined") {
  throw new Error("lib/credit-ledger.ts importado no browser — server-only");
}

/** Categoria estável do movimento (CHECK `credit_ledger.reason` na 0011). */
export type LedgerReason =
  | "plan_grant"
  | "plan_revoke"
  | "event_debit"
  | "event_refund"
  | "admin_grant"
  | "admin_revoke";

const LEDGER_REASONS: readonly LedgerReason[] = [
  "plan_grant",
  "plan_revoke",
  "event_debit",
  "event_refund",
  "admin_grant",
  "admin_revoke",
];

/** Operações manuais do admin exigem motivo e autor (CHECK no banco também). */
const MANUAL_REASONS: readonly LedgerReason[] = ["admin_grant", "admin_revoke"];

/** Namespace do advisory lock por perfil (serializa "conferir saldo → gravar"). */
const LEDGER_LOCK_NAMESPACE = 424_211;

const MAX_OPERATION_KEY = 200;
const MAX_AMOUNT = 100_000;

export type LedgerActor = {
  profileId?: number | null;
  /** Rótulo livre (e-mail do admin) — sobrevive à exclusão do perfil. */
  label?: string | null;
};

export type CreditMovement = {
  id: number;
  profileId: number;
  delta: number;
  reason: LedgerReason;
  note: string | null;
  ref: string | null;
  operationKey: string;
  eventId: number | null;
  entitlementId: number | null;
  actorProfileId: number | null;
  actorLabel: string | null;
  createdAt: string | null;
};

export type CreditWriteInput = {
  profileId: number;
  /** Quantidade SEMPRE positiva — o sinal quem define é debit/credit. */
  amount: number;
  /** Chave de idempotência determinística. */
  operationKey: string;
  reason: LedgerReason;
  /** Motivo em texto livre. Obrigatório em `admin_grant`/`admin_revoke`. */
  note?: string | null;
  /** Referência livre da operação (ex.: 'evento:45'). */
  ref?: string | null;
  eventId?: number | null;
  entitlementId?: number | null;
  actor?: LedgerActor | null;
  /** Só no débito: recusa a operação se o saldo ficaria negativo. */
  enforceBalance?: boolean;
};

export type LedgerErrorCode =
  | "invalid_input"
  | "insufficient_balance"
  | "missing_table"
  | "db_error";

export type LedgerResult =
  | { ok: true; duplicated: boolean; movement: CreditMovement; balance: number }
  | { ok: false; code: LedgerErrorCode; error: string; balance?: number };

type LedgerDbRow = {
  id: number;
  profile_id: number;
  delta: number;
  reason: LedgerReason;
  note: string | null;
  ref: string | null;
  operation_key: string;
  event_id: number | null;
  entitlement_id: number | null;
  actor_profile_id: number | null;
  actor_label: string | null;
  created_at: Date | string | null;
};

type Executor = postgres.Sql | postgres.TransactionSql;

function toIso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapMovement(row: LedgerDbRow): CreditMovement {
  return {
    id: row.id,
    profileId: row.profile_id,
    delta: row.delta,
    reason: row.reason,
    note: row.note,
    ref: row.ref,
    operationKey: row.operation_key,
    eventId: row.event_id,
    entitlementId: row.entitlement_id,
    actorProfileId: row.actor_profile_id,
    actorLabel: row.actor_label,
    createdAt: toIso(row.created_at),
  };
}

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string })?.code === "42P01";
}

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/**
 * Movimento já normalizado, pronto para o INSERT. É o contrato da API de baixo
 * nível (`appendMovement`), usada por quem já está dentro de uma transação —
 * `delta` aqui JÁ vem com sinal.
 */
export type LedgerEntry = {
  profileId: number;
  delta: number;
  reason: LedgerReason;
  note: string | null;
  ref: string | null;
  operationKey: string;
  eventId: number | null;
  entitlementId: number | null;
  actorProfileId: number | null;
  actorLabel: string | null;
};

function normalize(
  direction: 1 | -1,
  input: CreditWriteInput,
): { ok: true; value: LedgerEntry } | { ok: false; error: string } {
  if (!Number.isInteger(input.profileId) || input.profileId <= 0) {
    return { ok: false, error: "Aluno inválido." };
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    return { ok: false, error: "Informe uma quantidade inteira maior que zero." };
  }
  if (input.amount > MAX_AMOUNT) {
    return { ok: false, error: `A quantidade máxima por lançamento é ${MAX_AMOUNT}.` };
  }
  const operationKey = clean(input.operationKey);
  if (!operationKey) {
    return { ok: false, error: "Chave de idempotência ausente." };
  }
  if (operationKey.length > MAX_OPERATION_KEY) {
    return { ok: false, error: "Chave de idempotência longa demais." };
  }
  if (!LEDGER_REASONS.includes(input.reason)) {
    return { ok: false, error: "Motivo de lançamento inválido." };
  }

  const note = clean(input.note);
  const actorProfileId =
    Number.isInteger(input.actor?.profileId) && (input.actor?.profileId ?? 0) > 0
      ? (input.actor?.profileId as number)
      : null;

  if (MANUAL_REASONS.includes(input.reason)) {
    if (!note) return { ok: false, error: "Informe o motivo do ajuste manual." };
    if (actorProfileId === null) {
      return { ok: false, error: "Ajuste manual precisa identificar o administrador." };
    }
  }

  return {
    ok: true,
    value: {
      profileId: input.profileId,
      delta: direction * input.amount,
      reason: input.reason,
      note,
      ref: clean(input.ref),
      operationKey,
      eventId:
        Number.isInteger(input.eventId) && (input.eventId ?? 0) > 0
          ? (input.eventId as number)
          : null,
      entitlementId:
        Number.isInteger(input.entitlementId) && (input.entitlementId ?? 0) > 0
          ? (input.entitlementId as number)
          : null,
      actorProfileId,
      actorLabel: clean(input.actor?.label),
    },
  };
}

/**
 * Grava um movimento usando o executor recebido — use dentro de uma transação
 * que já esteja aberta (ex.: materializar um plano e conceder os créditos no
 * mesmo `sql.begin`). PROPAGA erro; a idempotência continua valendo.
 */
export async function appendMovement(
  db: Executor,
  movement: LedgerEntry,
): Promise<{ movement: CreditMovement; duplicated: boolean }> {
  const inserted = await db<LedgerDbRow[]>`
    INSERT INTO credit_ledger
      (profile_id, delta, reason, note, ref, operation_key,
       event_id, entitlement_id, actor_profile_id, actor_label)
    VALUES
      (${movement.profileId}, ${movement.delta}, ${movement.reason}, ${movement.note},
       ${movement.ref}, ${movement.operationKey}, ${movement.eventId},
       ${movement.entitlementId}, ${movement.actorProfileId}, ${movement.actorLabel})
    ON CONFLICT (operation_key) DO NOTHING
    RETURNING id, profile_id, delta, reason, note, ref, operation_key,
              event_id, entitlement_id, actor_profile_id, actor_label, created_at
  `;
  if (inserted.length > 0) {
    return { movement: mapMovement(inserted[0]), duplicated: false };
  }

  // Já existia: devolve o movimento original em vez de duplicar.
  const existing = await db<LedgerDbRow[]>`
    SELECT id, profile_id, delta, reason, note, ref, operation_key,
           event_id, entitlement_id, actor_profile_id, actor_label, created_at
      FROM credit_ledger
     WHERE operation_key = ${movement.operationKey}
     LIMIT 1
  `;
  if (existing.length === 0) {
    throw new Error(
      `credit_ledger: conflito em operation_key='${movement.operationKey}' sem linha correspondente.`,
    );
  }
  return { movement: mapMovement(existing[0]), duplicated: true };
}

/** Saldo dentro de uma transação já aberta. */
async function balanceOf(db: Executor, profileId: number): Promise<number> {
  const [row] = await db<{ balance: number }[]>`
    SELECT COALESCE(SUM(delta), 0)::int AS balance
      FROM credit_ledger
     WHERE profile_id = ${profileId}
  `;
  return row?.balance ?? 0;
}

/**
 * O miolo do lançamento, já dentro de uma transação. PROPAGA erro de banco de
 * propósito: quem abriu a transação precisa que o erro desfaça o resto.
 */
async function writeMovementIn(
  db: Executor,
  direction: 1 | -1,
  input: CreditWriteInput,
): Promise<LedgerResult> {
  const normalized = normalize(direction, input);
  if (!normalized.ok) {
    return { ok: false, code: "invalid_input", error: normalized.error };
  }
  const movement = normalized.value;

  if (input.enforceBalance && movement.delta < 0) {
    // Serializa "conferir saldo → gravar" por perfil: sem isto, dois
    // débitos simultâneos poderiam passar do zero.
    await db`SELECT pg_advisory_xact_lock(${LEDGER_LOCK_NAMESPACE}::int, ${movement.profileId}::int)`;

    const [alreadyDone] = await db<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
        FROM credit_ledger
       WHERE operation_key = ${movement.operationKey}
    `;
    // Repetição da mesma operação não é insuficiência de saldo.
    if ((alreadyDone?.total ?? 0) === 0) {
      const current = await balanceOf(db, movement.profileId);
      if (current + movement.delta < 0) {
        return {
          ok: false,
          code: "insufficient_balance",
          balance: current,
          error:
            current === 0
              ? "O aluno não tem créditos para debitar."
              : `Saldo insuficiente: o aluno tem ${current} crédito(s) e a operação retiraria ${Math.abs(movement.delta)}.`,
        };
      }
    }
  }

  const result = await appendMovement(db, movement);
  const balance = await balanceOf(db, movement.profileId);
  return {
    ok: true,
    duplicated: result.duplicated,
    movement: result.movement,
    balance,
  };
}

async function writeMovement(
  direction: 1 | -1,
  input: CreditWriteInput,
): Promise<LedgerResult> {
  const sql = getSql();
  try {
    return await sql.begin<LedgerResult>((tx) => writeMovementIn(tx, direction, input));
  } catch (error) {
    if (isMissingTable(error)) {
      console.warn(
        "[arkom] credit_ledger ausente (migration 0011 não aplicada) — lançamento ignorado.",
      );
      return {
        ok: false,
        code: "missing_table",
        error:
          "Tabela credit_ledger ausente. Aplique db/migrations/0011-entitlements-core.sql neste ambiente.",
      };
    }
    console.error(
      `[arkom] Falha ao lançar crédito (aluno=${input.profileId}, motivo=${input.reason}, operacao=${input.operationKey}):`,
      error,
    );
    return {
      ok: false,
      code: "db_error",
      error: "Não foi possível registrar o lançamento de créditos. Tente novamente.",
    };
  }
}

/** Credita `amount` créditos (delta positivo). Idempotente pela `operationKey`. */
export async function creditCredit(input: CreditWriteInput): Promise<LedgerResult> {
  return writeMovement(1, input);
}

/**
 * Debita `amount` créditos (delta negativo). Idempotente pela `operationKey`.
 * Com `enforceBalance: true`, recusa quando o saldo ficaria negativo — a
 * checagem e a gravação ficam sob o mesmo advisory lock por perfil.
 */
export async function debitCredit(input: CreditWriteInput): Promise<LedgerResult> {
  return writeMovement(-1, input);
}

/**
 * `creditCredit` DENTRO de uma transação já aberta (o executor vem do
 * `sql.begin` do chamador). PROPAGA erro de banco — é isso que faz a
 * transação inteira do chamador ser desfeita.
 */
export async function creditCreditIn(
  db: Executor,
  input: CreditWriteInput,
): Promise<LedgerResult> {
  return writeMovementIn(db, 1, input);
}

/**
 * `debitCredit` DENTRO de uma transação já aberta. Mesmo contrato de
 * idempotência (`operationKey`) e a mesma guarda opcional de saldo sob
 * advisory lock por perfil. PROPAGA erro de banco.
 */
export async function debitCreditIn(
  db: Executor,
  input: CreditWriteInput,
): Promise<LedgerResult> {
  return writeMovementIn(db, -1, input);
}

/** Extrato do perfil, do mais recente para o mais antigo. Fail-safe: [] em erro. */
export async function listCreditMovements(
  profileId: number,
  limit = 20,
): Promise<CreditMovement[]> {
  if (!Number.isInteger(profileId) || profileId <= 0) return [];
  const take = Math.min(Math.max(Math.trunc(limit) || 0, 1), 200);
  try {
    const sql = getSql();
    const rows = await sql<LedgerDbRow[]>`
      SELECT id, profile_id, delta, reason, note, ref, operation_key,
             event_id, entitlement_id, actor_profile_id, actor_label, created_at
        FROM credit_ledger
       WHERE profile_id = ${profileId}
       ORDER BY created_at DESC, id DESC
       LIMIT ${take}
    `;
    return rows.map(mapMovement);
  } catch (error) {
    if (isMissingTable(error)) {
      console.warn("[arkom] credit_ledger ausente — extrato vazio.");
      return [];
    }
    console.error(`[arkom] Falha ao listar o extrato do aluno ${profileId}:`, error);
    return [];
  }
}
