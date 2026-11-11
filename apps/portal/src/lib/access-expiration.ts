// lib/access-expiration.ts — prazo de acesso em operação (Tarefa 4). Server-only.
//
// Três coisas moram aqui:
//   1. O RELATÓRIO DE VENCIMENTOS — a ferramenta de renovação da Carol: quem
//      vence, quando, em quantos dias, em janelas de 30/60/90 dias.
//   2. O JOB DE EXPIRAÇÃO idempotente — recalcula os estados derivados, grava
//      o resumo do dia em `expiration_runs` (0015) e alimenta o alerta
//      antecipado. Rodar duas vezes com o mesmo estado não escreve nada.
//   3. A PORTA DE CONSUMO — a mensagem de renovação e o veredito que barra
//      ações NOVAS do aluno vencido (nunca as já feitas).
//
// ─── O QUE ESTE MÓDULO NUNCA FAZ ──────────────────────────────────────────
//   · NUNCA escreve em `profile_entitlements`. "Expirado" é DERIVADO
//     (`expires_at <= now()`), e materializar o status faria o aluno vencido
//     voltar a parecer sem prazo — `getEntitlements` só lê linhas ativas.
//   · NUNCA toca `event_confirmations`, `lesson_progress` nem
//     `profiles.session_version`. Ligar a flag NÃO desconfirma presença, não
//     apaga progresso e não derruba sessão: o prazo barra o que vem DEPOIS
//     (X2 — ninguém é cortado no meio de uma mentoria em andamento).
//   · NUNCA usa `profiles.status='blocked'` para expirado: `blocked` revoga o
//     login inteiro; expirado continua entrando, vendo catálogo (X1) e o
//     próprio progresso (X3).
//
// ─── FAIL-SAFE ────────────────────────────────────────────────────────────
// Erro de banco, migration ausente (42P01) ou perfil sem prazo ⇒ NÃO bloqueia
// e o relatório degrada com aviso. Prazo mal lido não tranca aluno fora.

import { getSql } from "@/lib/db";
import {
  getAccessStatus,
  getExpirationConfig,
  isExpirationEnforced,
  type AccessState,
  type AccessStatus,
  type EntitlementSource,
} from "@/lib/entitlements";
import { MENSAGEM_EXPIRADO } from "@/lib/credit-policy";

if (typeof window !== "undefined") {
  throw new Error("lib/access-expiration.ts importado no browser — server-only");
}

/** Fuso de referência do produto (o mesmo do calendário e do credit-policy). */
const TIMEZONE = "America/Sao_Paulo";

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string })?.code === "42P01";
}

// ---------------------------------------------------------------------------
// As mensagens de renovação (pt-BR)
// ---------------------------------------------------------------------------
//
// São DUAS, e distintas de propósito: o suporte reconhece o caso pela frase.
// A de mentoria é a mesma constante da Tarefa 1 (`MENSAGEM_EXPIRADO`) — uma
// frase só, um lugar só. Mudou alguma? Atualize
// docs/credit-system/runbook-mensagens.md no mesmo commit.

/** Vencido tentando confirmar presença em mentoria. */
export const MENSAGEM_RENOVACAO_MENTORIA = MENSAGEM_EXPIRADO;

/** Vencido tentando consumir aula NOVA (marcar conclusão). */
export const MENSAGEM_RENOVACAO_AULA =
  "Seu acesso está vencido. O catálogo e as aulas que você já concluiu continuam aí, mas registrar o progresso de uma aula nova exige um plano dentro da validade — fale com o suporte do Arkom para renovar.";

// ---------------------------------------------------------------------------
// A porta de consumo
// ---------------------------------------------------------------------------

export type ConsumptionSurface = "mentoria" | "aula";

export type ExpirationGate = {
  /** A ação nova está barrada AGORA? Só com `expiration_enforcement` ligada. */
  blocked: boolean;
  /** Mensagem pt-BR de renovação. `null` quando não bloqueia. */
  message: string | null;
  /** O estado derivado do prazo (independe de flag). */
  status: AccessStatus | null;
};

const PORTA_ABERTA: ExpirationGate = { blocked: false, message: null, status: null };

/**
 * O aluno pode consumir isto agora?
 *
 * `expiration_enforcement` (+ `entitlements_enabled`) desligada ⇒ SEMPRE
 * liberado, sem nem ler o entitlement: flag desligada é comportamento idêntico
 * ao de hoje, inclusive no custo de uma request.
 *
 * Vale só para ações NOVAS. Nada aqui desfaz confirmação, progresso ou sessão
 * que já existem (X2).
 */
export async function checkExpirationForConsumption(
  profileId: number,
  surface: ConsumptionSurface,
): Promise<ExpirationGate> {
  if (!Number.isInteger(profileId) || profileId <= 0) return PORTA_ABERTA;
  if (!(await isExpirationEnforced())) return PORTA_ABERTA;

  const status = await getAccessStatus(profileId);
  if (status.state !== "expirado") return { blocked: false, message: null, status };

  return {
    blocked: true,
    message:
      surface === "mentoria" ? MENSAGEM_RENOVACAO_MENTORIA : MENSAGEM_RENOVACAO_AULA,
    status,
  };
}

// ---------------------------------------------------------------------------
// O relatório de vencimentos
// ---------------------------------------------------------------------------

export type ExpirationRow = {
  profileId: number;
  fullName: string;
  email: string;
  profileStatus: "active" | "blocked";
  planId: number | null;
  planName: string | null;
  planSlug: string | null;
  /** De onde veio o prazo: do plano ou definido à mão pelo /admin. */
  source: EntitlementSource;
  /** Fim da validade, ISO. */
  expiresAt: string;
  /** dd/mm/aaaa, formatado no banco no fuso do produto. */
  expiresAtLabel: string;
  /** Dias corridos até vencer. Negativo = venceu há N dias. */
  daysRemaining: number;
  state: AccessState;
  /** Motivo do prazo definido à mão (auditoria). */
  reason: string | null;
  grantedByLabel: string | null;
  grantedAtLabel: string | null;
};

type ExpirationDbRow = {
  profile_id: number;
  full_name: string;
  email: string;
  profile_status: "active" | "blocked";
  plan_id: number | null;
  plan_name: string | null;
  plan_slug: string | null;
  source: EntitlementSource;
  expires_at: Date | string;
  expires_at_label: string;
  days_remaining: number;
  expirado: boolean;
  reason: string | null;
  granted_by_label: string | null;
  granted_at_label: string | null;
};

export type ExpirationJanela = { dias: number; total: number };

export type ExpirationSummary = {
  /** Perfis não excluídos COM prazo definido. */
  comPrazo: number;
  /** Com prazo, dentro da validade e fora da janela de alerta. */
  ativos: number;
  /** Vencem em até `leadDays` dias. */
  expirando: number;
  /** Já venceram. */
  expirados: number;
  /** Perfis não excluídos SEM prazo nenhum (hoje: todos). */
  semPrazo: number;
  /** Total de perfis não excluídos. */
  totalPerfis: number;
  /** Quantos vencem dentro de cada janela (cumulativo, sem contar os vencidos). */
  janelas: ExpirationJanela[];
};

export type ExpirationRun = {
  runKey: string;
  source: string;
  leadDays: number;
  comPrazo: number;
  ativos: number;
  expirando: number;
  expirados: number;
  ranAtLabel: string;
  ranBy: string | null;
};

export type ExpirationReport = {
  rows: ExpirationRow[];
  resumo: ExpirationSummary;
  leadDays: number;
  windows: number[];
  /** `true` = a flag `expiration_enforcement` está ligada (o prazo barra). */
  enforced: boolean;
  /** `true` = tabelas de entitlements ausentes (migration 0011). */
  migrationMissing: boolean;
  /** Última execução do job. `null` = nunca rodou (ou 0015 ausente). */
  ultimaExecucao: ExpirationRun | null;
};

/**
 * Toda linha temporal ATIVA com data definida, de perfil não excluído.
 *
 * O filtro `(source = 'manual' OR NOT permissive)` espelha exatamente a
 * precedência de `getEntitlements`: plano permissivo não tem prazo, MAS um
 * prazo definido à mão vence a permissividade (é o aluno "Legado" que ganhou
 * contrato com validade).
 *
 * Dias e rótulo saem do BANCO, no fuso do produto: o servidor roda em UTC e
 * "faltam 2 dias" calculado em UTC erra por 3 horas todo fim de dia.
 */
async function fetchExpirationRows(): Promise<ExpirationDbRow[]> {
  const sql = getSql();
  return await sql<ExpirationDbRow[]>`
    SELECT e.profile_id,
           p.full_name,
           p.email,
           p.status AS profile_status,
           e.plan_id,
           pl.name AS plan_name,
           pl.slug AS plan_slug,
           e.source,
           e.expires_at,
           to_char(e.expires_at AT TIME ZONE ${TIMEZONE}, 'DD/MM/YYYY') AS expires_at_label,
           ((e.expires_at AT TIME ZONE ${TIMEZONE})::date
             - (now() AT TIME ZONE ${TIMEZONE})::date)::int AS days_remaining,
           (e.expires_at <= now()) AS expirado,
           e.reason,
           e.granted_by_label,
           to_char(e.granted_at AT TIME ZONE ${TIMEZONE}, 'DD/MM/YYYY HH24:MI')
             AS granted_at_label
      FROM profile_entitlements e
      JOIN profiles p ON p.id = e.profile_id
      LEFT JOIN plans pl ON pl.id = e.plan_id
     WHERE e.kind = 'temporal'
       AND e.status = 'active'
       AND e.expires_at IS NOT NULL
       AND p.status <> 'deleted'
       AND (e.source = 'manual' OR COALESCE(pl.permissive, false) = false)
     ORDER BY e.expires_at, p.full_name
  `;
}

function mapRow(row: ExpirationDbRow, leadDays: number): ExpirationRow {
  const state: AccessState = row.expirado
    ? "expirado"
    : row.days_remaining <= leadDays
      ? "expirando"
      : "ativo";
  return {
    profileId: row.profile_id,
    fullName: row.full_name,
    email: row.email,
    profileStatus: row.profile_status,
    planId: row.plan_id,
    planName: row.plan_name,
    planSlug: row.plan_slug,
    source: row.source,
    expiresAt:
      row.expires_at instanceof Date
        ? row.expires_at.toISOString()
        : String(row.expires_at),
    expiresAtLabel: row.expires_at_label,
    daysRemaining: row.days_remaining,
    state,
    reason: row.reason,
    grantedByLabel: row.granted_by_label,
    grantedAtLabel: row.granted_at_label,
  };
}

function resumir(
  rows: ExpirationRow[],
  windows: number[],
  totalPerfis: number,
): ExpirationSummary {
  const expirados = rows.filter((row) => row.state === "expirado").length;
  const expirando = rows.filter((row) => row.state === "expirando").length;
  const ativos = rows.filter((row) => row.state === "ativo").length;
  return {
    comPrazo: rows.length,
    ativos,
    expirando,
    expirados,
    semPrazo: Math.max(0, totalPerfis - rows.length),
    totalPerfis,
    janelas: windows.map((dias) => ({
      dias,
      total: rows.filter(
        (row) => row.state !== "expirado" && row.daysRemaining <= dias,
      ).length,
    })),
  };
}

/** Última execução do job. `null` = nunca rodou ou migration 0015 ausente. */
export async function getLastExpirationRun(): Promise<ExpirationRun | null> {
  try {
    const sql = getSql();
    const [row] = await sql<
      {
        run_key: string;
        source: string;
        lead_days: number;
        total_com_prazo: number;
        total_ativos: number;
        total_expirando: number;
        total_expirados: number;
        ran_at_label: string;
        ran_by: string | null;
      }[]
    >`
      SELECT run_key, source, lead_days, total_com_prazo, total_ativos,
             total_expirando, total_expirados, ran_by,
             to_char(ran_at AT TIME ZONE ${TIMEZONE}, 'DD/MM/YYYY HH24:MI')
               AS ran_at_label
        FROM expiration_runs
       ORDER BY ran_at DESC
       LIMIT 1
    `;
    if (!row) return null;
    return {
      runKey: row.run_key,
      source: row.source,
      leadDays: row.lead_days,
      comPrazo: row.total_com_prazo,
      ativos: row.total_ativos,
      expirando: row.total_expirando,
      expirados: row.total_expirados,
      ranAtLabel: row.ran_at_label,
      ranBy: row.ran_by,
    };
  } catch (error) {
    if (!isMissingTable(error)) {
      console.error("[arkom] Falha ao ler a última execução do job de expiração:", error);
    }
    return null;
  }
}

/**
 * O relatório inteiro. Nunca lança: banco fora do ar ou migration ausente
 * devolvem relatório vazio com `migrationMissing`.
 */
export async function loadExpirationReport(): Promise<ExpirationReport> {
  const config = await getExpirationConfig();
  const enforced = await isExpirationEnforced();

  const vazio: ExpirationReport = {
    rows: [],
    resumo: {
      comPrazo: 0,
      ativos: 0,
      expirando: 0,
      expirados: 0,
      semPrazo: 0,
      totalPerfis: 0,
      janelas: config.windows.map((dias) => ({ dias, total: 0 })),
    },
    leadDays: config.leadDays,
    windows: config.windows,
    enforced,
    migrationMissing: false,
    ultimaExecucao: null,
  };

  try {
    const sql = getSql();
    const [linhas, [{ total }]] = await Promise.all([
      fetchExpirationRows(),
      sql<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM profiles WHERE status <> 'deleted'
      `,
    ]);
    const rows = linhas.map((row) => mapRow(row, config.leadDays));
    return {
      ...vazio,
      rows,
      resumo: resumir(rows, config.windows, total),
      ultimaExecucao: await getLastExpirationRun(),
    };
  } catch (error) {
    if (isMissingTable(error)) {
      console.warn(
        "[arkom] Relatório de vencimentos: tabelas de entitlements ausentes (migration 0011) — relatório vazio.",
      );
      return { ...vazio, migrationMissing: true };
    }
    console.error("[arkom] Falha ao montar o relatório de vencimentos:", error);
    return vazio;
  }
}

// ---------------------------------------------------------------------------
// O job de expiração (idempotente)
// ---------------------------------------------------------------------------
//
// Pronto para um cron: `runExpirationJob({ source: 'cron' })`. Hoje o Railway
// deste serviço não tem agendador, então quem dispara é o botão "Processar
// expirações" do relatório. Ligar um cron no futuro é só chamar esta função —
// nada aqui depende de sessão, de request ou de UI.

export type ExpirationJobSource = "admin" | "cron" | "api";

export type ExpirationJobResult =
  | {
      ok: true;
      /** '<origem>:<AAAA-MM-DD>' — a chave de idempotência do dia. */
      runKey: string;
      /** `false` = os números do dia não mudaram e NADA foi escrito. */
      changed: boolean;
      resumo: ExpirationSummary;
      leadDays: number;
      /** Quem venceu (perfis), para o alerta e para o log. */
      expirados: ExpirationRow[];
      /** Quem vence dentro da janela de alerta. */
      expirando: ExpirationRow[];
    }
  | { ok: false; error: string; code: "migration_missing" | "db_error" };

/**
 * Recalcula os estados derivados, registra o resumo do dia e devolve o alerta
 * antecipado. NÃO altera entitlement nenhum — de propósito (ver o cabeçalho).
 *
 * Idempotente por `run_key = '<origem>:<AAAA-MM-DD>'`: a segunda execução do
 * mesmo dia com o mesmo estado do banco não escreve **nada** (o `DO UPDATE`
 * tem `WHERE ... IS DISTINCT FROM ...`), não cria linha nova e devolve
 * `changed: false`.
 */
export async function runExpirationJob(options?: {
  source?: ExpirationJobSource;
  /** Quem disparou (e-mail do admin). `null` = sistema/cron. */
  actorLabel?: string | null;
}): Promise<ExpirationJobResult> {
  const source: ExpirationJobSource = options?.source ?? "admin";
  const actorLabel = options?.actorLabel?.trim() || null;
  const config = await getExpirationConfig();

  let rows: ExpirationRow[];
  let totalPerfis: number;
  try {
    const sql = getSql();
    const [linhas, [{ total }]] = await Promise.all([
      fetchExpirationRows(),
      sql<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM profiles WHERE status <> 'deleted'
      `,
    ]);
    rows = linhas.map((row) => mapRow(row, config.leadDays));
    totalPerfis = total;
  } catch (error) {
    if (isMissingTable(error)) {
      return {
        ok: false,
        code: "migration_missing",
        error:
          "Tabelas de planos ausentes. Aplique db/migrations/0011-entitlements-core.sql neste ambiente.",
      };
    }
    console.error("[arkom] Job de expiração: falha ao ler os entitlements:", error);
    return {
      ok: false,
      code: "db_error",
      error: "Não foi possível ler os prazos de acesso. Tente novamente.",
    };
  }

  const resumo = resumir(rows, config.windows, totalPerfis);
  const expirados = rows.filter((row) => row.state === "expirado");
  const expirando = rows.filter((row) => row.state === "expirando");

  // Só IDs no diário: nome e e-mail moram em `profiles` e não precisam de
  // segunda cópia num log.
  const detail = {
    janelas: Object.fromEntries(resumo.janelas.map((j) => [String(j.dias), j.total])),
    expirados: expirados.map((row) => row.profileId).sort((a, b) => a - b),
    expirando: expirando.map((row) => row.profileId).sort((a, b) => a - b),
  };

  try {
    const sql = getSql();
    // `gravadas = 0` significa que o ON CONFLICT caiu no WHERE: nada mudou e
    // NADA foi escrito (nem `updated_at`). É a prova de idempotência do job.
    const [execucao] = await sql<{ run_key: string; gravadas: number }[]>`
      WITH chave AS (
        SELECT ${source} || ':' ||
               to_char(now() AT TIME ZONE ${TIMEZONE}, 'YYYY-MM-DD') AS run_key
      ),
      gravado AS (
        INSERT INTO expiration_runs
          (run_key, source, lead_days, total_com_prazo, total_ativos,
           total_expirando, total_expirados, detail, ran_by)
        SELECT chave.run_key, ${source}, ${config.leadDays}, ${resumo.comPrazo},
               ${resumo.ativos}, ${resumo.expirando}, ${resumo.expirados},
               ${JSON.stringify(detail)}::jsonb, ${actorLabel}
          FROM chave
        ON CONFLICT (run_key) DO UPDATE
           SET lead_days       = excluded.lead_days,
               total_com_prazo = excluded.total_com_prazo,
               total_ativos    = excluded.total_ativos,
               total_expirando = excluded.total_expirando,
               total_expirados = excluded.total_expirados,
               detail          = excluded.detail,
               updated_at      = now()
         WHERE (expiration_runs.lead_days, expiration_runs.total_com_prazo,
                expiration_runs.total_ativos, expiration_runs.total_expirando,
                expiration_runs.total_expirados, expiration_runs.detail)
           IS DISTINCT FROM
               (excluded.lead_days, excluded.total_com_prazo,
                excluded.total_ativos, excluded.total_expirando,
                excluded.total_expirados, excluded.detail)
        RETURNING run_key
      )
      SELECT chave.run_key, (SELECT COUNT(*) FROM gravado)::int AS gravadas
        FROM chave
    `;

    return {
      ok: true,
      runKey: execucao.run_key,
      changed: execucao.gravadas > 0,
      resumo,
      leadDays: config.leadDays,
      expirados,
      expirando,
    };
  } catch (error) {
    if (isMissingTable(error)) {
      return {
        ok: false,
        code: "migration_missing",
        error:
          "Tabela expiration_runs ausente. Aplique db/migrations/0015-access-expiration.sql neste ambiente.",
      };
    }
    console.error("[arkom] Job de expiração: falha ao registrar a execução:", error);
    return {
      ok: false,
      code: "db_error",
      error: "Não foi possível registrar a execução. Tente novamente.",
    };
  }
}
