import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { fetchMediaObject, normalizeMediaPath } from "@/lib/media-storage";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return new NextResponse("Nao autorizado", { status: 401 });
  }
  if (user.must_change_password === 1) {
    return new NextResponse("Defina uma nova senha antes de acessar midias.", {
      status: 403,
    });
  }

  const { path } = await ctx.params;
  const objectPath = normalizeMediaPath(path.join("/"));
  if (!objectPath) {
    return new NextResponse("Arquivo invalido", { status: 400 });
  }

  const media = await fetchMediaObject(objectPath);
  if (!media?.body) {
    return new NextResponse("Arquivo nao encontrado", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", media.headers.get("content-type") || "application/octet-stream");
  // Os uploads têm nome único (`Date.now()-uuid-...` em media-storage.ts) —
  // a URL é IMUTÁVEL, então o browser pode segurar por 7 dias sem revalidar.
  // Trocar a capa gera outra URL; `private` porque a rota é autenticada.
  headers.set("Cache-Control", "private, max-age=604800, immutable");
  const length = media.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new NextResponse(media.body, { status: 200, headers });
}
