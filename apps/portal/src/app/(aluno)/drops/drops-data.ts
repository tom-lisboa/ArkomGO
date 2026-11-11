import { AudioLines, Briefcase, MessageSquare, Sparkles, TrendingUp } from "lucide-react";

import {
  type Department,
  type DropItem,
  type FeaturedDropData,
  type IconType,
} from "@/lib/hub-data";

/**
 * /drops page dataset (Pkg13 · N2). The page is its OWN static dataset — the 13 drops
 * and their metadata (age / installs) differ from the hub's 4-drop teaser, so this
 * does not reuse hub-data's DROPS. Verbatim EN from R0 findings; PT is didactic and
 * lives here (`descriptionPt`) for the new drops. The 4 that also exist in the hub
 * (ICP/Brain Sync/Inbound/Meeting) + the featured reuse the font-builder's DESC_PT
 * via DropCard/FeaturedDrop (no descriptionPt needed).
 */

/** A grid card with an optional PT description overlay (new drops not in DESC_PT). */
export interface DropPageItem extends DropItem {
  descriptionPt?: string;
}

const ICON: Record<Department, IconType> = {
  Sales: TrendingUp,
  Deals: Briefcase,
  Marketing: AudioLines,
  Operations: Sparkles,
  Intelligence: Sparkles,
  Customer: MessageSquare,
  "Back office": Briefcase,
};

const drop = (
  title: string,
  department: Department,
  time: string,
  installs: string,
  description: string,
  slug: string,
  descriptionPt?: string
): DropPageItem => ({
  title,
  department,
  time,
  installs,
  description,
  icon: ICON[department],
  href: `/drops/${slug}`,
  ...(descriptionPt ? { descriptionPt } : {}),
});

/** Featured, full-width (Lead Sourcing Manager). PT desc via DESC_PT; PT meta below. */
export const DROPS_FEATURED: FeaturedDropData = {
  department: "Sales",
  eyebrow: "Featured this week",
  title: "Lead Sourcing Manager",
  description:
    "Describe your ICP and it builds the targeted company + people list, ready to send.",
  meta: "Added 12 days ago · 7 installs",
  cta: "Install skill",
};

export const DROPS_FEATURED_META_PT = "Adicionado há 12 dias · 7 instalações";

/** The 12 grid cards, newest first (R0 findings). */
export const DROPS_GRID: DropPageItem[] = [
  drop(
    "Deal Room Producer",
    "Deals",
    "2 days ago",
    "3 installs",
    "Assembles everything a prospect needs to say yes: proposal, proof, pricing, in one room.",
    "deal-room-producer",
    "Reúne tudo que um prospect precisa para dizer sim — proposta, prova, preço — numa sala só."
  ),
  drop(
    "ICP Strategist",
    "Sales",
    "6 days ago",
    "5 installs",
    "Turns your win/loss history into ideal-customer profiles your agents can actually act on.",
    "icp-strategist"
  ),
  drop(
    "Brain Sync",
    "Operations",
    "8 days ago",
    "6 installs",
    "The bridge that makes every skill read your Notion or Obsidian Cortex · edit your brain, run sync, and your skills quote the current truth.",
    "brain-sync"
  ),
  drop(
    "Inbound Response Manager",
    "Deals",
    "9 days ago",
    "4 installs",
    "Every form fill, email and DM answered in minutes, qualified and routed while it's hot.",
    "inbound-response-manager"
  ),
  drop(
    "Meeting Intelligence",
    "Operations",
    "13 days ago",
    "8 installs",
    "Every call captured, summarized, and turned into action items · nothing evaporates.",
    "meeting-intelligence"
  ),
  drop(
    "Cold Email Copywriter",
    "Sales",
    "14 days ago",
    "4 installs",
    "Personalized cold sequences that actually get replies, written in your voice.",
    "cold-email-copywriter",
    "Sequências de cold email personalizadas que de fato recebem resposta, escritas na sua voz."
  ),
  drop(
    "Proposal Writer",
    "Deals",
    "15 days ago",
    "4 installs",
    "Turns a sales call into a same-day proposal, structured the way deals actually close.",
    "proposal-writer",
    "Transforma uma call de vendas em proposta no mesmo dia, estruturada do jeito que negócio fecha de verdade."
  ),
  drop(
    "Content Performance Analyst",
    "Marketing",
    "16 days ago",
    "4 installs",
    "Mines your own posting history into a content strategy · what to make next, and why.",
    "content-performance-analyst",
    "Minera seu próprio histórico de posts numa estratégia de conteúdo · o que fazer em seguida, e por quê."
  ),
  drop(
    "Document Extraction Engineer",
    "Operations",
    "17 days ago",
    "4 installs",
    "Turns piles of forms, invoices and contracts into clean, structured data.",
    "document-extraction-engineer",
    "Transforma pilhas de formulários, faturas e contratos em dados limpos e estruturados."
  ),
  drop(
    "Carousel Creator",
    "Marketing",
    "18 days ago",
    "4 installs",
    "Turn any idea into a full, designed carousel · hook to CTA, in your voice.",
    "carousel-creator",
    "Transforme qualquer ideia num carrossel completo e desenhado · do gancho ao CTA, na sua voz."
  ),
  drop(
    "Knowledge Base Chat",
    "Operations",
    "19 days ago",
    "5 installs",
    "Ask your company brain anything; it answers with the source files.",
    "knowledge-base-chat",
    "Pergunte qualquer coisa ao cérebro da sua empresa; ele responde com os arquivos-fonte."
  ),
  drop(
    "Support Answerer",
    "Customer",
    "20 days ago",
    "3 installs",
    "Drafts ticket replies grounded in your own help docs.",
    "support-answerer",
    "Rascunha respostas de tickets baseadas na sua própria central de ajuda."
  ),
];
