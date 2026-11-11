// /admin/exports — download de dados em CSV (Story 1.7, RF023).
// Cada botão baixa via GET /api/admin/export?type=... (UTF-8 com BOM, abre no Excel).
// Nenhuma exportação contém senhas.

import type { Metadata } from "next";
import {
  Users,
  TrendingUp,
  Star,
  AppWindow,
  MousePointerClick,
  CalendarCheck,
  CalendarClock,
  Download,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Exportações" };

type ExportItem = {
  type: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  count: number;
};

export default async function AdminExportacoesPage() {
  await requireAdmin();
  const sql = getSql();
  const [
    [{ c: alunosCount }],
    [{ c: progressoCount }],
    [{ c: avaliacoesAulasCount }],
    [{ c: avaliacoesAppsCount }],
    [{ c: cliquesCount }],
    [{ c: presencasCount }],
  ] = await Promise.all([
    sql<{ c: number }[]>`SELECT COUNT(*) AS c FROM profiles WHERE status != 'deleted'`,
    sql<{ c: number }[]>`SELECT COUNT(*) AS c FROM lesson_progress`,
    sql<{ c: number }[]>`SELECT COUNT(*) AS c FROM lesson_ratings`,
    sql<{ c: number }[]>`SELECT COUNT(*) AS c FROM app_ratings`,
    sql<{ c: number }[]>`SELECT COUNT(*) AS c FROM app_clicks`,
    sql<{ c: number }[]>`SELECT COUNT(*) AS c FROM event_confirmations WHERE confirmed = 1`,
  ]);

  // Vencimentos (Tarefa 4): a contagem depende da migration 0011. Em ambiente
  // sem ela (42P01) o card aparece zerado em vez de derrubar a página.
  let vencimentosCount = 0;
  try {
    const [{ c }] = await sql<{ c: number }[]>`
      SELECT COUNT(*) AS c
        FROM profile_entitlements e
        JOIN profiles p ON p.id = e.profile_id
        LEFT JOIN plans pl ON pl.id = e.plan_id
       WHERE e.kind = 'temporal' AND e.status = 'active'
         AND e.expires_at IS NOT NULL AND p.status <> 'deleted'
         AND (e.source = 'manual' OR COALESCE(pl.permissive, false) = false)
    `;
    vencimentosCount = c;
  } catch (error) {
    if ((error as { code?: string })?.code !== "42P01") throw error;
  }

  const items: ExportItem[] = [
    {
      type: "alunos",
      title: "Membros",
      description: "Nome, e-mail, perfil, status, cadastro e aulas concluídas.",
      icon: <Users className="h-[20px] w-[20px]" />,
      count: alunosCount,
    },
    {
      type: "progresso",
      title: "Progresso",
      description: "Aula a aula: quem concluiu o quê e quando.",
      icon: <TrendingUp className="h-[20px] w-[20px]" />,
      count: progressoCount,
    },
    {
      type: "avaliacoes-aulas",
      title: "Avaliações de aulas",
      description: "Notas de 1 a 5 dadas pelos alunos às aulas.",
      icon: <Star className="h-[20px] w-[20px]" />,
      count: avaliacoesAulasCount,
    },
    {
      type: "avaliacoes-apps",
      title: "Avaliações de soluções",
      description: "Notas de 1 a 5 dadas às soluções/apps.",
      icon: <AppWindow className="h-[20px] w-[20px]" />,
      count: avaliacoesAppsCount,
    },
    {
      type: "cliques",
      title: "Cliques em soluções",
      description: "Registro de acessos aos botões externos das soluções.",
      icon: <MousePointerClick className="h-[20px] w-[20px]" />,
      count: cliquesCount,
    },
    {
      type: "presencas",
      title: "Presenças em mentorias",
      description: "Confirmações de presença nos eventos de mentoria.",
      icon: <CalendarCheck className="h-[20px] w-[20px]" />,
      count: presencasCount,
    },
    {
      type: "vencimentos",
      title: "Vencimentos",
      description:
        "Prazo de acesso: quem vence, quando, em quantos dias e por qual motivo.",
      icon: <CalendarClock className="h-[20px] w-[20px]" />,
      count: vencimentosCount,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-display font-extrabold tracking-display text-primary">Exportações</h1>
        <p className="mt-1 text-base text-secondary">
          Baixe os dados da plataforma em CSV (abre no Excel). Senhas nunca são exportadas.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Card key={item.type} className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between">
              <span className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                {item.icon}
              </span>
              <span className="rounded-chip bg-surface-sunken px-2.5 py-0.5 font-mono text-xs text-secondary">
                {item.count} {item.count === 1 ? "registro" : "registros"}
              </span>
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-primary">{item.title}</h2>
              <p className="mt-1 text-sm text-secondary">{item.description}</p>
            </div>
            <a
              href={`/api/admin/export?type=${item.type}`}
              download
              className="inline-flex items-center justify-center gap-2 rounded-button bg-accent px-4 py-2 text-sm font-semibold text-on-accent tracking-wider transition-colors hover:bg-accent-hover"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}
