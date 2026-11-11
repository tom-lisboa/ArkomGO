// e2e/recadastro-plano.spec.ts — prova da regressão do QA (ClickUp 86ajrcd65):
// recadastrar um e-mail de conta excluída com plano no formulário devolvia
// "Conta salva, mas o plano não foi atribuído — já está no plano X". A vida
// financeira da conta anterior (entitlement ativo) sobrevivia à exclusão e o
// guard anti-duplicata barrava a conta restaurada. Desde dd9af6b, excluir E
// recadastrar encerram a vida anterior (revoga entitlements, compensa saldo);
// este spec cobre a jornada exata: criar com plano → excluir → recadastrar o
// MESMO e-mail com o MESMO plano → plano atribuído sem erro e sem saldo em
// dobro — e o guard continua barrando duplicata REAL (conta ativa).

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { PERFIS, educacionalUrl, loginAs } from "./helpers/arkom-session";

test.describe.configure({ mode: "serial" });

// E2E_CADENCIA=1 ⇒ take de VÍDEO (prova pra humano assistir): slowMo, campos
// digitados e pausas nos momentos-prova. Sem a env, prova de regressão rápida
// — mesmas asserções nos dois modos.
const CADENCIA = process.env.E2E_CADENCIA === "1";
test.use({ launchOptions: { slowMo: CADENCIA ? 220 : 0 } });

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const SUF = process.env.E2E_SUF ?? Math.random().toString(36).slice(2, 7);

const PLANO = `Plano Recadastro 2h ${SUF}`;
const ALUNO = { nome: "Aluno Recadastro E2E", email: `recad.${SUF}@bilhon.ai` };

/** Pausa de leitura — só no take de vídeo. */
async function pausa(page: Page, ms = 2000): Promise<void> {
  if (CADENCIA) await page.waitForTimeout(ms);
}

async function digitar(page: Page, campo: ReturnType<Page["getByRole"]>, texto: string): Promise<void> {
  if (CADENCIA) await campo.pressSequentially(texto, { delay: 45 });
  else await campo.fill(texto);
}

/** Fotografia financeira do perfil no banco: saldo do ledger e entitlements
 *  ativos. É o que o guard "já está no plano" enxerga. */
async function estadoFinanceiro(email: string): Promise<{ saldo: number; ativos: number }> {
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    const [row] = await sql<{ saldo: number; ativos: number }[]>`
      SELECT COALESCE((SELECT SUM(l.delta) FROM educacional.credit_ledger l
                        WHERE l.profile_id = p.id), 0)::int AS saldo,
             (SELECT COUNT(*) FROM educacional.profile_entitlements e
               WHERE e.profile_id = p.id AND e.status = 'active')::int AS ativos
        FROM educacional.profiles p
       WHERE lower(p.email) = lower(${email})
    `;
    if (!row) throw new Error(`perfil ausente para ${email}`);
    return row;
  } finally {
    await sql.end();
  }
}

async function criarPlanoDemo(page: Page): Promise<void> {
  await page.goto("/admin/plans");
  await pausa(page, 1500);
  await page.getByRole("button", { name: "Novo plano" }).click();
  await digitar(page, page.getByRole("textbox", { name: "Nome *" }), PLANO);
  await page.getByRole("spinbutton", { name: "Duração (meses)" }).fill("12");
  await digitar(page, page.getByRole("spinbutton", { name: "Horas de mentoria" }), "2");
  await page.getByLabel("Cota vale").selectOption({ value: "total" });
  await page.getByLabel("Status").selectOption({ label: "Publicado" });
  await pausa(page, 700);
  await page.getByRole("button", { name: "Criar plano" }).click();
  await expect(page.getByText(PLANO).first()).toBeVisible();
  await pausa(page, 1800);
}

/** Cria (ou recadastra) o aluno demo JÁ com o plano no formulário e confere o
 *  modal de credenciais — o palco exato do report do QA. */
async function criarAlunoComPlano(page: Page): Promise<void> {
  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Membros" })).toBeVisible();
  await pausa(page, 1500);
  await page.getByRole("button", { name: "Novo usuário" }).click();
  await digitar(page, page.getByRole("textbox", { name: "Nome completo" }), ALUNO.nome);
  await digitar(page, page.getByRole("textbox", { name: "E-mail" }), ALUNO.email);
  await page.locator("#al-plano").selectOption({ label: PLANO });
  await pausa(page, 700);
  await page.getByRole("button", { name: "Criar usuário" }).click();
  // Modal persistente de credenciais: a conta nasceu com senha temporária…
  await expect(page.getByTestId("senha-temporaria")).toBeVisible({ timeout: 30_000 });
}

test.setTimeout(420_000);

test("recadastro de conta excluída volta a atribuir o plano (QA 86ajrcd65)", async ({
  context,
  page,
}) => {
  await loginAs(context, BASE, PERFIS.admin);

  // ── Palco: plano demo publicado de 2h ────────────────────────────────────
  await criarPlanoDemo(page);

  // ── Cena 1 · criação com plano no formulário funciona ────────────────────
  await criarAlunoComPlano(page);
  // …e SEM o erro do report: o plano entrou junto com a conta.
  await expect(page.getByText(/Plano não atribuído/)).toHaveCount(0);
  await pausa(page, 2200);
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByText(ALUNO.email).first()).toBeVisible();
  const base = await estadoFinanceiro(ALUNO.email);
  expect(base.saldo).toBe(2);
  expect(base.ativos).toBeGreaterThan(0);
  await pausa(page, 1500);

  // ── Cena 2 · excluir encerra a vida financeira (não deixa direito órfão) ─
  await page
    .locator("tr", { hasText: ALUNO.email })
    .locator('button[title="Excluir"]')
    .click();
  await pausa(page, 1500);
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText(ALUNO.email)).toHaveCount(0);
  await pausa(page, 2000);
  const aposExclusao = await estadoFinanceiro(ALUNO.email);
  expect(aposExclusao.saldo).toBe(0); // saldo compensado no ledger (append-only)
  expect(aposExclusao.ativos).toBe(0); // nenhum entitlement ativo sobrevive

  // ── Cena 3 · O GESTO DO REPORT: recadastrar o MESMO e-mail JÁ com o MESMO
  //    plano. Antes: "já está no plano". Agora: conta restaurada limpa. ─────
  await criarAlunoComPlano(page);
  await expect(page.getByText(/Plano não atribuído/)).toHaveCount(0);
  await expect(page.getByText(/já está no plano/)).toHaveCount(0);
  await pausa(page, 3200); // momento-prova central: credenciais SEM erro de plano
  await page.getByRole("button", { name: "Concluir" }).click();
  const recadastrado = await estadoFinanceiro(ALUNO.email);
  expect(recadastrado.saldo).toBe(2); // 2h novas — nada somou em dobro
  expect(recadastrado.ativos).toBe(base.ativos); // mesmos direitos da 1ª vida

  // ── Cena 4 · a ficha conta a história inteira ────────────────────────────
  await page
    .locator("tr", { hasText: ALUNO.email })
    .getByRole("link", { name: "Ver detalhe" })
    .click();
  await expect(page.getByText("Saldo de horas")).toBeVisible();
  await expect(page.getByText(PLANO).first()).toBeVisible();
  await expect(
    page.getByText(/Conta excluída — créditos remanescentes revogados/).first(),
  ).toBeVisible();
  await pausa(page, 3000); // extrato: vida antiga encerrada + 2h da vida nova

  // ── Cena 5 · o guard continua de pé para duplicata REAL (conta ativa) ────
  await page.getByRole("button", { name: "Trocar plano" }).click();
  await pausa(page, 1500);
  await page
    .getByLabel("Plano *")
    .selectOption({ label: `${PLANO} (plano atual)` });
  await pausa(page, 700);
  await page.getByRole("button", { name: "Atribuir plano" }).click();
  await expect(page.getByText(/já está no plano/).first()).toBeVisible();
  await pausa(page, 2600); // a proteção anti-duplicata segue valendo
  await page.keyboard.press("Escape");

  // ── Limpeza na câmera: aluno excluído, plano demo vira rascunho ──────────
  await page.goto("/admin/students");
  await page
    .locator("tr", { hasText: ALUNO.email })
    .locator('button[title="Excluir"]')
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText(ALUNO.email)).toHaveCount(0);
  await page.goto("/admin/plans");
  await page.getByRole("button", { name: `Editar ${PLANO}`, exact: true }).click();
  await page.getByLabel("Status").selectOption({ value: "draft" });
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await pausa(page, 1600);
});
