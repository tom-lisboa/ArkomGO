// e2e/app-rating-stars.spec.ts — prova do QA 86ajr8mgx: no card "Sua avaliação"
// (/apps/[id]) as cores das estrelas estavam INVERTIDAS — a escolhida/hover
// usava o `accent` do shadcn (cinza de superfície, escuro no tema dark → sumia
// no fundo) e a vazia usava neutral-200 cru (cinza claro fixo → brilhava).
// Regra nova (star-rating.tsx): cheia = --arkom-gold (dourado, flipa por tema),
// vazia = st-line-2 (apagada, acompanha o tema). A prova cobre hover, seleção,
// persistência, os DOIS temas e as médias read-only do /admin.
//
// E2E_CADENCIA=1 ⇒ take de VÍDEO (login digitado, varredura de hover lenta,
// pausas de leitura). Sem a env, prova de regressão rápida — mesmas asserções.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { PERFIS, loginAs, educacionalUrl } from "./helpers/arkom-session";

const CADENCIA = process.env.E2E_CADENCIA === "1";
test.use({ launchOptions: { slowMo: CADENCIA ? 150 : 0 } });

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL;
const SENHA = process.env.E2E_PASSWORD;

/** Pausa de leitura — só no take de vídeo. */
async function pausa(page: Page, ms = 2000): Promise<void> {
  if (CADENCIA) await page.waitForTimeout(ms);
}

/** Serializa uma cor CSS crua (#hex, #hex8, rgb…) do jeito que o navegador
 *  computa — compara igual com igual contra getComputedStyle().fill. */
async function normalizaCor(page: Page, raw: string): Promise<string> {
  return page.evaluate((value) => {
    const el = document.createElement("div");
    el.style.color = value;
    document.body.appendChild(el);
    const out = getComputedStyle(el).color;
    el.remove();
    return out;
  }, raw);
}

/** Valor RESOLVIDO de um token no tema atual, já na serialização computada. */
async function token(page: Page, name: string): Promise<string> {
  const raw = await page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name
  );
  expect(raw, `token ${name} vazio`).not.toBe("");
  return normalizaCor(page, raw);
}

function fillDe(star: Locator): Promise<string> {
  return star.evaluate((el) => getComputedStyle(el).fill);
}

/** Nota atual do aluno de teste para o app (null = nunca avaliou). */
async function notaNoBanco(appId: number): Promise<number | null> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    const [row] = await sql<{ rating: number }[]>`
      SELECT rating FROM educacional.app_ratings
       WHERE user_id = ${PERFIS.alunoLegado} AND app_id = ${appId} LIMIT 1`;
    return row ? Number(row.rating) : null;
  } finally {
    await sql.end();
  }
}

// A jornada AVALIA de verdade (grava em app_ratings); o estado anterior é
// snapshotado na entrada e devolvido byte a byte na saída.
let restaurar: { appId: number; rating: number | null } | null = null;

test.afterEach(async () => {
  if (!restaurar) return;
  const postgres = (await import("postgres")).default;
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    if (restaurar.rating == null) {
      await sql`DELETE FROM educacional.app_ratings
                 WHERE user_id = ${PERFIS.alunoLegado} AND app_id = ${restaurar.appId}`;
    } else {
      await sql`UPDATE educacional.app_ratings SET rating = ${restaurar.rating}
                 WHERE user_id = ${PERFIS.alunoLegado} AND app_id = ${restaurar.appId}`;
    }
  } finally {
    await sql.end();
  }
  restaurar = null;
});

test("estrelas de avaliação: escolhida DOURADA e vivas no hover, demais apagadas — nos dois temas e no admin", async ({
  context,
  page,
}) => {
  // ── Entrar como aluno (vídeo: login digitado; regressão: cookie cunhado) ──
  if (CADENCIA && EMAIL && SENHA) {
    await page.goto("/login");
    await page.getByRole("textbox", { name: "E-mail" }).pressSequentially(EMAIL, { delay: 45 });
    await page.getByRole("textbox", { name: "Senha" }).pressSequentially(SENHA, { delay: 45 });
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/(home|admin|settings)(\?|$)/);
    await pausa(page, 1400);
  } else {
    await loginAs(context, BASE, PERFIS.alunoLegado);
  }

  // ── /apps → abrir um app publicado, como o aluno faria ──────────────────
  await page.goto("/apps");
  await pausa(page, 1800);
  const card = page.locator('a[href^="/apps/"]').first();
  await expect(card).toBeVisible();
  if (CADENCIA) {
    await card.hover();
    await pausa(page, 1200);
  }
  await card.click();
  await page.waitForURL(/\/apps\/\d+/);
  const appId = Number(new URL(page.url()).pathname.split("/").pop());
  restaurar = { appId, rating: await notaNoBanco(appId) };

  const grupo = page.getByRole("radiogroup");
  await grupo.scrollIntoViewIfNeeded();
  await expect(grupo).toBeVisible();
  await pausa(page, 2000);

  const estrela = (n: number) =>
    grupo.getByRole("radio", { name: `${n} estrela` }).locator("svg");

  // Tokens resolvidos do tema ATUAL (dark por padrão).
  const ouro = await token(page, "--arkom-gold");
  const apagada = await token(page, "--st-line-2");
  expect(ouro).not.toBe(apagada);

  // ── Hover: varredura (vídeo) e a régua na 4ª — 1..4 douradas, 5ª apagada ──
  if (CADENCIA) {
    for (let n = 1; n <= 5; n++) {
      await grupo.getByRole("radio", { name: `${n} estrela` }).hover();
      await page.waitForTimeout(650);
    }
    await pausa(page, 1200);
  }
  await grupo.getByRole("radio", { name: "4 estrelas" }).hover();
  for (let n = 1; n <= 4; n++) {
    await expect.poll(() => fillDe(estrela(n)), `estrela ${n} dourada no hover`).toBe(ouro);
  }
  await expect.poll(() => fillDe(estrela(5)), "5ª estrela apagada").toBe(apagada);
  // Regressão explícita do report: a vazia não pode ser o neutral-200 cru
  // (#e5e5e5) que brilhava no fundo escuro.
  expect(await fillDe(estrela(5))).not.toBe("rgb(229, 229, 229)");
  await pausa(page, 3200); // momento-prova nº 1: escolhidas em DESTAQUE, não sumidas

  // ── Seleciona 4: grava, confirma e persiste no reload ────────────────────
  await grupo.getByRole("radio", { name: "4 estrelas" }).click();
  await expect(page.getByText("Avaliação registrada!")).toBeVisible();
  await pausa(page, 2400);

  await page.reload();
  const grupo2 = page.getByRole("radiogroup");
  await grupo2.scrollIntoViewIfNeeded();
  await page.mouse.move(4, 4); // sem hover: o que sobra é a nota gravada
  const estrela2 = (n: number) =>
    grupo2.getByRole("radio", { name: `${n} estrela` }).locator("svg");
  for (let n = 1; n <= 4; n++) {
    await expect.poll(() => fillDe(estrela2(n)), `estrela ${n} dourada persistida`).toBe(ouro);
  }
  await expect.poll(() => fillDe(estrela2(5))).toBe(apagada);
  await pausa(page, 2800); // momento-prova nº 2: a nota ficou, dourada

  // ── Tema CLARO: o dourado flipa junto (#b9915b) e nada some ──────────────
  const toggleTema = page.getByRole("button", { name: "Alternar modo claro ou escuro" });
  if (await toggleTema.isVisible().catch(() => false)) {
    await toggleTema.click();
  } else {
    await page.evaluate(() => localStorage.setItem("skilltree-theme", "light"));
    await page.reload();
    await page.getByRole("radiogroup").scrollIntoViewIfNeeded();
  }
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const ouroClaro = await token(page, "--arkom-gold");
  const apagadaClara = await token(page, "--st-line-2");
  expect(ouroClaro).not.toBe(ouro); // o token realmente flipou de tema
  const grupo3 = page.getByRole("radiogroup");
  await grupo3.scrollIntoViewIfNeeded();
  await page.mouse.move(4, 4);
  const estrela3 = (n: number) =>
    grupo3.getByRole("radio", { name: `${n} estrela` }).locator("svg");
  for (let n = 1; n <= 4; n++) {
    await expect.poll(() => fillDe(estrela3(n)), `estrela ${n} dourada no claro`).toBe(ouroClaro);
  }
  await expect.poll(() => fillDe(estrela3(5))).toBe(apagadaClara);
  await pausa(page, 3000); // momento-prova nº 3: tema claro, mesmo contraste

  // volta pro escuro (deixa o app como encontrou)
  if (await toggleTema.isVisible().catch(() => false)) {
    await toggleTema.click();
  } else {
    await page.evaluate(() => localStorage.setItem("skilltree-theme", "dark"));
    await page.reload();
  }
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await pausa(page, 1600);

  // ── Admin: médias read-only seguem douradas (mesmo componente) ───────────
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin");
  const mediaApps = page
    .getByText("Média geral dos apps")
    .locator("xpath=..")
    .locator('[role="img"]');
  await mediaApps.scrollIntoViewIfNeeded();
  await expect(mediaApps).toBeVisible();
  await pausa(page, 2600);
  // com a nota recém-dada, a média é ≥ 1 → a 1ª estrela está cheia e DOURADA
  const ouroAdmin = await token(page, "--arkom-gold");
  await expect
    .poll(() => fillDe(mediaApps.locator("svg").first()), "média do admin dourada")
    .toBe(ouroAdmin);
  await pausa(page, 2600); // momento-prova nº 4: admin intacto, dourado de marca
});
