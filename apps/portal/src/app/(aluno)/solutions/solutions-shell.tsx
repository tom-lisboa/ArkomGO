"use client";

// solutions-shell.tsx — chrome da dash dedicada de Soluções
// (ARKOM_APP_MODE=solutions). Headbar no padrão do MAPA (MapTopbar/DashTopbar):
// tabs glass centralizadas com pill ativa — aqui SOLUÇÕES | PAINÉIS, já que
// MAP/CHART não existem neste deploy. Esquerda: logo; direita: conta + sair.

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ArkomLogo } from "@/components/ArkomLogo";
import { navTab } from "@/lib/content-pt";
import { useLocale, useT } from "@/lib/i18n";
import { usePlan } from "@/lib/plan";

const TABS = [
  { label: "SOLUTIONS", href: "/solutions" },
  { label: "DASHBOARDS", href: "/dash" },
];

const glass = {
  background: "var(--st-glass)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  border: "1px solid var(--st-line)",
} as const;

export function SolutionsShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { email, logout } = usePlan();
  const { locale } = useLocale();
  const t = useT();

  return (
    <div className="min-h-screen">
      <header className="relative flex h-[64px] items-center justify-between px-4 sm:px-6">
        {/* left: logo */}
        <span className="flex items-center gap-[9px] text-st-ivory">
          <ArkomLogo size={19} />
        </span>

        {/* center: tabs no padrão do mapa — pill ativa ivory */}
        <nav
          className="flex items-center gap-0.5 rounded-[9px] p-0.5 sm:absolute sm:left-1/2 sm:-translate-x-1/2"
          style={glass}
        >
          {TABS.map((tab) => {
            const active = tab.label === "SOLUTIONS";
            return active ? (
              <span
                key={tab.label}
                aria-current="page"
                className="rounded-[6px] px-2.5 py-1.5 text-[10px] font-bold tracking-[0.18em] text-st-bg sm:px-4"
                style={{ background: "var(--st-ivory)", color: "var(--st-bg)" }}
              >
                {navTab(locale, tab.label)}
              </span>
            ) : (
              <Link
                key={tab.label}
                href={tab.href}
                className="rounded-[6px] px-2.5 py-1.5 text-[10px] font-bold tracking-[0.18em] text-st-ink-2 transition-colors hover:text-st-ivory sm:px-4"
              >
                {navTab(locale, tab.label)}
              </Link>
            );
          })}
        </nav>

        {/* right: conta + sair */}
        <span className="flex min-w-0 items-center gap-3">
          {email ? (
            <span className="hidden max-w-[220px] truncate text-[12.5px] text-st-ink-2 sm:block">
              {email}
            </span>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.replace("/login");
              router.refresh();
            }}
            className="rounded-[9px] px-3 py-1.5 text-[12px] font-semibold text-st-ivory transition-colors hover:bg-st-card"
            style={glass}
          >
            {t.shell.logout}
          </button>
        </span>
      </header>
      <main className="px-4 pb-6 sm:px-8">
        <div className="mx-auto w-full max-w-[1360px]">{children}</div>
      </main>
    </div>
  );
}
