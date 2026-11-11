/* ============================================================
   skilltree-data.ts — o mapa Arkom, montado a partir das
   soluções Bilhon (diretiva do dono: sem taxonomia mock).
   6 áreas · 13 funções (caminhos de solução) · 71 nós.
   Áreas: Back Office, Clientes, Produto, Marketing,
   Negócios e Inteligência (transversal, "assim por enquanto").

   Cada ÁREA pode ter mais de uma solução; cada solução é uma
   FUNÇÃO (o caminho), e seus jobs são os módulos reais em
   profundidade (do fundamental ao avançado). O job-ponta
   carrega `solution` (+ `link` para /genesis ou o repo);
   os demais amarram via função→solução (`relatedSolution`).
   Fonte da verdade: os repos em solutions/ + o bilhon-ai.
   ============================================================ */

/** Autonomy ladder — how much of a job runs without a human in the seat. */
export type Level = "autonomous" | "assisted" | "manual";

export interface Job {
  /** stable slug (kebab of the name) used for React keys + active state */
  id: string;
  name: string;
  desc: string;
  /** runnable skill-file slugs that ship with this job */
  skills: string[];
  /** external tools the job wires into */
  tools: string[];
  level: Level;
  /** solution slug — this node IS a deployable solution (the branch tip). */
  solution?: string;
  /** explicit "abrir a solução" target — internal route (ex.: /genesis) ou URL do
   *  repo. Se ausente, o drawer usa /api/remix/go/<solution> (remixes provisionados). */
  link?: string;
}

export interface Fn {
  id: string;
  name: string;
  jobs: Job[];
}

export interface Department {
  id: string;
  name: string;
  /** tagline shown under the department label */
  sub: string;
  /** accent hex — the "space" palette per department */
  color: string;
  /** the department's opening paragraph (about-panel voice) */
  intro: string;
  /** raw <svg> inner content for the department glyph (0 0 200 200) */
  sigil: string;
  functions: Fn[];
}

export const LEVEL_LABEL: Record<Level, string> = {
  autonomous: "fully autonomous",
  assisted: "human-assisted",
  manual: "human-led",
};

/** node zero — the Knowledge Base at the centre of the wheel. */
export const NODE_ZERO = {
  /** short label under the globe on the wheel */
  name: "Knowledge Base",
  tag: "node zero · the company brain",
  /** the hub's own card (drawer) — title, badge + breadcrumb */
  cardTitle: "Company Knowledge Base",
  badge: "NODE ZERO",
  crumb: "The hub · every department reads & writes",
  doctrine:
    "Every AI department starts at the same node. The Knowledge Base at the centre of the wheel is node zero — every department reads from it and writes back to it. No knowledge base, no autonomy. From there, each branch has a sequence: jobs closer to the root unlock the jobs further out. This is not an org chart. It is a deployment order.",
  reading:
    "Filled nodes are jobs that can run fully autonomous today. Outlined nodes run human-assisted. Dim nodes are still human-led — mapped so you can see what's coming.",
  /** the Arkom Audit skill lives on this node */
  audit:
    "Or let an agent grade you — the Arkom Audit skill lives on this Knowledge Base node. It inspects your actual stack, asks only what it can't see, and generates a tree file you import back into the map.",
} as const;

/* ============ ICONS (ported verbatim — 0 0 24 24 stroke glyphs) ============ */
export const ICONS: Record<string, string> = {
  "trend-up": '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>',
  briefcase:
    '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  play: '<path d="M8 5l12 7-12 7V5z"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
  dollar:
    '<path d="M12 3v18"/><path d="M17 7c-1-1.5-2.5-2-5-2-3 0-4.5 1.5-4.5 3.5S9 12 12 12s4.5 1.5 4.5 3.5S15 19 12 19c-2.5 0-4-.5-5-2"/>',
  target:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.5"/>',
  funnel: '<path d="M4 5h16l-6 7v6l-4 2v-8L4 5z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  pen: '<path d="M12 19l7-7-3-3-7 7-1 4 4-1z"/><path d="M15 6l3 3"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
  inbox:
    '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5 5h14l3 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6l3-7z"/>',
  phone:
    '<path d="M5 3h4l2 5-3 2a13 13 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  file: '<path d="M6 2h8l6 6v14H6V2z"/><path d="M14 2v6h6"/>',
  chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M2 20h20"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  sparkle: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  broadcast:
    '<circle cx="12" cy="12" r="2"/><path d="M16.2 8.5a5 5 0 0 1 0 7"/><path d="M7.8 15.5a5 5 0 0 1 0-7"/><path d="M19.1 5.6a9 9 0 0 1 0 12.8"/><path d="M4.9 18.4a9 9 0 0 1 0-12.8"/>',
  rocket:
    '<path d="M12 2c3 2 5 6 5 10l-5 5-5-5c0-4 2-8 5-10z"/><circle cx="12" cy="9" r="2"/><path d="M7 14l-3 5 5-1"/><path d="M17 14l3 5-5-1"/>',
  gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
  chat: '<path d="M4 5h16v11h-9l-5 4v-4H4V5z"/>',
  book: '<path d="M4 4a2 2 0 0 1 2-2h14v18H6a2 2 0 0 0-2 2V4z"/><path d="M6 2v16"/>',
  building:
    '<path d="M5 21V5a1 1 0 0 1 1-1h7v17"/><path d="M13 9h6v12"/><path d="M3 21h18"/><path d="M8 8h2M8 12h2M16 13h1M16 17h1"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3 3 15 0 18-3-3-3-15 0-18z"/>',
  "doc-check": '<path d="M6 2h8l6 6v14H6V2z"/><path d="M14 2v6h6"/><path d="M9 14l2 2 4-4"/>',
  database:
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 3v4M16 3v4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none"/>',
  tag: '<path d="M3 11V4a1 1 0 0 1 1-1h7l10 10-8 8L3 11z"/><circle cx="8" cy="8" r="1.6"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17.5" cy="9" r="2.6"/><path d="M16.5 14.6c3 .3 5 2.1 5 5"/>',
  video: '<rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="M15.5 10.5L21.5 7v10l-6-3.5"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 17l5-4 4 3 4-4 5 5"/>',
  activity: '<path d="M2 12h4l3-7 5 14 3-7h5"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9"/>',
  percent: '<path d="M5 19L19 5"/><circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="17" r="2.6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  clipboard:
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a3 3 0 0 1 6 0"/><path d="M9 11h6M9 15h6"/>',
  route:
    '<circle cx="5" cy="6" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M7.2 6H15a4 4 0 0 1 4 4v5.5"/>',
  scissors:
    '<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.2 7.6L20 19M8.2 16.4L20 5"/>',
  magnet: '<path d="M5 3v8a7 7 0 0 0 14 0V3"/><path d="M5 8h4M15 8h4"/>',
  key: '<circle cx="8" cy="15" r="4.5"/><path d="M11.5 11.5L20 3M16 7l3 3"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l2.5-2.5a5 5 0 0 0-7-7L11 6"/><path d="M14 10a5 5 0 0 0-7 0L4.5 12.5a5 5 0 0 0 7 7L13 18"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M10 9v12"/>',
  zap: '<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>',
  filter: '<path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/>',
};

const DOM_ICON: Record<string, string> = {
  Business: "briefcase",
  Product: "sparkle",
  Marketing: "play",
  Customers: "user",
  "Back Office": "dollar",
  Intelligence: "search",
};

const FN_ICON: Record<string, string> = {
  "SDR Suite · Bia": "zap",
  FlowCRM: "briefcase",
  "Genesis · Builder de IA": "sparkle",
  "Bilhon Ads": "trend-up",
  "Automação de Redes Sociais": "broadcast",
  OnboardIA: "rocket",
  "Atendimento Multi-Agentes": "chat",
  "Plataforma de CS": "activity",
  "Bia RH": "users",
  "Painel IA": "chart",
  "Peticionamento com IA": "file",
  "Recruta.AI": "users",
  "Gestão Financeira": "dollar",
  "AI Pre-Sales": "zap",
  "Client Service Ops": "chat",
  "Market Signal Reading": "eye",
  "Bia Orchestration": "gear",
  "Lead Qualification": "funnel",
  "Campaigns & Broadcasts": "broadcast",
  "Sales Pipeline": "route",
  "Scheduling": "calendar",
  "Revenue Reconciliation": "percent",
  "Campaign Command": "target",
  "Content Studio": "pen",
  "Ads Production": "layers",
  "WhatsApp Instances": "phone",
  "Queues & Assignment": "list",
  "Traffic Automation": "refresh",
  "Conversation Intelligence": "chat",
  "Financial Intelligence": "dollar",
  "Audience Insights": "users",
  "Ads Intelligence": "activity",
  "Omnichannel Inbox": "inbox",
  "Contact Base": "user",
  "Ledger & Banking": "database",
  "Fiscal Engine": "doc-check",
  "ERP Master Data": "box",
  "AI Sales Development": "zap",
  "Multi-Agent Service": "chat",
  "Financial Management": "dollar",
  "Marketing Leadership": "target",
  "Social Distribution": "broadcast",
  "Paid Media": "trend-up",
  Targeting: "target",
  "Lead Sourcing": "funnel",
  Enrichment: "layers",
  "Outreach Writing": "pen",
  "Sequencing & Send": "send",
  "Reply Handling": "inbox",
  Inbound: "zap",
  "Call Cycle": "phone",
  "Deal Artifacts": "file",
  "Pipeline Ops": "chart",
  Insights: "eye",
  Creation: "sparkle",
  Repurposing: "refresh",
  Distribution: "broadcast",
  "Brand Deals": "briefcase",
  Onboarding: "rocket",
  "Build Ops": "gear",
  "Client Comms": "chat",
  Knowledge: "book",
  Companies: "building",
  People: "user",
  Markets: "globe",
  Synthesis: "doc-check",
  Support: "chat",
  Success: "trend-up",
  Community: "broadcast",
  "Money In": "dollar",
  Reporting: "chart",
  Records: "database",
  Office: "calendar",
  Talent: "users",
};

const JOB_ICON: Record<string, string> = {
  // nós PT (módulos reais por solução)
  "Recepção & Agrupamento WhatsApp": "inbox",
  "Orquestrador de IA (Bia)": "gear",
  "Qualificação & Base de Conhecimento": "book",
  "Disparos & Campanhas": "send",
  "Contatos & Empresas": "user",
  "Negócios & Pipeline": "layout",
  "Inbox & Cadências": "mail",
  "Lead Scoring & Automações": "gear",
  "Copiloto de IA (CRM)": "chat",
  FlowCRM: "briefcase",
  "Ideia & Perguntas Cadenciadas": "mic",
  "Base de Conhecimento & Framework": "book",
  "Arquitetura & Ferramentas": "layers",
  "Plano de Ação & Prompts": "clipboard",
  "Conteúdos & Economia": "percent",
  Genesis: "sparkle",
  "Gerenciador de Campanhas & Anúncios": "briefcase",
  "Copiloto de Mídia (IA)": "chat",
  "Otimizador & Regras": "filter",
  "Conciliação de Receita": "percent",
  "Fontes & Marca": "book",
  "Estúdio de Conteúdo": "pen",
  "Agenda & Publicação": "calendar",
  "Autopilot & Analytics": "rocket",
  "Automação de Redes Sociais": "broadcast",
  "Trilhas de Onboarding": "route",
  "Portal do Colaborador": "user",
  "Espaço do Gestor": "users",
  "Automações WhatsApp & Insights IA": "bell",
  OnboardIA: "rocket",
  "Inbox de Conversas": "inbox",
  "Chat & Mensagens": "chat",
  "Camada de Leitura por IA": "eye",
  "Filas, Transferência & Equipe": "route",
  "Atendimento Multi-Agentes · DESK": "chat",
  "Contas & Customer 360": "user",
  "Health Score & Dashboard": "activity",
  "Playbooks & Alertas de Risco": "shield",
  "Renovações & Contratos": "refresh",
  "NPS & Copiloto de IA": "chat",
  "Plataforma de CS": "activity",
  "Vagas & Recrutadores": "briefcase",
  "Candidatos & Currículo": "file",
  "Chat WhatsApp & Agente Bia": "chat",
  "Pipeline de Candidatos": "route",
  "Agendamento & Lembretes": "calendar",
  "Bia RH": "users",
  "Fontes de Dados": "database",
  "Geração por IA": "sparkle",
  "Editor & Widgets": "layout",
  "Filtros & Refino por IA": "filter",
  "Insights, Alertas & Compartilhar": "bell",
  "Painel IA": "chart",
  "Clientes & Processos": "building",
  "Editor Jurídico": "pen",
  "Geração de Peças por IA": "file",
  "Jurisprudência & Publicações": "search",
  "Peticionamento com IA": "file",
  "Vagas & Carreiras": "briefcase",
  "Candidatos & Banco de Talentos": "users",
  "Triagem por IA": "filter",
  "Pipeline & Entrevistas": "video",
  "Sourcing & Propostas": "magnet",
  "Recruta.AI": "users",
  "Razão & Bancos": "database",
  "Motor Fiscal": "doc-check",
  "ERP & Relatórios": "box",
  "Copiloto CFO & Alertas": "bell",
  "SDR Suite · Bia": "zap",
  "Multi-Agent Customer Service": "chat",
  FinanceAI: "dollar",
  "Autonomous CMO Agent": "target",
  "Social Media Automation": "broadcast",
  "Bilhon Ads": "trend-up",
  "WhatsApp Intake & Grouping": "inbox",
  "Consultative Qualification Loop": "chat",
  "Meeting Booking & Closer Handoff": "calendar",
  "Instance & Conversation Desk": "layers",
  "AI Reading Layer": "eye",
  "Queues, Transfer & Escalation": "route",
  "Ledger & Reconciliation": "doc-check",
  "Fiscal Documents Engine": "file",
  "CFO Copilot & Alerts": "bell",
  "Brand Brain": "book",
  "Campaign Signal Reading": "chart",
  "Approval-Gated Actions": "check-circle",
  "Research & Source Context": "search",
  "Brand-Aware Generation": "pen",
  "Publish, Analytics & Autopilot": "send",
  "Live KPI Reading": "activity",
  "Real-Revenue Reconciliation": "percent",
  "Winners, Bleeders & Guardrails": "filter",
  "Booking Validation": "calendar",
  "SDR Suite · Pre-Sales": "zap",
  "Atendimento · Client Ops": "chat",
  "Metric Snapshots & Alerts": "chart",
  "CMO Agent · Market Signals": "target",
  "Bia AI Orchestrator": "gear",
  "Knowledge Base (RAG)": "book",
  "Prompt Lab & Agent Settings": "pen",
  "Conversation Analyzer": "eye",
  "Campaign Wizard": "clipboard",
  "Broadcast Processor": "send",
  "Onboarding Wizard": "rocket",
  "Deal Board (Kanban)": "layout",
  "AI Stage Advancement": "trend-up",
  "Closer Round-Robin": "users",
  "Appointment Calendar": "calendar",
  "Calendar Webhooks": "link",
  "CRM Correlation": "magnet",
  "Real ROAS Factor": "percent",
  "Live Chat & Human Takeover": "chat",
  "Command Center Dashboard": "chart",
  "Campaign Room": "target",
  "Approvals Queue": "check-circle",
  "David Chat": "chat",
  "Studio (Creator)": "pen",
  "Lab & Gallery": "image",
  "Brand Profiles": "tag",
  "Sources Library": "book",
  "Schedule & Accounts": "calendar",
  "Autopilot": "rocket",
  "Campaign & Ads Manager": "briefcase",
  "Media & Audience Library": "image",
  "AI Copy Generator": "pen",
  "Creative Optimizer & Fatigue": "filter",
  "Automated Rules": "gear",
  "Instances & QR Pairing": "phone",
  "Setup & Onboarding": "rocket",
  "Assignment Rules": "route",
  "Macros Library": "list",
  "AI Traffic Manager": "refresh",
  "Strategy & Scale Planning": "chart",
  "Service Reports": "chart",
  "Team & Roles": "users",
  "Sentiment Analysis": "activity",
  "Topic Categorization": "tag",
  "Summaries & Smart Replies": "clipboard",
  "CFO Digital Copilot": "chat",
  "Cash Flow Forecast": "trend-up",
  "Executive Summary & Alerts": "bell",
  "Social Analytics": "chart",
  "Insights (Diagnosis)": "eye",
  "Morning Briefing": "clock",
  "A/B & Incrementality": "percent",
  "Industry Benchmarks": "chart",
  "Analytics & CMO Insight": "chart",
  "Conversations Inbox": "inbox",
  "Chat & Messaging": "chat",
  "Contacts & Profile Sync": "user",
  "Contact Insights": "eye",
  "Transactions Ledger": "database",
  "Banco Inter Banking": "building",
  "Asaas Billing": "dollar",
  "Transfers & Owner Account": "refresh",
  "Bills Payable & Tax Calendar": "calendar",
  "Document Scanner (OCR)": "file",
  "Contacts & Products": "box",
  "Sales & Purchase Orders": "clipboard",
  "DRE & Reports": "chart",
  "WhatsApp Financial Agent": "mic",
  "ICP Definition": "target",
  "Market Mapping": "globe",
  "Trigger Detection": "bell",
  "Database Mining": "database",
  "Web & Maps Scraping": "funnel",
  "Social Mining": "users",
  "List Building": "list",
  "Contact Enrichment": "layers",
  "Email Verification": "check-circle",
  "Account Enrichment": "building",
  "Fit Scoring": "chart",
  "Personalization Research": "search",
  "Cold Email Drafting": "pen",
  "LinkedIn Messaging": "chat",
  "Proof Matching": "doc-check",
  "Campaign Orchestration": "route",
  "Campaign Launch": "rocket",
  Deliverability: "shield",
  "Send Optimization": "clock",
  "Reply Classification": "tag",
  "Objection Response": "chat",
  "Hot-Lead Routing": "route",
  "Meeting Booking": "calendar",
  "Speed-to-Lead": "zap",
  "Lead Qualification": "filter",
  "Comment-CTA Fulfillment": "inbox",
  "Inbox Triage": "inbox",
  "Pre-Call Briefing": "clipboard",
  "Call Capture": "mic",
  "Post-Call Debrief": "doc-check",
  "Follow-Up Drafting": "pen",
  "Demo Prototyping": "box",
  "Proposal Generation": "file",
  "Deal Room Assembly": "briefcase",
  "Agreement Drafting": "file",
  "Pricing Support": "dollar",
  "CRM Hygiene": "database",
  "Pipeline Reporting": "chart",
  Forecasting: "trend-up",
  Reactivation: "refresh",
  "Win/Loss Analysis": "percent",
  "Performance Mining": "chart",
  "Trend Monitoring": "activity",
  "Competitor Analysis": "eye",
  "Audience Analysis": "users",
  "Hook Writing": "zap",
  "Script Writing": "pen",
  "Caption Writing": "pen",
  "Carousel Production": "image",
  "Video Production": "video",
  "Image Generation": "image",
  "Deck Production": "layout",
  "Cross-Platform Adaptation": "route",
  "Clip Extraction": "scissors",
  "Lead-Magnet Builds": "magnet",
  Publishing: "send",
  "Newsletter & Broadcast": "mail",
  "SEO & GEO": "globe",
  "OG & Share Surface": "link",
  "Deal Scripting": "pen",
  "Approval Docs": "check-circle",
  "Kickoff Pack": "rocket",
  "Access Collection": "key",
  "Project Scaffolding": "box",
  "Document Extraction": "file",
  "Integration Builds": "link",
  "Portal Provisioning": "layout",
  "QA & Verification": "check-circle",
  "Status Updates": "bell",
  "Meeting Follow-Ups": "calendar",
  "Portal Sync": "refresh",
  "Transcript Processing": "mic",
  "Context Maintenance": "book",
  "SOP Generation": "book",
  "Handoff Docs": "clipboard",
  "Company Deep-Dive": "building",
  "Tech-Stack Detection": "layers",
  "Person Research": "user",
  "Network Mapping": "route",
  "Competitor Teardown": "eye",
  "Vertical Analysis": "chart",
  "Pricing Research": "dollar",
  "Research Reports": "file",
  "Adversarial Verification": "shield",
  "Ticket Triage": "tag",
  "FAQ & Self-Serve": "chat",
  Escalations: "bell",
  "Onboarding Journeys": "rocket",
  "Health Scoring": "activity",
  "Renewals & Expansion": "trend-up",
  "QBR Prep": "clipboard",
  "Engagement & Replies": "chat",
  Moderation: "shield",
  "Member Spotlights": "sparkle",
  "Invoice Generation": "file",
  "Payment Tracking": "dollar",
  Collections: "bell",
  "Revenue Reporting": "chart",
  "Goal Pacing": "target",
  "CRM Sync": "database",
  "Expense Categorization": "tag",
  "Entity Compliance": "shield",
  "Calendar Management": "calendar",
  "Email Triage": "inbox",
  "Candidate Sourcing": "users",
  "Screening & Scheduling": "filter",
  "Onboarding & Training": "book",
};

/** raw path fragments for one glyph — falls back to sparkle. */
export const glyph = (name: string): string => ICONS[name] ?? ICONS.sparkle;
export const deptGlyph = (deptName: string): string => glyph(DOM_ICON[deptName] ?? "box");
export const fnGlyph = (fnName: string): string => glyph(FN_ICON[fnName] ?? "sparkle");
export const jobGlyph = (jobName: string): string => glyph(JOB_ICON[jobName] ?? "sparkle");

/* ============ SIGILS (per-department glyphs, 0 0 200 200) ============ */
export const SIGILS: Record<string, string> = {
  Sales: `
    <path d="M 100 168 L 100 62"/><path d="M 74 92 L 100 58 L 126 92"/><path d="M 80 116 L 100 92 L 120 116"/>
    <path d="M 48 172 A 58 58 0 0 1 152 172"/><path d="M 30 184 A 78 78 0 0 1 170 184"/>
    <circle class="sd" cx="100" cy="58" r="3.5"/><circle class="sd" cx="48" cy="172" r="2.5"/>
    <circle class="sd" cx="152" cy="172" r="2.5"/><circle class="sd" cx="100" cy="168" r="2.5"/>`,
  Deals: `
    <circle cx="100" cy="92" r="42"/><path d="M 82 92 L 96 106 L 122 76"/>
    <circle cx="100" cy="92" r="56" stroke-dasharray="2 8"/>
    <path d="M 56 152 L 144 152"/><path d="M 64 164 L 120 164"/>
    <circle class="sd" cx="100" cy="36" r="3"/><circle class="sd" cx="144" cy="152" r="2.5"/><circle class="sd" cx="56" cy="152" r="2.5"/>`,
  Marketing: `
    <path d="M 64 64 L 64 136 L 122 100 Z"/>
    <path d="M 134 76 A 34 34 0 0 1 134 124"/><path d="M 148 60 A 56 56 0 0 1 148 140"/><path d="M 162 44 A 80 80 0 0 1 162 156"/>
    <circle class="sd" cx="64" cy="64" r="3"/><circle class="sd" cx="64" cy="136" r="3"/>
    <circle class="sd" cx="122" cy="100" r="3.5"/><circle class="sd" cx="162" cy="44" r="2.5"/><circle class="sd" cx="162" cy="156" r="2.5"/>`,
  Operations: `
    <path d="M 100 50 L 150 78 L 100 106 L 50 78 Z"/>
    <path d="M 50 78 L 50 132 L 100 160 L 100 106"/><path d="M 150 78 L 150 132 L 100 160"/>
    <ellipse cx="100" cy="104" rx="88" ry="26" transform="rotate(-10 100 104)"/>
    <circle class="sd" cx="100" cy="50" r="3.5"/><circle class="sd" cx="50" cy="78" r="3"/>
    <circle class="sd" cx="150" cy="78" r="3"/><circle class="sd" cx="100" cy="160" r="3"/>`,
  Intelligence: `
    <path d="M 28 100 Q 100 38 172 100 Q 100 162 28 100 Z"/>
    <circle cx="100" cy="100" r="27"/><circle class="sd" cx="100" cy="100" r="6"/>
    <path d="M 100 46 L 100 30"/><path d="M 56 58 L 45 46"/><path d="M 144 58 L 155 46"/><path d="M 100 154 L 100 170"/>
    <circle class="sd" cx="100" cy="30" r="2.5"/><circle class="sd" cx="45" cy="46" r="2.5"/><circle class="sd" cx="155" cy="46" r="2.5"/>`,
  Customer: `
    <circle cx="100" cy="84" r="16"/>
    <path d="M 68 138 c 0 -18 14 -30 32 -30 s 32 12 32 30"/>
    <circle cx="100" cy="100" r="62" stroke-dasharray="2 8"/>
    <circle class="sd" cx="100" cy="36" r="3"/><circle class="sd" cx="45" cy="132" r="3"/><circle class="sd" cx="155" cy="132" r="3"/>`,
  "Back Office": `
    <path d="M 100 44 L 100 152"/><path d="M 78 158 L 122 158"/><path d="M 52 68 L 148 68"/>
    <circle cx="100" cy="40" r="6"/>
    <path d="M 52 68 L 38 106 M 52 68 L 66 106"/><path d="M 32 106 A 20 20 0 0 0 72 106"/>
    <path d="M 148 68 L 134 106 M 148 68 L 162 106"/><path d="M 128 106 A 20 20 0 0 0 168 106"/>
    <circle class="sd" cx="52" cy="68" r="3"/><circle class="sd" cx="148" cy="68" r="3"/><circle class="sd" cx="100" cy="40" r="2.5"/>`,
};
/** áreas novas reaproveitam glyphs existentes (mesma linguagem visual). */
const SIGIL_ALIAS: Record<string, string> = {
  Business: "Deals",
  Product: "Operations",
  Customers: "Customer",
};
export const deptSigil = (deptName: string): string =>
  SIGILS[deptName] ?? SIGILS[SIGIL_ALIAS[deptName]] ?? "";

/* ============ DATA ============ */
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const L = (
  name: string,
  desc: string,
  skills: string[],
  tools: string[] = [],
  level: Level = "autonomous",
  solution?: string,
  link?: string
): Job => ({ id: slug(name), name, desc, skills, tools, level, solution, link });

const F = (name: string, jobs: Job[]): Fn => ({ id: slug(name), name, jobs });

const dept = (
  name: string,
  sub: string,
  color: string,
  intro: string,
  functions: Fn[]
): Department => ({
  id: slug(name),
  name,
  sub,
  color,
  intro,
  sigil: deptSigil(name),
  functions,
});

export const DEPARTMENTS: Department[] = [
  dept(
    "Back Office",
    "jurídico · RH · financeiro",
    "#FACC15",
    "O andar que sustenta a operação, com três soluções. O Peticionamento com IA redige peças e gere o escritório; a Recruta.AI roda o recrutamento ponta a ponta; a FinanceAI mantém razão, fiscal e ERP com um copiloto CFO.",
    [
      F("Peticionamento com IA", [
        L("Clientes & Processos", `CRM de clientes + processos (número CNJ, timeline de movimentos) com captura por voz e OCR.`, [], ["OCR (Gemini)", "LLM"]),
        L("Editor Jurídico", `Editor rich-text (Tiptap) com workflow de status (rascunho→assinado) e exportação PDF/DOCX.`, []),
        L("Geração de Peças por IA", `14 tipos de peça (inicial, contestação, apelação, REsp…) gerados por IA com templates por tipo.`, [], ["OpenAI", "Google Gemini", "Anthropic / Claude"]),
        L("Jurisprudência & Publicações", `Busca de jurisprudência (STF/STJ/TST) + captura de publicações do DJEN com leitura/badge.`, [], ["DataJud / DJEN"]),
        L("Peticionamento com IA", `A solução completa · redação de petições com IA + gestão de escritório jurídico.`, [], ["OpenAI", "Google Gemini", "Anthropic / Claude", "DataJud / DJEN", "Resend"], "assisted", "peticionamento", "https://arkom-peticionamento.lovable.app/"),
      ]),
      F("Recruta.AI", [
        L("Vagas & Carreiras", `CRUD de vagas + descrições geradas por IA + página de carreiras pública com a marca.`, [], ["Lovable AI (Gemini)"]),
        L("Candidatos & Banco de Talentos", `Portal do candidato, parse/qualidade de currículo por IA e banco de talentos com tags.`, [], ["Lovable AI (Gemini)"]),
        L("Triagem por IA", `Fit scoring, ranking inteligente, perguntas knockout e resumos de candidato por IA.`, [], ["Lovable AI (Gemini)"]),
        L("Pipeline & Entrevistas", `ATS Kanban com scorecards, kits de entrevista, vídeo-entrevistas e assessments.`, [], ["Lovable AI (Gemini)"], "assisted"),
        L("Sourcing & Propostas", `Sourcing proativo por IA + enriquecimento LinkedIn/PDL, propostas com assinatura eletrônica.`, [], ["LinkedIn / PDL", "Resend"]),
        L("Recruta.AI", `A solução completa · ATS multi-tenant com triagem, ranking, entrevistas e sourcing por IA.`, [], ["Lovable AI (Gemini)", "LinkedIn / PDL", "Resend"], "assisted", "recruta", "https://arkom-recruta.lovable.app/"),
      ]),
      F("Gestão Financeira", [
        L("Razão & Bancos", `Transações com auto-categorização por IA e conciliação · Banco Inter e cobranças Asaas.`, [], ["Banco Inter", "Asaas"]),
        L("Motor Fiscal", `NFS-e Nacional e PlugNotas com certificados + scanner OCR de documentos.`, [], ["NFS-e Nacional", "PlugNotas"]),
        L("ERP & Relatórios", `Cadastros (contatos/produtos), pedidos de venda/compra e DRE por plano de contas.`, [], [], "assisted"),
        L("Copiloto CFO & Alertas", `Copiloto CFO sobre o razão + previsão de fluxo de caixa e alertas proativos.`, []),
        L("FinanceAI", `A solução completa · ERP financeiro com contas, fiscal, bancos e organização da operação.`, ["financeai"], ["Asaas", "Banco Inter", "NFS-e Nacional", "PlugNotas", "Evolution API (WhatsApp)"], "autonomous", "financeai"),
      ]),
      F("Bia RH", [
        L("Vagas & Recrutadores", `CRUD de vagas (CLT/PJ/estágio, senioridade, área, PCD, faixa salarial) + recrutadores (interno/agência/freelance) com distribuição.`, []),
        L("Candidatos & Currículo", `Candidatos vindos do WhatsApp + parse de currículo (PDF/DOCX → JSON estruturado) e blocos de memória RH.`, [], ["Lovable AI (Gemini)", "Supabase Storage"]),
        L("Chat WhatsApp & Agente Bia", `Inbox WhatsApp em tempo real + a Bia (agente IA) que recomenda vagas, qualifica e agenda entrevistas.`, [], ["Meta / WhatsApp oficial", "ElevenLabs (voz/áudio)"]),
        L("Pipeline de Candidatos", `Kanban de etapas com insights da Bia (score, próxima ação, interesses) e histórico de conversa.`, [], [], "assisted"),
        L("Agendamento & Lembretes", `Calendário de entrevistas + lembretes D-1/D-0 via templates HSM da Meta.`, [], ["Meta / WhatsApp oficial"]),
        L("Bia RH", `A solução completa · recrutadora de IA que triagem candidatos no WhatsApp, gere vagas e agenda entrevistas.`, ["bia_rh"], ["Meta / WhatsApp oficial", "ElevenLabs (voz/áudio)", "Lovable AI (Gemini)"], "assisted", "bia_rh", "https://arkom-bia-rh.lovable.app/"),
      ]),
    ]
  ),
  dept(
    "Customers",
    "onboarding · atendimento",
    "#FB7185",
    "Todo o ciclo do cliente/colaborador depois do sim. A OnboardIA conduz trilhas de integração dia a dia com portais por papel; o Atendimento Multi-Agentes roda o balcão de WhatsApp com IA para leitura, filas e escalonamento.",
    [
      F("OnboardIA", [
        L("Trilhas de Onboarding", `Construtor de trilhas por dia de vencimento e tipo de etapa (checklist, vídeo, leitura, doc, reunião).`, []),
        L("Portal do Colaborador", `Portal "Hoje"/"Minha trilha" com checklist por semana + cofre de documentos.`, []),
        L("Espaço do Gestor", `Visão do time, liderados, agenda semanal, 1:1s e feedbacks para o gestor.`, [], [], "assisted"),
        L("Automações WhatsApp & Insights IA", `Gatilhos de boas-vindas/lembrete por dia/hora + insights de IA sobre a base de feedback.`, [], ["Evolution API (WhatsApp)", "Lovable AI (Gemini)"]),
        L("OnboardIA", `A solução completa · onboarding de colaboradores multi-tenant com trilhas, docs, feedback e automações.`, [], ["Evolution API (WhatsApp)", "Notion", "Lovable AI (Gemini)"], "assisted", "gestor_onboarding", "https://arkom-onboarding.lovable.app/"),
      ]),
      F("Atendimento Multi-Agentes", [
        L("Inbox de Conversas", `Inbox de helpdesk em tempo real filtrado por instância, fila e pills rápidas.`, [], ["Evolution API (WhatsApp)"], "assisted"),
        L("Chat & Mensagens", `Texto, áudio, mídia, emoji, respostas citadas, reações e janela de edição de 15 min.`, [], ["Evolution API (WhatsApp)"], "assisted"),
        L("Camada de Leitura por IA", `Sentimento no limiar de 5 mensagens, categorização de tópicos, resumos e 3 respostas smart.`, [], ["Lovable AI (Gemini)"], "assisted"),
        L("Filas, Transferência & Equipe", `Regras de atribuição, transferência com motivo, escalonamento e papéis da equipe.`, [], [], "assisted"),
        L("Atendimento Multi-Agentes · DESK", `A solução completa · balcão de atendimento WhatsApp multi-instâncias multi-agente com IA.`, ["atendimento"], ["Evolution API (WhatsApp)", "Evolution Cloud"], "assisted", "atendimento"),
      ]),
      F("Plataforma de CS", [
        L("Contas & Customer 360", `Lista de clientes + visão 360 (contatos, contratos, tickets, playbooks, timeline) com campos custom e importação.`, [], ["CRM (HubSpot/Pipedrive/RD)"]),
        L("Health Score & Dashboard", `Home com health-pie, pipeline de renovação, alertas, tarefas do dia, NPS e tickets · recomputa o health por cliente.`, []),
        L("Playbooks & Alertas de Risco", `Automação de playbooks (trigger→ação, sugestão por IA) + early-warning de risco (queda de health, pagamento, churn/sentimento).`, [], ["Anthropic / Claude", "OpenAI"]),
        L("Renovações & Contratos", `Contratos, MRR e renovações dos próximos 30 dias + tickets de suporte.`, [], ["Asaas", "Iugu"], "assisted"),
        L("NPS & Copiloto de IA", `Pesquisas/NPS (promotores/detratores, envio por email) + copiloto de IA (churn scoring, resumo de cliente, redação de WhatsApp).`, [], ["Resend", "Anthropic / Claude", "OpenAI"]),
        L("Plataforma de CS", `A solução completa · Customer Success com carteira, health score, playbooks, risco/churn, renovações, NPS e IA.`, ["cs"], ["CRM (HubSpot/Pipedrive/RD)", "Asaas", "Iugu", "Resend", "Anthropic / Claude", "OpenAI", "WhatsApp / Meta"], "assisted", "cs", "https://arkom-plataformacs.lovable.app/"),
      ]),
    ]
  ),
  dept(
    "Product",
    "Genesis · ideia → solução",
    "#A78BFA",
    "Onde uma ideia em linguagem natural vira um blueprint completo de produto. O Genesis conduz um wizard cadenciado — da ideia às perguntas, da base de conhecimento à economia — gerando 8 etapas de solução no-code prontas para construir.",
    [
      F("Genesis · Builder de IA", [
        L("Ideia & Perguntas Cadenciadas", `Composer com ditado por voz + 5 perguntas de qualificação específicas à ideia, uma por vez.`, [], ["Web Speech API", "OpenAI (edge bai_builder-llm)"], "assisted"),
        L("Base de Conhecimento & Framework", `Sintetiza insights + Q&A obrigatórias e os 5 pilares de implementação da solução.`, [], ["OpenAI (edge bai_builder-llm)"]),
        L("Arquitetura & Ferramentas", `Fluxo principal e alternativos + stack de ferramentas com custo mensal, plano e alternativas.`, [], ["OpenAI (edge bai_builder-llm)"]),
        L("Plano de Ação & Prompts", `3–4 sprints com tarefas priorizadas + 6–10 prompts prontos para colar no Lovable.`, [], ["OpenAI (edge bai_builder-llm)"]),
        L("Conteúdos & Economia", `Aulas recomendadas por sprint + ROI (economia vs profissionais substituídos).`, [], ["OpenAI (edge bai_builder-llm)"]),
        L("Genesis", `A solução completa · wizard que transforma uma ideia em blueprint de 8 etapas gerado por IA.`, [], ["OpenAI (edge bai_builder-llm)"], "autonomous", "builder", "/genesis"),
      ]),
    ]
  ),
  dept(
    "Marketing",
    "anúncios · redes sociais",
    "#38BDF8",
    "Duas soluções dividem este andar. O Bilhon Ads produz, otimiza e poda campanhas de mídia paga com guardrails determinísticos e receita real; a automação social transforma contexto de marca em conteúdo publicado num ciclo contínuo.",
    [
      F("Bilhon Ads", [
        L("Gerenciador de Campanhas & Anúncios", `CRUD completo de campanhas, conjuntos, anúncios e criativos sobre a Graph API.`, [], ["Meta Ads"], "assisted"),
        L("Copiloto de Mídia (IA)", `Copiloto Anthropic tool-use sobre dados do Meta · briefing matinal, winners/bleeders, ações.`, [], ["Anthropic / Claude", "Meta Ads"]),
        L("Otimizador & Regras", `Detecção de fadiga criativa + regras por limiar que pausam ou escalam anúncios.`, [], ["Meta Ads"]),
        L("Conciliação de Receita", `Correlação por UTM com CRM e loja · ROAS real vs pixel antes de mexer em orçamento.`, [], ["Pipedrive", "Shopify", "HubSpot"]),
        L("Bilhon Ads", `A solução completa · gestão, análise e otimização de campanhas Meta/Facebook Ads.`, ["ad_manager"], ["Meta Ads", "Anthropic / Claude", "Pipedrive", "Shopify", "HubSpot"], "autonomous", "ad_manager"),
      ]),
      F("Automação de Redes Sociais", [
        L("Fontes & Marca", `Ingestão de pesquisa (busca IA, artigo, YouTube, TikTok, PDF) + perfis de marca como raiz.`, [], ["Firecrawl (pesquisa web)", "Apify (analytics)"]),
        L("Estúdio de Conteúdo", `Bancada com copiloto de IA · post, card, carrossel, imagem e vídeo com geração assistida.`, [], ["OpenAI (imagens)", "Higgsfield (vídeo IA)", "Pexels (imagens)"], "assisted"),
        L("Agenda & Publicação", `Calendário de publicação + conexão e gestão de contas sociais via Post for Me.`, [], ["Post for Me"]),
        L("Autopilot & Analytics", `Kanban autopilot/cron sob guardas + analytics de perfil/post e insights de IA.`, [], ["Post for Me", "Apify (analytics)"]),
        L("Automação de Redes Sociais", `A solução completa · criação, agendamento e publicação de conteúdo com IA nas redes.`, ["social"], ["Post for Me", "Higgsfield (vídeo IA)", "Apify (analytics)", "Firecrawl (pesquisa web)", "Pexels (imagens)"], "autonomous", "social"),
      ]),
    ]
  ),
  dept(
    "Business",
    "SDR · CRM · pipeline",
    "#EF4444",
    "O motor comercial completo. A SDR Suite · Bia qualifica no WhatsApp e agenda a reunião; o FlowCRM organiza contatos e empresas, move negócios no Kanban, dispara cadências e automações com um copiloto de IA nativo.",
    [
      F("SDR Suite · Bia", [
        L("Recepção & Agrupamento WhatsApp", `Webhooks da Evolution ou do Meta resolvem tenant e instância · fragmentos e mídia viram um turno único.`, [], ["Evolution API (WhatsApp)", "Meta / WhatsApp oficial"]),
        L("Orquestrador de IA (Bia)", `Drena a fila, carrega prompt e contexto do lead, quebra respostas e dispara tool-calls de agendamento.`, [], ["Evolution API (WhatsApp)", "ElevenLabs (voz/áudio)"]),
        L("Qualificação & Base de Conhecimento", `Loop consultivo de 16 estágios com a base de conhecimento (embeddings) injetada no prompt da Bia.`, []),
        L("Disparos & Campanhas", `Assistente de campanha por CSV com validação + processador de disparos em fila (pausar/retomar).`, [], ["Evolution API (WhatsApp)"], "assisted"),
        L("SDR Suite · Bia", `A solução completa · SDR de IA sobre a Evolution API que qualifica, conversa, agenda e opera pré-vendas.`, ["sdr"], ["Evolution API (WhatsApp)", "ElevenLabs (voz/áudio)", "Meta / WhatsApp oficial"], "autonomous", "sdr"),
      ]),
      F("FlowCRM", [
        L("Contatos & Empresas", `CRUD de contatos e empresas com tags, segmentos, importação CSV e visão por dono.`, []),
        L("Negócios & Pipeline", `Pipeline Kanban drag-and-drop com qualificação BANT, forecast e razões de perda.`, [], [], "assisted"),
        L("Inbox & Cadências", `Caixa de emails com sync Gmail, templates e cadências multi-passo com tracking de abertura/clique.`, [], ["Gmail", "Resend"]),
        L("Lead Scoring & Automações", `Regras de pontuação de leads + motor trigger→ação (email, mover etapa, webhook, WhatsApp).`, [], ["Evolution API (WhatsApp)", "Webhooks"]),
        L("Copiloto de IA (CRM)", `Copiloto contextual, insights e "sales manager" · sugestões, resumos e análise via LLM.`, [], ["Lovable AI (Gemini)"]),
        L("FlowCRM", `A solução completa · CRM B2B multi-tenant com pipeline, email, lead scoring, automações e IA nativa.`, [], ["Gmail", "Resend", "Evolution API (WhatsApp)", "Lovable AI (Gemini)"], "assisted", "crm_armo", "https://github.com/Bilhon-OS/crm-armo"),
      ]),
    ]
  ),
  dept(
    "Intelligence",
    "dashboards de BI por linguagem natural",
    "#7DD3FC",
    "O andar de inteligência de dados. O Painel IA transforma linguagem natural em dashboards de BI — conecta fontes, gera visualizações e KPIs, alerta sobre anomalias e compartilha com o time.",
    [
      F("Painel IA", [
        L("Fontes de Dados", `Conecta e sincroniza fontes · upload CSV/Excel, Google Sheets (OAuth), Pipedrive (CRM) e webhook JSON genérico.`, [], ["Google Sheets", "Pipedrive", "Webhooks"]),
        L("Geração por IA", `De um prompt em texto, gera a config do dashboard em streaming (com avaliação de clareza e cache por hash).`, [], ["OpenAI", "Anthropic / Claude"]),
        L("Editor & Widgets", `Editor em grid com autosave + widgets (KPI, linha, barra, pizza, tabela, meta) e data-binding assistido por IA.`, [], ["OpenAI", "Anthropic / Claude"], "assisted"),
        L("Filtros & Refino por IA", `Comparação de períodos (delta/tendência) + refino iterativo do dashboard por chat.`, [], ["OpenAI", "Anthropic / Claude"]),
        L("Insights, Alertas & Compartilhar", `Insights/anomalias por IA + alertas por limiar (email/cron) + link público com senha e embed por iframe.`, [], ["Email"]),
        L("Painel IA", `A solução completa · cria dashboards de BI por linguagem natural a partir de fontes de dados conectadas.`, ["dashboards"], ["Google Sheets", "Pipedrive", "OpenAI", "Anthropic / Claude", "Email"], "assisted", "dashboards", "https://arkom-dashboard.lovable.app"),
      ]),
    ]
  ),
];

/* ============ derived counts ============ */
export const DEPT_COUNT = DEPARTMENTS.length;
export const FUNCTION_COUNT = DEPARTMENTS.reduce((s, d) => s + d.functions.length, 0);
export const JOB_COUNT = DEPARTMENTS.reduce(
  (s, d) => s + d.functions.reduce((t, f) => t + f.jobs.length, 0),
  0
);
export const SKILL_COUNT = DEPARTMENTS.reduce(
  (s, d) =>
    s + d.functions.reduce((t, f) => t + f.jobs.reduce((u, j) => u + j.skills.length, 0), 0),
  0
);

/** how many jobs in a department can run fully autonomous today. */
export const autonomousCount = (d: Department): number =>
  d.functions.reduce((t, f) => t + f.jobs.filter((j) => j.level === "autonomous").length, 0);

/** total jobs in a department. */
export const jobCount = (d: Department): number =>
  d.functions.reduce((t, f) => t + f.jobs.length, 0);

/**
 * START HERE — the foundation job per department (the source marks specific
 * jobs; without that private set we anchor on the first job of the first
 * function, the natural root of each branch).
 */
export const START_HERE: Record<string, string> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, d.functions[0]?.jobs[0]?.id ?? ""])
);

/* ============ AS SOLUÇÕES POR ÁREA (diretiva do dono) ============
   6 áreas, algumas com MAIS DE UMA solução. Cada função É uma solução (o
   caminho): seus jobs são os módulos reais em profundidade, e o job-ponta
   carrega `solution` (+ `link`). Todo nó não-ponta amarra à solução da sua
   função via `relatedSolution`. */

/** display name por solution slug. */
export const SOLUTION_NAME: Record<string, string> = {
  sdr: "SDR Suite · Bia",
  crm_armo: "PIPE",
  builder: "Genesis",
  ad_manager: "Bilhon Ads",
  social: "Automação de Redes Sociais",
  gestor_onboarding: "OnboardIA",
  atendimento: "DESK AI",
  peticionamento: "HARVEY",
  recruta: "HOLLY",
  financeai: "FinanceAI",
  cmo: "Agente Autônomo CMO",
  cs: "Plataforma de CS",
  bia_rh: "Bia RH",
  dashboards: "ATLAS",
};

/** link explícito de "abrir a solução" por slug — interno (/genesis) ou repo.
 *  Ausente ⇒ remix provisionado em /api/remix/go/<slug>. */
const SOLUTION_LINK: Record<string, string> = {
  builder: "/genesis",
  crm_armo: "https://github.com/Bilhon-OS/crm-armo",
  sdr: "https://bilhon-sdr.lovable.app",
  social: "https://bilhon-rs.lovable.app",
  financeai: "https://bilhon-finance.lovable.app",
  ad_manager: "https://billion-ads.lovable.app",
  gestor_onboarding: "https://arkom-onboarding.lovable.app/",
  peticionamento: "https://arkom-peticionamento.lovable.app/",
  recruta: "https://arkom-recruta.lovable.app/",
  cs: "https://arkom-plataformacs.lovable.app/",
  bia_rh: "https://arkom-bia-rh.lovable.app/",
  dashboards: "https://arkom-dashboard.lovable.app",
};

/** o destino de "abrir a solução" por slug (link explícito → remix provisionado). */
export const solutionHref = (slug: string): string =>
  SOLUTION_LINK[slug] ?? `/api/remix/go/${slug}`;

/** preview da aula por solution slug. Fonte de verdade = app_arkom.solution_previews
 *  (via /api/map/previews). Os links do Viver de IA foram REMOVIDOS (não usamos a
 *  plataforma de referência como preview). Enquanto não houver a aula própria de
 *  "como usar a solução" no banco central bilhon, fica vazio ⇒ o drawer mostra só
 *  a descrição, sem vídeo. Para religar: popular solution_previews.preview_url
 *  com o embed Panda da biblioteca bilhon (2cdebb25-226). */
export const SOLUTION_PREVIEW: Record<string, string> = {};

/** cada função (o caminho da solução) → seu solution slug. */
const FN_SOLUTION: Record<string, string> = {
  "SDR Suite · Bia": "sdr",
  FlowCRM: "crm_armo",
  "Genesis · Builder de IA": "builder",
  "Bilhon Ads": "ad_manager",
  "Automação de Redes Sociais": "social",
  OnboardIA: "gestor_onboarding",
  "Atendimento Multi-Agentes": "atendimento",
  "Plataforma de CS": "cs",
  "Bia RH": "bia_rh",
  "Painel IA": "dashboards",
  "Peticionamento com IA": "peticionamento",
  "Recruta.AI": "recruta",
  "Gestão Financeira": "financeai",
  // Inteligência (transversal — fica assim por enquanto)
  "Conversation Intelligence": "atendimento",
  "Financial Intelligence": "financeai",
  "Audience Insights": "social",
  "Ads Intelligence": "ad_manager",
  "Market Signal Reading": "cmo",
};

/** solução principal por área (fallback quando a função não estiver mapeada). */
const DEPT_SOLUTION: Record<string, string> = {
  Business: "crm_armo",
  Product: "builder",
  Marketing: "ad_manager",
  Customers: "atendimento",
  "Back Office": "financeai",
  Intelligence: "dashboards",
};

/** a solução a que um nó amarra (afinidade por função → fallback por área). */
export const relatedSolution = (deptName: string, fnName: string): string | undefined =>
  FN_SOLUTION[fnName] ?? DEPT_SOLUTION[deptName];
