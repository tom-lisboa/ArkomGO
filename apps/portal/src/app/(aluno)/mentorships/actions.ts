"use server";

// Server actions da vertical Mentorias (área do aluno).
// Mutação única: alternar a confirmação de presença num evento publicado.
// Port de bilhon-ai/app/(aluno)/mentorias/actions.ts (lógica verbatim),
// adaptado à rota EN do arkom (/mentorships) e aos helpers deste app.
//
// ─── CRÉDITOS (Tarefa 1) ───────────────────────────────────────────────────
// Este é o ÚNICO caminho de mutação de presença do produto, então é aqui que o
// crédito entra. A regra em uma frase: com as flags desligadas, nada muda.
//
//   flags OFF  · exatamente o toggle de sempre (mesma consulta, mesmo upsert).
//   SOMBRA     · confirma normalmente e grava em `credit_shadow_log` o
//                veredito que TERIA valido. Não debita, não bloqueia.
//   BLOQUEIO   · mentoria do Arkom debita 1 crédito ao confirmar (política
//                `on_confirmation`); live da comunidade confirma de graça;
//                saldo insuficiente barra com mensagem própria; desconfirmar
//                antes do início do evento (E1) estorna com LANÇAMENTO NOVO.
//
// ─── PRAZO DE ACESSO (Tarefa 4) ────────────────────────────────────────────
// Porta SEPARADA, com flag própria (`expiration_enforcement` + o interruptor
// mestre `entitlements_enabled`): aluno vencido não confirma presença NOVA em
// mentoria do Arkom, e recebe a mensagem de renovação. Live da comunidade
// segue aberta, desconfirmar segue liberado e presença JÁ confirmada não é
// tocada — ligar a flag não corta ninguém no meio de uma mentoria (X2).
//
// A decisão (quanto custa, se pode, o que dizer) vive em `@/lib/credit-policy`.
// Aqui só se orquestra: uma transação que faz o upsert da confirmação, o
// lançamento no ledger e o registro da sombra — os três ou nenhum.
//
// ⚠ Types são DECLARADOS aqui. NUNCA `export type { X } from "./y"` dentro de
// um módulo 'use server' (incidente PR#3 → fix PR#4).

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { creditCreditIn, debitCreditIn } from "@/lib/credit-ledger";
import { getAccessStatus } from "@/lib/entitlements";
import {
  countEventMovements,
  debitOperationKey,
  evaluateConfirmation,
  getCreditRuntime,
  loadEventCredit,
  lockProfileLedger,
  logShadowDecision,
  MENSAGEM_EXPIRADO,
  MENSAGEM_SALDO_ZERO,
  refundOperationKey,
  shadowVerdictOf,
  type CreditDecision,
  type CreditMode,
  type CreditVerdict,
  type DebitPolicy,
  type EventCreditInfo,
} from "@/lib/credit-policy";

export type ToggleConfirmationResult =
  | {
      ok: true;
      confirmed: boolean;
      /** Saldo depois da operação. `null` = ilimitado ou créditos desligados. */
      saldo?: number | null;
      ilimitado?: boolean;
      /** Recado que não é erro (ex.: cancelou fora da janela de estorno). */
      aviso?: string;
    }
  | {
      ok: false;
      error: string;
      /** Qual das três regras barrou — o suporte usa isto no runbook. */
      motivo?: Exclude<CreditVerdict, "allow">;
    };

const AVISO_FORA_DA_JANELA =
  "Presença cancelada, mas o crédito não volta: o estorno só vale para cancelamentos feitos antes de a mentoria começar.";

/** Regra do dono (2026-07-27): mentoria encerrada é história — não se confirma,
 *  não se desconfirma e não se acessa. O corte é o FIM do horário do evento
 *  (GMT-3), pelo relógio do banco. Vale com as flags ligadas OU desligadas:
 *  é regra de calendário, não de crédito. */
const MENSAGEM_ENCERRADA =
  "Esta mentoria já foi encerrada. A confirmação de presença vale só até o fim do horário do evento.";

/** Erro sentinela: desfaz a transação e vira mensagem de bloqueio. */
class ConfirmacaoBloqueada extends Error {
  constructor(
    readonly motivo: Exclude<CreditVerdict, "allow">,
    readonly mensagem: string,
  ) {
    super(mensagem);
    this.name = "ConfirmacaoBloqueada";
  }
}

/** Grava a sombra fora da transação (bloqueio não deixa transação para trás). */
async function registrarSombraAvulsa(
  profileId: number,
  event: EventCreditInfo,
  decision: CreditDecision,
): Promise<void> {
  if (decision.mode === "off") return;
  try {
    const sql = getSql();
    await logShadowDecision(sql, {
      profileId,
      event,
      action: "confirm",
      mode: decision.mode,
      policy: decision.policy,
      verdict: shadowVerdictOf(decision.verdict),
      enforced: decision.blocked,
      cost: decision.cost,
      balance: decision.balance,
      unlimited: decision.unlimited,
      planSlug: decision.planSlug,
      detail: decision.detail,
    });
  } catch (error) {
    // Observabilidade não pode derrubar a resposta ao aluno.
    console.error("Erro ao registrar o diário de créditos (sombra):", error);
  }
}

/** Registra no diário de sombra a confirmação barrada pelo PRAZO. Fora de
 *  transação (o bloqueio não deixa transação para trás) e à prova de falha:
 *  observabilidade não pode derrubar a resposta ao aluno. */
async function registrarSombraDePrazo(
  profileId: number,
  event: EventCreditInfo,
  mode: Exclude<CreditMode, "off">,
  policy: DebitPolicy,
  expiresAt: string | null,
): Promise<void> {
  try {
    const sql = getSql();
    await logShadowDecision(sql, {
      profileId,
      event,
      action: "confirm",
      mode,
      policy,
      verdict: "would_block_expirado",
      enforced: true,
      cost: event.cost,
      balance: null,
      unlimited: false,
      planSlug: null,
      detail: `prazo de acesso vencido em ${expiresAt ?? "?"} (expiration_enforcement ligada)`,
    });
  } catch (error) {
    console.error("Erro ao registrar o diário de créditos (prazo):", error);
  }
}

/**
 * Alterna a confirmação de presença do aluno logado no evento.
 * Guards: sessão ativa (requireUser) + evento existente e `published`.
 * Upsert em event_confirmations (UNIQUE user_id + event_id).
 */
export async function toggleConfirmation(
  eventId: number
): Promise<ToggleConfirmationResult> {
  const user = await requireUser();

  if (!Number.isInteger(eventId) || eventId <= 0) {
    return { ok: false, error: "Evento inválido." };
  }

  try {
    const sql = getSql();
    const runtime = await getCreditRuntime();

    // O PRAZO é uma porta PRÓPRIA (Tarefa 4): a flag dele é
    // `expiration_enforcement`, não `credit_blocking_enabled`. Vencido é
    // barrado mesmo com os créditos desligados — o que não faria sentido é
    // barrar sem `entitlements_enabled`, porque aí não existe plano nem prazo.
    const prazoValendo = runtime.expirationEnforcement && runtime.entitlementsEnabled;

    // ── Caminho legado: flags desligadas ⇒ o toggle de sempre — com UMA
    // exceção: o corte de evento encerrado (regra de calendário, vale sempre).
    // `loadEventCredit` serve de leitor aqui só por causa do `hasEnded`
    // calculado no relógio do banco; nada de crédito acontece neste caminho.
    if (runtime.mode === "off" && !prazoValendo) {
      const event = await loadEventCredit(sql, eventId);

      if (!event || event.status !== "published") {
        return { ok: false, error: "Mentoria não encontrada ou indisponível." };
      }
      if (event.hasEnded) {
        return { ok: false, error: MENSAGEM_ENCERRADA };
      }

      const existing = (
        await sql<{ confirmed: number }[]>`
          SELECT confirmed FROM event_confirmations WHERE user_id = ${user.id} AND event_id = ${eventId}
        `
      )[0];

      const next = existing?.confirmed === 1 ? 0 : 1;

      await sql`
        INSERT INTO event_confirmations (user_id, event_id, confirmed, confirmed_at)
        VALUES (${user.id}, ${eventId}, ${next}, ${next === 1 ? new Date().toISOString() : null})
        ON CONFLICT (user_id, event_id)
        DO UPDATE SET confirmed = excluded.confirmed, confirmed_at = excluded.confirmed_at
      `;

      revalidatePath("/mentorships");
      return { ok: true, confirmed: next === 1 };
    }

    // ── Caminho com prazo e/ou créditos ───────────────────────────────────
    const event = await loadEventCredit(sql, eventId);
    if (!event || event.status !== "published") {
      return { ok: false, error: "Mentoria não encontrada ou indisponível." };
    }
    // Encerrada ⇒ congelada: nem confirmar, nem desconfirmar. ANTES do desvio
    // de columnsMissing — o corte vale também em ambiente sem a 0012.
    if (event.hasEnded) {
      return { ok: false, error: MENSAGEM_ENCERRADA };
    }
    // Ambiente sem a migration 0012: cai no comportamento legado.
    if (event.columnsMissing) {
      return await toggleSemCreditos(user.id, eventId);
    }

    const existing = (
      await sql<{ confirmed: number }[]>`
        SELECT confirmed FROM event_confirmations WHERE user_id = ${user.id} AND event_id = ${eventId}
      `
    )[0];
    const confirmando = existing?.confirmed !== 1;

    // ── PORTA DO PRAZO (X1/X2/X3) ─────────────────────────────────────────
    // Barra só a confirmação NOVA, e só em mentoria do Arkom — live da
    // comunidade continua aberta (mesma doutrina da Tarefa 1: live nunca cobra
    // e nunca barra). DESCONFIRMAR nunca é barrado, e presença já confirmada
    // não é tocada: ligar a flag não corta ninguém no meio de uma mentoria em
    // andamento (X2).
    if (confirmando && prazoValendo && event.kind === "mentoria_arkom") {
      const acesso = await getAccessStatus(user.id);
      if (acesso.state === "expirado") {
        if (runtime.mode !== "off") {
          await registrarSombraDePrazo(user.id, event, runtime.mode, runtime.policy, acesso.expiresAt);
        }
        return { ok: false, error: MENSAGEM_EXPIRADO, motivo: "expirado" };
      }
    }

    // Só o prazo está ligado (créditos desligados): daqui em diante é o toggle
    // de sempre — sem ledger, sem diário de sombra.
    if (runtime.mode === "off") {
      return await toggleSemCreditos(user.id, eventId);
    }

    // Constante narrowed: o `mode` não é mais 'off' daqui para baixo, e o
    // TypeScript não carrega esse estreitamento para dentro dos callbacks.
    const modoAtivo: "shadow" | "enforce" = runtime.mode;

    if (confirmando) {
      const decision = await evaluateConfirmation(user.id, event, runtime);

      if (decision.blocked && decision.motivo) {
        await registrarSombraAvulsa(user.id, event, decision);
        return {
          ok: false,
          error: decision.motivo,
          motivo: decision.verdictAplicado as Exclude<CreditVerdict, "allow">,
        };
      }

      const resultado = await sql.begin<{ saldo: number | null }>(async (tx) => {
        let saldo = decision.balance;

        if (decision.shouldDebit) {
          // Serializa este perfil: dois cliques simultâneos leem o mesmo
          // número de ciclo e caem na MESMA chave de idempotência.
          await lockProfileLedger(tx, user.id);
          const movimentos = await countEventMovements(tx, eventId, user.id);

          const lancamento = await debitCreditIn(tx, {
            profileId: user.id,
            amount: decision.cost,
            // Chave por CICLO: duplo clique/retry/duas abas = 1 débito;
            // reconfirmar depois de um estorno cobra de novo (senão o par
            // confirmar→estornar→confirmar viraria assento de graça).
            operationKey: debitOperationKey(eventId, user.id, movimentos.refunds),
            reason: "event_debit",
            note: `Confirmação de presença em "${event.title}"`,
            ref: `evento:${eventId}`,
            eventId,
            enforceBalance: true,
          });

          if (!lancamento.ok) {
            // Corrida: o saldo mudou entre a decisão e a transação (outra aba,
            // outro dispositivo). O aluno recebe a MESMA mensagem de saldo do
            // fluxo normal — a frase do ledger é escrita para o /admin
            // ("o aluno não tem créditos"), não serve para o próprio aluno.
            console.warn(
              `[arkom] Débito recusado na confirmação (aluno=${user.id}, evento=${eventId}): ${lancamento.error}`,
            );
            throw new ConfirmacaoBloqueada("saldo_zero", MENSAGEM_SALDO_ZERO);
          }
          saldo = lancamento.balance;
        }

        await tx`
          INSERT INTO event_confirmations (user_id, event_id, confirmed, confirmed_at)
          VALUES (${user.id}, ${eventId}, 1, ${new Date().toISOString()})
          ON CONFLICT (user_id, event_id)
          DO UPDATE SET confirmed = excluded.confirmed, confirmed_at = excluded.confirmed_at
        `;

        await logShadowDecision(tx, {
          profileId: user.id,
          event,
          action: "confirm",
          mode: modoAtivo,
          policy: decision.policy,
          verdict: shadowVerdictOf(decision.verdict),
          enforced: decision.shouldDebit,
          cost: decision.cost,
          balance: decision.balance,
          unlimited: decision.unlimited,
          planSlug: decision.planSlug,
          detail: decision.shouldDebit
            ? `${decision.detail} · debitado ${decision.cost}`
            : decision.detail,
        });

        return { saldo };
      });

      revalidatePath("/mentorships");
      return {
        ok: true,
        confirmed: true,
        saldo: decision.unlimited ? null : resultado.saldo,
        ilimitado: decision.unlimited,
      };
    }

    // ── Desconfirmar: estorno (E1) quando há débito em aberto ─────────────
    const resultado = await sql.begin<{
      saldo: number | null;
      estornado: boolean;
      tinhaDebito: boolean;
    }>(
      async (tx) => {
        await lockProfileLedger(tx, user.id);
        const movimentos = await countEventMovements(tx, eventId, user.id);

        let saldo: number | null = null;
        let estornado = false;

        if (movimentos.outstanding > 0) {
          if (event.refundWindowOpen) {
            const lancamento = await creditCreditIn(tx, {
              profileId: user.id,
              amount: movimentos.outstanding,
              // Lançamento NOVO — o débito original fica no extrato para sempre.
              operationKey: refundOperationKey(eventId, user.id, movimentos.refunds + 1),
              reason: "event_refund",
              note: `Cancelamento da presença em "${event.title}" antes do início do evento`,
              ref: `evento:${eventId}`,
              eventId,
            });
            if (!lancamento.ok) {
              throw new Error(`Falha ao estornar o crédito: ${lancamento.error}`);
            }
            saldo = lancamento.balance;
            estornado = !lancamento.duplicated;
          }
        }

        await tx`
          INSERT INTO event_confirmations (user_id, event_id, confirmed, confirmed_at)
          VALUES (${user.id}, ${eventId}, 0, ${null})
          ON CONFLICT (user_id, event_id)
          DO UPDATE SET confirmed = excluded.confirmed, confirmed_at = excluded.confirmed_at
        `;

        await logShadowDecision(tx, {
          profileId: user.id,
          event,
          action: "unconfirm",
          mode: modoAtivo,
          policy: runtime.policy,
          verdict:
            movimentos.outstanding > 0 && !event.refundWindowOpen
              ? "would_skip_refund"
              : "would_refund",
          enforced: estornado,
          cost: event.cost,
          balance: saldo,
          unlimited: false,
          planSlug: null,
          detail:
            movimentos.outstanding === 0
              ? "sem débito em aberto para este evento"
              : event.refundWindowOpen
                ? `estorno de ${movimentos.outstanding} crédito(s)`
                : "evento já começou (E1): sem estorno",
        });

        return { saldo, estornado, tinhaDebito: movimentos.outstanding > 0 };
      },
    );

    revalidatePath("/mentorships");
    return {
      ok: true,
      confirmed: false,
      saldo: resultado.saldo,
      // O aviso só faz sentido para quem REALMENTE pagou por esta mentoria —
      // quem nunca teve crédito debitado não precisa ouvir falar de estorno.
      aviso:
        resultado.tinhaDebito && !resultado.estornado && !event.refundWindowOpen
          ? AVISO_FORA_DA_JANELA
          : undefined,
    };
  } catch (error) {
    if (error instanceof ConfirmacaoBloqueada) {
      return { ok: false, error: error.mensagem, motivo: error.motivo };
    }
    console.error("Erro ao alternar confirmação de presença:", error);
    return {
      ok: false,
      error: "Não foi possível salvar sua confirmação. Tente novamente.",
    };
  }
}

/** Toggle puro — usado quando o ambiente não tem a migration 0012. */
async function toggleSemCreditos(
  userId: number,
  eventId: number,
): Promise<ToggleConfirmationResult> {
  const sql = getSql();
  const existing = (
    await sql<{ confirmed: number }[]>`
      SELECT confirmed FROM event_confirmations WHERE user_id = ${userId} AND event_id = ${eventId}
    `
  )[0];
  const next = existing?.confirmed === 1 ? 0 : 1;

  await sql`
    INSERT INTO event_confirmations (user_id, event_id, confirmed, confirmed_at)
    VALUES (${userId}, ${eventId}, ${next}, ${next === 1 ? new Date().toISOString() : null})
    ON CONFLICT (user_id, event_id)
    DO UPDATE SET confirmed = excluded.confirmed, confirmed_at = excluded.confirmed_at
  `;

  revalidatePath("/mentorships");
  return { ok: true, confirmed: next === 1 };
}
