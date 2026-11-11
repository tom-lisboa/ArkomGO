// POST /genesis/api/etapa — gera UMA etapa da solução.
//
// É um Route Handler (e não server action) de propósito: o Next serializa server
// actions do mesmo cliente (uma por vez), o que forçava as 8 etapas a gerar em
// SEQUÊNCIA (4-6 min no total). Como cada etapa depende só dos resumos do esqueleto,
// o client dispara todas em paralelo contra este endpoint e o tempo total cai para
// o da etapa mais lenta (~30-60s).
//
// Segurança: sessão obrigatória + bloqueio de primeiro acesso (troca de senha
// pendente) + dono validado — mesmas regras dos guards de layout, replicadas aqui
// porque layouts NÃO envolvem route handlers.

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { generateStep, getUserSolution, STEP_ORDER, type StepKey } from "@/lib/builder";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    if (user.must_change_password === 1) {
      return NextResponse.json({ ok: false, error: "Troque sua senha para continuar." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { solutionId?: unknown; stepKey?: unknown } | null;
    const solutionId = Number(body?.solutionId);
    const stepKey = body?.stepKey as StepKey;
    if (!Number.isInteger(solutionId) || !STEP_ORDER.includes(stepKey)) {
      return NextResponse.json({ ok: false, error: "Parâmetros inválidos." }, { status: 400 });
    }

    const sol = await getUserSolution(solutionId, user.id);
    if (!sol) return NextResponse.json({ ok: false, error: "Solução não encontrada." }, { status: 404 });

    const step = await generateStep(solutionId, stepKey);
    revalidatePath(`/genesis/solution/${solutionId}`);
    // error_message vai junto: uma regeneração falha volta 'completed' (conteúdo
    // anterior preservado) mas COM error_message — o client precisa distinguir isso
    // de um sucesso real (feedback ao usuário + não recalcular savings à toa)
    return NextResponse.json({
      ok: true,
      step: { step_key: step.step_key, status: step.status, content: step.content, error_message: step.error_message },
    });
  } catch (error) {
    console.error("Error in POST /genesis/api/etapa:", error);
    return NextResponse.json({ ok: false, error: "Não foi possível gerar a etapa. Tente novamente." }, { status: 500 });
  }
}
