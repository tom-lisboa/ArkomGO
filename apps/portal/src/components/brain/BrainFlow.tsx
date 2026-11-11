"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

import { usePlan } from "@/lib/plan";
import { useT } from "@/lib/i18n";
import { PaywallModal } from "@/components/PaywallModal";
import { brainHasData, useBrain, type BrainSections } from "./content";
import { BrainFast } from "./BrainFast";
import { BrainSteps } from "./BrainSteps";
import { BrainInstall } from "./BrainInstall";

/**
 * Brain flow orchestrator (Pkg10 · N6). Two gates:
 *  1. plan gate — FREE shows the locked card + paywall (preserved from the old
 *     page); PRO gets the real flow.
 *  2. data gate (findings A0) — empty brain → the fast draft view; any saved
 *     data → the 8-step editor, with the install card once it's built.
 */
export function BrainFlow() {
  const { isPro } = usePlan();
  const t = useT();
  const [brain, setBrain] = useBrain();
  const [forceSteps, setForceSteps] = useState(false);
  const [paywall, setPaywall] = useState(false);

  if (!isPro) {
    return (
      <>
        <section
          className="mt-8 rounded-[16px] p-5 sm:p-6"
          style={{
            border: "1px solid color-mix(in srgb, #c58b5f 30%, transparent)",
            background: "rgba(197,139,95,.06)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full text-[#c58b5f]"
                style={{ background: "rgba(197,139,95,.14)", border: "1px solid rgba(197,139,95,.3)" }}
              >
                <Lock className="size-[16px]" />
              </span>
              <div>
                <h3 className="text-[17px] font-semibold text-st-ivory">
                  {t.brain.card.freeTitle}
                </h3>
                <p className="mt-1.5 max-w-[440px] text-[13px] leading-relaxed text-st-ink-2">
                  {t.brain.card.freeBody}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPaywall(true)}
              className="shrink-0 rounded-[10px] bg-st-ivory px-4 py-2.5 text-[13px] font-bold text-st-bg transition-opacity hover:opacity-90"
            >
              {t.brain.card.unlockPro}
            </button>
          </div>
        </section>
        {paywall ? <PaywallModal onClose={() => setPaywall(false)} /> : null}
      </>
    );
  }

  const inSteps = forceSteps || brainHasData(brain);

  const enterSteps = (sections: BrainSections) => {
    setBrain((prev) => ({ ...prev, ...sections }));
    setForceSteps(true);
  };

  if (!inSteps) {
    return <BrainFast onDrafted={enterSteps} onTypeMyself={() => setForceSteps(true)} />;
  }

  return (
    <>
      {brain.completed ? <BrainInstall brain={brain} /> : null}
      <BrainSteps
        brain={brain}
        setBrain={setBrain}
        onBuilt={() => setBrain((prev) => ({ ...prev, completed: true }))}
      />
    </>
  );
}
