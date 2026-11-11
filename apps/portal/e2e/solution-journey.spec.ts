import { test, expect, type Page } from "@playwright/test";

/**
 * Jornada e2e GRAVADA (vídeo + trace) da área do aluno Arkom, com login REAL no
 * Supabase central. Prova o efeito da feature flag NEXT_PUBLIC_ARKOM_ENABLE_COMMENTS
 * na página da aula:
 *   · flag OFF (padrão)  → o bloco "Espaço de Networking" NÃO renderiza.
 *   · flag ON            → o bloco volta (sanidade inversa via E2E_EXPECT_COMMENTS=1).
 *
 * A flag é client-side (inlined no build), então cada cenário roda contra o build
 * correspondente (`npm run build` com/sem a env), servido por `npm start`.
 *
 * Rota da seção "Soluções": /solutions SAIU do app principal (vive na dash
 * dedicada, deploy ARKOM_APP_MODE=solutions), então a jornada valida a seção
 * real "Soluções em destaque" no /home e segue por Capacitações (curso → aula)
 * — onde vive a asserção dos comentários.
 */

const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";
const EXPECT_COMMENTS = process.env.E2E_EXPECT_COMMENTS === "1";

async function login(page: Page): Promise<void> {
  await page.goto("/");
  // (aluno)/layout → requireUser redireciona para /login sem sessão.
  await page.waitForURL(/\/login/, { timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();

  await page.locator("#login-email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Server action loginAction → redirect. Aluno cai em /home; senha temporária
  // cairia em /settings?primeiro-acesso=1 (sinalizamos claramente se ocorrer).
  await page.waitForURL(/\/(home|settings|admin)/, { timeout: 60_000 });
  const url = page.url();
  expect(
    /\/home/.test(url),
    `Após o login, esperava /home mas caiu em ${url}. ` +
      "Se for /settings a conta de teste exige troca de senha (must_change_password).",
  ).toBeTruthy();
}

test("jornada: Soluções → Capacitações → aula, com estado dos comentários pela flag", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "E2E_EMAIL/E2E_PASSWORD ausentes (ver e2e/.env.e2e).");

  // 1-3 · login real e chegada autenticada no /home
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Soluções em destaque" }),
  ).toBeVisible();

  // 4 · /solutions saiu do app principal (dash dedicada) — a jornada segue
  //     direto do /home para Capacitações.

  // 5 · Capacitações — via nav lateral (link real; não travado).
  await page.getByRole("link", { name: "Capacitações" }).first().click();
  await page.waitForURL(/\/trainings$/, { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Capacitações" })).toBeVisible();

  // abrir um curso (primeiro card "Top", que tem aulas)
  const courseCard = page
    .locator('a[href^="/trainings/"]:not([href*="/lesson/"])')
    .first();
  await expect(courseCard, "nenhum curso no catálogo do banco").toBeVisible();
  await courseCard.click();
  await page.waitForURL(/\/trainings\/[^/]+$/, { timeout: 45_000 });

  // abrir uma aula (primeira aula do curso)
  const lessonLink = page.locator('a[href^="/trainings/lesson/"]').first();
  await expect(lessonLink, "curso sem aulas publicadas").toBeVisible();
  await lessonLink.click();
  await page.waitForURL(/\/trainings\/lesson\//, { timeout: 45_000 });

  // 6a · conteúdo da aula visível (título + aba lateral "Aulas" do LessonView)
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Aulas" })).toBeVisible();

  // 6b · estado do bloco de comentários conforme a flag
  const networking = page.getByText("Espaço de Networking");
  const commentInput = page.getByPlaceholder(/Escreva um comentário/);
  const commentCounter = page.getByText(/\d+\s+coment[aá]rios?/i);

  if (EXPECT_COMMENTS) {
    // sanidade inversa (flag ON): o bloco volta
    await expect(networking).toBeVisible();
    await expect(commentInput).toBeVisible();
    await expect(page.getByRole("button", { name: "Publicar" })).toBeVisible();
  } else {
    // padrão (flag OFF): ausência total do bloco
    await expect(networking).toHaveCount(0);
    await expect(commentInput).toHaveCount(0);
    await expect(commentCounter).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publicar" })).toHaveCount(0);
  }
});
