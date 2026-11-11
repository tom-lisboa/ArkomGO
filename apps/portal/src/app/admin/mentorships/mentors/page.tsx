// /admin/mentorships/mentors — cadastro dos mentores (Tarefa 2, migration 0014).
// Leitura em server component; CRUD via server actions em ./actions.ts.
//
// Fica como sub-rota de Mentorias (com botão no cabeçalho de /admin/mentorships)
// em vez de virar um 11º item da nav lateral — mesmo precedente de
// /admin/trainings/rails (D8): mentor é conteúdo da área de Mentorias, não uma
// área própria. Mantém a convenção rota-em-inglês / label-pt-BR (D5).
//
// Ambiente sem a 0014 (dev em `app_arkom`) degrada por 42P01: a tela mostra
// "Banco ainda não preparado" e nada quebra.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  MentorsManager,
  type AdminMentor,
} from "@/app/admin/mentorships/mentors/mentors-manager";

export const metadata: Metadata = { title: "Mentores" };

export default async function AdminMentoresPage() {
  await requireAdmin();
  const sql = getSql();

  let mentores: AdminMentor[] = [];
  let migrationMissing = false;
  const flagLigada = await isFeatureEnabled("mentors_enabled");

  try {
    mentores = await sql<AdminMentor[]>`
      SELECT m.id, m.slug, m.full_name, m.specialty, m.bio, m.photo_url,
             m.status, m.sort_order,
             (SELECT COUNT(*)::int FROM event_mentors em WHERE em.mentor_id = m.id)
               AS events_count
        FROM mentors m
       ORDER BY m.sort_order, m.id
    `;
  } catch (error) {
    if ((error as { code?: string })?.code === "42P01") migrationMissing = true;
    else throw error;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/admin/mentorships"
          className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para as mentorias
        </Link>
        <h1 className="mt-3 text-2xl font-display font-bold tracking-display text-primary">
          Mentores
        </h1>
        <p className="mt-1 text-base text-secondary">
          Quem conduz os encontros: nome, especialidade, descrição e foto. A ordem
          desta lista é a ordem da vitrine na página de mentorias do aluno; o
          vínculo com cada encontro é feito na edição da mentoria.
        </p>
      </div>
      <MentorsManager
        mentores={mentores}
        flagLigada={flagLigada}
        migrationMissing={migrationMissing}
      />
    </div>
  );
}
