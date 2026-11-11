import { test, expect, type Locator, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

/**
 * Fluxo do ALUNO na área de Mentorias (/mentorships): abre a CAPA de um
 * evento publicado (EventModal — capa, título, data/horário), CONFIRMA presença
 * (RSVP grava em event_confirmations) e DESFAZ (toggle reversível → deixa o
 * banco limpo). Depois uma verificação ADMIN read-only da gestão de mentorias.
 *
 * DADOS: o banco Arkom é o CENTRAL de produção e hoje NÃO tem nenhum evento de
 * mentoria. Para exercitar o fluxo do aluno sem mexer no admin (read-only) e sem
 * "fingir" o teste, o spec provisiona UM evento publicado direto no banco
 * (beforeAll) e o remove no fim (afterAll → ON DELETE CASCADE limpa as
 * confirmações). Somado ao toggle confirma-e-desfaz, o estado líquido do banco
 * fica idêntico ao inicial (vazio). Gravado em vídeo + trace.
 */

const STUDENT = { email: "aluno@bilhon.ai", password: "bilhon123" };
const ADMIN = { email: "admin@bilhon.ai", password: "bilhon123" };

/** Resolve ARKOM_DATABASE_URL do ambiente ou de .env.local / e2e/.env.e2e. */
function resolveDatabaseUrl(): string {
  if (process.env.ARKOM_DATABASE_URL) return process.env.ARKOM_DATABASE_URL;
  for (const rel of [".env.local", "e2e/.env.e2e", ".env"]) {
    const abs = resolve(process.cwd(), rel);
    if (!existsSync(abs)) continue;
    for (const raw of readFileSync(abs, "utf-8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      if (line.slice(0, eq).trim() !== "ARKOM_DATABASE_URL") continue;
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (v) return v;
    }
  }
  throw new Error(
    "ARKOM_DATABASE_URL não encontrado (ambiente / .env.local) — necessário para provisionar o evento do E2E."
  );
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

let sql: ReturnType<typeof postgres>;
let seededEventId: number | null = null;

test.beforeAll(async () => {
  sql = postgres(resolveDatabaseUrl(), {
    connection: { search_path: "app_arkom" },
    ssl: "require",
    max: 1,
  });
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO mentorship_events
      (title, description, cover_url, event_date, starts_at, ends_at, redirect_url, recurrence_type, status)
    VALUES
      ('[E2E] Mentoria de Teste',
       'Evento temporário do E2E para validar a capa e a confirmação de presença.',
       null, ${isoDate(1)}, '20:00', '21:00',
       'https://exemplo.arkom.dev/mentoria', 'none', 'published')
    RETURNING id
  `;
  seededEventId = row.id;
});

test.afterAll(async () => {
  if (sql) {
    if (seededEventId != null) {
      await sql`DELETE FROM mentorship_events WHERE id = ${seededEventId}`;
    }
    await sql.end();
  }
});

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/**
 * Abre /mentorships e devolve o PRIMEIRO gatilho de evento. Se o mês atual não
 * tiver eventos, navega ‹/› (loop limitado) até achar um `event-pill-*` — para
 * frente primeiro (eventos futuros), depois para trás. Falha com mensagem clara
 * se nenhuma mentoria existir (não faça o teste passar sem dados reais).
 */
async function findFirstEvent(page: Page): Promise<Locator> {
  await page.goto("/mentorships");
  await expect(page.getByRole("button", { name: "Hoje" })).toBeVisible();

  const pill = page.locator('[data-testid^="event-pill-"]').first();
  const next = page.getByRole("button", { name: "›" });
  const prev = page.getByRole("button", { name: "‹" });

  for (let i = 0; i < 14; i++) {
    if ((await pill.count()) > 0) return pill;
    await next.click();
    await page.waitForTimeout(150);
  }

  await page.getByRole("button", { name: "Hoje" }).click();
  await page.waitForTimeout(150);
  for (let i = 0; i < 14; i++) {
    await prev.click();
    await page.waitForTimeout(150);
    if ((await pill.count()) > 0) return pill;
  }

  throw new Error(
    "Nenhuma mentoria encontrada no calendário — verifique o DB (status='published')."
  );
}

test("aluno — capa da mentoria, confirma presença e desfaz", async ({ page }) => {
  await login(page, STUDENT.email, STUDENT.password);
  await page.waitForURL("**/home");

  const pill = await findFirstEvent(page);
  await pill.click();

  // capa (EventModal): capa (1º filho — img ou fallback de gradiente), título e
  // linha de data/horário (rótulo "19h00").
  const modal = page.getByTestId("event-modal");
  await expect(modal).toBeVisible();
  await expect(modal.locator("> div").first()).toBeVisible();
  await expect(modal.locator("h2")).not.toBeEmpty();
  await expect(modal).toContainText(/\d{1,2}h\d{2}/);

  // GATE de acesso (D18): SEM presença confirmada não existe <a> de acesso —
  // no lugar dele fica o botão travado (cadeado), quando o evento tem link.
  const confirm = page.getByTestId("confirm-presence");
  await expect(confirm).toBeVisible();
  await expect(page.getByTestId("access-mentoria")).toHaveCount(0);
  const temLink = (await page.getByTestId("access-locked").count()) > 0;

  // confirma → o botão vira "Presença confirmada" e o acesso DESTRAVA,
  // apontando para a rota gateada (nunca a URL crua da sala).
  await confirm.click();
  await expect(confirm).toContainText("Presença confirmada", { timeout: 20_000 });
  if (temLink) {
    const access = page.getByTestId("access-mentoria");
    await expect(access).toBeVisible();
    await expect(access).toHaveAttribute("target", "_blank");
    await expect(access).toHaveAttribute("href", /\/api\/mentorships\/go\/\d+$/);
  }

  // desfaz → volta a "Confirmar presença" (banco limpo) e o acesso TRAVA de novo
  await confirm.click();
  await expect(confirm).toContainText("Confirmar presença", { timeout: 20_000 });
  await expect(page.getByTestId("access-mentoria")).toHaveCount(0);

  // fecha a capa (Esc)
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
});

test("admin — gestão de mentorias renderiza (READ-ONLY, nada é salvo)", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await page.waitForURL("**/admin");

  await page.goto("/admin/mentorships");
  await expect(page.getByRole("heading", { name: "Mentorias" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Nova mentoria" })).toBeVisible();
  // read-only: NÃO criar/editar/excluir (mesmo spec roda contra produção).
});
