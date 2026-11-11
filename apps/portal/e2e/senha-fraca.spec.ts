// e2e/senha-fraca.spec.ts — prova do report do dono (ClickUp 86ajraqhj):
// na troca obrigatória do primeiro acesso dava para "definir" uma senha
// apertando a barra de espaço 6 vezes. A única validação era `length < 6`, e
// seis espaços têm comprimento 6 — o Auth central gravava uma senha
// praticamente vazia. Desde este spec a regra é uma só
// (src/lib/password-policy.ts) e o corte é no SERVIDOR: o vídeo burla o HTML
// de propósito para mostrar que não adianta.
//
// Jornada: admin cria o aluno demo (senha temporária na tela) → aluno entra e
// cai na troca obrigatória → 6 espaços barrados (mesmo sem o HTML) → curta e
// só-letras barradas → a senha temporária AINDA vale (nada foi gravado) →
// senha forte passa e abre a home → a mesma barreira no /cadastro → limpeza.

import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import { PERFIS, educacionalUrl, loginAs } from "./helpers/arkom-session";

test.describe.configure({ mode: "serial" });

// E2E_CADENCIA=1 ⇒ take de VÍDEO (prova pra humano assistir): slowMo, campos
// digitados e pausas nos momentos-prova. Sem a env, regressão rápida — mesmas
// asserções nos dois modos.
const CADENCIA = process.env.E2E_CADENCIA === "1";
test.use({ launchOptions: { slowMo: CADENCIA ? 220 : 0 } });

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const SUF = process.env.E2E_SUF ?? Math.random().toString(36).slice(2, 7);

const ALUNO = { nome: "Aluno Senha Fraca E2E", email: `senha.fraca.${SUF}@bilhon.ai` };
const SEIS_ESPACOS = "      "; // o gesto exato do report
const CURTA = "1234567"; // 7 caracteres, sem letra
const SO_LETRAS = "senhasenha"; // 10 caracteres, sem número
// Descartável de propósito: a conta demo nasce e morre dentro deste spec, e a
// senha aparece na câmera — nada de reaproveitar a credencial real do E2E.
const SENHA_FORTE = "SenhaDemo2026";

let senhaTemporaria = "";

/** Pausa de leitura — só no take de vídeo. */
async function pausa(page: Page, ms = 2000): Promise<void> {
  if (CADENCIA) await page.waitForTimeout(ms);
}

async function digitar(page: Page, campo: Locator, texto: string): Promise<void> {
  if (CADENCIA) await campo.pressSequentially(texto, { delay: 60 });
  else await campo.fill(texto);
}

/** Estado da conta no banco: `must_change_password` só zera quando a troca
 *  REALMENTE aconteceu. É a testemunha de que nada foi gravado. */
async function primeiroAcessoPendente(email: string): Promise<boolean> {
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    const [row] = await sql<{ must_change_password: number }[]>`
      SELECT must_change_password FROM educacional.profiles
       WHERE lower(email) = lower(${email}) AND status <> 'deleted' LIMIT 1
    `;
    if (!row) throw new Error(`perfil ausente para ${email}`);
    return Number(row.must_change_password) === 1;
  } finally {
    await sql.end();
  }
}

/** Tira o freio do navegador (minLength/required) do formulário que contém o
 *  campo — é o "forçar por fora" do roteiro: o HTML deixa de barrar e sobra só
 *  o servidor. */
async function burlarOHtml(page: Page, campo: string): Promise<void> {
  await page.evaluate((nome) => {
    const input = document.querySelector<HTMLInputElement>(`input[name="${nome}"]`);
    const form = input?.form;
    if (!form) return;
    form.setAttribute("novalidate", "");
    form.querySelectorAll("input").forEach((i) => {
      i.removeAttribute("minlength");
      i.removeAttribute("required");
    });
  }, campo);
}

/** Só no vídeo: revela o conteúdo dos campos de senha para o espectador VER
 *  que a "senha" de seis espaços é uma senha em branco. */
async function revelarSenhas(page: Page): Promise<void> {
  if (!CADENCIA) return;
  await page.evaluate(() => {
    document
      .querySelectorAll<HTMLInputElement>('input[type="password"]')
      .forEach((i) => i.setAttribute("type", "text"));
  });
}

/** Devolve os campos ao modo senha (depois de `revelarSenhas`). */
async function mascararSenhas(page: Page): Promise<void> {
  await page.evaluate(() => {
    document
      .querySelectorAll<HTMLInputElement>('input[name$="password"]')
      .forEach((i) => i.setAttribute("type", "password"));
  });
}

/** Preenche a troca obrigatória e salva. */
async function tentarTrocarSenha(page: Page, nova: string): Promise<void> {
  await page.locator('input[name="current_password"]').fill(senhaTemporaria);
  const novaSenha = page.locator('input[name="new_password"]');
  const confirmacao = page.locator('input[name="confirm_password"]');
  await novaSenha.fill("");
  await confirmacao.fill("");
  await digitar(page, novaSenha, nova);
  await digitar(page, confirmacao, nova);
  await pausa(page, 1200);
  await page.getByRole("button", { name: /Salvar|Definir|Atualizar|Trocar/ }).first().click();
}

async function loginNoFormulario(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await pausa(page, 1200);
  await digitar(page, page.getByRole("textbox", { name: "E-mail" }), email);
  await page.getByRole("textbox", { name: "Senha" }).fill(senha);
  await pausa(page, 800);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test.setTimeout(420_000);

test("senha só de espaços é recusada nas telas que definem senha (ClickUp 86ajraqhj)", async ({
  context,
  page,
}) => {
  // ── Palco · admin cria o aluno demo e copia a senha temporária ────────────
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Membros" })).toBeVisible();
  await pausa(page, 1500);
  await page.getByRole("button", { name: "Novo usuário" }).click();
  await digitar(page, page.getByRole("textbox", { name: "Nome completo" }), ALUNO.nome);
  await digitar(page, page.getByRole("textbox", { name: "E-mail" }), ALUNO.email);
  await pausa(page, 700);
  await page.getByRole("button", { name: "Criar usuário" }).click();
  await expect(page.getByTestId("senha-temporaria")).toBeVisible({ timeout: 30_000 });
  senhaTemporaria = ((await page.getByTestId("senha-temporaria").textContent()) ?? "").trim();
  expect(senhaTemporaria.length).toBeGreaterThan(8);
  await pausa(page, 2200);
  await page.getByRole("button", { name: "Concluir" }).click();

  // ── O aluno entra com a temporária e cai na troca obrigatória ─────────────
  await context.clearCookies();
  await loginNoFormulario(page, ALUNO.email, senhaTemporaria);
  await page.waitForURL(/\/settings/);
  await expect(page.getByText("Primeiro acesso")).toBeVisible();
  await pausa(page, 2600);
  // A tela agora DIZ a regra que o servidor cobra — mesma frase, mesma fonte.
  await expect(page.getByText(/Mínimo de 8 caracteres/)).toBeVisible();
  await pausa(page, 2800);

  // ── Cena 1 · O GESTO DO REPORT: seis toques na barra de espaço ────────────
  await tentarTrocarSenha(page, SEIS_ESPACOS);
  await revelarSenhas(page); // no vídeo: os campos parecem VAZIOS — e são
  await pausa(page, 3200);
  // O navegador já barra pelo minLength — mas ninguém se defende com HTML.
  await expect(page).toHaveURL(/\/settings/);

  // ── Cena 2 · forçando por fora: HTML sem freio, o servidor recusa ─────────
  await burlarOHtml(page, "new_password");
  await pausa(page, 1800);
  await tentarTrocarSenha(page, SEIS_ESPACOS);
  await expect(page.getByText(/só espaços/i)).toBeVisible();
  await revelarSenhas(page);
  await pausa(page, 5000); // momento-prova central: o corte é do servidor

  // ── Cena 3 · curta demais (7 caracteres) — mesma recusa, outro motivo ─────
  await burlarOHtml(page, "new_password");
  await pausa(page, 1500);
  await tentarTrocarSenha(page, CURTA);
  await expect(page.getByText(/pelo menos 8 caracteres/i)).toBeVisible();
  await pausa(page, 4000);

  // ── Cena 4 · só letras — a força mínima que a task pediu ──────────────────
  await burlarOHtml(page, "new_password");
  await pausa(page, 1500);
  await tentarTrocarSenha(page, SO_LETRAS);
  await expect(page.getByText(/misturar letras e números/i)).toBeVisible();
  await pausa(page, 4000);

  // ── Cena 5 · nada foi gravado: primeiro acesso segue pendente e a senha
  //    temporária AINDA entra (se alguma tentativa tivesse passado, não
  //    entraria mais). ─────────────────────────────────────────────────────
  expect(await primeiroAcessoPendente(ALUNO.email)).toBe(true);
  await context.clearCookies();
  await loginNoFormulario(page, ALUNO.email, senhaTemporaria);
  await page.waitForURL(/\/settings/);
  await expect(page.getByText("Primeiro acesso")).toBeVisible();
  await pausa(page, 4000); // a temporária ainda abre: nenhuma tentativa gravou

  // ── Cena 6 · o caminho certo funciona ─────────────────────────────────────
  await mascararSenhas(page);
  await tentarTrocarSenha(page, SENHA_FORTE);
  await page.waitForURL(/\/(home|admin)(\?|$)/, { timeout: 45_000 });
  await pausa(page, 3000);
  expect(await primeiroAcessoPendente(ALUNO.email)).toBe(false);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/home/);
  await pausa(page, 3000);

  // ── Cena 7 · a segunda porta: cadastro por convite cobra a mesma regra ────
  await context.clearCookies();
  await page.goto("/cadastro");
  await pausa(page, 1500);
  await digitar(page, page.getByRole("textbox", { name: "Nome completo" }), ALUNO.nome);
  await digitar(page, page.getByRole("textbox", { name: "E-mail" }), `novo.${ALUNO.email}`);
  await page.locator('input[name="password"]').fill(SEIS_ESPACOS);
  await page.locator('input[name="invite_code"]').fill(`CONVITE${SUF.toUpperCase()}`);
  await page.locator('input[name="accept_terms"]').check();
  await page.locator('input[name="accept_privacy"]').check();
  await burlarOHtml(page, "password");
  await pausa(page, 2000);
  await page.getByRole("button", { name: /Criar minha conta/ }).click();
  await expect(page.getByText(/só espaços/i)).toBeVisible();
  await pausa(page, 4000); // mesma barreira, mesma regra, outro formulário

  // ── Limpeza na câmera: o aluno demo sai da base ───────────────────────────
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/students");
  await page.locator("tr", { hasText: ALUNO.email }).locator('button[title="Excluir"]').click();
  await pausa(page, 1200);
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText(ALUNO.email)).toHaveCount(0);
  await pausa(page, 1600);
});
