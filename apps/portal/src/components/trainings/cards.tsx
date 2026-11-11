"use client";

import { useState } from "react";
import Link from "next/link";
import { GraduationCap, Lock } from "lucide-react";

import { useT } from "@/lib/i18n";
import { EPISODE_TO_LESSON, resolveCourseId } from "./content";
import type { Course, CourseEpisode } from "./content";

function courseKindLabel(course: Course, t: ReturnType<typeof useT>): string {
  if (course.comingSoon) return t.capacitacoes.comingSoonPill;
  if (course.kind === "course") return t.capacitacoes.coursePill;
  if (course.kind === "module") return t.capacitacoes.modulePill;
  return t.capacitacoes.departmentPill;
}

/**
 * Capacitações cards (N2 · plano capacitacoes-outsider-merge).
 *
 * Skeleton = Outsider (dimensions, hierarchy, order):
 *   · CourseCard      → PlayerCard        322w · media 322×195 · progress 4px
 *   · TopNineCard     → giant ranked nº   ~272px gradient + poster 166×206
 *   · PortraitCard    → PlayerCardSeries  poster 322×425
 *
 * Skin = 100% Arkom tokens: rounded-14 cards on --st-card with --st-line-2
 * hairlines, hover to --st-card-2, ivory/ink text scale, Jakarta 650. Course
 * media has no photography — the media area is a token-only surface with the
 * department accent as a soft radial glow (never a copied Outsider value).
 */

/**
 * Accent → translucent glow. Accepts a hex ("#FF9D5C") or a token
 * ("var(--st-ivory)") — color-mix keeps token accents theme-adaptive, so the
 * neutral module glow flips correctly between dark and light.
 */
function glow(accent: string, pct = 15): string {
  return accent.startsWith("var(")
    ? `color-mix(in srgb, ${accent} ${pct}%, transparent)`
    : `${accent}26`;
}

/**
 * Media surface. Token-only accent glow by default; with `thumb` it renders
 * the illustrative product image (cover) under a dark scrim so overlaid text
 * stays legible — photo zones use fixed white type in BOTH themes (same rule
 * as the map), so nothing breaks when light mode is on.
 */
function MediaSurface({
  accent,
  thumb,
  scrim = false,
  children,
  className = "",
}: {
  accent: string;
  thumb?: string;
  /** stronger bottom gradient when text sits ON the image */
  scrim?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  // Uma capa ausente/negada (404 no bucket, 401 sem sessão) cai para o glow do
  // tema em vez de mostrar um ícone de imagem quebrada.
  const [errored, setErrored] = useState(false);
  const showThumb = Boolean(thumb) && !errored;
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-st-card ${className}`}
      style={
        showThumb
          ? undefined
          : {
              backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${glow(accent)} 0%, transparent 62%)`,
            }
      }
    >
      {showThumb ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setErrored(true)}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: scrim
                ? "linear-gradient(to top, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.18) 45%, rgba(0,0,0,0.12) 100%)"
                : "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 55%)",
            }}
          />
        </>
      ) : null}
      {children}
    </div>
  );
}

/**
 * A frase do cadeado. Dois motivos, uma frase cada — quem vê o cadeado precisa
 * saber se é questão de ESPERAR (tempo de casa) ou de PLANO (falar com o time).
 * `undefined` quando o curso não está bloqueado.
 */
function lockLabelFor(course: Course, t: ReturnType<typeof useT>): string | undefined {
  if (course.locked !== true) return undefined;
  return course.lockReason === "plan"
    ? t.capacitacoes.notInPlan
    : t.capacitacoes.releaseInDays(course.releaseInDays ?? 0);
}

/** Véu do cadeado sobre a capa — mesmo desenho nos dois formatos de card. */
function LockOverlay({ label }: { label: string | undefined }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 backdrop-blur-[1px]">
      <span className="flex size-9 items-center justify-center rounded-full border border-white/20 bg-black/50">
        <Lock className="size-4 text-white" />
      </span>
      {label ? (
        <span
          data-testid="course-card-lock"
          className="rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-center text-[10px] font-semibold text-white"
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** Small pill — Outsider's duration/tag badge, in Arkom skin. */
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-st-line bg-st-card-2 px-3 py-1 text-[11px] font-medium text-st-ink-2 backdrop-blur-md">
      {children}
    </span>
  );
}

/* ── Continuar assistindo — landscape card with progress ────────────────── */
export function CourseCard({ ep }: { ep: CourseEpisode }) {
  const t = useT();
  const lessonId = EPISODE_TO_LESSON[ep.id];
  return (
    <Link
      href={lessonId ? `/trainings/lesson/${lessonId}` : "/trainings"}
      className="cap-elev group block w-[322px] shrink-0 cursor-pointer overflow-hidden rounded-[14px] border border-st-line-2 bg-st-card"
    >
      {/* media 322×195 — Outsider thumb ratio */}
      <MediaSurface accent={ep.accent} thumb={ep.thumb} className="h-[195px] w-full">
        {!ep.thumb ? (
          <span
            className="font-[650] tracking-[-0.02em]"
            style={{ color: ep.accent, fontSize: 44, opacity: 0.85 }}
          >
            {ep.title.slice(0, 1)}
          </span>
        ) : null}
        <div className="absolute right-4 top-4">
          <Pill>{t.capacitacoes.lesson(ep.lesson)}</Pill>
        </div>
      </MediaSurface>

      {/* progress — Outsider: 4px track full-width under the thumb */}
      <div className="relative h-1 w-full bg-st-line">
        <div
          className="absolute h-1"
          style={{ width: `${ep.progress}%`, background: ep.accent }}
        />
      </div>

      {/* meta — Outsider hierarchy: small row (title + %) then big line */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-st-ink-3">
            {ep.courseName}
          </span>
          <span className="text-[11px] font-medium text-st-ink-3">
            {ep.progress}%
          </span>
        </div>
        <div className="mt-1 truncate text-[16px] font-[650] leading-6 tracking-[-0.01em] text-st-ivory">
          {ep.title}
        </div>
      </div>
    </Link>
  );
}

/* ── Top 9 — giant ranked number + compact poster ────────────────────────── */
export function TopNineCard({
  course,
  rank,
  disabled = false,
}: {
  course: Course;
  rank: number;
  /** Prateleira configurada como não clicável (`course_rails.clickable=false`):
   *  o card fica igual, só não navega. Não é o mesmo que `locked` — este não
   *  mostra cadeado nem P&B. */
  disabled?: boolean;
}) {
  const t = useT();
  // Curso bloqueado: P&B + cadeado + o MOTIVO, e SEM link (nem abre por clique
  // — a página também guarda). São dois motivos possíveis: ainda não liberou
  // pelo tempo de casa (release_after_days) ou não está no plano (86ajrgzef).
  const locked = course.locked === true;
  const lockLabel = lockLabelFor(course, t);

  const inner = (
    <>
      {/* ranked number — Outsider parameter: ~272px, leading 0.8, tight
          tracking, gradient text. Theming lives in trainings.css
          (.cap-rank): dark keeps the original quiet dark gradient; light
          paints the department's /map palette via --dept; typed @property
          stops make the theme flip a smooth crossfade. */}
      <div
        className={`cap-rank bg-clip-text text-[271px] font-bold leading-[0.8] ${
          rank === 1 ? "tracking-[-47px]" : "tracking-[-30px]"
        }`}
        style={{ ["--dept" as string]: course.accent }}
      >
        {rank}
      </div>

      {/* poster 166×206 — Outsider dimensions, Arkom surface */}
      <div
        className={`group relative h-[206px] w-[166px] overflow-hidden rounded-[14px] border border-st-line-2 transition-colors ${
          locked ? "" : "hover:border-white/20"
        }`}
      >
        <div className={locked ? "h-full w-full grayscale" : "h-full w-full"}>
          <MediaSurface accent={course.accent} thumb={course.thumb} scrim className="h-full w-full">
            <span
              className={`max-w-[130px] text-center text-[15px] font-[650] leading-tight tracking-[-0.01em] ${
                course.thumb ? "absolute bottom-3 left-2 right-2 text-white" : "text-st-ivory"
              }`}
            >
              {course.name}
            </span>
            <div className="absolute right-0 top-0 rounded-bl-[10px] border-b border-l border-st-line bg-st-card-2 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-st-ink-2 backdrop-blur-md">
              {locked ? t.capacitacoes.locked : courseKindLabel(course, t)}
            </div>
          </MediaSurface>
        </div>
        {locked ? <LockOverlay label={lockLabel} /> : null}
      </div>
    </>
  );

  if (locked || disabled) {
    return (
      <div
        aria-disabled
        title={lockLabel}
        className="flex shrink-0 cursor-default items-center leading-none"
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={`/trainings/${resolveCourseId(course.id)}`}
      className="flex shrink-0 cursor-pointer items-center leading-none"
    >
      {inner}
    </Link>
  );
}

/* ── Séries / Você pode gostar — portrait poster ─────────────────────────── */
export function PortraitCard({
  course,
  disabled = false,
  fluid = false,
}: {
  course: Course;
  /** Prateleira configurada como não clicável (`course_rails.clickable=false`)
   *  — é o caso da prateleira "Em breve": o curso é anunciado, não visitado. */
  disabled?: boolean;
  /** Largura fluida (100% da célula) — usado pela GRADE "Todos os cursos";
   *  nos trilhos horizontais permanece o poster fixo 322×425. */
  fluid?: boolean;
}) {
  const t = useT();
  // Bloqueado (tempo de casa ou plano): capa em P&B, cadeado com o motivo e
  // sem link. Antes o poster bloqueado continuava clicável e a página devolvia
  // o aluno para o catálogo sem explicação — porta que abre e empurra de volta.
  const locked = course.locked === true;
  const lockLabel = lockLabelFor(course, t);
  const inner = (
    <MediaSurface accent={course.accent} thumb={course.thumb} scrim className="h-full w-full">
      {/* véu de leitura da descrição no hover — a descrição aparece no meio da
          capa, onde o scrim é fraco; sem texto para mostrar, não escurece. */}
      {course.thumb && course.strap ? (
        <div className="pointer-events-none absolute inset-0 bg-black/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      ) : null}

      {/* centered identity — Outsider centers the course logo; here the name.
          Over a photo it anchors to the scrim (bottom) in fixed white. */}
      <div
        className={`flex max-w-[240px] flex-col items-center text-center ${
          course.thumb ? "absolute bottom-14 left-0 right-0 mx-auto" : "relative"
        }`}
      >
        {/* Descrição só no HOVER (dono, 2026-07-25) e FORA do fluxo (QA
            86ajrcjpe): ancorada ACIMA do bloco, não reserva espaço — descrição
            longa não empurra o título, e o eixo do nome fica idêntico em todos
            os cards da vitrine. */}
        {course.strap ? (
          <span
            data-testid="course-card-strap"
            className={`pointer-events-none absolute bottom-full left-1/2 mb-3 w-[240px] -translate-x-1/2 text-[12.5px] leading-relaxed opacity-0 transition-opacity duration-200 line-clamp-6 group-hover:opacity-100 ${
              course.thumb ? "text-white/85" : "text-st-ink-2"
            }`}
          >
            {course.strap}
          </span>
        ) : null}
        <GraduationCap
          className="mb-4 size-7"
          style={{
            color: course.thumb ? "#ffffff" : course.accent,
            opacity: 0.9,
          }}
        />
        <span
          data-testid="course-card-title"
          className={`text-[22px] font-[650] leading-tight tracking-[-0.01em] ${
            course.thumb ? "text-white" : "text-st-ivory"
          }`}
        >
          {course.name}
        </span>
      </div>

      {/* kind pill — Outsider's tag position (top-right) */}
      <div className="absolute right-4 top-4">
        <Pill>{courseKindLabel(course, t)}</Pill>
      </div>

      {/* bottom meta — real taxonomy counts (No-Invention) */}
      {course.kind !== "module" && !course.comingSoon ? (
        <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-2">
          <Pill>
            {course.kind === "course"
              ? t.capacitacoes.modulesCount(course.functionsCount)
              : t.capacitacoes.functionsCount(course.functionsCount)}
          </Pill>
          <Pill>
            {course.kind === "course"
              ? t.capacitacoes.lessonsCount(course.jobsCount)
              : t.capacitacoes.jobsCount(course.jobsCount)}
          </Pill>
        </div>
      ) : null}
    </MediaSurface>
  );

  const media = locked ? (
    <>
      <div className="h-full w-full grayscale">{inner}</div>
      <LockOverlay label={lockLabel} />
    </>
  ) : (
    inner
  );

  const shell = `group relative block h-[425px] ${
    fluid ? "w-full" : "w-[322px]"
  } shrink-0 overflow-hidden rounded-[14px] border border-st-line-2 bg-st-card transition-colors`;

  if (locked || disabled) {
    return (
      <div
        aria-disabled
        data-testid="course-card"
        title={lockLabel}
        className={`${shell} cursor-default`}
      >
        {media}
      </div>
    );
  }

  return (
    <Link
      href={`/trainings/${resolveCourseId(course.id)}`}
      data-testid="course-card"
      className={`${shell} cursor-pointer hover:border-white/20 hover:bg-st-card-2`}
    >
      {media}
    </Link>
  );
}
