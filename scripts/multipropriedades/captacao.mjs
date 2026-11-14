import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [root, worker] = process.argv.slice(2);
const { localStatus, quote, sql } = await import(
  pathToFileURL(join(root, "scripts/homolog/lib.mjs")).href
);
const status = await localStatus();
if (await sql("select name from homolog.environment where id") !== "arkom-multi-homolog") {
  throw Error("Banco local de homologação não confirmado.");
}

const password = randomBytes(24).toString("hex");
const dsn = new URL(status.DB_URL);
dsn.username = "multi_captacao_worker";
dsn.password = password;
dsn.search = "sslmode=disable";

await sql("alter role multi_captacao_worker login password " + quote(password));
try {
  const child = spawn(worker, [], { env: { MULTI_CAPTACAO_LOCAL_DATABASE_URL: dsn.href }, stdio: "inherit" });
  const stop = () => child.kill("SIGTERM");
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal === "SIGTERM" ? 0 : 1)));
  });
} finally {
  await sql("alter role multi_captacao_worker nologin password null");
}
