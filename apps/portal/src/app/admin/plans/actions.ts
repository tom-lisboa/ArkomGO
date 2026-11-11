"use server";

// Server actions — Admin > Planos (núcleo de entitlements + créditos).
// Fonte: `plans`, `plan_course_access`, `profile_entitlements`, `credit_ledger`
// (migration 0011-entitlements-core.sql).
//
// Toda mutação exige requireAdmin() e carimba quem fez. Concessão/remoção
// manual de crédito exige MOTIVO — o banco também recusa sem ele (CHECK
// `credit_ledger_manual_audit_ck`), aqui a validação só existe para dar
// mensagem decente em pt-BR antes de bater no banco.
//
// ⚠ Types são DECLARADOS aqui. NUNCA `export type { X } from "./y"` dentro de
// um módulo 'use server': vira ReferenceError em runtime e derruba TODAS as
// actions do módulo, com build/tsc passando (incidente PR#3 → fix PR#4).

import { revalidatePath } from "next/cache";
import type postgres from "postgres";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { creditCredit, debitCredit } from "@/lib/credit-ledger";
import { concederPlano } from "@/lib/plan-grant";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export type PlanoInput = {
  name: string;
  slug: string;
  description: string;
  /** Meses de validade. "" = plano sem prazo (vitalício). */
  duration_months: string;
  /** Cota de mentorias. "" = ilimitado. */
  mentorship_credits: string;
  credit_period: "month" | "total";
  /** Permissivo: catálogo inteiro, mentorias ilimitadas, sem prazo. */
  permissive: boolean;
  status: "draft" | "published";
  course_ids: number[];
  /** Liga/desliga ÚNICO dos Apps e Templates (migration 0016, ClickUp
   *  86ajrgzef): libera todos ou nenhum — não existe seleção app a app. */
  apps_included: boolean;
};

export type AjusteCreditoInput = {
  operacao: "adicionar" | "remover";
  quantidade: number;
  motivo: string;
  /** Chave de idempotência gerada no cliente ao abrir o formulário: reenviar
   *  o mesmo formulário (duplo clique, retry) NÃO lança o crédito duas vezes. */
  chave: string;
};

export type PrazoDeAcessoInput = {
  /** 'AAAA-MM-DD' — o último dia de acesso. "" = remover o prazo. */
  data: string;
  /** Obrigatório, inclusive para remover: fica na auditoria. */
  motivo: string;
};

const MIGRATION_HINT =
  "Tabelas de planos ausentes. Aplique db/migrations/0011-entitlements-core.sql neste ambiente.";

const MIGRATION_APPS_HINT =
  "A liberação dos Sistemas por plano ainda não existe neste banco. Aplique db/migrations/0016-plan-apps-access.sql.";

const MAX_MONTHS = 240;
const MAX_CREDITS = 100_000;

function isMissingTable(error: unknown): boolean {
  return (error as { code?: string })?.code === "42P01";
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === "23505";
}

/** Coluna ausente — ambiente sem a 0016 (`plans.apps_included`). A leitura da
 *  tela já degrada sozinha; na ESCRITA voltamos o motivo em vez de engolir a
 *  escolha do admin em silêncio. */
function isMissingColumn(error: unknown): boolean {
  return (error as { code?: string })?.code === "42703";
}

/** Quem mexeu, em texto (sobrevive à exclusão do perfil). */
function actorLabel(user: { id: number; email: string; full_name: string }): string {
  return user.email?.trim() || user.full_name?.trim() || `profile:${user.id}`;
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function slugify(value: string): string {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function revalidatePlanos(profileId?: number) {
  revalidatePath("/admin/plans");
  revalidatePath("/admin/students");
  if (profileId) revalidatePath(`/admin/students/${profileId}`);
}

type PlanoNormalizado = {
  name: string;
  slug: string;
  description: string | null;
  durationMonths: number | null;
  mentorshipCredits: number | null;
  creditPeriod: "month" | "total";
  permissive: boolean;
  status: "draft" | "published";
  courseIds: number[];
  appsIncluded: boolean;
};

function normalizarPlano(
  input: PlanoInput,
): { ok: true; value: PlanoNormalizado } | { ok: false; error: string } {
  const name = clean(input.name);
  if (!name) return { ok: false, error: "Informe o nome do plano." };
  if (name.length > 120) return { ok: false, error: "O nome do plano é longo demais (máx. 120)." };

  const slug = slugify(input.slug) || slugify(name);
  if (!slug) {
    return { ok: false, error: "Informe um identificador válido (letras, números e hífens)." };
  }

  const permissive = input.permissive === true;

  // Plano permissivo é, por definição, sem prazo, sem cota, com o catálogo
  // inteiro e com os apps liberados. Zeramos/forçamos os campos para o banco
  // não guardar contradição.
  let durationMonths: number | null = null;
  let mentorshipCredits: number | null = null;
  let courseIds: number[] = [];
  let appsIncluded = true;

  if (!permissive) {
    appsIncluded = input.apps_included !== false;

    const rawMonths = clean(input.duration_months);
    if (rawMonths) {
      const months = Number(rawMonths);
      if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
        return {
          ok: false,
          error: `A duração precisa ser um número inteiro de 1 a ${MAX_MONTHS} meses (ou vazio, para plano sem prazo).`,
        };
      }
      durationMonths = months;
    }

    const rawCredits = clean(input.mentorship_credits);
    if (rawCredits) {
      const credits = Number(rawCredits);
      if (!Number.isInteger(credits) || credits < 0 || credits > MAX_CREDITS) {
        return {
          ok: false,
          error: `A cota de mentorias precisa ser um número inteiro de 0 a ${MAX_CREDITS} (ou vazio, para ilimitado).`,
        };
      }
      mentorshipCredits = credits;
    }

    courseIds = Array.from(
      new Set(
        (Array.isArray(input.course_ids) ? input.course_ids : [])
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    );
  }

  const description = clean(input.description);

  return {
    ok: true,
    value: {
      name,
      slug,
      description: description || null,
      durationMonths,
      mentorshipCredits,
      creditPeriod: input.credit_period === "month" ? "month" : "total",
      permissive,
      status: input.status === "published" ? "published" : "draft",
      courseIds,
      appsIncluded,
    },
  };
}

/** Sincroniza os cursos inclusos no plano (remove os que saíram, insere os novos). */
async function sincronizarCursos(
  tx: postgres.TransactionSql,
  planId: number,
  courseIds: number[],
): Promise<void> {
  if (courseIds.length === 0) {
    await tx`DELETE FROM plan_course_access WHERE plan_id = ${planId}`;
    return;
  }
  await tx`
    DELETE FROM plan_course_access
     WHERE plan_id = ${planId} AND course_id <> ALL(${courseIds}::int[])
  `;
  await tx`
    INSERT INTO plan_course_access (plan_id, course_id)
    SELECT ${planId}, c.id
      FROM courses c
     WHERE c.id = ANY(${courseIds}::int[])
    ON CONFLICT (plan_id, course_id) DO NOTHING
  `;
}

/** Cria um plano novo. */
export async function criarPlano(input: PlanoInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  const normalizado = normalizarPlano(input);
  if (!normalizado.ok) return normalizado;
  const plano = normalizado.value;

  const sql = getSql();
  try {
    await sql.begin(async (tx) => {
      const [{ next }] = await tx<{ next: number }[]>`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM plans
      `;
      const [criado] = await tx<{ id: number }[]>`
        INSERT INTO plans
          (slug, name, description, duration_months, mentorship_credits,
           credit_period, permissive, status, sort_order, created_by,
           apps_included)
        VALUES
          (${plano.slug}, ${plano.name}, ${plano.description}, ${plano.durationMonths},
           ${plano.mentorshipCredits}, ${plano.creditPeriod}, ${plano.permissive},
           ${plano.status}, ${next}, ${admin.id},
           ${plano.appsIncluded})
        RETURNING id
      `;
      await sincronizarCursos(tx, criado.id, plano.courseIds);
    });
    revalidatePlanos();
    return { ok: true, message: `Plano "${plano.name}" criado.` };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    if (isMissingColumn(error)) return { ok: false, error: MIGRATION_APPS_HINT };
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: `Já existe um plano com o identificador "${plano.slug}". Escolha outro.`,
      };
    }
    console.error(`Erro em criarPlano (slug=${plano.slug}, admin=${admin.email}):`, error);
    return { ok: false, error: "Não foi possível criar o plano. Tente novamente." };
  }
}

/** Edita um plano existente. Não mexe nos entitlements já materializados. */
export async function salvarPlano(id: number, input: PlanoInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Plano inválido." };

  const normalizado = normalizarPlano(input);
  if (!normalizado.ok) return normalizado;
  const plano = normalizado.value;

  const sql = getSql();
  try {
    const atualizado = await sql.begin(async (tx) => {
      const rows = await tx<{ id: number }[]>`
        UPDATE plans
           SET slug = ${plano.slug},
               name = ${plano.name},
               description = ${plano.description},
               duration_months = ${plano.durationMonths},
               mentorship_credits = ${plano.mentorshipCredits},
               credit_period = ${plano.creditPeriod},
               permissive = ${plano.permissive},
               status = ${plano.status},
               apps_included = ${plano.appsIncluded},
               updated_at = now()
         WHERE id = ${id}
        RETURNING id
      `;
      if (rows.length === 0) return false;
      await sincronizarCursos(tx, id, plano.courseIds);
      return true;
    });

    if (!atualizado) return { ok: false, error: "Plano não encontrado." };
    revalidatePlanos();
    return {
      ok: true,
      message:
        // Cursos e apps são lidos do plano na hora da navegação (não são
        // materializados no entitlement): mudar a marcação vale já. Duração e
        // cota, sim, foram carimbadas na atribuição.
        "Plano atualizado. Cursos inclusos e liberação dos Sistemas já valem para quem está no plano; duração e cota de mentorias só mudam ao reatribuir.",
    };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    if (isMissingColumn(error)) return { ok: false, error: MIGRATION_APPS_HINT };
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: `Já existe um plano com o identificador "${plano.slug}". Escolha outro.`,
      };
    }
    console.error(`Erro em salvarPlano (plano=${id}, admin=${admin.email}):`, error);
    return { ok: false, error: "Não foi possível salvar o plano. Tente novamente." };
  }
}

/** Publica/despublica. Plano em rascunho não pode ser atribuído a aluno. */
export async function alternarStatusPlano(id: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Plano inválido." };

  const sql = getSql();
  try {
    const rows = await sql<{ status: "draft" | "published" }[]>`
      UPDATE plans
         SET status = CASE status WHEN 'published' THEN 'draft' ELSE 'published' END,
             updated_at = now()
       WHERE id = ${id}
      RETURNING status
    `;
    if (rows.length === 0) return { ok: false, error: "Plano não encontrado." };
    revalidatePlanos();
    return {
      ok: true,
      message: rows[0].status === "published" ? "Plano publicado." : "Plano voltou para rascunho.",
    };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    console.error(`Erro em alternarStatusPlano (plano=${id}, admin=${admin.email}):`, error);
    return { ok: false, error: "Não foi possível alterar o status do plano. Tente novamente." };
  }
}

/** Exclui um plano — só se nenhum aluno estiver nele. */
export async function excluirPlano(id: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Plano inválido." };

  const sql = getSql();
  try {
    const [uso] = await sql<{ total: number }[]>`
      SELECT COUNT(DISTINCT profile_id)::int AS total
        FROM profile_entitlements
       WHERE plan_id = ${id}
    `;
    if ((uso?.total ?? 0) > 0) {
      return {
        ok: false,
        error: `Este plano tem ${uso.total} aluno(s) vinculado(s) (inclusive histórico). Mude os alunos de plano antes de excluir, ou deixe o plano em rascunho.`,
      };
    }
    const rows = await sql<{ id: number }[]>`DELETE FROM plans WHERE id = ${id} RETURNING id`;
    if (rows.length === 0) return { ok: false, error: "Plano não encontrado." };
    revalidatePlanos();
    return { ok: true, message: "Plano excluído." };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    console.error(`Erro em excluirPlano (plano=${id}, admin=${admin.email}):`, error);
    return { ok: false, error: "Não foi possível excluir o plano. Tente novamente." };
  }
}

/**
 * Atribui um plano a um aluno e MATERIALIZA os entitlements (as três dimensões)
 * na mesma transação. Se o plano tiver cota de mentorias, os créditos entram no
 * ledger como `plan_grant`, com chave de idempotência amarrada ao entitlement
 * recém-criado.
 *
 * O direito vigente do aluno é revogado (`status='revoked'`) antes — um aluno
 * tem um plano por vez. O histórico fica: nada é apagado.
 */
export async function atribuirPlanoAoAluno(
  profileId: number,
  planId: number,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(profileId) || profileId <= 0) return { ok: false, error: "Aluno inválido." };
  if (!Number.isInteger(planId) || planId <= 0) return { ok: false, error: "Plano inválido." };

  const sql = getSql();
  try {
    const [aluno] = await sql<{ id: number; full_name: string }[]>`
      SELECT id, full_name FROM profiles WHERE id = ${profileId} AND status <> 'deleted'
    `;
    if (!aluno) return { ok: false, error: "Aluno não encontrado." };

    const [plano] = await sql<
      {
        id: number;
        slug: string;
        name: string;
        duration_months: number | null;
        mentorship_credits: number | null;
        permissive: boolean;
        status: "draft" | "published";
      }[]
    >`
      SELECT id, slug, name, duration_months, mentorship_credits, permissive, status
        FROM plans WHERE id = ${planId}
    `;
    if (!plano) return { ok: false, error: "Plano não encontrado." };
    if (plano.status !== "published") {
      return { ok: false, error: "Publique o plano antes de atribuí-lo a um aluno." };
    }

    const jaEstaNoPlano = await sql<{ id: number }[]>`
      SELECT id FROM profile_entitlements
       WHERE profile_id = ${profileId} AND plan_id = ${planId} AND status = 'active'
       LIMIT 1
    `;
    if (jaEstaNoPlano.length > 0) {
      return {
        ok: false,
        error: `${aluno.full_name} já está no plano "${plano.name}". Para renovar, troque de plano e volte, ou lance os créditos manualmente com o motivo.`,
      };
    }

    const meses = plano.permissive ? null : plano.duration_months;
    const creditos = plano.permissive ? null : plano.mentorship_credits;

    // Núcleo compartilhado com as integrações (src/lib/plan-grant.ts): revoga
    // o direito vigente, materializa as 3 dimensões e credita com idempotência.
    const resumo = await concederPlano(sql, {
      profileId,
      plano,
      actor: { profileId: admin.id, label: actorLabel(admin) },
    });

    revalidatePlanos(profileId);

    const detalhes: string[] = [];
    if (plano.permissive) detalhes.push("acesso total ao catálogo, mentorias ilimitadas e sem prazo");
    else {
      detalhes.push(meses === null ? "sem prazo" : `${meses} ${meses === 1 ? "mês" : "meses"} de acesso`);
      detalhes.push(
        creditos === null
          ? "mentorias ilimitadas"
          : `${creditos} crédito(s) de mentoria`,
      );
    }
    return {
      ok: true,
      message: `${aluno.full_name} agora está no plano "${plano.name}" (${detalhes.join(", ")}).${
        resumo.creditados > 0 ? ` ${resumo.creditados} crédito(s) lançados.` : ""
      }`,
    };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    console.error(
      `Erro em atribuirPlanoAoAluno (aluno=${profileId}, plano=${planId}, admin=${admin.email}):`,
      error,
    );
    return { ok: false, error: "Não foi possível atribuir o plano. Tente novamente." };
  }
}

/**
 * Define, ajusta ou REMOVE o prazo de acesso de um aluno (Tarefa 4).
 *
 * ─── COMO O PRAZO É GUARDADO ──────────────────────────────────────────────
 * O prazo é a coluna `expires_at` da linha `kind='temporal'` ATIVA do aluno.
 * Editar não faz UPDATE nela: revoga a linha vigente (ela FICA, virando
 * histórico) e insere uma nova com `source='manual'`. A auditoria vem de
 * graça e é imposta pelo BANCO — o CHECK `profile_entitlements_manual_audit_ck`
 * recusa entitlement manual sem motivo, autor e carimbo de hora. O histórico
 * do prazo é, então, a própria sequência de linhas temporais do aluno.
 *
 * ─── PRECEDÊNCIA SOBRE O PLANO ────────────────────────────────────────────
 * Prazo definido à mão vence o plano permissivo (`src/lib/entitlements.ts`):
 * é o caso do aluno "Legado" que passou a ter contrato com validade. Remover o
 * prazo devolve o acesso na hora — expirado é estado DERIVADO, não há nada a
 * "desexpirar".
 *
 * ─── O QUE NÃO ACONTECE AQUI ──────────────────────────────────────────────
 * `session_version` NÃO é bumpado e nenhuma confirmação de presença é tocada:
 * vencer não derruba a sessão nem desmarca presença já confirmada (X2). O
 * prazo barra ações NOVAS, e só com a flag `expiration_enforcement` ligada.
 */
export async function definirPrazoDeAcesso(
  profileId: number,
  input: PrazoDeAcessoInput,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(profileId) || profileId <= 0) {
    return { ok: false, error: "Aluno inválido." };
  }

  const motivo = clean(input?.motivo);
  if (!motivo) {
    return {
      ok: false,
      error: "Informe o motivo — ele fica registrado no histórico de prazo do aluno.",
    };
  }
  if (motivo.length > 500) {
    return { ok: false, error: "O motivo é longo demais (máx. 500 caracteres)." };
  }

  const data = clean(input?.data);
  const removendo = data === "";
  if (!removendo) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return { ok: false, error: "Informe a data de expiração no formato dd/mm/aaaa." };
    }
    // Faixa sã: recusa 0202-05-01 (dedo escorregado no ano) sem impedir uma
    // data no passado — datar no passado é justamente como se vence alguém
    // agora, e é reversível.
    const ano = Number(data.slice(0, 4));
    if (ano < 2000 || ano > 2100) {
      return { ok: false, error: "A data de expiração precisa estar entre 2000 e 2100." };
    }
    const valida = new Date(`${data}T12:00:00Z`);
    if (Number.isNaN(valida.getTime()) || !valida.toISOString().startsWith(data)) {
      return { ok: false, error: "Data de expiração inválida." };
    }
  }

  const sql = getSql();
  try {
    const [aluno] = await sql<{ id: number; full_name: string }[]>`
      SELECT id, full_name FROM profiles WHERE id = ${profileId} AND status <> 'deleted'
    `;
    if (!aluno) return { ok: false, error: "Aluno não encontrado." };

    const [vigente] = await sql<
      { id: number; plan_id: number | null; expires_at: Date | null }[]
    >`
      SELECT id, plan_id, expires_at
        FROM profile_entitlements
       WHERE profile_id = ${profileId} AND kind = 'temporal' AND status = 'active'
       LIMIT 1
    `;
    if (!vigente) {
      return {
        ok: false,
        error:
          "Este aluno ainda não tem direito temporal materializado. Atribua um plano antes de definir o prazo de acesso.",
      };
    }
    if (removendo && vigente.expires_at === null) {
      return { ok: false, error: "Este aluno já está sem prazo de acesso." };
    }

    await sql.begin(async (tx) => {
      await tx`
        UPDATE profile_entitlements
           SET status = 'revoked', updated_at = now()
         WHERE id = ${vigente.id}
      `;
      // O último dia vale INTEIRO: a validade termina às 23:59:59 do dia
      // escolhido, no fuso do produto (o servidor roda em UTC). Removendo, o
      // parâmetro é NULL e a expressão inteira vira NULL — sem CASE.
      await tx`
        INSERT INTO profile_entitlements
          (profile_id, plan_id, kind, source, status, starts_at, expires_at,
           granted_by, granted_by_label, granted_at, reason)
        VALUES
          (${profileId}, ${vigente.plan_id}, 'temporal', 'manual', 'active', now(),
           ((${removendo ? null : data}::text || ' 23:59:59')::timestamp
              AT TIME ZONE 'America/Sao_Paulo'),
           ${admin.id}, ${actorLabel(admin)}, now(), ${motivo})
      `;
    });

    revalidatePlanos(profileId);
    revalidatePath("/admin/plans/expirations");
    revalidatePath("/admin");

    if (removendo) {
      return {
        ok: true,
        message: `Prazo removido: ${aluno.full_name} volta a ficar sem data de expiração. Se o acesso estava vencido, ele foi restaurado agora.`,
      };
    }
    const [dia, mes, ano] = [data.slice(8, 10), data.slice(5, 7), data.slice(0, 4)];
    return {
      ok: true,
      message: `Prazo de ${aluno.full_name} definido para ${dia}/${mes}/${ano} (o dia inteiro vale).`,
    };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    console.error(
      `Erro em definirPrazoDeAcesso (aluno=${profileId}, data="${data}", admin=${admin.email}):`,
      error,
    );
    return { ok: false, error: "Não foi possível salvar o prazo de acesso. Tente novamente." };
  }
}

/**
 * Concessão/remoção MANUAL de crédito. Exige motivo; o ledger guarda o motivo,
 * o autor e o horário. Idempotente pela chave enviada pelo formulário.
 */
export async function ajustarCreditoManual(
  profileId: number,
  input: AjusteCreditoInput,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(profileId) || profileId <= 0) return { ok: false, error: "Aluno inválido." };

  const quantidade = Number(input?.quantidade);
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return { ok: false, error: "Informe uma quantidade inteira maior que zero." };
  }
  const motivo = clean(input?.motivo);
  if (!motivo) return { ok: false, error: "Informe o motivo do ajuste — ele fica registrado no extrato." };
  if (motivo.length > 500) return { ok: false, error: "O motivo é longo demais (máx. 500 caracteres)." };

  const chave = clean(input?.chave);
  if (!/^[A-Za-z0-9:_-]{8,80}$/.test(chave)) {
    return { ok: false, error: "Chave de idempotência inválida. Recarregue a página e tente de novo." };
  }
  const adicionar = input?.operacao !== "remover";

  const sql = getSql();
  try {
    const [aluno] = await sql<{ id: number; full_name: string }[]>`
      SELECT id, full_name FROM profiles WHERE id = ${profileId} AND status <> 'deleted'
    `;
    if (!aluno) return { ok: false, error: "Aluno não encontrado." };

    const comum = {
      profileId,
      amount: quantidade,
      operationKey: `admin_adjust:${chave}`,
      note: motivo,
      ref: `admin:${admin.id}`,
      actor: { profileId: admin.id, label: actorLabel(admin) },
    };

    const resultado = adicionar
      ? await creditCredit({ ...comum, reason: "admin_grant" })
      : await debitCredit({ ...comum, reason: "admin_revoke", enforceBalance: true });

    if (!resultado.ok) {
      if (resultado.code !== "insufficient_balance" && resultado.code !== "invalid_input") {
        console.error(
          `Erro em ajustarCreditoManual (aluno=${profileId}, operacao=${
            adicionar ? "adicionar" : "remover"
          }, quantidade=${quantidade}, motivo="${motivo}", admin=${admin.email}): ${resultado.error}`,
        );
      }
      return { ok: false, error: resultado.error };
    }

    revalidatePlanos(profileId);

    if (resultado.duplicated) {
      return {
        ok: true,
        message: `Este ajuste já havia sido registrado — nada foi lançado em duplicidade. Saldo de ${aluno.full_name}: ${resultado.balance} crédito(s).`,
      };
    }
    return {
      ok: true,
      message: `${adicionar ? "Concedido" : "Removido"} ${quantidade} crédito(s). Saldo de ${
        aluno.full_name
      }: ${resultado.balance} crédito(s).`,
    };
  } catch (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_HINT };
    console.error(
      `Erro em ajustarCreditoManual (aluno=${profileId}, admin=${admin.email}, motivo="${motivo}"):`,
      error,
    );
    return { ok: false, error: "Não foi possível ajustar os créditos. Tente novamente." };
  }
}
