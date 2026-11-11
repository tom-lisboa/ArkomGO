// lib/feature-flags.ts — leitura RUNTIME das feature flags, server-only.
//
// Por que existe: as flags de hoje são `NEXT_PUBLIC_*` (src/lib/plan.tsx,
// lesson-view.tsx), inlinadas no bundle no build — mudar exige rebuild+deploy.
// Estas aqui vivem em `feature_flags` (migration 0010) e são ligadas/desligadas
// no /admin/settings, valendo em segundos.
//
// Contrato de segurança da fundação:
//   · FAIL-SAFE — qualquer erro de banco, tabela ausente (42P01) ou flag
//     inexistente devolve `false` / `null`. Nada aqui derruba uma página.
//   · CACHE curto em memória (30s) com uma ÚNICA query para todas as flags:
//     o custo de checar N flags numa request é o de uma só. O TTL também é o
//     mecanismo de convergência entre instâncias — o toggle do /admin chama
//     `invalidateFlagCache()` na instância que atendeu a action, as demais
//     alcançam em no máximo 30s.
//
// Uso:
//   import { isFeatureEnabled, getFlagScope } from "@/lib/feature-flags";
//   if (await isFeatureEnabled("credit_blocking_enabled")) { ... }
//   const scope = await getFlagScope("debit_policy");   // {"policy":"…"} | null

import { getSql } from "@/lib/db";

if (typeof window !== "undefined") {
  throw new Error("lib/feature-flags.ts importado no browser — server-only");
}

/** Flags semeadas pelas migrations 0010+ (0013 acrescentou `course_rails_enabled`,
 *  0014 acrescentou `mentors_enabled`). Chaves novas continuam funcionando (a
 *  leitura é por texto), esta lista só dá autocomplete e evita typo. */
export const FEATURE_FLAG_KEYS = [
  "entitlements_enabled",
  "credit_shadow_mode",
  "credit_blocking_enabled",
  "expiration_enforcement",
  "debit_policy",
  "course_rails_enabled",
  "mentors_enabled",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

/** Chave conhecida (com autocomplete) ou qualquer texto — flags criadas fora
 *  desta lista continuam legíveis, só não ganham sugestão do editor. */
type FlagKeyInput = FeatureFlagKey | (string & Record<never, never>);

/** Parâmetros opcionais da flag (coluna `scope` jsonb). */
export type FeatureFlagScope = Record<string, unknown>;

type FeatureFlagState = { enabled: boolean; scope: FeatureFlagScope | null };

type FeatureFlagSnapshot = {
  flags: Map<string, FeatureFlagState>;
  expiresAt: number;
};

const TTL_MS = 30_000;
/** Falha de leitura repete mais cedo que o TTL normal (não gruda em "tudo
 *  desligado" por 30s por causa de um blip de conexão). */
const FAILURE_TTL_MS = 5_000;

const globalForFlags = globalThis as unknown as {
  __arkomFlagSnapshot?: FeatureFlagSnapshot;
  __arkomFlagLoading?: Promise<FeatureFlagSnapshot>;
};

type FeatureFlagRow = {
  key: string;
  enabled: boolean;
  scope: FeatureFlagScope | null;
};

/** Nunca rejeita: erro vira snapshot vazio (= todas as flags desligadas). */
async function loadSnapshot(): Promise<FeatureFlagSnapshot> {
  try {
    const sql = getSql();
    // Sem prefixo de schema — o `search_path` do pool resolve (app_arkom em
    // dev sem a migration → 42P01 → degrada para "tudo desligado").
    const rows = await sql<FeatureFlagRow[]>`
      SELECT key, enabled, scope FROM feature_flags
    `;
    const flags = new Map<string, FeatureFlagState>();
    for (const row of rows) {
      flags.set(row.key, {
        enabled: row.enabled === true,
        scope: row.scope ?? null,
      });
    }
    return { flags, expiresAt: Date.now() + TTL_MS };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      // Migration 0010 ainda não aplicada neste ambiente.
      console.warn(
        "[arkom] feature_flags ausente (migration 0010 não aplicada) — todas as flags contam como desligadas.",
      );
    } else {
      console.error("[arkom] Falha ao ler feature_flags (fail-safe: desligadas):", error);
    }
    return { flags: new Map(), expiresAt: Date.now() + FAILURE_TTL_MS };
  }
}

function getSnapshot(): Promise<FeatureFlagSnapshot> {
  const cached = globalForFlags.__arkomFlagSnapshot;
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached);

  // Coalescência: várias checagens simultâneas compartilham uma query só.
  const inFlight = globalForFlags.__arkomFlagLoading;
  if (inFlight) return inFlight;

  const loading = loadSnapshot().then((snapshot) => {
    globalForFlags.__arkomFlagSnapshot = snapshot;
    globalForFlags.__arkomFlagLoading = undefined;
    return snapshot;
  });
  globalForFlags.__arkomFlagLoading = loading;
  return loading;
}

/** A flag está ligada? Flag inexistente ou erro de banco ⇒ `false`. */
export async function isFeatureEnabled(key: FlagKeyInput): Promise<boolean> {
  const { flags } = await getSnapshot();
  return flags.get(key)?.enabled === true;
}

/** Parâmetros da flag (`scope` jsonb). Sem scope, sem flag ou erro ⇒ `null`.
 *  Independe de `enabled` — quem decide o que fazer com o scope é o chamador. */
export async function getFlagScope(
  key: FlagKeyInput,
): Promise<FeatureFlagScope | null> {
  const { flags } = await getSnapshot();
  return flags.get(key)?.scope ?? null;
}

/** Descarta o cache desta instância (chamado pelas actions do /admin após um
 *  toggle). As outras instâncias convergem pelo TTL de 30s. */
export function invalidateFlagCache(): void {
  globalForFlags.__arkomFlagSnapshot = undefined;
  globalForFlags.__arkomFlagLoading = undefined;
}
