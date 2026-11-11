"use client";

// Nav lateral do /admin — client component só p/ marcar o item ativo (pílula
// bg-st-card-2 + ivory), igual à barra do aluno. O resto do chrome (glass rail,
// logo, usuário) mora no layout server.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AppWindow,
  CalendarDays,
  Coins,
  Download,
  GraduationCap,
  Home,
  LayoutDashboard,
  Map,
  SlidersHorizontal,
  Users,
} from "lucide-react";

const ADMIN_NAV = [
  { href: "/admin", label: "Visão geral", icon: LayoutDashboard },
  { href: "/admin/home", label: "Home do aluno", icon: Home },
  { href: "/admin/students", label: "Membros", icon: Users },
  { href: "/admin/plans", label: "Planos", icon: Coins },
  { href: "/admin/apps", label: "Sistemas", icon: AppWindow },
  { href: "/admin/solutions", label: "Soluções (mapa)", icon: Map },
  { href: "/admin/trainings", label: "Universidade IA", icon: GraduationCap },
  { href: "/admin/mentorships", label: "Mentorias", icon: CalendarDays },
  { href: "/admin/exports", label: "Exportações", icon: Download },
  { href: "/admin/settings", label: "Configurações", icon: SlidersHorizontal },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="backend-nav" aria-label="Administração">
      {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/admin"
            ? pathname === "/admin"
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            <Icon aria-hidden size={17} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
