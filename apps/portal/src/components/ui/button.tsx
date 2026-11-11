// Button — anatomia ARKOM · G4×ONE (02 §01).
// Dualidade de ação: `navy` (estrutural) · `accent` (gold, CTA). Sombra só no hover.
// uso: <Button variant="navy" size="md">Salvar</Button>  ·  <Button variant="accent">Agendar demo</Button>
// Para links com cara de botão: <Link className={buttonVariants({ variant: "outline" })}>
// Aliases de retrocompat: primary→navy · secondary→outline (call-sites migram na Onda C).

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "navy"
  | "accent"
  | "outline"
  | "ghost"
  | "danger"
  | "link"
  | "glass"
  | "pill"
  // aliases de retrocompat (não quebrar build antes da Onda C)
  | "primary"
  | "secondary";
export type ButtonSize = "sm" | "md" | "lg";

// radius + font-weight + cor + hover + disabled moram AQUI (uma só de cada — cn é join puro, sem tailwind-merge).
const VARIANTS: Record<ButtonVariant, string> = {
  // navy · ação estrutural: fundo navy-800, hover sobe p/ navy-700 + sombra navy, disabled opacity-40
  navy:
    "rounded-button font-medium bg-navy-800 text-white hover:-translate-y-px hover:bg-navy-700 hover:shadow-[0_8px_24px_-8px_rgb(0_31_53/0.35)] active:translate-y-0 disabled:opacity-40",
  // accent · gold CTA: sem sombra em repouso, hover glow dourado + bg-accent-hover
  accent:
    "rounded-button font-medium bg-accent text-on-accent hover:-translate-y-px hover:bg-accent-hover hover:shadow-glow-gold-strong active:translate-y-0 disabled:opacity-40",
  // outline · casca vazada: border-border-strong sem sombra em repouso; disabled REBAIXA border+text por token
  outline:
    "rounded-button font-medium border border-border-strong text-primary hover:-translate-y-px hover:bg-surface-hover active:translate-y-0 disabled:border-border disabled:text-disabled",
  // ghost · sem casca: só texto, hover ganha superfície
  ghost:
    "rounded-button font-medium text-secondary hover:bg-surface-hover hover:text-primary disabled:opacity-40",
  // danger · vermelho estrutural: sombra só no hover
  danger:
    "rounded-button font-medium bg-danger text-white hover:-translate-y-px hover:bg-red-600 hover:shadow-card active:translate-y-0 disabled:opacity-40",
  // link · texto puro (sem casca/padding): text-primary → hover text-link (gold-700)
  link: "text-sm font-medium text-primary hover:text-link disabled:opacity-40",
  // glass · sobre painel inverso #141414: pílula translúcida, ÚNICO peso semibold
  glass:
    "rounded-full font-semibold border border-white/32 bg-white/12 text-white backdrop-blur-[10px] hover:-translate-y-px hover:border-white/50 hover:bg-white/22 disabled:opacity-40",
  // pill · nav CTA compacto do accent: raio full + padding próprio (px-[18px] py-2)
  pill:
    "rounded-button-pill font-medium bg-accent text-on-accent px-[18px] py-2 text-sm hover:-translate-y-px hover:bg-accent-hover hover:shadow-glow-gold-strong active:translate-y-0 disabled:opacity-40",
  // ── aliases de retrocompat ──
  primary:
    "rounded-button font-medium bg-navy-800 text-white hover:-translate-y-px hover:bg-navy-700 hover:shadow-[0_8px_24px_-8px_rgb(0_31_53/0.35)] active:translate-y-0 disabled:opacity-40",
  secondary:
    "rounded-button font-medium border border-border-strong text-primary hover:-translate-y-px hover:bg-surface-hover active:translate-y-0 disabled:border-border disabled:text-disabled",
};

// Tamanho varia PADDING + corpo por token (não altura fixa). Escala não-linear: px 4=16 5=24 6=32 · py 2=8 3=12 4=16.
const SIZES: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-xs",
  md: "px-5 py-3 text-sm",
  lg: "px-6 py-4 text-base",
};

// pill e link carregam o próprio padding/corpo — não recebem o token de tamanho (evita padding duplicado).
const SELF_PADDED = new Set<ButtonVariant>(["pill", "link"]);

export function buttonVariants(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  const { variant = "primary", size = "md", className } = opts ?? {};
  return cn(
    "inline-flex items-center justify-center gap-2 font-sans tracking-wider",
    "transition-all duration-200 ease-out will-change-transform",
    "focus-visible:outline-none focus-visible:shadow-focus",
    "disabled:pointer-events-none",
    VARIANTS[variant],
    SELF_PADDED.has(variant) ? "" : SIZES[size],
    className
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
}
