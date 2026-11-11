// Route handler de exportações CSV — Admin (Story 1.7, RF023).
// GET /api/admin/export?type=<tipo>  → download CSV (UTF-8 com BOM, abre no Excel).
// NUNCA inclui senhas/hashes. Guard admin obrigatório.

import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSql } from "@/lib/db";

type Column = { header: string; key: string };

type ExportSpec = {
  filename: string;
  columns: Column[];
  sql: string;
};

const EXPORTS: Record<string, ExportSpec> = {
  alunos: {
    filename: "alunos",
    columns: [
      { header: "ID", key: "id" },
      { header: "Nome", key: "full_name" },
      { header: "E-mail", key: "email" },
      { header: "Perfil", key: "role" },
      { header: "Status", key: "status" },
      { header: "Cadastro", key: "registered_at" },
      { header: "Aulas concluídas", key: "aulas_concluidas" },
    ],
    // Sem password_hash — jamais exportado.
    sql: `SELECT p.id, p.full_name, p.email, p.role, p.status, p.registered_at,
                 (SELECT COUNT(*) FROM lesson_progress lp
                    WHERE lp.user_id = p.id AND lp.completed = 1) AS aulas_concluidas
          FROM profiles p
          WHERE p.status != 'deleted'
          ORDER BY p.registered_at DESC`,
  },
  progresso: {
    filename: "progresso",
    columns: [
      { header: "Aluno", key: "aluno" },
      { header: "E-mail", key: "email" },
      { header: "Curso", key: "curso" },
      { header: "Aula", key: "aula" },
      { header: "Concluída", key: "concluida" },
      { header: "Data conclusão", key: "completed_at" },
    ],
    sql: `SELECT p.full_name AS aluno, p.email,
                 c.title AS curso, l.title AS aula,
                 CASE WHEN lp.completed = 1 THEN 'Sim' ELSE 'Não' END AS concluida,
                 lp.completed_at
          FROM lesson_progress lp
          JOIN profiles p ON p.id = lp.user_id
          JOIN lessons l ON l.id = lp.lesson_id
          JOIN courses c ON c.id = l.course_id
          ORDER BY p.full_name, c.title, l.sort_order`,
  },
  "avaliacoes-aulas": {
    filename: "avaliacoes-aulas",
    columns: [
      { header: "Aluno", key: "aluno" },
      { header: "Curso", key: "curso" },
      { header: "Aula", key: "aula" },
      { header: "Nota", key: "rating" },
    ],
    sql: `SELECT p.full_name AS aluno, c.title AS curso, l.title AS aula, lr.rating
          FROM lesson_ratings lr
          JOIN profiles p ON p.id = lr.user_id
          JOIN lessons l ON l.id = lr.lesson_id
          JOIN courses c ON c.id = l.course_id
          ORDER BY c.title, l.title`,
  },
  "avaliacoes-apps": {
    filename: "avaliacoes-apps",
    columns: [
      { header: "Aluno", key: "aluno" },
      { header: "Solução", key: "app" },
      { header: "Nota", key: "rating" },
    ],
    sql: `SELECT p.full_name AS aluno, a.title AS app, ar.rating
          FROM app_ratings ar
          JOIN profiles p ON p.id = ar.user_id
          JOIN apps a ON a.id = ar.app_id
          ORDER BY a.title`,
  },
  cliques: {
    filename: "cliques-apps",
    columns: [
      { header: "Aluno", key: "aluno" },
      { header: "Solução", key: "app" },
      { header: "Data/hora", key: "clicked_at" },
    ],
    sql: `SELECT p.full_name AS aluno, a.title AS app, ac.clicked_at
          FROM app_clicks ac
          JOIN profiles p ON p.id = ac.user_id
          JOIN apps a ON a.id = ac.app_id
          ORDER BY ac.clicked_at DESC`,
  },
  // Vencimentos (Tarefa 4) — o relatório de renovação em CSV. Só linhas com
  // prazo definido; o mesmo recorte da tela /admin/plans/expirations
  // (permissivo não tem prazo, salvo prazo definido à mão).
  vencimentos: {
    filename: "vencimentos",
    columns: [
      { header: "Aluno", key: "aluno" },
      { header: "E-mail", key: "email" },
      { header: "Conta", key: "conta" },
      { header: "Plano", key: "plano" },
      { header: "Expira em", key: "expira_em" },
      { header: "Dias restantes", key: "dias_restantes" },
      { header: "Situação", key: "situacao" },
      { header: "Origem do prazo", key: "origem" },
      { header: "Motivo", key: "motivo" },
      { header: "Definido por", key: "definido_por" },
      { header: "Definido em", key: "definido_em" },
    ],
    sql: `SELECT p.full_name AS aluno, p.email, p.status AS conta,
                 COALESCE(pl.name, '—') AS plano,
                 to_char(e.expires_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
                   AS expira_em,
                 ((e.expires_at AT TIME ZONE 'America/Sao_Paulo')::date
                   - (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS dias_restantes,
                 CASE
                   WHEN e.expires_at <= now() THEN 'Expirado'
                   WHEN ((e.expires_at AT TIME ZONE 'America/Sao_Paulo')::date
                          - (now() AT TIME ZONE 'America/Sao_Paulo')::date)
                        <= COALESCE((SELECT (scope->>'alerta_dias')::int
                                       FROM feature_flags
                                      WHERE key = 'expiration_enforcement'), 30)
                     THEN 'Expirando'
                   ELSE 'Ativo'
                 END AS situacao,
                 CASE e.source WHEN 'manual' THEN 'Definido à mão' ELSE 'Do plano' END
                   AS origem,
                 e.reason AS motivo,
                 e.granted_by_label AS definido_por,
                 to_char(e.granted_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                   AS definido_em
          FROM profile_entitlements e
          JOIN profiles p ON p.id = e.profile_id
          LEFT JOIN plans pl ON pl.id = e.plan_id
          WHERE e.kind = 'temporal'
            AND e.status = 'active'
            AND e.expires_at IS NOT NULL
            AND p.status <> 'deleted'
            AND (e.source = 'manual' OR COALESCE(pl.permissive, false) = false)
          ORDER BY e.expires_at, p.full_name`,
  },
  presencas: {
    filename: "presencas-mentorias",
    columns: [
      { header: "Aluno", key: "aluno" },
      { header: "E-mail", key: "email" },
      { header: "Mentoria", key: "mentoria" },
      { header: "Data do evento", key: "event_date" },
      { header: "Confirmada em", key: "confirmed_at" },
    ],
    sql: `SELECT p.full_name AS aluno, p.email,
                 e.title AS mentoria, e.event_date, ec.confirmed_at
          FROM event_confirmations ec
          JOIN profiles p ON p.id = ec.user_id
          JOIN mentorship_events e ON e.id = ec.event_id
          WHERE ec.confirmed = 1
          ORDER BY e.event_date DESC`,
  },
};

/** Escapa um valor para uma célula CSV (RFC 4180). */
function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(columns: Column[], rows: Record<string, unknown>[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => csvCell(row[c.key])).join(","))
    .join("\r\n");
  return body ? `${head}\r\n${body}` : head;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return new NextResponse("Não autorizado", { status: 403 });
  }
  if (user.must_change_password === 1) {
    return new NextResponse("Defina uma nova senha antes de exportar dados.", {
      status: 403,
    });
  }

  const type = request.nextUrl.searchParams.get("type") ?? "";
  const spec = EXPORTS[type];
  if (!spec) {
    return new NextResponse(
      `Tipo de exportação inválido. Opções: ${Object.keys(EXPORTS).join(", ")}.`,
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const sql = getSql();
  let rows: Record<string, unknown>[];
  try {
    rows = await sql.unsafe<Record<string, unknown>[]>(spec.sql);
  } catch (error) {
    // Tabela ausente = migration não aplicada NESTE ambiente (ex.: dev em
    // `app_arkom` sem as tabelas de planos). Vale uma mensagem, não um 500.
    if ((error as { code?: string })?.code === "42P01") {
      return new NextResponse(
        "Esta exportação depende de tabelas que ainda não existem neste ambiente. Aplique as migrations pendentes em db/migrations.",
        { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    throw error;
  }
  const csv = toCsv(spec.columns, rows);

  // BOM UTF-8 para o Excel reconhecer acentuação.
  const payload = "﻿" + csv;
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(payload, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="arkom-${spec.filename}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
