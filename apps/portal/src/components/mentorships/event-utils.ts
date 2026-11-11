// Mentorias — tipo do evento (widened) + helpers de data/horário.
// event_date chega do banco como 'YYYY-MM-DD' e starts_at/ends_at como 'HH:MM'
// (colunas text em app_arkom.mentorship_events). Port de
// bilhon-ai/components/mentorias/event-utils.ts, com o horário no formato
// "19h00" do calendário (replace inline — sem acoplar a @/lib/utils).

export type MentorshipEvent = {
  id: number;
  title: string;
  description: string | null;
  cover_url: string | null;
  event_date: string; // 'YYYY-MM-DD'
  starts_at: string; // 'HH:MM'
  ends_at: string | null; // 'HH:MM' | null
  /** URL crua da sala. Na área do ALUNO nunca vem preenchida (D18): o payload
   *  manda só `has_access_link`, e o acesso passa por /api/mentorships/go/<id>. */
  redirect_url?: string | null;
  /** O evento TEM link de acesso? (calculado no server — o link em si fica lá.) */
  has_access_link?: boolean;
  /** 'mentoria_arkom' | 'live_comunidade' (migration 0012). Opcional: em
   *  ambientes sem a migration a coluna nem vem no SELECT. */
  event_kind?: string | null;
  /** Custo cru em créditos. O custo EFETIVO é 0 para live — use `eventCreditCost`. */
  credit_cost?: number | null;
};

/** Custo efetivo em créditos: live da comunidade nunca cobra. */
export function eventCreditCost(event: MentorshipEvent): number {
  if (event.event_kind !== "mentoria_arkom") return 0;
  const cost = Number(event.credit_cost ?? 0);
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

/**
 * Converte 'YYYY-MM-DD' em Date LOCAL (meio-dia local).
 * Nunca usar new Date('YYYY-MM-DD') direto: interpreta como UTC e desloca o dia
 * em fusos negativos (ex.: Brasil, UTC-3). O ancoramento ao meio-dia é o mesmo
 * guard já usado pelo calendário.
 */
export function parseEventDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`);
}

/** Minutos desde 00:00 do início do evento. */
export function eventStartMinutes(event: MentorshipEvent): number {
  const [h, m] = event.starts_at.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Minutos desde 00:00 do fim do evento (sem ends_at, assume +60 min). */
export function eventEndMinutes(event: MentorshipEvent): number {
  if (!event.ends_at) return eventStartMinutes(event) + 60;
  const [h, m] = event.ends_at.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Rótulo de horário: "19h00 – 20h30" (ou só "19h00" sem ends_at). */
export function eventTimeRangeLabel(event: MentorshipEvent): string {
  const start = event.starts_at.replace(":", "h");
  return event.ends_at ? `${start} – ${event.ends_at.replace(":", "h")}` : start;
}

/**
 * Fim do evento como instante real. O produto opera em GMT-3 FIXO (decisão do
 * dono, 2026-07-27) — offset explícito na string para não depender do fuso do
 * navegador do aluno. Sem `ends_at` válido vale o mesmo fallback de
 * `eventEndMinutes`: início + 60 min. Dado torto ⇒ null.
 */
export function eventEndInstant(event: MentorshipEvent): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.event_date)) return null;
  const hhmm = (v: string | null | undefined) =>
    v && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : null;
  const end = hhmm(event.ends_at);
  if (end) return new Date(`${event.event_date}T${end}:00-03:00`);
  const start = hhmm(event.starts_at);
  if (!start) return null;
  const instant = new Date(`${event.event_date}T${start}:00-03:00`);
  instant.setMinutes(instant.getMinutes() + 60);
  return instant;
}

/** A mentoria já terminou? Dado torto ⇒ `false` (a favor do aluno) — o corte
 *  que vale de verdade é o do servidor (`loadEventCredit.hasEnded`). */
export function eventHasEnded(event: MentorshipEvent, now: Date = new Date()): boolean {
  const end = eventEndInstant(event);
  return end !== null && now.getTime() > end.getTime();
}

/** Antecedência com que a SALA abre. Espelho do
 *  `lib/credit-policy.ts#ACCESS_WINDOW_MINUTES` — o corte que vale é o de lá
 *  (relógio do banco); aqui só evita mandar o aluno bater na porta fechada. */
export const ACCESS_WINDOW_MINUTES = 30;

/** Início do evento como instante real (mesmo GMT-3 fixo do fim). Dado torto
 *  ⇒ null. */
export function eventStartInstant(event: MentorshipEvent): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.event_date)) return null;
  if (!/^\d{2}:\d{2}/.test(event.starts_at ?? "")) return null;
  return new Date(`${event.event_date}T${event.starts_at.slice(0, 5)}:00-03:00`);
}

/**
 * A sala já pode ser aberta? (dono, 2026-07-29) — abre `ACCESS_WINDOW_MINUTES`
 * antes do início e fecha quando o evento termina. Dado torto ⇒ `true`, a favor
 * do aluno: quem decide de verdade é a rota /api/mentorships/go/<id>.
 */
export function eventAccessOpen(
  event: MentorshipEvent,
  now: Date = new Date()
): boolean {
  if (eventHasEnded(event, now)) return false;
  const start = eventStartInstant(event);
  if (start === null) return true;
  return now.getTime() >= start.getTime() - ACCESS_WINDOW_MINUTES * 60_000;
}

/** Hora em que a sala abre, no formato do calendário ("13h30"). Derivada do
 *  TEXTO `starts_at` (não de Date): o rótulo é horário de Brasília como todo o
 *  resto da tela, independente do fuso do navegador. Vira null com dado torto. */
export function eventAccessOpensLabel(event: MentorshipEvent): string | null {
  if (!/^\d{2}:\d{2}/.test(event.starts_at ?? "")) return null;
  const [h, m] = event.starts_at.slice(0, 5).split(":").map(Number);
  const minutos = ((h * 60 + m - ACCESS_WINDOW_MINUTES) % 1440 + 1440) % 1440;
  const hh = String(Math.floor(minutos / 60)).padStart(2, "0");
  const mm = String(minutos % 60).padStart(2, "0");
  return `${hh}h${mm}`;
}
