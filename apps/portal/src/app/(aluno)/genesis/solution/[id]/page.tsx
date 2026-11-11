// Página da solução gerada — header editorial + jornada visual das 8 etapas.
// Theme-aware (acompanha o tema do app), na linguagem do DS ARKOM.

import "../../genesis.css";
import "../../../map/map.css";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getUserSolution, getSteps, type StepGeneration } from "@/lib/builder";
import { Shell } from "@/components/Shell";
import { SolutionView } from "./solution-view";

export const dynamic = "force-dynamic";

export default async function SolucaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const solutionId = Number(id);
  if (!Number.isInteger(solutionId)) notFound();

  const user = await requireUser();
  const sol = await getUserSolution(solutionId, user.id);
  if (!sol) notFound();

  let steps: StepGeneration[] = [];
  try {
    steps = await getSteps(solutionId);
  } catch {
    steps = [];
  }

  const titulo = sol.title ?? sol.original_idea.slice(0, 60);

  // A solução é uma tela full-bleed com a RODA cobrindo tudo (como o /map);
  // barra superior + drawer moram dentro do SolutionView.
  return (
    <Shell>
      <div className="genesis-scope">
        <SolutionView
          solutionId={solutionId}
          title={titulo}
          summaries={sol.step_summaries ?? {}}
          initialSteps={steps.map((s) => ({
            step_key: s.step_key,
            status: s.status,
            content: s.content,
            error_message: s.error_message,
          }))}
        />
      </div>
    </Shell>
  );
}
