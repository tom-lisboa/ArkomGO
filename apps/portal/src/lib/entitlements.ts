// lib/entitlements.ts — leitura dos entitlements por perfil, server-only.
//
// Fonte: `plans`, `plan_course_access`, `profile_entitlements` e `credit_ledger`
// (migration 0011-entitlements-core.sql).
//
// Por que existe: até aqui o app só tinha o entitlement provisório
// `isPro = role === 'admin'` (src/app/api/auth/_shared.ts e src/app/layout.tsx).
// Este módulo é a fonte única do direito real de cada perfil — plano, catálogo,
// prazo e saldo de créditos.
//
// Contrato de segurança (o mesmo da fundação de flags):
//   · ATRÁS DA FLAG `entitlements_enabled`. Desligada ⇒ TODAS as funções
//     devolvem exatamente o comportamento de hoje (isPro só para admin,
//     catálogo aberto). Ligada ⇒ o direito passa a vir do plano.
//   · FAIL-SAFE — erro de banco, tabela ausente (42P01) ou perfil sem plano
//     caem no comportamento LEGADO, nunca em "bloqueado". Nada aqui derruba
//     uma página nem tranca aluno fora do produto por um blip de conexão.
//   · SEM CACHE próprio. Quem cacheia é a camada de flags; o entitlement é lido
//     por request (as páginas do app já são `force-dynamic`).
//
// ⚠ SALDO NUNCA É COLUNA. `getCreditBalance` soma o ledger, sempre.
// ⚠ EXPIRADO NUNCA É COLUNA. `getAccessStatus` compara `expires_at` com agora
//   (ver a seção "Prazo de acesso" no fim do arquivo). Antecedência do alerta
//   vem do escopo da flag `expiration_enforcement` (migration 0015).

import { getSql } from "@/lib/db";
import { getFlagScope, isFeatureEnabled } from "@/lib/feature-flags";

if (typeof window !== "undefined") {
  throw new Error("lib/entitlements.ts importado no browser — server-only");
}

export type EntitlementKind = "temporal" | "quantitative" | "catalog";
export type EntitlementSource = "plan" | "manual";
export type EntitlementStatus = "active" | "expired" | "revoked";
export type CreditPeriod = "month" | "total";

/** Uma dimensão do direito do perfil, já com os dados do plano de origem. */
export type EntitlementRow = {
  id: number;
  kind: EntitlementKind;
  source: EntitlementSource;
  status: EntitlementStatus;
  startsAt: string | null;
  expiresAt: string | null;
  reason: string | null;
  planId: number | null;
  planSlug: string | null;
  planName: string | null;
  planPermissive: boolean;
  planDurationMonths: number | null;
  planMentorshipCredits: number | null;
  planCreditPeriod: CreditPeriod | null;
};

/** O direito consolidado de um perfil (as 3 dimensões + o resumo do plano). */
export type ProfileEntitlements = {
  profileId: number;
  planId: number | null;
  planSlug: string | null;
  planName: string | null;
  /** Plano permissivo: catálogo inteiro, mentorias ilimitadas, sem prazo. */
  permissive: boolean;
  /** Cota de mentorias do plano. `null` quando ilimitado ou sem plano. */
  mentorshipCredits: number | null;
  creditPeriod: CreditPeriod | null;
  unlimitedCredits: boolean;
  /** Fim da validade, ISO. `null` = sem prazo. */
  expiresAt: string | null;
  expired: boolean;
  temporal: EntitlementRow | null;
  quantitative: EntitlementRow | null;
  catalog: EntitlementRow | null;
  rows: EntitlementRow[];
};

type EntitlementDbRow = {
  id: number;
  kind: EntitlementKind;
  source: EntitlementSource;
  status: EntitlementStatus;
  starts_at: Date | string | null;
  expires_at: Date | string | null;
  reason: string | null;
  plan_id: number | null;
  plan_slug: string | null;
  plan_name: string | null;
  plan_permissive: boolean | null;
  plan_duration_months: number | null;
  plan_mentorship_credits: number | null;
  plan_credit_period: CreditPeriod | null;
};

/** timestamptz do driver (Date) ou texto → ISO. */
function toIso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string })?.code === "42P01";
}

/** Coluna ausente — ambiente sem a 0016 (`plans.apps_included`). Degrada igual
 *  a tabela ausente: o direito é lido como "libera", nunca como "bloqueia". */
function isMissingColumn(error: unknown): boolean {
  return (error as { code?: string })?.code === "42703";
}

/** Loga sem estourar. Tabela ausente é aviso (ambiente sem a 0011), o resto é erro. */
function logEntitlementFailure(context: string, error: unknown): void {
  if (isMissingTable(error) || isMissingColumn(error)) {
    console.warn(
      `[arkom] ${context}: tabelas/colunas de entitlements ausentes (migration 0011/0016 não aplicada) — usando o comportamento legado.`,
    );
    return;
  }
  console.error(`[arkom] ${context} (fail-safe: comportamento legado):`, error);
}

/** Leitura que DISTINGUE "banco falhou" (ok: false → chamador decide o
 *  fail-safe) de "leu limpo e o aluno NÃO tem entitlement" (ok: true com
 *  entitlements null → isso é informação: sem plano). A suíte E2E v2 pegou o
 *  furo de tratar os dois como a mesma coisa (aluno sem plano confirmava de
 *  graça pelo fail-open). */
export type LeituraEntitlements =
  | { ok: true; entitlements: ProfileEntitlements | null }
  | { ok: false };

export async function lerEntitlements(profileId: number): Promise<LeituraEntitlements> {
  try {
    return { ok: true, entitlements: await readEntitlements(profileId) };
  } catch (error) {
    logEntitlementFailure("lerEntitlements", error);
    return { ok: false };
  }
}

function mapRow(row: EntitlementDbRow): EntitlementRow {
  return {
    id: row.id,
    kind: row.kind,
    source: row.source,
    status: row.status,
    startsAt: toIso(row.starts_at),
    expiresAt: toIso(row.expires_at),
    reason: row.reason,
    planId: row.plan_id,
    planSlug: row.plan_slug,
    planName: row.plan_name,
    planPermissive: row.plan_permissive === true,
    planDurationMonths: row.plan_duration_months,
    planMentorshipCredits: row.plan_mentorship_credits,
    planCreditPeriod: row.plan_credit_period,
  };
}

/** Leitura crua — PROPAGA erro. Use `getEntitlements` fora deste módulo. */
async function readEntitlements(profileId: number): Promise<ProfileEntitlements | null> {
  if (!Number.isInteger(profileId) || profileId <= 0) return null;

  const sql = getSql();
  // Sem prefixo de schema — o `search_path` do pool resolve.
  const rows = await sql<EntitlementDbRow[]>`
    SELECT e.id, e.kind, e.source, e.status, e.starts_at, e.expires_at, e.reason,
           e.plan_id,
           p.slug               AS plan_slug,
           p.name               AS plan_name,
           p.permissive         AS plan_permissive,
           p.duration_months    AS plan_duration_months,
           p.mentorship_credits AS plan_mentorship_credits,
           p.credit_period      AS plan_credit_period
      FROM profile_entitlements e
      LEFT JOIN plans p ON p.id = e.plan_id
     WHERE e.profile_id = ${profileId}
       AND e.status = 'active'
     ORDER BY e.kind
  `;
  if (rows.length === 0) return null;

  const mapped = rows.map(mapRow);
  const byKind = (kind: EntitlementKind) => mapped.find((row) => row.kind === kind) ?? null;

  const temporal = byKind("temporal");
  const quantitative = byKind("quantitative");
  const catalog = byKind("catalog");

  const permissive = mapped.some((row) => row.planPermissive);
  const withPlan = mapped.find((row) => row.planId !== null) ?? null;

  // Prazo definido À MÃO (`source='manual'`, Tarefa 4) VENCE o plano permissivo.
  // É exatamente o caso do aluno "Legado" que passou a ter contrato com
  // validade: sem esta precedência, definir a data para ele não teria efeito
  // nenhum, porque o plano permissivo zera o prazo por definição.
  const expiresAt =
    temporal?.source === "manual"
      ? temporal.expiresAt
      : permissive
        ? null
        : (temporal?.expiresAt ?? null);
  const expired = expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();

  // "Ilimitado" só vale quando vem de um PLANO sem cota. Entitlement manual sem
  // cota não é ilimitado — o direito dele é o saldo do ledger.
  const unlimitedCredits =
    permissive ||
    (quantitative?.source === "plan" && quantitative.planMentorshipCredits === null);

  return {
    profileId,
    planId: withPlan?.planId ?? null,
    planSlug: withPlan?.planSlug ?? null,
    planName: withPlan?.planName ?? null,
    permissive,
    mentorshipCredits: quantitative?.planMentorshipCredits ?? null,
    creditPeriod: quantitative?.planCreditPeriod ?? null,
    unlimitedCredits,
    expiresAt,
    expired,
    temporal,
    quantitative,
    catalog,
    rows: mapped,
  };
}

/**
 * Entitlements ativos do perfil. `null` = perfil sem direito cadastrado OU
 * banco indisponível/sem a migration 0011 (fail-safe — nunca lança).
 * Independe da flag: quem decide o que fazer com o dado é o chamador.
 */
export async function getEntitlements(
  profileId: number,
): Promise<ProfileEntitlements | null> {
  try {
    return await readEntitlements(profileId);
  } catch (error) {
    logEntitlementFailure(`Falha ao ler entitlements do perfil ${profileId}`, error);
    return null;
  }
}

/**
 * Saldo de créditos do perfil = SUM(delta) do ledger. Nunca sai de coluna.
 * Erro de banco ⇒ 0 (fail-safe; o consumo real só entra na Tarefa 1, atrás de
 * flag, e lá 0 significa "não debita nada por conta própria").
 */
export async function getCreditBalance(profileId: number): Promise<number> {
  if (!Number.isInteger(profileId) || profileId <= 0) return 0;
  try {
    const sql = getSql();
    const [row] = await sql<{ balance: number }[]>`
      SELECT COALESCE(SUM(delta), 0)::int AS balance
        FROM credit_ledger
       WHERE profile_id = ${profileId}
    `;
    return row?.balance ?? 0;
  } catch (error) {
    logEntitlementFailure(`Falha ao somar o saldo do perfil ${profileId}`, error);
    return 0;
  }
}

/**
 * Os cursos que o plano do perfil libera — em UMA consulta, para o catálogo
 * inteiro (o `/trainings` mostra 9 cursos; perguntar um a um seria N+1).
 *
 * `null` = **sem restrição**, e é o valor de todo caminho fail-open:
 *   · flag `entitlements_enabled` desligada (comportamento de hoje);
 *   · perfil sem entitlement ativo (ou banco fora do ar / sem a 0011);
 *   · plano permissivo (catálogo inteiro, inclusive cursos criados depois);
 *   · entitlement de catálogo sem plano (concessão manual).
 *
 * Set VAZIO é diferente de `null`: significa "o plano existe e não marcou
 * curso nenhum" — que é exatamente o que o formulário do /admin avisa em
 * texto ("Sem nenhum curso marcado, o plano não libera nada do catálogo").
 */
export async function allowedCourseIds(profileId: number): Promise<Set<number> | null> {
  if (!(await isFeatureEnabled("entitlements_enabled"))) return null;

  try {
    const entitlements = await readEntitlements(profileId);
    if (!entitlements) return null;
    if (entitlements.permissive) return null;

    const planId = entitlements.catalog?.planId ?? entitlements.planId;
    if (planId === null) return null; // catálogo manual/sem plano: não restringe

    const sql = getSql();
    const rows = await sql<{ course_id: number }[]>`
      SELECT course_id FROM plan_course_access WHERE plan_id = ${planId}
    `;
    return new Set(rows.map((row) => row.course_id));
  } catch (error) {
    logEntitlementFailure(`Falha ao listar os cursos do plano do perfil ${profileId}`, error);
    return null;
  }
}

/**
 * O perfil tem acesso a este curso?
 *
 * Flag desligada ⇒ `true` (comportamento de hoje: todo curso publicado é aberto
 * a quem está logado). Ligada ⇒ plano permissivo libera tudo; plano comum
 * libera só o que estiver em `plan_course_access`. Perfil sem plano ou erro de
 * banco ⇒ `true` (fail-open: entitlement mal lido não tranca aluno fora).
 */
export async function hasCourseAccess(
  profileId: number,
  courseId: number,
): Promise<boolean> {
  if (!Number.isInteger(courseId) || courseId <= 0) return true;
  const permitidos = await allowedCourseIds(profileId);
  return permitidos === null || permitidos.has(courseId);
}

/**
 * O plano do perfil libera os Apps e Templates? (ClickUp 86ajrgzef)
 *
 * É um liga/desliga do PLANO INTEIRO — `plans.apps_included` (migration 0016).
 * Não existe seleção app a app: o pedido do comercial é "libera todos ou não
 * libera nenhum", e o booleano cobre inclusive os apps publicados depois.
 *
 * Fail-open pelos mesmos quatro caminhos do catálogo (flag desligada, sem
 * entitlement, plano permissivo, sem plano) + ambiente sem a coluna (42703):
 * direito mal lido nunca tranca aluno fora do produto.
 */
export type AppsAccess = {
  allowed: boolean;
  /** Nome do plano, para a tela bloqueada dizer QUAL plano fechou a área. */
  planName: string | null;
};

export async function getAppsAccess(profileId: number): Promise<AppsAccess> {
  if (!(await isFeatureEnabled("entitlements_enabled"))) return { allowed: true, planName: null };

  try {
    const entitlements = await readEntitlements(profileId);
    if (!entitlements) return { allowed: true, planName: null };
    if (entitlements.permissive) return { allowed: true, planName: entitlements.planName };

    const planId = entitlements.catalog?.planId ?? entitlements.planId;
    if (planId === null) return { allowed: true, planName: entitlements.planName };

    const sql = getSql();
    const rows = await sql<{ apps_included: boolean }[]>`
      SELECT apps_included FROM plans WHERE id = ${planId}
    `;
    // Só `false` explícito bloqueia — plano some, coluna ausente ou NULL liberam.
    return { allowed: rows[0]?.apps_included !== false, planName: entitlements.planName };
  } catch (error) {
    logEntitlementFailure(`Falha ao checar acesso do perfil ${profileId} aos apps`, error);
    return { allowed: true, planName: null };
  }
}

/** Só o veredito — para os pontos que não têm o que explicar (actions, home). */
export async function hasAppsAccess(profileId: number): Promise<boolean> {
  return (await getAppsAccess(profileId)).allowed;
}

/**
 * O entitlement "Pro" do perfil — SUBSTITUI o provisório `role === 'admin'`.
 *
 * Chamado nos DOIS produtores do perfil de sessão (src/app/api/auth/_shared.ts
 * e src/app/layout.tsx); trocar só um faz a UI oscilar entre o SSR e o fetch do
 * PlanProvider.
 *
 *   flag OFF ⇒ `role === 'admin'` (idêntico ao comportamento atual)
 *   flag ON  ⇒ admin continua Pro; aluno é Pro quando tem entitlement ativo e
 *              dentro do prazo. Como o backfill da 0011 deu a todos o plano
 *              "Legado" (permissivo, sem prazo), ligar a flag mantém o acesso
 *              de quem já existia e passa a valer plano a plano daí em diante.
 */
export async function isPro(
  profile: { id: number; role: "admin" | "student" } | null | undefined,
): Promise<boolean> {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  if (!(await isFeatureEnabled("entitlements_enabled"))) return false;

  try {
    const entitlements = await readEntitlements(profile.id);
    if (!entitlements) return false;
    if (!entitlements.expired) return true;
    // Vencido só deixa de ser Pro quando o PRAZO ESTÁ VALENDO
    // (`expiration_enforcement`, Tarefa 4). Até lá o vencimento é informativo —
    // a mesma doutrina do veredito `expirado` da Tarefa 1, que é calculado
    // sempre e só bloqueia com a flag ligada.
    return !(await isFeatureEnabled("expiration_enforcement"));
  } catch (error) {
    logEntitlementFailure(`Falha ao derivar isPro do perfil ${profile.id}`, error);
    return false; // legado: só admin é Pro — e aqui já sabemos que não é admin
  }
}

// ---------------------------------------------------------------------------
// Prazo de acesso (Tarefa 4) — estado DERIVADO, nunca materializado
// ---------------------------------------------------------------------------
//
// `expirado` NÃO é uma coluna, NÃO é `profiles.status='blocked'` e NÃO é
// `profile_entitlements.status='expired'`. É a comparação `expires_at <= now()`
// feita na hora da leitura. O motivo é concreto: `readEntitlements` só enxerga
// linhas `status='active'`, então virar a linha vencida para `status='expired'`
// faria o aluno **voltar a parecer sem prazo**. Estado derivado não tem esse
// problema — e é reversível: limpar a data restaura o acesso na hora.

/** Antecedência padrão do alerta (dias) quando a flag não tem escopo. */
export const ALERTA_DIAS_PADRAO = 30;
/** Janelas padrão do relatório de vencimentos (dias). */
export const JANELAS_PADRAO = [30, 60, 90] as const;

const MAX_ALERTA_DIAS = 365;
const MAX_JANELA_DIAS = 3650;

export type ExpirationConfig = {
  /** Vence em até N dias ⇒ entra como "Expirando" no relatório e no alerta. */
  leadDays: number;
  /** Janelas do relatório, em dias, crescentes e sem repetição. */
  windows: number[];
};

function sanitizeLeadDays(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_ALERTA_DIAS) return null;
  return n;
}

function sanitizeWindows(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const janelas = Array.from(
    new Set(
      value
        .map((item) => (typeof item === "number" ? item : Number(item)))
        .filter((n) => Number.isInteger(n) && n > 0 && n <= MAX_JANELA_DIAS),
    ),
  ).sort((a, b) => a - b);
  return janelas.length > 0 ? janelas.slice(0, 6) : null;
}

/**
 * Dias de antecedência do alerta e janelas do relatório — configuráveis SEM
 * deploy pelo `scope` (jsonb) da flag `expiration_enforcement`, em
 * /admin/settings. Escopo ausente, malformado ou fora da faixa cai no padrão.
 */
export async function getExpirationConfig(): Promise<ExpirationConfig> {
  const scope = await getFlagScope("expiration_enforcement");
  return {
    leadDays: sanitizeLeadDays(scope?.alerta_dias) ?? ALERTA_DIAS_PADRAO,
    windows: sanitizeWindows(scope?.janelas) ?? [...JANELAS_PADRAO],
  };
}

/** O prazo está VALENDO agora? (barra ações novas do aluno vencido) */
export async function isExpirationEnforced(): Promise<boolean> {
  const [enforcement, entitlementsEnabled] = await Promise.all([
    isFeatureEnabled("expiration_enforcement"),
    isFeatureEnabled("entitlements_enabled"),
  ]);
  // Sem `entitlements_enabled` não existe plano nem prazo para aplicar —
  // barrar no vácuo barraria por engano (mesma doutrina do bloqueio de
  // créditos da Tarefa 1, que também exige as duas flags).
  return enforcement && entitlementsEnabled;
}

export type AccessState = "ativo" | "expirando" | "expirado";

export type AccessStatus = {
  profileId: number;
  state: AccessState;
  /** `false` = sem prazo (plano vitalício/permissivo ou perfil sem plano). */
  hasDeadline: boolean;
  /** Fim da validade, ISO. `null` = sem prazo. */
  expiresAt: string | null;
  /** Dias corridos até vencer (fuso de São Paulo). Negativo = venceu há N dias. */
  daysRemaining: number | null;
  /** De onde veio o prazo: do plano (`plan`) ou definido à mão (`manual`). */
  source: EntitlementSource | null;
  planId: number | null;
  planName: string | null;
  planSlug: string | null;
  permissive: boolean;
  /** Antecedência vigente do alerta (dias). */
  leadDays: number;
};

/** Fuso de referência do produto (mesmo do calendário e do credit-policy). */
const ACCESS_TIMEZONE = "America/Sao_Paulo";

const DIA_MS = 86_400_000;

/** 'AAAA-MM-DD' do instante no fuso de São Paulo. */
function diaEmSaoPaulo(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ACCESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Dias CORRIDOS entre dois instantes, contados por data no fuso do produto. */
function diasCorridos(de: Date, ate: Date): number {
  const a = Date.parse(`${diaEmSaoPaulo(de)}T00:00:00Z`);
  const b = Date.parse(`${diaEmSaoPaulo(ate)}T00:00:00Z`);
  return Math.round((b - a) / DIA_MS);
}

/**
 * O estado do prazo de acesso do perfil: `ativo` | `expirando` | `expirado`,
 * com a data e os dias restantes.
 *
 * PURO e independente de flag: o relatório de vencimentos precisa funcionar
 * ANTES de o prazo passar a valer — é justamente com ele que a Carol renova
 * antes de alguém ser barrado. Quem decide se o estado BARRA alguma coisa é
 * `isExpirationEnforced()` + o ponto de consumo.
 *
 * Fail-safe: perfil sem entitlement, sem prazo ou erro de banco ⇒ `ativo` sem
 * prazo. Prazo mal lido nunca tranca aluno fora do produto.
 */
export async function getAccessStatus(profileId: number): Promise<AccessStatus> {
  const [entitlements, config] = await Promise.all([
    getEntitlements(profileId),
    getExpirationConfig(),
  ]);

  const base: AccessStatus = {
    profileId,
    state: "ativo",
    hasDeadline: false,
    expiresAt: null,
    daysRemaining: null,
    source: null,
    planId: entitlements?.planId ?? null,
    planName: entitlements?.planName ?? null,
    planSlug: entitlements?.planSlug ?? null,
    permissive: entitlements?.permissive ?? false,
    leadDays: config.leadDays,
  };

  if (!entitlements || entitlements.expiresAt === null) return base;

  const expira = new Date(entitlements.expiresAt);
  if (Number.isNaN(expira.getTime())) return base;

  const agora = new Date();
  const daysRemaining = diasCorridos(agora, expira);
  const state: AccessState = entitlements.expired
    ? "expirado"
    : daysRemaining <= config.leadDays
      ? "expirando"
      : "ativo";

  return {
    ...base,
    state,
    hasDeadline: true,
    expiresAt: entitlements.expiresAt,
    daysRemaining,
    source: entitlements.temporal?.source ?? null,
  };
}
