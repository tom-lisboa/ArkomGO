// /admin — Dashboard administrativo (Story 1.7, RF022).
// Métricas reais do banco: alunos, aulas concluídas, presenças, rankings e médias.

import type { Metadata } from "next";
import Link from "next/link";
import {
  Users,
  UserCheck,
  BookOpenCheck,
  CalendarCheck2,
  CalendarClock,
  TrendingUp,
  MousePointerClick,
  Star,
  Download,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { loadExpirationReport } from "@/lib/access-expiration";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StarRating,
  buttonVariants,
} from "@/components/ui";
import { StatCard } from "@/components/admin-dados/stat-card";
import { RankList, type RankItem } from "@/components/admin-dados/rank-list";

export const metadata: Metadata = { title: "Dashboard" };

type CountRow = { n: number };
type AvgRow = { media: number | null; total: number };
type TopRatedRow = { label: string; media: number; votos: number };

function formatMedia(value: number | null): string {
  return value === null ? "—" : value.toFixed(1).replace(".", ",");
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const sql = getSql();

  const totalAlunos = (
    await sql<CountRow[]>`
      SELECT COUNT(*) AS n FROM profiles WHERE role = 'student' AND status != 'deleted'
    `
  )[0].n;

  const alunosAtivos = (
    await sql<CountRow[]>`
      SELECT COUNT(*) AS n FROM profiles WHERE role = 'student' AND status = 'active'
    `
  )[0].n;

  const aulasConcluidas = (
    await sql<CountRow[]>`SELECT COUNT(*) AS n FROM lesson_progress WHERE completed = 1`
  )[0].n;

  const presencasConfirmadas = (
    await sql<CountRow[]>`SELECT COUNT(*) AS n FROM event_confirmations WHERE confirmed = 1`
  )[0].n;

  const cursosMaisAcessados = await sql<RankItem[]>`
       SELECT c.title AS label, COUNT(*) AS value
       FROM course_access_logs cal
       JOIN courses c ON c.id = cal.course_id
       GROUP BY c.id, c.title
       ORDER BY value DESC
       LIMIT 5
     `;

  const appsMaisClicados = await sql<RankItem[]>`
       SELECT a.title AS label, COUNT(*) AS value
       FROM app_clicks ac
       JOIN apps a ON a.id = ac.app_id
       GROUP BY a.id, a.title
       ORDER BY value DESC
       LIMIT 5
     `;

  const mediaAulas = (
    await sql<AvgRow[]>`SELECT AVG(rating) AS media, COUNT(*) AS total FROM lesson_ratings`
  )[0];

  const mediaApps = (
    await sql<AvgRow[]>`SELECT AVG(rating) AS media, COUNT(*) AS total FROM app_ratings`
  )[0];

  const topAulasAvaliadas = await sql<TopRatedRow[]>`
       SELECT l.title AS label, AVG(r.rating) AS media, COUNT(*) AS votos
       FROM lesson_ratings r
       JOIN lessons l ON l.id = r.lesson_id
       GROUP BY l.id, l.title
       HAVING COUNT(*) >= 2
       ORDER BY media DESC, votos DESC
       LIMIT 3
     `;

  // Vencimentos (Tarefa 4) — a contagem do alerta antecipado. Nunca lança:
  // ambiente sem a migration 0011 devolve `migrationMissing` e o bloco some.
  const vencimentos = await loadExpirationReport();

  const topAppsAvaliados = await sql<TopRatedRow[]>`
       SELECT a.title AS label, AVG(r.rating) AS media, COUNT(*) AS votos
       FROM app_ratings r
       JOIN apps a ON a.id = r.app_id
       GROUP BY a.id, a.title
       HAVING COUNT(*) >= 2
       ORDER BY media DESC, votos DESC
       LIMIT 3
     `;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-extrabold tracking-display text-primary">
            Dashboard
          </h1>
          <p className="mt-1 text-base text-secondary">
            Visão geral da plataforma em tempo real.
          </p>
        </div>
        <Link
          href="/admin/exports"
          className={buttonVariants({ variant: "secondary" })}
        >
          <Download className="h-4 w-4" />
          Exportar dados
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          icon={<Users />}
          label="Total de membros"
          value={totalAlunos.toLocaleString("pt-BR")}
          hint="Contas de membros cadastradas"
        />
        <StatCard
          icon={<UserCheck />}
          label="Membros ativos"
          value={alunosAtivos.toLocaleString("pt-BR")}
          hint="Com acesso liberado à plataforma"
        />
        <StatCard
          icon={<BookOpenCheck />}
          label="Aulas concluídas"
          value={aulasConcluidas.toLocaleString("pt-BR")}
          hint="Total acumulado de conclusões"
        />
        <StatCard
          icon={<CalendarCheck2 />}
          label="Presenças confirmadas"
          value={presencasConfirmadas.toLocaleString("pt-BR")}
          hint="Confirmações em mentorias"
        />
      </div>

      {vencimentos.migrationMissing ? null : (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-[36px] w-[36px] items-center justify-center rounded-lg ${
                  vencimentos.resumo.expirados > 0 || vencimentos.resumo.expirando > 0
                    ? "bg-warning-subtle text-amber-800"
                    : "bg-navy-50 text-navy-700"
                }`}
              >
                <CalendarClock className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>Vencimentos</CardTitle>
                <CardDescription>
                  Prazo de acesso dos alunos — a lista de renovação
                </CardDescription>
              </div>
            </div>
            <Link
              href="/admin/plans/expirations"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Ver relatório
            </Link>
          </CardHeader>
          <CardContent>
            {vencimentos.resumo.comPrazo === 0 ? (
              <p className="text-sm text-secondary">
                Nenhum aluno tem prazo de acesso definido — os{" "}
                {vencimentos.resumo.totalPerfis} perfis estão no plano “Legado”,
                que não expira. O relatório explica como atribuir um prazo.
              </p>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-secondary">
                <span>
                  <span className="font-mono text-xl font-semibold text-primary">
                    {vencimentos.resumo.expirados}
                  </span>{" "}
                  vencido(s)
                </span>
                <span>
                  <span className="font-mono text-xl font-semibold text-primary">
                    {vencimentos.resumo.expirando}
                  </span>{" "}
                  vencendo em até {vencimentos.leadDays} dia
                  {vencimentos.leadDays === 1 ? "" : "s"}
                </span>
                {vencimentos.resumo.janelas.map((janela) => (
                  <span key={janela.dias}>
                    <span className="font-mono text-base font-semibold text-primary">
                      {janela.total}
                    </span>{" "}
                    em {janela.dias} dias
                  </span>
                ))}
                <span className="text-tertiary">
                  {vencimentos.resumo.comPrazo} de{" "}
                  {vencimentos.resumo.totalPerfis} perfis têm prazo.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <div className="flex h-[36px] w-[36px] items-center justify-center rounded-lg bg-navy-50 text-navy-700">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Cursos mais acessados</CardTitle>
              <CardDescription>Top 5 por acessos registrados</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <RankList items={cursosMaisAcessados} unit="acessos" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <div className="flex h-[36px] w-[36px] items-center justify-center rounded-lg bg-navy-50 text-navy-700">
              <MousePointerClick className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Apps mais clicados</CardTitle>
              <CardDescription>Top 5 por cliques no botão externo</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <RankList items={appsMaisClicados} unit="cliques" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <div className="flex h-[36px] w-[36px] items-center justify-center rounded-lg text-amber-800">
              <Star className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Avaliações de aulas</CardTitle>
              <CardDescription>
                {mediaAulas.total.toLocaleString("pt-BR")} avaliações registradas
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-card bg-surface-sunken px-4 py-3">
              <span className="text-3xl font-display font-bold tracking-display text-primary">
                {formatMedia(mediaAulas.media)}
              </span>
              <div>
                <StarRating value={mediaAulas.media ?? 0} readOnly size="sm" />
                <p className="text-xs text-secondary">Média geral das aulas</p>
              </div>
            </div>
            <ul className="flex flex-col gap-2.5">
              {topAulasAvaliadas.map((aula) => (
                <li
                  key={aula.label}
                  className="flex items-center justify-between gap-3"
                >
                  <p className="truncate text-sm text-primary">{aula.label}</p>
                  <span className="flex shrink-0 items-center gap-2">
                    <StarRating value={aula.media} readOnly size="sm" />
                    <span className="w-[32px] text-right text-xs font-mono font-medium text-secondary">
                      {formatMedia(aula.media)}
                    </span>
                  </span>
                </li>
              ))}
              {topAulasAvaliadas.length === 0 && (
                <li className="text-sm text-tertiary">
                  Ainda não há aulas com avaliações suficientes.
                </li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <div className="flex h-[36px] w-[36px] items-center justify-center rounded-lg text-amber-800">
              <Star className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Avaliações de apps</CardTitle>
              <CardDescription>
                {mediaApps.total.toLocaleString("pt-BR")} avaliações registradas
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-card bg-surface-sunken px-4 py-3">
              <span className="text-3xl font-display font-bold tracking-display text-primary">
                {formatMedia(mediaApps.media)}
              </span>
              <div>
                <StarRating value={mediaApps.media ?? 0} readOnly size="sm" />
                <p className="text-xs text-secondary">Média geral dos apps</p>
              </div>
            </div>
            <ul className="flex flex-col gap-2.5">
              {topAppsAvaliados.map((app) => (
                <li
                  key={app.label}
                  className="flex items-center justify-between gap-3"
                >
                  <p className="truncate text-sm text-primary">{app.label}</p>
                  <span className="flex shrink-0 items-center gap-2">
                    <StarRating value={app.media} readOnly size="sm" />
                    <span className="w-[32px] text-right text-xs font-mono font-medium text-secondary">
                      {formatMedia(app.media)}
                    </span>
                  </span>
                </li>
              ))}
              {topAppsAvaliados.length === 0 && (
                <li className="text-sm text-tertiary">
                  Ainda não há apps com avaliações suficientes.
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
