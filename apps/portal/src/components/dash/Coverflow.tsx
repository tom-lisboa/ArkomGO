"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

import { useLocale } from "@/lib/i18n";
import { CommandCard } from "./CommandCard";
import type { Center } from "./dash-data";

export interface CoverflowHandle {
  spinTo: (index: number) => void;
}

const STEP = 60; // 360 / 6 cards

const ChevLeft = () => (
  <svg viewBox="0 0 14 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M 11 3 L 4 11 L 11 19" />
    <circle cx="4" cy="11" r="1.8" fill="currentColor" stroke="none" />
  </svg>
);
const ChevRight = () => (
  <svg viewBox="0 0 14 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M 3 3 L 10 11 L 3 19" />
    <circle cx="10" cy="11" r="1.8" fill="currentColor" stroke="none" />
  </svg>
);

export const Coverflow = forwardRef<CoverflowHandle, { centers: Center[]; active: boolean; onEnter: (index: number) => void }>(
  function Coverflow({ centers, active, onEnter }, ref) {
    const { locale } = useLocale();
    const pt = locale === "pt";
    const sceneRef = useRef<HTMLDivElement | null>(null);
    const ringRef = useRef<HTMLDivElement | null>(null);
    const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

    const angle = useRef(0); // cwA — current angle
    const target = useRef(0); // cwT — eased-towards angle
    const focused = useRef(0);
    const dragDist = useRef(0);
    const activeRef = useRef(active);

    useEffect(() => {
      activeRef.current = active;
    }, [active]);

    const n = centers.length;

    const focusedIndex = useCallback(() => ((Math.round(-angle.current / STEP) % n) + n) % n, [n]);

    const norm = useCallback(() => {
      while (target.current - angle.current > 180) target.current -= 360;
      while (target.current - angle.current < -180) target.current += 360;
    }, []);

    const layout = useCallback(() => {
      const ring = ringRef.current;
      if (!ring) return;
      const mobile = window.innerWidth < 700;
      const R = mobile ? 360 : 650;
      const tilt = mobile ? 0 : 5;
      const a = angle.current;
      ring.style.transform = `translateZ(${-R}px) rotateX(${tilt}deg) rotateY(${a.toFixed(2)}deg)`;
      focused.current = focusedIndex();
      cardsRef.current.forEach((c, i) => {
        if (!c) return;
        c.style.transform = `rotateY(${(i * STEP).toFixed(1)}deg) translateZ(${R}px)`;
        const eff = Math.abs(((((a + i * STEP) % 360) + 540) % 360) - 180) / 180; // 0 front, 1 back
        c.style.opacity = (1 - eff * 0.62).toFixed(2);
        c.style.pointerEvents = eff > 0.55 ? "none" : "auto";
        c.classList.toggle("focused", i === focused.current);
      });
    }, [focusedIndex]);

    useImperativeHandle(ref, () => ({
      spinTo(index: number) {
        target.current = -index * STEP;
        norm();
      },
    }));

    /* rAF easing loop — runs only while the overview is visible */
    useEffect(() => {
      let raf = 0;
      let idle: ReturnType<typeof setTimeout> | null = null;

      const tick = () => {
        angle.current += (target.current - angle.current) * 0.14;
        layout();
        raf = requestAnimationFrame(tick);
      };
      if (active) raf = requestAnimationFrame(tick);

      const scene = sceneRef.current;
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      let flickV = 0;
      let flickT = 0;

      const snap = () => {
        target.current = Math.round(target.current / STEP) * STEP;
      };

      const onDown = (e: PointerEvent) => {
        if (!activeRef.current) return;
        dragging = true;
        dragDist.current = 0;
        lastX = e.clientX;
        lastY = e.clientY;
        flickV = 0;
        flickT = performance.now();
        scene?.classList.add("grabbing");
      };
      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        dragDist.current += Math.abs(dx) + Math.abs(e.clientY - lastY);
        angle.current += dx * (window.innerWidth < 700 ? 0.32 : 0.16);
        target.current = angle.current;
        const now = performance.now();
        flickV = 0.75 * flickV + 0.25 * (dx / Math.max(1, now - flickT));
        flickT = now;
        if (idle) clearTimeout(idle);
        idle = setTimeout(snap, 240);
        lastX = e.clientX;
        lastY = e.clientY;
      };
      const onUp = () => {
        if (dragging && Math.abs(flickV) > 0.18) {
          const cont = Math.max(-1.6 * STEP, Math.min(1.6 * STEP, flickV * 140));
          target.current = Math.round((angle.current + cont) / STEP) * STEP;
          if (idle) clearTimeout(idle);
        }
        dragging = false;
        scene?.classList.remove("grabbing");
      };
      const onWheel = (e: WheelEvent) => {
        if (!activeRef.current) return;
        e.preventDefault();
        target.current += (e.deltaX || e.deltaY) * -0.08;
        if (idle) clearTimeout(idle);
        idle = setTimeout(snap, 240);
      };

      scene?.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      scene?.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("resize", layout);
      layout();

      return () => {
        if (raf) cancelAnimationFrame(raf);
        if (idle) clearTimeout(idle);
        scene?.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        scene?.removeEventListener("wheel", onWheel);
        window.removeEventListener("resize", layout);
      };
    }, [active, layout]);

    const activateCard = useCallback(
      (i: number) => {
        if (dragDist.current >= 8) return; // it was a drag, not a click
        if (i === focused.current) onEnter(i);
        else {
          target.current = -i * STEP;
          norm();
        }
      },
      [onEnter, norm]
    );

    const prev = useCallback(() => {
      target.current = Math.round(target.current / STEP) * STEP + STEP;
    }, []);
    const next = useCallback(() => {
      target.current = Math.round(target.current / STEP) * STEP - STEP;
    }, []);

    return (
      <>
        <div className="dfloorglow" />
        <div className="dfloor" aria-hidden="true">
          <svg viewBox="0 0 1100 130" width="1100" height="130">
            <ellipse cx="550" cy="65" rx="520" ry="56" fill="none" stroke="rgb(var(--lnrgb))" strokeOpacity="0.12" strokeDasharray="2 7" strokeWidth="1" />
            <ellipse cx="550" cy="65" rx="380" ry="40" fill="none" stroke="rgb(var(--lnrgb))" strokeOpacity="0.07" strokeWidth="1" />
            <circle cx="550" cy="121" r="2.2" fill="#c58b5f" opacity="0.8" />
          </svg>
        </div>

        <div className="dscene" ref={sceneRef}>
          <div className="dring" ref={ringRef}>
            {centers.map((c, i) => (
              <CommandCard
                key={c.id}
                center={c}
                cardRef={(el) => {
                  cardsRef.current[i] = el;
                }}
                onActivate={() => activateCard(i)}
              />
            ))}
          </div>
        </div>

        <div className="dtitle">
          <div className="deyebrow">{pt ? "A camada de saída" : "The output layer"}</div>
          <h1>{pt ? "Centros de Comando" : "Command Centers"}</h1>
          <p className="dser">
            {pt ? "como cada departamento fica " : "what each department looks like "}
            <i>{pt ? "quando o trabalho se resolve sozinho" : "when the work runs itself"}</i>
          </p>
        </div>

        <button type="button" className="wchev wchev-l" aria-label="Previous" onClick={prev}>
          <ChevLeft />
        </button>
        <button type="button" className="wchev wchev-r" aria-label="Next" onClick={next}>
          <ChevRight />
        </button>
        <div className="dhint">{pt ? "arraste para girar · clique no card da frente para entrar" : "drag to spin · click the front card to enter"}</div>
      </>
    );
  }
);
