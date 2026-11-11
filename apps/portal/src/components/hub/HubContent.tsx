"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Layers, Map, Sparkles } from "lucide-react";

import { useT } from "@/lib/i18n";
import { INSTALLED_KEY, useLocalStorage } from "@/lib/use-local-storage";
import { SearchBar } from "@/components/hub/SearchBar";
import { GetStartedCard } from "@/components/hub/GetStartedCard";
import { ModuleCard } from "@/components/hub/ModuleCard";
import { DropCard } from "@/components/hub/DropCard";
import { FeaturedDrop } from "@/components/hub/FeaturedDrop";
import { HubAside } from "@/components/hub/HubAside";
import { NextDropBanner } from "@/components/hub/NextDropBanner";
import { DROPS, MODULES } from "@/lib/hub-data";

/** Hub interior — rendered inside <Shell> so it can read the locale (Pkg9 · N2). */
export function HubContent() {
  const t = useT();
  // Live installed count — same store the /tree page owns (single source of truth).
  // `run` + `streak` have no real source, so they stay the original demo constants.
  const [installed] = useLocalStorage<string[]>(INSTALLED_KEY, []);
  const stats = t.hub.stats;
  return (
    <div className="w-full">
      {/* Page header */}
      <header className="mb-[26px] flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[27px] font-extrabold leading-none tracking-tight text-st-ivory">
          {t.hub.skillsLive(13)}
          <span className="ml-2.5 align-baseline text-[15px] font-medium text-st-ink-2">
            {t.hub.catchUp}
          </span>
        </h1>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-st-line px-3 py-1.5 text-[12px] text-st-ink-2">
            <span className="size-1.5 rounded-full bg-st-ivory/60" />
            {t.hub.onTheList("2,425")}
          </span>
          <Link
            href="/map"
            className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-st-ivory px-3.5 text-[13px] font-medium text-st-bg transition-opacity hover:opacity-90"
          >
            <Map className="size-[15px]" />
            {t.hub.openTheMap}
          </Link>
        </div>
      </header>

      {/* Search */}
      <div className="mt-6">
        <SearchBar />
      </div>

      {/* Stats strip — quick pulse of your tree, links to /tree (.mystrip) */}
      <Link
        href="/tree"
        className="mt-[14px] flex items-center justify-between gap-2.5 rounded-[12px] border border-st-line bg-st-card px-4 py-3 text-[13.5px] text-st-ink-2 transition-colors hover:border-st-line-2 hover:bg-st-card-2"
      >
        <span className="flex items-center gap-2.5">
          <BarChart3 className="size-[15px] shrink-0 text-[#c58b5f]" strokeWidth={2} />
          <span>
            <b className="font-bold text-st-ivory">{installed.length}</b> {stats.installed}
            {" · "}
            <b className="font-bold text-st-ivory">0</b> {stats.runs}
            {" · "}
            {stats.streakPrefix}
            <b className="font-bold text-st-ivory">{stats.streakValue}</b>
            {stats.streakSuffix}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {stats.myTree}
          <ArrowRight className="size-[14px]" />
        </span>
      </Link>

      {/* Get started — install your first skill */}
      <div className="mt-6">
        <GetStartedCard />
      </div>

      {/* Modules */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Layers className="size-[18px] text-st-ink-2" />
            <h2 className="text-[17px] font-bold tracking-[-0.01em] text-st-ivory">
              {t.hub.modules}
            </h2>
            <span className="text-[13px] text-st-ink-2">{t.hub.modulesSub}</span>
          </div>
          <Link
            href="/modules"
            className="shrink-0 text-[13px] text-st-ink-2 transition-colors hover:text-st-ivory"
          >
            {t.hub.allModules}
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((item) => (
            <ModuleCard key={item.href} module={item} />
          ))}
        </div>
      </section>

      {/* Fresh drops */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Sparkles className="size-[18px] text-st-ink-2" />
            <h2 className="text-[17px] font-bold tracking-[-0.01em] text-st-ivory">
              {t.hub.freshDrops}
            </h2>
            <span className="text-[13px] text-st-ink-2">{t.hub.newestSub}</span>
          </div>
          <Link
            href="/drops"
            className="shrink-0 text-[13px] text-st-ink-2 transition-colors hover:text-st-ivory"
          >
            {t.hub.seeAll(13)}
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(290px,1fr)]">
          <div className="flex flex-col gap-4">
            <NextDropBanner />
            <FeaturedDrop />
            <div className="grid gap-4 sm:grid-cols-2">
              {DROPS.map((drop) => (
                <DropCard key={drop.title} drop={drop} />
              ))}
            </div>
          </div>
          <HubAside />
        </div>
      </section>

      <p className="mt-16 text-center text-[12px] text-st-ink-3">{t.hub.liveFooter}</p>
    </div>
  );
}
