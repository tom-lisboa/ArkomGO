"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";

import { useLocale } from "@/lib/i18n";
import { loc, JOB_DESC_PT, LEVEL_LABEL_PT, MAP_DRAWER_PT, skillName, pbText, functionName, deptName, jobName } from "@/lib/content-pt";
import type { Pt } from "./geometry";
import { DEPARTMENTS, LEVEL_LABEL, SOLUTION_NAME, SOLUTION_PREVIEW, relatedSolution, solutionHref, type Level, type Job } from "./skilltree-data";
import { useSolutionPreviews } from "./use-solution-previews";
import { PLAYBOOK } from "./playbook-data";

export interface DrawerTarget {
  job: Job;
  deptId: string;
  deptName: string;
  deptColor: string;
  fnName: string;
  /** the foundation job of its department (source FOUNDATION → START HERE badge). */
  startHere: boolean;
  /** world position of the job node — anchors the skill satellites. */
  pos: Pt;
}

interface JobDrawerProps {
  target: DrawerTarget;
  onClose: () => void;
  /** open a prerequisite job by name (BUILDS ON pills). */
  onNavigate?: (jobName: string) => void;
}

const LADDER: { key: Level; label: string; body: string }[] = [
  {
    key: "manual",
    label: "Human-led",
    body: "A person does the work end to end; the agent only assembles context and reference material.",
  },
  {
    key: "assisted",
    label: "Human-assisted",
    body: "The agent drafts and proposes; a person reviews, edits and approves before anything ships.",
  },
  {
    key: "autonomous",
    label: "Fully autonomous",
    body: "The agent runs the loop on its own inside your tools; a person spot-checks and handles exceptions.",
  },
];

/** ≥1024px — gates the two-column expanded popover (below it, the drawer keeps its
 *  current single-column layout with the video inside the scroll). */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return isDesktop;
}

function Chips({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3.5">
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--map-ink-3)]">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span
            key={it}
            className="rounded-[3px] border border-[rgba(233,228,214,.25)] px-2 py-[3px] text-[11px] text-[var(--map-ivory-2)]"
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

export function JobDrawer({ target, onClose, onNavigate }: JobDrawerProps) {
  const { job, deptName: deptNameEn, deptColor, fnName, startHere } = target;
  const { locale } = useLocale();
  const tr = (s: string) => loc(locale, s, MAP_DRAWER_PT[s]);
  // M7 — the per-job playbook (bespoke ladder / replaces / notes / human / real files).
  const pb = PLAYBOOK[job.name];
  // branch tip of a deployable solution — the sibling item nodes ARE its composition.
  const solutionItems = job.solution
    ? (DEPARTMENTS.find((d) => d.id === target.deptId)
        ?.functions.find((f) => f.name === fnName)
        ?.jobs.filter((j) => j.name !== job.name) ?? [])
    : [];
  // every non-tip node ties back to one of the six official solutions (founder directive).
  const related = job.solution ? undefined : relatedSolution(deptNameEn, fnName);
  // previews/remix REATIVOS AO BANCO (admin edita → mapa reflete); seed é fallback.
  const previews = useSolutionPreviews();
  const dbRow = job.solution ? previews[job.solution] : undefined;
  // banco tem prioridade (mesmo null = "admin removeu o vídeo"); sem row → seed.
  const previewUrl = job.solution
    ? (dbRow ? dbRow.preview_url : SOLUTION_PREVIEW[job.solution] ?? null)
    : null;
  const remixHref = job.solution
    ? (dbRow?.remix_url ?? job.link ?? solutionHref(job.solution))
    : "";

  // EXPANDED popover — só num nó-ponta COM vídeo do banco e em viewport desktop.
  // Qualquer outro caso mantém o drawer estreito atual, pixel a pixel.
  const isDesktop = useIsDesktop();
  const expanded = Boolean(job.solution && previewUrl && isDesktop);

  // vídeo 16:9 (embed Panda) — reutilizado no drawer estreito e na coluna direita.
  const videoEmbed = previewUrl ? (
    <div
      className="relative w-full overflow-hidden rounded-[7px] border border-[var(--map-line)]"
      style={{ paddingBottom: "56.25%" }}
    >
      <iframe
        src={previewUrl}
        title={`${jobName(locale, job.name)} — ${tr("Lesson preview")}`}
        loading="lazy"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        data-testid="drawer-preview-video"
        className="absolute inset-0 h-full w-full"
        style={{ border: "none" }}
      />
    </div>
  ) : null;

  // botão de REMIX — reutilizado (inline no estreito, abaixo do vídeo no expandido).
  const remixButton = job.solution ? (
    <a
      href={remixHref}
      {...(remixHref.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
      data-testid="drawer-remix"
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--map-copper)] px-3.5 py-[7px] text-[12px] font-bold text-[var(--map-copper)] transition-colors hover:bg-[var(--map-copper)] hover:text-[#141414]"
    >
      {tr("Remix this solution")} <ArrowUpRight size={13} />
    </a>
  ) : null;

  // conteúdo da coluna ESQUERDA (badge → status). No modo estreito é o próprio
  // corpo do <aside>; no expandido vira a coluna scrollável.
  const inner = (
    <>
      {/* c-state — pure muted text, no pill/coral (Fidv2 N7-F2 · R0 Q4 #5C5C63
          light / --map-ink-2 muted dark) */}
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--map-ink-2)]">
        {loc(locale, LEVEL_LABEL[job.level], LEVEL_LABEL_PT[LEVEL_LABEL[job.level]])}
      </span>

      {/* c-name (+ START HERE badge) */}
      <h2 className="mb-1 mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[26px] tracking-[0.04em] text-[var(--map-ivory)]">
        {jobName(locale, job.name)}
        {startHere ? (
          <span
            className="rounded-[3px] px-1.5 py-[2px] align-middle text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--map-copper)]"
            style={{ border: "1px solid color-mix(in srgb, var(--map-copper) 45%, transparent)" }}
          >
            {tr("START HERE")}
          </span>
        ) : null}
      </h2>

      {/* c-crumb — dept + function both localize under the generalista overlay (Fidv3 P2). */}
      <div className="mb-3 text-[11px] tracking-[0.06em] text-[var(--map-ink-2)]">
        {deptName(locale, deptNameEn)} · {functionName(locale, fnName)}
      </div>

      {/* c-desc — near-full ink/ivory @ .82, legible in both themes (Fidv2
          N7-F3 · R0 Q4 rgba(32,35,43,.82) light). */}
      <p className="mb-4 text-[13px] leading-[1.65] text-[color-mix(in_srgb,var(--map-ivory)_82%,transparent)]">
        {loc(locale, job.desc, JOB_DESC_PT[job.name])}
      </p>

      {/* SOLUTION TIP — "comece aqui": preview da aula (Panda, da própria aula da
          solução no VdI · só quem tem no banco) + o que compõe a solução + botão
          de REMIX (remix provisionado /api/remix/go, ou /genesis, ou o repo). */}
      {job.solution ? (
        <div
          className="mb-4 rounded-[9px] border border-[var(--map-line)] bg-[color-mix(in_srgb,var(--map-ivory)_3%,transparent)] px-[13px] py-[11px]"
        >
          {/* PREVIEW DA AULA (inline) — no modo estreito. No expandido o vídeo vai
              pra coluna direita fixa (ver abaixo). */}
          {!expanded && previewUrl ? (
            <div className="mb-3">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--map-ink-3)]">
                {tr("Lesson preview")}
              </div>
              {videoEmbed}
            </div>
          ) : null}

          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--map-ink-3)]">
            {tr("Inside this solution")}
          </div>
          {solutionItems.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onNavigate?.(it.name)}
              disabled={!onNavigate}
              className="mb-1.5 block w-full text-left text-[12px] leading-[1.5] text-[var(--map-ivory-2)] transition-colors hover:text-[var(--map-ivory)] disabled:cursor-default"
            >
              <b className="font-bold text-[var(--map-ivory)]">{jobName(locale, it.name)}</b>
              {" · "}
              {loc(locale, it.desc, JOB_DESC_PT[it.name])}
            </button>
          ))}

          {/* BOTÃO DE REMIX (inline) — no modo estreito. No expandido vai abaixo
              do vídeo, na coluna direita. */}
          {!expanded ? <div className="mt-2.5">{remixButton}</div> : null}
        </div>
      ) : null}

      {/* RELATED SOLUTION — every non-tip node ties back to one of the six. */}
      {related ? (
        <div className="mb-4 text-[11px] tracking-[0.04em] text-[var(--map-ink-2)]">
          {tr("Related solution")}:{" "}
          {(() => {
            const rHref = previews[related]?.remix_url ?? solutionHref(related);
            return (
              <a
                href={rHref}
                {...(rHref.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                className="inline-flex items-center gap-1 font-bold text-[var(--map-copper)] transition-colors hover:text-[var(--map-ivory)]"
              >
                {SOLUTION_NAME[related] ?? related} <ArrowUpRight size={11} />
              </a>
            );
          })()}
        </div>
      ) : null}

      {/* BREAKS INTO (skills) · WIRED INTO (tools) */}
      <Chips label={tr("Breaks into")} items={job.skills.map((s) => skillName(locale, s))} />
      {job.tools.length ? (
        <div className="mb-3.5">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--map-ink-3)]">
            {tr("Wired into")}
          </div>
          <div className="text-[12px] text-[var(--map-ink-2)]">{job.tools.join(" · ")}</div>
        </div>
      ) : null}

      {/* BUILDS ON (M7) — prerequisite jobs as dashed, navigable pills. */}
      {pb && pb.req.length ? (
        <div className="mb-3.5">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--map-ink-3)]">
            {tr("Builds on")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pb.req.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onNavigate?.(r)}
                disabled={!onNavigate}
                className="rounded-[3px] border border-dashed border-[color-mix(in_srgb,var(--map-ink-2)_55%,transparent)] px-2 py-[3px] text-[11px] text-[var(--map-ivory-2)] transition-colors hover:border-[var(--map-ivory-2)] hover:text-[var(--map-ivory)] disabled:cursor-default"
              >
                {jobName(locale, r)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* WHAT IT REPLACES (M7) — the cost-by-hand box. */}
      {pb && pb.replaces ? (
        <>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--map-ink-3)]">
            {tr("What it replaces")}
          </div>
          <div
            className="mb-4 rounded-[8px] border border-[var(--map-line)] bg-[color-mix(in_srgb,var(--map-ivory)_3%,transparent)] px-3 py-2.5 text-[12.5px] leading-[1.6] text-[var(--map-ivory-2)]"
          >
            {pbText(locale, job.name, "replaces", pb.replaces)}
          </div>
        </>
      ) : null}

      {/* THE LADDER */}
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--map-ink-3)]">
        {tr("The ladder")}
      </div>
      <div className="mb-4" data-testid="drawer-ladder">
        {LADDER.map((row) => {
          const cur = row.key === job.level;
          // M7 — bespoke per-job rung copy; generic template only as a fallback.
          const field = (`ladder${row.key[0].toUpperCase()}${row.key.slice(1)}`) as
            | "ladderManual"
            | "ladderAssisted"
            | "ladderAutonomous";
          const enBody = pb?.ladder[row.key] ?? row.body;
          const body = pb?.ladder[row.key] ? pbText(locale, job.name, field, enBody) : tr(row.body);
          return (
            <div
              key={row.key}
              className="flex gap-2.5 border-t border-[var(--map-line)] py-[7px] text-[12px] leading-[1.55]"
            >
              <span
                className="w-[92px] shrink-0 pt-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em]"
                style={{ color: cur ? deptColor : "var(--map-ink-3)" }}
              >
                {tr(row.label)}
              </span>
              <span className={cur ? "text-[var(--map-ivory)]" : "text-[var(--map-ivory-2)]"}>
                {body}
              </span>
            </div>
          );
        })}
      </div>

      {/* THE HUMAN — bespoke per-job (M7), generic fallback when absent. */}
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--map-ink-3)]">
        {tr("The human")}
      </div>
      <p className="mb-4 text-[12.5px] leading-[1.65] text-[var(--map-ivory-2)]" data-testid="drawer-human">
        {pb?.human
          ? pbText(locale, job.name, "human", pb.human)
          : tr("A person still owns the judgment calls and the exceptions. Autonomy changes their job from doing this task to directing it — faster, not absent.")}
      </p>

      {/* BUILD NOTES (M7) — the operator's caveat/how-to for this job. */}
      {pb && pb.notes ? (
        <>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--map-ink-3)]">
            {tr("Build notes")}
          </div>
          <p className="mb-4 text-[12.5px] leading-[1.65] text-[var(--map-ivory-2)]">
            {pbText(locale, job.name, "notes", pb.notes)}
          </p>
        </>
      ) : null}

    </>
  );

  return (
    <>
      {expanded ? (
        /* EXPANDED — nó-ponta COM vídeo do banco, em desktop. Duas colunas: a
           esquerda (todo o conteúdo) scrolla; a direita (vídeo + remix) fica
           fixa e centralizada. Mesma âncora/fundo/borda/anim do drawer estreito. */
        <aside
          data-testid="job-drawer"
          className="drawer-in drawer-expanded absolute left-7 top-[104px] z-40 rounded-[10px]"
          style={{
            width: "min(78vw, 1180px)",
            maxHeight: "calc(100dvh - 130px)",
            background: "var(--map-drawer-bg)",
            backdropFilter: "blur(16px) saturate(1.2)",
            WebkitBackdropFilter: "blur(16px) saturate(1.2)",
            border: "1px solid var(--map-drawer-border)",
            boxShadow: "0 30px 80px -30px rgba(0,0,0,.7)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 grid size-[30px] place-items-center rounded-full text-[13px] text-[var(--map-ivory-2)] transition-colors hover:text-[var(--map-ivory)]"
            style={{ border: "1px solid var(--map-line)", background: "var(--map-drawer-bg)" }}
          >
            <X size={13} />
          </button>
          <div className="drawer-left map-scroll p-5" data-testid="drawer-left">{inner}</div>
          <div className="drawer-right" data-testid="drawer-right">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--map-ink-3)]">
              {tr("Lesson preview")}
            </div>
            {videoEmbed}
            <div className="mt-3">{remixButton}</div>
          </div>
        </aside>
      ) : (
        /* NARROW — o drawer atual, pixel a pixel (qualquer nó que não seja
           ponta-com-vídeo, ou viewport < 1024px). */
        <aside
          data-testid="job-drawer"
          className="drawer-in map-scroll absolute left-7 top-[104px] z-40 w-[calc(100%-56px)] max-w-[364px] rounded-[10px] p-5"
          style={{
            maxHeight: "calc(100dvh - 130px)",
            background: "var(--map-drawer-bg)",
            backdropFilter: "blur(16px) saturate(1.2)",
            WebkitBackdropFilter: "blur(16px) saturate(1.2)",
            border: "1px solid var(--map-drawer-border)",
            boxShadow: "0 30px 80px -30px rgba(0,0,0,.7)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="float-right grid size-[30px] place-items-center rounded-full text-[13px] text-[var(--map-ivory-2)] transition-colors hover:text-[var(--map-ivory)]"
            style={{ border: "1px solid var(--map-line)" }}
          >
            <X size={13} />
          </button>
          {inner}
        </aside>
      )}
    </>
  );
}
