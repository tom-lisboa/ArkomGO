// Verificação READ-ONLY do schema `educacional` (builder do Genesis) no Supabase central.
// Confere: tabelas builder_*, seeds ativos de builder_prompt_configs e a versão do
// config "savings" (0007 = v4 com valores reais). NÃO escreve nada.
//
// Uso: node scripts/verify-builder-schema.mjs
// Lê EDUCACIONAL_DATABASE_URL do ambiente ou de .env.local (valor nunca é impresso).

import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* ignore */
  }
}

loadEnvLocal();

const url = process.env.EDUCACIONAL_DATABASE_URL;
if (!url) {
  console.error("EDUCACIONAL_DATABASE_URL ausente (env ou .env.local).");
  process.exit(1);
}

const EXPECTED_STEPS = [
  "base_system",
  "knowledge_base",
  "framework",
  "architecture",
  "tools",
  "action_plan",
  "prompt_lovable",
  "content",
  "savings",
];

const sql = postgres(url, { connection: { search_path: "educacional" }, ssl: "require", max: 1 });

try {
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'educacional'
      AND table_name IN ('builder_prompt_configs','builder_solutions','builder_step_generations')
    ORDER BY table_name
  `;
  console.log("Tabelas builder_* presentes:", tables.map((t) => t.table_name).join(", ") || "(nenhuma)");

  if (tables.length < 3) {
    console.log("!! Faltam tabelas — migration 0006 NÃO aplicada por completo.");
    process.exit(2);
  }

  const configs = await sql`
    SELECT step_key, version, is_active FROM builder_prompt_configs
    WHERE is_active ORDER BY step_key
  `;
  const activeKeys = configs.map((c) => c.step_key);
  console.log(`\nConfigs ATIVOS (${configs.length}):`);
  for (const c of configs) console.log(`  - ${c.step_key} (v${c.version})`);

  const missing = EXPECTED_STEPS.filter((k) => !activeKeys.includes(k));
  console.log(missing.length ? `\n!! step_keys ativos faltando: ${missing.join(", ")}` : "\nOK: todos os 9 step_keys ativos presentes.");

  const savings = configs.find((c) => c.step_key === "savings");
  if (!savings) console.log("!! savings ativo AUSENTE (0006/0007).");
  else if (savings.version >= 4) console.log(`OK: savings v${savings.version} — 0007 (valores reais) aplicada.`);
  else console.log(`!! savings v${savings.version} < 4 — 0007 (savings realista) NÃO aplicada.`);

  // colunas-chave usadas pelo motor
  const cols = await sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'educacional'
      AND table_name = 'builder_step_generations'
      AND column_name IN ('status','updated_at','content','model_used','generation_time_ms','error_message')
    ORDER BY column_name
  `;
  console.log(`\nColunas de builder_step_generations conferidas: ${cols.map((c) => c.column_name).join(", ")}`);
} finally {
  await sql.end();
}
