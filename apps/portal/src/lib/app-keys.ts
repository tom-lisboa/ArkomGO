// lib/app-keys.ts — "Ferramentas necessárias" da tela interna do app.
//
// MOCK (autorizado pelo dono: "pode ser mockado"): não há coluna no schema para
// as ferramentas, então mapeamos por substring do TÍTULO do app para uma lista
// curada. resolveSolutionKeys(title) devolve a solução casada ou o fallback
// genérico (todo app mostra o card). Espelha o padrão do bilhon-solutions
// (components/apps/app-keys.ts + lib/app-keys.ts).

export type ToolRequirement = "required" | "optional" | "alternative";

export interface SolutionTool {
  name: string;
  requirement: ToolRequirement;
  /** nota curta (ex.: "alternativa ao Evolution"). */
  note?: string;
}

export interface SolutionKeys {
  label: string;
  tools: SolutionTool[];
}

/** Curadoria por solução — chave = substring que casa com o título do app. */
const SOLUTION_KEYS: Record<string, SolutionKeys> = {
  "bia-sdr": {
    label: "SDR · Bia",
    tools: [
      { name: "Evolution API (WhatsApp)", requirement: "required" },
      { name: "ElevenLabs (voz/áudio)", requirement: "optional" },
      { name: "Meta / WhatsApp oficial", requirement: "alternative", note: "alternativa ao Evolution" },
    ],
  },
  desk: {
    label: "Atendimento · Desk",
    tools: [
      { name: "Evolution API (WhatsApp)", requirement: "required" },
      { name: "Base de conhecimento (RAG)", requirement: "optional" },
      { name: "Meta / WhatsApp oficial", requirement: "alternative", note: "alternativa ao Evolution" },
    ],
  },
  finance: {
    label: "FinanceAI",
    tools: [
      { name: "Asaas (cobrança)", requirement: "required" },
      { name: "Banco Inter (open finance)", requirement: "optional" },
      { name: "PlugNotas (NF-e/NFS-e)", requirement: "optional" },
      { name: "NFS-e Nacional", requirement: "alternative", note: "alternativa ao PlugNotas" },
    ],
  },
  social: {
    label: "Redes Sociais",
    tools: [
      { name: "Post for Me (agendamento)", requirement: "required" },
      { name: "OpenAI / Claude (copy)", requirement: "optional" },
      { name: "Meta / Instagram Graph", requirement: "alternative", note: "publicação nativa" },
    ],
  },
  ads: {
    label: "Ads Manager",
    tools: [
      { name: "Meta Ads (Marketing API)", requirement: "required" },
      { name: "Google Ads", requirement: "optional" },
    ],
  },
  cmo: {
    label: "Agente CMO",
    tools: [
      { name: "Meta Ads (Marketing API)", requirement: "required" },
      { name: "OpenAI / Claude", requirement: "optional" },
      { name: "Google Ads", requirement: "alternative" },
    ],
  },
};

/** Fallback genérico — todo app remixável precisa disto. */
const DEFAULT_KEYS: SolutionKeys = {
  label: "Base do remix",
  tools: [
    { name: "Lovable (build do app)", requirement: "required" },
    { name: "Supabase (banco + auth)", requirement: "required" },
    { name: "OpenAI / Claude (IA)", requirement: "optional" },
  ],
};

/** Casa o título do app com uma solução curada (substring, case-insensitive). */
const MATCHERS: [RegExp, string][] = [
  [/\bbia\b|\bsdr\b/i, "bia-sdr"],
  [/atendimento|desk/i, "desk"],
  [/finance|financ/i, "finance"],
  [/social|redes/i, "social"],
  [/\bads\b|an[úu]ncio/i, "ads"],
  [/\bcmo\b/i, "cmo"],
];

export function resolveSolutionKeys(appTitle: string): SolutionKeys {
  const title = appTitle ?? "";
  for (const [re, key] of MATCHERS) {
    if (re.test(title)) return SOLUTION_KEYS[key];
  }
  return DEFAULT_KEYS;
}

export function countRequired(tools: SolutionTool[]): number {
  return tools.filter((t) => t.requirement === "required").length;
}
