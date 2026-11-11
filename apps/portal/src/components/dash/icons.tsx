import type { ReactNode } from "react";

/** Lucide-style inline icon set (paths traced from the exposed source). */
export type IconKey =
  | "dollar"
  | "users"
  | "target"
  | "click"
  | "eye"
  | "repeat"
  | "trend"
  | "grid"
  | "mega"
  | "clock"
  | "check"
  | "alert"
  | "send"
  | "reply"
  | "play"
  | "file"
  | "heart"
  | "shield"
  | "zap"
  | "bank"
  | "terminal";

const PATHS: Record<IconKey, ReactNode> = {
  dollar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.3a2.4 2.4 0 0 0-2.1-1.1c-1.4 0-2.4.8-2.4 1.9 0 2.6 5 1.2 5 3.8 0 1.1-1 1.9-2.6 1.9a2.8 2.8 0 0 1-2.4-1.2" />
      <path d="M12 6.5v11" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  click: (
    <>
      <path d="M9 9l10 4-4.2 1.8L13 19z" />
      <path d="M5 5l1.5 1.5" />
      <path d="M11 3v2" />
      <path d="M3 11h2" />
      <path d="M5.6 16.4 7 15" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17l6-6 4 4 7-7" />
      <path d="M14 8h6v6" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  mega: <path d="M3 11l18-7-4 14-5.5-3.5L8 18l-1-4z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  alert: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v4" />
      <path d="M12 18h.01" />
    </>
  ),
  send: (
    <>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </>
  ),
  reply: (
    <>
      <path d="M9 17l-5-5 5-5" />
      <path d="M4 12h11a5 5 0 0 1 5 5v3" />
    </>
  ),
  play: <path d="M8 5l12 7-12 7V5z" />,
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </>
  ),
  heart: (
    <path d="M19 14c1.5-1.5 3-3.3 3-5.5A4.5 4.5 0 0 0 17.5 4c-1.7 0-3 .8-4 2-1-1.2-2.3-2-4-2A4.5 4.5 0 0 0 5 8.5c0 2.2 1.5 4 3 5.5l4 4z" />
  ),
  shield: <path d="M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10z" />,
  zap: <path d="M13 2L3 14h7l-1 8 10-12h-7z" />,
  bank: (
    <>
      <path d="M3 9l9-6 9 6" />
      <path d="M4 9v11" />
      <path d="M20 9v11" />
      <path d="M8 13v4" />
      <path d="M12 13v4" />
      <path d="M16 13v4" />
      <path d="M2 20h20" />
    </>
  ),
  terminal: (
    <>
      <path d="M4 17l6-6-6-6" />
      <path d="M12 19h8" />
    </>
  ),
};

export function Ic({ name, className }: { name: IconKey; className?: string }) {
  return (
    <svg className={`ic ${className ?? ""}`.trim()} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export type ChipVariant = "active" | "learning" | "fatigue" | "paused" | "quality" | "qavg";

export function Chip({ label, variant }: { label: string; variant: ChipVariant }) {
  return <span className={`chip ${variant}`}>{label}</span>;
}
