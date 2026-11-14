import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { addFinanceDialog } from "./vite-bridge.mjs";

const [sourceArg, stageArg, runtimeArg] = process.argv.slice(2);
if (!sourceArg || !stageArg || !runtimeArg) throw Error("Informe checkout, staging novo e configuração da Maia.");
const source = resolve(sourceArg), stage = resolve(stageArg);
const root = "/arkomgo/agents/maia";
const portal = "https://sdk.arkom.ai";
const { PUBLISHABLE_KEY: key } = JSON.parse(await readFile(runtimeArg, "utf8"));
if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) throw Error("Chave publicável inválida.");

await mkdir(stage);
for (const name of ["src", "public", "package.json", "tsconfig.json"]) {
  await cp(join(source, name), join(stage, name), { recursive: true });
}
await symlink(join(source, "node_modules"), join(stage, "node_modules"), "dir");

async function edit(path, replace) {
  const file = join(stage, path);
  await writeFile(file, replace(await readFile(file, "utf8")));
}
function replaceOnce(text, anchor, replacement) {
  if (text.split(anchor).length !== 2) throw Error("A estrutura da Maia mudou: " + anchor);
  return text.replace(anchor, replacement);
}

await edit("src/router.tsx", text => replaceOnce(text, "    routeTree,", `    routeTree,\n    basepath: "${root}",`));
await edit("src/routes/__root.tsx", text => replaceOnce(text, "  shellComponent: RootShell,", ""));
await edit("src/homolog/env.ts", text => {
  text = replaceOnce(text, 'export const SUPABASE_URL_CENTRAL = "http://127.0.0.1:55321";',
    `export const SUPABASE_URL_CENTRAL = "${portal}/arkomgo/maia-data";`);
  const start = text.indexOf("export function assertHomologacao()");
  const end = text.indexOf("export function urlCentral()", start);
  if (start < 0 || end < 0) throw Error("A configuração de homologação mudou.");
  return text.slice(0, start) + `export function assertHomologacao() {
    if (window.location.origin !== "${portal}" || !window.location.pathname.startsWith("${root}/")) {
      throw new Error("Abra a Maia pela ArkomGO.");
    }
  }\n` + text.slice(end);
});
await edit("src/homolog/client.ts", text => {
  text = replaceOnce(text, "target.origin !== urlCentral()", '!target.href.startsWith(urlCentral() + "/")');
  text = replaceOnce(text, 'headers, redirect: "error"', 'headers, credentials: "omit", redirect: "error"');
  text = replaceOnce(text, "persistSession: true", "persistSession: false");
  return replaceOnce(text, "detectSessionInUrl: true", "detectSessionInUrl: false");
});
await edit("src/integrations/multi-api/dashboard.ts", text =>
  replaceOnce(text, 'path !== "/multipropriedades-api"', 'path !== "/multipropriedades-api" && path !== "/arkomgo/maia-api"'));
await edit("src/routes/_authenticated/financeiro/receber.tsx", text =>
  addFinanceDialog(text, portal, portal + "/arkomgo/maia-api"));
await edit("src/components/cotistas/PortalLinkCard.tsx", text =>
  text.replace("${window.location.origin}/portal/", `\${window.location.origin}${root}/portal/`));

await writeFile(join(stage, "index.html"), `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Maia · Arkom</title></head>
<body><div id="root"></div><script type="module" src="/src/hosted-entry.tsx"></script></body></html>`);
await writeFile(join(stage, "src/hosted-entry.tsx"), `
import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { getSupabase } from "./homolog/client";
import "./styles.css";

const mount = createRoot(document.getElementById("root")!);
const portal = ${JSON.stringify(portal)};
const root = ${JSON.stringify(root)};
if (window.parent === window) {
  mount.render(<main><a href="/arkomgo/">Abra a Maia pelo seu time na Arkom.</a></main>);
} else if (location.pathname === root + "/__arkom/entrar") {
  const requestId = crypto.randomUUID();
  async function launch(event: MessageEvent) {
    const data = event.data;
    if (event.origin !== portal || event.source !== window.parent ||
        data?.type !== "arkom.multi.session" || data.requestId !== requestId) return;
    window.removeEventListener("message", launch);
    try {
      const { data: result, error } = await getSupabase().auth.setSession(data.session);
      if (error || !result.session) throw Error("invalid_session");
      window.parent.postMessage({type:"arkom.multi.opened",requestId},portal);
      history.replaceState({}, "", root + "/");
      mount.render(<RouterProvider router={getRouter()} />);
    } catch {
      window.parent.postMessage({type:"arkom.multi.failed",requestId},portal);
    }
  }
  window.addEventListener("message", launch);
  window.parent.postMessage({type:"arkom.multi.ready",requestId},portal);
} else {
  mount.render(<RouterProvider router={getRouter()} />);
}
`);
await writeFile(join(stage, "vite.hosted.mjs"), `
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
const file = (name) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({
  base: ${JSON.stringify(root + "/")},
  plugins: [react(), tailwind()],
  define: {
    __MULTI_HOMOLOG_KEY__: ${JSON.stringify(JSON.stringify(key))},
    "import.meta.env.VITE_MULTI_API_URL": ${JSON.stringify(JSON.stringify(portal + "/arkomgo/maia-api"))},
  },
  resolve: { alias: [
    { find: "@/integrations/supabase/client-central", replacement: file("./src/homolog/client.ts") },
    { find: "@/integrations/supabase/env-central", replacement: file("./src/homolog/env.ts") },
    { find: "@", replacement: file("./src") },
  ] },
  envDir: file("./empty-env"),
});`);
const built = spawnSync(process.execPath, [
  join(source, "node_modules/vite/bin/vite.js"), "build", "--mode", "homologacao", "--config", "vite.hosted.mjs",
], { cwd: stage, stdio: "inherit" });
if (built.status !== 0) process.exit(built.status || 1);
