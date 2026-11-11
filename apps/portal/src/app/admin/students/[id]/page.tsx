// /admin/students/[id] — detalhe do aluno (Story 1.7, RF004).
// Dados cadastrais, progresso por curso, aulas concluídas, avaliações,
// apps clicados e presenças confirmadas. Next 15: params é async.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpenCheck,
  CalendarCheck2,
  MousePointerClick,
  Star,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import {
  getAccessStatus,
  getCreditBalance,
  getEntitlements,
  isExpirationEnforced,
} from "@/lib/entitlements";
import { listCreditMovements } from "@/lib/credit-ledger";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StarRating,
} from "@/components/ui";
import { formatDate, formatTime, getInitials } from "@/lib/utils";
import { StatCard } from "@/components/admin-dados/stat-card";
import { NovaSenhaTemporariaButton } from "@/components/admin-dados/nova-senha-temporaria";
import {
  StudentPlanPanel,
  type MovimentoDeCredito,
  type PlanoAtualDoAluno,
  type PlanoOpcao,
  type PrazoDeAcessoView,
  type PrazoHistoricoItem,
} from "@/components/admin-dados/student-plan-panel";

export const metadata: Metadata = { title: "Detalhe do aluno" };

type Profile = {
  id: number;
  full_name: string;
  email: string;
  role: "admin" | "student";
  status: "active" | "blocked" | "deleted";
  registered_at: string;
};

type CourseProgress = {
  id: number;
  title: string;
  total_aulas: number;
  concluidas: number;
};

type LessonRating = { aula: string; curso: string; rating: number };
type AppRating = { app: string; rating: number };
type AppClick = { app: string; cliques: number; ultimo: string };
type Presenca = { titulo: string; event_date: string; starts_at: string; confirmed_at: string | null };

const STATUS_LABEL: Record<Profile["status"], { label: string; variant: "success" | "danger" | "outline" }> = {
  active: { label: "Ativo", variant: "success" },
  blocked: { label: "Bloqueado", variant: "danger" },
  deleted: { label: "Excluído", variant: "outline" },
};

/** Carimbo timestamptz (ISO) → 'dd/mm/aaaa [às hh:mm]' no fuso de São Paulo.
 *  Formatado no SERVIDOR de propósito: o mesmo texto no SSR e na hidratação. */
function formatarCarimbo(iso: string | null, comHora: boolean): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  const formatado = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(comHora ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
  }).format(data);
  return comHora ? formatado.replace(",", " às") : formatado;
}

/** ISO → 'AAAA-MM-DD' no fuso de São Paulo (valor do <input type="date">).
 *  A validade termina às 23:59 do dia, então é a DATA em São Paulo que
 *  interessa — em UTC ela já teria virado para o dia seguinte. */
function diaParaInput(iso: string | null): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
}

export default async function AlunoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const adminLogado = await requireAdmin();
  const { id } = await params;
  const alunoId = Number(id);
  if (!Number.isInteger(alunoId) || alunoId <= 0) notFound();

  const sql = getSql();
  const aluno = (
    await sql<Profile[]>`
      SELECT id, full_name, email, role, status, registered_at
      FROM profiles WHERE id = ${alunoId} AND status != 'deleted'
    `
  )[0];
  if (!aluno) notFound();

  const progressoPorCurso = await sql<CourseProgress[]>`
       SELECT c.id, c.title,
        (SELECT COUNT(*) FROM lessons l
          WHERE l.course_id = c.id AND l.status = 'published') AS total_aulas,
        (SELECT COUNT(*) FROM lesson_progress lp
          JOIN lessons l2 ON l2.id = lp.lesson_id
          WHERE lp.user_id = ${alunoId} AND lp.completed = 1
            AND l2.course_id = c.id AND l2.status = 'published') AS concluidas
       FROM courses c
       WHERE c.status = 'published'
       ORDER BY c.sort_order
     `;

  const aulasConcluidas = progressoPorCurso.reduce((acc, c) => acc + c.concluidas, 0);

  const avaliacoesAulas = await sql<LessonRating[]>`
       SELECT l.title AS aula, c.title AS curso, r.rating
       FROM lesson_ratings r
       JOIN lessons l ON l.id = r.lesson_id
       JOIN courses c ON c.id = l.course_id
       WHERE r.user_id = ${alunoId}
       ORDER BY c.title, l.title
     `;

  const avaliacoesApps = await sql<AppRating[]>`
       SELECT a.title AS app, r.rating
       FROM app_ratings r
       JOIN apps a ON a.id = r.app_id
       WHERE r.user_id = ${alunoId}
       ORDER BY a.title
     `;

  const appsClicados = await sql<AppClick[]>`
       SELECT a.title AS app, COUNT(*) AS cliques, MAX(ac.clicked_at) AS ultimo
       FROM app_clicks ac
       JOIN apps a ON a.id = ac.app_id
       WHERE ac.user_id = ${alunoId}
       GROUP BY a.id, a.title
       ORDER BY cliques DESC
     `;

  const presencas = await sql<Presenca[]>`
       SELECT e.title AS titulo, e.event_date, e.starts_at, ec.confirmed_at
       FROM event_confirmations ec
       JOIN mentorship_events e ON e.id = ec.event_id
       WHERE ec.user_id = ${alunoId} AND ec.confirmed = 1
       ORDER BY e.event_date DESC
     `;

  const totalAvaliacoes = avaliacoesAulas.length + avaliacoesApps.length;
  const totalCliques = appsClicados.reduce((acc, a) => acc + a.cliques, 0);
  const status = STATUS_LABEL[aluno.status];

  // --- Plano e créditos (migration 0011) -----------------------------------
  // Os helpers de src/lib são fail-safe (degradam em silêncio se a 0011 ainda
  // não rodou), então sondamos a tabela aqui só para o painel poder DIZER que o
  // banco não está preparado, em vez de mostrar "sem plano" e enganar o admin.
  let entitlementsIndisponiveis = false;
  let planosDisponiveis: PlanoOpcao[] = [];
  try {
    planosDisponiveis = await sql<PlanoOpcao[]>`
      SELECT id, name, slug, permissive, duration_months, mentorship_credits, credit_period
        FROM plans
       WHERE status = 'published'
       ORDER BY sort_order, id
    `;
  } catch (error) {
    if ((error as { code?: string })?.code === "42P01") entitlementsIndisponiveis = true;
    else throw error;
  }

  const entitlements = entitlementsIndisponiveis ? null : await getEntitlements(alunoId);
  const saldo = entitlementsIndisponiveis ? 0 : await getCreditBalance(alunoId);
  const movimentosBrutos = entitlementsIndisponiveis
    ? []
    : await listCreditMovements(alunoId, 20);

  const planoAtual: PlanoAtualDoAluno | null = entitlements
    ? {
        planId: entitlements.planId,
        planName: entitlements.planName,
        planSlug: entitlements.planSlug,
        permissive: entitlements.permissive,
        unlimitedCredits: entitlements.unlimitedCredits,
        mentorshipCredits: entitlements.mentorshipCredits,
        creditPeriod: entitlements.creditPeriod ?? "total",
        durationMonths: entitlements.temporal?.planDurationMonths ?? null,
        expiresAtLabel: entitlements.expiresAt
          ? formatarCarimbo(entitlements.expiresAt, false)
          : null,
        expired: entitlements.expired,
      }
    : null;

  // --- Prazo de acesso (Tarefa 4) -----------------------------------------
  // O estado (`ativo`/`expirando`/`expirado`) é DERIVADO da data, e o histórico
  // é a própria sequência de linhas temporais: a atual (`active`) e as que
  // foram substituídas (`revoked`), cada uma com motivo, autor e horário.
  const acesso = entitlementsIndisponiveis ? null : await getAccessStatus(alunoId);
  const prazoValendo = entitlementsIndisponiveis ? false : await isExpirationEnforced();

  type HistoricoRow = {
    id: number;
    status: "active" | "expired" | "revoked";
    source: "plan" | "manual";
    expires_at_label: string | null;
    reason: string | null;
    granted_by_label: string | null;
    at_label: string | null;
  };
  const historicoPrazoRows = entitlementsIndisponiveis
    ? []
    : await sql<HistoricoRow[]>`
        SELECT e.id, e.status, e.source, e.reason, e.granted_by_label,
               to_char(e.expires_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
                 AS expires_at_label,
               to_char(COALESCE(e.granted_at, e.created_at)
                         AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                 AS at_label
          FROM profile_entitlements e
         WHERE e.profile_id = ${alunoId} AND e.kind = 'temporal'
         ORDER BY e.created_at DESC, e.id DESC
         LIMIT 10
      `;

  const historicoPrazo: PrazoHistoricoItem[] = historicoPrazoRows.map((row) => ({
    id: row.id,
    vigente: row.status === "active",
    expiresAtLabel: row.expires_at_label,
    source: row.source,
    reason: row.reason,
    actorLabel: row.granted_by_label,
    atLabel: row.at_label,
  }));

  const prazo: PrazoDeAcessoView | null = acesso
    ? {
        state: acesso.state,
        hasDeadline: acesso.hasDeadline,
        expiresAtLabel: formatarCarimbo(acesso.expiresAt, false),
        expiresAtInput: diaParaInput(acesso.expiresAt),
        daysRemaining: acesso.daysRemaining,
        source: acesso.source,
        leadDays: acesso.leadDays,
        enforced: prazoValendo,
      }
    : null;

  // Débito/estorno de mentoria carrega o `event_id`: buscamos o título de uma
  // vez só para o extrato dizer QUAL mentoria gerou o movimento (o suporte
  // cruza extrato × calendário o tempo todo).
  const eventIdsDoExtrato = Array.from(
    new Set(
      movimentosBrutos
        .map((movimento) => movimento.eventId)
        .filter((eventId): eventId is number => typeof eventId === "number"),
    ),
  );
  const eventosDoExtrato = new Map<number, string>();
  if (eventIdsDoExtrato.length > 0) {
    const linhas = await sql<{ id: number; title: string; event_date: string }[]>`
      SELECT id, title, event_date
        FROM mentorship_events
       WHERE id = ANY(${eventIdsDoExtrato}::int[])
    `;
    for (const linha of linhas) {
      eventosDoExtrato.set(
        linha.id,
        `${linha.title} · ${formatDate(linha.event_date, "dd/MM/yyyy")}`,
      );
    }
  }

  const movimentos: MovimentoDeCredito[] = movimentosBrutos.map((movimento) => ({
    id: movimento.id,
    delta: movimento.delta,
    reason: movimento.reason,
    note: movimento.note,
    actorLabel: movimento.actorLabel,
    createdAtLabel: formatarCarimbo(movimento.createdAt, true),
    eventId: movimento.eventId,
    eventLabel:
      movimento.eventId !== null && movimento.eventId !== undefined
        ? (eventosDoExtrato.get(movimento.eventId) ?? null)
        : null,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/admin/students"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Membros
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-100 text-lg font-semibold text-navy-800">
            {getInitials(aluno.full_name)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-display font-bold tracking-display text-primary">
                {aluno.full_name}
              </h1>
              <Badge variant={aluno.role === "admin" ? "orange" : "default"}>
                {aluno.role === "admin" ? "Admin" : "Aluno"}
              </Badge>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-secondary">
              {aluno.email} · cadastrado(a) em {formatDate(aluno.registered_at, "dd/MM/yyyy")}
            </p>
          </div>
          {/* Ação de suporte: passar o acesso sem depender da caixa de e-mail
              do aluno (a senha da criação só aparece uma vez). */}
          <div className="ml-auto">
            <NovaSenhaTemporariaButton
              profileId={aluno.id}
              profileName={aluno.full_name}
              profileEmail={aluno.email}
              blocked={aluno.status === "blocked"}
              isSelf={aluno.id === adminLogado.id}
              variant="button"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          icon={<BookOpenCheck />}
          label="Aulas concluídas"
          value={aulasConcluidas}
        />
        <StatCard icon={<Star />} label="Avaliações dadas" value={totalAvaliacoes} />
        <StatCard
          icon={<MousePointerClick />}
          label="Cliques em apps"
          value={totalCliques}
        />
        <StatCard
          icon={<CalendarCheck2 />}
          label="Presenças confirmadas"
          value={presencas.length}
        />
      </div>

      <StudentPlanPanel
        profileId={aluno.id}
        profileName={aluno.full_name}
        plano={planoAtual}
        prazo={prazo}
        historicoPrazo={historicoPrazo}
        saldo={saldo}
        movimentos={movimentos}
        planosDisponiveis={planosDisponiveis}
        migrationMissing={entitlementsIndisponiveis}
      />

      <Card>
        <CardHeader>
          <CardTitle>Progresso por curso</CardTitle>
          <CardDescription>Aulas publicadas concluídas em cada capacitação</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {progressoPorCurso.length === 0 && (
            <p className="text-sm text-tertiary">Nenhum curso publicado no momento.</p>
          )}
          {progressoPorCurso.map((curso) => {
            const pct =
              curso.total_aulas > 0
                ? Math.round((curso.concluidas / curso.total_aulas) * 100)
                : 0;
            return (
              <div key={curso.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-medium text-primary">
                    {curso.title}
                  </p>
                  <p className="shrink-0 font-mono text-xs text-secondary">
                    {curso.concluidas}/{curso.total_aulas} aulas · {pct}%
                  </p>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Avaliações dadas</CardTitle>
            <CardDescription>Notas atribuídas a aulas e apps</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {totalAvaliacoes === 0 && (
              <p className="text-sm text-tertiary">Nenhuma avaliação registrada.</p>
            )}
            {avaliacoesAulas.map((av) => (
              <div
                key={`aula-${av.curso}-${av.aula}`}
                className="flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-primary">{av.aula}</p>
                  <p className="truncate text-xs text-tertiary">Aula · {av.curso}</p>
                </div>
                <StarRating value={av.rating} readOnly size="sm" />
              </div>
            ))}
            {avaliacoesApps.map((av) => (
              <div
                key={`app-${av.app}`}
                className="flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-primary">{av.app}</p>
                  <p className="text-xs text-tertiary">App</p>
                </div>
                <StarRating value={av.rating} readOnly size="sm" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Apps clicados</CardTitle>
            <CardDescription>Acessos aos botões externos dos apps</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {appsClicados.length === 0 && (
              <p className="text-sm text-tertiary">Nenhum clique registrado.</p>
            )}
            {appsClicados.map((app) => (
              <div key={app.app} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-primary">{app.app}</p>
                  <p className="text-xs text-tertiary">
                    Último acesso em {formatDate(app.ultimo, "dd/MM/yyyy")}
                  </p>
                </div>
                <Badge variant="orange">
                  {app.cliques} clique{app.cliques === 1 ? "" : "s"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Presenças confirmadas</CardTitle>
          <CardDescription>Mentorias em que o aluno confirmou participação</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {presencas.length === 0 && (
            <p className="text-sm text-tertiary">Nenhuma presença confirmada.</p>
          )}
          {presencas.map((p) => (
            <div
              key={`${p.titulo}-${p.event_date}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface-sunken px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-primary">{p.titulo}</p>
                <p className="text-xs text-secondary">
                  {formatDate(`${p.event_date}T00:00:00`, "dd/MM/yyyy")} às{" "}
                  {formatTime(p.starts_at)}
                </p>
              </div>
              {p.confirmed_at && (
                <span className="text-xs text-tertiary">
                  Confirmada em {formatDate(p.confirmed_at, "dd/MM/yyyy")}
                </span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
