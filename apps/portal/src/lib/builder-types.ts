// lib/builder-types.ts — tipos e constantes PUROS do Builder (sem dependência de DB).
// Seguro para importar em Client Components (não puxa `postgres`).

export const STEP_ORDER = [
  "knowledge_base",
  "framework",
  "architecture",
  "tools",
  "action_plan",
  "prompt_lovable",
  "content",
  "savings",
] as const;
export type StepKey = (typeof STEP_ORDER)[number];

export const STEP_META: Record<StepKey, { label: string; hint: string }> = {
  knowledge_base: { label: "Base de Conhecimento", hint: "5 perguntas · 3 bônus" },
  framework: { label: "Framework", hint: "5 pilares de implementação" },
  architecture: { label: "Arquitetura e Fluxos", hint: "Mapa mental para seu MVP" },
  tools: { label: "Ferramentas", hint: "6 essenciais · alternativas" },
  action_plan: { label: "Plano de Ação", hint: "PM Agent · 3 sprints" },
  prompt_lovable: { label: "Prompt Lovable", hint: "MVP + follow-ups (cole no Lovable)" },
  content: { label: "Conteúdos", hint: "8 aulas por sprint" },
  savings: { label: "Economia", hint: "ROI e profissionais" },
};

export type Answer = { question: string; answer: string };

export type AnalyzeResult = {
  questions: { category: string; question: string; why_important: string }[];
  viability: { level: "high" | "moderate" | "low"; score: number; reason: string; suggestions: string[] };
};

export type BuilderSolution = {
  id: number;
  user_id: number;
  original_idea: string;
  title: string | null;
  short_description: string | null;
  tags: string[];
  user_answers: Answer[];
  step_summaries: Record<string, string>;
  status: "in_progress" | "completed" | "archived";
  created_at: string;
  updated_at: string;
};

export type StepGeneration = {
  id: number;
  solution_id: number;
  step_key: string;
  content: unknown;
  status: "pending" | "generating" | "completed" | "error";
  error_message: string | null;
  model_used: string | null;
  created_at: string;
  updated_at: string;
};
