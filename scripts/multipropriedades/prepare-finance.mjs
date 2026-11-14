import { createHash, randomBytes } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [checkout, manifest, output] = process.argv.slice(2);
const { sql, quote, ORG_A, ORG_B } = await import(
  pathToFileURL(join(checkout, "scripts/homolog/lib.mjs")).href
);
const marker = await sql("select name from homolog.environment where id;");
if (marker !== "arkom-multi-homolog") throw Error("A Maia exige o banco de homologação.");
const info = await lstat(manifest);
if (!info.isFile() || (info.mode & 0o077) || info.size > 8192) {
  throw Error("Vínculos FinanceAI devem estar em arquivo local privado.");
}
const companies = JSON.parse(await readFile(manifest, "utf8"));
const fields = ["finance_org", "finance_account", "finance_subject", "finance_token", "title_token"];
for (const field of fields) {
  if (![companies.alfa?.[field], companies.beta?.[field]].every(
    (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value),
  ) || companies.alfa[field] === companies.beta[field]) {
    throw Error("Não foi possível preparar vínculos FinanceAI separados para Alfa e Beta.");
  }
}

const statusFunction = await readFile(new URL("finance-status.sql", import.meta.url), "utf8");
const statements = ["begin;", statusFunction];
const bindings = {};
for (const [company, multiOrg] of [["alfa", ORG_A], ["beta", ORG_B]]) {
  const { title_token, ...binding } = companies[company];
  if (binding.finance_url !== "http://127.0.0.1:8195") throw Error("FinanceAI deve ser local.");
  const role = "multi_finance_" + createHash("sha256").update("arkomgo:" + multiOrg).digest("hex").slice(0, 16);
  const password = randomBytes(32).toString("hex");
  statements.push(`
    do $create$ begin
      if not exists(select from pg_roles where rolname=${quote(role)}) then
        create role ${role};
      end if;
    end $create$;
    alter role ${role} login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password ${quote(password)};
    grant multi_finance_bridge to ${role};
    insert into app_multi.financeai_credenciais_v1(login,org_id,finance_org,conta_id,titular_id)
      values(${quote(role)},${quote(multiOrg)},${quote(binding.finance_org)},${quote(binding.finance_account)},${quote(binding.finance_subject)})
      on conflict(login) do nothing;
    do $verify$ begin
      if not exists(select from app_multi.financeai_credenciais_v1
        where login=${quote(role)} and org_id=${quote(multiOrg)} and finance_org=${quote(binding.finance_org)}
          and conta_id=${quote(binding.finance_account)} and titular_id=${quote(binding.finance_subject)}) then
        raise exception 'vínculo local Maia–FinanceAI mudou';
      end if;
    end $verify$;`);
  binding.multi_org = multiOrg;
  binding.multi_database_url = `postgres://${role}:${password}@127.0.0.1:55322/postgres?sslmode=disable`;
  const file = join(output, company + ".json");
  await writeFile(file, JSON.stringify(binding), { mode: 0o600, flag: "wx" });
  bindings[multiOrg] = { file, title_token };
}
try {
  await sql([...statements, "commit;"].join("\n"));
} catch {
  throw Error("Não foi possível instalar as credenciais restritas no banco local da Maia.");
}
await writeFile(join(output, "bindings.json"), JSON.stringify(bindings), { mode: 0o600, flag: "wx" });
