import { test, expect, type Page } from "@playwright/test";

// Vídeo ponta-a-ponta da JORNADA do Genesis sobre o mapa: composer → análise →
// perguntas → geração → resultado (a roda florescendo + drawer no canvas).
// Sem asserções de banco (foco no vídeo). video:'on' na config → grava webm.
// Rodar: E2E_BASE_URL=http://localhost:3111 E2E_EMAIL=... E2E_PASSWORD=... \
//        npx playwright test e2e/genesis-video.spec.ts --project=chromium

const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

const IDEIA =
  "Quero automatizar a qualificação de leads que chegam pelo WhatsApp da minha agência: " +
  "qualificar cada lead com IA, pontuar por potencial de fechamento e agendar a reunião " +
  "no Google Calendar do closer automaticamente, com um resumo do lead no convite.";

const RESPOSTAS = [
  "Hoje é 100% manual: o time responde pelo WhatsApp Business e anota em planilha.",
  "Chegam ~200 leads/mês, com picos de 400 nas campanhas de tráfego pago.",
  "Usamos WhatsApp Business, Google Sheets e Google Calendar; o CRM ainda é aberto.",
  "Orçamento até R$ 500/mês em ferramentas; 3 vendedores e 1 gestor comercial.",
  "Qualifico por orçamento, urgência do projeto e nicho (serviços ou e-commerce).",
  "A IA responde em até 2 min, em português, tom consultivo, e escala pra humano quando pedem.",
  "O agendamento cai no Google Calendar do closer com resumo, telefone e a pontuação.",
  "Time sem ninguém técnico — manutenção simples, de preferência no-code/low-code.",
];

async function login(page: Page) {
  expect(EMAIL, "Defina E2E_EMAIL").toBeTruthy();
  expect(PASSWORD, "Defina E2E_PASSWORD").toBeTruthy();
  await page.goto("/login");
  await page.locator("#login-email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

test("Genesis — jornada sobre o mapa (vídeo ponta a ponta)", async ({ page }) => {
  test.setTimeout(600_000);

  await login(page);

  // composer SOBRE o mapa
  await page.goto("/genesis");
  const campoIdeia = page.getByPlaceholder(/Quero automatizar a qualificação de leads/);
  await expect(campoIdeia).toBeVisible({ timeout: 30_000 });
  await campoIdeia.fill(IDEIA);
  await page.waitForTimeout(1400);
  await page.getByRole("button", { name: /Analisar ideia/ }).click();

  // perguntas (cards sobre o mapa) até "Gerar agora"
  const campoResposta = page.getByPlaceholder("Sua resposta… (ou use o microfone)");
  const gerarAgora = page.getByRole("button", { name: /Gerar agora/ });
  for (let i = 0; i < 15; i++) {
    await expect(campoResposta.or(gerarAgora).first()).toBeVisible({ timeout: 180_000 });
    if (await gerarAgora.isVisible()) break;
    await campoResposta.fill(RESPOSTAS[i % RESPOSTAS.length]);
    await page.waitForTimeout(650);
    await page.getByRole("button", { name: /Próxima|Revisar/ }).click();
  }
  await expect(gerarAgora).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);

  // gerar → resultado (a roda floresce; contador 8/8)
  await gerarAgora.click();
  await page.waitForURL(/\/genesis\/solution\/\d+/, { timeout: 240_000 });
  await expect(page.getByText("8/8", { exact: true })).toBeVisible({ timeout: 300_000 });
  await page.waitForTimeout(2000);

  // clicar em algumas etapas → drawer no canvas (mostra o conteúdo)
  const sigils = page.locator("button.sigil-badge");
  const n = await sigils.count();
  for (const idx of [3, 6, 0]) {
    if (idx < n) {
      await sigils.nth(idx).click({ force: true }).catch(() => {});
      await page.waitForTimeout(2200);
      await page.locator('button[aria-label="Fechar"]').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }
  await page.waitForTimeout(1200);
});
