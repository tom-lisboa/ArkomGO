import { getSessionUser } from "@/lib/auth";
import { noStoreJson, sessionPayload } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    return noStoreJson(await sessionPayload(user));
  } catch (error) {
    console.error("[arkom] Falha ao resolver a sessão:", error);
    return noStoreJson(
      { authenticated: false, user: null, error: "Não foi possível validar a sessão." },
      { status: 503 },
    );
  }
}

