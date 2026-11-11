import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { loadHomeData } from "@/components/home/data";
import { InicioBody } from "./home-body";

/**
 * /home — dashboard do aluno (REATIVO ao banco).
 *
 * Server component: exige sessão (requireUser) e carrega, do schema runtime
 * (getSql → ARKOM_RUNTIME_SCHEMA, prod=`educacional`), os dados REAIS do aluno
 * logado — progresso por curso, "continuar de onde parou", próximas
 * mentorias, apps em destaque e últimos acessos. O corpo client (home-body)
 * mantém o relógio (saudação por horário) e a interatividade. Substitui os mocks
 * estáticos de @/components/home/content pela atividade real do aluno.
 *
 * Ordem das seções idêntica ao mock: saudação → 4 KPIs → herói duplo → seu
 * progresso → soluções em destaque → últimos acessos.
 */
export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const user = await requireUser();
  const data = await loadHomeData(user);

  return (
    <Shell>
      <InicioBody {...data} />
    </Shell>
  );
}
