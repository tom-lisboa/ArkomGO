"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Brain,
  CalendarDays,
  GitBranch,
  GraduationCap,
  Home,
  Layers,
  LayoutGrid,
  LifeBuoy,
  Lock,
  Map,
  Menu,
  MessagesSquare,
  Moon,
  Sparkles,
  Sun,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ArkomLogo } from "@/components/ArkomLogo";
import { SupportModal } from "@/components/SupportModal";
import { ARKOM_DEMO_PLAN_ENABLED, usePlan } from "@/lib/plan";
import { useLocale, useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import type { IconType } from "@/lib/hub-data";
import type { Dict } from "@/lib/i18n/en";

interface NavItem {
  key?: keyof Dict["shell"]["nav"];
  /** rótulo fixo (quando não vem do dicionário i18n, ex.: Genesis) */
  label?: string;
  href: string;
  icon: IconType;
  badge?: string;
  /** rota ainda não liberada — link desativado (cadeado) + rota mostra "Em breve" */
  locked?: boolean;
}

const NAV: NavItem[] = [
  { key: "inicio", href: "/home", icon: Home },
  { key: "map", href: "/map", icon: Map },
  { key: "apps", href: "/apps", icon: LayoutGrid },
  // "Soluções" saiu do app: a roda vive na dash dedicada
  // (deploy ARKOM_APP_MODE=solutions) — ver lib/app-mode.ts.
  { label: "Genesis", href: "/genesis", icon: Sparkles },
  { label: "Gestor IA", href: "/consultor", icon: MessagesSquare },
  { key: "mentorias", href: "/mentorships", icon: CalendarDays },
  { key: "capacitacoes", href: "/trainings", icon: GraduationCap },
  { key: "myAccount", href: "/settings", icon: UserRound },
  // itens travados (cadeado · "Em breve") — ocultos da barra, mas o guard de
  // rota direta (lockedItem) continua ativo.
  { key: "hub", href: "/hub", icon: LayoutGrid, badge: "13", locked: true },
  { key: "modules", href: "/modules", icon: Layers, locked: true },
  { key: "myTree", href: "/tree", icon: GitBranch, locked: true },
  { key: "brain", href: "/brain", icon: Brain, locked: true },
  { key: "community", href: "/community", icon: Users, locked: true },
];

/** rotas travadas — o Shell mostra "Em breve" no lugar do conteúdo (pega URL direta). */
const DEMO_NAV: NavItem[] = [
 {label:"Início",href:"/demo",icon:Home},
 {label:"Mapa",href:"/demo/map",icon:Map},
 {label:"Ferramentas",href:"/demo/tools",icon:LayoutGrid},
 {label:"Genesis",href:"/demo/genesis",icon:Sparkles},
 {label:"Seu negócio",href:"/demo/business",icon:Brain},
 {label:"Seu time",href:"/demo/team",icon:Users},
 {label:"Automações",href:"/demo/automations",icon:GitBranch},
 {label:"Execuções",href:"/demo/executions",icon:Layers},
];
const LOCKED_HREFS = NAV.filter((n) => n.locked).map((n) => n.href);

export function Shell({ children, demo = false }: { children: React.ReactNode; demo?: boolean }) {
  // Context providers live at the app root (app/providers.tsx) so there is a
  // single instance shared by every route + deep component (Pkg9 · N1).
  return <ShellChrome demo={demo}>{children}</ShellChrome>;
}

function ShellChrome({ children, demo }: { children: React.ReactNode; demo: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { plan, toggle, email, isLoggedIn, logout } = usePlan();
  const { locale, toggle: toggleLocale } = useLocale();
  const { theme, toggle: toggleTheme } = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const close = () => setOpen(false);

  const isDark = theme === "dark";
  const soon = locale === "pt" ? "Em breve" : "Soon";
  const navLabel = (it: NavItem) => it.label ?? (it.key ? t.shell.nav[it.key] : "");
  const lockedItem = NAV.find(
    (n) =>
      n.locked &&
      (pathname === n.href || pathname.startsWith(`${n.href}/`))
  );

  return (
    <div className="min-h-screen">
      {/* Mobile menu toggle (42x42, glass) */}
      <button
        type="button"
        aria-label={t.shell.openMenu}
        onClick={() => setOpen(true)}
        className="fixed left-[14px] top-[14px] z-50 flex size-[42px] items-center justify-center rounded-[12px] border border-st-sidebar-line text-st-ivory sm:hidden"
        style={{
          background: "var(--st-sidebar-glass)",
          backdropFilter: "blur(20px) saturate(1.3)",
        }}
      >
        <Menu className="size-5" />
      </button>

      {/* Off-canvas backdrop (mobile only) */}
      {open ? (
        <div
          aria-hidden
          onClick={close}
          className="fixed inset-0 z-40 bg-black/50 sm:hidden"
        />
      ) : null}

      {/* Sidebar — drawer (264px) on mobile, fixed rail (208px) on desktop */}
      <aside
        className={cn(
          "fixed bottom-[14px] left-[14px] top-[14px] z-50 flex w-[264px] flex-col rounded-[18px] border border-st-sidebar-line px-[14px] py-[18px] transition-transform duration-300 sm:w-[208px] sm:translate-x-0",
          open ? "translate-x-0" : "-translate-x-[calc(100%_+_18px)]"
        )}
        style={{
          background: "var(--st-sidebar-glass)",
          backdropFilter: "blur(20px) saturate(1.3)",
          boxShadow: "var(--st-shadow)",
        }}
      >
        {/* Logo */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={demo ? "/demo" : "/map"}
            onClick={close}
            className="flex items-center gap-[9px] text-st-ivory"
          >
            <ArkomLogo size={19} />
          </Link>
          <button
            type="button"
            aria-label={t.shell.closeMenu}
            onClick={close}
            className="text-st-ink-2 sm:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Workspace group — rolável quando a lista passa da altura (rodapé fica fixo);
            barra de scroll escondida pra não destoar do design. */}
        <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
        <p className="mb-2 px-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-st-ink-2">
          {t.shell.workspace}
        </p>
        <nav className="flex flex-col gap-0.5">
          {/* itens travados (cadeado · "Em breve") ficam ocultos da barra lateral;
              a rota direta ainda cai no guard lockedItem abaixo. */}
          {(demo ? DEMO_NAV : NAV).filter((item) => !item.locked).map((item) => {
            const Icon = item.icon;

            const active =
              pathname === item.href || (demo && item.href === "/demo/team" && ["/demo/sdr","/demo/clips","/demo/crm","/demo/multipropriedades"].includes(pathname)) || (item.href !== "/demo" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-[38px] items-center gap-2.5 rounded-[10px] px-2.5 text-[14px] transition-colors",
                  active
                    ? "bg-st-card-2 font-semibold text-st-ivory"
                    : "font-medium text-st-ink-2 hover:bg-st-card hover:text-st-ivory"
                )}
              >
                <Icon
                  className="size-[16px]"
                  strokeWidth={active ? 2.2 : 2}
                />
                <span>{navLabel(item)}</span>
                {item.badge ? (
                  <span className="ml-auto inline-flex h-[19px] min-w-[20px] items-center justify-center rounded-[6px] border border-st-line-2 bg-st-card-2 px-1.5 text-[11px] font-semibold leading-none text-st-ink-2">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}

          {/* Suporte — abre modal (WhatsApp + central de ajuda), não é rota. */}
          <button
            type="button"
            onClick={() => {
              close();
              setSupportOpen(true);
            }}
            className="flex h-[38px] items-center gap-2.5 rounded-[10px] px-2.5 text-[14px] font-medium text-st-ink-2 transition-colors hover:bg-st-card hover:text-st-ivory"
          >
            <LifeBuoy className="size-[16px]" strokeWidth={2} />
            <span>{t.shell.nav.support}</span>
          </button>
        </nav>
        </div>

        {/* Account + toggles — rodapé fixo (não corta) */}
        <div className="shrink-0 flex flex-col gap-2 pt-4">
          {/* Language switch (Pkg9 · N1) — discreet shell pill, visible on every route */}
          <div className="flex items-center justify-center gap-2 rounded-full border border-st-line-2 bg-st-card px-2 py-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-st-ink-3">
              {t.shell.language}
            </span>
            <button
              type="button"
              onClick={toggleLocale}
              aria-label={t.shell.toggleLanguage}
              className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.08em]"
            >
              <span className={locale === "en" ? "text-st-ivory" : "text-st-ink-3"}>EN</span>
              <span className="text-st-ink-3">⇄</span>
              <span className={locale === "pt" ? "text-[#c58b5f]" : "text-st-ink-3"}>PT</span>
            </button>
          </div>

          {ARKOM_DEMO_PLAN_ENABLED ? (
            <div className="flex items-center justify-center gap-2 rounded-full border border-st-line-2 bg-st-card px-2 py-1">
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-st-ink-3">
                {t.shell.demo}
              </span>
              <button
                type="button"
                onClick={toggle}
                aria-label={t.shell.togglePlan(plan)}
                className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.08em]"
              >
                <span className={plan === "free" ? "text-st-ivory" : "text-st-ink-3"}>
                  {t.shell.free}
                </span>
                <span className="text-st-ink-3">⇄</span>
                <span className={plan === "pro" ? "text-[#c58b5f]" : "text-st-ink-3"}>
                  {t.shell.pro}
                </span>
              </button>
            </div>
          ) : null}
          {isLoggedIn ? (
            <div className="flex items-center gap-2.5 rounded-[12px] px-2 py-2">
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-st-card-2 text-[11px] font-semibold uppercase text-st-ivory">
                {(email ?? "").slice(0, 2)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12.5px] text-st-ivory">{email}</span>
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    close();
                    router.replace("/login");
                    router.refresh();
                  }}
                  className="self-start text-[11px] text-st-ink-3 transition-colors hover:text-st-ivory"
                >
                  {t.shell.logout}
                </button>
              </span>
            </div>
          ) : (
            <Link
              href={demo ? "/demo/business" : "/login"}
              onClick={close}
              className="flex items-center gap-2.5 rounded-[12px] px-2 py-2 transition-colors hover:bg-st-card"
            >
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-st-card-2 text-[11px] font-semibold text-st-ivory">
                →
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[12.5px] text-st-ivory">
                  {demo ? "Alfa · Demonstração" : locale === "pt" ? "Entrar" : "Log in"}
                </span>
                <span className="truncate text-[11px] text-st-ink-3">
                  {demo ? "Empresa fictícia · DEV" : locale === "pt" ? "Área de membros" : "Member access"}
                </span>
              </span>
            </Link>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t.shell.toggleTheme}
            className="flex h-[34px] items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] text-st-ink-2 transition-colors hover:bg-st-card hover:text-st-ivory"
          >
            {isDark ? <Moon className="size-[15px]" /> : <Sun className="size-[15px]" />}
            <span>{isDark ? t.shell.lightMode : t.shell.darkMode}</span>
          </button>
        </div>
      </aside>

      {/* Main content — mirrors the live `.main`: sidebar grid column (236px)
          reserved, content centred in a max-w 1360 column with 40px gutters. */}
      <main className="min-h-screen px-4 pb-[60px] pt-[64px] sm:pl-[236px] sm:pr-0 sm:pt-[26px]">
        <div className="mx-auto w-full max-w-[1360px] sm:px-10">
          {lockedItem ? (
            <div className="flex min-h-[64vh] flex-col items-center justify-center text-center">
              <span className="mb-5 flex size-16 items-center justify-center rounded-[20px] border border-st-line-2 bg-st-card text-st-ink-2">
                <Lock className="size-7" strokeWidth={1.8} />
              </span>
              <h1 className="text-[24px] font-bold tracking-[-0.02em] text-st-ivory">
                {navLabel(lockedItem)}
              </h1>
              <p className="mt-2.5 text-[13px] font-bold uppercase tracking-[0.14em] text-[#c58b5f]">
                {soon}
              </p>
              <p className="mt-3 max-w-[420px] text-[14px] leading-relaxed text-st-ink-2">
                {locale === "pt"
                  ? "Esta área ainda não está disponível. Estamos preparando — em breve por aqui."
                  : "This area isn't available yet. We're getting it ready — coming soon."}
              </p>
            </div>
          ) : (
            children
          )}
        </div>
      </main>

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}
