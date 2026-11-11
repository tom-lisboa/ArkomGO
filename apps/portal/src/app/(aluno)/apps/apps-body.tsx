"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Lock, PackageOpen } from "lucide-react";

import "../trainings/trainings.css";
import { useT } from "@/lib/i18n";
import type { StudentApp } from "@/components/apps/data";
import { APP_SECTORS, SECTOR_FALLBACK } from "@/components/apps/sectors";

/**
 * /apps — grid de apps publicados + pills de filtro por SETOR do mapa (as
 * áreas de skilltree-data: Back Office, Clientes, Produto, Marketing, Vendas,
 * Inteligência — via sectors.ts). Clicar num app disponível abre a TELA
 * INTERNA (/apps/[id]) com vídeo, avaliação, ferramentas e acesso; apps
 * "em breve" ficam travados/desabilitados. Substitui o mock SOLUTIONS.
 */
export function AppsBody({ apps }: { apps: StudentApp[] }) {
  const t = useT();
  const [slug, setSlug] = useState<string>("all");

  // Pills = "Todos" + só os setores do mapa que têm app publicado, na ordem
  // das áreas do mapa; "Outros" por último quando algum título não casa.
  const chips = useMemo(() => {
    const present = new Set(apps.map((a) => a.sector));
    const sectors = [...APP_SECTORS, SECTOR_FALLBACK].filter((s) =>
      present.has(s.slug),
    );
    return [
      { slug: "all", name: t.apps.all, color: null as string | null },
      ...sectors,
    ];
  }, [apps, t.apps.all]);

  const items = apps.filter((a) => slug === "all" || a.sector === slug);

  return (
    <div className="w-full pb-20">
      <header className="mb-8">
        <h1 className="text-[27px] font-bold leading-none tracking-[-0.02em] text-st-ivory">
          {t.apps.title}
        </h1>
        <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-st-ink-2">
          {t.apps.sub}
        </p>
      </header>

      {/* filter pills — setores do mapa, com o acento da área; pill ativa acesa */}
      {chips.length > 1 ? (
        <div className="mb-8 flex flex-wrap gap-2">
          {chips.map((c) => {
            const on = slug === c.slug;
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => setSlug(c.slug)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  on
                    ? "border-st-line-2 bg-st-ivory text-st-bg"
                    : "border-st-line bg-st-card text-st-ink-2 hover:bg-st-card-2 hover:text-st-ivory"
                }`}
                style={on ? { boxShadow: "var(--st-elev-bevel), 0 10px 26px -14px #18181b66" } : undefined}
              >
                {c.color ? (
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color, opacity: on ? 0.9 : 0.75 }}
                  />
                ) : null}
                {c.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <span className="mb-4 flex size-14 items-center justify-center rounded-[18px] border border-st-line-2 bg-st-card text-st-ink-2">
            <PackageOpen className="size-6" strokeWidth={1.8} />
          </span>
          <p className="text-[15px] font-semibold text-st-ivory">
            {t.apps.title}
          </p>
          <p className="mt-2 max-w-[420px] text-[13.5px] leading-relaxed text-st-ink-2">
            {t.apps.sub}
          </p>
        </div>
      ) : (
        /* grid — 3 cols, media + name + CTA "Acessar" (disponível) ou "Em breve" */
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => {
            const live = s.available;
            const cardCls = `cap-elev-sm block overflow-hidden rounded-[14px] border border-st-line-2 bg-st-card transition-transform ${
              live ? "hover:-translate-y-0.5" : "opacity-80"
            }`;
            const body = (
              <>
                {/* media — capa real quando houver; senão superfície token-glow */}
                <div
                  className="relative flex h-[168px] items-center justify-center overflow-hidden border-b border-st-line"
                  style={{
                    backgroundImage: s.coverUrl
                      ? undefined
                      : `radial-gradient(120% 100% at 50% 0%, ${s.accent}${live ? "26" : "14"} 0%, transparent 62%)`,
                  }}
                >
                  {s.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.coverUrl}
                      alt={s.name}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ opacity: live ? 1 : 0.5 }}
                    />
                  ) : (
                    <span
                      className="px-4 text-center text-[26px] font-[650] leading-tight tracking-[-0.02em]"
                      style={{ color: s.accent, opacity: live ? 0.95 : 0.4 }}
                    >
                      {s.name}
                    </span>
                  )}
                  {!live ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-st-bg/40">
                      <span className="flex items-center gap-2 rounded-full border border-st-line bg-st-card-2 px-3.5 py-1.5 text-[11px] font-bold text-st-ink-2 backdrop-blur-md">
                        <Lock className="size-3.5" /> {t.apps.soon}
                      </span>
                    </span>
                  ) : null}
                </div>

                <div className="p-5">
                  <div className="flex items-center gap-2">
                    <p className="text-[15px] font-[650] tracking-[-0.01em] text-st-ivory">{s.name}</p>
                    <span className="ml-auto shrink-0 rounded-full border border-st-line bg-st-card-2 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-st-ink-3">
                      {s.categoryName}
                    </span>
                  </div>
                  <p className="mt-1 min-h-[36px] text-[12.5px] leading-relaxed text-st-ink-2 line-clamp-2">
                    {s.strap}
                  </p>
                  {live ? (
                    <span className="cap-btn-p mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] bg-st-ivory px-4 py-2.5 text-[13px] font-bold text-st-bg">
                      {t.apps.details} <ArrowUpRight className="size-4" />
                    </span>
                  ) : (
                    <span className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] border border-st-line px-4 py-2.5 text-[13px] font-bold text-st-ink-3">
                      <Lock className="size-3.5" /> {t.apps.soon}
                    </span>
                  )}
                </div>
              </>
            );
            return live ? (
              <Link key={s.id} href={`/apps/${s.id}`} className={cardCls}>
                {body}
              </Link>
            ) : (
              <div key={s.id} className={cardCls}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
