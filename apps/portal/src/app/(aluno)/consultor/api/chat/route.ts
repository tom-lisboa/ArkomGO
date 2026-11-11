// POST /consultor/api/chat — um turno do Gestor IA (dois modos).
//
// Modo consultor: pergunta → resposta consultiva + cards + follow-up.
// Modo planejamento: `start:true` abre a conversa com a fala inicial do
// consultor (sem LLM); os turnos seguintes são a ENTREVISTA, e quando o agente
// capta os sinais ele devolve o roadmap em 4 fases — enriquecido aqui (refs
// validadas contra o catálogo, itens com esforço + done) e persistido na thread.
//
// Fronteira de segurança: sem sessão Arkom devolve 401 e ponto (contrato do
// /api/dash). Dono da thread sempre validado.

import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  enrichCard,
  loadConsultorCatalog,
  motivoTrocado,
  type ConsultorCatalog,
} from "@/lib/consultor/catalogo";
import {
  runConsultor,
  runPreencherFases,
  semTravessao,
  type AgentPlano,
  type AgentTurn,
} from "@/lib/consultor/agente";
import {
  addJourneyItems,
  appendAssistantMessage,
  appendUserMessage,
  countUserMessages24h,
  createThread,
  getOwnedThread,
  listThreads,
  loadJourney,
  loadMessages,
  savePlan,
  touchThread,
} from "@/lib/consultor/store";
import {
  FASES_PLANO,
  type ChatResponse,
  type ConsultorCard,
  type ConsultorMessage,
  type ConsultorMode,
  type PlanoEstrategico,
  type PlanoFase,
  type PlanoItem,
} from "@/lib/consultor/tipos";

export const dynamic = "force-dynamic";
// LLM + catálogo + persistência num turno só — folga sobre o default de 15s
export const maxDuration = 120;

/** Teto diário de perguntas por aluno (barato de mudar por env, sem RPC). */
const MAX_MSGS_24H = Number(process.env.CONSULTOR_MAX_MSGS_24H || 50);

/** Contexto enviado ao LLM: as últimas N mensagens da thread. */
const HISTORY_WINDOW = 20;

/** Fala inicial do modo planejamento — canned, sem custo de LLM. */
const ABERTURA_PLANEJAMENTO =
  "Bora montar seu Cronograma de IAtização. Me conta o que você tá construindo agora, teu negócio e teu momento, e onde quer chegar nesse próximo capítulo.";

function toAgentTurn(msg: ConsultorMessage): AgentTurn {
  if (msg.role === "user") return { role: "user", content: msg.content };
  // o assistant "lembra" do que já recomendou e perguntou — regra anti-repetição
  const refs = msg.cards.map((c) => `${c.kind}:${c.ref}`).join(", ");
  const extras = [
    refs ? `[cards já recomendados: ${refs}]` : "",
    msg.followup ? `[pergunta feita: ${msg.followup}]` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { role: "assistant", content: extras ? `${msg.content}\n${extras}` : msg.content };
}

/** Objetivo padrão por fase — usado só quando nem o retry entregou um. */
const OBJETIVO_FASE: string[] = [
  "Estancar a dor principal com o que dá pra colocar de pé agora.",
  "Estruturar o processo e a base que sustentam o crescimento.",
  "Escalar sobre a fundação e aprofundar o uso de IA.",
  "Consolidar dados e inteligência pra decidir o longo prazo.",
];

/**
 * Itens crus → itens enriquecidos: ref fora do catálogo cai, ref repetida no
 * plano cai, motivo que descreve OUTRO item vira a descrição real do item.
 */
function enrichItens(
  catalog: ConsultorCatalog,
  itens: AgentPlano["fases"][number]["itens"],
  usadas: Set<string>,
): PlanoItem[] {
  const out: PlanoItem[] = [];
  for (const item of itens) {
    const card = enrichCard(catalog, item.kind, item.ref, item.motivo, item.resultado);
    if (!card) continue;
    const chave = `${card.kind}:${card.ref}`;
    if (usadas.has(chave)) continue;
    usadas.add(chave);
    const trocado = motivoTrocado(catalog, card.kind, card.ref, card.motivo);
    if (trocado) console.warn(`[consultor] motivo trocado descartado em ${chave}`);
    out.push({
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
    if (out.length === 3) break;
  }
  return out;
}

/**
 * Último recurso quando o retry não preencheu tudo: move itens VÁLIDOS de fases
 * fartas para as vizinhas vazias, preservando a progressão (a fase anterior
 * cede o último item, a seguinte cede o primeiro). Nada é inventado.
 */
function redistribuirItens(fases: PlanoFase[]): void {
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (let vazia = 0; vazia < fases.length; vazia++) {
      if (fases[vazia].itens.length > 0) continue;
      let doadora = -1;
      for (let dist = 1; dist < fases.length && doadora === -1; dist++) {
        if ((fases[vazia - dist]?.itens.length ?? 0) > 1) doadora = vazia - dist;
        else if ((fases[vazia + dist]?.itens.length ?? 0) > 1) doadora = vazia + dist;
      }
      if (doadora === -1) continue;
      const item = doadora < vazia ? fases[doadora].itens.pop() : fases[doadora].itens.shift();
      if (item) {
        fases[vazia].itens.push(item);
        mudou = true;
      }
    }
  }
}

/**
 * Roadmap cru do LLM → plano SEMPRE com as 4 fases fixas, em 3 camadas:
 * 1. enriquecimento (refs inválidas caem, motivo trocado é corrigido);
 * 2. fase vazia → UM retry cirúrgico pedindo só as fases que faltam;
 * 3. ainda vazia → redistribuição determinística dos itens válidos.
 * Retorna null apenas se NENHUM item válido sobrar (o plano não é salvo).
 */
async function montarPlano(opts: {
  catalog: ConsultorCatalog;
  planoCru: AgentPlano;
  history: AgentTurn[];
  firstName: string;
}): Promise<PlanoEstrategico | null> {
  const usadas = new Set<string>();
  const fases: PlanoFase[] = FASES_PLANO.map((nome) => {
    const crus = opts.planoCru.fases.filter((f) => f.nome === nome);
    return {
      nome,
      objetivo: crus.find((f) => f.objetivo.trim())?.objetivo ?? "",
      itens: enrichItens(opts.catalog, crus.flatMap((f) => f.itens), usadas),
    };
  });

  let vazias = fases.filter((f) => f.itens.length === 0);
  if (vazias.length) {
    try {
      const refill = await runPreencherFases({
        catalog: opts.catalog,
        history: opts.history,
        firstName: opts.firstName,
        fasesVazias: vazias.map((f) => f.nome),
        refsUsadas: [...usadas],
      });
      for (const extra of refill) {
        const alvo = fases.find((f) => f.nome === extra.nome && f.itens.length === 0);
        if (!alvo) continue;
        alvo.itens = enrichItens(opts.catalog, extra.itens, usadas);
        if (!alvo.objetivo.trim() && extra.objetivo.trim()) alvo.objetivo = extra.objetivo;
      }
    } catch (error) {
      console.error("[consultor] retry de fases vazias falhou:", error);
    }
  }

  vazias = fases.filter((f) => f.itens.length === 0);
  if (vazias.length) redistribuirItens(fases);

  if (!fases.some((f) => f.itens.length > 0)) return null;
  fases.forEach((fase, i) => {
    if (!fase.objetivo.trim()) fase.objetivo = OBJETIVO_FASE[i] ?? "";
  });
  return {
    titulo: opts.planoCru.titulo,
    fases,
    ...(opts.planoCru.cenario ? { cenario: opts.planoCru.cenario } : {}),
  };
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }
  if (user.must_change_password === 1) {
    return NextResponse.json({ error: "troca de senha obrigatória" }, { status: 403 });
  }

  let body: { threadId?: unknown; message?: unknown; mode?: unknown; start?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const requestedMode: ConsultorMode = body.mode === "planejamento" ? "planejamento" : "consultor";

  // abertura do planejamento: cria a thread + fala inicial canned, sem LLM
  if (body.start === true && requestedMode === "planejamento") {
    const threadId = await createThread(
      user.id,
      "Cronograma de IAtização",
      ABERTURA_PLANEJAMENTO,
      "planejamento",
    );
    const opening = await appendAssistantMessage(threadId, ABERTURA_PLANEJAMENTO, [], "");
    await touchThread(threadId, ABERTURA_PLANEJAMENTO);
    const threads = await listThreads(user.id);
    const payload: ChatResponse = {
      threadId,
      mode: "planejamento",
      messages: [opening],
      journey: [],
      threads,
      plan: null,
    };
    return NextResponse.json(payload, { headers: { "cache-control": "private, no-store" } });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 2000) {
    return NextResponse.json({ error: "mensagem vazia ou longa demais (máx. 2000)" }, { status: 400 });
  }

  if ((await countUserMessages24h(user.id)) >= MAX_MSGS_24H) {
    return NextResponse.json(
      { error: "Você atingiu o limite de perguntas de hoje. Volte em algumas horas." },
      { status: 429 },
    );
  }

  // thread existente (valida dono; o modo vem DELA) ou nova (título = 1ª pergunta)
  let threadId: number;
  let mode: ConsultorMode = requestedMode;
  let existingPlan: PlanoEstrategico | null = null;
  if (body.threadId !== undefined && body.threadId !== null) {
    const requested = Number(body.threadId);
    if (!Number.isInteger(requested) || requested <= 0) {
      return NextResponse.json({ error: "thread inválida" }, { status: 400 });
    }
    const owned = await getOwnedThread(requested, user.id);
    if (!owned) {
      return NextResponse.json({ error: "thread não encontrada" }, { status: 404 });
    }
    threadId = owned.id;
    mode = owned.mode;
    existingPlan = owned.plan;
  } else {
    threadId = await createThread(user.id, message.slice(0, 80), message.slice(0, 200), mode);
  }

  try {
    const [catalog, previous] = await Promise.all([
      loadConsultorCatalog(user),
      loadMessages(threadId),
    ]);

    const history: AgentTurn[] = [
      ...previous.slice(-HISTORY_WINDOW).map(toAgentTurn),
      { role: "user", content: message },
    ];

    const result = await runConsultor({
      catalog,
      history,
      firstName: user.full_name.split(" ")[0] || "aluno",
      mode,
    });

    // enriquecimento anti-alucinação: ref desconhecida é descartada; motivo que
    // descreve OUTRO item não vai pra tela (o card cai pra descrição real)
    const cards = result.cards
      .map((c) => enrichCard(catalog, c.kind, c.ref, c.motivo, c.resultado))
      .filter((c): c is ConsultorCard => c !== null)
      .map((c) => {
        if (!motivoTrocado(catalog, c.kind, c.ref, c.motivo)) return c;
        console.warn(`[consultor] motivo trocado descartado em ${c.kind}:${c.ref}`);
        // resultado sob a mesma suspeita do motivo: cai junto
        return { ...c, motivo: "", resultado: "" };
      });

    // roadmap pronto (modo planejamento): monta as 4 fases (retry + redistribuição
    // garantem que nenhuma sai vazia), persiste e promove o título
    let plan = existingPlan;
    if (mode === "planejamento" && result.plano) {
      const enriched = await montarPlano({
        catalog,
        planoCru: result.plano,
        history,
        firstName: user.full_name.split(" ")[0] || "aluno",
      });
      if (enriched) {
        await savePlan(threadId, enriched);
        plan = enriched;
      }
    }

    const resposta =
      result.resposta || (cards.length ? "Separei o caminho mais direto pro seu cenário:" : "");
    if (!resposta) throw new Error("resposta vazia do Gestor");

    const userMsg = await appendUserMessage(threadId, message);
    const assistantMsg = await appendAssistantMessage(threadId, resposta, cards, result.followup);
    await addJourneyItems(threadId, cards);
    await touchThread(threadId, resposta);

    const [journey, threads] = await Promise.all([loadJourney(threadId), listThreads(user.id)]);
    const payload: ChatResponse = { threadId, mode, messages: [userMsg, assistantMsg], journey, threads, plan };
    return NextResponse.json(payload, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[consultor] falha no turno:", error);
    return NextResponse.json(
      { error: "O Gestor não conseguiu responder agora. Tente de novo em instantes." },
      { status: 502 },
    );
  }
}
