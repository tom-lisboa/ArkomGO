// Admin > Capacitações > Módulos e Aulas (Story 1.6).
// Next 15: params é async — sempre await. Guard requireAdmin() no layout admin.

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import {
  CourseContentManager,
  type AdminCourseHeader,
  type AdminLesson,
  type AdminModule,
  type AdminResource,
} from "@/components/admin-conteudo/course-content-manager";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const courseId = Number(id);
  if (!Number.isInteger(courseId) || courseId <= 0) notFound();

  const sql = getSql();
  const course = (
    await sql<AdminCourseHeader[]>`
      SELECT id, title, status FROM courses WHERE id = ${courseId}
    `
  )[0];
  if (!course) notFound();

  const modules = await sql<AdminModule[]>`
    SELECT id, title, description, sort_order, status
    FROM course_modules WHERE course_id = ${courseId}
    ORDER BY sort_order, id
  `;

  const lessons = await sql<AdminLesson[]>`
    SELECT id, module_id, title, description, video_provider, video_url, sort_order, status
    FROM lessons WHERE course_id = ${courseId}
    ORDER BY sort_order, id
  `;

  const resources = await sql<AdminResource[]>`
       SELECT r.id, r.lesson_id, r.title, r.resource_type, r.url, r.sort_order
       FROM lesson_resources r
       JOIN lessons l ON l.id = r.lesson_id
       WHERE l.course_id = ${courseId}
       ORDER BY r.sort_order, r.id
     `;

  return (
    <CourseContentManager
      course={course}
      modules={modules}
      lessons={lessons}
      resources={resources}
    />
  );
}
