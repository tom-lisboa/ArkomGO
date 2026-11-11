// lib/builder.ts — Motor do Builder (gerador de soluções por IA).
//
// Fluxo: ideia → análise (perguntas + viabilidade) → wizard de respostas → geração do
// esqueleto (solução + resumos das 8 etapas) → geração por etapa (uma por vez, com DAG de
// dependências). O "cérebro" fica no motor de prompts data-driven `builder_prompt_configs`
// (semeado via migration 0006).
//
// LLM: usa ANTHROPIC_API_KEY (ou AI_API_KEY) se presente; senão cai num MOCK determinístico
// para o fluxo ser 100% testável localmente sem chave. Ver .env.example.

import { getEducacionalSql } from "@/lib/db";
import { STEP_ORDER, STEP_META } from "@/lib/builder-types";
import type { StepKey, Answer, AnalyzeResult, BuilderSolution, StepGeneration } from "@/lib/builder-types";
import { STEP_SCHEMAS, ANALYZE_SCHEMA, QUESTIONS_SCHEMA, SKELETON_SCHEMA, type StepSchema } from "@/lib/builder-schema";

// re-export para o lado servidor (actions) continuar importando de "@/lib/builder"
export { STEP_ORDER, STEP_META };
export type { StepKey, Answer, AnalyzeResult, BuilderSolution, StepGeneration };

type PromptConfig = {
  step_key: string;
  system_prompt: string | null;
  user_prompt_template: string | null;
  price_catalog: string | null;
  anti_generic_rules: string | null;
};

// ============================ Cliente LLM ============================

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || "";
const ANTHROPIC_MODEL = process.env.AI_MODEL || "claude-sonnet-5";
const CENTRAL_URL = process.env.CENTRAL_SUPABASE_URL || "";
const CENTRAL_SR = process.env.CENTRAL_SUPABASE_SERVICE_ROLE_KEY || "";
const OPENAI_MODEL = process.env.AI_MODEL_OPENAI || "gpt-4o-mini";
// provider: explícito via LLM_PROVIDER, senão auto (anthropic se houver chave; openai via central; senão mock)
const PROVIDER = (process.env.LLM_PROVIDER ||
  (ANTHROPIC_KEY ? "anthropic" : CENTRAL_URL && CENTRAL_SR ? "openai" : "mock")) as
  | "openai"
  | "anthropic"
  | "mock";
export const llmMode = PROVIDER;

/** Extrai o objeto/array JSON de uma resposta do LLM (tolera prosa e cercas de código). */
function extractJson<T>(text: string): T {
  let t = text.trim();
  // só remove cercas se a resposta INTEIRA estiver cercada (começa com ```) — nunca cercas
  // internas (os prompts gerados contêm blocos de código ``` que NÃO devem ser extraídos)
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  const firstObj = t.indexOf("{");
  const firstArr = t.indexOf("[");
  let start = -1;
  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);
  if (start === -1) throw new Error("sem JSON na resposta");
  const close = t[start] === "{" ? "}" : "]";
  const end = t.lastIndexOf(close);
  if (end <= start) throw new Error("JSON incompleto");
  return JSON.parse(t.slice(start, end + 1)) as T;
}

/** OpenAI via edge do central (proxy bai_builder-llm, usa OPENAI_API_KEY do runtime).
 *  Se `schema` vier, o proxy usa Structured Outputs (json_schema strict) → saída normalizada. */
async function callOpenAI(system: string, user: string, schema?: StepSchema): Promise<{ text: string; model: string }> {
  const res = await fetch(`${CENTRAL_URL}/functions/v1/bai_builder-llm`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: CENTRAL_SR, authorization: `Bearer ${CENTRAL_SR}` },
    body: JSON.stringify({
      system: system + "\n\nResponda APENAS com um objeto JSON válido.",
      user,
      max_tokens: 16000,
      model: OPENAI_MODEL,
      ...(schema ? { schema_name: schema.name, schema: schema.schema } : {}),
    }),
  });
  const j = (await res.json()) as { text?: string; model?: string; error?: string };
  if (!res.ok || j.error) throw new Error(`central-openai ${res.status}: ${j.error ?? ""}`);
  return { text: j.text ?? "", model: j.model ?? OPENAI_MODEL };
}

/** Erro de provider com hint de espera (respeita retry-after em 429/529). */
type ProviderError = Error & { retryAfterMs?: number };

/** Anthropic direto (usa ANTHROPIC_API_KEY).
 *  Com `schema`, força uma tool com input_schema = contrato da etapa (structured output):
 *  a resposta vem como tool_use.input já no formato exato que os renderers leem — sem
 *  parse de texto, sem chaves inventadas e sem blocos de thinking (mais rápido). */
async function callAnthropic(
  system: string,
  user: string,
  schema?: StepSchema
): Promise<{ text: string; data?: unknown; model: string }> {
  const body: Record<string, unknown> = {
    model: ANTHROPIC_MODEL,
    max_tokens: 16000,
    system: schema ? system : system + "\n\nResponda APENAS com um objeto JSON válido, sem markdown, sem cercas de código.",
    messages: [{ role: "user", content: user }],
  };
  if (schema) {
    body.tools = [{ name: schema.name, description: "Registra o resultado estruturado da etapa.", input_schema: schema.schema }];
    body.tool_choice = { type: "tool", name: schema.name };
    // tool_choice forçada é incompatível com thinking — desabilita explicitamente
    // (também elimina os tokens de thinking, acelerando a geração). Exceção: nos
    // modelos fable/mythos o thinking é sempre ativo e um "disabled" explícito dá 400
    // — nesses, omitir o parâmetro.
    if (!/fable|mythos/i.test(ANTHROPIC_MODEL)) body.thinking = { type: "disabled" };
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err: ProviderError = new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const retryAfter = Number(res.headers.get("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) err.retryAfterMs = retryAfter * 1000;
    throw err;
  }
  const json = (await res.json()) as { content?: { type?: string; text?: string; input?: unknown }[] };
  const toolUse = (json.content ?? []).find((c) => c.type === "tool_use");
  if (schema && toolUse && toolUse.input !== undefined) {
    return { text: "", data: toolUse.input, model: ANTHROPIC_MODEL };
  }
  // fallback texto (sem schema, ou se o modelo respondeu em texto): pegar só blocos "text"
  const text = (json.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("");
  return { text, model: ANTHROPIC_MODEL };
}

/** Chama o LLM (provider configurado) e retorna JSON. Retenta com backoff (respeita
 *  retry-after em 429/529) e, se o provider real falhar todas as tentativas, LANÇA —
 *  a etapa fica 'error' e o usuário regenera. Nunca persiste mock como se fosse
 *  conteúdo real (mock só existe quando PROVIDER === "mock", para testes sem chave).
 *  `schema` (opcional) força a saída normalizada nos DOIS providers: Structured Outputs
 *  (json_schema strict) no OpenAI e tool forçada no Anthropic. */
async function callLLMJson<T>(
  system: string,
  user: string,
  mock: () => T,
  schema?: StepSchema
): Promise<{ data: T; model: string }> {
  if (PROVIDER === "mock") return { data: mock(), model: "mock" };
  let lastErr: unknown;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const r = PROVIDER === "openai" ? await callOpenAI(system, user, schema) : await callAnthropic(system, user, schema);
      const data = "data" in r && r.data !== undefined ? (r.data as T) : extractJson<T>(r.text);
      return { data, model: r.model };
    } catch (err) {
      lastErr = err;
      if (tentativa < 3) {
        const hint = (err as ProviderError).retryAfterMs;
        await new Promise((resolve) => setTimeout(resolve, Math.min(hint ?? 1500 * tentativa, 30_000)));
      }
    }
  }
  throw new Error(`LLM falhou após 3 tentativas: ${(lastErr as Error)?.message}`);
}

// ============================ Motor de prompts ============================

async function getConfig(stepKey: string): Promise<PromptConfig | null> {
  const sql = getEducacionalSql();
  const rows = await sql<PromptConfig[]>`
    SELECT step_key, system_prompt, user_prompt_template, price_catalog, anti_generic_rules
    FROM builder_prompt_configs WHERE step_key = ${stepKey} AND is_active LIMIT 1
  `;
  return rows[0] ?? null;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function answersContext(answers: Answer[]): string {
  if (!answers.length) return "";
  return "RESPOSTAS DO USUÁRIO:\n" + answers.map((a) => `- ${a.question}\n  → ${a.answer}`).join("\n");
}

// ============================ Perguntas padrão (fallback) ============================

const DEFAULT_QUESTIONS: AnalyzeResult["questions"] = [
  { category: "Público-alvo", question: "Quem é o público-alvo principal da sua solução?", why_important: "Define a experiência ideal." },
  { category: "Problema", question: "Qual é o maior problema que você quer resolver?", why_important: "Define o foco da solução." },
  { category: "Ferramentas atuais", question: "Quais ferramentas ou sistemas você já usa hoje?", why_important: "A IA integra com o que você já tem." },
  { category: "Resultado esperado", question: "Qual seria o resultado ideal após implementar essa solução?", why_important: "Define métricas e objetivos." },
  { category: "Nível técnico", question: "Qual é o seu nível técnico com ferramentas de IA e automação?", why_important: "Adapta a solução ao seu nível." },
];

// ============================ analyze-idea ============================

export async function analyzeIdea(idea: string): Promise<AnalyzeResult> {
  const system =
    "Você é um arquiteto de soluções de IA. Dada a IDEIA do usuário, gere 5 perguntas de qualificação " +
    "ESPECÍFICAS a essa ideia — NÃO genéricas. Cada pergunta deve citar elementos concretos da ideia " +
    "(canais, público, ferramentas, regras mencionadas). Distribua os temas entre: canal/interface, público-alvo, " +
    "integrações/ferramentas atuais, regras de negócio e volume/orçamento — sempre aterrando na ideia dada. " +
    "Ex.: se a ideia fala de qualificar leads no WhatsApp, pergunte algo como 'Onde o agente deve atuar — só " +
    "WhatsApp, ou também Instagram DM e site?'. Inclua também uma avaliação de viabilidade " +
    "(level: high|moderate|low, score 0-10, reason, suggestions[]). Use português brasileiro.";
  const { data } = await callLLMJson<AnalyzeResult>(
    system,
    `IDEIA: "${idea}"`,
    () => ({
      questions: DEFAULT_QUESTIONS,
      viability: {
        level: "high",
        score: 8,
        reason: "Ideia clara e construível com Lovable + Supabase.",
        suggestions: ["Comece pelo MVP com o fluxo principal.", "Use os free tiers para validar antes de escalar."],
      },
    }),
    ANALYZE_SCHEMA
  );
  if (!data.questions?.length) data.questions = DEFAULT_QUESTIONS;
  return data;
}

// perguntas ADICIONAIS (mais profundas) — o "responder mais" da jornada
const DEEPER_QUESTIONS: AnalyzeResult["questions"] = [
  { category: "Volume", question: "Qual o volume esperado (usuários, mensagens ou operações por dia/mês)?", why_important: "Dimensiona a arquitetura e os custos." },
  { category: "Integrações", question: "Com quais sistemas ou APIs a solução precisa se integrar?", why_important: "Define os conectores e as fontes de dados." },
  { category: "Prazo", question: "Qual o prazo desejado para colocar a solução no ar?", why_important: "Ajusta o escopo do MVP." },
  { category: "Diferencial", question: "O que não pode faltar de jeito nenhum na primeira versão?", why_important: "Prioriza o essencial do MVP." },
  { category: "Métrica", question: "Como você vai medir que a solução deu certo?", why_important: "Define os indicadores de sucesso." },
];

export async function moreQuestions(idea: string, answers: Answer[]): Promise<AnalyzeResult["questions"]> {
  const system =
    "Você é um arquiteto de soluções de IA. Gere 5 perguntas ADICIONAIS e mais profundas " +
    "(category, question, why_important) que aprofundam a solução com base na ideia e nas respostas já dadas — " +
    "sem repetir o que já foi perguntado. Use português brasileiro.";
  const user =
    `IDEIA: "${idea}"\n${answersContext(answers)}\n\n` +
    `Gere 5 novas perguntas em JSON: {"questions":[{"category","question","why_important"}]}.`;
  const { data } = await callLLMJson<{ questions: AnalyzeResult["questions"] }>(
    system,
    user,
    () => ({ questions: DEEPER_QUESTIONS }),
    QUESTIONS_SCHEMA
  );
  return data.questions?.length ? data.questions.slice(0, 5) : DEEPER_QUESTIONS;
}

// ============================ generate-skeleton ============================

type SkeletonOut = {
  title: string;
  short_description: string;
  tags: string[];
  step_summaries: Record<string, string>;
};

export async function generateSkeleton(
  userId: number,
  idea: string,
  answers: Answer[]
): Promise<BuilderSolution> {
  const base = await getConfig("base_system");
  const system =
    (base?.system_prompt ?? "Você é um arquiteto de soluções que desenha soluções construíveis com Lovable + Supabase.") +
    (base?.price_catalog ? `\n\n${base.price_catalog}` : "") +
    (base?.anti_generic_rules ? `\n\n${base.anti_generic_rules}` : "");
  const user =
    `IDEIA: "${idea}"\n${answersContext(answers)}\n\n` +
    `Gere um esqueleto da solução em JSON: {title, short_description, tags[], step_summaries} onde step_summaries ` +
    `tem uma frase por etapa para as chaves: ${STEP_ORDER.join(", ")}.`;

  const { data } = await callLLMJson<SkeletonOut>(system, user, () => mockSkeleton(idea, answers), SKELETON_SCHEMA);

  const sql = getEducacionalSql();
  const [row] = await sql<BuilderSolution[]>`
    INSERT INTO builder_solutions (user_id, original_idea, title, short_description, tags, user_answers, step_summaries, status)
    VALUES (
      ${userId}, ${idea}, ${data.title ?? null}, ${data.short_description ?? null},
      ${data.tags ?? []}, ${sql.json(answers)}, ${sql.json(data.step_summaries ?? {})}, 'in_progress'
    )
    RETURNING *
  `;
  return row;
}

// ============================ generate-step ============================

/** Aguarda a etapa sair de 'generating' (polling leve). Retorna a row final, ou null
 *  se ela não existir / continuar gerando após o timeout. */
async function waitForStep(solutionId: number, stepKey: string, timeoutMs = 150_000): Promise<StepGeneration | null> {
  const sql = getEducacionalSql();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [row] = await sql<StepGeneration[]>`
      SELECT * FROM builder_step_generations WHERE solution_id = ${solutionId} AND step_key = ${stepKey}
    `;
    if (!row || row.status !== "generating") return row ?? null;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
}

export async function generateStep(solutionId: number, stepKey: StepKey, depth = 0): Promise<StepGeneration> {
  const sql = getEducacionalSql();
  const sol = await getSolution(solutionId);
  if (!sol) throw new Error("Solução não encontrada");

  // Claim atômico da etapa: evita geração DUPLICADA (dois cliques, navegar-e-voltar,
  // refresh no meio da cascata — cada um re-POSTa as etapas não concluídas). Só
  // reivindica se a etapa não está 'generating' fresca; senão faz "join": aguarda a
  // geração em andamento terminar e devolve o resultado dela, sem pagar outra chamada.
  // O updated_at do claim (::text preserva os microssegundos que o driver perderia)
  // vira o FENCE dos writes finais: se outra request roubar o claim (branch dos 3 min),
  // o perdedor descarta o próprio resultado em vez de sobrescrever o do vencedor.
  const claimed = await sql<{ id: number; claim_ts: string }[]>`
    INSERT INTO builder_step_generations (solution_id, step_key, status)
    VALUES (${solutionId}, ${stepKey}, 'generating')
    ON CONFLICT (solution_id, step_key) DO UPDATE
      SET status = 'generating', error_message = NULL, updated_at = now()
      WHERE builder_step_generations.status <> 'generating'
         OR builder_step_generations.updated_at < now() - interval '3 minutes'
    RETURNING id, updated_at::text AS claim_ts
  `;
  if (!claimed.length) {
    // Join numa savings em voo só é válido se ela começou DEPOIS da última tools
    // completada — senão foi calculada com custos velhos (o conteúdo de tools é lido
    // no início da geração). Nesse caso espera a antiga terminar e gera uma nova.
    // As épocas do client cobrem o caso comum; esta checagem cobre o que o client não
    // vê (outra aba, fetch derrubado com o servidor ainda gerando).
    if (stepKey === "savings" && depth < 2) {
      const [stale] = await sql<{ is_stale: boolean }[]>`
        SELECT s.updated_at < t.updated_at AS is_stale
        FROM builder_step_generations s
        JOIN builder_step_generations t
          ON t.solution_id = s.solution_id AND t.step_key = 'tools' AND t.status = 'completed'
        WHERE s.solution_id = ${solutionId} AND s.step_key = 'savings' AND s.status = 'generating'
      `;
      if (stale?.is_stale) {
        await waitForStep(solutionId, "savings");
        return generateStep(solutionId, stepKey, depth + 1);
      }
    }
    const joined = await waitForStep(solutionId, stepKey);
    if (joined) return joined;
    const [row] = await sql<StepGeneration[]>`
      SELECT * FROM builder_step_generations WHERE solution_id = ${solutionId} AND step_key = ${stepKey}
    `;
    return row;
  }
  const claimTs = claimed[0].claim_ts;

  const cfg = await getConfig(stepKey);
  const base = await getConfig("base_system");
  const started = Date.now();

  // depContext = resumos CURTOS das etapas (do esqueleto) — leve, mantém coerência sem inflar o input
  const summ = sol.step_summaries ?? {};
  const depKeys = STEP_ORDER.filter((k) => summ[k]);
  let depContext = depKeys.length
    ? "RESUMO DAS ETAPAS DA SOLUÇÃO:\n" + depKeys.map((k) => `- ${STEP_META[k].label}: ${summ[k]}`).join("\n")
    : "";

  // A economia soma os custos REAIS das ferramentas — injeta o output do step "tools"
  // quando concluído. O client encadeia savings após tools; se mesmo assim tools ainda
  // estiver gerando (corrida residual), espera aqui antes de calcular.
  if (stepKey === "savings") {
    await waitForStep(solutionId, "tools", 90_000);
    const [toolsRow] = await sql<{ content: unknown }[]>`
      SELECT content FROM builder_step_generations
      WHERE solution_id = ${solutionId} AND step_key = 'tools' AND status = 'completed'
    `;
    const items = (toolsRow?.content as { tools?: { name?: string; cost?: string; essential?: boolean }[] } | null)?.tools;
    if (Array.isArray(items) && items.length) {
      depContext +=
        "\n\nFERRAMENTAS ESCOLHIDAS PARA A SOLUÇÃO (step Ferramentas — use ESTES custos no cálculo com o Builder):\n" +
        items.map((t) => `- ${t.name ?? "?"}: ${t.cost ?? "?"}${t.essential ? " (essencial)" : ""}`).join("\n");
    }
  }

  // system = base (arquiteto + catálogo + regras) + extensões específicas da etapa
  // (ex: prompt_lovable tem system próprio com a regra dos 8 prompts; savings tem
  // catálogo próprio de taxas de mercado)
  const system = [
    base?.system_prompt,
    base?.price_catalog,
    base?.anti_generic_rules,
    cfg?.system_prompt,
    cfg?.price_catalog,
    cfg?.anti_generic_rules,
  ]
    .filter(Boolean)
    .join("\n\n");
  const template = cfg?.user_prompt_template ?? `IDEIA: "{{idea}}"\n{{answersContext}}\n\nGere o conteúdo da etapa ${stepKey} em JSON.`;
  const user = fill(template, {
    idea: sol.original_idea,
    answersContext: answersContext(sol.user_answers),
    depContext,
  });

  try {
    const { data, model } = await callLLMJson<unknown>(system, user, () => mockStep(stepKey, sol), STEP_SCHEMAS[stepKey]);
    const [row] = await sql<StepGeneration[]>`
      UPDATE builder_step_generations
      SET content = ${sql.json(data as never)}, status = 'completed', model_used = ${model},
          generation_time_ms = ${Date.now() - started}, error_message = NULL, updated_at = now()
      WHERE solution_id = ${solutionId} AND step_key = ${stepKey}
        AND status = 'generating' AND updated_at::text = ${claimTs}
      RETURNING *
    `;
    if (row) return row;
  } catch (err) {
    // Falha na geração: se a row já tem conteúdo de uma geração anterior (fluxo
    // "Regerar"), reverte para 'completed' — nunca esconder conteúdo bom por causa
    // de uma regeração falha. error_message registra a falha para diagnóstico.
    const [row] = await sql<StepGeneration[]>`
      UPDATE builder_step_generations
      SET status = CASE WHEN content IS NOT NULL THEN 'completed' ELSE 'error' END,
          error_message = ${(err as Error).message}, updated_at = now()
      WHERE solution_id = ${solutionId} AND step_key = ${stepKey}
        AND status = 'generating' AND updated_at::text = ${claimTs}
      RETURNING *
    `;
    if (row) return row;
  }
  // Fence falhou: outra request roubou o claim durante esta geração (que passou dos
  // 3 min). O resultado dela é o válido — espera terminar e devolve o estado dela.
  const stolen = await waitForStep(solutionId, stepKey);
  if (stolen) return stolen;
  const [current] = await sql<StepGeneration[]>`
    SELECT * FROM builder_step_generations WHERE solution_id = ${solutionId} AND step_key = ${stepKey}
  `;
  return current;
}

// ============================ Leitura ============================

export async function getSolution(id: number): Promise<BuilderSolution | null> {
  const sql = getEducacionalSql();
  const rows = await sql<BuilderSolution[]>`SELECT * FROM builder_solutions WHERE id = ${id}`;
  return rows[0] ?? null;
}

/** Solução do usuário (checa dono) — evita IDOR (dono validado). */
export async function getUserSolution(id: number, userId: number): Promise<BuilderSolution | null> {
  const sql = getEducacionalSql();
  const rows = await sql<BuilderSolution[]>`SELECT * FROM builder_solutions WHERE id = ${id} AND user_id = ${userId}`;
  return rows[0] ?? null;
}

export async function listSolutions(userId: number): Promise<BuilderSolution[]> {
  const sql = getEducacionalSql();
  return sql<BuilderSolution[]>`
    SELECT * FROM builder_solutions WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50
  `;
}

export async function getSteps(solutionId: number): Promise<StepGeneration[]> {
  const sql = getEducacionalSql();
  return sql<StepGeneration[]>`
    SELECT * FROM builder_step_generations WHERE solution_id = ${solutionId} ORDER BY created_at ASC
  `;
}

// ============================ Mocks determinísticos ============================

function mockSkeleton(idea: string, answers: Answer[]): SkeletonOut {
  const nome = idea.slice(0, 48).replace(/\s+/g, " ").trim();
  const publico = answers.find((a) => /público/i.test(a.question))?.answer ?? "seu público";
  return {
    title: `Solução: ${nome}`,
    short_description: `Solução no-code (Lovable + Supabase) para ${publico}, automatizando o fluxo descrito na ideia.`,
    tags: ["Lovable", "Supabase", "Automação", "No-Code"],
    step_summaries: Object.fromEntries(
      STEP_ORDER.map((k) => [k, `${STEP_META[k].label}: gerado a partir da ideia "${nome}".`])
    ),
  };
}

function mockStep(stepKey: StepKey, sol: BuilderSolution): unknown {
  const idea = sol.original_idea.slice(0, 60);
  switch (stepKey) {
    case "tools":
      return {
        tools: [
          { name: "Lovable", category: "Builder", cost: "R$0/mês (Free)", why_good: "Gera o app React + Supabase sem código.", essential: true },
          { name: "Supabase", category: "Backend", cost: "R$0/mês (Free)", why_good: "Banco + Auth + Edge Functions.", essential: true },
        ],
      };
    case "action_plan":
      return {
        sprints: [
          { name: "Sprint 1 — Fundação", tasks: ["Criar tabelas + RLS no Supabase", "Conectar Supabase ao Lovable", "Layout base"] },
          { name: "Sprint 2 — Construção", tasks: ["Tela principal", "CRUD + filtros", "Telas secundárias"] },
          { name: "Sprint 3 — Polish", tasks: ["Dashboard de métricas", "Realtime", "Deploy"] },
        ],
      };
    case "prompt_lovable":
      return {
        prompts: Array.from({ length: 8 }, (_, i) => ({
          id: String(i + 1),
          title: `Prompt ${i + 1}`,
          content: `Prompt ${i + 1} para construir "${idea}" no Lovable + Supabase (mock — configure ANTHROPIC_API_KEY para geração real).`,
        })),
      };
    case "savings":
      return {
        total_without_builder: 113200,
        total_with_builder: 1240,
        savings_pct: 99,
        traditional_time: "3-4 meses",
        builder_time: "2-3 semanas",
        methodology:
          "Equipe de 6 profissionais a taxas de mercado BR (720h totais) vs assinaturas das ferramentas no-code durante a construção (mock — configure ANTHROPIC_API_KEY para geração real).",
        professionals: [
          { role: "Tech Lead / Arquiteto", rate: "R$220/h", hours: "80h", total: 17600 },
          { role: "Dev Full-Stack Sênior", rate: "R$160/h", hours: "240h", total: 38400 },
          { role: "Engenheiro de IA", rate: "R$200/h", hours: "120h", total: 24000 },
          { role: "Product Manager", rate: "R$140/h", hours: "100h", total: 14000 },
          { role: "Designer UI/UX", rate: "R$120/h", hours: "100h", total: 12000 },
          { role: "QA / Tester", rate: "R$90/h", hours: "80h", total: 7200 },
        ],
      };
    default:
      return { summary: `${STEP_META[stepKey].label} para "${idea}" (mock — configure ANTHROPIC_API_KEY para geração real).` };
  }
}
