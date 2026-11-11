// lib/builder-schema.ts — Contrato de saída POR ETAPA (normalização na origem).
//
// Cada etapa tem um JSON Schema estrito que o modelo é OBRIGADO a preencher (OpenAI
// Structured Outputs, `response_format: json_schema` com strict:true). Assim o modelo
// não inventa mais chaves livres a cada geração — a forma é sempre a MESMA e casa 1:1
// com o que os renderizadores dedicados (step-renderers.tsx) leem.
//
// Regras do modo strict: todo objeto tem `additionalProperties:false` e lista TODAS as
// chaves em `required`; sem constraints numéricas/tamanho (não suportadas). Campos
// "opcionais" viram obrigatórios que podem vir como "" / [] (o renderer os oculta).

import { STEP_ORDER, STEP_META, type StepKey } from "@/lib/builder-types";

type JSONSchema = Record<string, unknown>;
export type StepSchema = { name: string; schema: JSONSchema };

const S = (description?: string): JSONSchema => (description ? { type: "string", description } : { type: "string" });
const N = (description?: string): JSONSchema => (description ? { type: "number", description } : { type: "number" });
const B = (description?: string): JSONSchema => (description ? { type: "boolean", description } : { type: "boolean" });
const obj = (properties: Record<string, JSONSchema>): JSONSchema => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const list = (items: JSONSchema, description?: string): JSONSchema =>
  description ? { type: "array", description, items } : { type: "array", items };

// pilar do framework: descrição + itens (checklist)
const pilar = (hint: string): JSONSchema =>
  obj({
    description: S(hint),
    features: list(obj({ label: S("Rótulo curto do item"), description: S("Explicação de 1 linha") })),
  });

// perguntas de qualificação (analyze) — força saída ESPECÍFICA à ideia (não genérica)
export const ANALYZE_SCHEMA: StepSchema = {
  name: "analyze",
  schema: obj({
    questions: list(
      obj({
        category: S("Tema curto da pergunta (ex: Canais, Público, Integrações, Regras, Volume)"),
        question: S("Pergunta objetiva e ESPECÍFICA à ideia, citando elementos concretos dela"),
        why_important: S("Por que essa resposta importa para projetar a solução (1 linha)"),
      }),
      "Exatamente 5 perguntas de qualificação específicas à ideia dada"
    ),
    viability: obj({
      level: { type: "string", enum: ["high", "moderate", "low"], description: "Viabilidade" },
      score: N("Nota de 0 a 10"),
      reason: S("Justificativa curta"),
      suggestions: list(S("Sugestão prática"), "1-3 sugestões"),
    }),
  }),
};

// perguntas complementares (responder mais) — mesma forma, sem viability
export const QUESTIONS_SCHEMA: StepSchema = {
  name: "questions",
  schema: obj({
    questions: list(
      obj({
        category: S("Tema curto da pergunta"),
        question: S("Pergunta complementar e mais profunda, específica à ideia"),
        why_important: S("Por que importa (1 linha)"),
      }),
      "5 perguntas complementares"
    ),
  }),
};

export const STEP_SCHEMAS: Record<StepKey, StepSchema> = {
  knowledge_base: {
    name: "knowledge_base",
    schema: obj({
      insights: list(
        obj({
          label: S("Título curto do insight (o que a IA extraiu)"),
          value: S("1-2 frases explicando de onde saiu (baseado na resposta real)"),
        }),
        "6-8 insights sintetizados das respostas reais do usuário"
      ),
      mandatory_qa: list(
        obj({
          category: S("Uma de: Problema | Público-alvo | Canal principal | Nível técnico | Orçamento"),
          question: S("A pergunta de qualificação, em pt-BR"),
          answer: S("A resposta sintetizada das respostas reais do usuário (não inventar)"),
        }),
        "As 5 perguntas obrigatórias respondidas"
      ),
      bonus_qa: list(
        obj({
          category: S("Volume esperado | Prazo | Integrações externas"),
          question: S("A pergunta bônus, em pt-BR"),
          answer: S('Resposta, ou "Não especificado" se o usuário não respondeu'),
        }),
        "Até 3 perguntas bônus"
      ),
    }),
  },

  framework: {
    name: "framework",
    schema: obj({
      data: pilar("Banco de dados Supabase: tabelas com campos e relações, RLS sugerida"),
      prompt: pilar("Prompt/lógica da IA (persona + regras + variáveis) ou lógica da Edge Function"),
      models: pilar("Modelo de IA principal + alternativa econômica (cada feature = 1 modelo e por que)"),
      automation: pilar("Backend/automação: Edge Functions, cron, webhooks, filas"),
      interface: pilar("Interface e caminho de build (Lovable p/ leigo, Claude Code p/ time técnico)"),
    }),
  },

  architecture: {
    name: "architecture",
    schema: obj({
      main_flow: list(
        obj({
          label: S("Título curto da etapa do fluxo"),
          description: S("O que acontece nesta etapa"),
          tools: list(S("Nome de ferramenta/serviço usado nesta etapa")),
          metrics: S("Métrica de sucesso desta etapa (ou vazio)"),
        }),
        "Etapas ordenadas do fluxo principal (5-8)"
      ),
      alt_flows: list(
        obj({ type: S("Rótulo do fluxo alternativo (ex: Erro, Fallback, Edge case)"), description: S("O que trata") }),
        "Fluxos alternativos / de exceção"
      ),
      rationale: S("Por que esta arquitetura (1 parágrafo)"),
    }),
  },

  tools: {
    name: "tools",
    schema: obj({
      tools: list(
        obj({
          name: S("Nome da ferramenta"),
          category: S("Categoria (Builder, Backend, IA, Mensageria, etc.)"),
          how_used: S("Como é usada nesta solução (1-2 frases)"),
          cost: S('Custo mensal em pt-BR (ex: "R$0/mês (Free)", "US$20/mês")'),
          plan_tag: { type: "string", enum: ["free", "freemium", "paid"], description: "Tipo de plano" },
          essential: B("true se é essencial ao MVP; false se opcional"),
          alternatives: list(
            obj({ name: S("Alternativa"), pros: S("Vantagem"), cons: S("Desvantagem") }),
            "0-2 alternativas"
          ),
        }),
        "Ferramentas da stack (essenciais e opcionais)"
      ),
    }),
  },

  action_plan: {
    name: "action_plan",
    schema: obj({
      sprints: list(
        obj({
          name: S("Nome do sprint (ex: Sprint 1 — Fundação)"),
          duration: S('Duração estimada (ex: "1 semana")'),
          tasks: list(
            obj({
              title: S("Descrição da tarefa"),
              priority: { type: "string", enum: ["high", "medium", "low"], description: "Prioridade" },
              estimate: S('Estimativa (ex: "4h", "1 dia") ou vazio'),
            })
          ),
        }),
        "3-4 sprints com tarefas"
      ),
    }),
  },

  prompt_lovable: {
    name: "prompt_lovable",
    schema: obj({
      prompts: list(
        obj({
          id: S("Número sequencial como string"),
          title: S("Título curto do prompt"),
          content: S("O prompt completo, pronto para colar no builder no-code (sem markdown de cerca)"),
        }),
        "6-10 prompts sequenciais de construção"
      ),
    }),
  },

  content: {
    name: "content",
    schema: obj({
      contents: list(
        obj({
          title: S("Título da aula/conteúdo"),
          module: S("Módulo/trilha a que pertence"),
          duration: S('Duração (ex: "12 min") ou vazio'),
          difficulty: { type: "string", enum: ["iniciante", "intermediario", "avancado"], description: "Dificuldade" },
          sprint: S('Número do sprint relacionado como string ("1", "2"...) ou vazio'),
          reason: S("Por que estudar isto para a solução"),
        }),
        "Conteúdos recomendados, agrupáveis por sprint"
      ),
    }),
  },

  savings: {
    name: "savings",
    schema: obj({
      total_without_builder: N("Custo total (R$) com equipe tradicional — soma EXATA dos totais dos profissionais"),
      total_with_builder: N("Custo total (R$) construindo com o Builder (ferramentas + APIs durante a construção; nunca 0)"),
      savings_pct: N("Percentual de economia (0-100) = (sem - com) / sem × 100"),
      traditional_time: S('Prazo com equipe tradicional (ex: "4-6 meses"), coerente com as horas'),
      builder_time: S('Prazo construindo com o Builder (ex: "2-3 semanas")'),
      methodology: S("1-2 frases explicando a base do cálculo (equipe × horas × taxa de mercado vs assinaturas), para credibilidade"),
      professionals: list(
        obj({
          role: S("Cargo (ex: Desenvolvedor Full-Stack Sênior)"),
          rate: S('Taxa de mercado (ex: "R$160/h")'),
          hours: S('Horas estimadas deste profissional (ex: "160h")'),
          total: N("Custo total deste profissional (R$) = taxa × horas"),
        }),
        "Exatamente 6 profissionais que a solução substitui"
      ),
    }),
  },
};

// esqueleto da solução (título + resumos por etapa) — garante todas as 8 chaves
export const SKELETON_SCHEMA: StepSchema = {
  name: "skeleton",
  schema: obj({
    title: S("Nome curto e específico da solução (sem prefixos genéricos)"),
    short_description: S("1-2 frases do que a solução faz, citando elementos da ideia"),
    tags: list(S("Tag curta"), "3-5 tags"),
    step_summaries: obj(
      Object.fromEntries(STEP_ORDER.map((k) => [k, S(`Resumo de 1 frase da etapa "${STEP_META[k].label}" para esta solução`)]))
    ),
  }),
};
