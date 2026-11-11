// /apps/[id] — tela interna do app (vídeo + avaliação + ferramentas + acesso).
// Server component: exige sessão, carrega o app publicado + a nota do usuário.
// Apps não publicados → notFound. "Em breve" abre, mas com o CTA travado.
//
// GATE DE PLANO (ClickUp 86ajrgzef): a URL direta de um app é o caminho óbvio
// para furar a vitrine bloqueada — por isso o mesmo corte vale aqui, ANTES de
// carregar o app (o vídeo e a URL externa nem são consultados).

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { getAppsAccess } from "@/lib/entitlements";
import { loadAppById, loadUserRating } from "@/components/apps/data";
import { AppsBloqueado } from "../apps-bloqueado";
import { AppDetail } from "./app-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const app = await loadAppById(Number(id));
  return { title: app ? `${app.name} · Apps` : "Apps e Templates" };
}

export default async function AppDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const appId = Number(id);
  if (!Number.isInteger(appId)) notFound();

  const user = await requireUser();
  const acesso = await getAppsAccess(user.id);
  if (!acesso.allowed) {
    return (
      <Shell>
        <AppsBloqueado planName={acesso.planName} />
      </Shell>
    );
  }

  const app = await loadAppById(appId);
  if (!app) notFound();

  const userRating = await loadUserRating(user.id, appId);

  return (
    <Shell>
      <AppDetail app={app} userRating={userRating} />
    </Shell>
  );
}
