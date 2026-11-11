"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderArchive,
  Image as ImageIcon,
  Play,
  Share2,
  Star,
  ThumbsUp,
  X,
} from "lucide-react";

import { useT } from "@/lib/i18n";
import { ToastProvider, useToast } from "@/components/ui";
import { rateLesson, toggleLike, toggleProgress } from "@/app/(aluno)/trainings/actions";
import { CapTopBar, ProgressBar } from "./course-detail";
import type { LessonRef } from "./content";

/** Ícone do material por tipo (lesson_resources.resource_type). */
const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  pdf: <FileText className="size-4" />,
  image: <ImageIcon className="size-4" />,
  zip: <FolderArchive className="size-4" />,
  external_link: <ExternalLink className="size-4" />,
};

/**
 * Feature flag — Espaço de Networking (comentários da aula).
 * Mesmo padrão de ARKOM_DEMO_PLAN_ENABLED (src/lib/plan.tsx): flag client-side
 * (NEXT_PUBLIC_*) inlined no build. Desligada por padrão; quando `false` o bloco
 * de comentários não é renderizado. Ligar exige rebuild/redeploy.
 */
const ARKOM_COMMENTS_ENABLED =
  process.env.NEXT_PUBLIC_ARKOM_ENABLE_COMMENTS === "true";

/** Normalização copiada do player do bilhon-ai (YouTube → /embed/). */
function youtubeEmbedUrl(url: string): string {
  if (!url) return url;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{6,})/,
    /(?:youtu\.be\/)([\w-]{6,})/,
    /(?:youtube\.com\/shorts\/)([\w-]{6,})/,
    /(?:youtube\.com\/embed\/)([\w-]{6,})/,
  ];
  for (const re of patterns) {
    const match = url.match(re);
    if (match) return `https://www.youtube.com/embed/${match[1]}`;
  }
  return url;
}

/** Panda delivery (b-vz-*) → URL do player embed 16:9. */
function embedSrc(url: string): string {
  const panda = url.match(
    /^https?:\/\/b-vz-([\w-]+)\.tv\.pandavideo\.com\.br\/([0-9a-fA-F-]{36})/
  );
  if (panda) {
    return `https://player-vz-${panda[1]}.tv.pandavideo.com.br/embed/?v=${panda[2]}`;
  }
  return youtubeEmbedUrl(url);
}

interface LocalComment {
  id: number;
  author: string;
  mine: boolean;
  text: string;
  likes: number;
  liked: boolean;
}

function LessonPlayer({
  refData,
  playDemo,
}: {
  refData: LessonRef;
  playDemo: string;
}) {
  const { course, lesson } = refData;

  if (lesson.videoUrl) {
    return (
      <div
        className="relative aspect-video w-full overflow-hidden rounded-[14px] border border-st-line-2 bg-black"
        style={{ boxShadow: "var(--st-elev-bevel), var(--st-elev-rest)" }}
      >
        <iframe
          src={embedSrc(lesson.videoUrl)}
          title={lesson.title}
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div
      className="group relative aspect-video w-full cursor-pointer overflow-hidden rounded-[14px] border border-st-line-2 bg-st-card"
      style={{ boxShadow: "var(--st-elev-bevel), var(--st-elev-rest)" }}
      title={playDemo}
    >
      {lesson.thumb ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={lesson.thumb}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${course.accent}26 0%, transparent 62%)`,
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="flex size-16 items-center justify-center rounded-full border border-st-line bg-st-card-2 backdrop-blur-md transition-transform group-hover:scale-105"
          style={{ boxShadow: "var(--st-elev-bevel), var(--st-elev-lift)" }}
        >
          <Play className="ml-1 size-6 text-white" fill="currentColor" />
        </span>
      </div>
      <span className="absolute bottom-3 left-4 rounded-full border border-white/15 bg-black/50 px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-white/80 backdrop-blur-md">
        {playDemo}
      </span>
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/15">
        <div
          className="h-1"
          style={{ width: `${lesson.progress}%`, background: course.accent }}
        />
      </div>
    </div>
  );
}

function CircleButton({
  label,
  accent,
  active = false,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  accent: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-full border transition-colors ${
        disabled
          ? "cursor-default border-st-line bg-st-card text-st-ink-3 opacity-40"
          : active
            ? "border-st-line-2 bg-st-card-2 text-st-ivory"
            : "border-st-line bg-st-card text-st-ink-2 hover:bg-st-card-2 hover:text-st-ivory"
      }`}
      style={active ? { color: accent } : undefined}
    >
      {children}
    </button>
  );
}

/** Casca com ToastProvider: o feedback de erro (ex.: prazo vencido ao tentar
 *  concluir) precisa de um canal visível — antes o revert era silencioso. */
export function LessonView({ refData }: { refData: LessonRef }) {
  return (
    <ToastProvider>
      <LessonViewInner refData={refData} />
    </ToastProvider>
  );
}

function LessonViewInner({ refData }: { refData: LessonRef }) {
  const t = useT();
  const { toast } = useToast();
  const { course, module, lesson, index } = refData;

  /* ── interactive state ───────────────────────────────────────────────── */
  const [tab, setTab] = useState<"notes" | "lessons" | "materials">("lessons");
  // id REAL da aula no banco (do loader) — necessário p/ as server actions.
  const dbLessonId = lesson.dbLessonId;
  // Estado REAL do aluno: a semente vem do banco (loader), a UI é otimista.
  const [completed, setCompleted] = useState(lesson.completed);
  const [liked, setLiked] = useState(lesson.liked ?? false);
  const [rating, setRating] = useState(lesson.rating ?? 0);
  const [, startSave] = useTransition();
  const materials = lesson.materials ?? [];
  // A barra reflete a conclusão (não há watch-% no schema).
  const displayProgress = completed ? 100 : lesson.progress;
  // "Salvar/Compartilhar" seguem locais (sem coluna de schema — afordância honesta).
  const [savedFlag, setSavedFlag] = useState(false);
  const [comments, setComments] = useState<LocalComment[]>([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [savedNotes, setSavedNotes] = useState<string[]>([]);
  // expandable next-track shortcuts in the AULAS tab (source accordion)
  const [openTracks, setOpenTracks] = useState<Set<string>>(new Set());

  const notesKey = `arkom-notes-${lesson.id}`;
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(notesKey);
        if (!raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
          setSavedNotes(parsed);
        }
      } catch {}
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [notesKey]);

  const persistNotes = (next: string[]) => {
    setSavedNotes(next);
    try {
      localStorage.setItem(notesKey, JSON.stringify(next));
    } catch {}
  };

  /* Learning loop — persistência real (server actions) com UI otimista + revert. */
  const onToggleComplete = () => {
    if (!dbLessonId) return;
    const next = !completed;
    setCompleted(next); // otimista
    startSave(async () => {
      const res = await toggleProgress(dbLessonId);
      if (res.ok) setCompleted(res.completed);
      else {
        setCompleted(!next); // revert
        // O motivo do bloqueio (ex.: "acesso vencido — renove") chega na tela;
        // o revert silencioso deixava o aluno sem entender o clique.
        toast({
          title: "Não foi possível concluir a aula",
          description: res.error,
          variant: "error",
        });
      }
    });
  };
  const onLike = () => {
    if (!dbLessonId) return;
    const next = !liked;
    setLiked(next); // otimista
    startSave(async () => {
      const res = await toggleLike(dbLessonId);
      if (res.ok) setLiked(res.liked);
      else setLiked(!next); // revert
    });
  };
  const onRate = (stars: number) => {
    if (!dbLessonId) return;
    const prev = rating;
    setRating(stars); // otimista
    startSave(async () => {
      const res = await rateLesson(dbLessonId, stars);
      if (res.ok) setRating(res.rating);
      else setRating(prev); // revert
    });
  };

  const publishComment = () => {
    const text = draft.trim();
    if (!text) return;
    setComments((cs) => [
      { id: Date.now(), author: t.capacitacoes.memberYou, mine: true, text, likes: 0, liked: false },
      ...cs,
    ]);
    setDraft("");
  };

  /* prev/next inside the module — source IconButtonGroup chevrons */
  const flat = module.lessons;
  const pos = flat.findIndex((l) => l.id === lesson.id);
  const prev = pos > 0 ? flat[pos - 1] : null;
  const next = pos < flat.length - 1 ? flat[pos + 1] : null;

  return (
    <div className="w-full">
      {/* ── Top bar — the standardized CapTopBar primitive ──────────────── */}
      <CapTopBar
        crumbs={[
          { href: "/trainings", label: t.capacitacoes.courses },
          { href: `/trainings/${course.id}`, label: course.name },
          { href: `/trainings/${course.id}`, label: t.capacitacoes.moduleN(module.position) },
          { href: "#", label: lesson.title },
        ]}
        closeHref={`/trainings/${course.id}`}
        closeLabel={t.capacitacoes.backToCourse}
        right={
          <>
            <ProgressBar pct={displayProgress} accent={course.accent} width={160} />
            <span className="text-[13px] text-st-ink-2">{displayProgress}%</span>
          </>
        }
      />

      {/* ── Body — player column + sticky sidebar ────────────────────────── */}
      <div className="mb-16 flex gap-6 max-lg:flex-col">
        <div className="min-w-0 flex-[2.2]">
          <LessonPlayer refData={refData} playDemo={t.capacitacoes.playDemo} />

          {/* Title row + IconButtonGroup — source: h2 + pill + like/dislike + prev/next */}
          <div className="mt-7">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="min-w-0 flex-1 truncate text-[24px] font-bold tracking-[-0.01em] text-st-ivory">
                {lesson.title}
              </h1>
              <span className="rounded-full border border-st-line bg-st-card-2 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-st-ink-2">
                {course.name}
              </span>
              <span className="flex items-center gap-2">
                {/* Concluir aula — persiste em lesson_progress (toggle) */}
                <button
                  type="button"
                  onClick={onToggleComplete}
                  aria-pressed={completed}
                  disabled={!dbLessonId}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors disabled:cursor-default ${
                    completed
                      ? "border-st-line-2 bg-st-card-2 text-st-ivory"
                      : "border-st-line bg-st-card text-st-ink-2 hover:bg-st-card-2 hover:text-st-ivory"
                  }`}
                  style={completed ? { color: course.accent } : undefined}
                >
                  <Check className="size-4" />
                  {completed ? t.capacitacoes.markedComplete : t.capacitacoes.markComplete}
                </button>
                {/* Curtir — persiste em lesson_likes (toggle) */}
                <CircleButton
                  label={t.capacitacoes.like}
                  accent={course.accent}
                  active={liked}
                  onClick={onLike}
                  disabled={!dbLessonId}
                >
                  <ThumbsUp className="size-4" />
                </CircleButton>
                <CircleButton
                  label={t.capacitacoes.save}
                  accent={course.accent}
                  active={savedFlag}
                  onClick={() => setSavedFlag((v) => !v)}
                >
                  <Bookmark className="size-4" />
                </CircleButton>
                <CircleButton label={t.capacitacoes.share} accent={course.accent}>
                  <Share2 className="size-4" />
                </CircleButton>
                <span className="mx-1 h-5 w-px bg-st-line" />
                {/* prev/next lesson — source chevrons */}
                {prev ? (
                  <Link href={`/trainings/lesson/${prev.id}`} title={t.capacitacoes.prevLesson}>
                    <CircleButton label={t.capacitacoes.prevLesson} accent={course.accent}>
                      <ChevronLeft className="size-4" />
                    </CircleButton>
                  </Link>
                ) : (
                  <CircleButton label={t.capacitacoes.prevLesson} accent={course.accent} disabled>
                    <ChevronLeft className="size-4" />
                  </CircleButton>
                )}
                {next ? (
                  <Link href={`/trainings/lesson/${next.id}`} title={t.capacitacoes.nextLesson}>
                    <CircleButton label={t.capacitacoes.nextLesson} accent={course.accent}>
                      <ChevronRight className="size-4" />
                    </CircleButton>
                  </Link>
                ) : (
                  <CircleButton label={t.capacitacoes.nextLesson} accent={course.accent} disabled>
                    <ChevronRight className="size-4" />
                  </CircleButton>
                )}
              </span>
            </div>

            {/* meta + REAL description */}
            <p className="mt-3 max-w-[760px] text-[13px] leading-relaxed text-st-ink-3">
              {t.capacitacoes.lesson(index)} · {t.capacitacoes.moduleN(module.position)}{" "}
              — {module.name} · {t.capacitacoes.minutesShort(lesson.minutes)}
            </p>
            <p className="mt-4 max-w-[760px] text-[14.5px] leading-relaxed text-st-ink-2">
              {lesson.desc}
            </p>

            {/* Avaliação 1–5 — persiste em lesson_ratings (upsert, sempre alterável) */}
            <div className="mt-5 flex items-center gap-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-st-ink-3">
                {t.capacitacoes.rateLabel}
              </span>
              <span className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = n <= rating;
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-label={String(n)}
                      aria-pressed={on}
                      disabled={!dbLessonId}
                      onClick={() => onRate(n)}
                      className="text-st-ink-3 transition-colors hover:text-st-ivory disabled:cursor-default"
                      style={on ? { color: course.accent } : undefined}
                    >
                      <Star className="size-5" fill={on ? "currentColor" : "none"} />
                    </button>
                  );
                })}
              </span>
            </div>

            {/* centered gradient divider — source hairline */}
            <div
              className="mx-auto my-9 h-px w-2/3"
              style={{
                background:
                  "linear-gradient(90deg, transparent, var(--st-line-2), transparent)",
              }}
            />

            {/* ── Espaço de Networking — source comments block ─────────────────
                Atrás da feature flag NEXT_PUBLIC_ARKOM_ENABLE_COMMENTS (desligada
                por padrão): quando off, NADA deste bloco renderiza (contador,
                input, botão publicar, lista com likes e o empty-state). O estado
                e os handlers permanecem para que a flag reative tudo. ────────── */}
            {ARKOM_COMMENTS_ENABLED ? (
              <>
            <div className="mb-6 flex items-center gap-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-st-ivory">
                {t.capacitacoes.networking}
              </span>
              <span className="text-st-ink-3">|</span>
              <span className="text-[12px] text-st-ink-3">
                {t.capacitacoes.commentsCount(comments.length)}
              </span>
            </div>

            {/* NewComment — avatar + input + publish */}
            <div className="cap-elev-sm flex items-start gap-3 rounded-[14px] border border-st-line-2 bg-st-card p-4">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-black/80"
                style={{ background: course.accent }}
              >
                CO
              </span>
              <div className="min-w-0 flex-1">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) publishComment();
                  }}
                  placeholder={t.capacitacoes.writeComment}
                  rows={2}
                  className="w-full resize-none rounded-[10px] border border-st-line bg-st-card-2 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-st-ivory outline-none transition-colors placeholder:text-st-ink-3 focus:border-st-line-2"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={publishComment}
                    disabled={!draft.trim()}
                    className={`cap-btn-p rounded-[10px] bg-st-ivory px-4 py-2 text-[12.5px] font-bold text-st-bg transition-opacity ${
                      draft.trim() ? "" : "pointer-events-none opacity-40"
                    }`}
                  >
                    {t.capacitacoes.publish}
                  </button>
                </div>
              </div>
            </div>

            {/* Comment list — local session state */}
            {comments.length === 0 ? (
              <p className="mt-6 text-[13px] leading-relaxed text-st-ink-3">
                {t.capacitacoes.beFirst}
              </p>
            ) : (
              <div className="mt-6 flex flex-col gap-5">
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-3">
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        c.mine ? "text-black/80" : "bg-st-card-2 text-st-ink-2"
                      }`}
                      style={c.mine ? { background: course.accent } : undefined}
                    >
                      {c.mine ? "CO" : "ST"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-[650] text-st-ivory">{c.author}</span>
                        <span className="text-[11px] text-st-ink-3">agora</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-st-ink-2">
                        {c.text}
                      </p>
                      <div className="mt-2 flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() =>
                            setComments((cs) =>
                              cs.map((x) =>
                                x.id === c.id
                                  ? { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) }
                                  : x
                              )
                            )
                          }
                          className={`flex items-center gap-1.5 text-[11.5px] font-medium transition-colors ${
                            c.liked ? "" : "text-st-ink-3 hover:text-st-ivory"
                          }`}
                          style={c.liked ? { color: course.accent } : undefined}
                        >
                          <ThumbsUp className="size-3.5" /> {c.likes > 0 ? c.likes : ""}
                        </button>
                        <span className="cursor-pointer text-[11.5px] font-medium text-st-ink-3 transition-colors hover:text-st-ivory">
                          {t.capacitacoes.reply}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
              </>
            ) : null}
          </div>
        </div>

        {/* ── Sidebar — SOURCE tab order: Anotações | Aulas | Materiais ────── */}
        <aside className="cap-scroll w-full flex-1 lg:sticky lg:top-[88px] lg:h-fit lg:max-h-[720px] lg:max-w-[380px]">
          <div className="cap-elev-sm rounded-[14px] border border-st-line-2 bg-st-card p-4">
            <div className="mb-4 flex items-center gap-6 border-b border-st-line px-2">
              {(
                [
                  ["notes", t.capacitacoes.annotationsTab],
                  ["lessons", t.capacitacoes.lessonsTab],
                  ["materials", t.capacitacoes.materialsTab],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`-mb-px border-b pb-3 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
                    tab === key
                      ? "border-st-ivory text-st-ivory"
                      : "border-transparent text-st-ink-3 hover:text-st-ink-2"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ANOTAÇÕES — functional editor, persists per lesson */}
            {tab === "notes" ? (
              <div className="px-1">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t.capacitacoes.notesPlaceholder}
                  rows={7}
                  className="w-full resize-none rounded-[10px] border border-st-line bg-st-card-2 px-3.5 py-3 text-[13px] leading-relaxed text-st-ivory outline-none transition-colors placeholder:text-st-ink-3 focus:border-st-line-2"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={!note.trim()}
                    onClick={() => {
                      if (!note.trim()) return;
                      persistNotes([note.trim(), ...savedNotes]);
                      setNote("");
                    }}
                    className={`cap-btn-p rounded-[10px] bg-st-ivory px-4 py-2 text-[12px] font-bold text-st-bg ${
                      note.trim() ? "" : "pointer-events-none opacity-40"
                    }`}
                  >
                    {t.capacitacoes.saveNote}
                  </button>
                </div>
                {savedNotes.length > 0 ? (
                  <>
                    <p className="mb-2 mt-4 text-[10.5px] font-bold uppercase tracking-[0.08em] text-st-ink-3">
                      {t.capacitacoes.notesSaved}
                    </p>
                    <div className="flex flex-col gap-2">
                      {savedNotes.map((n, i) => (
                        <div
                          key={i}
                          className="group/note flex items-start justify-between gap-2 rounded-[10px] border border-st-line bg-st-card-2 px-3 py-2.5"
                        >
                          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-st-ink-2">
                            {n}
                          </p>
                          <button
                            type="button"
                            aria-label={t.common.dismiss}
                            onClick={() => persistNotes(savedNotes.filter((_, j) => j !== i))}
                            className="mt-0.5 shrink-0 text-st-ink-3 opacity-0 transition-opacity hover:text-st-ivory group-hover/note:opacity-100"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {/* AULAS — module lesson list (active lit in accent) */}
            {tab === "lessons" ? (
              <>
                <p className="mb-4 px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-st-ink-3">
                  {t.capacitacoes.upNext} · {t.capacitacoes.moduleN(module.position)} —{" "}
                  {module.name}
                </p>
                <div className="flex flex-col gap-1">
                  {module.lessons.map((l) => {
                    const active = l.id === lesson.id;
                    return (
                      <Link
                        key={l.id}
                        href={`/trainings/lesson/${l.id}`}
                        className={`group flex items-center gap-3 rounded-[10px] p-2 transition-colors ${
                          active ? "bg-st-card-2" : "hover:bg-st-card-2"
                        }`}
                      >
                        <span className="relative h-[72px] w-[128px] shrink-0 overflow-hidden rounded-[8px] border border-st-line-2 bg-st-card">
                          {l.thumb ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={l.thumb}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          ) : (
                            <span
                              className="absolute inset-0"
                              style={{
                                backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${course.accent}26 0%, transparent 62%)`,
                              }}
                            />
                          )}
                          {l.completed ? (
                            <span
                              className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full"
                              style={{ background: course.accent }}
                            >
                              <Check className="size-2.5 text-black/80" />
                            </span>
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className="block truncate text-[13.5px] font-medium transition-colors"
                            style={{ color: active ? course.accent : "var(--st-ivory)" }}
                          >
                            {l.title}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] text-st-ink-3">
                            {t.capacitacoes.minutesShort(l.minutes)}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>

                {/* Next-track shortcuts — the source's season accordion:
                    expand a track inline and jump straight to its lessons */}
                {course.modules.filter((m) => m.id !== module.id).length > 0 ? (
                  <div className="mt-4 border-t border-st-line pt-3">
                    {course.modules
                      .filter((m) => m.id !== module.id)
                      .map((m) => {
                        const open = openTracks.has(m.id);
                        return (
                          <div key={m.id} className="mb-1">
                            <button
                              type="button"
                              aria-expanded={open}
                              onClick={() =>
                                setOpenTracks((prev) => {
                                  const nx = new Set(prev);
                                  if (nx.has(m.id)) nx.delete(m.id);
                                  else nx.add(m.id);
                                  return nx;
                                })
                              }
                              className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2.5 text-left transition-colors hover:bg-st-card-2"
                            >
                              <ChevronDown
                                className={`size-4 shrink-0 text-st-ink-3 transition-transform ${
                                  open ? "" : "-rotate-90"
                                }`}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12.5px] font-[650] text-st-ivory">
                                  {t.capacitacoes.moduleN(m.position)} — {m.name}
                                </span>
                                <span className="block text-[11px] text-st-ink-3">
                                  {t.capacitacoes.lessonsCount(m.lessons.length)}
                                </span>
                              </span>
                            </button>
                            {open ? (
                              <div className="ml-3 flex flex-col gap-0.5 border-l border-st-line pl-3">
                                {m.lessons.map((l) => (
                                  <Link
                                    key={l.id}
                                    href={`/trainings/lesson/${l.id}`}
                                    className="group flex items-center justify-between gap-2 rounded-[8px] px-2 py-2 transition-colors hover:bg-st-card-2"
                                  >
                                    <span className="flex min-w-0 items-center gap-2">
                                      {l.completed ? (
                                        <Check
                                          className="size-3.5 shrink-0"
                                          style={{ color: course.accent }}
                                        />
                                      ) : (
                                        <Play className="size-3.5 shrink-0 text-st-ink-3" />
                                      )}
                                      <span className="truncate text-[12.5px] text-st-ink-2 transition-colors group-hover:text-st-ivory">
                                        {l.title}
                                      </span>
                                    </span>
                                    <span className="shrink-0 text-[10.5px] text-st-ink-3">
                                      {t.capacitacoes.minutesShort(l.minutes)}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                ) : null}
              </>
            ) : null}

            {/* MATERIAIS — lesson_resources REAIS (PA-02): abrem em nova aba */}
            {tab === "materials" ? (
              <div className="px-1">
                <div className="mb-3 flex items-center gap-3 px-1">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-st-ink-3">
                    {t.capacitacoes.lessonFiles}
                  </span>
                  <span className="text-st-ink-3">|</span>
                  <span className="text-[11.5px] text-st-ink-3">
                    {t.capacitacoes.filesCount(materials.length)}
                  </span>
                </div>
                {materials.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[12.5px] text-st-ink-3">—</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {materials.map((mat) => (
                      <a
                        key={mat.id}
                        href={mat.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group/file flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-3 transition-colors hover:bg-st-card-2"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-st-line bg-st-card-2 text-st-ink-2">
                          {RESOURCE_ICONS[mat.resourceType] ?? RESOURCE_ICONS.external_link}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] text-st-ivory">
                            {mat.title}
                          </span>
                          <span className="block text-[10.5px] uppercase tracking-[0.06em] text-st-ink-3">
                            {t.capacitacoes.openMaterial}
                          </span>
                        </span>
                        <ExternalLink className="size-4 shrink-0 text-st-ink-3 opacity-0 transition-opacity group-hover/file:opacity-100" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
