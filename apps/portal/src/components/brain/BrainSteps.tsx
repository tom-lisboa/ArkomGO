"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { useLocale, useT } from "@/lib/i18n";
import { BRAIN_SECTIONS, STEPS_HINT, type BrainV2 } from "./content";

interface BrainStepsProps {
  brain: BrainV2;
  setBrain: (value: BrainV2 | ((prev: BrainV2) => BrainV2)) => void;
  onBuilt: () => void;
}

/**
 * Steps view (findings A4): the 8-section editor. Every keystroke write-throughs
 * to localStorage (saved as you go), so leaving and coming back reopens here.
 * Required sections must be filled to continue; only `notes` is optional. The
 * last step builds the brain (flips completed → the install card appears).
 */
export function BrainSteps({ brain, setBrain, onBuilt }: BrainStepsProps) {
  const t = useT();
  const { locale } = useLocale();
  const [step, setStep] = useState(0);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const total = BRAIN_SECTIONS.length; // 8
  const section = BRAIN_SECTIONS[step];
  const value = brain[section.key];
  const isLast = step === total - 1;
  const canSkip = Boolean(section.optional) && !isLast;
  const pct = ((step + 1) / total) * 100;

  const setField = (v: string) => {
    setError(false);
    setBrain((prev) => ({ ...prev, [section.key]: v }));
  };

  const back = () => {
    if (step === 0) return;
    setError(false);
    setStep(step - 1);
  };

  const skip = () => {
    setError(false);
    setStep(step + 1);
  };

  const advance = () => {
    if (!section.optional && !value.trim()) {
      setError(true);
      return;
    }
    setError(false);
    if (!isLast) {
      setStep(step + 1);
      return;
    }
    // last step → build
    setSaving(true);
    saveTimer.current = setTimeout(() => {
      setSaving(false);
      onBuilt();
    }, 400);
  };

  return (
    <section className="mt-8">
      {/* Meta row */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#c58b5f]">
          {section.eyebrow[locale]}
        </span>
        <span className="text-[12px] font-semibold tabular-nums text-st-ink-3">
          {step + 1} / {total}
        </span>
      </div>

      {/* Progress */}
      <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-st-line-2">
        <div
          className="h-full rounded-full bg-st-ivory transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Question */}
      <h2 className="mt-5 text-[21px] font-bold leading-tight tracking-[-0.01em] text-st-ivory">
        {section.question[locale]}
      </h2>

      {/* Field */}
      <div className="mt-4">
        {section.field === "input" ? (
          <input
            type="text"
            value={value}
            onChange={(e) => setField(e.target.value)}
            placeholder={section.placeholder[locale]}
            className="w-full rounded-[12px] border border-st-line-2 bg-st-card-2 px-4 py-3.5 text-[15px] text-st-ivory outline-none placeholder:text-st-ink-3 focus:border-st-ivory/30"
          />
        ) : (
          <textarea
            value={value}
            onChange={(e) => setField(e.target.value)}
            placeholder={section.placeholder[locale]}
            rows={4}
            className="w-full resize-none rounded-[12px] border border-st-line-2 bg-st-card-2 px-4 py-3.5 text-[15px] leading-relaxed text-st-ivory outline-none placeholder:text-st-ink-3 focus:border-st-ivory/30"
          />
        )}
        {error ? (
          <p className="mt-2 text-[12px] font-medium text-[#ef4444]">
            {t.brain.fillToContinue}
          </p>
        ) : null}
      </div>

      {/* Footer nav */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className={`inline-flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-colors ${
            step === 0
              ? "cursor-not-allowed text-st-ink-3"
              : "text-st-ink-2 hover:text-st-ivory"
          }`}
        >
          <ArrowLeft className="size-[15px]" />
          {t.common.back}
        </button>

        <div className="flex items-center gap-2">
          {canSkip ? (
            <button
              type="button"
              onClick={skip}
              className="rounded-[8px] px-3 py-2 text-[13px] font-medium text-st-ink-2 transition-colors hover:text-st-ivory"
            >
              {t.brain.skip}
            </button>
          ) : null}
          <button
            type="button"
            onClick={advance}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-[8px] bg-st-ivory px-5 py-2.5 text-[13.5px] font-semibold text-st-bg transition-opacity hover:opacity-90 disabled:opacity-70"
          >
            {saving
              ? t.brain.saving
              : isLast
                ? t.brain.buildBrainCta
                : t.brain.continueCta}
            {!saving && !isLast ? <ArrowRight className="size-[15px]" /> : null}
          </button>
        </div>
      </div>

      {/* Hint */}
      <p className="mt-5 text-[12px] leading-relaxed text-st-ink-3">
        {STEPS_HINT[locale]}
      </p>
    </section>
  );
}
