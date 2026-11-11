// /solutions — a roda das soluções conectadas (N3 + adendos do fundador).
//
// A rota SÓ existe na dash dedicada (deploy com ARKOM_APP_MODE=solutions); no
// app principal responde 404 (a superfície foi movida pra fora do app — item
// também removido da sidebar do Shell). Na dash, o gate é o login (requireUser,
// mesma base de usuários do Arkom) — sem allowlist de preview.
//
// Server component: exige sessão (requireUser) e carrega os apps PUBLICADOS do
// banco (apps JOIN app_categories via loadPublishedApps — schema-agnóstico). A
// roda radial + o drawer vivem no client (solutions-body). As "soluções" são as
// linhas de `apps`: rascunho/categoria despublicada nunca aparecem para o aluno.
//
// O nome do núcleo continua vindo do setup do Brain (localStorage) — resolvido
// no client (solutions-body).

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { canAccessSolutionsDash, isSolutionsDash } from "@/lib/app-mode";
import { loadPublishedApps } from "@/components/apps/data";
import { SolutionsBody } from "./solutions-body";
import { SolutionsShell } from "./solutions-shell";

export const metadata: Metadata = {
  title: "Soluções",
  description:
    "Hub das soluções: agentes, dashboards e automações orbitando um único núcleo.",
};

export default async function SolutionsPage() {
  // fora da dash dedicada a rota não existe (removida do app principal).
  if (!isSolutionsDash()) notFound();
  const user = await requireUser();
  // allowlist da dash (defesa em profundidade — o login já barra na porta).
  if (!canAccessSolutionsDash(user.email)) notFound();
  const apps = await loadPublishedApps();

  return (
    <SolutionsShell>
      <SolutionsBody apps={apps} />
    </SolutionsShell>
  );
}
