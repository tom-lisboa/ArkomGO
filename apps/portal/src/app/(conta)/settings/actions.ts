"use server";

import { redirect } from "next/navigation";
import { createSession, requireUser } from "@/lib/auth";
import { setCentralAuthCookies, signInCentralAuth, syncCentralAuthUser } from "@/lib/central-auth";
import { getSql } from "@/lib/db";
import { validateNewPassword } from "@/lib/password-policy";

export type PasswordActionState = { error?: string };

export async function changePasswordAction(
  _previous: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const user = await requireUser({ allowPasswordChange: true });
  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmation = String(formData.get("confirm_password") ?? "");

  if (!currentPassword) return { error: "Informe sua senha atual." };
  // Regra única (src/lib/password-policy.ts) — barra senha só de espaços antes
  // de qualquer escrita no Auth central. Ver ClickUp 86ajraqhj.
  const forca = validateNewPassword(newPassword);
  if (!forca.ok) return { error: forca.error };
  if (newPassword !== confirmation) return { error: "A confirmação não confere com a nova senha." };

  const currentSession = await signInCentralAuth(user.email, currentPassword);
  if (!currentSession.ok) return { error: "Senha atual incorreta." };
  if (user.auth_user_id && user.auth_user_id !== currentSession.userId) {
    return { error: "A identidade autenticada não corresponde a esta conta." };
  }

  const sql = getSql();
  // Revoga primeiro as demais sessoes Arkom. Se o Auth central falhar, esta
  // sessao recebe a nova versao e a senha antiga continua valida no GoTrue.
  await sql`
    UPDATE profiles
    SET session_version = session_version + 1
    WHERE id = ${user.id}
  `;

  const synced = await syncCentralAuthUser({
    email: user.email,
    fullName: user.full_name,
    expectedUserId: currentSession.userId,
    allowCreate: false,
    password: newPassword,
    updateExistingPassword: true,
    role: user.role,
    mustChangePassword: false,
  });
  if (!synced.ok) {
    console.error("[arkom] Falha ao trocar senha no GoTrue:", synced.error);
    await createSession(user.id);
    await setCentralAuthCookies(currentSession);
    return { error: "Não foi possível atualizar sua senha agora." };
  }

  await sql`
    UPDATE profiles
    SET auth_user_id = ${synced.userId}::uuid,
        must_change_password = 0
    WHERE id = ${user.id}
  `;

  const renewed = await signInCentralAuth(user.email, newPassword);
  if (!renewed.ok) {
    return { error: "Senha alterada, mas não foi possível renovar a sessão. Entre novamente." };
  }
  await createSession(user.id);
  await setCentralAuthCookies(renewed);
  redirect(user.role === "admin" ? "/admin" : "/home");
}
