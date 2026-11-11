import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";

import { ArkomLogo } from "@/components/ArkomLogo";
import { ToastProvider } from "@/components/ui";
import { logout, requireAdmin } from "@/lib/auth";
import { AdminNav } from "./admin-nav";
import "./backend-surface.css";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdmin();

  async function sair() {
    "use server";
    await logout();
    redirect("/login");
  }

  return (
    <ToastProvider>
      <div className="backend-surface min-h-screen bg-background text-foreground">
        <aside className="backend-sidebar">
          <div className="backend-brand">
            <Link href="/admin" aria-label="Admin Arkom">
              <ArkomLogo size={18} />
            </Link>
            <span className="backend-brand-tag">Admin</span>
          </div>

          <AdminNav />

          <div className="backend-user">
            <span className="backend-avatar" aria-hidden>
              {user.full_name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join("")}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate">{user.full_name}</strong>
              <small className="block truncate">{user.email}</small>
            </span>
            <form action={sair}>
              <button type="submit" className="backend-logout" aria-label="Sair">
                <LogOut aria-hidden size={16} />
              </button>
            </form>
          </div>
        </aside>

        <main className="backend-main">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
