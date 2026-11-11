"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import {
  getCentralUserByAccessToken,
  setCentralArkomAccess,
  setCentralAuthCookies,
  setCentralMustChangePassword,
  signInCentralAuth,
  updateCentralPasswordWithAccessToken,
  verifyRecoveryTokenHash,
} from "@/lib/central-auth";
import { ensureDatabaseReady, getSql } from "@/lib/db";
import { validateNewPassword } from "@/lib/password-policy";

export type DefinePasswordState = { error?: string };

export async function definePasswordAction(
  _previous: DefinePasswordState,
  formData: FormData,
): Promise<DefinePasswordState> {
  // `token_hash` = fluxo à prova de scanner (o OTP só é consumido AQUI, no submit).
  // `access_token` = fluxo antigo por hash — mantido para não quebrar links já enviados.
  const tokenHash = String(formData.get("token_hash") ?? "");
  const accessTokenInput = String(formData.get("access_token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirm_password") ?? "");

  if (!tokenHash && !accessTokenInput) {
    return { error: "Link inválido ou expirado. Solicite um novo e-mail." };
  }
  // Regra única (src/lib/password-policy.ts): comprimento sozinho deixava
  // passar senha só de espaços. Ver ClickUp 86ajraqhj.
  const forca = validateNewPassword(password);
  if (!forca.ok) return { error: forca.error };
  if (password !== confirmation) return { error: "A confirmação não confere com a senha." };

  // Resolve a identidade central. token_hash é verificado agora (POST /verify),
  // consumindo o OTP só neste momento; access_token é validado como antes.
  let accessToken: string;
  let centralUserId: string;
  let centralUserEmail: string;
  if (tokenHash) {
    const verified = await verifyRecoveryTokenHash(tokenHash);
    if (!verified.ok || !verified.userId || !verified.email) {
      return { error: "Link inválido ou expirado. Solicite um novo e-mail." };
    }
    accessToken = verified.accessToken;
    centralUserId = verified.userId;
    centralUserEmail = verified.email;
  } else {
    const centralUser = await getCentralUserByAccessToken(accessTokenInput);
    if (centralUser.error || !centralUser.data?.id || !centralUser.data.email) {
      return { error: "Link inválido ou expirado. Solicite um novo e-mail." };
    }
    accessToken = accessTokenInput;
    centralUserId = centralUser.data.id;
    centralUserEmail = centralUser.data.email;
  }

  try {
    await ensureDatabaseReady();
  } catch (error) {
    console.error("[arkom] Definicao de senha indisponivel:", error);
    return { error: "Não foi possível validar sua conta agora. Tente novamente mais tarde." };
  }
  const sql = getSql();
  const profile = (
    await sql<{
      id: number;
      email: string;
      role: "admin" | "student";
      auth_user_id: string | null;
    }[]>`
      SELECT id, email, role, auth_user_id
      FROM profiles
      WHERE status = 'active'
        AND (
          auth_user_id = ${centralUserId}::uuid
          OR (auth_user_id IS NULL AND lower(email) = lower(${centralUserEmail}))
        )
      ORDER BY CASE WHEN auth_user_id = ${centralUserId}::uuid THEN 0 ELSE 1 END
      LIMIT 1
    `
  )[0];
  if (!profile) {
    return { error: "Conta não encontrada ou sem acesso ativo." };
  }

  const access = await setCentralArkomAccess(centralUserId, profile.role);
  if (!access.ok) {
    console.error("[arkom] Falha ao sincronizar role antes do reset:", access.error);
    return { error: "Não foi possível validar o acesso desta conta. Solicite um novo e-mail." };
  }

  // Revoga todas as sessoes Arkom antigas antes de alterar a senha global.
  // Assim, uma falha posterior nunca deixa um cookie local antigo valido.
  await sql`
    UPDATE profiles
    SET session_version = session_version + 1
    WHERE id = ${profile.id}
  `;

  const updated = await updateCentralPasswordWithAccessToken({ accessToken, password });
  if (!updated.ok) {
    console.error("[arkom] Falha ao definir a senha central:", updated.error);
    return { error: "Não foi possível definir a senha. Solicite um novo e-mail." };
  }

  await sql`
    UPDATE profiles
    SET auth_user_id = ${centralUserId}::uuid,
        must_change_password = 0
    WHERE id = ${profile.id}
  `;

  const metadata = await setCentralMustChangePassword(centralUserId, false);
  if (!metadata.ok) {
    console.error("[arkom] Senha definida, mas metadata de primeiro acesso não sincronizou:", metadata.error);
  }

  const session = await signInCentralAuth(profile.email, password);
  if (!session.ok) return { error: "Senha definida, mas não foi possível iniciar a sessão." };
  await createSession(profile.id);
  await setCentralAuthCookies(session);
  redirect(profile.role === "admin" ? "/admin" : "/home");
}
