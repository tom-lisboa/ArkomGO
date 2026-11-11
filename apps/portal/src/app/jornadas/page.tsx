// /jornadas — videoteca das jornadas E2E gravadas do credit-system.
//
// A rota SÓ existe no serviço dedicado de QA (deploy com ARKOM_APP_MODE=qa),
// no mesmo padrão da dash de Soluções: no app principal e nos demais modos ela
// é 404. Exige sessão de ADMIN — o conteúdo mostra telas do /admin.
//
// Os vídeos vivem no bucket central (bilhon-media) sob resources/qa-jornadas/
// e são servidos pela rota autenticada /api/media (prefixo `resources/` já é
// permitido por normalizeMediaPath).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isQaDash } from "@/lib/app-mode";
import { requireAdmin } from "@/lib/auth";
import { JornadasBody } from "./jornadas-body";

export const metadata: Metadata = { title: "Jornadas gravadas · Arkom QA" };

export default async function JornadasPage() {
  if (!isQaDash()) notFound();
  await requireAdmin();
  return <JornadasBody />;
}
