// /admin/settings — Configurações: as feature flags de runtime do app.
// Leitura em server component; toggle/escopo via server actions em ./actions.ts.
// Guard requireAdmin() aplicado no layout admin (e repetido aqui, como no resto
// do /admin). Se a migration 0010 ainda não rodou neste ambiente, a página
// degrada (42P01) em vez de estourar — o app já trata flag ausente como off.

import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import {
  FeatureFlagsManager,
  type AdminFeatureFlag,
} from "@/app/admin/settings/feature-flags-manager";

export const metadata: Metadata = { title: "Configurações" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const sql = getSql();

  let flags: AdminFeatureFlag[] = [];
  let migrationMissing = false;

  try {
    // updated_at já formatado no banco (evita divergência de fuso entre o
    // render do servidor e o do browser).
    flags = await sql<AdminFeatureFlag[]>`
      SELECT key, enabled, scope, updated_by,
             to_char(updated_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
               AS updated_at_label
        FROM feature_flags
       ORDER BY key
    `;
  } catch (error) {
    // Tabela da migration 0010 ainda não aplicada neste ambiente.
    if ((error as { code?: string })?.code === "42P01") migrationMissing = true;
    else throw error;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-display text-primary">
          Configurações
        </h1>
        <p className="mt-1 text-base text-secondary">
          Interruptores de funcionalidades do app, lidos em tempo de execução —
          ligar ou desligar aqui vale em segundos, sem novo deploy.
        </p>
      </div>
      <FeatureFlagsManager flags={flags} migrationMissing={migrationMissing} />
    </div>
  );
}
