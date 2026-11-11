// GET /api/mentorships/go/[eventId] — acesso GATEADO à sala da mentoria.
// O link real (redirect_url) NUNCA chega ao navegador do aluno: a capa aponta
// para cá, e o servidor só faz o 302 quando a presença está CONFIRMADA (regra
// do dono, 2026-07-29 — acessar sem confirmar era assento sem débito das horas
// do plano), o evento está publicado e ainda não terminou (D17), e a JANELA DE
// ACESSO já abriu — 30 min antes do início (dono, 2026-07-29: a sala de uma
// mentoria do dia seguinte abria pra quem confirmasse). Qualquer
// condição falhando devolve o aluno para /mentorships, sem vazar se o evento
// existe nem qual é o link. A confirmação continua sendo o ÚNICO caminho que
// debita (toggleConfirmation) — esta rota apenas exige que ela tenha ocorrido.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { loadEventCredit } from "@/lib/credit-policy";

export const dynamic = "force-dynamic";

/** Redirect com Location RELATIVO (RFC 7231): atrás do proxy do Railway o
 *  standalone do Next monta `req.url` com o host interno (0.0.0.0:3000), e um
 *  redirect absoluto construído dali levaria o navegador a um endereço morto.
 *  Relativo, o próprio navegador resolve contra o host público. */
const irPara = (path: string) =>
  new NextResponse(null, { status: 302, headers: { Location: path } });

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ eventId: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return irPara("/login");
  if (user.must_change_password === 1) {
    return irPara("/settings?primeiro-acesso=1");
  }

  const back = () => irPara("/mentorships");

  const { eventId: raw } = await ctx.params;
  const eventId = Number(raw);
  if (!Number.isInteger(eventId) || eventId <= 0) return back();

  try {
    const sql = getSql();
    // `loadEventCredit` já resolve status + as duas pontas da JANELA no relógio
    // do banco: "encerrada" (corte autoritativo da D17) e "ainda não abriu"
    // (início − ACCESS_WINDOW_MINUTES) — degradando em ambiente sem a 0012.
    // A janela é o corte de verdade do bug do dia seguinte: confirmar presença
    // com antecedência continua valendo, ENTRAR na sala antes da hora não.
    const event = await loadEventCredit(sql, eventId);
    if (!event || event.status !== "published") return back();
    if (event.hasEnded || !event.accessWindowOpen) return back();

    const [row] = await sql<{ redirect_url: string | null; confirmed: number | null }[]>`
      SELECT e.redirect_url, c.confirmed
        FROM mentorship_events e
        LEFT JOIN event_confirmations c
          ON c.event_id = e.id AND c.user_id = ${user.id}
       WHERE e.id = ${eventId}
    `;
    const url = row?.redirect_url?.trim();
    if (!url || row?.confirmed !== 1) return back();

    return NextResponse.redirect(url, 302);
  } catch (error) {
    console.error("Erro no acesso gateado à mentoria:", error);
    return back();
  }
}
