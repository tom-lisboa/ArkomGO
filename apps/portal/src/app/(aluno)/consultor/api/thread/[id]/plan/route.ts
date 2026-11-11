// PATCH /consultor/api/thread/[id]/plan — duas operações sobre o roadmap:
//   toggle: { fase, item, done }  → marca/desmarca um item;
//   move:   { fase, from, to }    → reordena um item dentro da fase.
// O servidor é a autoridade do plano (o client nunca manda o jsonb inteiro).
// Guard e dono idênticos ao GET da thread.

import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { getOwnedThread, movePlanItem, togglePlanItem } from "@/lib/consultor/store";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }
  if (user.must_change_password === 1) {
    return NextResponse.json({ error: "troca de senha obrigatória" }, { status: 403 });
  }

  const { id } = await context.params;
  const threadId = Number(id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return NextResponse.json({ error: "thread inválida" }, { status: 400 });
  }
  const owned = await getOwnedThread(threadId, user.id);
  if (!owned) {
    return NextResponse.json({ error: "thread não encontrada" }, { status: 404 });
  }

  let body: { fase?: unknown; item?: unknown; done?: unknown; from?: unknown; to?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const fase = Number(body.fase);
  if (!Number.isInteger(fase) || fase < 0) {
    return NextResponse.json({ error: "índices inválidos" }, { status: 400 });
  }

  // reordenação: { fase, from, to }
  if (body.from !== undefined || body.to !== undefined) {
    const from = Number(body.from);
    const to = Number(body.to);
    if (!Number.isInteger(from) || from < 0 || !Number.isInteger(to) || to < 0) {
      return NextResponse.json({ error: "índices inválidos" }, { status: 400 });
    }
    const plan = await movePlanItem(threadId, fase, from, to);
    if (!plan) {
      return NextResponse.json({ error: "item não encontrado no plano" }, { status: 404 });
    }
    return NextResponse.json({ plan }, { headers: { "cache-control": "private, no-store" } });
  }

  // toggle: { fase, item, done }
  const item = Number(body.item);
  if (!Number.isInteger(item) || item < 0 || typeof body.done !== "boolean") {
    return NextResponse.json({ error: "índices inválidos" }, { status: 400 });
  }
  const plan = await togglePlanItem(threadId, fase, item, body.done);
  if (!plan) {
    return NextResponse.json({ error: "item não encontrado no plano" }, { status: 404 });
  }
  return NextResponse.json({ plan }, { headers: { "cache-control": "private, no-store" } });
}
