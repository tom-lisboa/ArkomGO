// e2e/universidade-vitrine.spec.ts — prova do QA 86ajrcjpe: na grade "Todos
// os cursos" da Universidade IA, cursos COM descrição no banco tinham o título
// empurrado pro meio da capa (o espaço reservado pro hover ficava no fluxo),
// enquanto cursos sem descrição ficavam com o título embaixo — vitrine
// despadronizada. Regra nova: a descrição vive FORA do fluxo (overlay acima do
// título, só no hover) — o eixo do nome é idêntico em todos os cards e o hover
// não move o título um pixel.
//
// E2E_CADENCIA=1 ⇒ take de VÍDEO (login digitado, scroll lento, pausas de
// leitura). Sem a env, prova de regressão rápida — mesmas asserções.

import { expect, test, type Page } from "@playwright/test";
import { PERFIS, loginAs } from "./helpers/arkom-session";

const CADENCIA = process.env.E2E_CADENCIA === "1";
test.use({ launchOptions: { slowMo: CADENCIA ? 200 : 0 } });

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL;
const SENHA = process.env.E2E_PASSWORD;

/** Pausa de leitura — só no take de vídeo. */
async function pausa(page: Page, ms = 2000): Promise<void> {
  if (CADENCIA) await page.waitForTimeout(ms);
}

test("vitrine: títulos das capas no MESMO eixo; hover mostra a descrição sem mover o título", async ({
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

  await page.goto("/trainings");
  await pausa(page, 1800);
  const grade = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: /Todos os cursos/i }) })
    .first();
  await expect(grade).toBeVisible();

  // Vídeo: chegar na grade rolando, como um aluno de verdade.
  if (CADENCIA) {
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 140);
      await page.waitForTimeout(320);
    }
    await pausa(page, 3200); // momento-prova nº 1: a grade com os títulos no MESMO eixo
  } else {
    await grade.scrollIntoViewIfNeeded();
  }

  const cards = grade.getByTestId("course-card");
  const total = await cards.count();
  expect(total).toBeGreaterThanOrEqual(2);

  // ── O eixo: distância do rodapé do card até a BASE do nome, card a card.
  //    Antes do fix variava ~80px (descrição empurrava); agora tem que ser
  //    idêntica em todos (tolerância de arredondamento: 2px). ───────────────
  const eixos: number[] = [];
  for (let i = 0; i < total; i++) {
    const card = cards.nth(i);
    const cardBox = await card.boundingBox();
    const tituloBox = await card.getByTestId("course-card-title").boundingBox();
    expect(cardBox, `card ${i} sem boundingBox`).toBeTruthy();
    expect(tituloBox, `card ${i} sem título`).toBeTruthy();
    eixos.push(cardBox!.y + cardBox!.height - (tituloBox!.y + tituloBox!.height));
  }
  expect(Math.max(...eixos) - Math.min(...eixos)).toBeLessThanOrEqual(2);

  // Posição do título DENTRO do card (invariante a scroll — hover() pode
  // rolar a página, e boundingBox() é relativo à viewport).
  async function eixoNoCard(card: ReturnType<typeof cards.nth>): Promise<number> {
    const cardBox = await card.boundingBox();
    const tituloBox = await card.getByTestId("course-card-title").boundingBox();
    return tituloBox!.y - cardBox!.y;
  }

  // ── Hover num card SEM descrição: nada aparece, título parado. ───────────
  const semStrap = cards.filter({ hasNot: page.getByTestId("course-card-strap") });
  if ((await semStrap.count()) > 0) {
    const alvo = semStrap.first();
    await alvo.scrollIntoViewIfNeeded();
    const antes = await eixoNoCard(alvo);
    await alvo.hover();
    await pausa(page, 2200);
    expect(Math.abs((await eixoNoCard(alvo)) - antes)).toBeLessThanOrEqual(1);
  }

  // ── Hover num card COM descrição: a descrição surge ACIMA do nome e o
  //    título não se move um pixel (a régua do dono no ciclo 2026-07-25). ────
  const comStrap = cards.filter({ has: page.getByTestId("course-card-strap") });
  expect(await comStrap.count()).toBeGreaterThanOrEqual(1);
  const alvo = comStrap.first();
  const strap = alvo.getByTestId("course-card-strap");
  const titulo = alvo.getByTestId("course-card-title");

  await alvo.scrollIntoViewIfNeeded();
  await expect(strap).toHaveCSS("opacity", "0");
  const antes = await eixoNoCard(alvo);
  await alvo.hover();
  await expect(strap).toHaveCSS("opacity", "1");
  await pausa(page, 3200);

  expect(Math.abs((await eixoNoCard(alvo)) - antes)).toBeLessThanOrEqual(1);

  const strapBox = await strap.boundingBox();
  const tituloBox = await titulo.boundingBox();
  expect((await strap.textContent())?.trim().length).toBeGreaterThan(0);
  // acima do nome, nunca embaixo empurrando o layout
  expect(strapBox!.y + strapBox!.height).toBeLessThanOrEqual(tituloBox!.y + 1);

  // ── Sai do hover: a capa volta limpa. ────────────────────────────────────
  await page.mouse.move(4, 4);
  await expect(strap).toHaveCSS("opacity", "0");
  await pausa(page, 1600);

  // ── Só no vídeo: varre mais cards com descrição (cada hover mostra a
  //    descrição surgindo ACIMA do nome, com o eixo parado) e fecha mostrando
  //    a grade inteira alinhada, linha a linha. ─────────────────────────────
  if (CADENCIA) {
    const extras = Math.min(await comStrap.count(), 3);
    for (let i = 1; i < extras; i++) {
      const c = comStrap.nth(i);
      await c.scrollIntoViewIfNeeded();
      await c.hover();
      await pausa(page, 2400);
    }
    await page.mouse.move(4, 4);
    await pausa(page, 1200);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 170);
      await page.waitForTimeout(340);
    }
    await pausa(page, 2600);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -170);
      await page.waitForTimeout(300);
    }
    await pausa(page, 2200);
  }
});
