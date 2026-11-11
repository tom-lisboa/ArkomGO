import { NextRequest } from "next/server";
import { logout as clearSession } from "@/lib/auth";
import { acceptsSameOriginJson, noStoreJson } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!acceptsSameOriginJson(request)) {
    return noStoreJson({ error: "Requisição inválida." }, { status: 415 });
  }

  try {
    await clearSession();
    return noStoreJson({ ok: true });
  } catch (error) {
    console.error("[arkom] Falha ao encerrar a sessão:", error);
    return noStoreJson({ error: "Não foi possível sair agora." }, { status: 503 });
  }
}
