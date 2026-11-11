// Configuracao server-side compartilhada pela fundacao de autenticacao do Arkom.

/** Nome da env que guarda o segredo HMAC. O valor nunca deve ser hardcoded. */
export const SESSION_SECRET_ENV = "ARKOM_SESSION_SECRET";

/**
 * Le o segredo somente quando uma sessao e criada ou verificada.
 * A inicializacao lazy mantem `next build` seguro sem credenciais de runtime.
 */
export function getSessionSecret(): string {
  const value = process.env[SESSION_SECRET_ENV];
  if (!value) {
    throw new Error(`${SESSION_SECRET_ENV} is required`);
  }
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(`${SESSION_SECRET_ENV} must contain at least 32 bytes`);
  }
  return value;
}

/** Cookie HMAC da sessao local app_arkom. */
export const SESSION_COOKIE = "arkom_session";

/** Cookies httpOnly da sessao GoTrue central usada por Storage/RLS. */
export const SUPABASE_ACCESS_COOKIE = "arkom_supabase_access";
export const SUPABASE_REFRESH_COOKIE = "arkom_supabase_refresh";
export const SUPABASE_EXPIRES_COOKIE = "arkom_supabase_expires";

/** Validade da sessao em segundos (7 dias). */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/** Canais de suporte atualmente usados pela plataforma. */
export const SUPPORT_WHATSAPP = "+5511968665849";
export const SUPPORT_WHATSAPP_LINK = "https://wa.me/5511968665849";
export const SUPPORT_SITE_URL = "https://suportebilhon.com";
