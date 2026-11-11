// Exercises the real CLIPS login against an isolated GoTrue and Postgres.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { once } from "node:events";

const [checkout, authDir] = process.argv.slice(2).map((path) => resolve(path));
assert(checkout && authDir, "Pass the CLIPS checkout and the official Auth release directory");
const { chromium } = createRequire(join(checkout, "package.json"))("playwright");
const app = "http://127.0.0.1:18086";
const gateway = "http://127.0.0.1:18084";
const auth = "http://127.0.0.1:18085";
const instance = "8d006a10-2194-40bd-b447-2ffb400ba066";
const org = "8d006a10-2194-40bd-b447-2ffb400ba077";
const state = await mkdtemp("/tmp/clips-auth-");
const pg = process.env.CLIPS_PILOT_PG_BIN || "/opt/homebrew/opt/postgresql@17/bin";
const jwtSecret = randomBytes(48).toString("base64url");
const password = randomBytes(24).toString("base64url");
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwtInput = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 1200 });
const adminToken = jwtInput + "." + createHmac("sha256", jwtSecret).update(jwtInput).digest("base64url");
const tokenHeaders = { "content-type": "application/json", Authorization: "Bearer " + adminToken };
const runPG = (program, ...args) => execFileSync(join(pg, program), args, { stdio: "ignore" });
const procs = [];
let pgStarted = false;
let browser;
let server;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const events = [];
let owner;
let orgBehavior = "linked";

function run(name, executable, args, env, cwd) {
  const child = spawn(executable, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
  procs.push(child);
  let log = "";
  child.stdout.on("data", (chunk) => { log = (log + chunk).slice(-8000); });
  child.stderr.on("data", (chunk) => { log = (log + chunk).slice(-8000); });
  return { child, log: () => log, check() {
    if (child.exitCode !== null) {
      throw new Error(name + " stopped (" + child.exitCode + "): " + log.replaceAll(jwtSecret, "[redacted]").replaceAll(password, "[redacted]"));
    }
  } };
}

async function waitFor(origin, child) {
  for (let i = 0; i < 70; i++) {
    child.check();
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(700) })).ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error("Local service unavailable at " + origin);
}

function answer(res, status, value) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

try {
  runPG("initdb", "-D", join(state, "pg"), "-U", "postgres", "--auth=trust", "--no-locale", "-E", "UTF8");
  runPG("pg_ctl", "-D", join(state, "pg"), "-l", join(state, "pg.log"),
    "-o", "-c listen_addresses='' -k " + state + " -p 55476", "-w", "start");
  pgStarted = true;
  runPG("psql", "-X", "-h", state, "-p", "55476", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-c", "CREATE SCHEMA auth; ALTER ROLE postgres SET search_path=auth,public");

  const authEnv = {
    PATH: process.env.PATH,
    PORT: "18085", GOTRUE_API_HOST: "127.0.0.1", API_EXTERNAL_URL: gateway + "/auth/v1",
    GOTRUE_SITE_URL: app, GOTRUE_DB_DRIVER: "postgres",
    DATABASE_URL: "postgres://postgres@localhost:55476/postgres?sslmode=disable&host=" + encodeURIComponent(state),
    DB_NAMESPACE: "auth", GOTRUE_DB_AUTOMIGRATE: "true", GOTRUE_DB_MIGRATIONS_PATH: join(authDir, "migrations"),
    GOTRUE_JWT_SECRET: jwtSecret, GOTRUE_JWT_ADMIN_ROLES: "service_role",
    GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated", GOTRUE_JWT_AUD: "authenticated",
    GOTRUE_EXTERNAL_EMAIL_ENABLED: "true", GOTRUE_DISABLE_SIGNUP: "true",
  };
  execFileSync(join(authDir, "auth"), ["migrate"], { env: authEnv, cwd: state, stdio: "pipe", timeout: 20000 });
  const service = run("Supabase Auth", join(authDir, "auth"), ["serve"], authEnv, state);
  await waitFor(auth + "/health", service);
  const email = "clips-owner@homolog.invalid";
  const created = await fetch(auth + "/admin/users", {
    method: "POST", headers: tokenHeaders, body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!created.ok) {
    const details = await created.text();
    console.error("Local Auth error:", details.replaceAll(password, "[redacted]"));
    console.error(service.log().slice(-6000).replaceAll(password, "[redacted]").replaceAll(jwtSecret, "[redacted]"));
    const authLog = await readFile(join(state, "pg.log"), "utf8");
    console.error(authLog.slice(-5000).replaceAll(password, "[redacted]"));
    throw new Error("Local account provisioning returned HTTP " + created.status);
  }
  owner = (await created.json()).id;
  assert(owner);

  server = createServer(async (req, res) => {
    res.setHeader("access-control-allow-origin", app);
    res.setHeader("access-control-allow-headers", "authorization, apikey, content-type, x-client-info, accept-profile, content-profile, x-supabase-api-version");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
    try {
      const url = new URL(req.url, gateway);
      let body = "";
      for await (const bytes of req) {
        body += bytes;
        if (body.length > 8192) { answer(res, 413, {}); return; }
      }
      const headers = { Authorization: req.headers.authorization ?? "", "content-type": "application/json" };
      if (url.pathname === "/auth/v1/user" || url.pathname === "/auth/v1/token") {
        const response = await fetch(auth + url.pathname.slice("/auth/v1".length) + url.search, {
          method: req.method, headers, body: body || undefined,
        });
        events.push({ path: url.pathname, status: response.status });
        return answer(res, response.status, await response.json());
      }
      const identity = await fetch(auth + "/user", { headers });
      if (!identity.ok || (await identity.json()).id !== owner) return answer(res, 401, { message: "invalid session" });
      if (url.pathname === "/rest/v1/rpc/org_for_instance") {
        const correct = JSON.parse(body)._instance_id === instance;
        events.push({ path: url.pathname, correct });
        if (orgBehavior === "unavailable") return answer(res, 503, { message: "fixture organization lookup failed" });
        return answer(res, 200, correct && orgBehavior === "linked" ? org : null);
      }
      if (url.pathname === "/rest/v1/rpc/claim_instance" && orgBehavior === "unlinked") {
        return answer(res, 200, null);
      }
      // Only CLIPS dashboard data is simulated; Auth password and token checks above are real.
      if (req.method === "GET" && url.pathname.startsWith("/rest/v1/")) return answer(res, 200, []);
      events.push({ path: url.pathname, unexpected: true });
      return answer(res, 404, { message: "not supported by this fixture" });
    } catch {
      return answer(res, 500, { message: "local Auth harness failure" });
    }
  }).listen(18084, "127.0.0.1");
  await once(server, "listening");

  const buildEnv = {
    ...process.env, CLIPS_ALLOW_LOOPBACK_AUTH: "1",
    VITE_CLIPS_HOMOLOG_URL: gateway,
    VITE_CLIPS_HOMOLOG_PUBLISHABLE_KEY: "sb_publishable_local_clips_homolog",
    VITE_CLIPS_HOMOLOG_INSTANCE_ID: instance,
  };
  execFileSync("npm", ["run", "build", "--", "--mode", "clips-homolog"], {
    cwd: checkout, env: buildEnv, stdio: "inherit", timeout: 90000,
  });
  const assets = await readdir(join(checkout, "dist/assets"));
  const bundle = (await Promise.all(assets.filter((f) => f.endsWith(".js"))
    .map((f) => readFile(join(checkout, "dist/assets", f), "utf8")))).join("\n");
  assert(bundle.includes(gateway));
  assert(!bundle.includes("auytmefqnuzbktyzcled"), "Production project leaked into homolog build");

  const front = run("CLIPS", join(checkout, "node_modules/.bin/vite"),
    ["preview", "--host", "127.0.0.1", "--port", "18086", "--strictPort", "--mode", "clips-homolog"], buildEnv, checkout);
  await waitFor(app, front);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CLIPS_TEST_CHROMIUM ? { executablePath: process.env.CLIPS_TEST_CHROMIUM } : {}),
  });
  const context = await browser.newContext({ serviceWorkers: "block", locale: "pt-BR" });
  await context.route("**/*", (route) => {
    const origin = new URL(route.request().url()).origin;
    return [app, gateway].includes(origin) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  await page.goto(app + "/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("deliberadamente-incorreta");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByText("E-mail ou senha incorretos.", { exact: true }).waitFor({ timeout: 12000 });
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/dashboard", { timeout: 12000 });
  await page.getByText("Meus Vídeos", { exact: true }).first().waitFor({ timeout: 15000 });
  assert(events.some((e) => e.path.endsWith("/token") && e.status === 400));
  assert(events.some((e) => e.path.endsWith("/token") && e.status === 200));
  assert(events.some((e) => e.path.endsWith("/org_for_instance") && e.correct));
  assert(!events.some((e) => e.unexpected));
  await page.reload();
  await page.getByText("Meus Vídeos", { exact: true }).first().waitFor({ timeout: 15000 });
  orgBehavior = "unavailable";
  await page.reload();
  await page.getByText("Não conseguimos carregar sua organização", { exact: true }).waitFor({ timeout: 15000 });
  orgBehavior = "unlinked";
  await page.reload();
  await page.getByText("Você ainda não tem acesso", { exact: true }).waitFor({ timeout: 15000 });
  assert(!events.some((e) => e.unexpected));
  await writeFile(resolve(authDir, "resultado-login-local.json"), JSON.stringify({
    wrongPassword: 400, correctPassword: 200, reachedDashboard: true, expectedInstance: true,
    productionRefInBundle: false, auth: "GoTrue com Postgres local", organization: "fixture autenticada",
    sessionSurvivesReload: true, lookupErrorDistinctFromMissingOrg: true, noMembershipFallback: true,
  }, null, 2));
  console.log("Login e recarga passaram. Falha técnica e falta de vínculo têm estados distintos, sem fallback para outra organização.");
} finally {
  await browser?.close();
  server?.close();
  server?.closeAllConnections();
  await Promise.all(procs.map(async (child) => {
    if (child.exitCode === null && child.signalCode === null) {
      const done = once(child, "exit");
      child.kill("SIGTERM");
      await done;
    }
  }));
  if (pgStarted) runPG("pg_ctl", "-D", join(state, "pg"), "-m", "fast", "-w", "stop");
  await rm(state, { recursive: true, force: true });
}
