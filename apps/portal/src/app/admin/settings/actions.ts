"use server";

// Server actions — Admin > Configurações (feature flags de runtime).
// Fonte: tabela `feature_flags` (migration 0010-feature-flags.sql). Cada
// mutação exige requireAdmin(), carimba quem mexeu (`updated_by`/`updated_at`)
// e derruba o cache in-memory desta instância (as outras convergem pelo TTL de
// 30s de src/lib/feature-flags.ts).
//
// ⚠ Types são DECLARADOS aqui. NUNCA `export type { X } from "./y"` dentro de
// um módulo 'use server': vira ReferenceError em runtime e derruba TODAS as
// actions do módulo, com build/tsc passando (incidente PR#3 → fix PR#4).

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { invalidateFlagCache } from "@/lib/feature-flags";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidate() {
  invalidateFlagCache();
  revalidatePath("/admin/settings");
}

/** Quem mexeu, em texto (a coluna é livre, sem FK: sobrevive a exclusão do perfil). */
function actorLabel(user: { id: number; email: string; full_name: string }): string {
  return user.email?.trim() || user.full_name?.trim() || `profile:${user.id}`;
}

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string })?.code === "42P01";
}

const MIGRATION_HINT =
  "Tabela feature_flags ausente. Aplique db/migrations/0010-feature-flags.sql neste ambiente.";

/** Liga/desliga uma flag. O efeito é imediato nesta instância e em até 30s nas demais. */
export async function alternarFlag(
  key: string,
  enabled: boolean
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const flagKey = key?.trim();
  if (!flagKey) return { ok: false, error: "Chave da flag inválida." };

  const sql = getSql();
  try {
    const updated = await sql<{ key: string }[]>`
      UPDATE feature_flags
         SET enabled = ${enabled === true},
             updated_by = ${actorLabel(admin)},
             updated_at = now()
       WHERE key = ${flagKey}
      RETURNING key
    `;
    if (updated.length === 0) return { ok: false, error: "Flag não encontrada." };
    revalidate();
    return { ok: true };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    console.error("Erro em alternarFlag:", error);
    return { ok: false, error: "Não foi possível alterar a flag. Tente novamente." };
  }
}

/** Salva o escopo (parâmetros JSON) da flag. Texto vazio = sem escopo (NULL). */
export async function salvarEscopoFlag(
  key: string,
  scopeText: string
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const flagKey = key?.trim();
  if (!flagKey) return { ok: false, error: "Chave da flag inválida." };

  const raw = (scopeText ?? "").trim();
  let scopeJson: string | null = null;
  if (raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        error: 'JSON inválido. Exemplo: {"policy":"on_confirmation"}',
      };
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        error: 'O escopo precisa ser um objeto JSON. Exemplo: {"policy":"on_confirmation"}',
      };
    }
    scopeJson = JSON.stringify(parsed);
  }

  const sql = getSql();
  try {
    const updated = await sql<{ key: string }[]>`
      UPDATE feature_flags
         SET scope = ${scopeJson}::jsonb,
             updated_by = ${actorLabel(admin)},
             updated_at = now()
       WHERE key = ${flagKey}
      RETURNING key
    `;
    if (updated.length === 0) return { ok: false, error: "Flag não encontrada." };
    revalidate();
    return { ok: true };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    console.error("Erro em salvarEscopoFlag:", error);
    return { ok: false, error: "Não foi possível salvar o escopo. Tente novamente." };
  }
}
