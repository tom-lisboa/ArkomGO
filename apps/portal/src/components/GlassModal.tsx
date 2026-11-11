"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useTheme } from "@/lib/theme";

interface GlassModalProps {
  onClose: () => void;
  /** small copper eyebrow / badge — 10px / 700 / .2em. */
  eyebrow?: ReactNode;
  /** main header title. */
  title?: ReactNode;
  /** optional element next to the title (e.g. a "≈10 min" pill). */
  badge?: ReactNode;
  /** optional element on the right of the header, left of the X (e.g. Copy). */
  headerRight?: ReactNode;
  /** optional full-width row under the header (e.g. a progress bar). */
  headerExtra?: ReactNode;
  /** optional sticky footer (e.g. wizard nav). */
  footer?: ReactNode;
  maxWidth?: number;
  /** padding wrapper for the body; pass "" to control padding yourself. */
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * The one canonical modal shell for the whole app (Item 4). Backdrop blur, glass
 * card, header (eyebrow + title + X), optional progress row and footer, Esc / X /
 * click-outside close, portaled to <body> so transformed ancestors never clip it.
 * Content lives in the slots — only the casing is shared, so every modal reads as
 * one component (radius, border, header type, behavior).
 */
export function GlassModal({
  onClose,
  eyebrow,
  title,
  badge,
  headerRight,
  headerExtra,
  footer,
  maxWidth = 520,
  bodyClassName = "px-5 py-4",
  children,
}: GlassModalProps) {
  const { theme } = useTheme();
  const light = theme === "light";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center p-5"
      style={{
        background: light ? "rgba(15,17,22,.44)" : "rgba(6,7,10,.66)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[calc(100vh-56px)] w-full flex-col overflow-hidden rounded-[14px] text-st-ivory"
        style={{
          maxWidth,
          background: light ? "#ffffff" : "rgba(16,20,29,.98)",
          border: light ? "1px solid rgba(24,24,27,.12)" : "1px solid rgba(233,228,214,.14)",
          boxShadow: light ? "0 40px 100px -28px rgba(24,24,27,.22)" : "0 40px 100px -28px rgba(0,0,0,.8)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: light ? "1px solid rgba(24,24,27,.1)" : "1px solid rgba(233,228,214,.1)" }}
        >
          <div className="flex min-w-0 flex-col gap-1">
            {/* card DNA — c-state eyebrow (copper 11px/.18em) + c-name title (26px/.04em) */}
            {eyebrow ? (
              <div className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#c58b5f]">
                {eyebrow}
              </div>
            ) : null}
            {title ? (
              <div className="flex flex-wrap items-center gap-2 text-[26px] font-normal leading-tight tracking-[0.04em] text-st-ivory">
                {title}
                {badge}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-[30px] place-items-center rounded-full border border-st-line-2 text-st-ink-2 transition-colors hover:text-st-ivory"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {headerExtra}

        <div className={`map-scroll flex-1 overflow-auto ${bodyClassName}`}>{children}</div>

        {footer ? (
          <div className="px-5 py-4" style={{ borderTop: light ? "1px solid rgba(24,24,27,.1)" : "1px solid rgba(233,228,214,.1)" }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
