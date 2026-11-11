import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ArkomLogo } from "@/components/ArkomLogo";
import { AuthControls } from "@/components/auth/auth-controls";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-st-bg text-st-ivory">
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[image:var(--st-haze)]" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(var(--st-line-2) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "linear-gradient(to bottom, black, transparent 78%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 78%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-[42%] size-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-st-line opacity-45"
      >
        <div
          className="absolute inset-[86px] rounded-full border border-st-line"
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1180px] flex-col px-5 py-5 sm:px-8 sm:py-7">
        <header className="flex items-center justify-between gap-4">
          <Link href="/login" aria-label="Arkom — acesso de membros">
            <ArkomLogo size={20} />
          </Link>
          <AuthControls />
        </header>

        <main className="flex flex-1 items-center justify-center py-10 sm:py-14">
          <div className="w-full max-w-[460px]">{children}</div>
        </main>

        <footer className="flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-st-ink-3">
          <ShieldCheck aria-hidden className="size-3.5" />
          <span>Acesso seguro · ambiente exclusivo Arkom</span>
        </footer>
      </div>
    </div>
  );
}
