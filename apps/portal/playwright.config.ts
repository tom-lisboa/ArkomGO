import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Playwright E2E unificado — cobre os fluxos gravados:
 *   · genesis.spec.ts          → builder Gênesis de ponta a ponta (geração 8/8 + dados no central)
 *   · solution-sdr.spec.ts     → mapa: drawer expandido do nó-ponta (SDR · Bia) + admin read-only
 *   · solution-journey.spec.ts → aula: feature flag de comentários (NEXT_PUBLIC_ARKOM_ENABLE_COMMENTS)
 *   · solution-mentoria.spec.ts→ mentorias: capa do evento + confirma/desfaz presença (aluno) + admin read-only
 *
 * Base: local (default) ou produção via E2E_BASE_URL.
 *   Ex.: E2E_BASE_URL=https://arkom-dash-production.up.railway.app npx playwright test
 * Credenciais SEMPRE via env (E2E_EMAIL / E2E_PASSWORD) — nunca hardcoded no repo;
 * podem vir do ambiente (precedência) ou de `e2e/.env.e2e` (gitignored).
 * Todos os specs usam `goto` relativo + baseURL; grava vídeo + trace de tudo.
 */
function loadEnvFile(relPath: string): void {
  const abs = resolve(process.cwd(), relPath);
  if (!existsSync(abs)) return;
  for (const rawLine of readFileSync(abs, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile("e2e/.env.e2e");

const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE_URL);
let PORT = 3100;
try {
  PORT = Number(new URL(BASE_URL).port || "3100");
} catch {
  /* mantém 3100 */
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Gênesis gera 8 etapas por IA (pode levar minutos); mapa tem animações + vídeo externo.
  timeout: 600_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    video: "on",
    trace: "on",
    screenshot: "on",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } },
  ],
  webServer: isLocal
    ? {
        command: `npx next start -p ${PORT}`,
        url: `${BASE_URL}/login`,
        reuseExistingServer: true,
        timeout: 180_000,
      }
    : undefined,
});
