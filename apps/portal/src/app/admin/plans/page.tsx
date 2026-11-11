// /admin/plans — Planos: o catálogo comercial que vira entitlement de aluno.
// Leitura em server component; CRUD via server actions em ./actions.ts.
// Guard requireAdmin() aplicado no layout admin (e repetido aqui, como no resto
// do /admin). Se a migration 0011 ainda não rodou neste ambiente, a página
// degrada (42P01) em vez de estourar.

import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { buttonVariants } from "@/components/ui";
import {
  PlansManager,
  type AdminCursoOpcao,
  type AdminPlano,
} from "@/app/admin/plans/plans-manager";

export const metadata: Metadata = { title: "Planos" };

export default async function AdminPlansPage() {
  await requireAdmin();
  const sql = getSql();

  let planos: AdminPlano[] = [];
  let cursos: AdminCursoOpcao[] = [];
  let migrationMissing = false;
  // `apps_included` vem da migration 0016. Ambiente que ainda não a aplicou
  // (`42703`) cai no SELECT antigo e o formulário esconde o campo — planos são
  // anteriores aos apps e não podem depender deles para abrir a tela.
  let appsDisponivel = true;

  try {
    // A contagem considera só alunos NÃO excluídos: perfis com status='deleted'
    // ficam no backfill (linhas inertes, "zero órfãos"), mas não são audiência.
    const colunas = sql`
      p.id, p.slug, p.name, p.description, p.duration_months,
      p.mentorship_credits, p.credit_period, p.permissive, p.status,
      p.sort_order,
      (SELECT COUNT(DISTINCT e.profile_id)::int
         FROM profile_entitlements e
         JOIN profiles pr ON pr.id = e.profile_id
        WHERE e.plan_id = p.id
          AND e.status = 'active'
          AND pr.status <> 'deleted') AS students_count,
      COALESCE(
        (SELECT array_agg(pca.course_id ORDER BY pca.course_id)
           FROM plan_course_access pca
          WHERE pca.plan_id = p.id),
        ARRAY[]::int[]
      ) AS course_ids
    `;
    try {
      planos = await sql<AdminPlano[]>`
        SELECT ${colunas}, p.apps_included FROM plans p ORDER BY p.sort_order, p.id
      `;
    } catch (error) {
      if ((error as { code?: string })?.code !== "42703") throw error;
      appsDisponivel = false;
      planos = (
        await sql<Omit<AdminPlano, "apps_included">[]>`
          SELECT ${colunas} FROM plans p ORDER BY p.sort_order, p.id
        `
      ).map((plano) => ({ ...plano, apps_included: true }));
    }
    cursos = await sql<AdminCursoOpcao[]>`
      SELECT id, title, status FROM courses ORDER BY sort_order, id
    `;
  } catch (error) {
    if ((error as { code?: string })?.code === "42P01") migrationMissing = true;
    else throw error;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-display text-primary">
            Planos
          </h1>
          <p className="mt-1 text-base text-secondary">
            Duração, cota de mentorias, cursos inclusos e liberação dos Sistemas.
            Atribuir um plano a um aluno materializa o direito dele na ficha do
            aluno.
          </p>
        </div>
        <Link
          href="/admin/plans/expirations"
          className={buttonVariants({ variant: "secondary" })}
        >
          <CalendarClock className="h-4 w-4" />
          Vencimentos
        </Link>
      </div>
      <PlansManager
        planos={planos}
        cursos={cursos}
        migrationMissing={migrationMissing}
        appsDisponivel={appsDisponivel}
      />
    </div>
  );
}
