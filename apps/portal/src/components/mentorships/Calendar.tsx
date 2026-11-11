"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import { CalendarX2, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";

import { useLocale, useT } from "@/lib/i18n";
import { EventModal } from "./event-modal";
import type { MentorView } from "./mentors";
import {
  eventEndMinutes,
  eventHasEnded,
  eventStartMinutes,
  eventTimeRangeLabel,
  type MentorshipEvent,
} from "./event-utils";

/**
 * Mentorship calendar — PORT of bilhon-solutions
 * `components/mentorships/calendar.tsx` (475 lines, hand-rolled on date-fns).
 * Same architecture: `view: mensal|semanal|diaria` + `cursor: Date`,
 * eventsByDay Map keyed 'yyyy-MM-dd', monthly grid (7 cols, max 3 pills/day
 * + "+N more" jumping to the daily view), weekly grid (52px per hour,
 * absolute-positioned events, dynamic 08–22h range), daily list cards.
 * Reskinned 100% to Arkom tokens (--st-*, .cap-elev-sm) — the source's
 * gold/accent classes stay behind.
 */

type View = "mensal" | "semanal" | "diaria";
const HOUR_PX = 52;
const MAX_PILLS_PER_DAY = 3;

function dayKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
// Helpers consolidados em ./event-utils (mesma regra: sem ends_at → +60min;
// horário "19h00"). Aliases mantêm os call-sites locais inalterados.
const startMinutes = eventStartMinutes;
const endMinutes = eventEndMinutes;
const timeLabel = eventTimeRangeLabel;

/**
 * Créditos do aluno como a tela precisa deles (Tarefa 1). Vem do server
 * component; `visible: false` (flag `entitlements_enabled` desligada) faz o
 * calendário renderizar exatamente como antes dos créditos existirem.
 */
export type StudentCreditView = {
  visible: boolean;
  balance: number;
  unlimited: boolean;
  /** Cota do plano (o "Y" do contador X/Y do cabeçalho). `null` = ilimitado. */
  quota: number | null;
  /** Nome do plano do aluno (tooltip do contador). */
  planName: string | null;
  /** Créditos valendo de verdade: saldo insuficiente barra a confirmação. */
  enforcing: boolean;
};

export function MentorshipCalendar({
  events,
  confirmedEventIds = [],
  credit,
  liveBalance,
  onLiveBalanceChange,
  mentorsById,
  mentorsByEvent,
  onOpenMentor,
  selectedEventId,
  onSelectedEventIdChange,
}: {
  events: MentorshipEvent[];
  confirmedEventIds?: number[];
  credit?: StudentCreditView;
  /** Saldo vivo CONTROLADO pelo pai (MentoriasBody), que também exibe o
   *  contador do cabeçalho — um número só para badge e capa do evento. */
  liveBalance?: number;
  onLiveBalanceChange?: (novoSaldo: number) => void;
  /** Mentores publicados por id (Tarefa 2). Vazio ⇒ nada muda na capa. */
  mentorsById?: Map<number, MentorView>;
  /** eventId → ids de mentor, na ordem de exibição. */
  mentorsByEvent?: Record<number, number[]>;
  /** Abre o perfil do mentor (o modal vive em MentoriasBody). */
  onOpenMentor?: (mentorId: number) => void;
  /** Capa do evento CONTROLADA pelo pai (opcional) — permite ao MentoriasBody
   *  reabrir o evento de origem quando o perfil do mentor é fechado. */
  selectedEventId?: number | null;
  onSelectedEventIdChange?: (id: number | null) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const dfLocale = locale === "pt" ? ptBR : enUS;

  const [view, setView] = useState<View>("mensal");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  // Capa do evento: controlada pelo pai quando fornecida (volta-do-mentor),
  // senão estado local — comportamento antigo intacto.
  const [selectedLocal, setSelectedLocal] = useState<number | null>(null);
  const selectedId = selectedEventId !== undefined ? selectedEventId : selectedLocal;
  const setSelectedId = onSelectedEventIdChange ?? setSelectedLocal;
  const [confirmedIds, setConfirmedIds] = useState<Set<number>>(
    () => new Set(confirmedEventIds)
  );
  // Saldo vivo: cada confirmação/estorno devolve o saldo novo, e a capa do
  // evento mostra o número atualizado sem esperar um refresh da página.
  // Controlado pelo pai quando fornecido (o contador do cabeçalho usa o mesmo
  // número); senão, estado local — comportamento antigo intacto.
  const [balanceLocal, setBalanceLocal] = useState<number>(credit?.balance ?? 0);
  const balance = liveBalance ?? balanceLocal;
  const setBalance = onLiveBalanceChange ?? setBalanceLocal;

  const eventsByDay = useMemo(() => {
    const map = new Map<string, MentorshipEvent[]>();
    for (const e of events) {
      const list = map.get(e.event_date) ?? [];
      list.push(e);
      map.set(e.event_date, list);
    }
    for (const list of map.values()) list.sort((a, b) => startMinutes(a) - startMinutes(b));
    return map;
  }, [events]);

  const navigate = (dir: -1 | 1) =>
    setCursor((c) =>
      view === "mensal" ? addMonths(c, dir) : view === "semanal" ? addWeeks(c, dir) : addDays(c, dir)
    );

  const periodLabel =
    view === "mensal"
      ? format(cursor, "MMMM 'de' yyyy", { locale: dfLocale })
      : view === "semanal"
        ? `${format(startOfWeek(cursor, { weekStartsOn: 1 }), "dd MMM", { locale: dfLocale })} – ${format(
            endOfWeek(cursor, { weekStartsOn: 1 }),
            "dd MMM",
            { locale: dfLocale }
          )}`
        : format(cursor, "EEEE, dd 'de' MMMM", { locale: dfLocale });

  const tabs: [View, string][] = [
    ["mensal", t.mentorias.monthly],
    ["semanal", t.mentorias.weekly],
    ["diaria", t.mentorias.daily],
  ];

  return (
    <div className="w-full">
      {/* toolbar em linha própria (largura total) → o calendário e o card
          "Próximas mentorias" começam na MESMA altura no grid abaixo. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="‹"
              onClick={() => navigate(-1)}
              className="flex size-9 items-center justify-center rounded-[10px] border border-st-line bg-st-card text-st-ink-2 transition-colors hover:bg-st-card-2 hover:text-st-ivory"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setCursor(new Date())}
              className="rounded-[10px] border border-st-line bg-st-card px-3.5 py-2 text-[12.5px] font-semibold text-st-ink-2 transition-colors hover:bg-st-card-2 hover:text-st-ivory"
            >
              {t.mentorias.today}
            </button>
            <button
              type="button"
              aria-label="›"
              onClick={() => navigate(1)}
              className="flex size-9 items-center justify-center rounded-[10px] border border-st-line bg-st-card text-st-ink-2 transition-colors hover:bg-st-card-2 hover:text-st-ivory"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <span className="text-[17px] font-[650] capitalize tracking-[-0.01em] text-st-ivory">
            {periodLabel}
          </span>
        </div>

        {/* segmented — source: pill container + active tab lifted */}
        <div
          role="tablist"
          className="flex items-center gap-1 rounded-[14px] border border-st-line bg-st-card p-1"
        >
          {tabs.map(([key, label]) => {
            const on = view === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => setView(key)}
                className={`rounded-[10px] px-4 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  on ? "bg-st-card-2 text-st-ivory" : "text-st-ink-3 hover:text-st-ink-2"
                }`}
                style={on ? { boxShadow: "var(--st-elev-bevel)" } : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
      {view === "mensal" ? (
        <MonthGrid
          cursor={cursor}
          eventsByDay={eventsByDay}
          onSelect={setSelectedId}
          onMore={(d) => {
            setCursor(d);
            setView("diaria");
          }}
        />
      ) : view === "semanal" ? (
        <WeekGrid cursor={cursor} eventsByDay={eventsByDay} onSelect={setSelectedId} />
      ) : (
        <DayList
          cursor={cursor}
          eventsByDay={eventsByDay}
          onSelect={setSelectedId}
          confirmedIds={confirmedIds}
        />
      )}
        </div>

        {/* lado direito — o card "Próximas mentorias" da home */}
        <UpcomingCard
          events={events}
          confirmedIds={confirmedIds}
          onSelect={setSelectedId}
        />
      </div>

      <EventModal
        event={events.find((e) => e.id === selectedId) ?? null}
        confirmed={selectedId != null && confirmedIds.has(selectedId)}
        credit={credit ? { ...credit, balance } : undefined}
        mentors={
          selectedId == null || !mentorsById
            ? []
            : (mentorsByEvent?.[selectedId] ?? [])
                .map((mentorId) => mentorsById.get(mentorId))
                .filter((mentor): mentor is MentorView => mentor !== undefined)
        }
        // Um modal por vez: a capa fecha e o perfil do mentor abre no lugar
        // (o modal do mentor mora em MentoriasBody).
        onOpenMentor={
          onOpenMentor
            ? (mentorId) => {
                setSelectedId(null);
                onOpenMentor(mentorId);
              }
            : undefined
        }
        onClose={() => setSelectedId(null)}
        onBalanceChange={setBalance}
        onConfirmedChange={(id, isConfirmed) =>
          setConfirmedIds((prev) => {
            const nextSet = new Set(prev);
            if (isConfirmed) nextSet.add(id);
            else nextSet.delete(id);
            return nextSet;
          })
        }
      />
    </div>
  );
}

/* ── Próximas mentorias — CÓPIA do card do herói duplo da /home (tile de data
   dourado + linha do evento). Aqui as linhas abrem o MESMO EventModal do
   calendário (capa + confirmar presença) em vez de linkar pra /mentorships. ── */
function UpcomingCard({
  events,
  confirmedIds,
  onSelect,
}: {
  events: MentorshipEvent[];
  confirmedIds: Set<number>;
  onSelect: (id: number) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  // chave de hoje estável entre SSR/CSR (mesma técnica do cursor acima)
  const [todayKey] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [agora] = useState(() => new Date());
  // `events` já chega ordenado por data+hora do server component. O corte por
  // data sozinho mantinha o encontro de HOJE que já terminou no topo de
  // "próximas" até a meia-noite — `eventHasEnded` corta na hora certa (GMT-3).
  const upcoming = events
    .filter((e) => e.event_date >= todayKey && !eventHasEnded(e, agora))
    .slice(0, 6);

  return (
    <div className="cap-elev-sm rounded-[18px] border border-st-line-2 bg-st-card p-6">
      <h3 className="mb-5 text-[20px] font-bold tracking-[-0.01em] text-st-ivory">
        {t.inicio.nextMentorships}
      </h3>
      {upcoming.length === 0 ? (
        <p className="text-[13px] text-st-ink-3">{t.mentorias.empty}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {upcoming.map((e) => {
            const d = new Date(`${e.event_date}T12:00:00`);
            const dd = String(d.getDate()).padStart(2, "0");
            const mon = new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : "en-US", {
              month: "short",
            })
              .format(d)
              .replace(".", "")
              .toUpperCase();
            const weekday = new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : "en-US", {
              weekday: "long",
            }).format(d);
            return (
              <button
                key={e.id}
                type="button"
                data-testid={`upcoming-${e.id}`}
                onClick={() => onSelect(e.id)}
                className="flex w-full items-center gap-4 rounded-[12px] border border-st-line bg-st-card-2/50 p-3 text-left transition-colors hover:bg-st-card-2"
              >
                <span
                  className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[10px] leading-none"
                  style={{
                    border:
                      "1px solid color-mix(in srgb, var(--arkom-gold, #b9915b) 50%, transparent)",
                    background:
                      "color-mix(in srgb, var(--arkom-gold, #b9915b) 14%, var(--st-card-2))",
                    boxShadow:
                      "0 6px 18px -8px color-mix(in srgb, var(--arkom-gold, #b9915b) 55%, transparent)",
                  }}
                >
                  <span
                    className="text-[15px] font-bold"
                    style={{ color: "var(--arkom-gold, #b9915b)" }}
                  >
                    {dd}
                  </span>
                  <span
                    className="mt-0.5 text-[8.5px] font-bold uppercase tracking-[0.08em]"
                    style={{
                      color:
                        "color-mix(in srgb, var(--arkom-gold, #b9915b) 75%, var(--st-ink-3))",
                    }}
                  >
                    {mon}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-[650] text-st-ivory">
                    {e.title}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] capitalize text-st-ink-3">
                    {weekday} ·{" "}
                    <b className="font-bold" style={{ color: "var(--arkom-gold, #b9915b)" }}>
                      {e.starts_at.replace(":", "h")}
                      {e.ends_at ? ` – ${e.ends_at.replace(":", "h")}` : ""}
                    </b>
                  </span>
                </span>
                {confirmedIds.has(e.id) ? (
                  <CheckCircle2
                    className="size-4 shrink-0 text-green-300"
                    aria-label={t.mentorias.confirmed}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Monthly — 7-col grid, day cells min-h 7rem, pills max 3 + "+N" ──────── */
function MonthGrid({
  cursor,
  eventsByDay,
  onMore,
  onSelect,
}: {
  cursor: Date;
  eventsByDay: Map<string, MentorshipEvent[]>;
  onMore: (d: Date) => void;
  onSelect: (id: number) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const dfLocale = locale === "pt" ? ptBR : enUS;

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
  });
  const weekdays = eachDayOfInterval({
    start: startOfWeek(cursor, { weekStartsOn: 1 }),
    end: endOfWeek(cursor, { weekStartsOn: 1 }),
  });

  return (
    <div className="cap-elev-sm overflow-hidden rounded-[14px] border border-st-line-2 bg-st-card">
      {/* weekday header */}
      <div className="grid grid-cols-7 border-b border-st-line">
        {weekdays.map((d) => (
          <div
            key={d.toISOString()}
            className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-st-ink-3"
          >
            {format(d, "EEE", { locale: dfLocale }).replace(".", "")}
          </div>
        ))}
      </div>
      {/* day cells */}
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const inMonth = isSameMonth(d, cursor);
          const today = isToday(d);
          const list = eventsByDay.get(dayKey(d)) ?? [];
          const visible = list.slice(0, MAX_PILLS_PER_DAY);
          const hidden = list.length - visible.length;
          return (
            <div
              key={d.toISOString()}
              className={`min-h-[7rem] border-st-line p-1.5 ${i % 7 !== 0 ? "border-l" : ""} ${
                i >= 7 ? "border-t" : ""
              } ${inMonth ? "" : "opacity-45"}`}
            >
              <span
                className={`mb-1 flex size-5 items-center justify-center rounded-full text-[11px] ${
                  today
                    ? "bg-st-ivory font-bold text-st-bg"
                    : "font-medium text-st-ink-2"
                }`}
              >
                {format(d, "d")}
              </span>
              <div className="flex flex-col gap-1">
                {visible.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    data-testid={`event-pill-${e.id}`}
                    onClick={() => onSelect(e.id)}
                    className="block w-full cursor-pointer truncate rounded-[6px] border-l-2 bg-st-card-2 px-1.5 py-0.5 text-left text-[10px] font-medium text-st-ivory transition hover:brightness-125"
                    style={{ borderLeftColor: "var(--arkom-gold, #b9915b)" }}
                    title={`${timeLabel(e)} ${e.title}`}
                  >
                    {e.starts_at} {e.title}
                  </button>
                ))}
                {hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => onMore(d)}
                    className="rounded-[6px] px-1.5 py-0.5 text-left text-[10px] font-semibold text-st-ink-3 transition-colors hover:bg-st-card-2 hover:text-st-ivory"
                  >
                    {t.mentorias.more(hidden)}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Weekly — hour rail + 7 day columns, events positioned by minutes ────── */
function WeekGrid({
  cursor,
  eventsByDay,
  onSelect,
}: {
  cursor: Date;
  eventsByDay: Map<string, MentorshipEvent[]>;
  onSelect: (id: number) => void;
}) {
  const { locale } = useLocale();
  const dfLocale = locale === "pt" ? ptBR : enUS;

  const days = eachDayOfInterval({
    start: startOfWeek(cursor, { weekStartsOn: 1 }),
    end: endOfWeek(cursor, { weekStartsOn: 1 }),
  });

  // dynamic 08–22 range that expands to fit events (source behavior)
  let firstH = 8,
    lastH = 22;
  for (const d of days) {
    for (const e of eventsByDay.get(dayKey(d)) ?? []) {
      firstH = Math.min(firstH, Math.floor(startMinutes(e) / 60));
      lastH = Math.max(lastH, Math.ceil(endMinutes(e) / 60));
    }
  }
  const hours = Array.from({ length: lastH - firstH }, (_, i) => firstH + i);

  return (
    <div className="cap-elev-sm overflow-x-auto rounded-[14px] border border-st-line-2 bg-st-card">
      <div className="min-w-[840px]">
        {/* header row */}
        <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b border-st-line">
          <div />
          {days.map((d) => (
            <div key={d.toISOString()} className="border-l border-st-line px-2 py-2.5 text-center">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-st-ink-3">
                {format(d, "EEE", { locale: dfLocale }).replace(".", "")}
              </span>{" "}
              <span
                className={`ml-1 inline-flex size-5 items-center justify-center rounded-full text-[11px] ${
                  isToday(d) ? "bg-st-ivory font-bold text-st-bg" : "text-st-ink-2"
                }`}
              >
                {format(d, "d")}
              </span>
            </div>
          ))}
        </div>
        {/* body */}
        <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]">
          {/* hour rail */}
          <div className="relative" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h, i) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-st-ink-3"
                style={{ top: i * HOUR_PX }}
              >
                {String(h).padStart(2, "0")}h
              </span>
            ))}
          </div>
          {/* day columns */}
          {days.map((d) => {
            const list = eventsByDay.get(dayKey(d)) ?? [];
            return (
              <div
                key={d.toISOString()}
                className="relative border-l border-st-line"
                style={{ height: hours.length * HOUR_PX }}
              >
                {hours.map((h, i) =>
                  i > 0 ? (
                    <span
                      key={h}
                      className="absolute inset-x-0 border-t border-st-line/60"
                      style={{ top: i * HOUR_PX }}
                    />
                  ) : null
                )}
                {list.map((e) => {
                  const top = ((startMinutes(e) - firstH * 60) / 60) * HOUR_PX;
                  const height = Math.max(
                    ((endMinutes(e) - startMinutes(e)) / 60) * HOUR_PX,
                    26
                  );
                  return (
                    <button
                      key={e.id}
                      type="button"
                      data-testid={`event-pill-${e.id}`}
                      onClick={() => onSelect(e.id)}
                      className="absolute inset-x-1 flex flex-col overflow-hidden rounded-[8px] border-l-2 bg-st-card-2 px-2 py-1 text-left transition hover:brightness-125"
                      style={{
                        top,
                        height,
                        borderLeftColor: "var(--arkom-gold, #b9915b)",
                      }}
                      title={`${timeLabel(e)} ${e.title}`}
                    >
                      <span className="block truncate text-[10.5px] font-bold text-st-ivory">
                        {e.title}
                      </span>
                      <span className="block truncate text-[9.5px] text-st-ink-3">
                        {timeLabel(e)}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Daily — vertical list of cards (hour block + body) ──────────────────── */
function DayList({
  cursor,
  eventsByDay,
  onSelect,
  confirmedIds,
}: {
  cursor: Date;
  eventsByDay: Map<string, MentorshipEvent[]>;
  onSelect: (id: number) => void;
  confirmedIds: Set<number>;
}) {
  const t = useT();
  const list = eventsByDay.get(dayKey(cursor)) ?? [];

  if (list.length === 0) {
    return (
      <div className="cap-elev-sm flex flex-col items-center gap-3 rounded-[14px] border border-st-line-2 bg-st-card px-6 py-16 text-center">
        <CalendarX2 className="size-7 text-st-ink-3" />
        <p className="text-[13.5px] text-st-ink-2">{t.mentorias.empty}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {list.map((e) => (
        <button
          key={e.id}
          type="button"
          data-testid={`event-pill-${e.id}`}
          onClick={() => onSelect(e.id)}
          className="cap-elev-sm flex w-full items-center gap-4 rounded-[14px] border border-st-line-2 bg-st-card p-4 text-left transition-colors hover:bg-st-card-2"
        >
          <span
            className="flex w-24 shrink-0 flex-col items-center justify-center rounded-[10px] border border-st-line bg-st-card-2 px-2 py-3 leading-none"
            style={{ color: "var(--arkom-gold, #b9915b)" }}
          >
            <span className="text-[15px] font-bold">{e.starts_at.replace(":", "h")}</span>
            {e.ends_at ? (
              <span className="mt-1 text-[10px] opacity-70">
                – {e.ends_at.replace(":", "h")}
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-[650] text-st-ivory">{e.title}</span>
            <span className="mt-0.5 block text-[12px] text-st-ink-3">{timeLabel(e)}</span>
          </span>
          {confirmedIds.has(e.id) && (
            <span
              data-testid="confirmed-badge"
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-[11px] font-semibold text-green-300"
            >
              <CheckCircle2 className="size-3" />
              {t.mentorias.confirmed}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
