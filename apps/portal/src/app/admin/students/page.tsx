// /admin/students — gestão de alunos e admins (Story 1.7, RF004/RF005).
// Leitura em server component; mutações via server actions (actions.ts).

import type { Metadata } from "next";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { AlunosManager, type AlunoRow } from "@/components/admin-dados/students-manager";

export const metadata: Metadata = { title: "Membros" };

type ProfileRow = {
  id: number;
  full_name: string;
  email: string;
  role: "admin" | "student";
  status: "active" | "blocked";
  registered_at: string;
  completed_lessons: number;
};

export default async function AdminAlunosPage() {
  const admin = await requireAdmin();
  const sql = getSql();

  const { n: totalAulasPublicadas } = (
    await sql<{ n: number }[]>`
       SELECT COUNT(*) AS n
       FROM lessons l
       JOIN courses c ON c.id = l.course_id
       WHERE l.status = 'published' AND c.status = 'published'
     `
  )[0];

  const rows = await sql<ProfileRow[]>`
       SELECT p.id, p.full_name, p.email, p.role, p.status, p.registered_at,
        (SELECT COUNT(*)
           FROM lesson_progress lp
           JOIN lessons l ON l.id = lp.lesson_id
           JOIN courses c ON c.id = l.course_id
          WHERE lp.user_id = p.id AND lp.completed = 1
            AND l.status = 'published' AND c.status = 'published') AS completed_lessons
       FROM profiles p
       WHERE p.status != 'deleted'
       ORDER BY p.registered_at DESC
     `;

  // Planos publicados (select do formulário) + plano ativo de cada perfil.
  // Ambiente sem a migration 0011 (42P01) degrada: sem select de plano.
  let planos: { id: number; name: string }[] = [];
  const planoPorPerfil = new Map<number, number>();
  try {
    planos = await sql<{ id: number; name: string }[]>`
      SELECT id, name FROM plans WHERE status = 'published' ORDER BY id
    `;
    const vinculos = await sql<{ profile_id: number; plan_id: number }[]>`
      SELECT DISTINCT ON (profile_id) profile_id, plan_id
        FROM profile_entitlements
       WHERE status = 'active' AND plan_id IS NOT NULL
       ORDER BY profile_id, id
    `;
    for (const v of vinculos) planoPorPerfil.set(v.profile_id, v.plan_id);
  } catch (error) {
    if ((error as { code?: string })?.code !== "42P01") throw error;
  }

  const alunos: AlunoRow[] = rows.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
    registered_at: row.registered_at,
    plan_id: planoPorPerfil.get(row.id) ?? null,
    progress_pct:
      totalAulasPublicadas > 0
        ? Math.round((row.completed_lessons / totalAulasPublicadas) * 100)
        : 0,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-display text-primary">Membros</h1>
        <p className="mt-1 text-base text-secondary">
          Gerencie contas, acessos e acompanhe o progresso de cada aluno.
        </p>
      </div>
      <AlunosManager alunos={alunos} currentUserId={admin.id} planos={planos} />
    </div>
  );
}
