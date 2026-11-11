"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";

import { STARTER_SKILLS } from "@/lib/hub-data";
import { usePlan } from "@/lib/plan";
import { useLocale, useT } from "@/lib/i18n";
import { useLocalStorage } from "@/lib/use-local-storage";
import { skillNamePt } from "./skill-names-pt";
import { PaywallModal } from "@/components/PaywallModal";

const ONBOARDING_KEY = "skilltree-onboarding";
interface Onboarding {
  done: number[];
  dismissed: boolean;
}
const EMPTY_ONBOARDING: Onboarding = { done: [1], dismissed: false };

/**
 * Onboarding card. FREE keeps the "install your first skill" card (charge CTAs
 * open the paywall). MEMBER (pro) gets the real "Your first week, in five steps"
 * checklist — 5 steps, N/5 progress, dismissible. Step 1 is born Done; each CTA
 * marks its step done (persisted in localStorage 'skilltree-onboarding').
 */
export function GetStartedCard() {
  const { isPro } = usePlan();
  const t = useT();
  const { locale } = useLocale();
  const g = t.hub.getStarted;
  const [dismissed, setDismissed] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [onboarding, setOnboarding] = useLocalStorage<Onboarding>(
    ONBOARDING_KEY,
    EMPTY_ONBOARDING
  );

  const markDone = (n: number) =>
    setOnboarding((prev) =>
      prev.done.includes(n) ? prev : { ...prev, done: [...prev.done, n] }
    );
  const dismissOnboarding = () =>
    setOnboarding((prev) => ({ ...prev, dismissed: true }));

  /* ---------- MEMBER (pro): the five-step first week ---------- */
  if (isPro) {
    if (onboarding.dismissed) return null;
    const doneSet = new Set(onboarding.done);
    doneSet.add(1); // step 1 is always done
    const doneCount = Math.min(doneSet.size, 5);

    return (
      <div className="relative rounded-[16px] border border-st-copper-line bg-st-copper-soft px-6 py-[22px] shadow-[0_0_0_1px_#18181b0f]">
        <button
          type="button"
          aria-label={t.hub.dismiss}
          onClick={dismissOnboarding}
          className="absolute right-4 top-4 rounded-[7px] p-1 text-st-ink-3 transition-colors hover:bg-white/[0.06] hover:text-st-ivory"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-start justify-between gap-4 pr-8">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-st-ink-3">
              {g.eyebrow}
            </span>
            <h2 className="text-[20px] font-bold leading-tight tracking-[-0.01em] text-st-ivory">
              {g.memberTitle}
            </h2>
          </div>
          <span className="shrink-0 pt-1 text-[13px] tabular-nums text-st-ink-3">
            {doneCount}/5
          </span>
        </div>

        {/* progress bar */}
        <div className="mt-4 h-[3px] overflow-hidden rounded-full bg-st-line">
          <div
            className="h-full rounded-full bg-st-copper transition-[width] duration-300"
            style={{ width: `${(doneCount / 5) * 100}%` }}
          />
        </div>

        <ol className="mt-5 flex flex-col gap-2.5">
          <StepRow n={1} done title={g.s1t} sub={g.s1s} doneLabel={g.done} />
          <StepRow
            n={2}
            done={doneSet.has(2)}
            title={g.s2t}
            sub={g.s2s}
            doneLabel={g.done}
          >
            <CtaButton primary onClick={() => markDone(2)}>
              {g.installGuide}
            </CtaButton>
            <CtaButton onClick={() => markDone(2)}>{g.alreadyHaveIt}</CtaButton>
          </StepRow>
          <StepRow
            n={3}
            done={doneSet.has(3)}
            title={g.s3t}
            sub={g.s3s}
            doneLabel={g.done}
          >
            {STARTER_SKILLS.map((skill) => (
              <button
                key={skill.name}
                type="button"
                onClick={() => markDone(3)}
                className="inline-flex items-center gap-2 rounded-full border border-st-line-2 bg-st-card px-3 py-1.5 text-[12px] text-st-ivory transition-colors hover:border-st-copper-line hover:bg-st-card-2"
              >
                <span className="size-1.5 rounded-full" style={{ background: skill.color }} />
                {skillNamePt(skill.name, locale)}
              </button>
            ))}
          </StepRow>
          <StepRow
            n={4}
            done={doneSet.has(4)}
            title={g.s4t}
            sub={g.s4s}
            doneLabel={g.done}
          >
            <CtaButton primary onClick={() => markDone(4)}>
              {g.seeMcps}
            </CtaButton>
            <CtaButton onClick={() => markDone(4)}>{g.alreadyConnected}</CtaButton>
          </StepRow>
          <StepRow
            n={5}
            done={doneSet.has(5)}
            title={g.s5t}
            sub={g.s5s}
            doneLabel={g.done}
          >
            <Link
              href="/brain"
              onClick={() => markDone(5)}
              className="inline-flex items-center rounded-[10px] bg-st-ivory px-3.5 py-2.5 text-[12.5px] font-semibold text-st-bg transition-opacity hover:opacity-90"
            >
              {g.openBrain}
            </Link>
            <CtaButton onClick={() => markDone(5)}>{g.starterClaudeMd}</CtaButton>
          </StepRow>
        </ol>
      </div>
    );
  }

  /* ---------- FREE: pick a starter skill (charge CTA → paywall) ---------- */
  if (dismissed) return null;

  return (
    <>
      <div className="relative rounded-[16px] border border-st-copper-line bg-st-copper-soft px-6 py-[22px] shadow-[0_0_0_1px_#18181b0f]">
        <button
          type="button"
          aria-label={t.hub.dismiss}
          onClick={() => setDismissed(true)}
          className="absolute right-4 top-4 rounded-[7px] p-1 text-st-ink-3 transition-colors hover:bg-white/[0.06] hover:text-st-ivory"
        >
          <X className="size-4" />
        </button>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-st-ink-3">
            {g.eyebrow}
          </span>
          <h2 className="text-[20px] font-bold leading-tight tracking-[-0.01em] text-st-ivory">
            {g.freeTitle}
          </h2>
        </div>

        <div className="mt-5 rounded-[12px] border border-st-line bg-st-card p-5">
          <div className="flex gap-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-st-line-2 text-[13px] tabular-nums text-st-ink-2">
              1
            </span>
            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-medium text-st-ivory">
                {g.freePickTitle}
              </span>
              <p className="text-[13px] leading-relaxed text-st-ink-2">{g.freePickSub}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {STARTER_SKILLS.map((skill) => (
                  <button
                    key={skill.name}
                    type="button"
                    onClick={() => setPaywall(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-st-line-2 bg-st-card px-3 py-1.5 text-[12px] text-st-ivory transition-colors hover:border-st-copper-line hover:bg-st-card-2"
                  >
                    <span className="size-1.5 rounded-full" style={{ background: skill.color }} />
                    {skillNamePt(skill.name, locale)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {paywall ? <PaywallModal onClose={() => setPaywall(false)} /> : null}
    </>
  );
}

function StepRow({
  n,
  done,
  title,
  sub,
  doneLabel,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  sub: string;
  doneLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={`flex gap-4 rounded-[12px] border border-st-line bg-st-card p-4 ${
        done ? "opacity-60" : ""
      }`}
    >
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-[13px] tabular-nums ${
          done ? "border-[#c58b5f]/50 text-[#c58b5f]" : "border-st-line-2 text-st-ink-2"
        }`}
      >
        {done ? <Check size={15} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-medium text-st-ivory">{title}</div>
            <p className="mt-1 max-w-[600px] text-[13px] leading-relaxed text-st-ink-2">{sub}</p>
          </div>
          {done ? (
            <span className="shrink-0 rounded-[10px] border border-st-line-2 px-3 py-1.5 text-[12px] font-medium text-st-ink-2">
              {doneLabel}
            </span>
          ) : null}
        </div>
        {!done && children ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>
        ) : null}
      </div>
    </li>
  );
}

function CtaButton({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? "rounded-[10px] bg-st-ivory px-3.5 py-2.5 text-[12.5px] font-semibold text-st-bg transition-opacity hover:opacity-90"
          : "rounded-[10px] border border-st-line-2 px-3.5 py-2.5 text-[12.5px] font-semibold text-st-ink-2 transition-colors hover:bg-white/[0.05] hover:text-st-ivory"
      }
    >
      {children}
    </button>
  );
}
