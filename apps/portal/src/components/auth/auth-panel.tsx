import type { LucideIcon } from "lucide-react";

export function AuthPanel({
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section
      className="relative w-full overflow-hidden rounded-[14px] border border-st-sidebar-line text-st-ivory"
      style={{
        background: "var(--st-sidebar-glass)",
        backdropFilter: "blur(24px) saturate(1.2)",
        WebkitBackdropFilter: "blur(24px) saturate(1.2)",
        boxShadow: "var(--st-shadow)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 70% 100% at 50% 0%, var(--st-card-2), transparent 72%)",
        }}
      />

      <header className="relative border-b border-st-line px-6 pb-5 pt-6 sm:px-7 sm:pt-7">
        <div className="flex items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-[11px] border border-st-line-2 bg-st-card-2 text-st-ivory">
            <Icon aria-hidden className="size-[17px]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-st-ink-3">
              {eyebrow}
            </p>
            <h1 className="mt-2 font-display text-[26px] font-normal leading-tight tracking-[0.04em] text-st-ivory">
              {title}
            </h1>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-st-ink-2">
              {description}
            </p>
          </div>
        </div>
      </header>

      <div className="relative px-6 py-6 sm:px-7">{children}</div>
    </section>
  );
}
