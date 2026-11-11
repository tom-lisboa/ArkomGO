"use client";

import { useLayoutEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useT } from "@/lib/i18n";
import type { IconType } from "@/lib/hub-data";

/**
 * CourseRail — horizontal rail (N2 · plano capacitacoes-outsider-merge).
 *
 * Skeleton from the Outsider reference: section header (icon + 24px medium
 * title, mb-6), horizontal track with slides sized by their own width, 24px
 * gap (32px on Top 9), circular 32px chevrons pinned left/right.
 *
 * Skin is 100% Arkom: the reference uses the Swiper lib — here the track is
 * native `overflow-x-auto` + scroll-snap and the chevrons call scrollBy();
 * zero new dependency (replan v2 decision).
 */
export function CourseRail({
  icon: Icon,
  title,
  gap = 24,
  peek,
  children,
}: {
  icon: IconType;
  title: string;
  /** px between slides — Outsider parameter: 24 (Top 9: 32) */
  gap?: number;
  /** Netflix peek — Swiper's `slidesPerView: 4.5`: exactly this many slides
      visible, the fractional one cut at the scrollport edge (4.5 = four full
      cards + half of the fifth). Undefined = natural widths, no scaling. */
  peek?: number;
  children: React.ReactNode;
}) {
  const t = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // The slides have intrinsic widths (giant rank digit + fixed poster), so
  // fluid percentage slides would wreck the design. Instead: measure the
  // natural width up to the cut point (N full slides + the fraction of the
  // next) and `zoom` the row so that point lands exactly on the scrollport's
  // right edge — any viewport, any digit width. offset* metrics are local
  // coordinates (unaffected by the row's own zoom), so re-runs are stable.
  useLayoutEffect(() => {
    const track = trackRef.current;
    const row = rowRef.current;
    if (!peek || !track || !row) return;

    const full = Math.floor(peek);
    const frac = peek - full;

    const fit = () => {
      const slides = Array.from(row.children) as HTMLElement[];
      if (slides.length <= full) {
        row.style.removeProperty("zoom");
        return;
      }
      const natural =
        slides.slice(0, full).reduce((w, s) => w + s.offsetWidth, 0) +
        gap * full +
        slides[full].offsetWidth * frac;
      // clientWidth includes the 6px shadow-breathing paddings — both sides out
      const avail = track.clientWidth - 12;
      if (natural > 0 && avail > 0) {
        const zoom = Math.min(1.6, Math.max(0.6, avail / natural));
        row.style.setProperty("zoom", String(zoom));
      }
    };

    fit();
    // row: refits when the webfont swap changes the rank digits' width
    const ro = new ResizeObserver(fit);
    ro.observe(track);
    ro.observe(row);
    return () => ro.disconnect();
  }, [peek, gap, children]);

  const nudge = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const zoom = rowRef.current
      ? parseFloat(getComputedStyle(rowRef.current).getPropertyValue("zoom")) || 1
      : 1;
    // two card-widths per click — mirrors the reference's paging feel
    el.scrollBy({ left: dir * (322 + gap) * 2 * zoom, behavior: "smooth" });
  };

  return (
    <section className="relative z-20 pb-10 md:mb-12">
      {/* Section header — Outsider: icon + text-2xl medium, mb-6 */}
      <div className="mb-6 flex items-center">
        <Icon className="size-6 text-st-ink-2" />
        <h2 className="ml-4 text-2xl font-medium leading-8 text-st-ivory max-md:text-lg">
          {title}
        </h2>
      </div>

      <div className="relative flex items-center">
        <button
          type="button"
          aria-label={t.capacitacoes.scrollLeft}
          onClick={() => nudge(-1)}
          className="absolute left-0 z-10 flex size-8 items-center justify-center rounded-full border border-st-line bg-st-card-2 text-st-ivory backdrop-blur-md transition-colors hover:border-white/20 hover:bg-st-card"
          style={{ boxShadow: "var(--st-shadow)" }}
        >
          <ChevronLeft className="size-4" />
        </button>

        {/* No scroll-snap: mandatory snapping hijacked diagonal trackpad
            gestures during PAGE scroll (cards jumped a full slot). Free
            overflow + overscroll containment = rail only moves when the
            user actually drags it or clicks the chevrons (Swiper-like).

            Shadow breathing room: an overflow container CLIPS anything that
            leaks past its box, which decapitated the elevation shadow
            (0 22px 60px extends ~48px below the card). Inner padding +
            matching negative margins carve that space INSIDE the scrollport
            without moving the layout a single pixel. */}
        <div
          ref={trackRef}
          className="flex w-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ padding: "14px 6px 60px", margin: "-14px -6px -60px" }}
        >
          {/* inner row: carries gap + the peek zoom (zooming the scrollport
              itself would distort its own box; the row keeps scroll metrics
              honest — scrollWidth follows the zoomed layout) */}
          <div ref={rowRef} className="flex" style={{ gap }}>
            {children}
          </div>
        </div>

        <button
          type="button"
          aria-label={t.capacitacoes.scrollRight}
          onClick={() => nudge(1)}
          className="absolute right-0 z-10 flex size-8 items-center justify-center rounded-full border border-st-line bg-st-card-2 text-st-ivory backdrop-blur-md transition-colors hover:border-white/20 hover:bg-st-card"
          style={{ boxShadow: "var(--st-shadow)" }}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </section>
  );
}
