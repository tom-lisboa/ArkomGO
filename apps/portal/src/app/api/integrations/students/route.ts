// POST /api/integrations/students — cadastro de aluno para automações (n8n etc.)
// com contrato "automation-friendly": desfechos de NEGÓCIO respondem sempre 200
// com um campo `status` ("created" | "already_exists"), para o cliente HTTP da
// automação não tratar duplicata como exceção. Erros de segurança/infra seguem
// com status HTTP de erro (401/503/…) de propósito — automação DEVE falhar neles.
//
// Mesma autenticação do POST /api/admin/users: `Authorization: Bearer
// <ARKOM_USERS_API_KEY>`, fail-closed (503 sem a env). Este endpoint NÃO passa
// pela porta de borda do middleware (fora de /api/admin) — a barreira é a
// própria Bearer key, verificada em tempo constante aqui no handler.
//
// Corpo aceito (application/json): { full_name, email, send_email?, plan? }.
// Campos desconhecidos são rejeitados. Todo usuário nasce aluno ativo
// (role=student) com must_change_password=1 — troca obrigatória no 1º acesso.
//
// `plan` (opcional, retrocompatível): slug de um plano PUBLICADO e não
// permissivo (ex.: basico | tracao | enterprise — a lista vive no banco,
// Admin → Planos). Slug inválido → 400 ANTES de criar o aluno. Sem `plan`,
// o comportamento é o de sempre: aluno criado sem entitlement (cai no
// fallback legado permissivo do sistema de créditos até alguém atribuir).
//
// Resposta 200:
//   { status: "created", name, email, temporaryPassword, emailSent?, message }
//     — temporaryPassword é null APENAS quando o login central já existia sem
//       vínculo com o Arkom (guard de propriedade: a senha atual é preservada;
//       use send_email: true para o aluno definir a própria senha).
//     — com `plan`: + { plan, planAssigned: true, planName, creditsGranted,
//       planExpiresAt } quando a concessão gravou; se a concessão falhar o
//       aluno JÁ EXISTE, então segue 200 "created" com { plan,
//       planAssigned: false, planError } — a automação deve alertar um humano
//       (correção manual em Admin → Planos), nunca repetir o POST às cegas.
//   { status: "already_exists", name, email, message }
//     — já existe conta ativa/bloqueada com este e-mail; nada foi criado.
//       Se `plan` veio junto, ele NÃO é aplicado (troca de plano de aluno
//       existente é manual, no admin) — resposta ganha planApplied: false.

import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { noStoreJson } from "@/app/api/auth/_shared";
import { createUserWithTemporaryPassword, EMAIL_RE } from "@/lib/create-user";
import { getSql } from "@/lib/db";
import {
  buscarPlanoVendavelPorSlug,
  concederPlano,
  listarSlugsVendaveis,
  type PlanoRow,
} from "@/lib/plan-grant";

export const dynamic = "force-dynamic";

const API_KEY_ENV = "ARKOM_USERS_API_KEY";
const MIN_KEY_LENGTH = 32;
const MAX_BODY_BYTES = 16_384;
const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 320;
const MAX_PLAN_LENGTH = 100;
const ALLOWED_FIELDS = ["full_name", "email", "send_email", "plan"] as const;
/** Ator gravado no ledger quando a concessão vem desta integração (sem sessão). */
const INTEGRATION_ACTOR = { profileId: null, label: "integração:students-api" } as const;

// Rate limit best-effort em memória (instância única no Railway).
// Defesa em profundidade — a autorização Bearer é a barreira principal.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 10;
const rateHits = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateHits.get(key);
  if (!entry || now - entry.windowStart >= RATE_WINDOW_MS) {
    if (rateHits.size > 10_000) {
      for (const [hitKey, value] of rateHits) {
        if (now - value.windowStart >= RATE_WINDOW_MS) rateHits.delete(hitKey);
      }
    }
    rateHits.set(key, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX_REQUESTS;
}

/** Comparação em tempo constante, indiferente a tamanhos distintos. */
function timingSafeEquals(candidate: string, expected: string): boolean {
  const candidateHash = crypto.createHash("sha256").update(candidate, "utf8").digest();
  const expectedHash = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(candidateHash, expectedHash);
}

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token || null;
}

export async function POST(request: NextRequest) {
  const configuredKey = process.env[API_KEY_ENV] ?? "";
  if (configuredKey.length < MIN_KEY_LENGTH) {
    return noStoreJson(
      {
        error: `Endpoint desabilitado. Configure ${API_KEY_ENV} (mínimo ${MIN_KEY_LENGTH} caracteres) no ambiente do servidor.`,
      },
      { status: 503 },
    );
  }

  const token = bearerToken(request);
  if (!token || !timingSafeEquals(token, configuredKey)) {
    return noStoreJson({ error: "Não autorizado." }, { status: 401 });
  }

  const clientIp =
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (isRateLimited(clientIp)) {
    return noStoreJson(
      { error: "Muitas requisições. Aguarde um instante e tente novamente." },
      { status: 429 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return noStoreJson({ error: "Envie o corpo como application/json." }, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return noStoreJson({ error: "Corpo da requisição grande demais." }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("payload nao e um objeto JSON");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return noStoreJson({ error: "JSON inválido." }, { status: 400 });
  }

  const unknownFields = Object.keys(body).filter(
    (key) => !(ALLOWED_FIELDS as readonly string[]).includes(key),
  );
  if (unknownFields.length > 0) {
    return noStoreJson(
      {
        error:
          `Campos não suportados: ${unknownFields.join(", ")}. ` +
          `Campos aceitos: ${ALLOWED_FIELDS.join(", ")}. ` +
          "O mínimo para criar um aluno é full_name + email.",
      },
      { status: 400 },
    );
  }

  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const sendEmail = body.send_email === true;

  if (!fullName || fullName.length > MAX_NAME_LENGTH) {
    return noStoreJson(
      { error: `Informe full_name com 1 a ${MAX_NAME_LENGTH} caracteres.` },
      { status: 400 },
    );
  }
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return noStoreJson({ error: "Informe um e-mail válido." }, { status: 400 });
  }

  // `plan` é validado ANTES de criar o aluno: slug inválido é 400 sem efeito
  // colateral. A ausência do campo mantém o contrato original intocado.
  let plano: PlanoRow | null = null;
  if (body.plan !== undefined) {
    const planSlug =
      typeof body.plan === "string" ? body.plan.trim().toLowerCase() : "";
    if (!planSlug || planSlug.length > MAX_PLAN_LENGTH) {
      return noStoreJson(
        { error: "Informe plan como o slug de um plano publicado (ex.: basico)." },
        { status: 400 },
      );
    }
    try {
      const sql = getSql();
      plano = await buscarPlanoVendavelPorSlug(sql, planSlug);
      if (!plano) {
        const validos = await listarSlugsVendaveis(sql);
        return noStoreJson(
          {
            error:
              `Plano "${planSlug}" inválido. ` +
              (validos.length > 0
                ? `Planos disponíveis: ${validos.join(", ")}.`
                : "Nenhum plano publicado disponível para integração."),
          },
          { status: 400 },
        );
      }
    } catch (error) {
      console.error("[arkom] Falha ao validar plano na integração de alunos:", error);
      return noStoreJson(
        { error: "Não foi possível validar o plano agora. Tente novamente." },
        { status: 503 },
      );
    }
  }

  const result = await createUserWithTemporaryPassword({
    fullName,
    email,
    role: "student",
    status: "active",
    sendSetupEmail: sendEmail,
  });

  if (!result.ok) {
    // Duplicata é desfecho de negócio, não exceção: 200 com status explícito
    // para a automação decidir o fluxo sem try/catch.
    if (result.code === "conflict") {
      return noStoreJson({
        status: "already_exists",
        name: fullName,
        email,
        // Troca de plano de aluno existente é decisão manual (Admin → Planos):
        // replay da automação não pode revogar/recreditar direito vigente.
        ...(plano ? { plan: plano.slug, planApplied: false } : {}),
        message: plano
          ? `Já existe uma conta com este e-mail. Nada foi criado e o plano "${plano.slug}" NÃO foi aplicado — troca de plano de aluno existente é manual, em Admin → Planos.`
          : "Já existe uma conta com este e-mail. Nada foi criado.",
      });
    }
    // Erros reais (validação, config, banco, Auth central) permanecem com
    // status HTTP de erro — a automação deve enxergá-los como falha.
    const status =
      result.code === "validation"
        ? 400
        : result.code === "unavailable" || result.code === "config"
          ? 503
          : 502;
    return noStoreJson({ error: result.error }, { status });
  }

  // Concessão do plano DEPOIS do aluno criado, no mesmo padrão do fluxo admin
  // (students/actions.ts): falha aqui NÃO desfaz a conta — vira planError para
  // a automação alertar um humano (correção manual em Admin → Planos).
  let planGrant: { creditados: number; expiresAt: string | null } | null = null;
  let planError: string | undefined;
  if (plano) {
    try {
      planGrant = await concederPlano(getSql(), {
        profileId: result.user.id,
        plano,
        actor: INTEGRATION_ACTOR,
      });
    } catch (error) {
      console.error(
        `[arkom] Aluno #${result.user.id} criado, mas a concessão do plano "${plano.slug}" falhou:`,
        error,
      );
      planError = `Aluno criado, mas o plano "${plano.slug}" não foi atribuído. Atribua manualmente em Admin → Planos.`;
    }
  }

  // Auditoria sem segredos: nunca logar a senha temporária.
  console.info(
    `[arkom] Aluno #${result.user.id} (${result.user.email}) criado via POST /api/integrations/students${
      plano ? ` (plano ${plano.slug}${planError ? " FALHOU" : ""})` : ""
    }.`,
  );

  const baseMessage = result.temporaryPassword
    ? "Aluno criado. A senha temporária expira no primeiro acesso (troca obrigatória no painel)."
    : "Aluno criado e vinculado a um login central pré-existente; a senha atual foi preservada. Use send_email: true para enviar o link de definição de senha.";

  return noStoreJson({
    status: "created",
    name: result.user.full_name,
    email: result.user.email,
    // null somente quando o login central pré-existia sem vínculo com o Arkom
    // (a senha atual foi preservada — guard de propriedade da identidade).
    temporaryPassword: result.temporaryPassword ?? null,
    emailSent: result.emailSent ?? false,
    ...(plano
      ? planError
        ? { plan: plano.slug, planAssigned: false, planError }
        : {
            plan: plano.slug,
            planAssigned: true,
            planName: plano.name,
            creditsGranted: planGrant?.creditados ?? 0,
            planExpiresAt: planGrant?.expiresAt ?? null,
          }
      : {}),
    message: plano
      ? planError
        ? `${baseMessage} ATENÇÃO: ${planError}`
        : `${baseMessage} Plano "${plano.name}" atribuído${
            planGrant && planGrant.creditados > 0
              ? ` com ${planGrant.creditados} crédito(s) de mentoria`
              : ""
          }.`
      : baseMessage,
  });
}
