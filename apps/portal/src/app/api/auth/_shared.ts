import { NextRequest, NextResponse } from "next/server";
import { isPro } from "@/lib/entitlements";

type SessionProfile = {
  id: number;
  full_name: string;
  email: string;
  role: "admin" | "student";
  must_change_password: number;
};

/**
 * Perfil de sessão devolvido a `PlanProvider` (src/lib/plan.tsx).
 *
 * ⚠ Este é UM dos DOIS produtores do perfil — o outro é `src/app/layout.tsx`
 * (SSR). Os dois têm de derivar `isPro` do MESMO jeito; se divergirem, a UI
 * pisca entre o render do servidor e o fetch de /api/auth/session.
 *
 * `isPro()` é fail-safe: com a flag `entitlements_enabled` desligada (ou com
 * erro de banco) devolve o comportamento legado `role === 'admin'`.
 */
export async function sessionPayload(user: SessionProfile | null) {
  if (!user) {
    return { authenticated: false as const, user: null };
  }

  return {
    authenticated: true as const,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.must_change_password === 1,
      isPro: await isPro(user),
    },
  };
}

export function noStoreJson(body: unknown, init: ResponseInit = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export function acceptsSameOriginJson(request: NextRequest): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return false;

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 16_384) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site" && fetchSite !== "none") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) return fetchSite !== "same-site";

  try {
    const originUrl = new URL(origin);
    const expectedHosts = new Set<string>();
    expectedHosts.add(request.nextUrl.host);
    const host = request.headers.get("host");
    if (host) expectedHosts.add(host);
    for (const configuredOrigin of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
      if (!configuredOrigin) continue;
      try {
        expectedHosts.add(new URL(configuredOrigin).host);
      } catch {
        // Invalid deployment configuration must not broaden the allow-list.
      }
    }
    return expectedHosts.has(originUrl.host);
  } catch {
    return false;
  }
}
