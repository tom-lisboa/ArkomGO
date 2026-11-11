import "./trainings.css";

import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { getCatalog } from "@/components/trainings/data";
import { CapacitacoesBody } from "@/components/trainings/trainings-body";

// Reativo ao app_arkom: renderiza a cada request (o que o /admin cadastra aparece).
export const dynamic = "force-dynamic";

/**
 * /trainings — grid de cursos (REATIVO ao app_arkom).
 * Server component: carrega o catálogo do banco (o mesmo schema que o /admin
 * grava) para o aluno logado — o gating de liberação (release_after_days vs
 * profiles.registered_at) marca cursos ainda bloqueados. Antes lia o mock.
 */
export default async function CapacitacoesPage() {
  const user = await requireUser();
  // `rails` = prateleiras configuradas no /admin (flag course_rails_enabled).
  // Vem `null` com a flag desligada — e aí o corpo mantém o layout hardcoded.
  const { cards, comingSoon, rails } = await getCatalog(user);
  return (
    <Shell>
      <CapacitacoesBody cards={cards} comingSoon={comingSoon} rails={rails} />
    </Shell>
  );
}
