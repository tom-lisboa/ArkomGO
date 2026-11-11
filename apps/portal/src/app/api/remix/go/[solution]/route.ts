// GET /api/remix/go/[solution] — acesso do MEMBRO a uma solução.
// É pra CÁ que o catálogo do aluno aponta (link estável no SQLite). Só redireciona
// (302) pro magic-link fresco de core.remix_link (rotaciona ~2×/dia; cron renova) —
// o aluno só vê/usa "o link de remix". O PROVISIONAMENTO não acontece aqui: ele é
// feito na criação da conta pela interface do admin (provisionMemberForAllSolutions).
// Via lib/central (service_role server-only).

import { after, NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { fetchInviteLink, logRemixClick, REMIX_GO_SLUGS } from "@/lib/remix";

export const dynamic = "force-dynamic";

// ARKOM_DEV_PREVIEW=1 (só em development) libera o redirect sem sessão para
// revisão visual local do mapa; produção continua exigindo membro logado.
const devPreview =
  process.env.NODE_ENV === "development" && process.env.ARKOM_DEV_PREVIEW === "1";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ solution: string }> },
): Promise<NextResponse> {
  // Só membros logados (o catálogo já é área autenticada).
  const user = devPreview ? null : await getSessionUser();
  if (!user && !devPreview) {
    return NextResponse.redirect(new URL("/login", req.url), 302);
  }
  if (user && user.must_change_password === 1) {
    return NextResponse.redirect(
      new URL("/settings?primeiro-acesso=1", req.url),
      302,
    );
  }

  const { solution } = await ctx.params;
  if (!REMIX_GO_SLUGS.has(solution)) {
    return NextResponse.json({ error: `solução desconhecida: ${solution}` }, { status: 404 });
  }

  const { link, error } = await fetchInviteLink(solution);
  if (error) {
    return NextResponse.json({ error: `registry central indisponível: ${error}` }, { status: 502 });
  }
  if (!link) {
    return NextResponse.json(
      { error: "link de remix indisponível no momento — aguarde o próximo refresh do cron" },
      { status: 404 },
    );
  }

  after(async () => {
    await logRemixClick(solution, user ? `arkom/user:${user.id}` : "arkom/dev-preview");
  });
  return NextResponse.redirect(link, 302);
}
