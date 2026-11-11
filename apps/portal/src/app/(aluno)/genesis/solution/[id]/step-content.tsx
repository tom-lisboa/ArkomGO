"use client";

// Roteador de renderização por etapa: usa o componente DEDICADO (step-renderers) quando
// os dados esperados existem; senão cai no render genérico (seções/cards) — THEME-AWARE.

import {
  KnowledgeBase,
  Framework,
  Architecture,
  Tools,
  ActionPlan,
  Content,
  Savings,
  PromptLovable,
  isObj,
  pick,
  arr,
  type Obj,
} from "./step-renderers";
import { GenericValue } from "./step-generic";

export function StepContent({ stepKey, content }: { stepKey?: string; content: unknown }) {
  if (!isObj(content)) return <GenericValue value={content} />;
  const c: Obj = content;
  const has = (...keys: string[]) => keys.some((k) => arr(pick(c, k)).length > 0);

  switch (stepKey) {
    case "knowledge_base":
      if (has("insights", "mandatory_qa", "bonus_qa", "perguntas_obrigatorias")) return <KnowledgeBase c={c} />;
      break;
    case "framework":
      if (["data", "prompt", "models", "automation", "interface"].some((k) => c[k] !== undefined)) return <Framework c={c} />;
      break;
    case "architecture":
      if (has("main_flow", "fluxo_principal", "alt_flows")) return <Architecture c={c} />;
      break;
    case "tools":
      if (has("tools", "ferramentas")) return <Tools c={c} />;
      break;
    case "action_plan":
      if (has("sprints")) return <ActionPlan c={c} />;
      break;
    case "content":
      if (has("contents", "conteudos")) return <Content c={c} />;
      break;
    case "savings":
      if (c.total_without_builder !== undefined || c.savings_pct !== undefined || arr(pick(c, "professionals")).length) return <Savings c={c} />;
      break;
    case "prompt_lovable":
      if (has("prompts")) return <PromptLovable c={c} />;
      break;
  }
  // fallbacks por forma (independe do stepKey)
  if (arr(pick(c, "prompts")).length) return <PromptLovable c={c} />;
  if (arr(pick(c, "tools", "ferramentas")).length) return <Tools c={c} />;
  return <GenericValue value={c} />;
}
