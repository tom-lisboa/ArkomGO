// POST /consultor/api/thread/[id]/plan/regenerar — nova versão de UMA fase do
// roadmap. Body: { fase: number }. Usa a mesma entrevista da thread como
// contexto, aceita só refs válidas do catálogo e não repete itens das outras
// fases. Estado done dos itens regenerados volta a false (itens novos).
// Guard e dono idênticos ao PATCH do plano.

import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { runRegenerarFase, semTravessao, type AgentTurn } from "@/lib/consultor/agente";
import { enrichCard, loadConsultorCatalog, motivoTrocado } from "@/lib/consultor/catalogo";
import { getOwnedThread, loadMessages, savePlan } from "@/lib/consultor/store";
import type { PlanoItem } from "@/lib/consultor/tipos";

export const dynamic = "force-dynamic";
// um turno de LLM + catálogo — mesma folga da rota de chat
export const maxDuration = 120;

/** Contexto enviado ao LLM: as últimas N mensagens da entrevista. */
const HISTORY_WINDOW = 20;

export async function POST(
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
  if (owned.mode !== "planejamento" || !owned.plan) {
    return NextResponse.json({ error: "esta conversa não tem um roadmap" }, { status: 400 });
  }

  let body: { fase?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const fase = Number(body.fase);
  const alvo = owned.plan.fases[fase];
  if (!Number.isInteger(fase) || fase < 0 || !alvo) {
    return NextResponse.json({ error: "fase não encontrada no plano" }, { status: 404 });
  }

  try {
    const [catalog, mensagens] = await Promise.all([
      loadConsultorCatalog(user),
      loadMessages(threadId),
    ]);
    const history: AgentTurn[] = mensagens
      .slice(-HISTORY_WINDOW)
      .map((m) => ({ role: m.role, content: m.content }));

    const refsOutras = owned.plan.fases
      .filter((_, i) => i !== fase)
      .flatMap((f) => f.itens.map((it) => `${it.kind}:${it.ref}`));

    const nova = await runRegenerarFase({
      catalog,
      history,
      firstName: user.full_name.split(" ")[0] || "aluno",
      faseNome: alvo.nome,
      refsAtuais: alvo.itens.map((it) => `${it.kind}:${it.ref}`),
      refsOutras,
    });

    // enriquecimento anti-alucinação: só refs reais, sem repetir as outras fases
    const usadas = new Set(refsOutras);
    const itens: PlanoItem[] = [];
    for (const item of nova?.itens ?? []) {
      const card = enrichCard(catalog, item.kind, item.ref, item.motivo, item.resultado);
      if (!card) continue;
      const chave = `${card.kind}:${card.ref}`;
      if (usadas.has(chave)) continue;
      usadas.add(chave);
      const trocado = motivoTrocado(catalog, card.kind, card.ref, card.motivo);
      if (trocado) console.warn(`[consultor] motivo trocado descartado em ${chave}`);
      itens.push({
        kind: card.kind,
        ref: card.ref,
        titulo: card.titulo,
        motivo: trocado ? semTravessao(card.desc) : card.motivo,
        // motivo trocado põe didática e resultado sob a mesma suspeita: caem junto
        didatica: trocado ? "" : item.didatica,
        resultado: trocado ? "" : card.resultado,
        // o primeiro passo cai junto quando o motivo é suspeito
        primeiroPasso: trocado ? "" : item.primeiroPasso,
        esforco: item.esforco,
        url: card.url,
        thumb: card.thumb,
        accent: card.accent,
        meta: card.meta,
        done: false,
      });
      if (itens.length === 3) break;
    }
    if (!nova || !itens.length) {
      return NextResponse.json(
        { error: "Não consegui montar uma nova versão desta fase agora. Tente de novo." },
        { status: 502 },
      );
    }

    const plan = {
      ...owned.plan,
      fases: owned.plan.fases.map((f, i) =>
        i === fase
          ? { nome: f.nome, objetivo: nova.objetivo.trim() || f.objetivo, itens }
          : f,
      ),
    };
    await savePlan(threadId, plan);
    return NextResponse.json({ plan }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[consultor] falha ao regenerar fase:", error);
    return NextResponse.json(
      { error: "Não consegui montar uma nova versão desta fase agora. Tente de novo." },
      { status: 502 },
    );
  }
}
