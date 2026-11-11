// /apps — "Apps e Templates" (vitrine do aluno).
// Server component: exige sessão (requireUser) e carrega os apps PUBLICADOS
// do banco (loadPublishedApps, schema-agnóstico). O grid + as pills de filtro
// por SETOR do mapa vivem no client (apps-body). Substitui o mock SOLUTIONS
// pelos apps reais; rascunho/categoria despublicada nunca aparecem p/ o aluno.
//
// GATE DE PLANO (ClickUp 86ajrgzef): plano com os apps fechados
// (`plans.apps_included = false`) não chega a CARREGAR os apps — nome, capa e
// URL externa não entram no payload. A tela explica o porquê; esconder o grid
// no client seria maquiagem, com os dados viajando assim mesmo.

import type { Metadata } from "next";

import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { getAppsAccess } from "@/lib/entitlements";
import { loadPublishedApps } from "@/components/apps/data";
import { AppsBloqueado } from "./apps-bloqueado";
import { AppsBody } from "./apps-body";

export const metadata: Metadata = {
  title: "Apps e Templates",
  description:
    "Ferramentas, automações e templates prontos para acelerar o seu negócio.",
};

export default async function AppsPage() {
  const user = await requireUser();
  const acesso = await getAppsAccess(user.id);
  if (!acesso.allowed) {
    return (
      <Shell>
        <AppsBloqueado planName={acesso.planName} />
      </Shell>
    );
  }

  const apps = await loadPublishedApps();

  return (
    <Shell>
      <AppsBody apps={apps} />
    </Shell>
  );
}
