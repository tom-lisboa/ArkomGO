/**
 * Module detail content (Pkg10 · N5). Verbatim lesson inventory of the 3 live
 * modules from the R1 findings (Part B4), kept out of the i18n dict on purpose:
 * lesson titles/blurbs and module outcomes are long verbatim copy, so they live
 * here as { en, pt } pairs selected via `useLocale()`. Short chrome (eyebrows,
 * "You'll walk away with", "Next module", the Done pill) stays in the dict.
 *
 * PT policy (3 layers): the concept is translated didactically; product taxonomy
 * stays EN inside the PT string — Claude Code, CLAUDE.md, VS Code, MCP, Notion,
 * Obsidian, SKILL.md, brain-ingest, Arkom, ROI, CRM.
 *
 * No-Invention: every EN string is verbatim from the logged original. The full
 * lesson article bodies were NOT captured (R1 B5 recorded structure only), so
 * lesson rows are rendered read-only — there is no fabricated reader route.
 */

export type ModuleSlug = "start-here" | "foundations" | "second-brain";

export interface Bilingual {
  en: string;
  pt: string;
}

export interface DetailLesson {
  done: boolean;
  title: Bilingual;
  blurb: Bilingual;
  /** duration label — identical across locales ("3 min"). */
  min: string;
}

export interface ModuleDetailData {
  slug: ModuleSlug;
  /** two-digit module number ("01"). */
  num: string;
  /** module proper name — stays EN in both locales (matches the index cards). */
  title: string;
  outcome: Bilingual;
  progress: { done: number; total: number };
  lessons: DetailLesson[];
  /** previous module (module name, EN). Absent on module 01. */
  prev?: { label: string; href: string };
  /** next step. `isMap` renders the translated "Explore the map" from the dict. */
  next: { label: string; href: string; isMap?: boolean };
}

export const MODULE_DETAIL: Record<ModuleSlug, ModuleDetailData> = {
  "start-here": {
    slug: "start-here",
    num: "01",
    title: "Start Here",
    outcome: {
      en: "The map, the dashboards, and the brain make sense, you can spot AI opportunities worth building, and you have a 7-day plan to get your first AI employee and command center live.",
      pt: "O mapa, os dashboards e o cérebro fazem sentido, você identifica oportunidades de IA que valem a pena, e tem um plano de 7 dias para colocar seu primeiro funcionário de IA e central de comando no ar.",
    },
    progress: { done: 5, total: 8 },
    lessons: [
      {
        done: true,
        title: { en: "Welcome to Arkom", pt: "Bem-vindo ao Arkom" },
        blurb: {
          en: "What Arkom is · the map, the dashboards, the brain · and what you'll have running by the end of the path.",
          pt: "O que é o Arkom · o mapa, os dashboards, o cérebro · e o que você vai ter rodando ao fim do caminho.",
        },
        min: "3 min",
      },
      {
        done: true,
        title: { en: "You Don't Need to Be Technical", pt: "Você não precisa ser técnico" },
        blurb: {
          en: "Why coding ability is no longer the barrier · the real skill is knowing what to build and how to direct Claude.",
          pt: "Por que saber programar deixou de ser a barreira · a habilidade real é saber o que construir e como dirigir o Claude.",
        },
        min: "4 min",
      },
      {
        done: true,
        title: {
          en: "Where AI Is Right Now and Where It's Going",
          pt: "Onde a IA está agora e para onde vai",
        },
        blurb: {
          en: "The tools are already good enough; the moat is context. Why the next two years are won on structured knowledge.",
          pt: "As ferramentas já são boas o suficiente; o fosso é o contexto. Por que os próximos dois anos se ganham no conhecimento estruturado.",
        },
        min: "4 min",
      },
      {
        done: true,
        title: { en: "How to Think About AI Systems", pt: "Como pensar em sistemas de IA" },
        blurb: {
          en: "The ROI-first, jobs-to-be-done framework for finding what's actually worth building instead of impressive toys.",
          pt: "O framework ROI-first e jobs-to-be-done para achar o que de fato vale construir, em vez de brinquedos impressionantes.",
        },
        min: "5 min",
      },
      {
        done: true,
        title: { en: "The Audit Mindset", pt: "A mentalidade de auditoria" },
        blurb: {
          en: "How to find automation opportunities in any business, and the simple ROI table that changes the conversation.",
          pt: "Como achar oportunidades de automação em qualquer negócio, e a tabela de ROI simples que muda a conversa.",
        },
        min: "6 min",
      },
      {
        done: false,
        title: { en: "The Optimal Tool Stack", pt: "O stack de ferramentas ideal" },
        blurb: {
          en: "A layered map of the modern AI stack · Claude ecosystem, knowledge, CRM, research, outbound, infra.",
          pt: "Um mapa em camadas do stack de IA moderno · ecossistema Claude, conhecimento, CRM, pesquisa, outbound, infra.",
        },
        min: "5 min",
      },
      {
        done: false,
        title: { en: "Building with Context from Day 1", pt: "Construindo com contexto desde o dia 1" },
        blurb: {
          en: "Why CLAUDE.md and your brain determine output quality, and how context compounds into a real advantage.",
          pt: "Por que o CLAUDE.md e seu cérebro determinam a qualidade da saída, e como o contexto se acumula em vantagem real.",
        },
        min: "5 min",
      },
      {
        done: false,
        title: { en: "Your First Win Checklist", pt: "Seu checklist da primeira vitória" },
        blurb: {
          en: "A 7-day plan: install Claude Code, start your brain, install your first skill from the map, connect an MCP, build your first command center.",
          pt: "Um plano de 7 dias: instale o Claude Code, comece seu cérebro, instale sua primeira skill pelo mapa, conecte um MCP e monte sua primeira central de comando.",
        },
        min: "6 min",
      },
    ],
    next: { label: "Claude Code Foundations", href: "/modules/foundations" },
  },

  foundations: {
    slug: "foundations",
    num: "02",
    title: "Claude Code Foundations",
    outcome: {
      en: "Claude Code running in VS Code, a global and project CLAUDE.md set up, a working mental model, an understanding of how skills plug in, and your core MCP stack connected.",
      pt: "Claude Code rodando no VS Code, um CLAUDE.md global e de projeto configurados, um modelo mental funcional, entendimento de como as skills se conectam, e seu stack de MCP essencial conectado.",
    },
    progress: { done: 0, total: 5 },
    lessons: [
      {
        done: false,
        title: { en: "Install and Configure Claude Code", pt: "Instale e configure o Claude Code" },
        blurb: {
          en: "Get Claude Code installed and authenticated inside VS Code on Mac, Windows, or Linux.",
          pt: "Deixe o Claude Code instalado e autenticado dentro do VS Code no Mac, Windows ou Linux.",
        },
        min: "15 min",
      },
      {
        done: false,
        title: { en: "How Claude Code Actually Works", pt: "Como o Claude Code funciona de verdade" },
        blurb: {
          en: "The mental model: context windows, how Claude reads your project, and why it's an agent, not a chatbot.",
          pt: "O modelo mental: janelas de contexto, como o Claude lê seu projeto, e por que ele é um agente, não um chatbot.",
        },
        min: "10 min",
      },
      {
        done: false,
        title: { en: "Setting Up Your CLAUDE.md", pt: "Configurando seu CLAUDE.md" },
        blurb: {
          en: "Build the persistent instruction layer Claude reads at the start of every session · global and project-level.",
          pt: "Monte a camada de instruções persistente que o Claude lê no começo de toda sessão · nível global e de projeto.",
        },
        min: "15 min",
      },
      {
        done: false,
        title: { en: "How Skills Work", pt: "Como as skills funcionam" },
        blurb: {
          en: "What skills are, the built-ins you already have, and how the AI employees you unlock on the map plug in.",
          pt: "O que são skills, as nativas que você já tem, e como os funcionários de IA que você desbloqueia no mapa se conectam.",
        },
        min: "10 min",
      },
      {
        done: false,
        title: { en: "MCPs: Connecting Claude to Your Stack", pt: "MCPs: conectando o Claude às suas ferramentas" },
        blurb: {
          en: "Connect Claude to Notion, Gmail, Calendar, GitHub and your CRM, then run a real first session end to end.",
          pt: "Conecte o Claude ao Notion, Gmail, Calendar, GitHub e seu CRM, depois rode uma primeira sessão real de ponta a ponta.",
        },
        min: "12 min",
      },
    ],
    prev: { label: "Start Here", href: "/modules/start-here" },
    next: { label: "Build Your Brain", href: "/modules/second-brain" },
  },

  "second-brain": {
    slug: "second-brain",
    num: "03",
    title: "Build Your Brain",
    outcome: {
      en: "Your company's second brain, live in Notion and Obsidian, connected to Claude and fed by an automatic capture workflow, so every skill reads real context instead of a cold start.",
      pt: "O segundo cérebro da sua empresa, no ar no Notion e Obsidian, conectado ao Claude e alimentado por uma captura automática, para que toda skill leia contexto real em vez de começar do zero.",
    },
    progress: { done: 0, total: 5 },
    lessons: [
      {
        done: false,
        title: { en: "Why You Need a Brain", pt: "Por que você precisa de um cérebro" },
        blurb: {
          en: "The compounding-context case: every skill is only as good as the brain it reads from.",
          pt: "O argumento do contexto composto: toda skill é tão boa quanto o cérebro do qual ela lê.",
        },
        min: "7 min",
      },
      {
        done: false,
        title: { en: "Build Your Brain in Notion", pt: "Monte seu cérebro no Notion" },
        blurb: {
          en: "The structured company brain · workspace layout, what goes where, and connecting it to Claude.",
          pt: "O cérebro estruturado da empresa · layout do workspace, o que vai onde, e como conectá-lo ao Claude.",
        },
        min: "10 min",
      },
      {
        done: false,
        title: { en: "Build Your Brain in Obsidian", pt: "Monte seu cérebro no Obsidian" },
        blurb: {
          en: "The local-first knowledge graph · three-layer architecture, prose-as-title, and the MCP bridge.",
          pt: "O grafo de conhecimento local-first · arquitetura de três camadas, prosa-como-título, e a ponte MCP.",
        },
        min: "12 min",
      },
      {
        done: false,
        title: { en: "The Capture Workflow", pt: "O fluxo de captura" },
        blurb: {
          en: "brain-ingest: turn videos, calls, and voice memos into structured notes Claude can find.",
          pt: "brain-ingest: transforme vídeos, calls e áudios em notas estruturadas que o Claude consegue achar.",
        },
        min: "8 min",
      },
      {
        done: false,
        title: { en: "Prompting Your Brain", pt: "Fazendo prompts para seu cérebro" },
        blurb: {
          en: "Clarity over magic words · give Claude one way to read the request when the brain loads the rest.",
          pt: "Clareza acima de palavras mágicas · dê ao Claude um jeito único de ler o pedido enquanto o cérebro carrega o resto.",
        },
        min: "9 min",
      },
    ],
    prev: { label: "Claude Code Foundations", href: "/modules/foundations" },
    next: { label: "Explore the map", href: "/map", isMap: true },
  },
};
