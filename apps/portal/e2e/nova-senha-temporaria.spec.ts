// e2e/nova-senha-temporaria.spec.ts — prova da melhoria pedida pelo dono
// (ClickUp 86ajradyp): a senha temporária só aparecia UMA vez, no modal da
// criação. Depois disso, sem a caixa de e-mail do aluno, a única saída era
// excluir e recriar a conta — perdendo plano e extrato. Agora existe "Gerar
// nova senha temporária" na lista e na ficha: senha nova na tela, a antiga
// morre na hora, a sessão aberta cai e o próximo acesso cobra a troca.
//
// Jornada: admin cria o aluno (senha #1) → aluno entra, troca por uma senha
// própria e navega → admin gera nova temporária na FICHA (senha #2) → a senha
// do aluno não entra mais → a sessão que ele tinha aberta caiu → a senha #2
// entra e cai na troca obrigatória → com a conta bloqueada o botão trava e a
// ficha diz o motivo → e com a tela do admin JÁ ABERTA (botão liberado) a
// conta cai por fora: quem recusa é o SERVIDOR → limpeza.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const ALUNO = { nome: "Aluno Nova Senha E2E", email: `nova.senha.${SUF}@bilhon.ai` };
// Descartável de propósito: a conta demo nasce e morre dentro deste spec, e as
// senhas aparecem na câmera — nada de reaproveitar credencial real.
const SENHA_DO_ALUNO = "SenhaDoAluno2026";

let senhaCriacao = "";
let senhaRegerada = "";

async function pausa(page: Page, ms = 2000): Promise<void> {
  if (CADENCIA) await page.waitForTimeout(ms);
}

async function digitar(page: Page, campo: Locator, texto: string): Promise<void> {
  if (CADENCIA) await campo.pressSequentially(texto, { delay: 55 });
  else await campo.fill(texto);
}

/** Fotografia do perfil no banco: a marcação de troca obrigatória e a versão
 *  de sessão (que é o que derruba as sessões abertas). */
async function estadoDaConta(
  email: string,
): Promise<{ id: number; trocaObrigatoria: boolean; sessionVersion: number }> {
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    const [row] = await sql<
      { id: number; must_change_password: number; session_version: number }[]
    >`
      SELECT id, must_change_password, session_version
        FROM educacional.profiles
       WHERE lower(email) = lower(${email}) AND status <> 'deleted'
       LIMIT 1
    `;
    if (!row) throw new Error(`perfil ausente para ${email}`);
    return {
      id: Number(row.id),
      trocaObrigatoria: Number(row.must_change_password) === 1,
      sessionVersion: Number(row.session_version),
    };
  } finally {
    await sql.end();
  }
}

/** Bloqueia a conta direto no banco — com a tela do admin já aberta. É o
 *  "forçar por fora" desta jornada: o botão continua lá porque a página é
 *  anterior ao bloqueio, e quem tem que recusar é o servidor. */
async function bloquearPorFora(profileId: number): Promise<void> {
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    await sql`UPDATE educacional.profiles SET status = 'blocked' WHERE id = ${profileId}`;
  } finally {
    await sql.end();
  }
}

async function loginNoFormulario(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await pausa(page, 1200);
  await digitar(page, page.getByRole("textbox", { name: "E-mail" }), email);
  await page.getByRole("textbox", { name: "Senha" }).fill(senha);
  await pausa(page, 900);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Lê a senha do modal persistente e fecha — o mesmo gesto do admin real. */
async function capturarSenhaDoModal(page: Page): Promise<string> {
  const campo = page.getByTestId("senha-temporaria");
  await expect(campo).toBeVisible({ timeout: 30_000 });
  const senha = ((await campo.textContent()) ?? "").trim();
  expect(senha.length).toBeGreaterThan(8);
  return senha;
}

function envLocal(chave: string): string | null {
  if (process.env[chave]) return process.env[chave]!;
  const arquivo = resolve(process.cwd(), ".env.local");
  if (!existsSync(arquivo)) return null;
  const m = readFileSync(arquivo, "utf-8").match(new RegExp(`^${chave}=(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

/** Apaga a identidade central do aluno demo (o GoTrue não some com a exclusão
 *  lógica do perfil — e a conta demo não pode sobrar no login das soluções). */
async function removerLoginCentral(authUserId: string | null): Promise<void> {
  if (!authUserId) return;
  const central = envLocal("CENTRAL_SUPABASE_URL");
  const serviceKey = envLocal("CENTRAL_SUPABASE_SERVICE_ROLE_KEY");
  if (!central || !serviceKey) {
    throw new Error(
      `CENTRAL_SUPABASE_URL/SERVICE_ROLE_KEY ausentes — apague o login ${authUserId} à mão.`,
    );
  }
  const resp = await fetch(`${central}/auth/v1/admin/users/${authUserId}`, {
    method: "DELETE",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`GoTrue ${resp.status} ao apagar o login demo ${authUserId}`);
  }
}

/** Expurgo do perfil demo pela Management API (roda como DONO do banco), para
 *  o caso de a role do app não dar conta do DELETE físico. */
async function purgarPerfilComoDono(profileId: number): Promise<void> {
  const token = envLocal("SUPABASE_ACCESS_TOKEN");
  const central = envLocal("CENTRAL_SUPABASE_URL");
  if (!token || !central) {
    throw new Error(
      `SUPABASE_ACCESS_TOKEN/CENTRAL_SUPABASE_URL ausentes — apague o perfil ${profileId} à mão.`,
    );
  }
  const ref = new URL(central).hostname.split(".")[0];
  const resp = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `DELETE FROM educacional.profiles WHERE id = ${profileId};`,
    }),
  });
  if (!resp.ok) {
    throw new Error(`Management API ${resp.status} no expurgo: ${await resp.text()}`);
  }
}

// A exclusão na câmera é LÓGICA (status='deleted'): a conta demo ainda existe
// como linha e como login central. Aqui o banco volta byte a byte.
test.afterAll(async () => {
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    const [row] = await sql<{ id: number; auth_user_id: string | null }[]>`
      SELECT id, auth_user_id FROM educacional.profiles
       WHERE lower(email) = lower(${ALUNO.email}) LIMIT 1
    `;
    if (row) {
      await removerLoginCentral(row.auth_user_id);
      try {
        await sql`DELETE FROM educacional.profiles WHERE id = ${row.id}`;
      } catch {
        await purgarPerfilComoDono(row.id);
      }
    }
    const [sobra] = await sql<{ perfis: number }[]>`
      SELECT (SELECT count(*) FROM educacional.profiles
               WHERE lower(email) = lower(${ALUNO.email}))::int AS perfis
    `;
    expect(sobra.perfis, "perfil demo sobrou na base").toBe(0);
  } finally {
    await sql.end();
  }
});

test.setTimeout(600_000);

test("admin gera nova senha temporária do aluno sem depender do e-mail (ClickUp 86ajradyp)", async ({
  context,
  page,
}) => {
  // ── Palco · o admin cria o aluno e vê a senha temporária UMA vez ──────────
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Membros" })).toBeVisible();
  await pausa(page, 2000);
  await page.getByRole("button", { name: "Novo usuário" }).click();
  await digitar(page, page.getByRole("textbox", { name: "Nome completo" }), ALUNO.nome);
  await digitar(page, page.getByRole("textbox", { name: "E-mail" }), ALUNO.email);
  await pausa(page, 1000);
  await page.getByRole("button", { name: "Criar usuário" }).click();
  senhaCriacao = await capturarSenhaDoModal(page);
  await pausa(page, 3600); // é este o momento único de que fala a task
  await page.getByRole("button", { name: "Concluir" }).click();
  await pausa(page, 1800);

  // ── Cena 1 · o aluno entra, troca por uma senha SÓ DELE e usa a plataforma
  await context.clearCookies();
  await loginNoFormulario(page, ALUNO.email, senhaCriacao);
  await page.waitForURL(/\/settings/);
  await expect(page.getByText("Primeiro acesso")).toBeVisible();
  await pausa(page, 2800);
  await page.locator('input[name="current_password"]').fill(senhaCriacao);
  await digitar(page, page.locator('input[name="new_password"]'), SENHA_DO_ALUNO);
  await digitar(page, page.locator('input[name="confirm_password"]'), SENHA_DO_ALUNO);
  await pausa(page, 1200);
  await page.getByRole("button", { name: /Salvar|Definir|Atualizar|Trocar/ }).first().click();
  await page.waitForURL(/\/(home|admin)(\?|$)/, { timeout: 45_000 });
  await page.goto("/home");
  await expect(page).toHaveURL(/\/home/);
  await pausa(page, 3400); // sessão do aluno viva e a senha da criação já morta

  // Guardamos a sessão real do aluno para provar, daqui a pouco, que ela cai.
  const cookiesDoAluno = await context.cookies();
  const antes = await estadoDaConta(ALUNO.email);
  expect(antes.trocaObrigatoria).toBe(false);

  // ── Cena 2 · o problema: o admin não tem a senha do aluno e o e-mail dele
  //    não é uma opção. A ficha agora oferece a saída. ──────────────────────
  await context.clearCookies();
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto(`/admin/students/${antes.id}`);
  await expect(page.getByRole("heading", { name: ALUNO.nome })).toBeVisible();
  await pausa(page, 3200);
  await page.getByRole("button", { name: "Gerar nova senha temporária" }).click();
  const confirmacao = page.getByRole("dialog");
  await expect(confirmacao.getByText(/deixa de funcionar imediatamente/)).toBeVisible();
  await pausa(page, 3600); // a confirmação avisa o preço antes de qualquer coisa
  await confirmacao.getByRole("button", { name: "Gerar senha" }).click();
  senhaRegerada = await capturarSenhaDoModal(page);
  expect(senhaRegerada).not.toBe(senhaCriacao);
  expect(senhaRegerada).not.toBe(SENHA_DO_ALUNO);
  await pausa(page, 4200);
  await page.getByRole("button", { name: "Concluir" }).click();

  const depois = await estadoDaConta(ALUNO.email);
  expect(depois.trocaObrigatoria).toBe(true);
  expect(depois.sessionVersion).toBeGreaterThan(antes.sessionVersion);

  // ── Cena 3 · MOMENTO-PROVA: a senha que o aluno usava não entra mais ──────
  await context.clearCookies();
  await loginNoFormulario(page, ALUNO.email, SENHA_DO_ALUNO);
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await pausa(page, 6000); // o corte é no login central, não na tela

  // ── Cena 4 · a sessão que o aluno tinha ABERTA também caiu ────────────────
  await context.clearCookies();
  await context.addCookies(cookiesDoAluno);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login/);
  await pausa(page, 5000);

  // ── Cena 5 · a senha nova entra e cobra a troca no primeiro acesso ────────
  await context.clearCookies();
  await loginNoFormulario(page, ALUNO.email, senhaRegerada);
  await page.waitForURL(/\/settings/);
  await expect(page.getByText("Primeiro acesso")).toBeVisible();
  await pausa(page, 5000); // exatamente o que a task pediu: senha nova + troca

  // ── Cena 6 · conta bloqueada: o botão trava e a ficha DIZ o motivo ────────
  await context.clearCookies();
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/students");
  const linha = page.locator("tr", { hasText: ALUNO.email });
  await linha.locator('button[title="Bloquear"]').click();
  await expect(linha.getByText("Bloqueado")).toBeVisible();
  await pausa(page, 2200);
  await expect(
    linha.locator('button[aria-label="Gerar nova senha temporária"]'),
  ).toBeDisabled();
  await pausa(page, 1600);
  const botaoDaFicha = page.getByRole("button", { name: "Gerar nova senha temporária" });
  await page.goto(`/admin/students/${antes.id}`);
  await expect(botaoDaFicha).toBeDisabled();
  await expect(
    page.getByText("Desbloqueie o usuário antes de gerar uma nova senha temporária."),
  ).toBeVisible();
  await pausa(page, 5000); // travado, e a tela explica por quê

  // ── Cena 7 · MOMENTO-PROVA do servidor: tela liberada não vale de nada ────
  //    Desbloqueia (o botão volta), e com a ficha JÁ ABERTA a conta é
  //    bloqueada por fora. O admin clica no botão que ainda está lá — quem
  //    recusa é o servidor, com o motivo.
  await page.goto("/admin/students");
  await linha.locator('button[title="Desbloquear"]').click();
  await expect(linha.getByText("Ativo")).toBeVisible();
  await pausa(page, 1500);
  await page.goto(`/admin/students/${antes.id}`);
  await expect(botaoDaFicha).toBeEnabled();
  await pausa(page, 2800);
  await bloquearPorFora(antes.id); // a conta cai com a tela do admin aberta
  await botaoDaFicha.click();
  await page.getByRole("dialog").getByRole("button", { name: "Gerar senha" }).click();
  await expect(
    page
      .getByText("Desbloqueie o usuário antes de gerar uma nova senha temporária.")
      .first(),
  ).toBeVisible();
  await expect(page.getByTestId("senha-temporaria")).toHaveCount(0);
  await pausa(page, 6500); // nenhuma senha foi gerada: o corte é do servidor

  // ── Limpeza na câmera: o aluno demo sai da base ───────────────────────────
  await page.goto("/admin/students");
  await pausa(page, 1600);
  await linha.locator('button[title="Excluir"]').click();
  await pausa(page, 1000);
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText(ALUNO.email)).toHaveCount(0);
  await pausa(page, 1800);
});
