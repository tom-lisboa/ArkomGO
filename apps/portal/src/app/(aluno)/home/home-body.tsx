"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, GraduationCap, Play } from "lucide-react";

import "../trainings/trainings.css";
import { useLocale, useT } from "@/lib/i18n";
import { ProgressBar } from "@/components/trainings/course-detail";
import { parseEventDate } from "@/components/mentorships/event-utils";
import type { HomeData } from "@/components/home/data";

/**
 * /home — corpo do dashboard do aluno (client). Recebe da page (server) os dados
 * REAIS do aluno logado e mantém o relógio/interatividade. Ordem das seções
 * idêntica ao mock: saudação por horário → faixa de 4 KPIs → herói duplo
 * (painel "continuar" + card de mentorias) → seu progresso → soluções em
 * destaque → últimos acessos. Skin: 100% tokens Arkom, dark+light.
 */
function useNow(): Date | null {
  // relógio client-only — saudação e datas dependem da hora do visitante; renderiza
  // após montar p/ manter SSR/CSR consistentes (mesma regra do boot de tema)
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  return now;
}

export function InicioBody({
  firstName,
  progress,
  cont,
  events,
  featured,
  featuredTitle,
  featuredSubtitle,
  banner,
  lastAccesses,
}: HomeData) {
  const t = useT();
  const { locale } = useLocale();
  const now = useNow();

  const ongoing = progress.length;
  const lessonsDone = progress.reduce((s, c) => s + c.lessonsDone, 0);
  const avg = Math.round(
    progress.reduce((s, c) => s + c.pct, 0) / Math.max(progress.length, 1)
  );

  const hour = now?.getHours() ?? 9;
  const greeting =
    hour < 12 ? t.inicio.goodMorning : hour < 18 ? t.inicio.goodAfternoon : t.inicio.goodEvening;

  const dateLabel = now
    ? new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : "en-US", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }).format(now)
    : "";

  // Faixa de destaque = a PRIMEIRA das próximas mentorias (o loader já cortou o
  // que terminou). A data aparece por extenso + dd/mm: dia da semana sozinho é
  // exatamente o que deixava a faixa antiga parecer plausível estando errada.
  const nextEvent = events[0] ?? null;
  const intl = locale === "pt" ? "pt-BR" : "en-US";
  const next = nextEvent
    ? {
        title: nextEvent.title,
        weekday: new Intl.DateTimeFormat(intl, { weekday: "long" }).format(
          parseEventDate(nextEvent.event_date)
        ),
        dayMonth: new Intl.DateTimeFormat(intl, { day: "2-digit", month: "2-digit" }).format(
          parseEventDate(nextEvent.event_date)
        ),
        time: nextEvent.starts_at.replace(":", "h"),
      }
    : null;

  const kpis: [string, string | number, string][] = [
    [t.inicio.kpiOngoing, ongoing, t.inicio.kpiOngoingSub(ongoing)],
    [t.inicio.kpiDone, lessonsDone, t.inicio.kpiDoneSub],
    [t.inicio.kpiAvg, `${avg}%`, t.inicio.kpiAvgSub],
    [t.inicio.kpiMent, events.length, t.inicio.kpiMentSub],
  ];

  return (
    <div className="w-full">
      {/* 1 · Greeting — live: eyebrow date + H1 48px, name accented */}
      <header className="mb-10">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-st-ink-3">
          {dateLabel}
        </p>
        <h1 className="text-[44px] font-bold leading-none tracking-[-0.02em] text-st-ivory">
          {greeting},{" "}
          <span style={{ color: "var(--arkom-gold, #b9915b)" }}>
            {firstName}.
          </span>
        </h1>
        <p className="mt-4 max-w-[520px] text-[15px] leading-relaxed text-st-ink-2">
          {t.inicio.heroSub}
        </p>
      </header>

      {/* 1b · Feature banner — editável no /admin/home (campos null = defaults
          originais do Claude Code); banner === null = desligado no admin */}
      {banner ? (
        <section className="cap-elev relative mb-8 h-[190px] overflow-hidden rounded-[18px] border border-st-line-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={banner.imageUrl ?? "/trainings/claude-code.png"}
            alt=""
            /* imagem do admin já vem cortada 6:1 → centraliza; só o default
               (retrato 3:4 do Claude Code) precisa do crop no alto (15%) */
            className={`absolute inset-0 h-full w-full object-cover ${
              banner.imageUrl ? "object-center" : "object-[center_15%]"
            }`}
          />
          {/* photo rule: fixed dark scrim left→right so copy reads in both themes */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.62) 42%, rgba(0,0,0,0.12) 78%, transparent 100%)",
            }}
          />
          <div className="relative z-10 flex h-full max-w-[560px] flex-col justify-center px-8">
            <span className="w-fit rounded-full border border-white/20 bg-black/40 px-3 py-1 text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/85 backdrop-blur-md">
              {banner.pill ?? t.inicio.featured}
            </span>
            <h3 className="mt-3 text-[24px] font-bold leading-tight tracking-[-0.01em] text-white">
              {banner.title ?? "Claude Code"}
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/70 line-clamp-2">
              {banner.description ??
                (locale === "pt"
                  ? "Programe com IA agentiva — do terminal ao deploy"
                  : "Agentic coding — from terminal to deploy")}
            </p>
            <Link
              href={banner.ctaHref ?? "/trainings/claude-code"}
              className="mt-3 flex w-fit items-center gap-1.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-80"
            >
              {banner.ctaLabel ?? t.inicio.seeTraining}{" "}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </section>
      ) : null}

      {/* 2 · KPI strip — live: grid 4, eyebrow + big number + sub */}
      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([label, value, sub]) => (
          <div
            key={label}
            className="cap-elev-sm rounded-[14px] border border-st-line-2 bg-st-card p-5"
          >
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-st-ink-3">
              {label}
            </p>
            <p className="mt-2 text-[34px] font-bold leading-none tracking-[-0.02em] text-st-ivory">
              {value}
            </p>
            <p className="mt-1.5 text-[12px] text-st-ink-2">{sub}</p>
          </div>
        ))}
      </section>

      {/* 2b · Announcement strip — a PRÓXIMA mentoria de verdade (events[0], já
          sem evento encerrado, vindo do loader). Era copy fixa no JSX ("Mentoria
          Geral · segunda-feira · 20h48") e por isso anunciava uma mentoria de
          06/07 semanas depois dela passar. Sem mentoria à frente, a faixa não
          aparece — melhor nada do que informação errada. */}
      {next ? (
        <Link
          href="/mentorships"
          data-testid="home-next-mentorship"
          className="cap-elev-sm mb-8 flex items-center justify-between gap-4 rounded-[14px] border bg-st-card px-5 py-3.5 transition-colors hover:bg-st-card-2"
          style={{
            borderColor: "color-mix(in srgb, var(--arkom-gold, #b9915b) 45%, transparent)",
            borderLeftWidth: 3,
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--arkom-gold, #b9915b) 10%, transparent) 0%, transparent 45%), var(--st-card)",
            boxShadow:
              "var(--st-elev-bevel), 0 10px 26px -14px color-mix(in srgb, var(--arkom-gold, #b9915b) 45%, #18181b66)",
          }}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span
              className="flex size-2 shrink-0 rounded-full"
              style={{
                background: "var(--arkom-gold, #b9915b)",
                boxShadow: "0 0 10px 1px color-mix(in srgb, var(--arkom-gold, #b9915b) 70%, transparent)",
              }}
            />
            <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-[0.14em] text-st-ink-3">
              {t.inicio.nextMentorship}
            </span>
            <span className="truncate text-[13px] text-st-ink-2">
              <b className="font-bold text-st-ivory">{next.title}</b> ·{" "}
              {/* `capitalize` viraria "Quarta-Feira" — em pt-BR só a inicial sobe */}
              <span className="first-letter:uppercase">{next.weekday}</span>, {next.dayMonth} ·{" "}
              <b className="font-bold" style={{ color: "var(--arkom-gold, #b9915b)" }}>
                {next.time}
              </b>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold text-st-ink-2">
            {t.inicio.calendarLink} <ArrowRight className="size-3.5" />
          </span>
        </Link>
      ) : null}

      {/* 3 · Dual hero — continue panel (2/3) + mentorship card (1/3) */}
      <section className="mb-14 grid gap-4 lg:grid-cols-3">
        {cont ? (
          /* returning member — the live dark "continue" panel */
          <div
            className="cap-elev relative overflow-hidden rounded-[18px] border border-st-line-2 p-7 lg:col-span-2"
            style={{
              background:
                "radial-gradient(120% 130% at 18% 0%, #1c1c1e 0%, #101012 58%, #0b0b0c 100%)",
            }}
          >
            {/* last-lesson thumbnail — anchored RIGHT, face kept in frame
                (object-position biased right-of-center); the film starts at
                the panel CENTER and darkens toward the LEFT, where the copy
                lives (founder pattern). Panel base is black → black film. */}
            {cont.thumb ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={cont.thumb}
                alt=""
                className="absolute inset-y-0 right-0 h-full w-[58%] object-cover object-[70%_center]"
              />
            ) : null}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, #101012 0%, #101012 34%, rgba(16,16,18,0.88) 50%, rgba(16,16,18,0.38) 72%, rgba(16,16,18,0.12) 100%)",
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                background: `radial-gradient(60% 55% at 82% 18%, ${cont.accent}2e 0%, transparent 70%)`,
              }}
            />
            <div className="relative z-10 flex h-full flex-col items-start">
              <span className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/80">
                <Play className="size-3" /> {t.inicio.continuePill}
              </span>
              <h2 className="mt-5 text-[36px] font-bold leading-none tracking-[-0.02em] text-white">
                {cont.name}
              </h2>
              <p className="mt-3 max-w-[560px] text-[13.5px] leading-relaxed text-white/65 line-clamp-2">
                {cont.strap}
              </p>
              <div className="mt-auto w-full pt-8">
                <div className="mb-2 flex items-center justify-between text-[12px] text-white/70">
                  <span>{t.inicio.lessonsOf(cont.lessonsDone, cont.lessonsTotal)}</span>
                  <span className="font-bold" style={{ color: cont.accent }}>
                    {cont.pct}%
                  </span>
                </div>
                <ProgressBar pct={cont.pct} accent={cont.accent} width="100%" />
                <Link
                  href={cont.lessonId ? `/trainings/lesson/${cont.lessonId}` : `/trainings/${cont.id}`}
                  className="cap-btn-p mt-6 inline-flex items-center gap-2 rounded-[12px] bg-st-ivory px-5 py-3 text-[13.5px] font-bold text-st-bg"
                >
                  <Play className="size-4" fill="currentColor" /> {t.inicio.continueCta}
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        ) : null}
        {/* onboarding "Construa seu segundo cérebro" oculto (pedido do dono).
            Sem o painel "continuar", a agenda de mentorias assume a linha. */}

        {/* upcoming mentorship — live card: date tile + rows */}
        <div
          className={`cap-elev-sm rounded-[18px] border border-st-line-2 bg-st-card p-6${
            cont ? "" : " lg:col-span-3"
          }`}
        >
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <h3 className="text-[20px] font-bold tracking-[-0.01em] text-st-ivory">
              {t.inicio.nextMentorships}
            </h3>
            <Link
              href="/mentorships"
              className="flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-st-ink-2 transition-colors hover:text-st-ivory"
            >
              {t.inicio.calendarLink} <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {/* nada à frente ⇒ diz isso (o card vazio parecia carregamento) */}
          {events.length === 0 ? (
            <p className="text-[13px] text-st-ink-3">{t.mentorias.empty}</p>
          ) : null}
          <div className={cont ? "flex flex-col gap-3" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
            {events.map((e) => {
              const d = new Date(`${e.event_date}T12:00:00`);
              const dd = String(d.getDate()).padStart(2, "0");
              const mon = new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : "en-US", { month: "short" })
                .format(d)
                .replace(".", "")
                .toUpperCase();
              const weekday = new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : "en-US", { weekday: "long" }).format(d);
              return (
                <Link
                  key={e.id}
                  href="/mentorships"
                  data-testid="home-upcoming"
                  className="flex items-center gap-4 rounded-[12px] border border-st-line bg-st-card-2/50 p-3 transition-colors hover:bg-st-card-2"
                >
                  <span
                    className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[10px] leading-none"
                    style={{
                      border: "1px solid color-mix(in srgb, var(--arkom-gold, #b9915b) 50%, transparent)",
                      background: "color-mix(in srgb, var(--arkom-gold, #b9915b) 14%, var(--st-card-2))",
                      boxShadow: "0 6px 18px -8px color-mix(in srgb, var(--arkom-gold, #b9915b) 55%, transparent)",
                    }}
                  >
                    <span className="text-[15px] font-bold" style={{ color: "var(--arkom-gold, #b9915b)" }}>
                      {dd}
                    </span>
                    <span
                      className="mt-0.5 text-[8.5px] font-bold uppercase tracking-[0.08em]"
                      style={{ color: "color-mix(in srgb, var(--arkom-gold, #b9915b) 75%, var(--st-ink-3))" }}
                    >
                      {mon}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-[650] text-st-ivory">
                      {e.title}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-st-ink-3 first-letter:uppercase">
                      {weekday} ·{" "}
                      <b className="font-bold" style={{ color: "var(--arkom-gold, #b9915b)" }}>
                        {e.starts_at.replace(":", "h")}
                        {e.ends_at ? ` – ${e.ends_at.replace(":", "h")}` : ""}
                      </b>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4 · Your progress */}
      <section className="mb-14">
        <div className="mb-1 flex items-baseline justify-between gap-4">
          <h2 className="text-[28px] font-bold tracking-[-0.01em] text-st-ivory">
            {t.inicio.yourProgress}
          </h2>
          <Link
            href="/trainings"
            className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-st-ink-2 transition-colors hover:text-st-ivory"
          >
            {t.inicio.seeTraining} <ArrowRight className="size-4" />
          </Link>
        </div>
        <p className="mb-6 text-[14px] text-st-ink-2">{t.inicio.progressSub}</p>
        <div className="grid gap-4 md:grid-cols-2">
          {progress.map((c) => (
            <Link
              key={c.id}
              href={`/trainings/${c.id}`}
              className="cap-elev-sm rounded-[14px] border border-st-line-2 bg-st-card p-5"
            >
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <GraduationCap className="size-4 shrink-0" style={{ color: c.accent }} />
                  <span className="truncate text-[15px] font-[650] tracking-[-0.01em] text-st-ivory">
                    {c.name}
                  </span>
                </span>
                <span className="text-[15px] font-bold" style={{ color: c.accent }}>
                  {c.pct}%
                </span>
              </div>
              <p className="mb-3 text-[12px] text-st-ink-3">
                {t.inicio.lessonsOf(c.lessonsDone, c.lessonsTotal)}
              </p>
              <ProgressBar pct={c.pct} accent={c.accent} width="100%" height={5} />
            </Link>
          ))}
        </div>
      </section>

      {/* 5 · Featured solutions — vitrine editável no /admin/home (copy da
          seção, cards, capa, cor e link); defaults = i18n + ranking de cliques.
          Vitrine VAZIA não renderiza: é o caso do plano que não libera os apps
          (ClickUp 86ajrgzef), em que um cabeçalho com "ver todos" apontando
          para uma área bloqueada seria só uma porta fechada com placa. */}
      {featured.length === 0 ? null : (
      <section className="mb-14">
        <div className="mb-1 flex items-baseline justify-between gap-4">
          <h2 className="text-[28px] font-bold tracking-[-0.01em] text-st-ivory">
            {featuredTitle ?? t.inicio.featured}
          </h2>
          <Link
            href="/apps"
            className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-st-ink-2 transition-colors hover:text-st-ivory"
          >
            {t.inicio.seeAll} <ArrowRight className="size-4" />
          </Link>
        </div>
        <p className="mb-6 text-[14px] text-st-ink-2">
          {featuredSubtitle ?? t.inicio.featuredSub}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {featured.map((s) => (
            <Link
              key={s.id}
              href={s.href}
              className="cap-elev-sm group overflow-hidden rounded-[14px] border border-st-line-2 bg-st-card"
            >
              <div
                className="relative flex h-[132px] items-center justify-center overflow-hidden border-b border-st-line"
                style={
                  s.coverUrl
                    ? undefined
                    : {
                        backgroundImage: `radial-gradient(120% 100% at 50% 0%, ${s.accent}24 0%, transparent 62%)`,
                      }
                }
              >
                {s.coverUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={s.coverUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <span
                    className="text-[26px] font-[650] tracking-[-0.02em]"
                    style={{ color: s.accent }}
                  >
                    {s.name}
                  </span>
                )}
              </div>
              <div className="p-4">
                <p className="text-[13.5px] font-[650] text-st-ivory">{s.name}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-st-ink-2 line-clamp-2">
                  {s.strap}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      )}

      {/* 6 · Recent activity */}
      <section className="mb-20">
        <h2 className="text-[28px] font-bold tracking-[-0.01em] text-st-ivory">
          {t.inicio.lastAccess}
        </h2>
        <p className="mb-6 mt-1 text-[14px] text-st-ink-2">{t.inicio.lastAccessSub}</p>
        <div className="cap-elev-sm overflow-hidden rounded-[14px] border border-st-line-2 bg-st-card">
          {lastAccesses.map((a, i) => {
            const ago = now
              ? Math.max(
                  1,
                  Math.round((now.getTime() - new Date(a.ts).getTime()) / 3_600_000)
                )
              : null;
            return (
              <Link
                key={a.label + i}
                href={a.href}
                className={`flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-st-card-2 ${
                  i > 0 ? "border-t border-st-line" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] ${
                      a.kind === "curso"
                        ? "border-st-line-2 bg-st-card-2 text-st-ivory"
                        : "border-st-line bg-st-card text-st-ink-2"
                    }`}
                  >
                    {a.kind === "curso" ? t.inicio.pillCourse : t.inicio.pillApp}
                  </span>
                  <span className="truncate text-[14px] font-[650] text-st-ivory">{a.label}</span>
                </span>
                <span className="shrink-0 text-[12px] text-st-ink-3">
                  {ago !== null ? t.inicio.agoHours(ago) : ""}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
