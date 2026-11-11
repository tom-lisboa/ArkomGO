// Badge — átomo ARKOM em dois momentos:
//   • badge mono (papéis por variante) — momento monospace: text-3xs uppercase tracking-widest.
//     Uso: <Badge variant="gold-dim">Admin</Badge>
//   • modo status (pill DM Sans sentence-case SEM borda + dot) — para tabelas.
//     Uso: <Badge status="success" dot>Publicado</Badge>

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "neutral"
  | "orange" // alias legado de gold-dim
  | "gold-dim"
  | "success"
  | "warning"
  | "danger"
  | "outline"
  | "ribbon"
  | "eyebrow";

export type BadgeTone =
  | "neutral"
  | "navy"
  | "gold"
  | "success"
  | "warning"
  | "danger"
  | "info";

// momento monospace: text-3xs (10) uppercase tracking-widest (.1em), peso teto medium.
const MONO_BASE =
  "inline-flex items-center gap-1 rounded-chip px-[10px] py-1 font-mono text-3xs font-medium uppercase tracking-widest";

const VARIANTS: Record<BadgeVariant, string> = {
  // neutral: tag sem cor — só a borda forte
  default: `${MONO_BASE} border border-border-strong text-secondary`,
  neutral: `${MONO_BASE} border border-border-strong text-secondary`,
  // gold-dim: destaque assinatura
  "gold-dim": `${MONO_BASE} border border-accent/30 bg-accent/12 text-gold-700`,
  orange: `${MONO_BASE} border border-accent/30 bg-accent/12 text-gold-700`,
  success: `${MONO_BASE} border border-green-200 bg-success-subtle text-green-700`,
  warning: `${MONO_BASE} border border-amber-200 bg-warning-subtle text-amber-700`,
  danger: `${MONO_BASE} border border-danger/35 bg-danger-subtle text-red-700`,
  outline: `${MONO_BASE} border border-border text-secondary`,
  // ribbon: o único badge com glow — bg-ribbon-bg + shadow-glow-gold-strong, tracking próprio
  ribbon:
    "inline-flex items-center gap-1 rounded-full px-chip-x py-[5px] font-mono text-3xs font-medium uppercase tracking-[1.2px] bg-ribbon-bg text-white shadow-glow-gold-strong",
  // eyebrow: casca preta 5%/10% + dot 6px bg-accent (injetado abaixo) — mono text-2xs
  eyebrow:
    "inline-flex items-center gap-[6px] rounded-full border border-eyebrow-border bg-eyebrow-bg px-chip-x py-chip-y font-mono text-2xs font-medium uppercase tracking-widest text-secondary",
};

// modo status — pill DM Sans sentence-case sem borda: casca + cor do dot (bullet saturado da família)
const STATUS_TONES: Record<BadgeTone, { pill: string; dot: string }> = {
  neutral: { pill: "bg-neutral-100 text-neutral-600", dot: "bg-neutral-400" },
  navy: { pill: "bg-navy-50 text-navy-700", dot: "bg-navy-500" },
  gold: { pill: "bg-accent-subtle text-gold-700", dot: "bg-gold-500" },
  success: { pill: "bg-success-subtle text-green-700", dot: "bg-green-500" },
  warning: { pill: "bg-warning-subtle text-amber-800", dot: "bg-amber-500" },
  danger: { pill: "bg-danger-subtle text-red-700", dot: "bg-red-500" },
  info: { pill: "bg-info-subtle text-info-text", dot: "bg-blue-500" },
};

// cor padrão do dot por variante mono (quando dot={true})
const VARIANT_DOT: Record<BadgeVariant, string> = {
  default: "bg-neutral-400",
  neutral: "bg-neutral-400",
  "gold-dim": "bg-gold-500",
  orange: "bg-gold-500",
  success: "bg-green-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  outline: "bg-neutral-400",
  ribbon: "bg-white",
  eyebrow: "bg-accent",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** modo status: pill DM Sans sentence-case SEM borda + dot (tabelas). Define o tom. */
  status?: BadgeTone;
  /** dot 6px opcional; `true` = cor por status/variante, ou um tom específico. */
  dot?: boolean | BadgeTone;
  /** pisca o dot (presença ao vivo). */
  pulse?: boolean;
}

export function Badge({
  variant = "default",
  status,
  dot,
  pulse,
  className,
  children,
  ...props
}: BadgeProps) {
  const dotColor =
    typeof dot === "string"
      ? STATUS_TONES[dot].dot
      : status
        ? STATUS_TONES[status].dot
        : VARIANT_DOT[variant];

  const dotEl = (
    <span
      className={cn("size-[6px] shrink-0 rounded-full", dotColor, pulse && "animate-pulse")}
      aria-hidden="true"
    />
  );

  // modo status — pill sentence-case (DM Sans), sem borda, dot on por padrão
  if (status) {
    const showDot = dot !== false;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-[6px] rounded-full px-[10px] py-1 font-sans text-xs font-medium",
          STATUS_TONES[status].pill,
          className
        )}
        {...props}
      >
        {showDot && dotEl}
        {children}
      </span>
    );
  }

  // modo badge (mono). eyebrow tem dot embutido; demais só quando `dot` é pedido.
  const showDot = variant === "eyebrow" || (dot !== undefined && dot !== false);

  return (
    <span className={cn(VARIANTS[variant], className)} {...props}>
      {showDot && dotEl}
      {children}
    </span>
  );
}
