import { notFound, redirect } from "next/navigation";

import { Shell } from "@/components/Shell";
import "../../trainings.css";
import { requireUser } from "@/lib/auth";
import { getLessonRef } from "@/components/trainings/data";
import { LessonView } from "@/components/trainings/lesson-view";

export const dynamic = "force-dynamic";

/**
 * /trainings/lesson/[aulaId] — página da aula (REATIVA ao app_arkom).
 * Server component: busca a aula (+ curso/módulo) do banco para o aluno logado
 * via getLessonRef, com o estado por-usuário (concluída/curtida/nota/materiais).
 * Guards: aula inexistente → notFound; curso bloqueado (release-gating) →
 * redirect p/ o catálogo. Player real quando há video_url.
 */
export default async function AulaPage({
  params,
}: {
  params: Promise<{ aulaId: string }>;
}) {
  const { aulaId } = await params;
  const user = await requireUser();
  const ref = await getLessonRef(aulaId, user);
  if (!ref) notFound();
  // Curso bloqueado: não abre a aula nem por URL direta.
  if (ref.course.locked) redirect("/trainings");
  return (
    <Shell>
      <LessonView key={aulaId} refData={ref} />
    </Shell>
  );
}
