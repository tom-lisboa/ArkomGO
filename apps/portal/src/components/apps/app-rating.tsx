"use client";

// AppRating — "Sua avaliação" na tela interna do app. Estrelas interativas com
// atualização otimista + rollback; grava via rateApp (app_ratings). Sem toast
// provider (área do aluno não o monta) — confirmação inline discreta.

import { useState, useTransition } from "react";
import { StarRating } from "@/components/ui/star-rating";
import { rateApp } from "@/app/(aluno)/apps/actions";

export function AppRating({
  appId,
  initialRating,
}: {
  appId: number;
  initialRating: number | null;
}) {
  const [rating, setRating] = useState<number>(initialRating ?? 0);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleChange(value: number) {
    const prev = rating;
    setRating(value); // otimista
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await rateApp(appId, value);
      if (res.ok) {
        setSaved(true);
      } else {
        setRating(prev); // rollback
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <StarRating value={rating} onChange={handleChange} size="lg" />
      <p className="text-xs text-st-ink-2">
        {error
          ? error
          : saved
            ? "Avaliação registrada!"
            : rating > 0
              ? "Toque nas estrelas para alterar a sua avaliação."
              : "Avalie este app de 1 a 5 estrelas."}
      </p>
    </div>
  );
}
