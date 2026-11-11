// Supabase Auth CENTRAL helpers, server-only.
// Admin user sync still uses service_role. Normal sign-in, refresh and Storage
// access use the anon key + user JWT so RLS remains the source of authorization.

import crypto from "node:crypto";
import { cookies } from "next/headers";
import {
  SESSION_MAX_AGE,
  SUPABASE_ACCESS_COOKIE,
  SUPABASE_EXPIRES_COOKIE,
  SUPABASE_REFRESH_COOKIE,
} from "@/lib/config";
import { getSql } from "@/lib/db";

if (typeof window !== "undefined") {
  throw new Error("lib/central-auth.ts importado no browser - server-only");
}

type CentralAuthUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

type CentralAuthToken = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: CentralAuthUser;
};

type AuthResponse<T> = { data: T | null; error: string | null };

const TIMEOUT_MS = 15_000;
const USERS_PER_PAGE = 100;

function env(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} nao configurada`);
  return value;
}

function authBase(): string {
  return `${env("CENTRAL_SUPABASE_URL").replace(/\/+$/, "")}/auth/v1`;
}

function adminHeaders(): Record<string, string> {
  const key = env("CENTRAL_SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, authorization: `Bearer ${key}` };
}

function anonHeaders(): Record<string, string> {
  const key = env("CENTRAL_SUPABASE_ANON_KEY");
  return { apikey: key, authorization: `Bearer ${key}` };
}

function userHeaders(accessToken: string): Record<string, string> {
  const key = env("CENTRAL_SUPABASE_ANON_KEY");
  return { apikey: key, authorization: `Bearer ${accessToken}` };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateTemporaryPassword(): string {
  const token = crypto.randomBytes(9).toString("base64url");
  return `Bh${token}7!`;
}

async function authJson<T>(
  path: string,
  init: RequestInit = {},
  mode: "admin" | "anon" = "admin",
): Promise<AuthResponse<T>> {
  try {
    const { headers: _headers, ...requestInit } = init;
    void _headers;

    const res = await fetch(`${authBase()}${path}`, {
      ...requestInit,
      headers: {
        ...(mode === "admin" ? adminHeaders() : anonHeaders()),
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      return { data: null, error: `Auth ${res.status}: ${text.slice(0, 200)}` };
    }
    return { data: (text ? JSON.parse(text) : null) as T, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function authUserJson<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<AuthResponse<T>> {
  try {
    const { headers: _headers, ...requestInit } = init;
    void _headers;

    const res = await fetch(`${authBase()}${path}`, {
      ...requestInit,
      headers: {
        ...userHeaders(accessToken),
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      return { data: null, error: `Auth ${res.status}: ${text.slice(0, 200)}` };
    }
    return { data: (text ? JSON.parse(text) : null) as T, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function findCentralAuthUserByEmail(email: string): Promise<AuthResponse<CentralAuthUser>> {
  const wanted = normalizeEmail(email);

  for (let page = 1; page <= 100; page++) {
    const { data, error } = await authJson<{ users?: CentralAuthUser[] } | CentralAuthUser[]>(
      `/admin/users?page=${page}&per_page=${USERS_PER_PAGE}`,
    );
    if (error) return { data: null, error };

    const users = Array.isArray(data) ? data : (data?.users ?? []);
    const match = users.find((user) => normalizeEmail(user.email ?? "") === wanted);
    if (match) return { data: match, error: null };
    if (users.length < USERS_PER_PAGE) return { data: null, error: null };
  }

  return { data: null, error: "limite de paginacao atingido ao buscar usuario Auth" };
}

async function getCentralAuthUserById(userId: string): Promise<AuthResponse<CentralAuthUser>> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return { data: null, error: "UUID de usuario Auth invalido" };
  }
  return authJson<CentralAuthUser>(`/admin/users/${userId}`);
}

export async function setCentralArkomClaims(
  userId: string,
  input: {
    role?: "admin" | "student" | null;
    mustChangePassword?: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return { ok: false, error: "UUID de usuario Auth invalido" };
  }

  const setRole = input.role !== undefined;
  const setMustChangePassword = input.mustChangePassword !== undefined;
  if (!setRole && !setMustChangePassword) return { ok: true };

  try {
    const sql = getSql();
    await sql`
      SELECT set_central_arkom_claims(
        ${userId}::uuid,
        ${setRole},
        ${input.role ?? null},
        ${setMustChangePassword},
        ${input.mustChangePassword ?? false}
      )
    `;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function syncCentralAuthUser(input: {
  email: string;
  fullName: string;
  password?: string;
  previousEmail?: string;
  expectedUserId?: string | null;
  verifyExistingPassword?: string;
  allowCreate?: boolean;
  updateExistingPassword?: boolean;
  mustChangePassword?: boolean;
  role?: "admin" | "student" | null;
}): Promise<
  | { ok: true; userId: string; created: boolean; passwordApplied: boolean }
  | { ok: false; error: string }
> {
  const email = normalizeEmail(input.email);
  const previousEmail = input.previousEmail ? normalizeEmail(input.previousEmail) : email;

  let user: CentralAuthUser | null = null;
  if (input.expectedUserId) {
    const expected = await getCentralAuthUserById(input.expectedUserId);
    if (expected.error || !expected.data) {
      return { ok: false, error: expected.error ?? "login central vinculado nao encontrado" };
    }
    user = expected.data;
  } else {
    const lookup = await findCentralAuthUserByEmail(previousEmail);
    if (lookup.error) return { ok: false, error: lookup.error };
    user = lookup.data;
  }

  const target = await findCentralAuthUserByEmail(email);
  if (target.error) return { ok: false, error: target.error };
  if (target.data && target.data.id !== user?.id) {
    return { ok: false, error: "ja existe outro login central com este email" };
  }
  user = user ?? target.data;

  // Invite signup may attach an identity that already belongs to another
  // product only after proving ownership with that identity's current password.
  // Admin provisioning intentionally does not know or replace that password.
  if (user && input.verifyExistingPassword) {
    const verified = await signInCentralAuth(
      normalizeEmail(user.email ?? email),
      input.verifyExistingPassword,
    );
    if (!verified.ok || verified.userId !== user.id) {
      return { ok: false, error: "nao foi possivel confirmar a identidade central existente" };
    }
  }

  const payload: Record<string, unknown> = {};
  const currentEmail = user?.email ? normalizeEmail(user.email) : null;
  if (!user || currentEmail !== email) {
    payload.email = email;
    payload.email_confirm = true;
  }
  if (!user) {
    payload.user_metadata = { full_name: input.fullName };
    const appMetadata: Record<string, unknown> = {};
    if (input.mustChangePassword !== undefined) {
      appMetadata.arkom_must_change_password = input.mustChangePassword;
    }
    if (input.role !== undefined && input.role !== null) {
      appMetadata.arkom_role = input.role;
    }
    if (Object.keys(appMetadata).length > 0) {
      payload.app_metadata = appMetadata;
    }
  }
  if (
    input.password &&
    (!user || (input.updateExistingPassword === true && input.expectedUserId === user.id))
  ) {
    payload.password = input.password;
  }

  if (user) {
    let updatedUser = user;
    if (Object.keys(payload).length > 0) {
      const { data, error } = await authJson<CentralAuthUser>(`/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (error) return { ok: false, error };
      updatedUser = data ?? user;
    }
    const claims = await setCentralArkomClaims(user.id, {
      role: input.role,
      mustChangePassword: input.mustChangePassword,
    });
    if (!claims.ok) return claims;
    return {
      ok: true,
      userId: updatedUser.id ?? user.id,
      created: false,
      passwordApplied: typeof payload.password === "string",
    };
  }

  if (input.allowCreate === false) {
    return { ok: false, error: "login central ainda nao existe" };
  }
  if (!input.password) {
    return {
      ok: false,
      error: "login central ainda nao existe; informe uma nova senha para sincronizar",
    };
  }

  const { data, error } = await authJson<CentralAuthUser>("/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (error) return { ok: false, error };
  if (!data?.id) return { ok: false, error: "Auth central nao retornou o usuario criado" };
  return { ok: true, userId: data.id, created: true, passwordApplied: true };
}

export async function setCentralArkomAccess(
  userId: string,
  role: "admin" | "student" | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return setCentralArkomClaims(userId, { role });
}

export async function deleteCentralAuthUser(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await authJson<unknown>(`/admin/users/${userId}`, {
    method: "DELETE",
  });
  return error ? { ok: false, error } : { ok: true };
}

/** Traduz os erros do mailer do Supabase para uma mensagem acionável — o erro
 *  cru ("Auth 429", "Auth 500: ...unexpected_failure") não diz a quem opera o
 *  admin o que fazer. O projeto central envia pelo SMTP próprio da Arkom
 *  (mail.arkom.ai, remetente noreply@arkom.ai): o que ainda barra um envio é o
 *  intervalo mínimo entre reenvios ao MESMO endereço e o teto por hora do
 *  projeto — ambos passageiros, ao contrário de uma falha do servidor SMTP. */
function friendlyEmailSendError(error: string): string {
  const seconds = error.match(/after (\d+) second/i)?.[1];
  if (seconds) {
    return `O Supabase limita reenvios para o mesmo e-mail: aguarde ${seconds}s e tente de novo.`;
  }
  if (/rate limit|over_email_send_rate_limit|429/i.test(error)) {
    return (
      "Limite de envio de e-mails do projeto central atingido nesta hora. " +
      "Aguarde alguns minutos e tente de novo."
    );
  }
  if (/error sending|smtp|relay|550|535/i.test(error)) {
    return (
      "O servidor de e-mail recusou o envio — confira o SMTP do projeto central " +
      "(host, usuário e senha) antes de tentar de novo."
    );
  }
  return error;
}

export async function sendCentralPasswordSetupEmail(input: {
  email: string;
  redirectTo?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = normalizeEmail(input.email);
  const query = input.redirectTo
    ? `?redirect_to=${encodeURIComponent(input.redirectTo)}`
    : "";

  const { error } = await authJson<unknown>(`/recover${query}`, {
    method: "POST",
    body: JSON.stringify({ email }),
  }, "anon");

  if (error) return { ok: false, error: friendlyEmailSendError(error) };
  return { ok: true };
}

export async function getCentralUserByAccessToken(
  accessToken: string,
): Promise<AuthResponse<CentralAuthUser>> {
  return authUserJson<CentralAuthUser>("/user", accessToken);
}

export async function updateCentralPasswordWithAccessToken(input: {
  accessToken: string;
  password: string;
}): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string }> {
  const { error } = await authUserJson<CentralAuthUser>("/user", input.accessToken, {
    method: "PUT",
    body: JSON.stringify({ password: input.password }),
  });
  if (error) {
    // Recriar conta preserva a senha central antiga (sync não sobrescreve senha de
    // login existente). Se o usuário definir a MESMA senha de antes, o GoTrue recusa
    // com `same_password` — mas o estado que ele quer já é o vigente: seguimos como
    // sucesso, senão o fluxo consome o token de recovery e trava o primeiro acesso.
    if (error.includes('"same_password"')) return { ok: true, unchanged: true };
    return { ok: false, error };
  }
  return { ok: true };
}

export async function setCentralMustChangePassword(
  userId: string,
  mustChangePassword: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return setCentralArkomClaims(userId, { mustChangePassword });
}

function sessionFromToken(data: CentralAuthToken | null): {
  userId: string;
  email?: string;
  fullName?: string;
  mustChangePassword: boolean;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  role?: "admin" | "student";
} | null {
  const user = data?.user;
  const userId = user?.id;
  if (!userId || !data?.access_token || !data.refresh_token) return null;
  const role = user.app_metadata?.arkom_role;
  const mustChangePassword = user.app_metadata?.arkom_must_change_password === true;
  const email = user.email ? normalizeEmail(user.email) : undefined;
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  const fullName =
    typeof metadataName === "string" && metadataName.trim()
      ? metadataName.trim()
      : undefined;
  return {
    userId,
    email,
    fullName,
    mustChangePassword,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    role: role === "admin" || role === "student" ? role : undefined,
  };
}

export async function signInCentralAuth(
  email: string,
  password: string,
): Promise<
  | {
      ok: true;
      userId: string;
      email?: string;
      fullName?: string;
      mustChangePassword: boolean;
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      role?: "admin" | "student";
    }
  | { ok: false; error: string }
> {
  const { data, error } = await authJson<CentralAuthToken>("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: normalizeEmail(email), password }),
  }, "anon");

  if (error) return { ok: false, error };
  const session = sessionFromToken(data);
  if (!session) return { ok: false, error: "Auth central nao retornou sessao" };
  return { ok: true, ...session };
}

/**
 * Verifica um `token_hash` de recovery (fluxo à prova de scanner). O OTP de uso
 * único só é consumido AQUI — quando o usuário envia o formulário (POST /verify) —
 * e não num GET da página. Assim, prefetch do navegador, preview de WhatsApp/e-mail
 * e scanners de link não queimam mais o link só por "tocá-lo". Retorna a mesma
 * sessão de `signInCentralAuth` (access_token + refresh + role + must_change).
 */
export async function verifyRecoveryTokenHash(
  tokenHash: string,
): Promise<
  | {
      ok: true;
      userId: string;
      email?: string;
      fullName?: string;
      mustChangePassword: boolean;
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      role?: "admin" | "student";
    }
  | { ok: false; error: string }
> {
  const { data, error } = await authJson<CentralAuthToken>("/verify", {
    method: "POST",
    body: JSON.stringify({ type: "recovery", token_hash: tokenHash }),
  }, "anon");

  if (error) return { ok: false, error };
  const session = sessionFromToken(data);
  if (!session) return { ok: false, error: "Auth central nao retornou sessao" };
  return { ok: true, ...session };
}

async function refreshCentralAuth(
  refreshToken: string,
): Promise<
  | { ok: true; accessToken: string; refreshToken: string; expiresAt: number }
  | { ok: false; error: string }
> {
  const { data, error } = await authJson<CentralAuthToken>("/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  }, "anon");

  if (error) return { ok: false, error };
  const session = sessionFromToken(data);
  if (!session) return { ok: false, error: "Auth central nao retornou sessao renovada" };
  return {
    ok: true,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
  };
}

export async function setCentralAuthCookies(session: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}): Promise<void> {
  const cookieStore = await cookies();
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
  cookieStore.set(SUPABASE_ACCESS_COOKIE, session.accessToken, base);
  cookieStore.set(SUPABASE_REFRESH_COOKIE, session.refreshToken, base);
  cookieStore.set(SUPABASE_EXPIRES_COOKIE, String(session.expiresAt), base);
}

export async function clearCentralAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SUPABASE_ACCESS_COOKIE);
  cookieStore.delete(SUPABASE_REFRESH_COOKIE);
  cookieStore.delete(SUPABASE_EXPIRES_COOKIE);
}

export async function getCentralAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(SUPABASE_ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(SUPABASE_REFRESH_COOKIE)?.value;
  const expiresAt = Number(cookieStore.get(SUPABASE_EXPIRES_COOKIE)?.value ?? 0);

  if (accessToken && expiresAt > Math.floor(Date.now() / 1000) + 60) {
    return accessToken;
  }
  if (!refreshToken) return null;

  const refreshed = await refreshCentralAuth(refreshToken);
  if (!refreshed.ok) {
    await clearCentralAuthCookies();
    return null;
  }

  await setCentralAuthCookies(refreshed);
  return refreshed.accessToken;
}
