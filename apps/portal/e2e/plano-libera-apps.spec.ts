// e2e/plano-libera-apps.spec.ts — prova do pedido do comercial (ClickUp
// 86ajrgzef): o plano passa a dizer se libera OU NÃO os Apps e Templates
// (liga/desliga único, sem seleção app a app), e as caixas de "Cursos inclusos"
// — que até então só GRAVAVAM — passam a valer de verdade no catálogo do aluno.
//
// A jornada é a do "plano de FUP": o lead entra, faz só o curso da Arkom e vê o
// resto bloqueado. O spec cobre as duas metades e a REVERSÃO:
//   1. admin cria o plano fechado (só ARKOM, sem apps) e o aluno nele;
//   2. aluno: /apps explica o motivo; a URL direta do app NÃO fura; o HTML da
//      página não carrega nome nem link de app nenhum (corte no SERVIDOR);
//   3. aluno: catálogo com ARKOM aberto e os demais com cadeado "Não incluso no
//      seu plano"; URL direta de curso fora do plano devolve ao catálogo;
//   4. admin religa os apps e marca um curso a mais → o aluno recupera os dois
//      na hora (o direito é lido do plano, não materializado).
//
// Banco devolvido byte a byte: o aluno demo é excluído e o plano demo volta a
// rascunho no fim (plano com histórico de entitlement não pode ser excluído).

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

const PLANO = `Plano FUP ${SUF}`;
const ALUNO = { nome: "Lead FUP E2E", email: `fup.${SUF}@bilhon.ai` };
/** O curso que o lead PODE ver (o da Arkom, exatamente como no pedido). */
const CURSO_LIBERADO = "ARKOM";
/** O curso que entra só na segunda rodada, provando a reversão. */
const CURSO_EXTRA = "Claude Code";

async function pausa(page: Page, ms = 2000): Promise<void> {
  if (CADENCIA) await page.waitForTimeout(ms);
}

async function digitar(
  page: Page,
  campo: ReturnType<Page["getByRole"]>,
  texto: string,
): Promise<void> {
  if (CADENCIA) await campo.pressSequentially(texto, { delay: 45 });
  else await campo.fill(texto);
}

/** Um app publicado e disponível — alvo da tentativa de furar por URL direta. */
async function appPublicado(): Promise<{ id: number; title: string }> {
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    const [row] = await sql<{ id: number; title: string }[]>`
      SELECT id, title FROM educacional.apps
       WHERE status = 'published' AND redirect_url NOT LIKE 'coming-soon:%'
       ORDER BY id LIMIT 1
    `;
    if (!row) throw new Error("nenhum app publicado no banco");
    return row;
  } finally {
    await sql.end();
  }
}

/** id do perfil recém-criado pela UI (para cunhar a sessão do aluno).
 *  Também zera `must_change_password`: a conta nasce com senha temporária e o
 *  app manda TODA rota para /settings até a troca — o que testamos aqui é o
 *  direito do plano, não o primeiro acesso (que tem spec próprio). */
async function prepararAluno(email: string): Promise<number> {
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    const [row] = await sql<{ id: number }[]>`
      UPDATE educacional.profiles SET must_change_password = 0
       WHERE lower(email) = lower(${email}) AND status <> 'deleted'
      RETURNING id
    `;
    if (!row) throw new Error(`perfil ausente para ${email}`);
    return row.id;
  } finally {
    await sql.end();
  }
}

/** Marca/desmarca um curso na lista de "Cursos inclusos" do modal do plano. */
async function marcarCurso(page: Page, titulo: string): Promise<void> {
  await page.locator("#plano-cursos").locator("label", { hasText: titulo }).first().click();
}

test.setTimeout(600_000);

test("plano decide se libera os apps — e os cursos inclusos valem (ClickUp 86ajrgzef)", async ({
  context,
  page,
}) => {
  const app = await appPublicado();
  await loginAs(context, BASE, PERFIS.admin);

  // ── Cena 1 · O plano de FUP: só o curso da Arkom, e SEM apps ─────────────
  await page.goto("/admin/plans");
  await expect(page.getByRole("heading", { name: "Planos" })).toBeVisible();
  await pausa(page, 1500);
  await page.getByRole("button", { name: "Novo plano" }).click();
  await digitar(page, page.getByRole("textbox", { name: "Nome *" }), PLANO);
  await page.getByRole("spinbutton", { name: "Duração (meses)" }).fill("12");
  await page.getByRole("spinbutton", { name: "Horas de mentoria" }).fill("2");
  await pausa(page, 900);
  await marcarCurso(page, CURSO_LIBERADO);
  await pausa(page, 1200);

  // O pedido da task, na tela: um liga/desliga só para os apps.
  const chaveApps = page.getByRole("checkbox", { name: "Liberar todos os sistemas" });
  await expect(chaveApps).toBeChecked(); // plano novo nasce liberando (hoje)
  await pausa(page, 1400);
  await chaveApps.uncheck();
  await expect(
    page.getByText(/O aluno NÃO acessa nenhum sistema/),
  ).toBeVisible();
  await pausa(page, 2600); // momento-prova: a escolha existe e se explica

  await page.getByLabel("Status").selectOption({ label: "Publicado" });
  await page.getByRole("button", { name: "Criar plano" }).click();
  await expect(page.getByText(PLANO).first()).toBeVisible();
  // A tabela avisa que este plano não leva apps.
  await expect(
    page.locator("tr", { hasText: PLANO }).getByText("Sem sistemas"),
  ).toBeVisible();
  await pausa(page, 2400);

  // ── Cena 2 · O lead entra na plataforma com esse plano ───────────────────
  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Membros" })).toBeVisible();
  await pausa(page, 1600);
  await page.getByRole("button", { name: "Novo usuário" }).click();
  await pausa(page, 1500);
  await digitar(page, page.getByRole("textbox", { name: "Nome completo" }), ALUNO.nome);
  await digitar(page, page.getByRole("textbox", { name: "E-mail" }), ALUNO.email);
  await page.locator("#al-plano").selectOption({ label: PLANO });
  await pausa(page, 900);
  await page.getByRole("button", { name: "Criar usuário" }).click();
  await expect(page.getByTestId("senha-temporaria")).toBeVisible({ timeout: 30_000 });
  await pausa(page, 1800);
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByText(ALUNO.email).first()).toBeVisible();

  const alunoId = await prepararAluno(ALUNO.email);
  await loginAs(context, BASE, alunoId);

  // ── Cena 3 · A área de Apps explica o motivo (não é 404 nem tela quebrada) ─
  await page.goto("/apps");
  await expect(page.getByText("Não incluso no seu plano")).toBeVisible();
  await expect(page.getByText(new RegExp(`O plano ${PLANO}`))).toBeVisible();
  await expect(page.getByText(app.title)).toHaveCount(0);
  await pausa(page, 3200); // momento-prova central: bloqueado COM motivo

  // ── Cena 4 · Forçar por fora não fura: URL direta do app ─────────────────
  await page.goto(`/apps/${app.id}`);
  await expect(page.getByText("Não incluso no seu plano")).toBeVisible();
  await expect(page.getByText(app.title)).toHaveCount(0);
  await pausa(page, 2800);

  // …e o corte é no SERVIDOR: o HTML da vitrine não carrega nome nem link de
  // app nenhum — não é o grid escondido no navegador.
  const htmlApps = await (await page.request.get(`${BASE}/apps`)).text();
  expect(htmlApps).not.toContain(app.title);

  // ── Cena 5 · O catálogo: ARKOM aberto, o resto com cadeado explicado ─────
  await page.goto("/trainings");
  await expect(page.getByText(CURSO_LIBERADO).first()).toBeVisible();
  await pausa(page, 1600);
  // O curso fora do plano diz POR QUE está fechado — não é "libera em N dias".
  await expect(
    page
      .getByTestId("course-card")
      .filter({ hasText: CURSO_EXTRA })
      .first()
      .getByTestId("course-card-lock"),
  ).toHaveText("Não incluso no seu plano");
  await pausa(page, 3200); // o "vê o restante bloqueado" do pedido

  // URL direta do curso fora do plano devolve ao catálogo (guard do servidor).
  await page.goto("/trainings/claude-code");
  await expect(page).toHaveURL(/\/trainings$/);
  await pausa(page, 2400);

  // ── Cena 6 · Reversão: o admin religa os apps e solta mais um curso ──────
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/plans");
  await pausa(page, 1600);
  await page.getByRole("button", { name: `Editar ${PLANO}`, exact: true }).click();
  await pausa(page, 1600);
  await marcarCurso(page, CURSO_EXTRA);
  await pausa(page, 1000);
  await page.getByRole("checkbox", { name: "Liberar todos os sistemas" }).check();
  await pausa(page, 2200); // a chave religada, com a explicação trocada na tela
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await pausa(page, 2400); // o aviso: cursos e sistemas valem JÁ para quem está no plano

  // ── Cena 7 · O aluno recupera os dois NA HORA (direito lido do plano) ────
  await loginAs(context, BASE, alunoId);
  await page.goto("/apps");
  await expect(page.getByText("Não incluso no seu plano")).toHaveCount(0);
  await expect(page.getByText(app.title).first()).toBeVisible();
  await pausa(page, 3000); // a mesma tela de antes, agora com os sistemas

  // O curso que entrou no plano perde o cadeado (os outros seguem fora dele).
  await page.goto("/trainings");
  await expect(
    page
      .getByTestId("course-card")
      .filter({ hasText: CURSO_EXTRA })
      .first()
      .getByTestId("course-card-lock"),
  ).toHaveCount(0);
  await pausa(page, 2800);
  // …e o curso que antes devolvia ao catálogo agora abre.
  await page.goto("/trainings/claude-code");
  await expect(page).not.toHaveURL(/\/trainings$/);
  await pausa(page, 3000); // a reversão é imediata: nem reatribuir o plano

  // ── Limpeza na câmera: aluno excluído, plano demo de volta a rascunho ────
  await loginAs(context, BASE, PERFIS.admin);
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
  await pausa(page, 1500);
});
