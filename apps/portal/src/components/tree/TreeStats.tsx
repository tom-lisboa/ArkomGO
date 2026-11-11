"use client";

import {
  BRAIN_KEY,
  EMPTY_BRAIN,
  INSTALLED_KEY,
  useLocalStorage,
  type BrainState,
} from "@/lib/use-local-storage";
import { useT } from "@/lib/i18n";

interface StatTile {
  label: string;
  value: string;
  suffix?: string;
}

/**
 * Four-up stat row. `installedCount` lets the tree page drive a live count;
 * otherwise it reads localStorage directly. Brain reflects the interview state.
 */
export function TreeStats({ installedCount }: { installedCount?: number }) {
  const t = useT();
  const [installedLS] = useLocalStorage<string[]>(INSTALLED_KEY, []);
  const [brain] = useLocalStorage<BrainState>(BRAIN_KEY, EMPTY_BRAIN);
  const count = installedCount ?? installedLS.length;

  const stats: StatTile[] = [
    { label: t.tree.installed, value: String(count), suffix: "/ 79" },
    { label: t.tree.brain, value: brain.completed ? t.tree.built : t.tree.soon },
    { label: t.tree.streak, value: "—" },
    { label: t.tree.memberSince, value: "—" },
  ];

  return (
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-[14px] border border-st-line-2 bg-st-card p-4"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-st-ink-3">
            {stat.label}
          </p>
          <p className="mt-2 flex items-baseline gap-1.5">
            <span className="text-[22px] font-semibold leading-none text-st-ivory">
              {stat.value}
            </span>
            {stat.suffix ? (
              <span className="text-[13px] text-st-ink-3">{stat.suffix}</span>
            ) : null}
          </p>
        </div>
      ))}
    </div>
  );
}
