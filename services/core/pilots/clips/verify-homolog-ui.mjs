// Run against the unmodified CLIPS build and ./pilots/clips/run-local.sh --homolog-ui.
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const checkout = process.argv[2];
assert(checkout, "Pass the local checkout of Bilhon-OS/arkom-clips");
const { chromium } = createRequire(resolve(checkout, "package.json"))("playwright");

const arkon = fileURLToPath(new URL("../../", import.meta.url));
const app = "http://127.0.0.1:18083";
const go = "http://127.0.0.1:18082";
const supabaseRef = "auytmefqnuzbktyzcled";
const interceptedOrigin = "https://" + supabaseRef + ".supabase.co";
const state = resolve(arkon, ".local/clips-homolog-ui");
const org = "org-clips-homolog";
const userId = "usuario-clips-homolog";
const projectId = "projeto-clips-novo";
const clipId = "corte-clips-novo";
const title = "Projeto novo · Homologação CLIPS Go";
const clipTitle = "O universo escuro";
const sourcePath = org + "/" + userId + "/" + projectId + "/source.m4v";
const testHeaders = { "x-org-id": org, Authorization: "Bearer fixture-clips-owner" };
const user = {
  id: userId, aud: "authenticated", role: "authenticated",
  email: "clips-owner@homolog.invalid", user_metadata: { full_name: "Conta de homologação" },
  app_metadata: { provider: "email", providers: ["email"] }, created_at: "2026-11-06T00:00:00Z",
};
const expires_at = Math.floor(Date.now() / 1000) + 3600;
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub: userId, exp: expires_at }) + ".fixture";
const session = { access_token: jwt, refresh_token: "fixture", expires_at, expires_in: 3600, token_type: "bearer", user };
const project = {
  id: projectId, org_id: org, user_id: userId, title, status: "completed", source_type: "upload",
  storage_path: sourcePath, duration: 339, resolution: "720p", created_at: "2026-11-06T00:00:00Z",
};
const clip = {
  id: clipId, project_id: projectId, org_id: org, title: clipTitle, score: 91,
  start_time: 30, end_time: 43.6, format: "9:16", transcript_excerpt: "A maior parte do universo é escura.",
  track_data: [{ t: 0, xPct: 50, yPct: 50, fit: true }, { t: 13.6, xPct: 50, yPct: 50, fit: true }],
};

assert.equal((await fetch(go + "/healthz").then((r) => r.json())).mode, "homolog-export");
await mkdir(state, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CLIPS_TEST_CHROMIUM ? { executablePath: process.env.CLIPS_TEST_CHROMIUM } : {}),
});

const cors = {
  "access-control-allow-origin": app,
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
};
const faults = [];
let accepted;
let sent;
let calls = 0;
const json = (route, value, status = 200) => route.fulfill({ json: value, status, headers: cors });

try {
  const context = await browser.newContext({
    acceptDownloads: true, serviceWorkers: "block", locale: "pt-BR", viewport: { width: 1280, height: 900 },
  });
  await context.addInitScript(({ key, value, local }) => {
    if (location.origin === local) localStorage.setItem(key, JSON.stringify(value));
  }, { key: "sb-" + supabaseRef + "-auth-token", value: session, local: app });

  // Every browser request is intercepted. Only assets from the local app may continue.
  await context.route("**/*", async (route) => {
    const request = route.request();
    const u = new URL(request.url());
    if (u.origin === app) return route.continue();
    if (u.origin !== interceptedOrigin) return route.abort();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });

    try {
      assert.equal(request.headers().authorization, "Bearer " + jwt);
      if (u.pathname === "/auth/v1/user") return json(route, user);
      if (u.pathname === "/rest/v1/rpc/claim_by_email") {
        assert.equal(request.postDataJSON()._solution, "clips");
        return json(route, org);
      }
      if (u.pathname === "/rest/v1/projects" && u.searchParams.get("id") === "eq." + projectId) {
        return json(route, project);
      }
      if (u.pathname === "/rest/v1/clips" && u.searchParams.get("project_id") === "eq." + projectId) {
        return json(route, [clip]);
      }
      if (u.pathname === "/rest/v1/transcriptions") return json(route, []);
      if (u.pathname === "/functions/v1/clips_trim-video") {
        assert.equal(request.headers()["x-org-id"], org);
        sent = request.postDataJSON();
        assert.equal(sent.projectId, projectId);
        assert.equal(sent.clipId, clipId);
        const response = await fetch(go + "/homolog" + u.pathname, {
          method: "POST", headers: { ...testHeaders, "content-type": "application/json" },
          body: JSON.stringify(sent),
        });
        accepted = await response.json();
        assert.equal(response.status, 202, JSON.stringify(accepted));
        calls++;
        return json(route, accepted, 202);
      }
      if (u.pathname === "/storage/v1/object/list/clips-videos") {
        const path = request.postDataJSON();
        const filename = accepted.exportId + ".mp4";
        assert.equal(path.prefix.replace(/\/$/, "") + "/" + path.search, accepted.exportPath);
        const ready = await fetch(go + "/homolog/exports/" + accepted.exportId, {
          method: "HEAD", headers: testHeaders,
        });
        assert([200, 404].includes(ready.status));
        return json(route, ready.ok ? [{ name: filename, metadata: { size: Number(ready.headers.get("x-export-bytes")) } }] : []);
      }
      const signPrefix = "/storage/v1/object/sign/clips-videos/";
      if (u.pathname === signPrefix + sourcePath) return json(route, { signedURL: "/object/sign/clips-videos/" + sourcePath });
      if (accepted && u.pathname === signPrefix + accepted.exportPath && request.method() === "POST") {
        const response = await fetch(go + "/homolog/exports/" + accepted.exportId + "/sign", {
          method: "POST", headers: testHeaders,
        });
        assert.equal(response.status, 200);
        const signed = new URL((await response.json()).signedUrl);
        assert.equal(signed.origin, go);
        return json(route, { signedURL: "/object/sign/clips-videos/" + accepted.exportPath + signed.search });
      }
      // Mock only shell information unrelated to exporting.
      if (request.method() === "GET" && /^\/rest\/v1\/(profiles|roles|memberships|app_settings)$/.test(u.pathname)) {
        return json(route, []);
      }
      throw new Error("unexpected local fixture call: " + request.method() + " " + u.pathname);
    } catch (err) {
      faults.push(String(err));
      return json(route, { message: "fixture request failed" }, 500);
    }
  });

  // Downloads and video previews have no Authorization header. Match only these exact fixture URLs.
  await context.route(interceptedOrigin + "/storage/v1/object/sign/clips-videos/**", async (route) => {
    const request = route.request();
    const u = new URL(request.url());
    if (request.method() !== "GET") return route.fallback();
    if (u.pathname.endsWith("/" + sourcePath)) {
      return route.fulfill({
        path: resolve(arkon, ".local/clips-podcast/source.m4v"),
        contentType: "video/mp4", headers: cors,
      });
    }
    if (!accepted || u.pathname !== "/storage/v1/object/sign/clips-videos/" + accepted.exportPath) return route.abort();
    const result = await fetch(go + "/homolog/exports/" + accepted.exportId + "/file?" + u.searchParams);
    return route.fulfill({
      status: result.status,
      headers: { ...cors, "content-type": "video/mp4", "content-disposition": result.headers.get("content-disposition") ?? "attachment" },
      body: Buffer.from(await result.arrayBuffer()),
    });
  });

  const page = await context.newPage();
  await page.goto(app + "/project/" + projectId);
  try {
    await page.getByRole("heading", { name: title }).waitFor({ timeout: 15000 });
    const exportButton = page.getByRole("button", { name: "Exportar", exact: true });
    const downloadEvent = page.waitForEvent("download", { timeout: 25000 });
    await exportButton.click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), accepted.downloadName);
    const output = resolve(state, "exportacao-clips-oficial.mp4");
    await download.saveAs(output);
    const media = await readFile(output);
    assert(media.length > 100_000 && media.subarray(4, 8).toString() === "ftyp");
    await page.getByText("Clip exportado com sucesso!", { exact: true }).waitFor({ timeout: 10000 });
    await page.screenshot({ path: resolve(state, "interface-oficial.png"), fullPage: true });
    assert.equal(calls, 1);
    assert.deepEqual(faults, []);

    // Direct calls to the local adapter verify the server-side routing boundary.
    const call = (body, authorization = testHeaders.Authorization, orgId = org) =>
      fetch(go + "/homolog/functions/v1/clips_trim-video", {
        method: "POST",
        headers: { Authorization: authorization, "x-org-id": orgId, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    for (const [body, authorization] of [
      [{ ...sent, projectId: "outro-projeto" }, testHeaders.Authorization],
      [{ ...sent, clipId: "outro-corte" }, testHeaders.Authorization],
      [sent, "Bearer fixture-clips-colleague"],
    ]) {
      const response = await call(body, authorization);
      assert.deepEqual(await response.json(), { route: "legacy" });
    }
    assert.equal((await call(sent, testHeaders.Authorization, "outra-org")).status, 403);
    assert.equal((await call(sent, "Bearer invalid")).status, 401);
    assert.equal((await fetch(go + "/homolog/functions/v1/outra_solucao", { method: "POST" })).status, 404);
    const duplicate = await call(sent);
    assert.equal((await duplicate.json()).exportId, accepted.exportId);
    console.log(JSON.stringify({ output, bytes: media.length, exportId: accepted.exportId, calls }, null, 2));
  } catch (err) {
    console.error(faults, await page.locator("body").innerText());
    throw err;
  }
} finally {
  await browser.close();
}
