// READ-ONLY: solution_previews atuais + procura aulas "como usar solução" no banco.
import { readFileSync } from "node:fs";
import postgres from "postgres";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = postgres(process.env.ARKOM_DATABASE_URL, {
  connection: { search_path: "app_arkom" }, ssl: "require", max: 2,
});
try {
  console.log("=== app_arkom.solution_previews (atual) ===");
  try {
    const rows = await sql`SELECT solution_slug, preview_url, remix_url FROM solution_previews ORDER BY solution_slug`;
    if (!rows.length) console.log("(vazia)");
    for (const r of rows) console.log(`${r.solution_slug.padEnd(20)} preview=${(r.preview_url||"—").slice(0,70)}`);
  } catch (e) { console.log("erro solution_previews:", e.message); }

  console.log("\n=== schemas visíveis ===");
  const schemas = await sql`SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' AND schema_name <> 'information_schema' ORDER BY 1`;
  console.log(schemas.map(s => s.schema_name).join(", "));

  console.log("\n=== cursos no app_arkom (procurando tutoriais de solução) ===");
  const courses = await sql`SELECT id, title, status FROM courses ORDER BY sort_order, id`;
  for (const c of courses) console.log(`#${c.id} [${c.status}] ${c.title}`);

  console.log("\n=== aulas cujo título menciona solução/como usar/SDR/atendimento/etc ===");
  const lessons = await sql`
    SELECT l.title, l.video_url, c.title AS course
    FROM lessons l JOIN courses c ON c.id=l.course_id
    WHERE l.title ~* 'como usar|solu|sdr|atendimento|financ|social|ads|onboard|petici|recruta|crm|cmo'
    ORDER BY l.course_id, l.sort_order LIMIT 40`;
  if (!lessons.length) console.log("(nenhuma no app_arkom)");
  for (const l of lessons) console.log(`[${l.course}] ${l.title} → ${(l.video_url||"").slice(0,60)}`);
} catch (e) {
  console.error("ERRO:", e.message);
} finally { await sql.end(); }
