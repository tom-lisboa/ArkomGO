// lib/auth.ts — Contrato Foundation (IMUTÁVEL para as verticais).
// Sessão: cookie `arkom_session` = base64url(JSON) + "." + HMAC-SHA256.
// ATENÇÃO (Next 15): cookies() é async — todas as funções aqui são async.
//
// API:
//   getSessionUser()  → SessionUser | null (leitura, sem redirect)
//   requireUser()     → SessionUser (redireciona /login se sem sessão) — layout (aluno)
//   requireAdmin()    → SessionUser (redireciona /home se não-admin) — layout admin
//   login(email, senha) → { ok } | { ok: false, error } (usar em server action)
//   createSession(userId) → grava cookie (usado por login e cadastro)
//   logout()          → apaga cookie (usar em server action)

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureSeeded, getSql } from "@/lib/db";
import { getSessionSecret, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/config";
import {
  clearCentralAuthCookies,
  setCentralArkomClaims,
  setCentralAuthCookies,
  signInCentralAuth,
} from "@/lib/central-auth";

export type SessionUser = {
  id: number;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: "admin" | "student";
  status: "active" | "blocked" | "deleted";
  registered_at: string;
  must_change_password: number;
  preferred_theme: "light" | "dark" | null;
  session_version: number;
};

type TokenPayload = { uid: number; sv: number; exp: number };

function signPayload(json: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(json).digest("hex");
}

/** Gera o token assinado do cookie de sessão. */
export function createSessionToken(userId: number, sessionVersion = 1): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("Invalid Arkom session user id");
  }
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion <= 0) {
    throw new Error("Invalid Arkom session version");
  }
  const payload: TokenPayload = {
    uid: userId,
    sv: sessionVersion,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, "utf-8").toString("base64url");
  return `${body}.${signPayload(json)}`;
}

/** Valida assinatura + expiração. Retorna payload ou null. */
export function verifySessionToken(token: string): TokenPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  let json: string;
  try {
    json = Buffer.from(body, "base64url").toString("utf-8");
  } catch {
    return null;
  }
  const expected = signPayload(json);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(json) as TokenPayload;
    if (!Number.isSafeInteger(payload.uid) || payload.uid <= 0) return null;
    if (!Number.isSafeInteger(payload.sv) || payload.sv <= 0) return null;
    if (!Number.isSafeInteger(payload.exp) || payload.exp <= 0) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}


/** Grava o cookie de sessão (chamar apenas em server actions / route handlers). */
export async function createSession(
  userId: number,
  expected?: {
    authUserId: string;
    role: "admin" | "student";
    mustChangePassword: number;
    sessionVersion: number;
  },
): Promise<void> {
  const sql = getSql();
  const profile = (
    await sql<{
      auth_user_id: string | null;
      role: "admin" | "student";
      must_change_password: number;
      session_version: number;
    }[]>`
      SELECT auth_user_id, role, must_change_password, session_version
      FROM profiles
      WHERE id = ${userId} AND status = 'active'
    `
  )[0];
  if (!profile) throw new Error("Cannot create a session for an inactive Arkom profile");
  if (
    expected &&
    (
      profile.auth_user_id !== expected.authUserId ||
      profile.role !== expected.role ||
      profile.must_change_password !== expected.mustChangePassword ||
      profile.session_version !== expected.sessionVersion
    )
  ) {
    throw new Error("Arkom profile changed while issuing the session");
  }
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(userId, profile.session_version), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Remove a sessão (chamar em server action). */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  await clearCentralAuthCookies();
}

/** Autentica e-mail/senha. Em caso de sucesso, grava o cookie de sessão. */
export async function login(
  email: string,
  password: string
): Promise<{ ok: true; user: SessionUser } | { ok: false; error: string }> {
  try {
    await ensureSeeded();
  } catch (error) {
    console.error("[arkom] Banco transacional indisponivel no login:", error);
    return { ok: false, error: "O acesso Arkom ainda não está disponível neste ambiente." };
  }
  const initialAuth = await signInCentralAuth(email, password);
  if (!initialAuth.ok) {
    return { ok: false, error: "E-mail ou senha incorretos." };
  }

  let auth = initialAuth;
  const authUserId = auth.userId;
  const centralEmail = auth.email?.trim().toLowerCase();
  if (!centralEmail) {
    return { ok: false, error: "E-mail ou senha incorretos." };
  }

  const defaultName = centralEmail.split("@")[0] || "Membro Arkom";
  const fullName = auth.fullName?.trim() || defaultName;
  const defaultRole = auth.role === "admin" ? "admin" : "student";
  const mustChangePassword = auth.mustChangePassword ? 1 : 0;
  const sql = getSql();
  let row: SessionUser | undefined;
  try {
    row = await sql.begin(async (transaction) => {
      const linked = (
        await transaction<SessionUser[]>`
          SELECT id, auth_user_id, full_name, email, avatar_url, role, status, registered_at,
                 must_change_password, session_version,
                 to_jsonb(p)->>'preferred_theme' AS preferred_theme
          FROM profiles p
          WHERE auth_user_id = ${authUserId}::uuid
          LIMIT 1
          FOR UPDATE
        `
      )[0];
      if (linked) return linked;

      const unlinked = (
        await transaction<SessionUser[]>`
          SELECT id, auth_user_id, full_name, email, avatar_url, role, status, registered_at,
                 must_change_password, session_version,
                 to_jsonb(p)->>'preferred_theme' AS preferred_theme
          FROM profiles p
          WHERE auth_user_id IS NULL
            AND auth_identity_id IS NULL
            AND lower(email) = lower(${centralEmail})
          LIMIT 1
          FOR UPDATE
        `
      )[0];

      if (unlinked) {
        const claimed = (
          await transaction<SessionUser[]>`
            UPDATE profiles AS p
            SET auth_user_id = ${authUserId}::uuid,
                auth_identity_id = ${authUserId}::uuid
            WHERE p.id = ${unlinked.id}
              AND p.auth_user_id IS NULL
              AND p.auth_identity_id IS NULL
            RETURNING p.id, p.auth_user_id, p.full_name, p.email, p.avatar_url,
                      p.role, p.status, p.registered_at, p.must_change_password,
                      p.session_version,
                      to_jsonb(p)->>'preferred_theme' AS preferred_theme
          `
        )[0];
        if (claimed) return claimed;
      }

      const created = (
        await transaction<SessionUser[]>`
          INSERT INTO profiles
            (auth_user_id, auth_identity_id, full_name, email, password_hash,
             role, status, must_change_password)
          VALUES
            (${authUserId}::uuid, ${authUserId}::uuid, ${fullName},
             ${centralEmail}, null, ${defaultRole}, 'active', ${mustChangePassword})
          ON CONFLICT DO NOTHING
          RETURNING id, auth_user_id, full_name, email, avatar_url, role, status,
                    registered_at, must_change_password, session_version,
                    preferred_theme
        `
      )[0];
      if (created) return created;

      return (
        await transaction<SessionUser[]>`
          SELECT id, auth_user_id, full_name, email, avatar_url, role, status, registered_at,
                 must_change_password, session_version,
                 to_jsonb(p)->>'preferred_theme' AS preferred_theme
          FROM profiles p
          WHERE auth_user_id = ${authUserId}::uuid
          LIMIT 1
          FOR UPDATE
        `
      )[0];
    });
  } catch (error) {
    console.error("[arkom] Falha ao vincular perfil central automaticamente:", error);
    return { ok: false, error: "Não foi possível vincular seu acesso ao Arkom." };
  }

  if (!row) {
    return { ok: false, error: "Não foi possível vincular seu acesso ao Arkom." };
  }

  const profileId = row.id;
  let currentProfile: SessionUser = row;
  for (let attempt = 0; attempt < 2; attempt++) {
    const latest: SessionUser | undefined = (
      await sql<SessionUser[]>`
        SELECT id, auth_user_id, full_name, email, avatar_url, role, status, registered_at,
               must_change_password, session_version,
               to_jsonb(p)->>'preferred_theme' AS preferred_theme
        FROM profiles p
        WHERE id = ${profileId}
          AND auth_user_id = ${authUserId}::uuid
        LIMIT 1
      `
    )[0];
    if (!latest || latest.status === "deleted") {
      return { ok: false, error: "E-mail ou senha incorretos." };
    }
    if (latest.status === "blocked") {
      return {
        ok: false,
        error: "Seu acesso está bloqueado. Entre em contato com o suporte.",
      };
    }
    currentProfile = latest;
    const localMustChangePassword = currentProfile.must_change_password === 1;
    if (
      auth.role === currentProfile.role &&
      auth.mustChangePassword === localMustChangePassword
    ) break;

    const synced = await setCentralArkomClaims(authUserId, {
      role: currentProfile.role,
      mustChangePassword: localMustChangePassword,
    });
    if (!synced.ok) {
      return { ok: false, error: "Não foi possível sincronizar seu acesso às mídias." };
    }
    const refreshed = await signInCentralAuth(email, password);
    if (!refreshed.ok || refreshed.userId !== authUserId) {
      return { ok: false, error: "Não foi possível renovar sua sessão de mídia." };
    }
    auth = refreshed;
  }

  if (
    auth.role !== currentProfile.role ||
    auth.mustChangePassword !== (currentProfile.must_change_password === 1)
  ) {
    return { ok: false, error: "Seu perfil mudou durante o login. Tente novamente." };
  }

  try {
    await createSession(currentProfile.id, {
      authUserId,
      role: currentProfile.role,
      mustChangePassword: currentProfile.must_change_password,
      sessionVersion: currentProfile.session_version,
    });
  } catch (error) {
    console.warn("[arkom] Perfil alterado durante emissao da sessao:", error);
    return { ok: false, error: "Seu perfil mudou durante o login. Tente novamente." };
  }
  await setCentralAuthCookies(auth);
  return { ok: true, user: currentProfile };
}

/** Usuário da sessão atual (ou null). Não redireciona. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;

  try {
    await ensureSeeded();
  } catch (error) {
    console.error("[arkom] Banco transacional indisponivel na sessao:", error);
    return null;
  }
  const sql = getSql();
  const user = (
    await sql<SessionUser[]>`
      SELECT id, auth_user_id, full_name, email, avatar_url, role, status, registered_at, must_change_password,
             session_version,
             to_jsonb(p)->>'preferred_theme' AS preferred_theme
      FROM profiles p
      WHERE id = ${payload.uid}
    `
  )[0];

  if (!user || user.status !== "active" || user.session_version !== payload.sv) return null;
  return user;
}

/** Guard de layout (aluno): exige sessão ativa, senão redireciona para /login. */
export async function requireUser(options: { allowPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.must_change_password === 1 && !options.allowPasswordChange) {
    redirect("/settings?primeiro-acesso=1");
  }
  return user;
}

/** Guard de layout admin: exige role=admin. Sem sessão → /login; aluno → /home. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.must_change_password === 1) redirect("/settings?primeiro-acesso=1");
  if (user.role !== "admin") redirect("/home");
  return user;
}
