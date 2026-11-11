// Real browser -> official UI -> local Go -> disposable Postgres/GoTrue -> FFmpeg.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

const checkout = resolve(process.argv[2]);
const { chromium } = createRequire(join(checkout, "package.json"))("playwright");
const root = resolve(checkout, "../..");
const out = join(root, ".local/clips-interface-test");
await mkdir(out, { recursive: true });
const base = "https://127.0.0.1:18088";
const gateway = "http://127.0.0.1:18089";
const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const cache = join(homedir(),"Library/Caches/ms-playwright");
const cached = existsSync(cache) ? readdirSync(cache).filter(n=>/^chromium_headless_shell-\d+$/.test(n)).sort((a,b)=>Number(b.split('-').at(-1))-Number(a.split('-').at(-1)))[0] : null;
const executablePath = process.env.CLIPS_TEST_CHROMIUM || (existsSync(systemChrome) ? systemChrome : cached ? join(cache,cached,"chrome-headless-shell-mac-arm64/chrome-headless-shell") : undefined);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true, viewport: { width: 1440, height: 980 } });
const faults = [];
const authPaths = [];
await context.route("**/*", async route => {
  const u = new URL(route.request().url());
  if (u.origin === base) return route.continue();
  if (u.origin === gateway && ["/auth/v1/token", "/auth/v1/user", "/auth/v1/logout"].includes(u.pathname)) {
    authPaths.push({ method: route.request().method(), path: u.pathname });
    return route.continue();
  }
  if (["fonts.googleapis.com", "fonts.gstatic.com"].includes(u.hostname)) return route.abort();
  faults.push(u.origin + u.pathname); return route.abort();
});
try {
  const page = await context.newPage();
  page.on("pageerror", error => faults.push(error.message));
  await page.goto(base + "/login");
  await page.getByRole("heading", { name: "Entrar na conta" }).waitFor();
  await page.screenshot({ path: join(out, "login.png"), fullPage: true, animations: "disabled" });
  await page.locator("#email").fill("bridge@homolog.invalid");
  await page.locator("#password").fill("wrong-password-for-local-test");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByText("E-mail ou senha incorretos.").first().waitFor();
  assert.equal(new URL(page.url()).pathname, "/login");
  await page.locator("#password").fill(process.env.CLIPS_INTERFACE_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(base + "/dashboard");
  await page.getByText("Nenhum vídeo ainda", { exact: true }).waitFor();
  const me = await page.evaluate(() => fetch("/auth/me").then(r => r.json()));
  assert.equal(me.email, "bridge@homolog.invalid");
  assert.equal(await page.evaluate(() => fetch("/storage/v1/object/sign/clips-videos/source/FOREIGN-PROJECT.mp4").then(r=>r.status)),404);
  assert.equal(await page.evaluate(()=>fetch("/rest/v1/projects?id=eq.FOREIGN-PROJECT",{headers:{Accept:"application/vnd.pgrst.object+json"}}).then(r=>r.status)),406);
  assert.equal(await page.evaluate(()=>fetch("/rest/v1/projects?id=eq.FOREIGN-PROJECT",{method:"DELETE"}).then(r=>r.status)),409);
  const cookies = await context.cookies();
  const cookie = cookies.find(c => c.name === "__Host-clips_go_auth");
  assert(cookie?.secure && cookie?.httpOnly && cookie.sameSite === "Strict");
  await page.reload();
  await page.getByText("Nenhum vídeo ainda", { exact: true }).waitFor();
  await page.screenshot({ path: join(out, "dashboard.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("link", { name: "Novo vídeo", exact: true }).first().click();
  await page.getByRole("heading", { name: "Novo vídeo", exact: true }).waitFor();
  assert(await page.getByRole("button", { name: /YouTube/ }).isDisabled());
  await page.locator("#title").fill("Teste isolado da interface oficial");
  await page.locator('input[type="file"]').setInputFiles(join(root, ".local/clips-pilot-video/fixture.mp4"));
  // The submit guard requires the browser to have read the actual file metadata.
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent.includes("Enviar e gerar corte") && !b.disabled));
  await page.getByRole("button", { name: "Enviar e gerar corte", exact: true }).click();
  await page.waitForURL(/\/project\//);
  const id = new URL(page.url()).pathname.split("/").at(-1);
  await page.getByRole("button", { name: "Exportar", exact: true }).first().waitFor({ timeout: 45000 });
  await page.screenshot({ path: join(out, "project.png"), fullPage: true, animations: "disabled" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar", exact: true }).first().click();
  const download = await downloadPromise;
  await download.saveAs(join(out, "export.mp4"));
  const mp4 = await readFile(join(out, "export.mp4"));
  assert(mp4.length > 100 && mp4.subarray(4, 8).toString() === "ftyp");
  assert.equal(await page.evaluate(() => fetch("/ops/status").then(r => r.status)), 401);
  assert.equal(await page.evaluate(() => fetch("/functions/v1/clips_process-project", { method: "POST" }).then(r => r.status)), 501);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(out, "mobile.png"), fullPage: true, animations: "disabled" });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile page overflows");
  // Verify local deletion and that every source/video URL becomes private again after logout.
  const deletion = await page.evaluate(async id => {
    const response = await fetch("/rest/v1/projects?id=eq." + id, { method: "DELETE", headers: { "Accept-Profile": "app_clips" } });
    return { status: response.status, body: await response.json() };
  }, id);
  assert.equal(deletion.status, 200); assert.equal(deletion.body[0].id, id);
  await page.route("**/auth/logout", route => route.abort());
  await page.getByRole("button", { name: "Sair da conta", exact: true }).press("Enter");
  await page.getByText("Não foi possível sair",{exact:true}).first().waitFor();
  assert.equal(await page.evaluate(()=>fetch("/auth/me").then(r=>r.status)),200);
  await page.unroute("**/auth/logout");
  await page.getByRole("button", { name: "Sair da conta", exact: true }).press("Enter");
  await page.waitForURL(base + "/login");
  assert.equal(await page.evaluate(id => fetch("/storage/v1/object/sign/clips-videos/exports/" + id + ".mp4").then(r => r.status), id), 401);
  assert.equal(await page.evaluate(() => fetch("/rest/v1/projects").then(r => r.status)), 401);
  const sourceCalls = authPaths.length;
  await page.locator("#email").fill("native-test@bilhon.com");
  await page.locator("#password").fill(process.env.CLIPS_INTERFACE_NATIVE_PASSWORD);
  const localReply = page.waitForResponse(r => r.url() === base + "/auth/login");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const localResponse = await localReply;
  if (localResponse.status() === 429) {
    await new Promise(resolve => setTimeout(resolve, 6100));
    const retry = page.waitForResponse(r => r.url() === base + "/auth/login");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    const response = await retry; assert.equal(response.status(), 200, await response.text());
  } else { assert.equal(localResponse.status(), 200, await localResponse.text()); }
  await page.waitForURL(base + "/dashboard");
  await page.reload();
  await page.getByText("Nenhum vídeo ainda", { exact: true }).waitFor();
  const nativeIdentity = await page.evaluate(() => fetch("/auth/me").then(r => r.json()));
  assert.equal(nativeIdentity.auth_provider, "local");
  assert.notEqual(nativeIdentity.organization_id, me.organization_id);
  assert.equal(await page.evaluate(id => fetch("/storage/v1/object/sign/clips-videos/source/"+id+".mp4").then(r=>r.status), id),404);
  assert.equal(authPaths.length,sourceCalls,"native login contacted Supabase");
  await page.getByRole("button", { name: "Sair da conta", exact: true }).press("Enter");
  await page.waitForURL(base + "/login");
  assert.equal(authPaths.length,sourceCalls,"native logout contacted Supabase");
  assert.deepEqual(faults, []);
  await writeFile(join(out, "result.json"), JSON.stringify({
    native_login_without_supabase: true, native_reload: true, native_logout: true, real_auth: true, wrong_password_denied: true, login: true, reload: true, official_design_guard: true,
    local_project_created: true, real_video_downloaded: true, local_delete: true, logout: true, failed_logout_does_not_claim_success: true,
    other_customer_project_denied: true,
    mobile_without_overflow: true, unexpected_network_requests: faults, source_auth_paths: authPaths,
    customer_password_used: false, production_data_requests: 0,
  }, null, 2));
  console.log("Official UI: real local login, reload, isolated upload, FFmpeg, download, deletion, logout and mobile checks passed.");
} finally { await browser.close(); }
