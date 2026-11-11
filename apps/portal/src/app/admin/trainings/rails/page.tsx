// /admin/trainings/rails — Vitrine do catálogo: as prateleiras da Universidade
// IA como configuração (migration 0013). Leitura em server component; CRUD via
// server actions em ./actions.ts.
//
// O preview da composição efetiva usa a MESMA função que o /trainings
// (`resolveRailCourseIds`), então o que a Carol vê aqui é o que o aluno vê lá.
// Se a 0013 ainda não rodou neste ambiente, a página degrada (42P01).

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  loadCourseWatchScores,
  railTitle,
  resolveRailCourseIds,
  type CourseRailRow,
  type RailCatalogCourse,
} from "@/components/trainings/rails";
import {
  RailsManager,
  type AdminRail,
  type AdminRailCourse,
} from "@/app/admin/trainings/rails/rails-manager";

export const metadata: Metadata = { title: "Vitrine do catálogo" };

type CourseRow = {
  id: number;
  title: string;
  status: "draft" | "published";
  lessons: number;
};

export default async function AdminCourseRailsPage() {
  await requireAdmin();
  const sql = getSql();

  let rails: AdminRail[] = [];
  let cursos: AdminRailCourse[] = [];
  let migrationMissing = false;
  const flagLigada = await isFeatureEnabled("course_rails_enabled");

  try {
    const courseRows = await sql<CourseRow[]>`
      SELECT c.id, c.title, c.status,
             (SELECT COUNT(*)::int
                FROM lessons l
                JOIN course_modules m ON m.id = l.module_id
               WHERE l.course_id = c.id
                 AND l.status = 'published'
                 AND m.status = 'published') AS lessons
        FROM courses c
       ORDER BY c.sort_order, c.id
    `;
    cursos = courseRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      comingSoon: row.lessons === 0,
    }));

    const railRows = await sql<CourseRailRow[]>`
      SELECT id, slug, title, mode, card_style, icon, item_limit, clickable,
             sort_order, enabled
        FROM course_rails
       ORDER BY sort_order, id
    `;
    const slotRows = await sql<{ rail_id: number; course_id: number }[]>`
      SELECT rail_id, course_id
        FROM course_rail_slots
       ORDER BY rail_id, sort_order, id
    `;

    const slots = new Map<number, number[]>();
    for (const row of slotRows) {
      const list = slots.get(row.rail_id) ?? [];
      list.push(row.course_id);
      slots.set(row.rail_id, list);
    }

    // O catálogo do aluno = só cursos publicados, na ordem do catálogo.
    // `watchScore` = assistidos (mesma fonte do /trainings — o modo `top`
    // ranqueia igual nas duas telas).
    const assistidos = await loadCourseWatchScores();
    const catalogo: RailCatalogCourse[] = cursos
      .filter((curso) => curso.status === "published")
      .map((curso) => ({
        id: curso.id,
        comingSoon: curso.comingSoon,
        watchScore: assistidos.get(curso.id) ?? 0,
      }));

    rails = railRows.map((rail) => {
      const previewIds = resolveRailCourseIds(rail, catalogo, slots);
      return {
        ...rail,
        slot_course_ids: slots.get(rail.id) ?? [],
        preview_course_ids: previewIds,
        // Título como o aluno lê, com o {n} já resolvido (mesma função do
        // render do /trainings — as duas telas nunca divergem).
        preview_title: railTitle(rail.title, previewIds.length),
      };
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "42P01") migrationMissing = true;
    else throw error;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/admin/trainings"
          className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para os cursos
        </Link>
        <h1 className="mt-3 text-2xl font-display font-bold tracking-display text-primary">
          Vitrine do catálogo
        </h1>
        <p className="mt-1 text-base text-secondary">
          As prateleiras que o aluno vê na Universidade IA: título, ordem,
          quais cursos entram e quantos aparecem. Vale na hora, sem publicar
          versão nova do site.
        </p>
      </div>
      <RailsManager
        rails={rails}
        cursos={cursos}
        flagLigada={flagLigada}
        migrationMissing={migrationMissing}
      />
    </div>
  );
}
