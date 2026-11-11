// lib/mentors.ts — os mentores como a ÁREA DO ALUNO precisa deles. Server-only.
//
// Uma passada só carrega tudo o que a página de mentorias mostra:
//   · a vitrine (mentores publicados, na ordem definida no /admin);
//   · quais mentores conduzem cada encontro publicado (para a capa do evento);
//   · os próximos encontros de cada mentor (para o modal dele).
// Com 3–8 mentores e algumas dezenas de eventos, são duas consultas pequenas —
// mais barato do que uma action por clique.
//
// PORTAS (nesta ordem):
//   flag `mentors_enabled` DESLIGADA ⇒ devolve o resultado vazio SEM tocar no
//   banco: a página do aluno renderiza exatamente como antes desta tarefa.
//   Migration 0014 ausente (42P01) ⇒ mesmo resultado vazio (fail-safe: nada de
//   mentor é melhor do que uma página quebrada).

import { getSql } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/feature-flags";

if (typeof window !== "undefined") {
  throw new Error("lib/mentors.ts importado no browser — server-only");
}

/** Encontro futuro de um mentor, como o modal dele exibe. */
export type MentorUpcomingEvent = {
  id: number;
  title: string;
  event_date: string; // 'YYYY-MM-DD'
  starts_at: string; // 'HH:MM'
};

export type StudentMentor = {
  id: number;
  slug: string;
  full_name: string;
  specialty: string | null;
  bio: string | null;
  /** '/api/media/covers/mentors/…' ou null (a UI cai nas iniciais). */
  photo_url: string | null;
  upcoming: MentorUpcomingEvent[];
};

export type MentorsShowcase = {
  /** A vitrine está no ar? (flag ligada E a migration existe) */
  enabled: boolean;
  mentors: StudentMentor[];
  /** eventId → ids de mentor, na ordem de exibição. */
  byEvent: Record<number, number[]>;
};

const VAZIO: MentorsShowcase = { enabled: false, mentors: [], byEvent: {} };

/** Máximo de encontros futuros listados no modal do mentor. */
const MAX_PROXIMOS = 4;

type MentorRow = {
  id: number;
  slug: string;
  full_name: string;
  specialty: string | null;
  bio: string | null;
  photo_url: string | null;
};

type VinculoRow = {
  event_id: number;
  mentor_id: number;
  title: string;
  event_date: string;
  starts_at: string;
};

/** Data local de hoje em 'YYYY-MM-DD' (compare de texto ISO, como /home). */
function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export async function loadMentorsShowcase(): Promise<MentorsShowcase> {
  if (!(await isFeatureEnabled("mentors_enabled"))) return VAZIO;

  const sql = getSql();
  try {
    const mentores = await sql<MentorRow[]>`
      SELECT id, slug, full_name, specialty, bio, photo_url
        FROM mentors
       WHERE status = 'published'
       ORDER BY sort_order, id
    `;
    if (mentores.length === 0) return { enabled: true, mentors: [], byEvent: {} };

    // Só eventos PUBLICADOS: rascunho e evento cancelado (que vira rascunho na
    // regra E3) não podem vazar para a página do aluno por esta porta.
    const vinculos = await sql<VinculoRow[]>`
      SELECT em.event_id, em.mentor_id, e.title, e.event_date, e.starts_at
        FROM event_mentors em
        JOIN mentorship_events e ON e.id = em.event_id
       WHERE e.status = 'published'
       ORDER BY em.event_id, em.sort_order, em.mentor_id
    `;

    const publicados = new Set(mentores.map((mentor) => mentor.id));
    const byEvent: Record<number, number[]> = {};
    const proximosPorMentor = new Map<number, MentorUpcomingEvent[]>();
    const hoje = hojeIso();

    for (const vinculo of vinculos) {
      // Mentor em rascunho continua vinculado ao evento no banco, mas não
      // aparece para o aluno.
      if (!publicados.has(vinculo.mentor_id)) continue;

      const doEvento = byEvent[vinculo.event_id] ?? [];
      doEvento.push(vinculo.mentor_id);
      byEvent[vinculo.event_id] = doEvento;

      if (vinculo.event_date >= hoje) {
        const lista = proximosPorMentor.get(vinculo.mentor_id) ?? [];
        lista.push({
          id: vinculo.event_id,
          title: vinculo.title,
          event_date: vinculo.event_date,
          starts_at: vinculo.starts_at,
        });
        proximosPorMentor.set(vinculo.mentor_id, lista);
      }
    }

    const mentors: StudentMentor[] = mentores.map((mentor) => ({
      ...mentor,
      upcoming: (proximosPorMentor.get(mentor.id) ?? [])
        .sort((a, b) =>
          a.event_date === b.event_date
            ? a.starts_at.localeCompare(b.starts_at)
            : a.event_date.localeCompare(b.event_date),
        )
        .slice(0, MAX_PROXIMOS),
    }));

    return { enabled: true, mentors, byEvent };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      // Migration 0014 ainda não aplicada neste ambiente.
      console.warn(
        "[arkom] mentors/event_mentors ausentes (migration 0014 não aplicada) — vitrine de mentores desligada.",
      );
    } else {
      console.error("[arkom] Falha ao carregar os mentores (vitrine desligada):", error);
    }
    return VAZIO;
  }
}
