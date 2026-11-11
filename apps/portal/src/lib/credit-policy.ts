// lib/credit-policy.ts — a política de débito de créditos em mentoria.
// Server-only. É AQUI que se decide se uma confirmação de presença pode
// acontecer, se ela consome crédito e o que dizer ao aluno quando não pode.
//
// Fontes: `feature_flags` (0010), `plans`/`profile_entitlements`/`credit_ledger`
// (0011) e `mentorship_events.event_kind|credit_cost` + `credit_shadow_log`
// (0012).
//
// ─── AS TRÊS PORTAS (nesta ordem) ──────────────────────────────────────────
//   OFF      · `credit_shadow_mode` e `credit_blocking_enabled` desligadas.
//              Nada é lido, nada é gravado: a confirmação é o toggle puro de
//              sempre. Zero query a mais, zero mudança de comportamento.
//   SHADOW   · `credit_shadow_mode` ligada. A confirmação acontece NORMALMENTE
//              e o veredito que TERIA valido vai para `credit_shadow_log`.
//              Sombra observa; não escreve dívida no ledger, não bloqueia.
//   ENFORCE  · `credit_blocking_enabled` ligada (E `entitlements_enabled`
//              também — sem entitlement não existe plano, prazo nem cota, e
//              bloquear no vácuo barraria aluno por engano). Aí sim: mentoria
//              do Arkom debita e saldo insuficiente impede a confirmação.
//
// ─── OS TRÊS VEREDITOS DE BLOQUEIO ────────────────────────────────────────
//   `saldo_zero`           acabaram os créditos do plano
//   `expirado`             o acesso venceu
//   `evento_fora_do_plano` o plano não inclui mentorias ao vivo
// São DISTINGUÍVEIS de propósito: cada um tem mensagem própria em pt-BR e uma
// verificação própria do suporte (docs/credit-system/runbook-mensagens.md).
//
// ─── FAIL-SAFE ────────────────────────────────────────────────────────────
// Perfil sem entitlement, plano permissivo, erro de banco, migration ausente
// (`42P01`/`42703`) ⇒ trata como ILIMITADO: nunca bloqueia e nunca debita.
// Errar para o lado de deixar o aluno entrar é barato; errar para o lado de
// barrar quem pagou, não.

import type postgres from "postgres";
import { getSql } from "@/lib/db";
import { getFlagScope, isFeatureEnabled } from "@/lib/feature-flags";
import { getCreditBalance, getEntitlements, lerEntitlements } from "@/lib/entitlements";
import { debitCredit, type LedgerResult } from "@/lib/credit-ledger";

if (typeof window !== "undefined") {
  throw new Error("lib/credit-policy.ts importado no browser — server-only");
}

type Executor = postgres.Sql | postgres.TransactionSql;

/** Fuso de referência do produto: `event_date`/`starts_at` são TEXT sem fuso e
 *  sempre foram lidos como horário de Brasília (o app é pt-BR e o calendário
 *  do aluno renderiza local). Fixar aqui evita que o servidor em UTC mande o
 *  aluno para a janela de estorno errada. */
export const EVENT_TIMEZONE = "America/Sao_Paulo";

/** Regra E1 (dono, 2026-07-25): cancelou, DEVOLVE — o estorno vale até o
 *  INÍCIO da mentoria ("em cima da hora" inclusive). Depois que o evento
 *  começou, não devolve: sob `on_confirmation`, devolver pós-início deixaria
 *  confirmar → assistir → desconfirmar virar crédito de graça. */
export const REFUND_WINDOW_MINUTES = 0;

/** Janela de ACESSO à sala (dono, 2026-07-29): a sala abre 30 minutos antes do
 *  início e fecha no fim do evento (`hasEnded`). Confirmar presença continua
 *  liberado com qualquer antecedência — o que não vale é ENTRAR na sala de uma
 *  mentoria que só acontece amanhã. Espelho na UI:
 *  `components/mentorships/event-utils.ts#ACCESS_WINDOW_MINUTES`. */
export const ACCESS_WINDOW_MINUTES = 30;

export type EventKind = "mentoria_arkom" | "live_comunidade";
export type DebitPolicy = "on_confirmation" | "on_participation";
export type CreditMode = "off" | "shadow" | "enforce";
export type CreditVerdict =
  | "allow"
  | "saldo_zero"
  | "expirado"
  | "evento_fora_do_plano";

export type ShadowVerdict =
  | "would_allow"
  | "would_block_saldo"
  | "would_block_expirado"
  | "would_block_fora_do_plano"
  | "would_refund"
  | "would_skip_refund";

/** AS MENSAGENS DE BLOQUEIO. O suporte (Paulo Lucas) reconhece o caso pela
 *  frase — não mude o texto sem atualizar docs/credit-system/runbook-mensagens.md. */
export const MENSAGEM_SALDO_ZERO =
  "Suas horas de mentoria acabaram. Você já usou todas as horas do seu plano — fale com o suporte do Arkom para liberar mais horas ou aguardar a renovação.";

/** Saldo INSUFICIENTE ≠ saldo ZERADO (achado do dono no QA manual, 2026-07-28):
 *  dizer "acabaram" pra quem ainda vê 1h no contador é contradição na tela.
 *  A frase cita custo × saldo para bater com o aviso vermelho do modal. */
export function mensagemSaldoInsuficiente(custo: number, saldo: number): string {
  return `Esta mentoria usa ${custo}h e você tem ${saldo}h de saldo. Escolha um encontro mais curto ou fale com o suporte do Arkom para liberar mais horas.`;
}

export const MENSAGEM_EXPIRADO =
  "Seu acesso está vencido. Você continua com o catálogo e o seu progresso, mas confirmar presença em mentoria exige um plano dentro da validade — fale com o suporte do Arkom para renovar.";

export const MENSAGEM_FORA_DO_PLANO =
  "Seu plano não inclui mentorias ao vivo. As lives da comunidade continuam liberadas para você — fale com o suporte do Arkom para incluir mentorias no seu plano.";

export const MENSAGENS_BLOQUEIO: Record<
  Exclude<CreditVerdict, "allow">,
  string
> = {
  saldo_zero: MENSAGEM_SALDO_ZERO,
  expirado: MENSAGEM_EXPIRADO,
  evento_fora_do_plano: MENSAGEM_FORA_DO_PLANO,
};

/** Mapa veredito → registro do diário de sombra. */
const VERDICT_TO_SHADOW: Record<CreditVerdict, ShadowVerdict> = {
  allow: "would_allow",
  saldo_zero: "would_block_saldo",
  expirado: "would_block_expirado",
  evento_fora_do_plano: "would_block_fora_do_plano",
};

// ---------------------------------------------------------------------------
// Evento
// ---------------------------------------------------------------------------

export type EventCreditInfo = {
  id: number;
  title: string;
  status: string;
  kind: EventKind;
  /** Custo EFETIVO da confirmação: live sempre 0, mesmo com credit_cost > 0. */
  cost: number;
  /** Valor cru da coluna (o que o /admin editou). */
  rawCost: number;
  /** Início do evento como instante real (event_date + starts_at em -03). */
  startsAt: Date | null;
  /** A janela de estorno (E1) ainda está aberta AGORA? Calculado pelo relógio
   *  do banco — o servidor da aplicação pode estar em outro fuso/derivado. */
  refundWindowOpen: boolean;
  /** O evento JÁ TERMINOU? (regra do dono, 2026-07-27: mentoria encerrada não
   *  aceita confirmação nem acesso). Corte = fim do horário em GMT-3; sem
   *  `ends_at` válido vale início + 60 min (o fallback do calendário). Dado
   *  torto ⇒ `false`, a favor do aluno. Relógio do banco, como o estorno. */
  hasEnded: boolean;
  /** A sala JÁ PODE ser aberta AGORA? (dono, 2026-07-29: "Acessar mentoria" em
   *  evento do dia seguinte). Corte = início − `ACCESS_WINDOW_MINUTES`, no
   *  relógio do banco; o fim da janela é o `hasEnded`. Dado torto ⇒ `true`, a
   *  favor do aluno — o mesmo fail-safe do estorno. */
  accessWindowOpen: boolean;
  cancelledAt: Date | null;
  /** `true` quando a migration 0012 não existe neste ambiente. */
  columnsMissing: boolean;
};

type EventRow = {
  id: number;
  title: string;
  status: string;
  event_kind: string | null;
  credit_cost: number | null;
  cancelled_at: Date | string | null;
  starts_at_ts: Date | string | null;
  refund_window_open: boolean | null;
  has_ended: boolean | null;
  access_window_open: boolean | null;
};

function isMissingColumn(error: unknown): boolean {
  return (error as { code?: string })?.code === "42703";
}

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string })?.code === "42P01";
}

function toDate(value: Date | string | null): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeKind(value: string | null): EventKind {
  return value === "mentoria_arkom" ? "mentoria_arkom" : "live_comunidade";
}

function mapEvent(row: EventRow, columnsMissing: boolean): EventCreditInfo {
  const kind = normalizeKind(row.event_kind);
  const rawCost = Number.isFinite(row.credit_cost) ? Number(row.credit_cost) : 0;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    kind,
    // Live NUNCA cobra, mesmo que a linha tenha custo (ex.: evento que nasceu
    // do DEFAULT 1 e foi marcado como live depois).
    cost: kind === "mentoria_arkom" ? Math.max(0, rawCost) : 0,
    rawCost: Math.max(0, rawCost),
    startsAt: toDate(row.starts_at_ts),
    refundWindowOpen: row.refund_window_open !== false,
    hasEnded: row.has_ended === true,
    accessWindowOpen: row.access_window_open !== false,
    cancelledAt: toDate(row.cancelled_at),
    columnsMissing,
  };
}

/**
 * Lê o evento com os dados de crédito. Degrada em ambientes sem a migration
 * 0012 (`app_arkom` de dev, por exemplo): cai numa consulta sem as colunas
 * novas e devolve `columnsMissing: true`, que força o modo OFF.
 */
export async function loadEventCredit(
  db: Executor,
  eventId: number,
): Promise<EventCreditInfo | null> {
  if (!Number.isInteger(eventId) || eventId <= 0) return null;

  // `event_date`/`starts_at` são TEXT ('YYYY-MM-DD' e 'HH:MM'). O instante só
  // é montado quando o formato bate; dado torto vira NULL (e janela de estorno
  // aberta — a favor do aluno) em vez de estourar um cast.
  try {
    const rows = await db<EventRow[]>`
      SELECT e.id, e.title, e.status, e.event_kind, e.credit_cost, e.cancelled_at,
             e.starts_at_ts,
             (e.starts_at_ts IS NULL
              OR now() < e.starts_at_ts - make_interval(mins => ${REFUND_WINDOW_MINUTES}::int))
               AS refund_window_open,
             (e.ends_at_ts IS NOT NULL AND now() > e.ends_at_ts) AS has_ended,
             (e.starts_at_ts IS NULL
              OR now() >= e.starts_at_ts - make_interval(mins => ${ACCESS_WINDOW_MINUTES}::int))
               AS access_window_open
        FROM (
          SELECT id, title, status, event_kind, credit_cost, cancelled_at,
                 CASE
                   WHEN event_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    AND starts_at ~ '^[0-9]{2}:[0-9]{2}'
                   THEN ((event_date || ' ' || substring(starts_at from 1 for 5))::timestamp
                           AT TIME ZONE ${EVENT_TIMEZONE})
                   ELSE NULL
                 END AS starts_at_ts,
                 CASE
                   WHEN event_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    AND ends_at ~ '^[0-9]{2}:[0-9]{2}'
                   THEN ((event_date || ' ' || substring(ends_at from 1 for 5))::timestamp
                           AT TIME ZONE ${EVENT_TIMEZONE})
                   WHEN event_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    AND starts_at ~ '^[0-9]{2}:[0-9]{2}'
                   THEN (((event_date || ' ' || substring(starts_at from 1 for 5))::timestamp
                           + interval '60 minutes') AT TIME ZONE ${EVENT_TIMEZONE})
                   ELSE NULL
                 END AS ends_at_ts
            FROM mentorship_events
           WHERE id = ${eventId}
        ) e
    `;
    return rows.length > 0 ? mapEvent(rows[0], false) : null;
  } catch (error) {
    if (!isMissingColumn(error) && !isMissingTable(error)) throw error;

    // Ambiente sem a 0012: segue o jogo sem sistema de créditos — mas os cortes
    // de TEMPO valem MESMO aqui ("encerrado" e "sala ainda fechada"):
    // event_date/starts_at/ends_at são colunas legadas, existem em todo
    // ambiente. Só o que depende de crédito é que degrada.
    const rows = await db<EventRow[]>`
      SELECT e.id, e.title, e.status,
             NULL::text AS event_kind,
             0::int AS credit_cost,
             NULL::timestamptz AS cancelled_at,
             e.starts_at_ts,
             TRUE AS refund_window_open,
             (e.ends_at_ts IS NOT NULL AND now() > e.ends_at_ts) AS has_ended,
             (e.starts_at_ts IS NULL
              OR now() >= e.starts_at_ts - make_interval(mins => ${ACCESS_WINDOW_MINUTES}::int))
               AS access_window_open
        FROM (
          SELECT id, title, status,
                 CASE
                   WHEN event_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    AND starts_at ~ '^[0-9]{2}:[0-9]{2}'
                   THEN ((event_date || ' ' || substring(starts_at from 1 for 5))::timestamp
                           AT TIME ZONE ${EVENT_TIMEZONE})
                   ELSE NULL
                 END AS starts_at_ts,
                 CASE
                   WHEN event_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    AND ends_at ~ '^[0-9]{2}:[0-9]{2}'
                   THEN ((event_date || ' ' || substring(ends_at from 1 for 5))::timestamp
                           AT TIME ZONE ${EVENT_TIMEZONE})
                   WHEN event_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    AND starts_at ~ '^[0-9]{2}:[0-9]{2}'
                   THEN (((event_date || ' ' || substring(starts_at from 1 for 5))::timestamp
                           + interval '60 minutes') AT TIME ZONE ${EVENT_TIMEZONE})
                   ELSE NULL
                 END AS ends_at_ts
            FROM mentorship_events
           WHERE id = ${eventId}
        ) e
    `;
    return rows.length > 0 ? mapEvent(rows[0], true) : null;
  }
}

// ---------------------------------------------------------------------------
// Modo vigente + política
// ---------------------------------------------------------------------------

export type CreditRuntime = {
  mode: CreditMode;
  policy: DebitPolicy;
  entitlementsEnabled: boolean;
  expirationEnforcement: boolean;
  /** Bloqueio pedido no /admin mas sem `entitlements_enabled` → vira sombra. */
  blockingDowngraded: boolean;
};

function readPolicy(scope: Record<string, unknown> | null): DebitPolicy {
  return scope?.policy === "on_participation" ? "on_participation" : "on_confirmation";
}

/** O estado das flags agora. Uma consulta só (o cache do módulo de flags). */
export async function getCreditRuntime(): Promise<CreditRuntime> {
  const [shadow, blocking, entitlementsEnabled, expirationEnforcement, scope] =
    await Promise.all([
      isFeatureEnabled("credit_shadow_mode"),
      isFeatureEnabled("credit_blocking_enabled"),
      isFeatureEnabled("entitlements_enabled"),
      isFeatureEnabled("expiration_enforcement"),
      getFlagScope("debit_policy"),
    ]);

  const enforce = blocking && entitlementsEnabled;
  const mode: CreditMode = enforce ? "enforce" : shadow || blocking ? "shadow" : "off";

  return {
    mode,
    policy: readPolicy(scope),
    entitlementsEnabled,
    expirationEnforcement,
    blockingDowngraded: blocking && !entitlementsEnabled,
  };
}

// ---------------------------------------------------------------------------
// A decisão
// ---------------------------------------------------------------------------

export type CreditDecision = {
  mode: CreditMode;
  policy: DebitPolicy;
  /** Veredito REAL — o que a regra diz, mesmo que a flag ainda não o aplique.
   *  É ele que vai para o diário de sombra. */
  verdict: CreditVerdict;
  /** Veredito que a flag vigente PODE aplicar (o `expirado` só conta com a
   *  `expiration_enforcement` ligada). É dele que sai a mensagem exibida. */
  verdictAplicado: CreditVerdict;
  /** A confirmação está barrada AGORA? Só em `enforce`. */
  blocked: boolean;
  /** Mensagem pt-BR do bloqueio (uma das três). `null` quando não bloqueia. */
  motivo: string | null;
  /** Esta confirmação deve lançar débito no ledger? */
  shouldDebit: boolean;
  /** Custo efetivo do evento (0 = live ou mentoria gratuita). */
  cost: number;
  /** Saldo no instante da decisão. `null` = ilimitado (ou modo OFF). */
  balance: number | null;
  unlimited: boolean;
  expired: boolean;
  planSlug: string | null;
  /** Resumo em uma linha para o diário de sombra e para o log do servidor. */
  detail: string;
};

const DECISAO_INERTE: CreditDecision = {
  mode: "off",
  policy: "on_confirmation",
  verdict: "allow",
  verdictAplicado: "allow",
  blocked: false,
  motivo: null,
  shouldDebit: false,
  cost: 0,
  balance: null,
  unlimited: true,
  expired: false,
  planSlug: null,
  detail: "sistema de créditos desligado",
};

/**
 * Avalia UMA confirmação de presença.
 *
 * Não escreve nada — só decide. Quem grava (ledger e diário de sombra) é o
 * chamador, dentro da transação da confirmação.
 */
export async function evaluateConfirmation(
  profileId: number,
  event: EventCreditInfo,
  runtime?: CreditRuntime,
): Promise<CreditDecision> {
  const rt = runtime ?? (await getCreditRuntime());

  // Porta 1: desligado, ou ambiente sem a migration ⇒ inerte.
  if (rt.mode === "off" || event.columnsMissing) {
    return { ...DECISAO_INERTE, policy: rt.policy };
  }

  const cost = event.cost;

  // Porta 2: live da comunidade (ou mentoria com custo zero) nunca cobra e
  // nunca bloqueia — nem se o aluno estiver com o plano vencido.
  if (cost <= 0) {
    return {
      ...DECISAO_INERTE,
      mode: rt.mode,
      policy: rt.policy,
      detail:
        event.kind === "live_comunidade"
          ? "live da comunidade: não consome crédito"
          : "mentoria com custo zero: não consome crédito",
    };
  }

  const leitura = await lerEntitlements(profileId);

  // BANCO INDISPONÍVEL: fail-open (erro nunca derruba a confirmação).
  if (!leitura.ok) {
    return {
      ...DECISAO_INERTE,
      mode: rt.mode,
      policy: rt.policy,
      cost,
      detail: "entitlements indisponíveis (erro de leitura): fail-open",
    };
  }

  const entitlements = leitura.entitlements;

  // SEM PLANO (leitura limpa): isso é informação, não falha — mentoria do
  // Arkom é "fora do plano" (furo achado pela suíte E2E v2: o fail-open
  // deixava aluno sem plano confirmar de graça). Saldo manual, se existir,
  // ainda cobre o custo.
  if (!entitlements) {
    const balance = await getCreditBalance(profileId);
    const verdict: CreditVerdict = balance < cost ? "evento_fora_do_plano" : "allow";
    const blocked = rt.mode === "enforce" && verdict !== "allow";
    return {
      mode: rt.mode,
      policy: rt.policy,
      verdict,
      verdictAplicado: verdict,
      blocked,
      motivo: blocked ? MENSAGENS_BLOQUEIO.evento_fora_do_plano : null,
      shouldDebit:
        rt.mode === "enforce" && rt.policy === "on_confirmation" && !blocked && cost > 0,
      cost,
      balance,
      unlimited: false,
      expired: false,
      planSlug: null,
      detail: `aluno sem plano · saldo ${balance}/${cost}`,
    };
  }

  const unlimited = entitlements.unlimitedCredits;
  const planSlug = entitlements.planSlug;

  if (unlimited) {
    return {
      mode: rt.mode,
      policy: rt.policy,
      verdict: "allow",
      verdictAplicado: "allow",
      blocked: false,
      motivo: null,
      shouldDebit: false, // ilimitado não consome saldo: nada a lançar
      cost,
      balance: null,
      unlimited: true,
      expired: entitlements.expired,
      planSlug,
      detail: `plano ${planSlug ?? "sem slug"}: mentorias ilimitadas`,
    };
  }

  const balance = await getCreditBalance(profileId);
  const expired = entitlements.expired;

  // "Fora do plano" ≠ "sem saldo": o primeiro é um plano que não contempla
  // mentorias (cota 0 ou dimensão quantitativa ausente); o segundo é quem
  // tinha cota e gastou. O suporte precisa distinguir os dois.
  const cotaDoPlano = entitlements.quantitative?.planMentorshipCredits ?? null;
  const semDireitoAMentoria =
    entitlements.quantitative === null ||
    (entitlements.quantitative.source === "plan" && cotaDoPlano === 0);

  let verdict: CreditVerdict = "allow";
  if (expired) verdict = "expirado";
  else if (semDireitoAMentoria && balance < cost) verdict = "evento_fora_do_plano";
  else if (balance < cost) verdict = "saldo_zero";

  // Qual veredito PODE bloquear agora. `expirado` só vale quando a Tarefa 4
  // (flag `expiration_enforcement`) estiver ligada; até lá, um aluno vencido
  // ainda pode confirmar se tiver saldo — e a sombra registra o veredito real.
  let verdictAplicavel: CreditVerdict = "allow";
  if (expired && rt.expirationEnforcement) verdictAplicavel = "expirado";
  else if (semDireitoAMentoria && balance < cost) verdictAplicavel = "evento_fora_do_plano";
  else if (balance < cost) verdictAplicavel = "saldo_zero";

  const blocked = rt.mode === "enforce" && verdictAplicavel !== "allow";
  // saldo_zero com saldo PARCIAL fala em custo × saldo; só o zerado de verdade
  // ouve que "acabaram" (senão o toast contradiz o contador na tela).
  const motivo = blocked
    ? verdictAplicavel === "saldo_zero" && balance > 0
      ? mensagemSaldoInsuficiente(cost, balance)
      : MENSAGENS_BLOQUEIO[verdictAplicavel as Exclude<CreditVerdict, "allow">]
    : null;

  const partes = [
    `plano ${planSlug ?? "sem slug"}`,
    `saldo ${balance}/${cost}`,
    cotaDoPlano === null ? "cota manual" : `cota ${cotaDoPlano}`,
  ];
  if (expired) {
    partes.push(
      rt.expirationEnforcement
        ? `vencido em ${entitlements.expiresAt ?? "?"}`
        : `vencido em ${entitlements.expiresAt ?? "?"} (prazo ainda não aplicado)`,
    );
  }

  return {
    mode: rt.mode,
    policy: rt.policy,
    verdict,
    verdictAplicado: verdictAplicavel,
    blocked,
    motivo,
    shouldDebit:
      rt.mode === "enforce" && rt.policy === "on_confirmation" && !blocked && cost > 0,
    cost,
    balance,
    unlimited: false,
    expired,
    planSlug,
    detail: partes.join(" · "),
  };
}

// ---------------------------------------------------------------------------
// Chaves de idempotência
// ---------------------------------------------------------------------------
//
// O toggle de presença é reversível, e é isso que torna a chave delicada:
//
//   · confirmar duas vezes (duplo clique, retry, duas abas) = UM débito → a
//     chave do débito NÃO pode variar dentro do mesmo ciclo;
//   · confirmar → desconfirmar (estorno) → confirmar de novo tem de cobrar de
//     novo → a chave do débito PRECISA variar entre ciclos, senão o aluno
//     ganha assento de graça (e, com o estorno seguinte, crédito do nada).
//
// A saída é numerar o ciclo pela quantidade de estornos já feitos naquele par
// (evento, aluno): o ciclo 0 é `confirm:evt=45:perfil=12:c=0`; depois de um
// estorno, a confirmação seguinte vira `...:c=1`. Contas feitas sob o mesmo
// advisory lock por perfil que o ledger usa, então duas requisições
// simultâneas leem o mesmo número e caem na mesma chave — uma grava, a outra
// recebe `duplicated`.

const LEDGER_LOCK_NAMESPACE = 424_211;

export function debitOperationKey(
  eventId: number,
  profileId: number,
  cycle: number,
): string {
  return `confirm:evt=${eventId}:perfil=${profileId}:c=${cycle}`;
}

export function refundOperationKey(
  eventId: number,
  profileId: number,
  sequence: number,
): string {
  return `refund:evt=${eventId}:perfil=${profileId}:n=${sequence}`;
}

export function participationOperationKey(eventId: number, profileId: number): string {
  return `participation:evt=${eventId}:perfil=${profileId}`;
}

export type EventLedgerCounts = {
  debits: number;
  refunds: number;
  /** Total já debitado neste par (positivo). */
  debited: number;
  /** Total já estornado neste par (positivo). */
  refunded: number;
  /** Quanto ainda está "pago" e passível de estorno (nunca negativo). */
  outstanding: number;
};

/** Trava o perfil pela transação inteira. Reentrante: o ledger pega a mesma. */
export async function lockProfileLedger(db: Executor, profileId: number): Promise<void> {
  await db`SELECT pg_advisory_xact_lock(${LEDGER_LOCK_NAMESPACE}::int, ${profileId}::int)`;
}

/**
 * O que este par (evento, aluno) já movimentou no ledger. O estorno devolve o
 * que FOI debitado, não o custo atual do evento — o /admin pode ter mudado o
 * `credit_cost` depois da confirmação, e o aluno não paga (nem recebe) essa
 * diferença.
 */
export async function countEventMovements(
  db: Executor,
  eventId: number,
  profileId: number,
): Promise<EventLedgerCounts> {
  const [row] = await db<
    { debits: number; refunds: number; debited: number; refunded: number }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE reason = 'event_debit')::int   AS debits,
      COUNT(*) FILTER (WHERE reason = 'event_refund')::int  AS refunds,
      COALESCE(-SUM(delta) FILTER (WHERE reason = 'event_debit'), 0)::int  AS debited,
      COALESCE(SUM(delta)  FILTER (WHERE reason = 'event_refund'), 0)::int AS refunded
      FROM credit_ledger
     WHERE event_id = ${eventId} AND profile_id = ${profileId}
  `;
  const debits = row?.debits ?? 0;
  const refunds = row?.refunds ?? 0;
  const debited = row?.debited ?? 0;
  const refunded = row?.refunded ?? 0;
  return {
    debits,
    refunds,
    debited,
    refunded,
    outstanding: Math.max(0, debited - refunded),
  };
}

// ---------------------------------------------------------------------------
// Diário de sombra
// ---------------------------------------------------------------------------

export type ShadowLogInput = {
  profileId: number;
  event: EventCreditInfo;
  action: "confirm" | "unconfirm";
  mode: Exclude<CreditMode, "off">;
  policy: DebitPolicy;
  verdict: ShadowVerdict;
  /** O veredito valeu de verdade (bloqueou/debitou/estornou)? */
  enforced: boolean;
  cost: number;
  balance: number | null;
  unlimited: boolean;
  planSlug: string | null;
  detail: string;
};

/** Veredito de confirmação → linha do diário. */
export function shadowVerdictOf(verdict: CreditVerdict): ShadowVerdict {
  return VERDICT_TO_SHADOW[verdict];
}

/**
 * Grava a decisão no `credit_shadow_log`. Chamado DENTRO da transação da
 * confirmação (o diário e o efeito têm de contar a mesma história).
 * PROPAGA erro — mas só é chamado quando `mode !== 'off'`, o que já exige a
 * migration 0012 aplicada (o modo cai para OFF quando as colunas não existem).
 */
export async function logShadowDecision(
  db: Executor,
  input: ShadowLogInput,
): Promise<void> {
  await db`
    INSERT INTO credit_shadow_log
      (profile_id, event_id, event_title, event_kind, action, mode, policy,
       verdict, enforced, credit_cost, balance_before, unlimited, plan_slug, detail)
    VALUES
      (${input.profileId}, ${input.event.id}, ${input.event.title}, ${input.event.kind},
       ${input.action}, ${input.mode}, ${input.policy}, ${input.verdict},
       ${input.enforced}, ${input.cost}, ${input.balance}, ${input.unlimited},
       ${input.planSlug}, ${input.detail})
  `;
}

// ---------------------------------------------------------------------------
// Política `on_participation` — o gancho da Tarefa 2
// ---------------------------------------------------------------------------

export type ParticipationDebitResult =
  | { ok: true; skipped: true; reason: string; balance: number | null }
  | { ok: true; skipped: false; duplicated: boolean; balance: number }
  | { ok: false; error: string; code: string };

/**
 * Debita o crédito de UMA participação — o gancho que a Tarefa 2 (mentor marca
 * presença) vai chamar quando `debit_policy` for `on_participation`.
 *
 * Idempotente por `participation:evt=…:perfil=…`: marcar presença duas vezes,
 * ou marcar → desmarcar → marcar, debita uma vez só. Não estorna (desmarcar
 * presença é correção do mentor; o estorno correspondente é decisão do /admin,
 * com motivo, como qualquer movimento compensatório).
 *
 * Inerte quando: a política é `on_confirmation`, o bloqueio está desligado, o
 * evento é live/custo zero, o plano é ilimitado ou o aluno não tem entitlement.
 */
export async function debitForParticipation(
  eventId: number,
  profileId: number,
): Promise<ParticipationDebitResult> {
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return { ok: false, error: "Evento inválido.", code: "invalid_input" };
  }
  if (!Number.isInteger(profileId) || profileId <= 0) {
    return { ok: false, error: "Aluno inválido.", code: "invalid_input" };
  }

  const runtime = await getCreditRuntime();
  if (runtime.policy !== "on_participation") {
    return {
      ok: true,
      skipped: true,
      reason: "política vigente é on_confirmation — o débito já aconteceu na confirmação",
      balance: null,
    };
  }
  if (runtime.mode !== "enforce") {
    return {
      ok: true,
      skipped: true,
      reason: "bloqueio de créditos desligado — presença marcada sem débito",
      balance: null,
    };
  }

  const sql = getSql();
  const event = await loadEventCredit(sql, eventId);
  if (!event) return { ok: false, error: "Mentoria não encontrada.", code: "not_found" };
  if (event.columnsMissing || event.cost <= 0) {
    return {
      ok: true,
      skipped: true,
      reason: "evento não consome crédito",
      balance: null,
    };
  }

  const entitlements = await getEntitlements(profileId);
  if (!entitlements || entitlements.unlimitedCredits) {
    return {
      ok: true,
      skipped: true,
      reason: "plano ilimitado ou aluno sem entitlement",
      balance: null,
    };
  }

  const resultado: LedgerResult = await debitCredit({
    profileId,
    amount: event.cost,
    operationKey: participationOperationKey(eventId, profileId),
    reason: "event_debit",
    note: `Participação em "${event.title}"`,
    ref: `evento:${eventId}`,
    eventId,
    // Presença JÁ aconteceu: não se recusa o registro por saldo (o saldo pode
    // ficar negativo e o /admin resolve). Bloquear aqui reescreveria o
    // passado; a política `on_participation` cobra pelo que foi consumido.
    enforceBalance: false,
  });

  if (!resultado.ok) {
    return { ok: false, error: resultado.error, code: resultado.code };
  }
  return {
    ok: true,
    skipped: false,
    duplicated: resultado.duplicated,
    balance: resultado.balance,
  };
}

// ---------------------------------------------------------------------------
// Saldo para a UI do aluno
// ---------------------------------------------------------------------------

export type StudentCreditSummary = {
  /** Mostrar saldo/custo na interface? (`entitlements_enabled` ligada) */
  visible: boolean;
  balance: number;
  unlimited: boolean;
  /** Cota de mentorias do plano (o "Y" do contador X/Y). `null` = ilimitado ou sem plano. */
  quota: number | null;
  planName: string | null;
  expired: boolean;
  /** Créditos valendo de verdade (o botão pode barrar). */
  enforcing: boolean;
};

const RESUMO_OCULTO: StudentCreditSummary = {
  visible: false,
  balance: 0,
  unlimited: true,
  quota: null,
  planName: null,
  expired: false,
  enforcing: false,
};

/**
 * O resumo que a página de mentorias mostra ANTES do clique — para o aluno
 * nunca descobrir que não tem crédito depois de tentar. Fora do ar quando
 * `entitlements_enabled` está desligada (UI idêntica à de hoje).
 */
export async function getStudentCreditSummary(
  profileId: number,
): Promise<StudentCreditSummary> {
  const [entitlementsEnabled, blocking] = await Promise.all([
    isFeatureEnabled("entitlements_enabled"),
    isFeatureEnabled("credit_blocking_enabled"),
  ]);
  if (!entitlementsEnabled) return RESUMO_OCULTO;

  const entitlements = await getEntitlements(profileId);
  if (!entitlements) return RESUMO_OCULTO;

  if (entitlements.unlimitedCredits) {
    return {
      visible: true,
      balance: 0,
      unlimited: true,
      quota: null,
      planName: entitlements.planName,
      expired: entitlements.expired,
      enforcing: blocking,
    };
  }

  return {
    visible: true,
    balance: await getCreditBalance(profileId),
    unlimited: false,
    quota: entitlements.mentorshipCredits,
    planName: entitlements.planName,
    expired: entitlements.expired,
    enforcing: blocking,
  };
}
