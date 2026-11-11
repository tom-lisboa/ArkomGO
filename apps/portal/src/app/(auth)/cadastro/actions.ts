"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import {
  deleteCentralAuthUser,
  setCentralArkomAccess,
  setCentralAuthCookies,
  signInCentralAuth,
  syncCentralAuthUser,
} from "@/lib/central-auth";
import { ensureSeeded, getSql } from "@/lib/db";
import { validateNewPassword } from "@/lib/password-policy";
import { provisionMemberForAllSolutions } from "@/lib/remix";

export type CadastroFormState = { error?: string };

type InviteRow = {
  id: number;
  email: string | null;
  role: "admin" | "student";
  status: "unused" | "used" | "expired" | "revoked";
  expires_at: string | null;
};

type ExistingProfile = { id: number; status: "active" | "blocked" | "deleted" };
type RegistrationResult =
  | { ok: true; userId: number; role: "admin" | "student" }
  | { ok: false; error: string };

class RegistrationAbort extends Error {
  constructor(readonly publicMessage: string) {
    super(publicMessage);
    this.name = "RegistrationAbort";
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerAction(
  _previous: CadastroFormState,
  formData: FormData,
): Promise<CadastroFormState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const inviteCode = String(formData.get("invite_code") ?? "").trim();
  const acceptTerms = formData.get("accept_terms") === "on";
  const acceptPrivacy = formData.get("accept_privacy") === "on";

  if (!fullName || !email || !password || !inviteCode) {
    return { error: "Preencha todos os campos para continuar." };
  }
  if (!EMAIL_RE.test(email)) return { error: "Informe um e-mail válido." };
  // Regra única (src/lib/password-policy.ts) — mesma cobrança das outras duas
  // portas que definem senha. Ver ClickUp 86ajraqhj.
  const forca = validateNewPassword(password);
  if (!forca.ok) return { error: forca.error };
  if (!acceptTerms || !acceptPrivacy) {
    return { error: "É necessário aceitar os Termos de Uso e a Política de Privacidade." };
  }

  try {
    await ensureSeeded();
  } catch (error) {
    console.error("[arkom] Cadastro indisponivel sem schema app_arkom:", error);
    return { error: "O cadastro Arkom ainda não está disponível neste ambiente." };
  }
  const sql = getSql();
  let registration: RegistrationResult;
  const centralLink: { current?: { userId: string; created: boolean } } = {};
  try {
    registration = await sql.begin(async (transaction): Promise<RegistrationResult> => {
      const now = new Date().toISOString();

      // Win the invite before touching GoTrue. A concurrent UPDATE blocks on
      // this row and, after this transaction commits, returns zero rows.
      const [invite] = await transaction<InviteRow[]>`
        UPDATE invites
        SET status = 'used', used_at = ${now}
        WHERE upper(code) = upper(${inviteCode}) AND status = 'unused'
        RETURNING id, email, role, status, expires_at
      `;

      if (!invite) {
        const current = (
          await transaction<InviteRow[]>`
            SELECT id, email, role, status, expires_at
            FROM invites
            WHERE upper(code) = upper(${inviteCode})
            LIMIT 1
          `
        )[0];
        if (!current) return { ok: false, error: "Código de convite inválido." };
        if (current.status === "revoked") return { ok: false, error: "Este convite foi revogado." };
        if (current.status === "expired") {
          return { ok: false, error: "Este convite expirou. Solicite um novo código." };
        }
        return { ok: false, error: "Este convite já foi utilizado." };
      }

      const expired =
        invite.expires_at !== null && new Date(invite.expires_at).getTime() < Date.now();
      if (expired) {
        await transaction`UPDATE invites SET status = 'expired' WHERE id = ${invite.id}`;
        return { ok: false, error: "Este convite expirou. Solicite um novo código." };
      }
      if (invite.email && invite.email.trim().toLowerCase() !== email) {
        throw new RegistrationAbort("Este convite foi emitido para outro e-mail.");
      }

      const existing = (
        await transaction<ExistingProfile[]>`
          SELECT id, status FROM profiles WHERE lower(email) = lower(${email}) LIMIT 1
        `
      )[0];
      if (existing && existing.status !== "deleted") {
        throw new RegistrationAbort("Já existe uma conta com este e-mail.");
      }

      const authSync = await syncCentralAuthUser({
        email,
        fullName,
        password,
        verifyExistingPassword: password,
        role: invite.role,
        mustChangePassword: false,
      });
      if (!authSync.ok) {
        console.error("[arkom] Falha ao criar login central no cadastro:", authSync.error);
        throw new RegistrationAbort("Não foi possível criar sua conta agora. Tente novamente.");
      }
      centralLink.current = { userId: authSync.userId, created: authSync.created };

      let userId: number;
      if (existing?.status === "deleted") {
        const [restored] = await transaction<{ id: number }[]>`
          UPDATE profiles
          SET full_name = ${fullName}, email = ${email}, auth_user_id = ${authSync.userId}::uuid,
              password_hash = null, role = ${invite.role}, status = 'active',
              must_change_password = 0, registered_at = ${now}
          WHERE id = ${existing.id}
          RETURNING id
        `;
        userId = restored.id;
      } else {
        const [created] = await transaction<{ id: number }[]>`
          INSERT INTO profiles
            (full_name, email, auth_user_id, password_hash, role, status, must_change_password, registered_at)
          VALUES
            (${fullName}, ${email}, ${authSync.userId}::uuid, ${null}, ${invite.role}, 'active', 0, ${now})
          RETURNING id
        `;
        userId = created.id;
      }

      const consumed = await transaction<{ id: number }[]>`
        UPDATE invites
        SET used_by = ${userId}, used_at = ${now}
        WHERE id = ${invite.id} AND status = 'used' AND used_by IS NULL
        RETURNING id
      `;
      if (consumed.length !== 1) {
        throw new RegistrationAbort("Este convite já foi utilizado.");
      }
      return { ok: true, userId, role: invite.role };
    });
  } catch (error) {
    const linkedCentralUser = centralLink.current;
    if (linkedCentralUser) {
      const cleanup = linkedCentralUser.created
        ? await deleteCentralAuthUser(linkedCentralUser.userId)
        : await setCentralArkomAccess(linkedCentralUser.userId, null);
      if (!cleanup.ok) {
        console.error("[arkom] Falha ao compensar identidade central após rollback:", cleanup.error);
      }
    }
    console.error("[arkom] Cadastro transacional falhou:", error);
    return {
      error:
        error instanceof RegistrationAbort
          ? error.publicMessage
          : "Não foi possível criar sua conta agora. Tente novamente.",
    };
  }
  if (!registration.ok) return { error: registration.error };

  const provisioning = await provisionMemberForAllSolutions(email);
  if (provisioning.failed > 0) {
    console.warn(
      `[arkom] Cadastro concluído com ${provisioning.failed} falha(s) de provisionamento para ${email}.`,
    );
  }

  const centralSession = await signInCentralAuth(email, password);
  if (!centralSession.ok) {
    return { error: "Conta criada, mas não foi possível iniciar a sessão. Entre pela tela de login." };
  }

  await createSession(registration.userId);
  await setCentralAuthCookies(centralSession);
  redirect(registration.role === "admin" ? "/admin" : "/home");
}
