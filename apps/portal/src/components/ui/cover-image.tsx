"use client";

// CoverImage — capa de curso/mentoria/app.
// Renderiza a URL da imagem; sem URL (ou com erro de carregamento) cai num gradiente
// com as iniciais do título. `locked` aplica P&B + cadeado (PRD §10).
// Uso:
//   <CoverImage src={course.cover_url} title={course.title} />
//   <CoverImage src={null} title="Automação com IA" locked lockedLabel="Libera em 20 dias" />

import { useState } from "react";
import { Lock } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";

const GRADIENTS = [
  "bg-linear-to-br from-navy-700 via-navy-800 to-neutral-900",
  "bg-linear-to-br from-neutral-900 via-neutral-800 to-navy-800",
  "bg-linear-to-br from-navy-600 via-navy-800 to-navy-950",
  "bg-linear-to-br from-gold-300 to-gold-700",
  "bg-linear-to-br from-neutral-800 via-neutral-900 to-neutral-950",
];

const ASPECTS = {
  video: "aspect-video",
  wide: "aspect-[21/9]",
  portrait: "aspect-[3/4]",
  square: "aspect-square",
} as const;

function hashTitle(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function CoverImage({
  src,
  title,
  locked = false,
  lockedLabel,
  aspect = "video",
  className,
}: {
  src?: string | null;
  title: string;
  locked?: boolean;
  lockedLabel?: string;
  aspect?: keyof typeof ASPECTS;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const showImage = !!src && failedSrc !== src;
  const loaded = !!src && loadedSrc === src;
  const gradient = GRADIENTS[hashTitle(title) % GRADIENTS.length];

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-card bg-navy-950 shadow-card-sm ring-1 ring-border-subtle",
        ASPECTS[aspect],
        className
      )}
    >
      {/* Gradiente SEMPRE por baixo: enquanto a foto baixa, a capa já tem cara
          (iniciais + gradiente) em vez de um retângulo vazio; a foto entra por
          cima num fade. Cache quente (img.complete) marca carregada na hora. */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center",
          gradient,
          locked && "grayscale"
        )}
      >
        <span className="select-none text-4xl font-bold tracking-tight text-white/85">
          {getInitials(title)}
        </span>
      </div>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={title}
          onError={() => setFailedSrc(src)}
          onLoad={() => setLoadedSrc(src)}
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0) setLoadedSrc(src);
          }}
          className={cn(
            "relative h-full w-full object-cover object-center transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
            locked && "grayscale"
          )}
        />
      ) : null}
      {locked && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-navy-950/60">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
            <Lock className="h-5 w-5 text-white" />
          </div>
          {lockedLabel && (
            <span className="rounded-full bg-navy-950/70 px-3 py-1 text-xs font-semibold text-white">
              {lockedLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
