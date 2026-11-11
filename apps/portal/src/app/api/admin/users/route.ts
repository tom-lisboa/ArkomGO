// POST /api/admin/users — criação programática de aluno com senha temporária.
// Uso server-to-server (automações, integrações): exige o header
// `Authorization: Bearer <ARKOM_USERS_API_KEY>`. Fail-closed: sem a env
// configurada com pelo menos 32 caracteres, o endpoint responde 503.
//
// Corpo aceito (application/json): { full_name, email, send_email? }.
// Campos desconhecidos são rejeitados. Todo usuário criado aqui nasce como
// aluno ativo (role=student) — criar admins é exclusivo do painel /admin.
// A conta nasce com must_change_password=1: a senha temporária retornada é
// trocada obrigatoriamente pelo aluno no primeiro acesso (painel /settings).

import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { noStoreJson } from "@/app/api/auth/_shared";
import { createUserWithTemporaryPassword, EMAIL_RE } from "@/lib/create-user";

export const dynamic = "force-dynamic";

const API_KEY_ENV = "ARKOM_USERS_API_KEY";
const MIN_KEY_LENGTH = 32;
const MAX_BODY_BYTES = 16_384;
const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 320;
const ALLOWED_FIELDS = ["full_name", "email", "send_email"] as const;

// Rate limit best-effort em memória (deploy atual é instância única no Railway).
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
          "O mínimo para criar um usuário é full_name + email; toda conta criada aqui nasce como aluno (role student).",
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

  const result = await createUserWithTemporaryPassword({
    fullName,
    email,
    role: "student",
    status: "active",
    sendSetupEmail: sendEmail,
  });

  if (!result.ok) {
    const status =
      result.code === "conflict"
        ? 409
        : result.code === "validation"
          ? 400
          : result.code === "unavailable" || result.code === "config"
            ? 503
            : 502;
    return noStoreJson({ error: result.error }, { status });
  }

  // Auditoria sem segredos: nunca logar a senha temporária.
  console.info(
    `[arkom] Usuário #${result.user.id} (${result.user.email}) criado via POST /api/admin/users.`,
  );

  return noStoreJson(
    {
      user: {
        id: result.user.id,
        fullName: result.user.full_name,
        email: result.user.email,
        role: result.user.role,
        status: result.user.status,
        registeredAt: result.user.registered_at,
        mustChangePassword: result.user.must_change_password === 1,
      },
      // Ausente quando o login central já existia — a senha anterior é
      // preservada e o acesso pode ser redefinido por e-mail (send_email).
      temporaryPassword: result.temporaryPassword,
      emailSent: result.emailSent,
      provisioning: result.provisioning,
    },
    { status: 201 },
  );
}
