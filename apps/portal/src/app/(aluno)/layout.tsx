import { requireUser } from "@/lib/auth";

// ARKOM_DEV_PREVIEW=1 libera a área do aluno SEM sessão para revisão visual
// local (mapa/training são dados estáticos). Só vale em development; qualquer
// build de produção ignora o bypass e exige sessão.
const devPreview =
  process.env.NODE_ENV === "development" && process.env.ARKOM_DEV_PREVIEW === "1";

export default async function AlunoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!devPreview) await requireUser();

  return children;
}
