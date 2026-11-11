import { notFound } from "next/navigation";

import { Shell } from "@/components/Shell";
import { DashView } from "@/components/dash/DashView";
import { canAccessSolutionsDash, isSolutionsDash } from "@/lib/app-mode";
import { requireUser } from "@/lib/auth";
import { buildEffectiveCenters } from "@/lib/dash/registry";

import "./dash.css";

export default async function DashPage() {
  // dash dedicada de Soluções: sem o Shell do app (sidebar não existe lá);
  // o .dashroot é fixed fullscreen e o DashTopbar mostra SOLUÇÕES | PAINÉIS.
  // Allowlist da dash (defesa em profundidade — o login já barra na porta).
  if (isSolutionsDash()) {
    const user = await requireUser();
    if (!canAccessSolutionsDash(user.email)) notFound();
    // centers construídos no server: o PREVIEW do coverflow mostra os mesmos
    // indicadores (soluções de cada área) que o painel entrado.
    const centers = await buildEffectiveCenters({ userId: user.id });
    return <DashView solutionsMode centers={centers} />;
  }
  return (
    <Shell>
      <DashView />
    </Shell>
  );
}
