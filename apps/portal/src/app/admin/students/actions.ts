"use server";

// Server actions de gestão de alunos (Story 1.7, RF004/RF005).
// Todas as mutações exigem requireAdmin(). Exclusão é lógica (status='deleted')
// para preservar integridade referencial (convites, progresso, logs).

import { revalidatePath } from "next/cache";
import type postgres from "postgres";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import {
  deleteCentralAuthUser,
  generateTemporaryPassword,
  sendCentralPasswordSetupEmail,
  setCentralArkomAccess,
  syncCentralAuthUser,
} from "@/lib/central-auth";
import {
  createUserWithTemporaryPassword,
  EMAIL_RE,
  findProfileByEmail,
  normalizeProvisioningResult,
  resetCreditsForProfile,
  type ProvisioningFailure,
  type ProvisioningSummary,
} from "@/lib/create-user";
import { getPublicUrl } from "@/lib/public-url";
import { provisionMemberForAllSolutions } from "@/lib/remix";
import { atribuirPlanoAoAluno } from "@/app/admin/plans/actions";

export type ActionResult =
  | {
      ok: true;
      temporaryPassword?: string;
      emailSent?: boolean;
      emailError?: string;
      provisioning?: ProvisioningSummary;
      /** A conta foi salva, mas a atribuição de plano falhou (motivo aqui). */
      planError?: string;
      /** A operação principal valeu, mas um efeito colateral falhou — o admin
       *  precisa saber sem perder o resultado (ex.: senha nova já em vigor,
       *  marcação de troca obrigatória não gravada). */
      warning?: string;
    }
  | { ok: false; error: string };

/** Plano ativo (por plan_id) do perfil — `null` sem plano ou sem a migration
 *  0011 neste ambiente (42P01 degrada em silêncio). */
async function planoAtivoDoPerfil(
  sql: postgres.Sql,
  profileId: number,
): Promise<number | null> {
  try {
    const [row] = await sql<{ plan_id: number | null }[]>`
      SELECT plan_id FROM profile_entitlements
       WHERE profile_id = ${profileId} AND status = 'active' AND plan_id IS NOT NULL
       LIMIT 1
    `;
    return row?.plan_id ?? null;
  } catch (error) {
    if ((error as { code?: string })?.code === "42P01") return null;
    throw error;
  }
}

/** Atribui o plano escolhido no formulário de usuário (criação/edição).
 *  Reaproveita a action canônica de /admin/plans — mesma materialização,
 *  mesmo lançamento de horas no extrato. Falha vira `planError` (a conta em
 *  si já foi salva). */
async function atribuirPlanoDoFormulario(
  profileId: number,
  planId: number,
): Promise<string | undefined> {
  const res = await atribuirPlanoAoAluno(profileId, planId);
  if (!res.ok) return res.error;
  return undefined;
}

export type ImportCsvResult =
  | {
      ok: true;
      created: number;
      ignored: number;
      details: Array<{ line: number; content: string; reason: string }>;
      credentials: Array<{ email: string; password: string }>;
      emailsSent: number;
      emailFailures: Array<{ email: string; reason: string }>;
      provisioned: number;
      provisioningFailed: number;
      provisioningFailures: Array<{
        email: string;
        failed: number;
        failures?: ProvisioningFailure[];
      }>;
    }
  | { ok: false; error: string };

const MAX_CSV_BYTES = 512 * 1024;
const MAX_CSV_LINES = 2_000;

function parseDelimitedLine(line: string): string[] | null {
  let delimiter: "," | ";" | null = null;
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted && (char === "," || char === ";")) {
      delimiter = char;
      break;
    }
  }
  if (quoted || !delimiter) return null;

  const values: string[] = [];
  let value = "";
  quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && char === delimiter) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  if (quoted) return null;
  values.push(value.trim());
  return values;
}

function revalidateAlunos() {
  revalidatePath("/admin/students");
  revalidatePath("/admin");
}

async function sendSetupEmail(email: string, redirectTo: string): Promise<ActionResult> {
  const sent = await sendCentralPasswordSetupEmail({ email, redirectTo });
  if (!sent.ok) {
    console.error(`[arkom] Falha ao enviar e-mail de acesso para ${email}:`, sent.error);
    return { ok: true, emailSent: false, emailError: sent.error };
  }
  return { ok: true, emailSent: true };
}

async function emailEmUso(
  sql: postgres.Sql | postgres.TransactionSql,
  email: string,
  ignoreId?: number
): Promise<boolean> {
  const row = await findProfileByEmail(sql, email, ignoreId);
  return Boolean(row);
}

/** Cria usuário (aluno ou admin — RF005) com senha inicial. Com `plan_id`,
 *  o plano é atribuído na sequência — critério da Tarefa 0: "ao cadastrar
 *  aluno + escolher plano, os direitos materializam automaticamente". */
export async function createUserAction(input: {
  full_name: string;
  email: string;
  password?: string;
  role: "admin" | "student";
  status: "active" | "blocked";
  plan_id?: number | null;
}): Promise<ActionResult> {
  await requireAdmin();

  const result = await createUserWithTemporaryPassword({
    fullName: input.full_name,
    email: input.email,
    role: input.role,
    status: input.status,
    sendSetupEmail: true,
  });
  if (!result.ok) return { ok: false, error: result.error };

  let planError: string | undefined;
  if (Number.isInteger(input.plan_id) && (input.plan_id as number) > 0) {
    const sql = getSql();
    const criado = await findProfileByEmail(sql, input.email.trim().toLowerCase());
    if (criado) {
      planError = await atribuirPlanoDoFormulario(criado.id, input.plan_id as number);
    } else {
      planError = "Conta criada, mas o perfil não foi localizado para atribuir o plano.";
    }
  }

  revalidateAlunos();
  return {
    ok: true,
    temporaryPassword: result.temporaryPassword,
    emailSent: result.emailSent ?? false,
    emailError: result.emailError,
    provisioning: result.provisioning,
    planError,
  };
}

/** Edita usuário (nome, e-mail, perfil, status e senha opcional). */
export async function updateUserAction(
  id: number,
  input: {
    full_name: string;
    email: string;
    role: "admin" | "student";
    status: "active" | "blocked";
    password?: string;
    /** Plano escolhido na edição: se diferente do atual, é atribuído (as
     *  horas do novo plano entram no extrato; o direito anterior vira
     *  histórico). Ausente/igual ⇒ nada muda. Remoção só pela ficha. */
    plan_id?: number | null;
  }
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const fullName = input.full_name.trim();
  const email = input.email.trim().toLowerCase();
  const role = input.role === "admin" ? "admin" : "student";
  const status = input.status === "blocked" ? "blocked" : "active";

  if (!fullName) return { ok: false, error: "Informe o nome completo." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Informe um e-mail válido." };
  if (input.password) {
    return {
      ok: false,
      error: "Por segurança, redefina a senha pelo e-mail de acesso em vez de informar uma senha no admin.",
    };
  }
  if (admin.id === id && (role !== "admin" || status !== "active")) {
    return { ok: false, error: "Você não pode rebaixar ou bloquear a sua própria conta." };
  }

  const sql = getSql();
  const existente = (
    await sql<{
      id: number;
      full_name: string;
      email: string;
      role: "admin" | "student";
      status: "active" | "blocked";
      auth_user_id: string | null;
    }[]>`
      SELECT id, full_name, email, role, status, auth_user_id
      FROM profiles
      WHERE id = ${id} AND status != 'deleted'
    `
  )[0];
  if (!existente) return { ok: false, error: "Usuário não encontrado." };
  if (email !== existente.email.trim().toLowerCase()) {
    return {
      ok: false,
      error:
        "A alteração de e-mail está indisponível porque as reservas das soluções continuam vinculadas ao endereço atual. Crie uma nova conta ou coordene uma transferência segura.",
    };
  }
  if (await emailEmUso(sql, email, id)) {
    return { ok: false, error: "Já existe outra conta com este e-mail." };
  }

  const authSync = await syncCentralAuthUser({
    previousEmail: existente.email,
    email,
    fullName,
    expectedUserId: existente.auth_user_id,
    allowCreate: false,
    role: status === "active" ? role : null,
  });
  if (!authSync.ok) {
    return { ok: false, error: `Não foi possível sincronizar o login das soluções: ${authSync.error}` };
  }

  try {
    await sql`
      UPDATE profiles
      SET full_name = ${fullName}, email = ${email}, auth_user_id = ${authSync.userId}::uuid,
          role = ${role}, status = ${status},
          session_version = session_version + CASE WHEN status != ${status} THEN 1 ELSE 0 END
      WHERE id = ${id}
    `;
  } catch (error) {
    const rollback = await syncCentralAuthUser({
      previousEmail: email,
      email: existente.email,
      fullName: existente.full_name,
      expectedUserId: authSync.userId,
      allowCreate: false,
      role: existente.status === "active" ? existente.role : null,
    });
    if (!rollback.ok) {
      console.error("[arkom] Falha ao compensar edicao no Auth central:", rollback.error);
    }
    console.error("[arkom] Falha ao atualizar perfil local:", error);
    return { ok: false, error: "Não foi possível atualizar o perfil no banco do Arkom." };
  }

  let planError: string | undefined;
  if (Number.isInteger(input.plan_id) && (input.plan_id as number) > 0) {
    const planoAtual = await planoAtivoDoPerfil(sql, id);
    if (planoAtual !== input.plan_id) {
      planError = await atribuirPlanoDoFormulario(id, input.plan_id as number);
    }
  }

  revalidateAlunos();
  revalidatePath(`/admin/students/${id}`);
  return { ok: true, planError };
}

/** Reenvia o e-mail do Supabase para definir/trocar senha. Quando o envio
 *  falha, o motivo REAL sobe para a tela: "não foi possível" sozinho é um beco
 *  sem saída para quem opera o admin (era o limite do mailer embutido, e quem
 *  clicava não tinha como saber). */
export async function sendAccessEmailAction(id: number): Promise<ActionResult> {
  await requireAdmin();

  const sql = getSql();
  const row = (
    await sql<{ email: string; status: string }[]>`
      SELECT email, status
      FROM profiles
      WHERE id = ${id} AND status != 'deleted'
      LIMIT 1
    `
  )[0];

  if (!row) return { ok: false, error: "Usuário não encontrado." };
  if (row.status === "blocked") {
    return { ok: false, error: "Desbloqueie o usuário antes de enviar o e-mail de acesso." };
  }

  let redirectTo: string;
  try {
    redirectTo = await getPublicUrl("/definir-senha");
  } catch (error) {
    console.error("[arkom] URL publica invalida para o e-mail de acesso:", error);
    return {
      ok: false,
      error:
        "A URL pública do Arkom não está configurada, então o link do e-mail iria para o endereço errado. Configure APP_URL antes de reenviar.",
    };
  }

  const emailResult = await sendSetupEmail(row.email, redirectTo);
  if (!emailResult.ok || !emailResult.emailSent) {
    const motivo = emailResult.ok ? emailResult.emailError : emailResult.error;
    return {
      ok: false,
      error: motivo
        ? `Não foi possível enviar o e-mail de acesso: ${motivo}`
        : "Não foi possível enviar o e-mail de acesso. Tente de novo em alguns minutos.",
    };
  }
  return { ok: true, emailSent: true };
}

/**
 * Gera uma NOVA senha temporária e devolve para ser mostrada na tela — a única
 * saída de suporte que não depende da caixa de e-mail do aluno. Até aqui as
 * alternativas eram o e-mail de acesso (exige a caixa dele) ou excluir e
 * recriar a conta, que encerra plano e saldo (resetCreditsForProfile). Esta
 * ação não toca em direito nem no ledger: troca a credencial e nada mais.
 *
 * A senha nova vale na hora, a antiga morre, as sessões abertas caem
 * (session_version) e o próximo acesso cai na troca obrigatória. A senha só
 * existe neste retorno — o banco guarda hash, não dá para consultar depois.
 */
export async function gerarNovaSenhaTemporariaAction(id: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (admin.id === id) {
    return {
      ok: false,
      error:
        "Você não pode gerar uma senha temporária para a sua própria conta. Troque a sua senha em Configurações.",
    };
  }

  const sql = getSql();
  const row = (
    await sql<{
      full_name: string;
      email: string;
      role: "admin" | "student";
      status: "active" | "blocked";
      auth_user_id: string | null;
    }[]>`
      SELECT full_name, email, role, status, auth_user_id
      FROM profiles
      WHERE id = ${id} AND status != 'deleted'
      LIMIT 1
    `
  )[0];
  if (!row) return { ok: false, error: "Usuário não encontrado." };
  if (row.status === "blocked") {
    return {
      ok: false,
      error: "Desbloqueie o usuário antes de gerar uma nova senha temporária.",
    };
  }
  // Guard de propriedade: sem auth_user_id vinculado, o login central deste
  // e-mail pode pertencer a outro produto — e senha de identidade que o Arkom
  // não linkou não se sobrescreve (mesmo guard de syncCentralAuthUser, dito
  // na tela em vez de virar um sucesso silencioso sem senha).
  if (!row.auth_user_id) {
    return {
      ok: false,
      error:
        "Este usuário ainda não tem login vinculado a esta plataforma. Envie o e-mail de acesso uma vez para vincular a identidade antes de gerar a senha por aqui.",
    };
  }

  const novaSenha = generateTemporaryPassword();
  const authSync = await syncCentralAuthUser({
    email: row.email,
    fullName: row.full_name,
    expectedUserId: row.auth_user_id,
    password: novaSenha,
    updateExistingPassword: true,
    role: row.role,
    mustChangePassword: true,
  });
  if (!authSync.ok) {
    return {
      ok: false,
      error: `Não foi possível redefinir a senha no login das soluções: ${authSync.error}`,
    };
  }
  if (!authSync.passwordApplied) {
    return {
      ok: false,
      error:
        "O login central deste e-mail não é gerenciado por esta plataforma e a senha não foi alterada. Use o e-mail de acesso.",
    };
  }

  // A senha nova JÁ vale a partir daqui. Se a marcação local falhar, o admin
  // recebe a senha mesmo assim (com aviso): engolir o erro deixaria o usuário
  // com uma credencial trocada que ninguém conhece.
  let warning: string | undefined;
  try {
    await sql`
      UPDATE profiles
      SET must_change_password = 1,
          session_version = session_version + 1
      WHERE id = ${id}
    `;
  } catch (error) {
    console.error("[arkom] Falha ao marcar troca obrigatoria apos nova senha temporaria:", error);
    warning =
      "A senha nova já está valendo, mas não foi possível marcar a troca obrigatória nem encerrar as sessões abertas deste usuário.";
  }

  revalidateAlunos();
  revalidatePath(`/admin/students/${id}`);
  return { ok: true, temporaryPassword: novaSenha, warning };
}

/** Alterna bloqueio: active ⇄ blocked. Bloqueado não consegue mais logar. */
export async function toggleBlockAction(id: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (admin.id === id) {
    return { ok: false, error: "Você não pode bloquear a sua própria conta." };
  }

  const sql = getSql();
  const row = (
    await sql<{
      status: "active" | "blocked";
      role: "admin" | "student";
      auth_user_id: string | null;
    }[]>`
      SELECT status, role, auth_user_id
      FROM profiles
      WHERE id = ${id} AND status != 'deleted'
    `
  )[0];
  if (!row) return { ok: false, error: "Usuário não encontrado." };

  const novoStatus = row.status === "blocked" ? "active" : "blocked";
  if (row.auth_user_id) {
    const access = await setCentralArkomAccess(
      row.auth_user_id,
      novoStatus === "active" ? row.role : null,
    );
    if (!access.ok) {
      return { ok: false, error: `Não foi possível sincronizar o acesso central: ${access.error}` };
    }
  }
  try {
    await sql`
      UPDATE profiles
      SET status = ${novoStatus},
          session_version = session_version + 1
      WHERE id = ${id}
    `;
  } catch (error) {
    if (row.auth_user_id) {
      const rollback = await setCentralArkomAccess(
        row.auth_user_id,
        row.status === "active" ? row.role : null,
      );
      if (!rollback.ok) {
        console.error("[arkom] Falha ao compensar bloqueio no Auth central:", rollback.error);
      }
    }
    console.error("[arkom] Falha ao alternar status local:", error);
    return { ok: false, error: "Não foi possível alterar o status no banco do Arkom." };
  }

  revalidateAlunos();
  revalidatePath(`/admin/students/${id}`);
  return { ok: true };
}

/** Exclui usuário (exclusão lógica — some das listas e perde o acesso). */
export async function deleteUserAction(id: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (admin.id === id) {
    return { ok: false, error: "Você não pode excluir a sua própria conta." };
  }

  const sql = getSql();
  const row = (
    await sql<{
      id: number;
      auth_user_id: string | null;
      role: "admin" | "student";
      status: "active" | "blocked";
    }[]>`
      SELECT id, auth_user_id, role, status
      FROM profiles
      WHERE id = ${id} AND status != 'deleted'
    `
  )[0];
  if (!row) return { ok: false, error: "Usuário não encontrado." };

  if (row.auth_user_id) {
    const access = await setCentralArkomAccess(row.auth_user_id, null);
    if (!access.ok) {
      return { ok: false, error: `Não foi possível revogar o acesso central: ${access.error}` };
    }
  }
  try {
    await sql`
      UPDATE profiles
      SET status = 'deleted', session_version = session_version + 1
      WHERE id = ${id}
    `;
  } catch (error) {
    if (row.auth_user_id) {
      const rollback = await setCentralArkomAccess(
        row.auth_user_id,
        row.status === "active" ? row.role : null,
      );
      if (!rollback.ok) {
        console.error("[arkom] Falha ao compensar exclusao no Auth central:", rollback.error);
      }
    }
    console.error("[arkom] Falha ao excluir perfil local:", error);
    return { ok: false, error: "Não foi possível excluir o perfil no banco do Arkom." };
  }

  // Conta excluída não segura direito nem saldo: revoga os entitlements ativos
  // e compensa o saldo positivo no ledger. Sem isso, o recadastro com o mesmo
  // e-mail herda um entitlement órfão e a atribuição de plano falha.
  await resetCreditsForProfile(sql, id, {
    note: "Conta excluída — créditos remanescentes revogados",
    keyPrefix: "delete_zero",
    actorProfileId: admin.id,
    actorLabel: admin.email,
  });

  revalidateAlunos();
  return { ok: true };
}

/**
 * Importa alunos via CSV (uma linha por aluno: `nome,email`).
 * Cria alunos ativos com senha temporária gerada automaticamente.
 * Retorna relatório: N criados, N ignorados (duplicado/linha inválida).
 */
export async function importCsvAction(csvText: string): Promise<ImportCsvResult> {
  await requireAdmin();

  if (!csvText || !csvText.trim()) {
    return { ok: false, error: "O arquivo enviado está vazio." };
  }
  if (new TextEncoder().encode(csvText).byteLength > MAX_CSV_BYTES) {
    return { ok: false, error: "O CSV deve ter no máximo 512 KB." };
  }

  const sql = getSql();

  const lines = csvText.split(/\r?\n/);
  if (lines.length > MAX_CSV_LINES) {
    return { ok: false, error: `O CSV deve ter no máximo ${MAX_CSV_LINES} linhas.` };
  }
  let redirectTo: string;
  try {
    redirectTo = await getPublicUrl("/definir-senha");
  } catch (error) {
    console.error("[arkom] URL publica invalida para importacao:", error);
    return { ok: false, error: "Configure a URL pública canônica antes de importar contas." };
  }
  const vistosNoArquivo = new Set<string>();
  const details: Array<{ line: number; content: string; reason: string }> = [];
  const criados: string[] = [];
  const credentials: Array<{ email: string; password: string }> = [];
  const emailFailures: Array<{ email: string; reason: string }> = [];
  let created = 0;
  let ignored = 0;
  let emailsSent = 0;
  let provisioned = 0;
  let provisioningFailed = 0;
  const provisioningFailures: Array<{
    email: string;
    failed: number;
    failures?: ProvisioningFailure[];
  }> = [];

  for (const [index, rawLine] of lines.entries()) {
      const lineNumber = index + 1;
      const line = rawLine.trim();
      if (!line) continue; // linha em branco não conta no relatório

      const parts = parseDelimitedLine(line);
      if (index === 0 && parts?.length === 2 && /^nome$/i.test(parts[0]) && /^e-?mail$/i.test(parts[1])) {
        continue;
      }
      const nome = parts?.[0] ?? "";
      const email = (parts?.[1] ?? "").toLowerCase();

      if (!parts || parts.length !== 2 || !nome || !email) {
        ignored++;
        details.push({ line: lineNumber, content: line, reason: "Linha inválida (esperado: nome,email)" });
        continue;
      }
      if (!EMAIL_RE.test(email)) {
        ignored++;
        details.push({ line: lineNumber, content: line, reason: "E-mail inválido" });
        continue;
      }
      if (vistosNoArquivo.has(email)) {
        ignored++;
        details.push({ line: lineNumber, content: line, reason: "E-mail duplicado no arquivo" });
        continue;
      }
      vistosNoArquivo.add(email);
      const existing = await findProfileByEmail(sql, email);
      if (existing && existing.status !== "deleted") {
        ignored++;
        details.push({ line: lineNumber, content: line, reason: "E-mail já cadastrado" });
        continue;
      }

      // Mesmo contrato da criação avulsa: recadastro de conta excluída deste
      // app redefine a senha da identidade vinculada (senão a credencial
      // gerada aqui nunca vale e o relatório sai sem a senha do restaurado).
      const restauracaoVinculada =
        existing?.status === "deleted" && Boolean(existing.auth_user_id);
      const temporaryPassword = generateTemporaryPassword();
      const authSync = await syncCentralAuthUser({
        email,
        fullName: nome,
        expectedUserId: existing?.auth_user_id,
        password: temporaryPassword,
        updateExistingPassword: restauracaoVinculada,
        role: "student",
        mustChangePassword: true,
      });
      if (!authSync.ok) {
        ignored++;
        details.push({ line: lineNumber, content: line, reason: "Falha ao criar ou vincular login central" });
        continue;
      }

      try {
        if (existing?.status === "deleted") {
          await sql`
            UPDATE profiles
            SET full_name = ${nome},
                email = ${email},
                auth_user_id = ${authSync.userId}::uuid,
                password_hash = null,
                role = 'student',
                status = 'active',
                must_change_password = 1,
                registered_at = ${new Date().toISOString()}
            WHERE id = ${existing.id}
          `;
        } else {
          await sql`
            INSERT INTO profiles (full_name, email, auth_user_id, password_hash, role, status, must_change_password, registered_at)
            VALUES (${nome}, ${email}, ${authSync.userId}::uuid, ${null}, 'student', 'active', 1, ${new Date().toISOString()})
          `;
        }
      } catch (error) {
        const cleanup = authSync.created
          ? await deleteCentralAuthUser(authSync.userId)
          : await setCentralArkomAccess(authSync.userId, null);
        if (!cleanup.ok) {
          console.error(`[arkom] Falha ao compensar importacao de ${email}:`, cleanup.error);
        }
        console.error(`[arkom] Falha ao gravar linha ${lineNumber} do CSV:`, error);
        ignored++;
        details.push({ line: lineNumber, content: line, reason: "Falha ao gravar conta no Arkom" });
        continue;
      }
      if (existing?.status === "deleted") {
        await resetCreditsForProfile(sql, existing.id, {
          note: "Recadastro via CSV — direitos e saldo da conta anterior encerrados",
          keyPrefix: "restore_zero",
        });
      }
      criados.push(email);
      if (authSync.created || restauracaoVinculada) {
        credentials.push({ email, password: temporaryPassword });
      }
      created++;
  }

  // Provisiona no central cada membro criado fora da transação Postgres.
  // Best-effort; importações grandes levam mais tempo aqui.
  for (const email of criados) {
    const provisioning = normalizeProvisioningResult(
      await provisionMemberForAllSolutions(email),
    );
    provisioned += provisioning.provisioned;
    provisioningFailed += provisioning.failed;
    if (provisioning.failed > 0) {
      provisioningFailures.push({
        email,
        failed: provisioning.failed,
        failures: provisioning.failures,
      });
    }
    const emailResult = await sendSetupEmail(email, redirectTo);
    if (emailResult.ok && emailResult.emailSent) {
      emailsSent++;
    } else {
      emailFailures.push({
        email,
        reason: emailResult.ok
          ? (emailResult.emailError ?? "Falha ao enviar pelo Supabase")
          : emailResult.error,
      });
    }
  }

  revalidateAlunos();
  return {
    ok: true,
    created,
    ignored,
    details,
    credentials,
    emailsSent,
    emailFailures,
    provisioned,
    provisioningFailed,
    provisioningFailures,
  };
}
