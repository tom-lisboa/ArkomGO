// lib/consultor/tipos.ts — contratos do Gestor IA compartilhados entre o
// servidor (catálogo/agente/rotas) e o client (consultor-chat). Sem imports de
// servidor aqui: o client importa este módulo.

/** Tipo do item recomendado — espelha o CHECK de consultor_journey.kind (0019).
 *  'genesis' = construir a solução que não existe no catálogo, via /genesis. */
export type ConsultorCardKind = "solucao" | "curso" | "aula" | "genesis";

/**
 * Card de recomendação ENRIQUECIDO no servidor. O LLM devolve só {kind, ref,
 * motivo}; título/desc/url/thumb vêm do catálogo real — o modelo nunca inventa
 * metadados de item.
 */
export type ConsultorCard = {
  kind: ConsultorCardKind;
  /** id do app (string numérica) · slug do curso · id de rota da aula (curso--NN) */
  ref: string;
  titulo: string;
  /** copy curta do próprio catálogo (tagline/strap/descrição) */
  desc: string;
  /** por que ESTE item para ESTE cenário — texto do LLM */
  motivo: string;
  /** o resultado que o aluno pode esperar, nos números DELE — texto do LLM;
   *  vazio quando não há afirmação honesta a fazer (cards antigos não têm) */
  resultado?: string;
  /** deep-link interno: /apps/{id} · /trainings/{slug} · /trainings/lesson/{id} · /genesis */
  url: string;
  thumb?: string;
  /** linha de metadados do card (categoria · nº de aulas · curso de origem) */
  meta?: string;
  /** cor de acento do item (mesma paleta dos cards de apps/cursos) — usada no
   *  glow de fallback da mídia quando a capa falha ou não existe */
  accent?: string;
};

export type ConsultorMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  cards: ConsultorCard[];
  followup: string | null;
  created_at: string;
};

export type ConsultorJourneyItem = {
  id: number;
  kind: ConsultorCardKind;
  ref: string;
  titulo: string;
  motivo: string;
  url: string;
};

/** 'consultor' = recomendações por pergunta · 'planejamento' = entrevista → roadmap */
export type ConsultorMode = "consultor" | "planejamento";

export type ConsultorThread = {
  id: number;
  title: string;
  preview: string;
  message_count: number;
  pinned: number;
  mode: ConsultorMode;
  updated_at: string;
};

/* ── Planejamento estratégico — roadmap em 4 fases ────────────────────────── */

/** Item do roadmap: um card enriquecido + estimativa de esforço + concluído. */
export type PlanoItem = {
  kind: ConsultorCardKind;
  ref: string;
  titulo: string;
  motivo: string;
  /** a justificativa DIDÁTICA: por que implementar/assistir agora, o que
   *  destrava no plano e o custo de pular (planos antigos: backfill) */
  didatica?: string;
  /** resultado esperado nos números do aluno (planos antigos não têm) */
  resultado?: string;
  /** o PRIMEIRO PASSO concreto: a ação que o aluno executa hoje pra destravar
   *  este item (1 frase imperativa; planos antigos ganham no backfill) */
  primeiroPasso?: string;
  /** estimativa honesta ("3-5 dias de setup" · "4-6h de estudo") */
  esforco: string;
  url: string;
  thumb?: string;
  accent?: string;
  meta?: string;
  done: boolean;
};

export type PlanoFase = {
  nome: string;
  objetivo: string;
  itens: PlanoItem[];
};

/** Cenário captado na entrevista — SÓ com o que o aluno disse (sem invenção).
 *  Vive dentro do jsonb do plano; planos antigos não têm (backfill na página
 *  de apresentação). */
export type PlanoCenario = {
  /** o negócio e o momento ("Agência de tráfego pago com 12 clientes ativos") */
  negocio: string;
  /** o objetivo do próximo capítulo, nos números do aluno */
  meta: string;
  /** as dores que sangram hoje, com os números que o aluno deu */
  dores: string[];
  /** quem implementa e quanto tempo tem */
  execucao: string;
};

export type PlanoEstrategico = {
  titulo: string;
  fases: PlanoFase[];
  cenario?: PlanoCenario;
};

/** Nomes fixos das 4 fases (o LLM preenche objetivo + itens, não os nomes). */
export const FASES_PLANO = [
  "Quick wins de baixa fricção",
  "Fundação operacional",
  "Escala e aprofundamento",
  "Visão estratégica",
] as const;

/** Resposta do POST /consultor/api/chat. */
export type ChatResponse = {
  threadId: number;
  mode: ConsultorMode;
  messages: ConsultorMessage[];
  journey: ConsultorJourneyItem[];
  threads: ConsultorThread[];
  plan: PlanoEstrategico | null;
};

/** Resposta do GET /consultor/api/thread/[id]. */
export type ThreadResponse = {
  threadId: number;
  mode: ConsultorMode;
  messages: ConsultorMessage[];
  journey: ConsultorJourneyItem[];
  plan: PlanoEstrategico | null;
};
