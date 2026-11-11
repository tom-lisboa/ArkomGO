import { NextRequest } from "next/server";
import { canAccessSolutionsDash } from "@/lib/app-mode";
import { login } from "@/lib/auth";
import { acceptsSameOriginJson, noStoreJson, sessionPayload } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!acceptsSameOriginJson(request)) {
    return noStoreJson({ error: "Requisição inválida." }, { status: 415 });
  }

  let input: { email?: unknown; password?: unknown };
  try {
    input = (await request.json()) as { email?: unknown; password?: unknown };
  } catch {
    return noStoreJson({ error: "Requisição inválida." }, { status: 400 });
  }

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!email || !password || email.length > 320 || password.length > 1_024) {
    return noStoreJson({ error: "Informe seu e-mail e a sua senha." }, { status: 400 });
  }

  // dash dedicada de Soluções: allowlist antes de autenticar.
  if (!canAccessSolutionsDash(email)) {
    return noStoreJson({ error: "Este acesso é restrito." }, { status: 403 });
  }

  try {
    const result = await login(email, password);
    if (!result.ok) {
      return noStoreJson({ error: result.error }, { status: 401 });
    }
    return noStoreJson(await sessionPayload(result.user));
  } catch (error) {
    console.error("[arkom] Falha inesperada no login:", error);
    return noStoreJson({ error: "Não foi possível entrar agora. Tente novamente." }, { status: 503 });
  }
}

