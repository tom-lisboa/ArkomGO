// e2e/ajuste-saldo-parcial.spec.ts — S30 (cast avulso pós-QA do dono).
// O ajuste do cenário 13: saldo INSUFICIENTE agora fala em custo × saldo
// ("Esta mentoria usa Xh e você tem Yh") — o "acabaram" ficou exclusivo do
// saldo ZERADO. A jornada mostra as duas mensagens, na sequência em que o
// dono esbarrou nelas no QA manual (2026-07-28).
//
// Elenco descartável (sufixo por gravação); limpeza fica por conta do
// operador após o upload do vídeo (mesmo fluxo da suíte v2).

import { expect, test, type Page } from "@playwright/test";
import { definirSenhaDoAluno } from "./helpers/arkom-session";

test.describe.configure({ mode: "serial" });
test.use({ launchOptions: { slowMo: 350 } });

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_SENHA = process.env.E2E_ADMIN_PASSWORD ?? "";
const SENHA_ALUNO = process.env.E2E_PASSWORD ?? "ArkomTeste2026!";
const SUF = process.env.E2E_SUF ?? Math.random().toString(36).slice(2, 7);
const ALUNO = { nome: "Aluno Ajuste QA", email: `ajuste.${SUF}@bilhon.ai` };
const PLANO = `Plano QA 3h ${SUF}`;

function respirar(page: Page, ms = 1600): Promise<void> {
  return page.waitForTimeout(ms);
}

async function loginNoFormulario(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await respirar(page, 1000);
  await page.getByRole("textbox", { name: "E-mail" }).fill(email);
  await page.getByRole("textbox", { name: "Senha" }).fill(senha);
  await respirar(page, 700);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(home|admin|settings)(\?|$)/);
  await respirar(page, 1600);
}

function contador(page: Page) {
  return page.getByTestId("credit-counter");
}

async function abrirEvento(page: Page, nome: RegExp): Promise<void> {
  await page.getByRole("button", { name: nome }).first().click();
  await expect(page.getByTestId("event-modal")).toBeVisible();
  await respirar(page, 1500);
}

async function fecharModal(page: Page): Promise<void> {
  await respirar(page, 800);
  await page.keyboard.press("Escape");
  await respirar(page, 600);
}

test("S30 · ajuste do QA: saldo parcial fala em custo × saldo — 'acabaram' só no zero", async ({ page }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_SENHA, "credenciais E2E de admin ausentes");

  // ── Admin monta o caso: plano de 3h no total + aluno já com ele ──────────
  await loginNoFormulario(page, ADMIN_EMAIL, ADMIN_SENHA);
  await page.goto("/admin/plans");
  await expect(page.getByRole("heading", { name: "Planos" })).toBeVisible();
  await respirar(page, 1500);
  await page.getByRole("button", { name: "Novo plano" }).click();
  await respirar(page, 1000);
  await page.getByRole("textbox", { name: "Nome *" }).fill(PLANO);
  await page.getByRole("spinbutton", { name: "Duração (meses)" }).fill("12");
  await page.getByRole("spinbutton", { name: "Horas de mentoria" }).fill("3");
  await page.getByLabel("Cota vale").selectOption({ value: "total" });
  await page.getByLabel("Status").selectOption({ label: "Publicado" });
  await respirar(page, 1500);
  await page.getByRole("button", { name: "Criar plano" }).click();
  await expect(page.getByText("3h no total").first()).toBeVisible();
  await respirar(page, 2200);

  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Membros" })).toBeVisible();
  await respirar(page, 1500);
  await page.getByRole("button", { name: "Novo usuário" }).click();
  await page.getByRole("textbox", { name: "Nome completo" }).fill(ALUNO.nome);
  await page.getByRole("textbox", { name: "E-mail" }).fill(ALUNO.email);
  await page.locator("#al-plano").selectOption({ label: PLANO });
  await respirar(page, 1500);
  await page.getByRole("button", { name: "Criar usuário" }).click();
  await expect(page.getByText(ALUNO.email).first()).toBeVisible({ timeout: 30_000 });
  await respirar(page, 2200);
  await definirSenhaDoAluno(ALUNO.email, SENHA_ALUNO); // setup fora de vídeo

  // ── Aluno entra com 3h/3h ────────────────────────────────────────────────
  await page.goto("/login");
  await loginNoFormulario(page, ALUNO.email, SENHA_ALUNO);
  await page.goto("/mentorships");
  await expect(page.getByRole("heading", { name: "Mentorias", exact: true })).toBeVisible();
  await expect(contador(page)).toContainText("3h/3h");
  await respirar(page, 2200);

  // Gasta 2h numa mentoria de verdade → fica com 1h
  await abrirEvento(page, /29 JUL Mentoria/);
  await page.getByTestId("confirm-presence").click();
  await respirar(page, 1500);
  await fecharModal(page);
  await expect(contador(page)).toContainText("1h/3h");
  await respirar(page, 2000);

  // ── O AJUSTE: 2h de custo com 1h de saldo ────────────────────────────────
  // Antes: toast dizia "Suas horas acabaram" com 1h visível no contador
  // (contradição apontada pelo dono). Agora: custo × saldo, na mesma língua
  // do aviso vermelho do modal.
  await abrirEvento(page, /30 JUL Mentoria/);
  await expect(
    page.getByText("Você não tem horas suficientes para confirmar esta mentoria."),
  ).toBeVisible();
  await respirar(page, 2200);
  await page.getByTestId("confirm-presence").click();
  await expect(
    page.getByText(/Esta mentoria usa 2h e você tem 1h de saldo/).first(),
  ).toBeVisible();
  await respirar(page, 3500); // as duas mensagens juntas na tela, sem contradição
  await fecharModal(page);
  await expect(contador(page)).toContainText("1h/3h"); // nada foi debitado
  await respirar(page, 1800);

  // A última 1h cabe na mentoria de 1h → contador ZERA
  await abrirEvento(page, /28 JUL Mentoria/);
  await page.getByTestId("confirm-presence").click();
  await respirar(page, 1500);
  await fecharModal(page);
  await expect(contador(page)).toContainText("0h/3h");
  await respirar(page, 2000);

  // ── Zerado de verdade: aí sim "acabaram" ─────────────────────────────────
  await abrirEvento(page, /30 JUL Mentoria/);
  await page.getByTestId("confirm-presence").click();
  await expect(page.getByText(/horas de mentoria acabaram/).first()).toBeVisible();
  await respirar(page, 3500);
  await fecharModal(page);
});
