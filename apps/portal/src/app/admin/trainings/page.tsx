// Admin > Capacitações — gestão de cursos (Story 1.6).
// Leitura em server component; mutações via server actions em ./actions.ts.
// Guard requireAdmin() aplicado no layout admin.

import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import {
  CoursesManager,
  type AdminCourse,
} from "@/components/admin-conteudo/courses-manager";

export default async function Page() {
  await requireAdmin();
  const sql = getSql();
  const courses = await sql<AdminCourse[]>`
       SELECT c.id, c.title, c.description, c.cover_url, c.release_type,
              c.release_after_days, c.sort_order, c.status,
              (SELECT COUNT(*) FROM course_modules m WHERE m.course_id = c.id) AS modules_count,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lessons_count
       FROM courses c
       ORDER BY c.sort_order, c.id
     `;

  return <CoursesManager courses={courses} />;
}
