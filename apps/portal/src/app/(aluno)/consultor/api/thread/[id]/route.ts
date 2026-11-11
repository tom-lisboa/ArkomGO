// GET /consultor/api/thread/[id] — reabre uma conversa do Histórico.
// Guard igual ao /api/dash: 401 sem sessão, 403 com troca de senha pendente,
// 404 para thread de outro usuário (dono validado — evita IDOR).

import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { getOwnedThread, loadJourney, loadMessages } from "@/lib/consultor/store";
import type { ThreadResponse } from "@/lib/consultor/tipos";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
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

  const [messages, journey] = await Promise.all([loadMessages(threadId), loadJourney(threadId)]);
  const payload: ThreadResponse = {
    threadId,
    mode: owned.mode,
    messages,
    journey,
    plan: owned.plan,
  };
  return NextResponse.json(payload, { headers: { "cache-control": "private, no-store" } });
}
