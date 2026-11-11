// Núcleo transacional de concessão de plano — extraído de
// `atribuirPlanoAoAluno` (src/app/admin/plans/actions.ts) para ser
// compartilhado entre a UI admin (ator = admin logado) e integrações de
// automação (ator sem sessão: `actor.profileId = null` + label descritivo;
// o ledger aceita ator nulo em lançamentos não-manuais).
//
// A semântica é a MESMA da UI: o plano substitui o direito vigente (revoga
// TODOS os entitlements ativos do perfil), materializa as três dimensões
// (temporal/quantitative/catalog) e lança os créditos do plano no ledger com
// chave idempotente amarrada ao entitlement recém-criado.

import type postgres from "postgres";
import { appendMovement } from "@/lib/credit-ledger";

export type PlanoRow = {
  id: number;
  slug: string;
  name: string;
  duration_months: number | null;
  mentorship_credits: number | null;
  permissive: boolean;
  status: "draft" | "published";
};

export type AtorConcessao = {
  /** Perfil responsável; `null` quando a concessão vem de integração sem sessão. */
  profileId: number | null;
  label: string;
};

export type ResumoConcessao = {
  /** Créditos efetivamente lançados no ledger (0 se plano sem cota ou duplicado). */
  creditados: number;
  /** Fim da validade da dimensão temporal (ISO) — `null` = sem prazo. */
  expiresAt: string | null;
};

const PLANO_COLUNAS = `id, slug, name, duration_months, mentorship_credits, permissive, status`;

/** Plano vendável por integração: publicado e NÃO permissivo (exclui o
 *  "legado" do backfill e planos de acesso total criados para QA). */
export async function buscarPlanoVendavelPorSlug(
  sql: postgres.Sql,
  slug: string,
): Promise<PlanoRow | null> {
  const [plano] = await sql<PlanoRow[]>`
    SELECT id, slug, name, duration_months, mentorship_credits, permissive, status
      FROM plans
     WHERE slug = ${slug} AND status = 'published' AND permissive = false
  `;
  return plano ?? null;
}

/** Slugs aceitos de integração, na ordem do catálogo — para mensagens de erro. */
export async function listarSlugsVendaveis(sql: postgres.Sql): Promise<string[]> {
  const rows = await sql<{ slug: string }[]>`
    SELECT slug FROM plans
     WHERE status = 'published' AND permissive = false
     ORDER BY sort_order, id
  `;
  return rows.map((row) => row.slug);
}

/**
 * Concede o plano ao perfil numa transação própria. PROPAGA erro (o chamador
 * decide como reportar). O perfil deve existir e não estar excluído — quem
 * chama valida antes.
 */
export async function concederPlano(
  sql: postgres.Sql,
  {
    profileId,
    plano,
    actor,
  }: { profileId: number; plano: PlanoRow; actor: AtorConcessao },
): Promise<ResumoConcessao> {
  const meses = plano.permissive ? null : plano.duration_months;
  const creditos = plano.permissive ? null : plano.mentorship_credits;

  return sql.begin(async (tx) => {
    // O plano substitui o direito vigente (de plano OU manual).
    await tx`
      UPDATE profile_entitlements
         SET status = 'revoked', updated_at = now()
       WHERE profile_id = ${profileId} AND status = 'active'
    `;

    const criados = await tx<{ id: number; kind: string; expires_at: string | null }[]>`
      INSERT INTO profile_entitlements
        (profile_id, plan_id, kind, source, status, starts_at, expires_at)
      SELECT ${profileId}, ${plano.id}, k.kind, 'plan', 'active', now(),
             CASE
               WHEN k.kind = 'temporal' AND ${meses}::int IS NOT NULL
               THEN now() + make_interval(months => ${meses}::int)
               ELSE NULL
             END
        FROM (VALUES ('temporal'::text), ('quantitative'), ('catalog')) AS k(kind)
      RETURNING id, kind, expires_at
    `;

    const quantitativo = criados.find((row) => row.kind === "quantitative");
    const temporal = criados.find((row) => row.kind === "temporal");
    let creditados = 0;
    if (creditos !== null && creditos > 0 && quantitativo) {
      const lancamento = await appendMovement(tx, {
        profileId,
        delta: creditos,
        reason: "plan_grant",
        note: `Créditos do plano ${plano.name}`,
        ref: `plano:${plano.slug}`,
        // Chave amarrada ao entitlement recém-criado: reatribuir o plano no
        // futuro cria outro entitlement e, portanto, outra concessão.
        operationKey: `plan_grant:ent=${quantitativo.id}`,
        eventId: null,
        entitlementId: quantitativo.id,
        actorProfileId: actor.profileId,
        actorLabel: actor.label,
      });
      if (!lancamento.duplicated) creditados = creditos;
    }
    return { creditados, expiresAt: temporal?.expires_at ?? null };
  });
}
