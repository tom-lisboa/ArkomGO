"use client";

import { Shell } from "@/components/Shell";
import { useT } from "@/lib/i18n";
import { BrainFlow } from "@/components/brain/BrainFlow";

/**
 * /brain — the real member flow (Pkg10 · N6). Replaces the old marketing wizard
 * with the logged original's two views (fast draft entry + 8-step editor),
 * gated by plan and by saved data. Header mirrors the live topbar ("Brain" + the
 * tagline); the flow renders below.
 */
export default function BrainPage() {
  const t = useT();
  return (
    <Shell>
      <div className="mx-auto w-full max-w-[820px]">
        <header>
          <h1 className="text-[27px] font-bold leading-none tracking-[-0.02em] text-st-ivory">
            {t.brain.title}
            <span className="ml-2.5 align-baseline text-[15px] font-normal text-st-ink-2">
              {t.brain.tagline}
            </span>
          </h1>
        </header>
        <BrainFlow />
      </div>
    </Shell>
  );
}
