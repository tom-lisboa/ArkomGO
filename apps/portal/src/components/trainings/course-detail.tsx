"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Clock3, GraduationCap, Play, X } from "lucide-react";

import { ArkomLogo } from "@/components/ArkomLogo";

import { useT } from "@/lib/i18n";
import type { CourseDetail, CourseModule, Lesson } from "./content";

/** <img> que, se a fonte falhar (404 no bucket, 401 sem sessão), some e revela
 *  o fallback (glow do tema) em vez de um ícone de imagem quebrada. */
function CoverImg({
  src,
  className,
  fallback = null,
}: {
  src: string;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const [errored, setErrored] = useState(false);
  if (errored) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={className} onError={() => setErrored(true)} />;
}

/*
 * Course (modules) page building blocks (N2 · plano capacitacoes-modulos-aula).
 *
 * Skeleton = the source's Temporada tab (temporada/[serieId], tab2):
 * compact hero (~340px, logo + pill badges + clamped description), then a
 * two-column split — left 507px (continue CTA + season cards with the
 * progress bar under the title) · right 1142px (active season heading +
 * lesson rows: 208px thumb with a 4px progress base + green check).
 * "Temporada" → "Módulo": the SOURCE itself labels seasons "Módulo {n}"
 * in its mobile select — we adopt its own vocabulary.
 *
 * Skin = 100% Arkom tokens (st-card/line/ivory/ink, --st-elev-*, Jakarta).
 * Progress bars use the course department accent, never the source purple.
 */

/**
 * CapTopBar — THE back/orientation pattern for every Capacitações subpage
 * (Enterprise DS rule: one navigation primitive, reused — the lesson page's
 * breadcrumb model won over the ad-hoc mini-back). Logo → crumb trail on the
 * left · optional right slot · circular X = up one level.
 */
export function CapTopBar({
  crumbs,
  closeHref,
  closeLabel,
  right,
}: {
  crumbs: { href: string; label: string }[];
  closeHref: string;
  closeLabel: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex items-center justify-between gap-6">
      <div className="flex min-w-0 items-center gap-2">
        <Link href="/trainings" className="mr-1 text-st-ivory">
          <ArkomLogo size={15} />
        </Link>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={c.href + c.label} className="flex min-w-0 items-center gap-2">
              <Link
                href={c.href}
                className={`truncate text-[13.5px] font-medium transition-colors ${
                  last ? "text-st-ivory" : "text-st-ink-2 hover:text-st-ivory"
                }`}
              >
                {c.label}
              </Link>
              {!last ? <ChevronRight className="size-4 shrink-0 text-st-ink-3" /> : null}
            </span>
          );
        })}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {right}
        <Link
          href={closeHref}
          aria-label={closeLabel}
          title={closeLabel}
          className="flex size-8 items-center justify-center rounded-full border border-st-line bg-st-card text-st-ink-2 transition-colors hover:bg-st-card-2 hover:text-st-ivory"
        >
          <X className="size-4" />
        </Link>
      </div>
    </div>
  );
}

/** 6px progress bar, 140px wide — the source's season-card bar geometry. */
export function ProgressBar({
  pct,
  accent,
  width = 140,
  height = 6,
}: {
  pct: number;
  accent: string;
  width?: number | string;
  height?: number;
}) {
  return (
    <div
      className="overflow-hidden rounded-lg bg-st-line"
      style={{ width, height }}
    >
      <div
        className="h-full rounded-lg"
        style={{ width: `${Math.min(pct, 100)}%`, background: accent }}
      />
    </div>
  );
}

function modulePct(m: CourseModule): number {
  const total = m.lessons.reduce((s, l) => s + l.minutes, 0);
  const seen = m.lessons.reduce((s, l) => s + (l.minutes * l.progress) / 100, 0);
  return total ? Math.round((seen / total) * 100) : 0;
}

/** Compact hero — source: h-340, logo, pill badges, clamped description. */
export function CourseHero({ course }: { course: CourseDetail }) {
  const t = useT();
  const lessons = course.modules.reduce((s, m) => s + m.lessons.length, 0);
  const minutes = course.modules.reduce(
    (s, m) => s + m.lessons.reduce((a, l) => a + l.minutes, 0),
    0
  );
  return (
    <>
      {/* banner — DS radius 14 + the page-level elevation (featdrop physics) */}
      <section className="cap-elev relative h-[300px] overflow-hidden rounded-[14px] border border-st-line-2 bg-st-card">
      {course.cover ? (
        <CoverImg
          src={course.cover}
          /* capas são retratos 3:4 (mentor) num banner largo — object-cover
             centralizado corta o rosto; ancorar o crop no alto (~20%) enquadra
             o rosto e deixa o scrim/título embaixo. */
          className="absolute inset-0 h-full w-full object-cover object-[center_20%]"
        />
      ) : null}
      {/* Two-layer fade: a FIXED dark scrim keeps the white hero text legible
          in both themes (photo rule — same as the map), and a thin st-bg
          blend at the very edge stitches the hero into the page. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.25) 38%, transparent 62%), linear-gradient(to top, var(--st-bg) 0%, transparent 10%)",
        }}
      />
      <div className="relative z-10 flex h-full flex-col justify-end px-10 pb-6 max-md:px-5">
        <div className="mb-3 flex items-center gap-3">
          <GraduationCap className="size-6" style={{ color: course.accent }} />
          <h1 className="text-[30px] font-bold leading-none tracking-[-0.02em] text-white">
            {course.name}
          </h1>
        </div>
        {/* pill badges — source: 4k · N temporadas · N episódios · X minutos */}
        <div className="flex gap-2 text-xs">
          {(course.comingSoon
            ? [t.capacitacoes.comingSoonPill]
            : [
                t.capacitacoes.modulesCount(course.modules.length),
                t.capacitacoes.lessonsCount(lessons),
                t.capacitacoes.minutesShort(minutes),
              ]
          ).map((b) => (
            // photo rule: fixed dark pill in BOTH themes — sits on the cover
            <span
              key={b}
              className="rounded border border-white/15 bg-black/50 px-2 py-[5px] leading-4 text-white backdrop-blur-sm"
            >
              {b}
            </span>
          ))}
        </div>
        <p className="mt-4 max-w-xl text-[13.5px] leading-relaxed text-white/75 line-clamp-2">
          {course.strap}
        </p>
      </div>
    </section>

      {!course.comingSoon ? (
        /* tab bar — the source's underline bar identity (only Módulos is live) */
        <nav className="cap-tabbar mt-2">
          <span className="cap-tab" data-active="true">
            {t.capacitacoes.modulesTab}
          </span>
          <span className="cap-tab" data-disabled="true">
            {t.capacitacoes.filesTab}
          </span>
        </nav>
      ) : null}
    </>
  );
}

/** Estado honesto para cursos publicados antes da liberação do conteúdo. */
export function CourseComingSoon({ course }: { course: CourseDetail }) {
  const t = useT();
  return (
    <section className="cap-elev-sm mt-8 flex min-h-[220px] flex-col items-center justify-center rounded-[14px] border border-st-line-2 bg-st-card px-6 py-12 text-center">
      <span
        className="mb-5 flex size-12 items-center justify-center rounded-full border border-st-line bg-st-card-2"
        style={{ color: course.accent }}
      >
        <Clock3 className="size-5" />
      </span>
      <span className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-st-ink-3">
        {t.capacitacoes.comingSoonPill}
      </span>
      <h2 className="text-[22px] font-[650] tracking-[-0.02em] text-st-ivory">
        {t.capacitacoes.comingSoonTitle}
      </h2>
      <p className="mt-3 max-w-[560px] text-[13.5px] leading-relaxed text-st-ink-2">
        {t.capacitacoes.comingSoonBody}
      </p>
    </section>
  );
}

/** One lesson row — the source's SeasonCard: 208px thumb, 4px progress base,
 *  green check when done, title + duration + muted description. */
export function LessonRow({
  lesson,
  accent,
  index,
}: {
  lesson: Lesson;
  accent: string;
  index: number;
}) {
  const t = useT();
  return (
    <Link
      href={`/trainings/lesson/${lesson.id}`}
      className="group flex cursor-pointer items-center gap-x-7 max-md:flex-wrap max-md:items-start"
    >
      {/* thumb — source: max-w-52 (208px) min-h-114, rounded, progress on base */}
      <div className="cap-elev-sm relative min-h-[114px] w-[208px] shrink-0 overflow-hidden rounded-[14px] border border-st-line-2 bg-st-card">
        {lesson.thumb ? (
          <CoverImg
            src={lesson.thumb}
            className="absolute inset-0 h-full w-full object-cover"
            fallback={
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${accent}26 0%, transparent 62%)`,
                }}
              />
            }
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${accent}26 0%, transparent 62%)`,
            }}
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex size-10 items-center justify-center rounded-full border border-st-line bg-st-card-2 backdrop-blur-md">
            <Play className="size-4 text-st-ivory" />
          </span>
        </div>
        {/* 4px progress on the base — source geometry */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-st-line">
          <div
            className="h-1"
            style={{ width: `${lesson.progress}%`, background: accent }}
          />
        </div>
        {lesson.completed ? (
          <span
            className="absolute bottom-2 right-2 flex size-5 items-center justify-center rounded-full"
            style={{ background: accent }}
            title={t.capacitacoes.completed}
          >
            <Check className="size-3 text-black/80" />
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span className="truncate text-[14px] font-[650] tracking-[-0.01em] text-st-ivory">
            {t.capacitacoes.lesson(index)} · {lesson.title}
          </span>
          <span className="shrink-0 text-[11.5px] text-st-ink-3">
            {t.capacitacoes.minutesShort(lesson.minutes)}
          </span>
        </div>
        {/* real job description from the taxonomy — the source row's muted body */}
        <p className="text-[12.5px] leading-relaxed text-st-ink-2 line-clamp-2">
          {lesson.desc}
        </p>
        {lesson.progress > 0 && !lesson.completed ? (
          <p className="mt-1 text-[11.5px] font-medium" style={{ color: accent }}>
            {lesson.progress}% {t.capacitacoes.watched}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

/** Corpo da página do curso (client) — recebe o CourseDetail já carregado do
 *  banco pela page (server). Barra de topo + hero + módulos (ou "em breve"). */
export function CourseDetailBody({ course }: { course: CourseDetail }) {
  const t = useT();
  return (
    <div className="w-full">
      <CapTopBar
        crumbs={[
          { href: "/trainings", label: t.capacitacoes.courses },
          { href: `/trainings/${course.id}`, label: course.name },
        ]}
        closeHref="/trainings"
        closeLabel={t.capacitacoes.backToCourses}
      />
      <CourseHero course={course} />
      {course.comingSoon ? (
        <CourseComingSoon course={course} />
      ) : (
        <CourseModules course={course} />
      )}
    </div>
  );
}

/** Two-column Temporada layout — left module cards · right lesson list. */
export function CourseModules({ course }: { course: CourseDetail }) {
  const t = useT();
  const [current, setCurrent] = useState<CourseModule>(course.modules[0]);

  // "continue" = first partially-watched lesson across the course
  let cont: { m: CourseModule; l: Lesson; mi: number; li: number } | null = null;
  outer: for (let mi = 0; mi < course.modules.length; mi++) {
    const m = course.modules[mi];
    for (let li = 0; li < m.lessons.length; li++) {
      const l = m.lessons[li];
      if (l.progress > 0 && !l.completed) {
        cont = { m, l, mi: mi + 1, li: li + 1 };
        break outer;
      }
    }
  }

  return (
    <div className="mt-10 flex justify-between gap-8 max-md:flex-col">
      {/* LEFT — source: max-w 507px, continue CTA + module cards, sticky */}
      <div className="w-full max-w-[420px] flex-1 space-y-2 max-md:max-w-none">
        {cont ? (
          <Link
            href={`/trainings/lesson/${cont.l.id}`}
            className="cap-btn-p mb-8 flex items-center gap-x-4 rounded-[14px] bg-st-ivory px-6 py-3"
          >
            <Play className="size-5 shrink-0 text-st-bg" fill="currentColor" />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[14px] font-bold leading-6 text-st-bg">
                {t.capacitacoes.continueCta(cont.mi, cont.li, cont.l.title)}
              </span>
              <ProgressBar pct={cont.l.progress} accent={course.accent} />
            </span>
          </Link>
        ) : null}

        <div className="md:sticky md:top-[96px]">
          {course.modules.map((m) => {
            const active = m.id === current.id;
            const pct = modulePct(m);
            const mins = m.lessons.reduce((s, l) => s + l.minutes, 0);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setCurrent(m)}
                className={`mb-4 w-full cursor-pointer rounded-[14px] border p-6 text-left ${
                  active
                    ? "cap-elev-sm border-st-line-2 bg-st-card-2"
                    : "border-st-line-2/0 bg-st-card transition-colors hover:border-st-line-2 hover:bg-st-card-2"
                }`}
              >
                {/* line 1 — source: "Temporada N | X aulas • restante" */}
                <span className="flex items-center gap-3 text-[12px] text-st-ink-2">
                  {t.capacitacoes.moduleN(m.position)}
                  <span className="text-st-ink-3">|</span>
                  <span className="text-[11.5px] text-st-ink-3">
                    {t.capacitacoes.lessonsCount(m.lessons.length)} ·{" "}
                    {t.capacitacoes.minutesShort(mins)}
                  </span>
                </span>
                {/* line 2 — module (function) name */}
                <span className="mt-1 block truncate text-[17px] font-[650] tracking-[-0.01em] text-st-ivory">
                  {m.name}
                </span>
                {/* line 3 — the progress bar under the title (140×6) */}
                {pct > 0 ? (
                  <span className="mt-4 block">
                    <ProgressBar pct={pct} accent={course.accent} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT — source: flex-1 max-w-1142, heading + lesson rows gap-6 */}
      <div className="w-full max-w-[900px] flex-1 pb-28">
        <h2 className="mb-7 text-[18px] font-bold uppercase tracking-[0.02em] text-st-ivory">
          {t.capacitacoes.moduleN(current.position)} — {current.name}
        </h2>
        <div className="flex flex-col gap-6">
          {current.lessons.map((l, i) => (
            <LessonRow key={l.id} lesson={l} accent={course.accent} index={i + 1} />
          ))}
        </div>
      </div>
    </div>
  );
}
