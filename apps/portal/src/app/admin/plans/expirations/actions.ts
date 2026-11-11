"use server";

// Server actions — Admin > Planos > Vencimentos (Tarefa 4).
// Uma única mutação: disparar o job de expiração. O relatório em si é leitura
// pura no server component (src/lib/access-expiration.ts).
//
// ⚠ Types são DECLARADOS aqui. NUNCA `export type { X } from "./y"` dentro de
// um módulo 'use server': vira ReferenceError em runtime e derruba TODAS as
// actions do módulo, com build/tsc passando (incidente PR#3 → fix PR#4).

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { runExpirationJob } from "@/lib/access-expiration";

export type ProcessarExpiracoesResult =
  | {
      ok: true;
      message: string;
      /** `false` = nada mudou desde a última execução de hoje (job idempotente). */
      changed: boolean;
      expirados: number;
      expirando: number;
    }
  | { ok: false; error: string };

/** Quem disparou, em texto (sobrevive à exclusão do perfil). */
function actorLabel(user: { id: number; email: string; full_name: string }): string {
  return user.email?.trim() || user.full_name?.trim() || `profile:${user.id}`;
}

/**
 * "Processar expirações" — recalcula os estados derivados, registra o resumo
 * do dia em `expiration_runs` e devolve o alerta antecipado.
 *
 * Idempotente: rodar de novo no mesmo dia, com o mesmo estado do banco, não
 * escreve nada e devolve `changed: false`. Nenhum entitlement é alterado —
 * "expirado" é derivado, nunca materializado.
 */
export async function processarExpiracoes(): Promise<ProcessarExpiracoesResult> {
  const admin = await requireAdmin();

  const resultado = await runExpirationJob({
    source: "admin",
    actorLabel: actorLabel(admin),
  });
  if (!resultado.ok) return { ok: false, error: resultado.error };

  revalidatePath("/admin/plans/expirations");
  revalidatePath("/admin");

  const { resumo, leadDays } = resultado;
  const partes = [
    `${resumo.comPrazo} aluno(s) com prazo`,
    `${resumo.expirados} vencido(s)`,
    `${resumo.expirando} vencendo em até ${leadDays} dia(s)`,
  ];
  return {
    ok: true,
    changed: resultado.changed,
    expirados: resumo.expirados,
    expirando: resumo.expirando,
    message: resultado.changed
      ? `${partes.join(" · ")}. Execução registrada (${resultado.runKey}).`
      : `${partes.join(" · ")}. Nada mudou desde a última execução de hoje — nenhum registro novo.`,
  };
}
