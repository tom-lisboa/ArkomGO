import type { InputHTMLAttributes, ReactNode } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export const authLinkClass =
  "font-semibold text-st-ink-2 underline-offset-4 transition-colors hover:text-st-ivory hover:underline";

export function AuthInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-[10px] border border-st-line-2 bg-st-card px-3.5 text-[14px] text-st-ivory outline-none transition-colors",
        "placeholder:text-st-ink-3 hover:border-st-sidebar-line focus:border-st-ivory/30 focus:bg-st-card-2",
        "disabled:cursor-not-allowed disabled:text-st-ink-3",
        className,
      )}
      {...props}
    />
  );
}

export function AuthField({
  label,
  htmlFor,
  aside,
  children,
}: {
  label: string;
  htmlFor: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[12px] font-medium text-st-ink-2">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  );
}

export function AuthSubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-[10px] bg-st-ivory px-4 text-[13px] font-bold text-st-bg transition-all hover:-translate-y-px hover:shadow-[var(--st-elev-lift)] active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55"
    >
      {children}
    </button>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-[10px] border border-red-400/30 bg-red-500/10 px-3.5 py-3 text-[12.5px] leading-relaxed text-red-300"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function AuthSuccess({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-st-line-2 bg-st-card p-5 text-center">
      <span className="mx-auto grid size-10 place-items-center rounded-full border border-st-line-2 bg-st-card-2 text-st-ivory">
        <CircleCheck aria-hidden className="size-[18px]" />
      </span>
      <div className="mt-3">{children}</div>
    </div>
  );
}
