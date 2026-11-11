// Remove os links de PREVIEW do Viver de IA (lib Panda d6ebf577-797) da tabela
// app_arkom.solution_previews. Mantém as linhas + remix_url. Sem vídeo bilhon →
// preview_url = NULL → o drawer do mapa mostra só a descrição (sem vídeo).
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
  const before = await sql`SELECT count(*)::int AS n FROM solution_previews WHERE preview_url ILIKE '%pandavideo%'`;
  const upd = await sql`
    UPDATE solution_previews
       SET preview_url = NULL
     WHERE preview_url ILIKE '%d6ebf577%' OR preview_url ILIKE '%viverdeia%'
    RETURNING solution_slug`;
  console.log(`links VdI antes: ${before[0].n} · zerados agora: ${upd.length}`);
  const rows = await sql`SELECT solution_slug, preview_url FROM solution_previews ORDER BY solution_slug`;
  console.log("=== solution_previews agora ===");
  for (const r of rows) console.log(`${r.solution_slug.padEnd(20)} preview=${r.preview_url ?? "— (sem vídeo)"}`);
} catch (e) {
  console.error("ERRO:", e.message); process.exitCode = 1;
} finally { await sql.end(); }
