import { notFound, redirect } from "next/navigation";

import { Shell } from "@/components/Shell";
import "../trainings.css";
import { requireUser } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { CourseDetailBody } from "@/components/trainings/course-detail";
import { getCourseDetail } from "@/components/trainings/data";
import { resolveCourseId } from "@/components/trainings/content";

export const dynamic = "force-dynamic";

/**
 * /trainings/[courseId] — página do curso (REATIVA ao app_arkom).
 * Server component: resolve o curso pelo slug (derivado do título) para o aluno
 * logado. Guards: curso inexistente → notFound; curso bloqueado (release-gating)
 * → redirect p/ o catálogo (nem por URL direta abre). Registra a visita em
 * course_access_logs (PA-03: "cursos mais acessados"). Capa = cover_url do banco.
 */
export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const user = await requireUser();
  const course = await getCourseDetail(resolveCourseId(courseId), user);
  if (!course) notFound();
  // Bloqueado (release_after_days ainda não atingido): não abre nem por URL.
  if (course.locked) redirect("/trainings");

  // Registro de acesso: 1 registro por visita (dashboard "cursos mais acessados").
  if (course.dbCourseId) {
    await getSql()`
      INSERT INTO course_access_logs (user_id, course_id)
      VALUES (${user.id}, ${course.dbCourseId})
    `;
  }

  return (
    <Shell>
      <CourseDetailBody course={course} />
    </Shell>
  );
}
