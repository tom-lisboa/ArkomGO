"use client";

import { Shell } from "@/components/Shell";
import { useT } from "@/lib/i18n";
import { ModulePath } from "@/components/modules/ModulePath";
import { ModuleRow } from "@/components/modules/ModuleRow";
import { MODULE_ENTRIES } from "@/components/modules/modules-data";

export default function ModulesPage() {
  const t = useT();
  return (
    <Shell>
      <div className="w-full">
        {/* Page header */}
        <header>
          <h1 className="text-[27px] font-bold leading-none tracking-[-0.02em] text-st-ivory">
            {t.modules.title}
            <span className="ml-2.5 align-baseline text-[15px] font-normal text-st-ink-2">
              {t.modules.subtitle}
            </span>
          </h1>
          <p className="mt-4 max-w-[760px] text-[15px] font-normal leading-relaxed text-st-ink-2">
            {t.modules.intro}
          </p>
        </header>

        {/* Build path stepper */}
        <ModulePath />

        {/* Module list */}
        <section className="mt-8 flex flex-col gap-4">
          {MODULE_ENTRIES.map((mod) => (
            <ModuleRow key={mod.href} module={mod} />
          ))}
        </section>
      </div>
    </Shell>
  );
}
