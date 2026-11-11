// lib/create-user.ts — Núcleo compartilhado de criação de usuário com senha temporária.
// Usado pela server action do admin (/admin/students) e pelo endpoint programático
// POST /api/admin/users. Fluxo único: Auth central → profile local (com compensação
// em caso de falha) → provisionamento nas soluções → e-mail de acesso opcional.
// A conta nasce com must_change_password=1: o aluno troca a senha no primeiro acesso.

import type postgres from "postgres";
import { ensureSeeded, getSql } from "@/lib/db";
import {
  deleteCentralAuthUser,
  generateTemporaryPassword,
  sendCentralPasswordSetupEmail,
  setCentralArkomAccess,
  syncCentralAuthUser,
} from "@/lib/central-auth";
import { appendMovement } from "@/lib/credit-ledger";
import { getPublicUrl } from "@/lib/public-url";
import { provisionMemberForAllSolutions } from "@/lib/remix";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProvisioningFailure = {
  solution: string;
  solutionName?: string;
  error: string;
};

export type ProvisioningSummary = {
  provisioned: number;
  failed: number;
  failures?: ProvisioningFailure[];
};

export type EmailProfileRow = {
  id: number;
  auth_user_id: string | null;
  status: "active" | "blocked" | "deleted";
};

export type CreatedUser = {
  id: number;
  full_name: string;
  email: string;
  role: "admin" | "student";
  status: "active" | "blocked";
  registered_at: string;
  must_change_password: number;
};

export type CreateUserErrorCode =
  | "validation"
  | "conflict"
  | "config"
  | "unavailable"
  | "central"
  | "storage";

export type CreateUserCoreResult =
  | {
      ok: true;
      user: CreatedUser;
      /** Presente sempre que a senha temporária foi APLICADA: login novo OU re-add
       *  de conta vinculada (a senha antiga é invalidada — decisão do dono: o e-mail
       *  de acesso deve sempre redefinir de verdade). Ausente só quando o login
       *  central foi encontrado por e-mail sem vínculo prévio (guard de propriedade:
       *  não sobrescrevemos senha de identidade que o Arkom ainda não linkou). */
      temporaryPassword?: string;
      emailSent?: boolean;
      emailError?: string;
      provisioning: ProvisioningSummary;
    }
  | { ok: false; code: CreateUserErrorCode; error: string };

export function normalizeProvisioningResult(result: unknown): ProvisioningSummary {
  const value = result as {
    provisioned?: unknown;
    failed?: unknown;
    failures?: unknown;
  } | null;
  const provisioned =
    typeof value?.provisioned === "number" && Number.isFinite(value.provisioned)
      ? value.provisioned
      : 0;
  const failed =
    typeof value?.failed === "number" && Number.isFinite(value.failed)
      ? value.failed
      : 0;
  const failures = Array.isArray(value?.failures)
    ? value.failures.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const candidate = item as {
          solution?: unknown;
          solutionName?: unknown;
          error?: unknown;
        };
        if (typeof candidate.solution !== "string" || typeof candidate.error !== "string") {
          return [];
        }
        return [{
          solution: candidate.solution,
          solutionName:
            typeof candidate.solutionName === "string"
              ? candidate.solutionName
              : undefined,
          error: candidate.error,
        }];
      })
    : undefined;
  return failures?.length ? { provisioned, failed, failures } : { provisioned, failed };
}

export async function findProfileByEmail(
  sql: postgres.Sql | postgres.TransactionSql,
  email: string,
  ignoreId?: number
): Promise<EmailProfileRow | undefined> {
  const row = ignoreId
    ? (
        await sql<EmailProfileRow[]>`
          SELECT id, auth_user_id, status
          FROM profiles
          WHERE lower(email) = lower(${email}) AND id != ${ignoreId}
          LIMIT 1
        `
      )[0]
    : (
        await sql<EmailProfileRow[]>`
          SELECT id, auth_user_id, status
          FROM profiles
          WHERE lower(email) = lower(${email})
          LIMIT 1
        `
      )[0];
  return row;
}

/**
 * Encerra a vida financeira de um perfil: revoga os entitlements ativos e zera
 * um saldo positivo remanescente com um `plan_revoke` compensatório (o ledger é
 * append-only — zerar É lançar). Usado na exclusão e no recadastro, para que a
 * conta restaurada comece do zero e a atribuição de plano não esbarre em
 * "já está no plano" por causa de um entitlement órfão da conta anterior.
 * Best-effort: sem a migration 0011 no ambiente (42P01), sai em silêncio.
 */
export async function resetCreditsForProfile(
  sql: postgres.Sql,
  profileId: number,
  input: {
    note: string;
    keyPrefix: string;
    actorProfileId?: number | null;
    actorLabel?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    await sql.begin(async (tx) => {
      await tx`
        UPDATE profile_entitlements
           SET status = 'revoked', updated_at = now()
         WHERE profile_id = ${profileId} AND status = 'active'
      `;
      const [ledger] = await tx<{ balance: number; last_id: number }[]>`
        SELECT COALESCE(SUM(delta), 0)::int AS balance, COALESCE(MAX(id), 0)::int AS last_id
          FROM credit_ledger
         WHERE profile_id = ${profileId}
      `;
      if ((ledger?.balance ?? 0) > 0) {
        // Chave amarrada ao último movimento: repetir a MESMA limpeza dedupa;
        // uma limpeza futura (após novos lançamentos) gera outra chave.
        await appendMovement(tx, {
          profileId,
          delta: -ledger.balance,
          reason: "plan_revoke",
          note: input.note,
          ref: null,
          operationKey: `${input.keyPrefix}:perfil=${profileId}:apos=${ledger.last_id}`,
          eventId: null,
          entitlementId: null,
          actorProfileId: input.actorProfileId ?? null,
          actorLabel: input.actorLabel ?? null,
        });
      }
    });
    return { ok: true };
  } catch (error) {
    if ((error as { code?: string })?.code === "42P01") return { ok: true };
    console.error(`[arkom] Falha ao encerrar créditos do perfil ${profileId}:`, error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Cria (ou restaura, se a conta estava 'deleted') um usuário com senha temporária.
 * Não faz autorização: o chamador é responsável pelo guard (requireAdmin ou
 * Bearer key do endpoint). `sendSetupEmail` envia o e-mail de definição de senha
 * quando a conta nasce ativa — exige APP_URL pública configurada (fail-closed).
 */
export async function createUserWithTemporaryPassword(input: {
  fullName: string;
  email: string;
  role?: "admin" | "student";
  status?: "active" | "blocked";
  sendSetupEmail?: boolean;
}): Promise<CreateUserCoreResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const role = input.role === "admin" ? "admin" : "student";
  const status = input.status === "blocked" ? "blocked" : "active";

  if (!fullName) {
    return { ok: false, code: "validation", error: "Informe o nome completo." };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, code: "validation", error: "Informe um e-mail válido." };
  }

  try {
    await ensureSeeded();
  } catch (error) {
    console.error("[arkom] Criacao de usuario indisponivel sem o schema transacional:", error);
    return {
      ok: false,
      code: "unavailable",
      error: "A criação de contas não está disponível neste ambiente.",
    };
  }

  const sql = getSql();
  const existing = await findProfileByEmail(sql, email);
  if (existing && existing.status !== "deleted") {
    return { ok: false, code: "conflict", error: "Já existe uma conta com este e-mail." };
  }

  let setupRedirectTo: string | null = null;
  if (input.sendSetupEmail && status === "active") {
    try {
      setupRedirectTo = await getPublicUrl("/definir-senha");
    } catch (error) {
      console.error("[arkom] URL publica invalida para e-mail de acesso:", error);
      return {
        ok: false,
        code: "config",
        error: "Configure a URL pública canônica antes de criar contas ativas.",
      };
    }
  }

  // A senha temporária é SEMPRE oferecida ao sync; o guard de propriedade em
  // syncCentralAuthUser só a aplica quando a identidade central é nova ou já
  // está vinculada a este app (expectedUserId) — identidade de outro produto
  // segue intocada e `passwordApplied` volta false.
  const temporaryPassword = generateTemporaryPassword();
  const authSync = await syncCentralAuthUser({
    email,
    fullName,
    expectedUserId: existing?.auth_user_id,
    password: temporaryPassword,
    updateExistingPassword: true,
    role: status === "active" ? role : null,
    mustChangePassword: true,
  });
  if (!authSync.ok) {
    return {
      ok: false,
      code: "central",
      error: `Não foi possível criar o login das soluções: ${authSync.error}`,
    };
  }

  let user: CreatedUser | undefined;
  try {
    if (existing?.status === "deleted") {
      user = (
        await sql<CreatedUser[]>`
          UPDATE profiles
          SET full_name = ${fullName},
              email = ${email},
              auth_user_id = ${authSync.userId}::uuid,
              password_hash = null,
              role = ${role},
              status = ${status},
              must_change_password = 1,
              registered_at = ${new Date().toISOString()}
          WHERE id = ${existing.id}
          RETURNING id, full_name, email, role, status, registered_at, must_change_password
        `
      )[0];
    } else {
      user = (
        await sql<CreatedUser[]>`
          INSERT INTO profiles (full_name, email, auth_user_id, password_hash, role, status, must_change_password, registered_at)
          VALUES (${fullName}, ${email}, ${authSync.userId}::uuid, ${null}, ${role}, ${status}, 1, ${new Date().toISOString()})
          RETURNING id, full_name, email, role, status, registered_at, must_change_password
        `
      )[0];
    }
    if (!user) throw new Error("gravacao do profile nao retornou a linha criada");
  } catch (error) {
    const cleanup = authSync.created
      ? await deleteCentralAuthUser(authSync.userId)
      : await setCentralArkomAccess(authSync.userId, null);
    if (!cleanup.ok) {
      console.error("[arkom] Falha ao compensar Auth apos erro local:", cleanup.error);
    }
    console.error("[arkom] Falha ao gravar usuario local:", error);
    return {
      ok: false,
      code: "storage",
      error: "Não foi possível gravar o usuário no banco do Arkom.",
    };
  }

  // Conta restaurada recomeça do zero: entitlements da vida anterior viram
  // histórico e o saldo positivo é compensado — senão a atribuição de plano na
  // sequência falha ("já está no plano") e os créditos antigos somam em dobro.
  if (existing?.status === "deleted") {
    await resetCreditsForProfile(sql, user.id, {
      note: "Recadastro — direitos e saldo da conta anterior encerrados",
      keyPrefix: "restore_zero",
    });
  }

  // Provisionamento automático no central: criar a conta aqui = reservar as orgs
  // do membro nas soluções (best-effort — não falha a criação se o central cair).
  const provisioning = normalizeProvisioningResult(
    await provisionMemberForAllSolutions(email),
  );

  let emailSent: boolean | undefined;
  let emailError: string | undefined;
  if (setupRedirectTo) {
    const sent = await sendCentralPasswordSetupEmail({ email, redirectTo: setupRedirectTo });
    if (sent.ok) {
      emailSent = true;
    } else {
      console.error(`[arkom] Falha ao enviar e-mail de acesso para ${email}:`, sent.error);
      emailSent = false;
      emailError = sent.error;
    }
  }

  return {
    ok: true,
    user,
    temporaryPassword: authSync.passwordApplied ? temporaryPassword : undefined,
    emailSent,
    emailError,
    provisioning,
  };
}
