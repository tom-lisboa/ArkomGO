"use client";

import { useT } from "@/lib/i18n";

interface ZoomControlsProps {
  zoom: number;
  onZoom: (delta: number) => void;
  onFit: () => void;
  onAbout?: () => void;
}

export function ZoomControls({ zoom, onZoom, onFit, onAbout }: ZoomControlsProps) {
  const t = useT();
  const pct = Math.round(zoom * 100);
  return (
    <div
      className="absolute bottom-4 right-4 z-20 flex items-center gap-0.5 rounded-[10px] px-1.5 py-1 text-[var(--map-ink-2)]"
      style={{
        background: "var(--map-glass)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: "1px solid var(--map-line)",
      }}
    >
      <button
        type="button"
        onClick={onAbout}
        aria-label={t.map.aboutMap}
        className="grid size-7 place-items-center rounded-md text-[13px] transition-colors hover:text-[var(--map-ivory)]"
      >
        ?
      </button>
      <button
        type="button"
        onClick={() => onZoom(-0.12)}
        aria-label={t.map.zoomOut}
        className="grid size-7 place-items-center rounded-md text-[16px] transition-colors hover:text-[var(--map-ivory)]"
      >
        −
      </button>
      <span className="w-11 text-center text-[12px] tabular-nums text-[var(--map-ivory-2)]">
        {pct}%
      </span>
      <button
        type="button"
        onClick={() => onZoom(0.12)}
        aria-label={t.map.zoomIn}
        className="grid size-7 place-items-center rounded-md text-[16px] transition-colors hover:text-[var(--map-ivory)]"
      >
        +
      </button>
      <button
        type="button"
        onClick={onFit}
        className="ml-0.5 grid h-7 place-items-center rounded-md px-2 text-[12px] font-medium transition-colors hover:text-[var(--map-ivory)]"
      >
        {t.map.fit}
      </button>
    </div>
  );
}
