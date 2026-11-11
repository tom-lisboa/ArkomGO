// Apresentação do plano estratégico — "A Constelação".
// Server Component: guard + dono da thread + plano; a experiência de scroll
// roda no client (constelacao-view.tsx). SEM Shell de propósito: a página é
// tela cheia, feita pra projetar. Voltar ao chat leva de volta ao /consultor.
//
// Enriquecimento servidor-side:
//   · cenário: planos antigos (sem plan.cenario) ganham backfill via LLM a
//     partir da própria entrevista, salvo no jsonb (uma vez só); se falhar,
//     a página degrada sem a seção, nunca quebra.
//   · descs: descrição REAL de catálogo por item (anti-invenção: enrichCard).

import "./constelacao.css";
import "../../consultor.css"; // reusa a folha de impressão do Exportar PDF
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  runEnriquecerDidatica,
  runResumirCenario,
  semTravessao,
  type AgentTurn,
} from "@/lib/consultor/agente";
import { enrichCard, loadConsultorCatalog } from "@/lib/consultor/catalogo";
import { getOwnedThread, loadMessages, savePlan } from "@/lib/consultor/store";
import { ConstelacaoView } from "./constelacao-view";

export const dynamic = "force-dynamic";
// backfill de cenário pode custar uma chamada de LLM — folga sobre os 15s
export const maxDuration = 60;

export const metadata: Metadata = { title: "Cronograma de IAtização" };

/** Janela da entrevista usada no backfill do cenário. */
const HISTORY_WINDOW = 20;

export default async function PlanoPage(context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  const threadId = Number(id);
  if (!Number.isInteger(threadId) || threadId <= 0) redirect("/consultor");

  const thread = await getOwnedThread(threadId, user.id);
  if (!thread || thread.mode !== "planejamento" || !thread.plan) redirect("/consultor");
  let plan = thread.plan;

  const firstName = user.full_name.split(" ")[0] || "aluno";

  // backfill: planos gravados antes de cenario/didatica existirem ganham os
  // campos na primeira abertura (salvos uma vez; falha degrada, nunca quebra)
  const precisaCenario = !plan.cenario;
  // item incompleto = sem didática OU sem primeiro passo (campos que nasceram
  // depois; ambos vêm da mesma chamada de backfill)
  const semDidatica = plan.fases.flatMap((f) =>
    f.itens
      .filter((i) => !i.didatica || !i.primeiroPasso)
      .map((i) => ({
        chave: `${i.kind}:${i.ref}`,
        titulo: i.titulo,
        fase: f.nome,
        motivo: i.motivo,
      })),
  );
  if (precisaCenario || semDidatica.length) {
    try {
      const mensagens = await loadMessages(threadId);
      const history: AgentTurn[] = mensagens
        .slice(-HISTORY_WINDOW)
        .map((m) => ({ role: m.role, content: m.content }));

      if (precisaCenario) {
        const cenario = await runResumirCenario({ history, firstName });
        if (cenario) plan = { ...plan, cenario };
      }
      if (semDidatica.length) {
        const enriquecidos = await runEnriquecerDidatica({ history, firstName, itens: semDidatica });
        if (enriquecidos.size) {
          plan = {
            ...plan,
            fases: plan.fases.map((f) => ({
              ...f,
              itens: f.itens.map((i) => {
                const novo = enriquecidos.get(`${i.kind}:${i.ref}`);
                if (!novo) return i;
                return {
                  ...i,
                  didatica: i.didatica || novo.didatica || undefined,
                  primeiroPasso: i.primeiroPasso || novo.primeiroPasso || undefined,
                };
              }),
            })),
          };
        }
      }
      if (precisaCenario || semDidatica.length) await savePlan(threadId, plan);
    } catch (error) {
      console.warn("[consultor] backfill do plano falhou (segue sem):", error);
    }
  }

  // planos gerados antes do semTravessao cobrir todos os campos têm travessão
  // gravado no jsonb: a exibição limpa (não reescreve o banco, só o que sai na
  // tela e no papel). Título e descrição de catálogo ficam intactos: são dados
  // do catálogo, não texto do Gestor.
  plan = {
    ...plan,
    titulo: semTravessao(plan.titulo),
    cenario: plan.cenario
      ? {
          negocio: semTravessao(plan.cenario.negocio),
          meta: semTravessao(plan.cenario.meta),
          dores: plan.cenario.dores.map((d) => semTravessao(d)),
          execucao: semTravessao(plan.cenario.execucao),
        }
      : plan.cenario,
    fases: plan.fases.map((f) => ({
      ...f,
      objetivo: semTravessao(f.objetivo),
      itens: f.itens.map((i) => ({
        ...i,
        motivo: semTravessao(i.motivo),
        didatica: i.didatica ? semTravessao(i.didatica) : i.didatica,
        resultado: i.resultado ? semTravessao(i.resultado) : i.resultado,
        primeiroPasso: i.primeiroPasso ? semTravessao(i.primeiroPasso) : i.primeiroPasso,
      })),
    })),
  };

  // descrição real de catálogo por item (chave kind:ref) — refs que saíram do
  // catálogo simplesmente ficam sem a linha, nada é inventado
  const descs: Record<string, string> = {};
  try {
    const catalog = await loadConsultorCatalog(user);
    for (const fase of plan.fases) {
      for (const item of fase.itens) {
        const card = enrichCard(catalog, item.kind, item.ref, "");
        if (card?.desc) descs[`${item.kind}:${item.ref}`] = card.desc;
      }
    }
  } catch (error) {
    console.warn("[consultor] catálogo indisponível pras descrições:", error);
  }

  return (
    <ConstelacaoView
      threadId={thread.id}
      initialPlan={plan}
      firstName={firstName}
      updatedAt={thread.updatedAt}
      descs={descs}
    />
  );
}
