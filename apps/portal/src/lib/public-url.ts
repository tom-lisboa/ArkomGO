import { headers } from "next/headers";

const DEVELOPMENT_ORIGIN = "http://localhost:3000";

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function getPublicUrl(path = "/"): Promise<string> {
  const canonical =
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeOrigin(process.env.APP_URL);

  let origin = canonical;
  if (process.env.NODE_ENV === "production") {
    if (!origin) {
      throw new Error("APP_URL (ou NEXT_PUBLIC_APP_URL) canonica e obrigatoria em producao");
    }
    if (!origin.startsWith("https://")) {
      throw new Error("A URL publica canonica deve usar HTTPS em producao");
    }
  } else if (!origin) {
    const requestOrigin = normalizeOrigin((await headers()).get("origin"));
    const requestHost = requestOrigin ? new URL(requestOrigin).hostname : "";
    origin = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(requestHost)
      ? requestOrigin
      : DEVELOPMENT_ORIGIN;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, `${origin}/`).toString();
}
