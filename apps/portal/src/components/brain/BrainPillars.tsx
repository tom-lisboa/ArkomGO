"use client";

import { Compass, Package, Users, AudioLines } from "lucide-react";

import type { IconType } from "@/components/modules/modules-data";
import { useT } from "@/lib/i18n";
import { BRAIN_KEY, EMPTY_BRAIN, useLocalStorage, type BrainState } from "@/lib/use-local-storage";

interface Pillar {
  title: string;
  description: string;
  icon: IconType;
  /** which interview answer fills this pillar once the brain is built. */
  answerKey: "do" | "sell" | "icp" | "voice";
}

/** The four things that live in a company's second brain. */
const PILLARS: Pillar[] = [
  {
    title: "What you do",
    description:
      "Your one-liner, so every agent leads with the right positioning.",
    icon: Compass,
    answerKey: "do",
  },
  {
    title: "What you sell",
    description:
      "Offers and pricing, so proposals and replies quote you correctly.",
    icon: Package,
    answerKey: "sell",
  },
  {
    title: "Who you serve",
    description:
      "Your ICP, so outreach and content speak to the right buyer.",
    icon: Users,
    answerKey: "icp",
  },
  {
    title: "Voice",
    description: "How you sound, so nothing reads like a generic bot.",
    icon: AudioLines,
    answerKey: "voice",
  },
];

export function BrainPillars() {
  const t = useT();
  const [brain] = useLocalStorage<BrainState>(BRAIN_KEY, EMPTY_BRAIN);
  const ans = brain.answers as Record<string, string | string[] | undefined>;

  const titleFor: Record<Pillar["answerKey"], string> = {
    do: t.brain.stepTitles.whatYouDo,
    sell: t.brain.stepTitles.whatYouSell,
    icp: t.brain.stepTitles.whoYouServe,
    voice: t.brain.pillars.voiceTitle,
  };
  const descFor: Record<Pillar["answerKey"], string> = {
    do: t.brain.pillars.doDesc,
    sell: t.brain.pillars.sellDesc,
    icp: t.brain.pillars.icpDesc,
    voice: t.brain.pillars.voiceDesc,
  };

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {PILLARS.map((pillar) => {
        const Icon = pillar.icon;
        const raw = brain.completed ? ans[pillar.answerKey] : undefined;
        const answer = typeof raw === "string" && raw.trim() ? raw.trim() : null;
        return (
          <div
            key={pillar.title}
            className="rounded-[14px] border border-st-line-2 bg-st-card p-5"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-[8px] bg-st-card-2 text-st-ink-2">
                <Icon className="size-[15px]" />
              </span>
              <h3 className="text-[15px] font-semibold text-st-ivory">
                {titleFor[pillar.answerKey]}
              </h3>
              {answer ? (
                <span className="ml-auto rounded-full border border-[#c58b5f]/40 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#c58b5f]">
                  {t.brain.pillars.fromYourBrain}
                </span>
              ) : null}
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-st-ink-2">
              {answer ?? descFor[pillar.answerKey]}
            </p>
          </div>
        );
      })}
    </div>
  );
}
