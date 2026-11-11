import { test, expect, type Page } from "@playwright/test";

/**
 * Fluxo do aluno até o nó-ponta "SDR Suite · Bia" (área Business), validando o
 * popover EXPANDIDO (2 colunas, vídeo fixo à direita) e a VARIAÇÃO de copy entre
 * nós; depois uma verificação ADMIN read-only do preview da solução SDR.
 *
 * O banco é o CENTRAL de produção: nada é salvo/alterado. Gravado em vídeo.
 */

const STUDENT = { email: "aluno@bilhon.ai", password: "bilhon123" };
const ADMIN = { email: "admin@bilhon.ai", password: "bilhon123" };

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function closeDrawerIfOpen(page: Page) {
  const drawer = page.getByTestId("job-drawer");
  if (await drawer.isVisible().catch(() => false)) {
    await drawer.getByRole("button", { name: "Close" }).click();
    await expect(drawer).toBeHidden();
  }
}

/** abre um nó pela busca do MapTopbar (fecha o drawer atual antes, p/ o dropdown
 *  não ficar coberto pelo popover). */
async function openNode(page: Page, query: string, testid: string) {
  await closeDrawerIfOpen(page);
  const search = page.getByTestId("map-search");
  await search.click();
  await search.fill(query);
  const result = page.getByTestId(testid);
  await expect(result).toBeVisible();
  // o resultado usa onMouseDown (pra não roubar foco do input). Em modo depto o
  // botão "Voltar" fica por cima do dropdown, então disparamos o mousedown direto
  // no elemento — imune a qualquer overlay de z-index.
  await result.dispatchEvent("mousedown");
  await expect(page.getByTestId("job-drawer")).toBeVisible();
}

test("aluno — popover expandido do SDR + variação de copy entre nós", async ({ page }) => {
  await login(page, STUDENT.email, STUDENT.password);
  await page.waitForURL("**/home");

  await page.goto("/map");
  await expect(page.getByTestId("map-search")).toBeVisible();

  // 1) abre o nó-ponta SDR Suite · Bia (Business)
  await openNode(page, "SDR Suite", "search-result-sdr-suite-bia");

  const drawer = page.getByTestId("job-drawer");
  const iframe = page.locator('iframe[src*="pandavideo"]');
  await expect(iframe).toBeVisible();

  // 2) popover LARGO — bounding box > 60% da largura do viewport
  const drawerBox = await drawer.boundingBox();
  const vp = page.viewportSize()!;
  expect(drawerBox).not.toBeNull();
  expect(drawerBox!.width).toBeGreaterThan(vp.width * 0.6);

  // 3) vídeo + botão de remix na coluna direita; remix ABAIXO do vídeo
  const videoBox = (await iframe.boundingBox())!;
  const remix = page.getByTestId("drawer-remix");
  await expect(remix).toBeVisible();
  const remixBox = (await remix.boundingBox())!;
  expect(remixBox.y).toBeGreaterThan(videoBox.y + videoBox.height - 5);

  // 4) coluna esquerda SCROLLÁVEL; o vídeo permanece FIXO durante o scroll
  const left = page.getByTestId("drawer-left");
  const sizes = await left.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
  expect(sizes.sh).toBeGreaterThan(sizes.ch);
  await left.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(400);
  const scrolled = await left.evaluate((el) => el.scrollTop);
  expect(scrolled).toBeGreaterThan(0);
  const videoBoxAfter = (await iframe.boundingBox())!;
  expect(Math.abs(videoBoxAfter.y - videoBox.y)).toBeLessThan(2);

  // captura a escada + "O humano" do SDR
  const sdrLadder = (await page.getByTestId("drawer-ladder").innerText()).trim();
  const sdrHuman = (await page.getByTestId("drawer-human").innerText()).trim();

  // 5) outro nó da MESMA trilha (Business · SDR)
  await openNode(page, "Orquestrador", "search-result-orquestrador-de-ia-bia");
  const orqLadder = (await page.getByTestId("drawer-ladder").innerText()).trim();
  const orqHuman = (await page.getByTestId("drawer-human").innerText()).trim();

  // 6) nó de OUTRA trilha (Back Office · Recruta.AI)
  await openNode(page, "Triagem", "search-result-triagem-por-ia");
  const triLadder = (await page.getByTestId("drawer-ladder").innerText()).trim();
  const triHuman = (await page.getByTestId("drawer-human").innerText()).trim();

  // nenhum texto de escada/humano repetido entre os três nós
  for (const s of [sdrLadder, orqLadder, triLadder, sdrHuman, orqHuman, triHuman]) {
    expect(s.length).toBeGreaterThan(0);
  }
  expect(new Set([sdrLadder, orqLadder, triLadder]).size).toBe(3);
  expect(new Set([sdrHuman, orqHuman, triHuman]).size).toBe(3);
});

test("admin — preview do SDR contém pandavideo (READ-ONLY, nada é salvo)", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await page.waitForURL("**/admin");

  await page.goto("/admin/solutions");
  const preview = page.locator("#preview-sdr");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveValue(/pandavideo/);
  // read-only: NÃO clicar em Salvar, não alterar nada (mesmo spec roda contra produção).
});
