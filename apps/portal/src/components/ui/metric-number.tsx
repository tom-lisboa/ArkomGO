// MetricNumber — o número-herói canônico do ARKOM (DS 03 §02).
// SEMPRE DM Sans (font-sans) + font-bold + leading-none, SEM tracking — nunca Manrope,
// nunca font-black. A tracking-display pertence só aos headlines Manrope, jamais ao número.
// `size`: 5xl (48px, padrão) ou 4xl (36px). `tone`: primary (ink) ou inverse (branco, painel #141414).
// Uso: <MetricNumber value="99.9%" /> · <MetricNumber value={`${pct}%`} size="4xl" tone="inverse" />

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  "4xl": "text-4xl",
  "5xl": "text-5xl",
} as const;

const TONE_CLASS = {
  primary: "text-primary",
  inverse: "text-white",
} as const;

export function MetricNumber({
  value,
  size = "5xl",
  tone = "primary",
  className,
}: {
  value: ReactNode;
  size?: keyof typeof SIZE_CLASS;
  tone?: keyof typeof TONE_CLASS;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-sans font-bold leading-none",
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className
      )}
    >
      {value}
    </span>
  );
}
