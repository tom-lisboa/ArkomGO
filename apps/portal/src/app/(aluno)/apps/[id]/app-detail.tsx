"use client";

// Tela interna do app (/apps/[id]) — "copia" a página da solução do
// bilhon-solutions, no DS steel do arkom: 2 colunas.
//   Esquerda: vídeo/tutorial + "Sobre este app" + descrição.
//   Direita (sticky): botão de acesso/remix + "Sua avaliação" (estrelas +
//   média da comunidade) + card "Ferramentas necessárias".

import { useTransition, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, KeyRound, Lock, Star } from "lucide-react";

import type { StudentAppDetail } from "@/components/apps/data";
import { AppRating } from "@/components/apps/app-rating";
import { resolveSolutionKeys, countRequired, type ToolRequirement } from "@/lib/app-keys";
import { registerClick } from "../actions";

/** Normalização copiada do player (YouTube → /embed/). */
function youtubeEmbedUrl(url: string): string {
  if (!url) return url;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{6,})/,
    /(?:youtu\.be\/)([\w-]{6,})/,
    /(?:youtube\.com\/shorts\/)([\w-]{6,})/,
    /(?:youtube\.com\/embed\/)([\w-]{6,})/,
  ];
  for (const re of patterns) {
    const match = url.match(re);
    if (match) return `https://www.youtube.com/embed/${match[1]}`;
  }
  return url;
}

/** Panda delivery (b-vz-*) → URL do player embed 16:9. */
function embedSrc(url: string): string {
  const panda = url.match(
    /^https?:\/\/b-vz-([\w-]+)\.tv\.pandavideo\.com\.br\/([0-9a-fA-F-]{36})/
  );
  if (panda) {
    return `https://player-vz-${panda[1]}.tv.pandavideo.com.br/embed/?v=${panda[2]}`;
  }
  return youtubeEmbedUrl(url);
}

const REQ_LABEL: Record<ToolRequirement, string> = {
  required: "Obrigatória",
  optional: "Opcional",
  alternative: "Alternativa",
};

const REQ_BADGE: Record<ToolRequirement, string> = {
  required: "border-[#c58b5f]/40 bg-[#c58b5f]/14 text-[#dcc279]",
  optional: "border-st-line-2 text-st-ink-2",
  alternative: "border-st-line-2 bg-st-card-2 text-st-ink-2",
};

export function AppDetail({
  app,
  userRating,
}: {
  app: StudentAppDetail;
  userRating: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const keys = resolveSolutionKeys(app.name);
  const required = countRequired(keys.tools);

  function openApp() {
    if (!app.available) return;
    // sem "noopener" na feature string — com ela o retorno é SEMPRE null e o
    // fallback abaixo navegava a aba atual além da nova; opener cortado na mão.
    const win = app.redirectUrl ? window.open(app.redirectUrl, "_blank") : null;
    if (win) win.opener = null;
    setErr(null);
    startTransition(async () => {
      const res = await registerClick(app.id);
      if (res.ok) {
        if (!win) window.location.href = res.redirectUrl;
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="w-full pb-20">
      {/* voltar */}
      <Link
        href="/apps"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-st-ink-2 transition-colors hover:text-st-ivory"
      >
        <ArrowLeft className="size-4" /> Voltar para Apps
      </Link>

      {/* header */}
      <header className="mb-8">
        <h1 className="text-[27px] font-bold leading-tight tracking-[-0.02em] text-st-ivory">
          {app.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-[#c58b5f]/30 bg-[#c58b5f]/12 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#dcc279]">
            {app.categoryName}
          </span>
          {app.tagline ? (
            <p className="text-[15px] leading-relaxed text-st-ink-2">{app.tagline}</p>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ---- Esquerda: vídeo + sobre ---- */}
        <div className="flex flex-col gap-6">
          {app.videoUrl ? (
            <div
              className="relative aspect-video w-full overflow-hidden rounded-[14px] border border-st-line-2 bg-black"
              style={{ boxShadow: "var(--st-elev-bevel), var(--st-elev-rest)" }}
            >
              <iframe
                src={embedSrc(app.videoUrl)}
                title={`Aula — ${app.name}`}
                className="absolute inset-0 h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-[14px] border border-st-line-2 bg-st-card text-sm text-st-ink-3">
              Aula em breve
            </div>
          )}

          {app.description ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-st-ivory">Sobre este app</h2>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-st-ink-2">
                {app.description}
              </p>
            </section>
          ) : null}
        </div>

        {/* ---- Direita: CTA + avaliação + ferramentas ---- */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start">
          {/* card CTA + avaliação */}
          <div
            className="cap-elev-sm flex flex-col gap-5 rounded-[14px] border border-st-line-2 bg-st-card p-5"
          >
            {app.available ? (
              <button
                type="button"
                onClick={openApp}
                disabled={pending}
                className="cap-btn-p flex w-full items-center justify-center gap-2 rounded-[10px] bg-st-ivory px-4 py-3 text-[14px] font-bold text-st-bg disabled:opacity-60"
              >
                {app.buttonLabel} <ArrowUpRight className="size-4" />
              </button>
            ) : (
              <span className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-st-line px-4 py-3 text-[14px] font-bold text-st-ink-3">
                <Lock className="size-4" /> Em breve
              </span>
            )}
            {err ? <p className="text-xs text-red-400">{err}</p> : null}

            <div className="border-t border-st-line pt-4">
              <h2 className="mb-2 text-sm font-semibold text-st-ivory">Sua avaliação</h2>
              <AppRating appId={app.id} initialRating={userRating} />
            </div>

            {app.avgRating != null && app.ratingCount > 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-st-ink-2">
                <Star className="size-3.5 fill-[#dcc279] text-[#dcc279]" />
                Média da comunidade:{" "}
                <span className="font-semibold text-st-ivory">
                  {app.avgRating.toFixed(1).replace(".", ",")}
                </span>{" "}
                ({app.ratingCount} {app.ratingCount === 1 ? "avaliação" : "avaliações"})
              </p>
            ) : null}
          </div>

          {/* card Ferramentas necessárias */}
          <div className="cap-elev-sm flex flex-col gap-4 rounded-[14px] border border-st-line-2 bg-st-card p-5">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-st-ivory">
                <KeyRound className="size-4 text-st-ink-3" /> Ferramentas necessárias
              </h2>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-st-ink-3">
                {required} obrigatória{required === 1 ? "" : "s"} · {keys.tools.length} no total
              </p>
            </div>
            <ul className="flex flex-col divide-y divide-st-line">
              {keys.tools.map((tool) => (
                <li key={tool.name} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-st-ivory">{tool.name}</p>
                    {tool.note ? (
                      <p className="text-[11.5px] text-st-ink-3">{tool.note}</p>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] ${REQ_BADGE[tool.requirement]}`}
                  >
                    {REQ_LABEL[tool.requirement]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
