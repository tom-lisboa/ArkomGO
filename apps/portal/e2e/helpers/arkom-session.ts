// e2e/helpers/arkom-session.ts — sessão cunhada para os specs do credit-system.
//
// Os specs precisam de TRÊS identidades (admin, aluno Legado ilimitado, aluno
// de teste com plano limitado). Em vez de guardar três senhas, cunhamos o
// cookie `arkom_session` do mesmo jeito que `src/lib/auth.ts#createSessionToken`
// (base64url(JSON{uid,sv,exp}) + "." + HMAC-SHA256 com ARKOM_SESSION_SECRET) —
// o segredo vem do `.env.local`/ambiente em runtime, nada fica no repo.
// O login REAL por e-mail/senha tem jornada própria (via E2E_EMAIL/E2E_PASSWORD).

import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BrowserContext } from "@playwright/test";

function envLocal(key: string): string | null {
  if (process.env[key]) return process.env[key]!;
  const file = resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return null;
  const m = readFileSync(file, "utf-8").match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

/** URL do banco educacional (para setup/teardown de dados de teste). */
export function educacionalUrl(): string {
  const url = envLocal("EDUCACIONAL_DATABASE_URL");
  if (!url) throw new Error("EDUCACIONAL_DATABASE_URL ausente (env ou .env.local)");
  return url;
}

export function mintSessionToken(uid: number, sessionVersion = 1): string {
  const secret = envLocal("ARKOM_SESSION_SECRET");
  if (!secret) throw new Error("ARKOM_SESSION_SECRET ausente (env ou .env.local)");
  const payload = JSON.stringify({
    uid,
    sv: sessionVersion,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  });
  const body = Buffer.from(payload, "utf-8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${body}.${sig}`;
}

/** Entra como o profile `uid` adicionando o cookie de sessão ao contexto.
 *  O `session_version` é lido do banco na hora: bloquear/desbloquear uma conta
 *  bumpa o sv, e um cookie cunhado com sv antigo seria rejeitado. */
export async function loginAs(context: BrowserContext, baseURL: string, uid: number): Promise<void> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  let sv = 1;
  try {
    const [row] = await sql`SELECT session_version FROM educacional.profiles WHERE id = ${uid}`;
    if (row?.session_version) sv = Number(row.session_version);
  } finally {
    await sql.end();
  }
  const { hostname } = new URL(baseURL);
  await context.addCookies([
    {
      name: "arkom_session",
      value: mintSessionToken(uid, sv),
      domain: hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/** Perfis usados pelos specs (ids reais do schema educacional). */
export const PERFIS = {
  admin: 1, // admin@bilhon.ai
  alunoLegado: 2, // aluno@bilhon.ai — plano Legado (horas ilimitadas)
  alunoLimitado: 104, // aluno.teste.creditos@bilhon.ai — 3h no total
} as const;

/** Define uma senha conhecida para um aluno criado pela UI (setup fora de
 *  vídeo): acha o auth_user_id no perfil, seta a senha no GoTrue central e
 *  zera o must_change_password para o login cair direto na home. */
export async function definirSenhaDoAluno(email: string, senha: string): Promise<void> {
  const centralUrl = envLocalPublico("CENTRAL_SUPABASE_URL");
  const serviceKey = envLocalPublico("CENTRAL_SUPABASE_SERVICE_ROLE_KEY");
  const postgres = (await import("postgres")).default;
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    const [row] = await sql<{ id: number; auth_user_id: string | null }[]>`
      SELECT id, auth_user_id FROM educacional.profiles
       WHERE email = ${email} AND status <> 'deleted' LIMIT 1`;
    if (!row?.auth_user_id) throw new Error(`perfil/auth ausente para ${email}`);
    const resp = await fetch(`${centralUrl}/auth/v1/admin/users/${row.auth_user_id}`, {
      method: "PUT",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: senha }),
    });
    if (!resp.ok) throw new Error(`GoTrue ${resp.status} ao definir senha de ${email}`);
    await sql`UPDATE educacional.profiles SET must_change_password = 0 WHERE id = ${row.id}`;
  } finally {
    await sql.end();
  }
}

function envLocalPublico(key: string): string {
  if (process.env[key]) return process.env[key]!;
  const file = resolve(process.cwd(), ".env.local");
  const m = existsSync(file)
    ? readFileSync(file, "utf-8").match(new RegExp(`^${key}=(.+)$`, "m"))
    : null;
  if (!m) throw new Error(`${key} ausente (env ou .env.local)`);
  return m[1].trim();
}
