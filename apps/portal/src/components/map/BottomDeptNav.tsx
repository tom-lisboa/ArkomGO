"use client";

interface BottomDeptNavProps {
  name: string;
  onPrev: () => void;
  onNext: () => void;
  /** the wheel chevrons (.wchev) show ONLY in overview — hidden in the fan/dive. */
  showChevrons: boolean;
}

/** thin 15×25 chevron glyphs (source .wchev svg), sized non-square like the live. */
function ChevLeft() {
  return (
    <svg
      width="15"
      height="25"
      viewBox="0 0 15 25"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.5 4 4 12.5 10.5 21" />
    </svg>
  );
}
function ChevRight() {
  return (
    <svg
      width="15"
      height="25"
      viewBox="0 0 15 25"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.5 4 11 12.5 4.5 21" />
    </svg>
  );
}

/**
 * Bottom department label flanked by the two wheel chevrons (source .wchev). The
 * chevrons sit fixed at ±215px from centre, 48×48, and only appear in the overview
 * (they rotate the wheel); during a dive / in the fan they are gone.
 */
export function BottomDeptNav({ name, onPrev, onNext, showChevrons }: BottomDeptNavProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[8.5%] z-20 flex items-center justify-center">
      {showChevrons ? (
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous department"
          className="chev-nudge pointer-events-auto absolute top-1/2 flex size-[48px] -translate-y-1/2 items-center justify-center text-[var(--map-ivory-2)] transition-colors hover:text-[var(--map-ivory)]"
          style={{ left: "calc(50% - 215px)", ["--nx" as string]: "-3px" }}
        >
          <ChevLeft />
        </button>
      ) : null}

      <div
        className="min-w-[180px] text-center text-[17px] uppercase tracking-[0.3em] text-[var(--map-ivory)]"
        style={{ fontFamily: "var(--st-font-display, var(--font-marcellus), serif)" }}
      >
        {name}
      </div>

      {showChevrons ? (
        <button
          type="button"
          onClick={onNext}
          aria-label="Next department"
          className="chev-nudge pointer-events-auto absolute top-1/2 flex size-[48px] -translate-y-1/2 items-center justify-center text-[var(--map-ivory-2)] transition-colors hover:text-[var(--map-ivory)]"
          style={{ right: "calc(50% - 215px)", ["--nx" as string]: "3px" }}
        >
          <ChevRight />
        </button>
      ) : null}
    </div>
  );
}
