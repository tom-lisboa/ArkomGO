"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useLocale } from "@/lib/i18n";
import { loc, DASH_PT } from "@/lib/content-pt";
import { CENTERS } from "./dash-data";
import { Coverflow, type CoverflowHandle } from "./Coverflow";
import { Dashboard } from "./Dashboard";
import { DashTopbar } from "./DashTopbar";
import { GuideModal } from "./GuideModal";

/* deterministic starfield (no Math.random at render → SSR-safe) */
const STARS = Array.from({ length: 46 }, (_, i) => {
  const a = (i * 2654435761) >>> 0;
  const b = (i * 40503 + 12345) >>> 0;
  const c = (i * 2246822519) >>> 0;
  return {
    left: (a % 1000) / 10,
    top: (b % 1000) / 10,
    size: 1 + (c % 20) / 10,
    delay: (a % 60) / 10,
  };
});

export function DashView({
  solutionsMode = false,
  centers = CENTERS,
}: {
  solutionsMode?: boolean;
  /** centers "efetivos" (server pode substituir pelo resultado dos builders —
   *  o preview do coverflow mostra os mesmos indicadores do painel entrado). */
  centers?: typeof CENTERS;
}) {
  const NC = centers.length;
  const { locale } = useLocale();
  const [entered, setEntered] = useState<number | null>(null);
  const [range, setRange] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const coverflow = useRef<CoverflowHandle | null>(null);

  const open = useCallback((index: number) => {
    setEntered(index);
    setRange(centers[index].defaultRange ?? centers[index].ranges?.[0] ?? "");
    setGuideOpen(false);
    const view = document.querySelector(".ddashview");
    if (view) view.scrollTop = 0;
  }, [centers]);

  const back = useCallback(() => {
    setEntered(null);
    setGuideOpen(false);
  }, []);

  const navBy = useCallback(
    (delta: number) => {
      setEntered((cur) => {
        if (cur === null) return cur;
        const nx = (cur + delta + NC) % NC;
        setRange(centers[nx].defaultRange ?? centers[nx].ranges?.[0] ?? "");
        setGuideOpen(false);
        const view = document.querySelector(".ddashview");
        if (view) view.scrollTop = 0;
        return nx;
      });
    },
    [centers, NC]
  );

  const onPick = useCallback(
    (index: number) => {
      if (entered !== null) open(index);
      else coverflow.current?.spinTo(index);
    },
    [entered, open]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (guideOpen) return; // modal owns its own Escape
      if (entered === null) return;
      if (e.key === "Escape") back();
      else if (e.key === "ArrowLeft") navBy(-1);
      else if (e.key === "ArrowRight") navBy(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entered, guideOpen, back, navBy]);

  const enteredCenter = entered !== null ? centers[entered] : null;
  const prevC = entered !== null ? centers[(entered - 1 + NC) % NC] : null;
  const nextC = entered !== null ? centers[(entered + 1) % NC] : null;

  return (
    <div className={`dashroot ${solutionsMode ? "dashroot-full" : ""} ${entered !== null ? "entered" : ""}`.trim()}>
      <div className="dstars" aria-hidden="true">
        {STARS.map((s, i) => (
          <span
            key={i}
            className="dstar"
            style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }}
          />
        ))}
      </div>

      <DashTopbar enteredName={enteredCenter ? loc(locale, enteredCenter.name, DASH_PT[enteredCenter.name]).toUpperCase() : null} onPick={onPick} solutionsMode={solutionsMode} centers={centers} />

      <Coverflow ref={coverflow} centers={centers} active={entered === null} onEnter={open} />

      {/* entered chrome */}
      <button type="button" className="dback" onClick={back}>
        {locale === "pt" ? "← TODOS OS PAINÉIS" : "← ALL DASHBOARDS"}
      </button>

      {prevC ? (
        <button type="button" className="edge-dash edge-dl" style={{ ["--pc" as string]: prevC.color } as React.CSSProperties} title={`Previous · ${prevC.name}`} onClick={() => navBy(-1)}>
          <svg viewBox="0 0 14 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M 11 3 L 4 11 L 11 19" />
            <circle cx="4" cy="11" r="1.8" fill="currentColor" stroke="none" />
          </svg>
          <span className="ed-dot" />
          <span className="et">{prevC.short}</span>
        </button>
      ) : null}
      {nextC ? (
        <button type="button" className="edge-dash edge-dr" style={{ ["--pc" as string]: nextC.color } as React.CSSProperties} title={`Next · ${nextC.name}`} onClick={() => navBy(1)}>
          <span className="et">{nextC.short}</span>
          <span className="ed-dot" />
          <svg viewBox="0 0 14 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M 3 3 L 10 11 L 3 19" />
            <circle cx="10" cy="11" r="1.8" fill="currentColor" stroke="none" />
          </svg>
        </button>
      ) : null}

      <div className="ddashview">
        {enteredCenter ? <Dashboard center={enteredCenter} range={range} onRange={setRange} onOpenGuide={() => setGuideOpen(true)} prebuilt={solutionsMode} /> : null}
      </div>

      {guideOpen && enteredCenter ? <GuideModal center={enteredCenter} onClose={() => setGuideOpen(false)} /> : null}
    </div>
  );
}
