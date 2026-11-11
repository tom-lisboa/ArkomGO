import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

// Credenciais SEMPRE via env — nunca commitadas (E2E_EMAIL / E2E_PASSWORD).
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

// Lê EDUCACIONAL_DATABASE_URL do env ou do .env.local (não commitado) para
// validar no banco central que o pipeline realmente persistiu a solução.
function educacionalUrl(): string {
  if (process.env.EDUCACIONAL_DATABASE_URL) return process.env.EDUCACIONAL_DATABASE_URL;
  const envFile = readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const line = envFile.split(/\r?\n/).find((l) => l.startsWith("EDUCACIONAL_DATABASE_URL="));
  if (!line) throw new Error("EDUCACIONAL_DATABASE_URL não encontrada (env ou .env.local)");
  return line.slice("EDUCACIONAL_DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
}

const IDEIA =
  "Quero automatizar a triagem de leads que chegam pelo WhatsApp da minha agência: " +
  "qualificar cada lead com IA, pontuar por potencial de fechamento e agendar reunião " +
  "no calendário do closer automaticamente, com resumo do lead no convite.";

// Pool de respostas genéricas mas informativas — as perguntas variam por geração.
const RESPOSTAS = [
  "Hoje o processo é 100% manual: a equipe comercial responde pelo WhatsApp Business e anota tudo em planilha do Google Sheets.",
  "Chegam em média 200 leads por mês, com picos de 400 quando rodamos campanhas de tráfego pago no Instagram e no Google.",
  "Usamos WhatsApp Business, Google Sheets e Google Calendar; o CRM ainda não foi definido, então pode sugerir o que integrar.",
  "O orçamento é de até R$ 500 por mês em ferramentas; a equipe tem 3 vendedores e 1 gestor comercial.",
  "O critério de qualificação é: orçamento disponível, urgência do projeto e se o nicho do cliente é serviços ou e-commerce.",
  "Quero que a IA responda em até 2 minutos, em português, com tom consultivo, e escale para humano quando o lead pedir.",
  "O agendamento deve cair no Google Calendar do closer com resumo do lead, telefone e a pontuação de qualificação.",
  "Não temos ninguém técnico no time; a manutenção precisa ser simples, de preferência ferramentas no-code ou low-code.",
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

test("Gênesis de ponta a ponta: login → ideia → perguntas → geração 8/8 → dados no central", async ({ page }) => {
  test.setTimeout(600_000);

  // ---- 1. Login (auth central + sessão própria) ----
  await login(page);

  // ---- 2. Wizard: ideia ----
  await page.goto("/genesis");
  const campoIdeia = page.getByPlaceholder(/Quero automatizar a qualificação de leads/);
  await expect(campoIdeia).toBeVisible({ timeout: 30_000 });
  await campoIdeia.fill(IDEIA);
  await page.getByRole("button", { name: /Analisar ideia/ }).click();

  // ---- 3. Perguntas (quantidade variável) até "Gerar agora" ----
  const campoResposta = page.getByPlaceholder("Sua resposta… (ou use o microfone)");
  const gerarAgora = page.getByRole("button", { name: /Gerar agora/ });
  for (let i = 0; i < 15; i++) {
    await expect(campoResposta.or(gerarAgora).first()).toBeVisible({ timeout: 180_000 });
    if (await gerarAgora.isVisible()) break;
    await campoResposta.fill(RESPOSTAS[i % RESPOSTAS.length]);
    await page.getByRole("button", { name: /Próxima|Revisar/ }).click();
  }
  await expect(gerarAgora).toBeVisible({ timeout: 30_000 });

  // ---- 4. Geração do esqueleto → redirect para a solução ----
  await gerarAgora.click();
  await page.waitForURL(/\/genesis\/solution\/\d+/, { timeout: 240_000 });
  const solutionId = Number(page.url().match(/solution\/(\d+)/)![1]);
  console.log(`[e2e] solução criada: id=${solutionId} (${page.url()})`);

  // ---- 5. Geração paralela das 8 etapas → contador 8/8 ----
  await expect(page.getByText("8/8", { exact: true })).toBeVisible({ timeout: 300_000 });
  await page.screenshot({ path: `test-results/genesis-solucao-${solutionId}.png`, fullPage: true });

  // ---- 6. Dados persistidos no Supabase central (schema educacional) ----
  const sql = postgres(educacionalUrl(), {
    connection: { search_path: "educacional" },
    ssl: "require",
    max: 1,
  });
  try {
    const solucoes = await sql`
      SELECT id, title, status, original_idea FROM builder_solutions WHERE id = ${solutionId}`;
    expect(solucoes).toHaveLength(1);
    expect(solucoes[0].original_idea).toContain("triagem de leads");
    console.log(`[e2e] builder_solutions: id=${solucoes[0].id} status=${solucoes[0].status} title=${solucoes[0].title}`);

    const etapas = await sql`
      SELECT step_key, status FROM builder_step_generations
      WHERE solution_id = ${solutionId} ORDER BY step_key`;
    const completas = etapas.filter((e) => e.status === "completed");
    console.log(`[e2e] builder_step_generations: ${completas.length}/${etapas.length} completed`);
    expect(completas).toHaveLength(8);
  } finally {
    await sql.end();
  }
});
