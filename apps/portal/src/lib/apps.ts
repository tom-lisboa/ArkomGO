// lib/apps.ts — codificação/decodificação do "coming soon" dos apps.
//
// Regra do central (espelha src/app/admin/apps/actions.ts e a referência
// bilhon-ai): um app "em breve" é gravado com o redirect_url prefixado por
// `coming-soon:`. O prefixo guarda a URL real (para quando for ao ar) mas marca
// o app como indisponível para o aluno. Aqui centralizamos a decodificação para
// o loader do aluno e as server actions usarem a MESMA lógica.

export type AppAvailability = "available" | "coming_soon";

export const APP_COMING_SOON_REDIRECT_PREFIX = "coming-soon:";

/** Disponibilidade derivada do redirect_url: prefixo `coming-soon:` → em breve. */
export function appAvailabilityFromRedirectUrl(
  redirectUrl: string | null | undefined,
): AppAvailability {
  return redirectUrl?.startsWith(APP_COMING_SOON_REDIRECT_PREFIX)
    ? "coming_soon"
    : "available";
}

/**
 * URL externa "pública" do app — remove o prefixo `coming-soon:` (se houver) e
 * devolve a URL limpa, ou null quando não há URL utilizável. Nota: para um app
 * em breve isso devolve a URL escondida atrás do prefixo; o loader do aluno só
 * a expõe quando o app está de fato disponível.
 */
export function publicAppRedirectUrl(
  redirectUrl: string | null | undefined,
): string | null {
  if (!redirectUrl) return null;
  if (!redirectUrl.startsWith(APP_COMING_SOON_REDIRECT_PREFIX)) {
    return redirectUrl.trim() || null;
  }
  const value = redirectUrl.slice(APP_COMING_SOON_REDIRECT_PREFIX.length).trim();
  return value || null;
}
