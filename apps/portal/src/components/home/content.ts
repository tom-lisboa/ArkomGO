/**
 * Início · Soluções · Apps · Mentorias — demo data layer (N1 · plano
 * 2026-07-08_inicio-solucoes-apps).
 *
 * No-Invention: progress numbers derive from the SAME Training mock
 * (capacitacoes/content.ts) — one source of truth; mentorship events mirror
 * the live platform's real pattern (14:00 weekdays, one "Mentoria Geral");
 * solutions are the founder's six named mocks; last-access rows point at
 * REAL routes of this app.
 */

import {
  COURSE_DETAILS,
  type CourseDetail,
  type CourseEpisode,
} from "@/components/trainings/content";

/* ── Workspace name (Solutions wheel core) ────────────────────────────────
 * Product rule (founder addendum, Gate B): the wheel core shows the company
 * name captured by the Brain interview (localStorage `skilltree-brain`,
 * answers.company). No setup done → "Seu Workspace". The demo build treats
 * the seeded experience as configured: fallback shows "Arkom AI" for now. */
export const DEMO_WORKSPACE_NAME = "Arkom AI";

export function resolveWorkspaceName(noSetupLabel: string): string {
  try {
    const raw = localStorage.getItem("skilltree-brain");
    if (raw) {
      const company = (JSON.parse(raw)?.answers?.company ?? "").trim();
      if (company) return company;
    }
  } catch {}
  // demo seed = setup done with the founder's company (addendum item 1);
  // a clean real account would see `noSetupLabel` ("Seu Workspace")
  return DEMO_WORKSPACE_NAME || noSetupLabel;
}

/* ── Progress aggregates (derived from the Training mock — single source) ── */
export interface CourseProgress {
  id: string;
  name: string;
  accent: string;
  lessonsDone: number;
  lessonsTotal: number;
  pct: number;
  /** deep link to the first in-progress lesson */
  continueLessonId: string | null;
}

export function computeProgress(
  courses: Record<string, CourseDetail> = COURSE_DETAILS
): CourseProgress[] {
  return Object.values(courses)
    .map((c) => {
      let done = 0,
        total = 0,
        cont: string | null = null;
      for (const m of c.modules) {
        for (const l of m.lessons) {
          total += 1;
          if (l.completed) done += 1;
          else if (l.progress > 0 && !cont) cont = l.id;
        }
      }
      const seen = c.modules.flatMap((m) => m.lessons);
      const pct = Math.round(
        seen.reduce((s, l) => s + l.progress, 0) / Math.max(seen.length, 1)
      );
      return {
        id: c.id,
        name: c.name,
        accent: c.accent,
        lessonsDone: done,
        lessonsTotal: total,
        pct,
        continueLessonId: cont,
      };
    })
    .filter((c) => c.pct > 0 || c.lessonsDone > 0)
    .sort((a, b) => b.pct - a.pct);
}

/** The "continue where you left off" hero — first partially-watched lesson.
 * Derived from COURSE_DETAILS so every ported course participates automatically. */
export function resolveContinue(
  courses: Record<string, CourseDetail> = COURSE_DETAILS
) {
  for (const course of Object.values(courses)) {
    let lessonNumber = 0;
    for (const track of course.modules) {
      for (const lesson of track.lessons) {
        lessonNumber += 1;
        if (lesson.progress <= 0 || lesson.progress >= 100 || lesson.completed) continue;
        const ep: CourseEpisode = {
          id: `lesson-${lesson.id}`,
          title: lesson.title,
          courseName: course.name,
          progress: lesson.progress,
          lesson: lessonNumber,
          accent: course.accent,
          thumb: lesson.thumb,
        };
        return { ep, lessonId: lesson.id, course };
      }
    }
  }
  return null;
}

/* ── Solutions — the founder's six mocks (wheel + featured + apps) ───────── */
export interface Solution {
  id: string;
  name: string;
  /** category chip — mirrors the live taxonomy */
  category: "agentes" | "dashboards" | "automacao";
  live: boolean;
  /** short strap (PT-neutral product copy, mirrored from live tone) */
  strap: string;
  /** what it does — drawer body lines (label → value, JobDrawer grid) */
  facts: [string, string][];
  /** map department accent that dresses it (department palette reuse) */
  accent: string;
  /** deep link: the training course that teaches it (real course ids) */
  courseId: string;
}

export const SOLUTIONS: Solution[] = [
  {
    id: "bia",
    name: "BIA",
    category: "agentes",
    live: true,
    strap: "A agente que conversa, qualifica e agenda pela sua operação.",
    facts: [
      ["Categoria", "Agentes"],
      ["Status", "Online"],
      ["Opera em", "WhatsApp · Instagram · Web"],
      ["Aprende com", "Seu segundo cérebro"],
    ],
    accent: "#FF9D5C",
    courseId: "claude-code",
  },
  {
    id: "sdr",
    name: "SDR",
    category: "agentes",
    live: true,
    strap: "Pré-venda autônoma: pesquisa, aborda e entrega leads prontos.",
    facts: [
      ["Categoria", "Agentes"],
      ["Status", "Online"],
      ["Pipeline", "Outbound · Inbound"],
      ["Entrega", "Leads qualificados na agenda"],
    ],
    accent: "#EF4444",
    courseId: "claude-code",
  },
  {
    id: "ads-desk",
    name: "Ads Desk",
    category: "dashboards",
    live: true,
    strap: "Gestão, análise e otimização de campanhas num só painel.",
    facts: [
      ["Categoria", "Dashboards"],
      ["Status", "Online"],
      ["Conecta", "Meta Ads · Google Ads"],
      ["Otimiza", "Budget · Criativos · Públicos"],
    ],
    accent: "#A78BFA",
    courseId: "heygen",
  },
  {
    id: "social-finance",
    name: "Social Finance",
    category: "dashboards",
    live: true,
    strap: "O financeiro com IA: leitura, controle e organização da operação.",
    facts: [
      ["Categoria", "Dashboards"],
      ["Status", "Online"],
      ["Lê", "Extratos · Notas · Fluxo de caixa"],
      ["Reporta", "DRE simplificado semanal"],
    ],
    accent: "#FACC15",
    courseId: "lovable-na-pratica",
  },
  {
    id: "social-selling",
    name: "Social Selling",
    category: "automacao",
    live: false,
    strap: "Vendas sociais automatizadas — do conteúdo ao fechamento.",
    facts: [
      ["Categoria", "Automação"],
      ["Status", "Em breve"],
      ["Cobre", "Conteúdo · DM · Follow-up"],
    ],
    accent: "#FB7185",
    courseId: "lovable-na-pratica",
  },
  {
    id: "crm",
    name: "CRM",
    category: "automacao",
    live: false,
    strap: "O pipeline vivo da operação, alimentado pelos agentes.",
    facts: [
      ["Categoria", "Automação"],
      ["Status", "Em breve"],
      ["Sincroniza", "BIA · SDR · Ads Desk"],
    ],
    accent: "#5EEAD4",
    courseId: "heygen",
  },
];

/* ── Mentorship events — mirrors the live pattern (14:00, weekdays) ──────── */
export interface MentorshipEvent {
  id: number;
  title: string;
  /** 'YYYY-MM-DD' — generated relative to today so o calendário nunca nasce vazio */
  event_date: string;
  starts_at: string; // 'HH:MM'
  ends_at: string | null;
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Agenda REAL de mentorias — portada read-only de `educacional.mentorship_events`
 *  (status = 'published'). Substitui a antiga agenda demo gerada. Só o que existe
 *  no banco aparece aqui. */
const MENTORSHIP_EVENTS_DB: MentorshipEvent[] = [
  { id: 45, title: "Mentoria", event_date: "2026-07-06", starts_at: "20:00", ends_at: "22:00" },
  { id: 21, title: "Mentoria Geral", event_date: "2026-07-06", starts_at: "20:48", ends_at: "22:52" },
  { id: 22, title: "Mentoria", event_date: "2026-07-08", starts_at: "14:00", ends_at: "16:00" },
  { id: 23, title: "Mentoria", event_date: "2026-07-09", starts_at: "14:00", ends_at: "16:00" },
  { id: 24, title: "Mentoria", event_date: "2026-07-10", starts_at: "14:00", ends_at: "16:00" },
  { id: 25, title: "Mentoria", event_date: "2026-07-11", starts_at: "10:00", ends_at: "11:00" },
  { id: 27, title: "Mentoria", event_date: "2026-07-13", starts_at: "14:00", ends_at: "16:00" },
  { id: 46, title: "Mentoria", event_date: "2026-07-13", starts_at: "20:00", ends_at: "22:00" },
  { id: 28, title: "Mentoria", event_date: "2026-07-14", starts_at: "20:00", ends_at: "21:00" },
  { id: 29, title: "Mentoria", event_date: "2026-07-15", starts_at: "14:00", ends_at: "16:00" },
  { id: 30, title: "Mentoria", event_date: "2026-07-16", starts_at: "14:00", ends_at: "16:00" },
  { id: 31, title: "Mentoria", event_date: "2026-07-17", starts_at: "14:00", ends_at: "16:00" },
  { id: 32, title: "Mentoria", event_date: "2026-07-18", starts_at: "10:00", ends_at: "11:00" },
  { id: 34, title: "Mentoria", event_date: "2026-07-20", starts_at: "14:00", ends_at: "16:00" },
  { id: 47, title: "Mentoria", event_date: "2026-07-20", starts_at: "20:00", ends_at: "22:00" },
  { id: 35, title: "Mentoria", event_date: "2026-07-21", starts_at: "20:00", ends_at: "21:00" },
  { id: 36, title: "Mentoria", event_date: "2026-07-22", starts_at: "14:00", ends_at: "16:00" },
  { id: 37, title: "Mentoria", event_date: "2026-07-23", starts_at: "14:00", ends_at: "16:00" },
  { id: 38, title: "Mentoria", event_date: "2026-07-24", starts_at: "14:00", ends_at: "16:00" },
  { id: 39, title: "Mentoria", event_date: "2026-07-25", starts_at: "10:00", ends_at: "11:00" },
  { id: 41, title: "Mentoria", event_date: "2026-07-27", starts_at: "14:00", ends_at: "16:00" },
  { id: 48, title: "Mentoria", event_date: "2026-07-27", starts_at: "20:00", ends_at: "22:00" },
  { id: 42, title: "Mentoria", event_date: "2026-07-28", starts_at: "20:00", ends_at: "21:00" },
  { id: 43, title: "Mentoria", event_date: "2026-07-29", starts_at: "14:00", ends_at: "16:00" },
  { id: 44, title: "Mentoria", event_date: "2026-07-30", starts_at: "14:00", ends_at: "16:00" },
];

export function buildMentorshipEvents(_today = new Date()): MentorshipEvent[] {
  return MENTORSHIP_EVENTS_DB;
}

/** Próximas N (para o card do Início) */
export function upcomingEvents(n = 3, today = new Date()): MentorshipEvent[] {
  const t = iso(today);
  return buildMentorshipEvents(today)
    .filter((e) => e.event_date >= t)
    .sort((a, b) =>
      (a.event_date + a.starts_at).localeCompare(b.event_date + b.starts_at)
    )
    .slice(0, n);
}

/* ── Últimos acessos — REAL routes of this app (visitable) ───────────────── */
export interface LastAccess {
  kind: "curso" | "app";
  label: string;
  href: string;
  agoHours: number;
}

export const LAST_ACCESSES: LastAccess[] = [
  { kind: "curso", label: "Claude Code", href: "/trainings/claude-code", agoHours: 3 },
  { kind: "curso", label: "Lovable na Prática", href: "/trainings/lovable-na-pratica", agoHours: 4 },
  { kind: "app", label: "Ads Desk", href: "/apps", agoHours: 5 },
  { kind: "app", label: "Social Finance", href: "/apps", agoHours: 5 },
  { kind: "app", label: "BIA", href: "/apps", agoHours: 6 },
];
