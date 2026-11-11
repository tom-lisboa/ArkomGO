"use client";

// StarRating — 1 a 5 estrelas, controlado.
// Interativo: <StarRating value={rating} onChange={setRating} />
// Somente leitura (médias): <StarRating value={4.3} readOnly size="sm" />
// Cores: tokens que flipam por tema (--arkom-gold / st-line-2). Não usar o
// `accent` do shadcn (é cinza de superfície — some no dark) nem neutral-* cru
// (fixo, não acompanha o tema).

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" } as const;

export function StarRating({
  value,
  onChange,
  readOnly = false,
  size = "md",
  className,
}: {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [hovered, setHovered] = useState(0);
  const interactive = !readOnly && !!onChange;
  const display = interactive && hovered > 0 ? hovered : Math.round(value);

  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      role={interactive ? "radiogroup" : "img"}
      aria-label={`${value.toFixed(1).replace(".", ",")} de 5 estrelas`}
      onMouseLeave={() => setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= display;
        const StarEl = (
          <Star
            className={cn(
              SIZES[size],
              "transition-colors",
              filled
                ? "fill-[var(--arkom-gold)] text-[var(--arkom-gold)]"
                : "fill-st-line-2 text-st-line-2"
            )}
          />
        );
        if (!interactive) return <span key={star}>{StarEl}</span>;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={star === Math.round(value)}
            aria-label={`${star} ${star === 1 ? "estrela" : "estrelas"}`}
            className="cursor-pointer rounded transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-focus-ring"
            onMouseEnter={() => setHovered(star)}
            onClick={() => onChange?.(star)}
          >
            {StarEl}
          </button>
        );
      })}
    </div>
  );
}
