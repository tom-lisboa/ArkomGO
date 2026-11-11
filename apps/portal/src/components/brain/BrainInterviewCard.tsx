"use client";

import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";

import { usePlan } from "@/lib/plan";
import { useT } from "@/lib/i18n";
import { BRAIN_KEY, EMPTY_BRAIN, useLocalStorage, type BrainState } from "@/lib/use-local-storage";
import { PaywallModal } from "@/components/PaywallModal";
import { BrainInterview } from "./BrainInterview";

/**
 * Interview entry point on /brain. FREE → a locked card that opens the paywall.
 * PRO → a "Start the 10-min interview" button (or Resume / Review) that opens the
 * 8-step wizard. State is read from the same 'skilltree-brain' the wizard writes.
 */
export function BrainInterviewCard() {
  const { isPro, showToast } = usePlan();
  const t = useT();
  const [wizard, setWizard] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [brain] = useLocalStorage<BrainState>(BRAIN_KEY, EMPTY_BRAIN);

  const done = Boolean(brain.completed);
  const started = !done && (brain.step ?? 0) > 0;

  return (
    <>
      <section
        className="mt-8 rounded-[16px] p-5 sm:p-6"
        style={{
          border: "1px solid color-mix(in srgb, #c58b5f 30%, transparent)",
          background: "rgba(197,139,95,.06)",
        }}
      >
        {isPro ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-[10px] text-[#c58b5f]"
                style={{ background: "rgba(197,139,95,.14)", border: "1px solid rgba(197,139,95,.3)" }}
              >
                <Sparkles className="size-[17px]" />
              </span>
              <div>
                <h3 className="text-[17px] font-semibold text-st-ivory">
                  {done
                    ? t.brain.builtToast
                    : started
                      ? t.brain.card.resume
                      : t.brain.card.build}
                </h3>
                <p className="mt-1.5 max-w-[440px] text-[13px] leading-relaxed text-st-ink-2">
                  {t.brain.card.body}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => showToast(t.brain.card.voiceToast)}
                className="rounded-[10px] border border-st-line-2 px-3.5 py-2.5 text-[13px] font-medium text-st-ink-2 transition-colors hover:text-st-ivory"
              >
                {t.brain.card.talk}
              </button>
              <button
                type="button"
                onClick={() => setWizard(true)}
                className="rounded-[10px] border border-st-line-2 bg-st-card-2 px-3.5 py-2.5 text-[13px] font-medium text-st-ivory transition-colors hover:bg-white/[0.12]"
              >
                {done ? t.brain.card.reviewAnswers : started ? t.brain.card.resumeShort : t.brain.card.typeMyself}
              </button>
              <button
                type="button"
                onClick={() => setWizard(true)}
                className="rounded-[10px] bg-[#ECECEE] px-4 py-2.5 text-[13px] font-bold text-[#0A0A0C] transition-opacity hover:opacity-90"
              >
                {t.brain.card.draftAi}
              </button>
            </div>
          </div>
        ) : (
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
              className="shrink-0 rounded-[10px] bg-[#ECECEE] px-4 py-2.5 text-[13px] font-bold text-[#0A0A0C] transition-opacity hover:opacity-90"
            >
              {t.brain.card.unlockPro}
            </button>
          </div>
        )}
      </section>

      {wizard ? <BrainInterview onClose={() => setWizard(false)} /> : null}
      {paywall ? <PaywallModal onClose={() => setPaywall(false)} /> : null}
    </>
  );
}
