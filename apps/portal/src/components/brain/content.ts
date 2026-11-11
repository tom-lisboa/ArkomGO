/**
 * Brain flow content (Pkg10 · N6). Verbatim copy of the real /brain flow from the
 * R1 findings (Part A), kept out of the i18n dict because it is long product copy:
 * the 8-section schema, the fast-view draft screen, and the install card all live
 * here as { en, pt } pairs selected via `useLocale()`. Short chrome (button labels,
 * "Listening…", "Copy") stays in the dict.
 *
 * SCHEMA SOURCE OF TRUTH = findings A4 (company, one_liner, offers, icp, clients,
 * voice, tools, notes). The Pkg10 briefing paraphrased a different list
 * (goals/review) — findings is authoritative per No-Invention, so A4 is used.
 *
 * PT policy: concept translated didactically; taxonomy stays EN inside the PT
 * string (Claude Code, SKILL.md, HubSpot/Instantly/Apollo/Stripe/Notion, USD, n8n).
 */

import { useLocalStorage } from "@/lib/use-local-storage";

export type Locale = "en" | "pt";

export interface Bilingual {
  en: string;
  pt: string;
}

/* ---- persisted brain (saved-as-you-go, localStorage) ---- */

export type BrainKey =
  | "company"
  | "one_liner"
  | "offers"
  | "icp"
  | "clients"
  | "voice"
  | "tools"
  | "notes";

export const BRAIN_KEYS: BrainKey[] = [
  "company",
  "one_liner",
  "offers",
  "icp",
  "clients",
  "voice",
  "tools",
  "notes",
];

export type BrainSections = Record<BrainKey, string>;

export interface BrainV2 extends BrainSections {
  completed: boolean;
}

/** Distinct key from the legacy wizard's `skilltree-brain` (different shape). */
export const BRAIN_V2_KEY = "skilltree-brain-v2";

export const EMPTY_BRAIN_V2: BrainV2 = {
  company: "",
  one_liner: "",
  offers: "",
  icp: "",
  clients: "",
  voice: "",
  tools: "",
  notes: "",
  completed: false,
};

/** view gate (findings A0): any filled section OR completed → the steps editor. */
export function brainHasData(b: BrainV2): boolean {
  return b.completed || BRAIN_KEYS.some((k) => b[k].trim().length > 0);
}

export function useBrain() {
  return useLocalStorage<BrainV2>(BRAIN_V2_KEY, EMPTY_BRAIN_V2);
}

/* ---- the 8 sections (findings A4, verbatim) ---- */

export interface BrainSectionSpec {
  key: BrainKey;
  eyebrow: Bilingual;
  question: Bilingual;
  placeholder: Bilingual;
  field: "input" | "textarea";
  optional?: boolean;
}

export const BRAIN_SECTIONS: BrainSectionSpec[] = [
  {
    key: "company",
    field: "input",
    eyebrow: { en: "Company", pt: "Empresa" },
    question: { en: "What's your company called?", pt: "Como sua empresa se chama?" },
    placeholder: { en: "Arkom", pt: "Arkom" },
  },
  {
    key: "one_liner",
    field: "textarea",
    eyebrow: { en: "One-liner", pt: "Resumo em uma linha" },
    question: { en: "In one line, what do you do?", pt: "Em uma linha, o que você faz?" },
    placeholder: {
      en: "We build custom AI employees and outbound systems for agencies.",
      pt: "Construímos funcionários de IA sob medida e sistemas de outbound para agências.",
    },
  },
  {
    key: "offers",
    field: "textarea",
    eyebrow: { en: "Offers", pt: "Ofertas" },
    question: {
      en: "What do you sell? List your offers and rough pricing.",
      pt: "O que você vende? Liste suas ofertas e o preço aproximado.",
    },
    placeholder: {
      en: "e.g. a starter audit, fixed-fee build packages, a monthly retainer for ongoing work",
      pt: "ex.: uma auditoria inicial, pacotes de build com preço fechado, um retainer mensal para o trabalho contínuo",
    },
  },
  {
    key: "icp",
    field: "textarea",
    eyebrow: { en: "Ideal customer", pt: "Cliente ideal" },
    question: { en: "Who's your ideal customer?", pt: "Quem é seu cliente ideal?" },
    placeholder: {
      en: "Founders and agencies doing $50k+/mo who want to scale without hiring more people.",
      pt: "Fundadores e agências faturando $50k+/mês que querem escalar sem contratar mais gente.",
    },
  },
  {
    key: "clients",
    field: "textarea",
    eyebrow: { en: "Proof", pt: "Prova" },
    question: {
      en: "A few clients or results you're proud of?",
      pt: "Alguns clientes ou resultados de que você se orgulha?",
    },
    placeholder: {
      en: "A proposal engine for a marketing agency; a document-extraction pipeline for an accounting firm.",
      pt: "Um motor de propostas para uma agência de marketing; um pipeline de extração de documentos para um escritório de contabilidade.",
    },
  },
  {
    key: "voice",
    field: "textarea",
    eyebrow: { en: "Voice", pt: "Voz" },
    question: {
      en: "How should your agents sound? Paste a sentence or two you'd actually write.",
      pt: "Como seus agentes devem soar? Cole uma frase ou duas que você escreveria de verdade.",
    },
    placeholder: {
      en: "Direct. No fluff. Confident, not pushy. Short over long.",
      pt: "Direto. Sem enrolação. Confiante, não insistente. Curto acima de longo.",
    },
  },
  {
    key: "tools",
    field: "textarea",
    eyebrow: { en: "Stack", pt: "Stack" },
    question: { en: "What tools do you run?", pt: "Quais ferramentas você usa?" },
    placeholder: {
      en: "HubSpot, Instantly, Apollo, Stripe, Notion.",
      pt: "HubSpot, Instantly, Apollo, Stripe, Notion.",
    },
  },
  {
    key: "notes",
    field: "textarea",
    optional: true,
    eyebrow: { en: "Anything else", pt: "Mais alguma coisa" },
    question: {
      en: "Anything else your agents should always know?",
      pt: "Mais alguma coisa que seus agentes devem sempre saber?",
    },
    placeholder: {
      en: "(optional) Prices in USD. Based in Dubai. Never use n8n.",
      pt: "(opcional) Preços em USD. Baseado em Dubai. Nunca usar n8n.",
    },
  },
];

/* ---- fast view (findings A2), verbatim ---- */

export const FAST = {
  heading: {
    en: "Let AI draft your brain.",
    pt: "Deixe a IA rascunhar seu cérebro.",
  } satisfies Bilingual,
  sub: {
    en: "Drop your website and ramble a little about your business — offers, customers, how you sound. Claude drafts all eight sections, you just review and fix. Two minutes instead of ten.",
    pt: "Cole seu site e fale um pouco sobre seu negócio — ofertas, clientes, como você soa. O Claude rascunha as oito seções, você só revisa e ajusta. Dois minutos em vez de dez.",
  } satisfies Bilingual,
  websiteLabel: { en: "Your website", pt: "Seu site" } satisfies Bilingual,
  websitePlaceholder: { en: "arkom.ai", pt: "arkom.ai" } satisfies Bilingual,
  notesLabel: {
    en: "Anything the site doesn't say",
    pt: "Qualquer coisa que o site não diz",
  } satisfies Bilingual,
  /** appended to the notes label only when the browser supports speech. */
  notesLabelTalkSuffix: { en: " · type or talk", pt: " · digite ou fale" } satisfies Bilingual,
  notesPlaceholder: {
    en: "Pricing, favourite clients, how you like to sound, tools you run…",
    pt: "Preços, clientes favoritos, como você gosta de soar, ferramentas que você usa…",
  } satisfies Bilingual,
  hint: {
    en: "5 AI drafts a month per member. Nothing saves until you review it — the next screens are your edit pass.",
    pt: "5 rascunhos de IA por mês por membro. Nada é salvo até você revisar — as próximas telas são sua passada de edição.",
  } satisfies Bilingual,
};

/** minimum notes length to enable the draft button when no website is given. */
export const DRAFT_MIN_NOTES = 80;

/* ---- steps view chrome (findings A4) ---- */

export const STEPS_HINT: Bilingual = {
  en: "Saved as you go. This becomes the brain every skill reads from. Only you can see it.",
  pt: "Salvo enquanto você avança. Isto vira o cérebro do qual toda skill lê. Só você pode ver.",
};

/* ---- install card (findings A6) ---- */

/**
 * Mock stand-in for the {fileUrl} the real product substitutes (the generated
 * SKILL.md download URL). `.example` is the reserved illustrative TLD — signals
 * "not a real endpoint". The "Download it" action generates the file locally.
 */
export const BRAIN_FILE_URL = "https://skilltree.example/brain/SKILL.md";

export const INSTALL = {
  label: {
    en: "Install · paste in your terminal",
    pt: "Instalar · cole no seu terminal",
  } satisfies Bilingual,
  /** OS tab labels stay EN in both locales (OS proper names). */
  osMac: "Mac / Linux",
  osWin: "Windows",
  footMain: {
    en: "Paste it, hit enter, restart Claude Code.",
    pt: "Cole, aperte enter, reinicie o Claude Code.",
  } satisfies Bilingual,
  footFilePrefix: { en: "Prefer the file?", pt: "Prefere o arquivo?" } satisfies Bilingual,
  footFileLink: { en: "Download it", pt: "Baixe aqui" } satisfies Bilingual,
};

export function macCommand(fileUrl: string): string {
  return `mkdir -p ~/.claude/skills/brain && curl -fsSL "${fileUrl}" -o ~/.claude/skills/brain/SKILL.md && echo "Brain installed. Restart Claude Code — every skill now reads it first."`;
}

export function winCommand(fileUrl: string): string {
  return `ni "$HOME\\.claude\\skills\\brain" -ItemType Directory -Force | Out-Null; iwr "${fileUrl}" -OutFile "$HOME\\.claude\\skills\\brain\\SKILL.md"; echo "Brain installed. Restart Claude Code — every skill now reads it first."`;
}

/**
 * Generate the SKILL.md the "Download it" link ships (findings A6). Frontmatter
 * description is verbatim; only filled sections are emitted. The "canonical
 * paragraph" from A6 is omitted — its exact text was not captured (No-Invention).
 */
export function generateSkillMd(brain: BrainSections): string {
  const company = brain.company.trim() || "your company";
  const description = `The company brain for ${company}. Who we are, what we sell, who we serve, and how we sound. Read this before any task so output sounds like us.`;

  const sections: { heading: string; value: string }[] = [
    { heading: "What we do", value: brain.one_liner },
    { heading: "What we sell", value: brain.offers },
    { heading: "Who we serve", value: brain.icp },
    { heading: "Proof", value: brain.clients },
    { heading: "Voice", value: brain.voice },
    { heading: "Stack", value: brain.tools },
    { heading: "Always know", value: brain.notes },
  ];

  const body = sections
    .filter((s) => s.value.trim().length > 0)
    .map((s) => `## ${s.heading}\n${s.value.trim()}`)
    .join("\n\n");

  return `---\nname: brain\ndescription: ${description}\n---\n\n# Brain · ${company}\n\n${body}\n`;
}
