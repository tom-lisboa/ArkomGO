// e2e/republicacao-recontabiliza.spec.ts — prova do furo achado pelo dono
// (QA manual, 2026-07-28): cancelar pelo Arkom estornava mas mantinha as
// confirmações; republicar ressuscitava assento SEM LASTRO. A regra nova:
// republicar recontabiliza — quem tem saldo é RECOBRADO, quem não tem perde a
// confirmação. Dois alunos provam as duas ramificações no mesmo evento.
// (Prova de regressão, sem cadência de vídeo — o cast humano é outro arquivo.)

import { expect, test, type Page } from "@playwright/test";
import { PERFIS, definirSenhaDoAluno, loginAs } from "./helpers/arkom-session";

test.describe.configure({ mode: "serial" });

// E2E_CADENCIA=1 ⇒ take de VÍDEO (prova pra humano assistir): slowMo, login
// digitado e pausas nos momentos-prova. Sem a env, roda como prova de
// regressão rápida — mesmas asserções nos dois modos.
const CADENCIA = process.env.E2E_CADENCIA === "1";
test.use({ launchOptions: { slowMo: CADENCIA ? 220 : 0 } });

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const SENHA = process.env.E2E_PASSWORD ?? "ArkomTeste2026!";
const SUF = process.env.E2E_SUF ?? Math.random().toString(36).slice(2, 7);

const FURADOR = { nome: "Aluno Furador E2E", email: `republ.a.${SUF}@bilhon.ai` };
const RECOBRADO = { nome: "Aluno Recobrado E2E", email: `republ.b.${SUF}@bilhon.ai` };
const PLANO_2H = `Plano Republ 2h ${SUF}`;
const PLANO_4H = `Plano Republ 4h ${SUF}`;
const EVENTO_X = `Republicacao X E2E ${SUF}`;
const EVENTO_Y = `Republicacao Y E2E ${SUF}`;

function diaFuturo(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Pausa de leitura — só no take de vídeo. */
async function pausa(page: Page, ms = 2000): Promise<void> {
  if (CADENCIA) await page.waitForTimeout(ms);
}

async function loginNoFormulario(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  if (CADENCIA) {
    await page.getByRole("textbox", { name: "E-mail" }).pressSequentially(email, { delay: 45 });
    await page.getByRole("textbox", { name: "Senha" }).pressSequentially(senha, { delay: 45 });
  } else {
    await page.getByRole("textbox", { name: "E-mail" }).fill(email);
    await page.getByRole("textbox", { name: "Senha" }).fill(senha);
  }
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(home|admin|settings)(\?|$)/);
  await pausa(page, 1400);
}

function contador(page: Page) {
  return page.getByTestId("credit-counter");
}

async function confirmarEvento(page: Page, titulo: string): Promise<void> {
  await page.goto("/mentorships");
  await pausa(page, 1600);
  await page.getByRole("button", { name: new RegExp(titulo) }).first().click();
  await expect(page.getByTestId("event-modal")).toBeVisible();
  await pausa(page, 1600);
  await page.getByTestId("confirm-presence").click();
  await expect(page.getByTestId("confirm-presence")).toContainText("Presença confirmada");
  await pausa(page, 1800);
  await page.keyboard.press("Escape");
}

async function criarPlano(page: Page, nome: string, horas: string): Promise<void> {
  await page.goto("/admin/plans");
  await page.getByRole("button", { name: "Novo plano" }).click();
  await page.getByRole("textbox", { name: "Nome *" }).fill(nome);
  await page.getByRole("spinbutton", { name: "Duração (meses)" }).fill("12");
  await page.getByRole("spinbutton", { name: "Horas de mentoria" }).fill(horas);
  await page.getByLabel("Cota vale").selectOption({ value: "total" });
  await page.getByLabel("Status").selectOption({ label: "Publicado" });
  await page.getByRole("button", { name: "Criar plano" }).click();
  await expect(page.getByText(nome).first()).toBeVisible();
}

async function criarAluno(
  page: Page,
  aluno: { nome: string; email: string },
  plano: string,
): Promise<void> {
  await page.goto("/admin/students");
  await page.getByRole("button", { name: "Novo usuário" }).click();
  await page.getByRole("textbox", { name: "Nome completo" }).fill(aluno.nome);
  await page.getByRole("textbox", { name: "E-mail" }).fill(aluno.email);
  await page.locator("#al-plano").selectOption({ label: plano });
  await page.getByRole("button", { name: "Criar usuário" }).click();
  await expect(page.getByText(aluno.email).first()).toBeVisible({ timeout: 30_000 });
  await definirSenhaDoAluno(aluno.email, SENHA);
}

async function criarEvento(page: Page, titulo: string, dias: number): Promise<void> {
  await page.goto("/admin/mentorships");
  await page.getByRole("button", { name: /Nova mentoria|Novo evento|Criar/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("textbox", { name: /Título|Nome/ }).first().fill(titulo);
  await page.locator('input[type="date"]').first().fill(diaFuturo(dias));
  await page.locator('input[type="time"]').first().fill("14:00");
  await page.locator('input[type="time"]').nth(1).fill("16:00");
  await page.locator("#mentoria-kind").selectOption({ value: "mentoria_arkom" });
  await page.locator("#mentoria-credit-cost").fill("2");
  const status = page.locator('select[name="status"]').last();
  if (await status.isVisible().catch(() => false)) {
    await status.selectOption({ value: "published" }).catch(() => {});
  }
  await page.getByRole("button", { name: /Criar mentoria|Salvar/ }).click();
  await expect(page.getByText(titulo).first()).toBeVisible();
}

test("republicar recontabiliza: com saldo RECOBRA, sem saldo REMOVE a confirmação", async ({
  context,
  page,
}) => {
  // ── Admin monta o palco: 2 planos, 2 alunos, 2 eventos de 2h ─────────────
  await loginAs(context, BASE, PERFIS.admin);
  await criarPlano(page, PLANO_2H, "2");
  await criarPlano(page, PLANO_4H, "4");
  await criarAluno(page, FURADOR, PLANO_2H);
  await criarAluno(page, RECOBRADO, PLANO_4H);
  await criarEvento(page, EVENTO_X, 3);
  await criarEvento(page, EVENTO_Y, 4);
  await context.clearCookies();

  // ── Os dois confirmam X (débito de 2h em cada) ───────────────────────────
  await loginNoFormulario(page, FURADOR.email, SENHA);
  await confirmarEvento(page, EVENTO_X);
  await expect(contador(page)).toContainText("0h/2h");
  await loginNoFormulario(page, RECOBRADO.email, SENHA);
  await confirmarEvento(page, EVENTO_X);
  await expect(contador(page)).toContainText("2h/4h");
  await context.clearCookies();

  // ── Admin cancela X pelo Arkom: estorno automático dos dois ──────────────
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/mentorships");
  await pausa(page, 1600);
  const linhaX = page.locator("tr", { hasText: EVENTO_X }).first();
  await linhaX.locator('button[title*="Cancelar"]').click();
  await pausa(page, 1400);
  await page.getByRole("button", { name: "Cancelar e estornar" }).click();
  await expect(page.getByText(/2 estorno\(s\)/).first()).toBeVisible();
  await pausa(page, 2600); // toast do estorno em massa na tela
  await context.clearCookies();

  // ── Com a X fora do ar, os dois gastam o estorno na Y ────────────────────
  await loginNoFormulario(page, FURADOR.email, SENHA);
  await confirmarEvento(page, EVENTO_Y);
  await expect(contador(page)).toContainText("0h/2h"); // zerou de novo
  await loginNoFormulario(page, RECOBRADO.email, SENHA);
  await confirmarEvento(page, EVENTO_Y);
  await expect(contador(page)).toContainText("2h/4h"); // ainda sobra 2h
  await context.clearCookies();

  // ── Admin REPUBLICA X: a recontabilização decide aluno a aluno ───────────
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/mentorships");
  await pausa(page, 1600);
  await page.getByRole("button", { name: `Publicar ${EVENTO_X}`, exact: true }).click();
  await expect(page.getByText(/1 recobrança\(s\) lançada\(s\)/).first()).toBeVisible();
  await expect(
    page.getByText(/1 confirmação\(ões\) removida\(s\) por falta de saldo/).first(),
  ).toBeVisible();
  await pausa(page, 3200); // o momento-prova central: o toast resume a decisão

  // A recobrança está no EXTRATO do recobrado, com o admin como autor.
  await page.goto("/admin/students");
  await page
    .locator("tr", { hasText: RECOBRADO.email })
    .getByRole("link", { name: "Ver detalhe" })
    .click();
  await expect(page.getByText("Saldo de horas")).toBeVisible();
  await expect(page.getByText(/Recobrança na republicação/).first()).toBeVisible();
  await pausa(page, 3000); // a linha nova no extrato fecha a prova contábil
  await context.clearCookies();

  // ── Furador: perdeu o assento na X, saldo intacto (nunca negativo) ───────
  await loginNoFormulario(page, FURADOR.email, SENHA);
  await page.goto("/mentorships");
  await expect(contador(page)).toContainText("0h/2h");
  await pausa(page, 1800);
  await page.getByRole("button", { name: new RegExp(EVENTO_X) }).first().click();
  await expect(page.getByTestId("event-modal")).toBeVisible();
  await expect(page.getByTestId("confirm-presence")).toContainText("Confirmar presença");
  await pausa(page, 2800); // o assento sem lastro NÃO sobreviveu à republicação
  await page.keyboard.press("Escape");

  // ── Recobrado: assento mantido e as 2h recobradas no extrato ─────────────
  await loginNoFormulario(page, RECOBRADO.email, SENHA);
  await page.goto("/mentorships");
  await expect(contador(page)).toContainText("0h/4h");
  await pausa(page, 1800);
  await page.getByRole("button", { name: new RegExp(EVENTO_X) }).first().click();
  await expect(page.getByTestId("event-modal")).toBeVisible();
  await expect(page.getByTestId("confirm-presence")).toContainText("Presença confirmada");
  await pausa(page, 2800); // quem tinha saldo segue confirmado — e pagou
  await page.keyboard.press("Escape");
  await context.clearCookies();

  // ── Idempotência: despublicar e republicar de novo não cobra duas vezes ──
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/mentorships");
  await page.getByRole("button", { name: `Despublicar ${EVENTO_X}`, exact: true }).click();
  await expect(page.getByText("Mentoria despublicada.").first()).toBeVisible();
  await page.getByRole("button", { name: `Publicar ${EVENTO_X}`, exact: true }).click();
  await expect(page.getByText("Mentoria publicada!").first()).toBeVisible();
  await context.clearCookies();

  await loginNoFormulario(page, RECOBRADO.email, SENHA);
  await page.goto("/mentorships");
  await expect(contador(page)).toContainText("0h/4h"); // nada mudou
  await pausa(page, 2400); // idempotente: nenhuma cobrança dupla
});
