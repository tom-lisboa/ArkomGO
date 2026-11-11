"use client";

import { useEffect, useState } from "react";

/** row do banco (app_arkom.solution_previews) por solution slug. */
export type SolutionPreviewRow = {
  preview_url: string | null;
  remix_url: string | null;
};
export type SolutionPreviews = Record<string, SolutionPreviewRow>;

// cache de módulo: uma única chamada para /api/map/previews por sessão de página.
let cache: SolutionPreviews | null = null;
let inflight: Promise<SolutionPreviews> | null = null;

async function load(): Promise<SolutionPreviews> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/map/previews", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j: SolutionPreviews) => {
        cache = j ?? {};
        return cache;
      })
      .catch(() => {
        cache = {};
        return cache;
      });
  }
  return inflight;
}

/** Lê os previews/remix do BANCO (reativo ao admin). Enquanto carrega, retorna {};
 *  o consumidor deve dar fallback ao seed hardcoded quando não houver row. */
export function useSolutionPreviews(): SolutionPreviews {
  const [previews, setPreviews] = useState<SolutionPreviews>(cache ?? {});
  useEffect(() => {
    let alive = true;
    load().then((p) => {
      if (alive) setPreviews(p);
    });
    return () => {
      alive = false;
    };
  }, []);
  return previews;
}
