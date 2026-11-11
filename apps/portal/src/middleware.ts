// middleware.ts — porta de borda para /admin, /api/admin e o modo "solutions".
//
// Corrige o vazamento CRÍTICO: no App Router o layout NÃO é fronteira de
// segurança (num request RSC a página renderiza e serializa dados antes de o
// redirect do layout abortar). O middleware roda em TODO request — inclusive
// RSC/prefetch — ANTES de qualquer render, então corta o acesso sem sessão na
// borda. Aqui só checamos PRESENÇA do cookie de sessão (barato, edge-safe, sem
// crypto/DB); a verificação REAL (assinatura HMAC + role admin) continua no
// requireAdmin() de cada página/action.
//
// Modo ARKOM_APP_MODE=solutions (dash dedicada, 2º serviço Railway): só o
// fluxo de Soluções é servido — /solutions + auth (login/senhas) + /settings
// (primeiro acesso) + APIs de auth/mídia. Qualquer outra rota (/, /home, /map,
// /admin, …) redireciona pra /solutions; APIs fora da lista respondem 404.
// Os guards de sessão continuam nas páginas (requireUser → /login).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// mesmo nome de SESSION_COOKIE em lib/config (mantido literal p/ edge-safety).
const SESSION_COOKIE = "arkom_session";

// mesmo valor de isSolutionsDash() em lib/app-mode (literal p/ edge-safety).
const SOLUTIONS_MODE = process.env.ARKOM_APP_MODE === "solutions";

// mesmo valor de isQaDash() em lib/app-mode — serviço dedicado da videoteca
// de jornadas E2E (/jornadas), padrão idêntico ao da dash de Soluções.
const QA_MODE = process.env.ARKOM_APP_MODE === "qa";

/** Prefixos servidos na dash de QA (todo o resto redireciona p/ /jornadas). */
const QA_ALLOW = [
  "/jornadas",
  "/login",
  "/definir-senha",
  "/recuperar-senha",
  "/settings",
  "/api/auth",
  "/api/media",
];

/** Prefixos servidos na dash de Soluções (todo o resto redireciona). */
const SOLUTIONS_ALLOW = [
  "/solutions",
  "/dash", // dashboards da dash dedicada (headbar SOLUÇÕES | PAINÉIS)
  "/login",
  "/definir-senha",
  "/recuperar-senha",
  "/settings", // requireUser manda primeiro-acesso pra cá (troca de senha)
  "/api/auth",
  "/api/dash",
  "/api/media",
];

export function middleware(req: NextRequest) {
 if (process.env.ARKOM_LOCAL_DEMO === "true" && ["127.0.0.1", "localhost"].includes(req.nextUrl.hostname) && (req.nextUrl.pathname === "/demo" || req.nextUrl.pathname.startsWith("/demo/") || req.nextUrl.pathname.startsWith("/api/demo/backend/"))) return NextResponse.next();

  const { pathname } = req.nextUrl;

  if (QA_MODE) {
    const allowed = QA_ALLOW.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (allowed) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/jornadas";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (SOLUTIONS_MODE) {
    const allowed = SOLUTIONS_ALLOW.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (allowed) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/solutions";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // app principal — porta de borda apenas para a superfície admin.
  const adminSurface =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/admin/");
  if (!adminSurface) return NextResponse.next();

  if (req.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.next();
  }

  // /api/admin/users é server-to-server (Bearer ARKOM_USERS_API_KEY). Na borda
  // checamos só a PRESENÇA do header — mesma filosofia do cookie acima: barato,
  // edge-safe; a verificação real (comparação em tempo constante, fail-closed)
  // fica no route handler.
  if (
    pathname === "/api/admin/users" &&
    (req.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ")
  ) {
    return NextResponse.next();
  }

  // sem cookie de sessão: API admin → 401; páginas admin → /login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // /admin e /api cobertos por inteiro (inclusive segmentos com "."); páginas
  // gerais sem _next/ e sem arquivos estáticos (têm extensão com ponto).
  matcher: [
    "/admin",
    "/admin/:path*",
    "/api/:path*",
    "/((?!_next/|.*\\..*).*)",
  ],
};
