// e2e/proxima-mentoria-home.spec.ts — prova do bug reportado pelo dono
// (ClickUp 86ajr9ecf): o destaque de "próxima mentoria" na /home era TEXTO FIXO
// no JSX ("Mentoria Geral · segunda-feira · 20h48") e por isso anunciava um
// encontro de 06/07 semanas depois dele passar, sem bater com a lista logo
// abaixo. Agora o destaque É a primeira das próximas mentorias, e "próxima"
// exclui o que JÁ TERMINOU (corte no servidor, fuso do produto).
//
// Roteiro: o destaque bate com a lista → uma mentoria nova assume o destaque →
// a MESMA mentoria, com horário que já passou, some do destaque e da lista →
// devolvida ao futuro, volta a aparecer → excluída, a home segue coerente.
//
// E2E_CADENCIA=1 ⇒ take de VÍDEO (slowMo, digitação visível e pausas de
// leitura). Sem a env, roda como prova de regressão rápida — mesmas asserções.

import { expect, test, type Page } from "@playwright/test";
import { PERFIS, educacionalUrl, loginAs } from "./helpers/arkom-session";

test.describe.configure({ mode: "serial" });

const CADENCIA = process.env.E2E_CADENCIA === "1";
test.use({ launchOptions: { slowMo: CADENCIA ? 220 : 0 } });

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const SUF = process.env.E2E_SUF ?? Math.random().toString(36).slice(2, 7);
const DEMO = `QA Proxima Mentoria E2E ${SUF}`;

/** A copy fixa que ficou pendurada na home — não pode voltar nunca. */
const COPY_FANTASMA = /Mentoria Geral|20h48/;

/** Pausa de leitura — só no take de vídeo. */
async function pausa(page: Page, ms = 2000): Promise<void> {
  if (CADENCIA) await page.waitForTimeout(ms);
}

/** Data ('YYYY-MM-DD') e hora ('HH:MM') de um instante NO FUSO DO PRODUTO
 *  (GMT-3). O agendamento do admin é lido como horário de Brasília; usar o
 *  relógio local da máquina de teste desalinha o cenário em CI/UTC. */
function emBrasilia(d: Date): { data: string; hora: string } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return {
    data: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour}:${partes.minute}`,
  };
}

function maisMinutos(min: number): Date {
  return new Date(Date.now() + min * 60_000);
}

/** Janela da mentoria demo: começa daqui a pouco (nenhuma real é tão cedo) e
 *  NÃO atravessa a meia-noite — `ends_at` menor que `starts_at` seria um
 *  encontro que termina antes de começar, e o agendamento é por DIA. */
function janelaDemo(): { data: string; inicio: string; fim: string } {
  const inicio = emBrasilia(maisMinutos(20));
  const fim = emBrasilia(maisMinutos(50));
  return {
    data: inicio.data,
    inicio: inicio.hora,
    fim: fim.data === inicio.data ? fim.hora : "23:59",
  };
}

/** Janela que JÁ TERMINOU (mesma virada de dia tratada acima). */
function janelaEncerrada(): { data: string; inicio: string; fim: string } {
  const inicio = emBrasilia(maisMinutos(-90));
  const fim = emBrasilia(maisMinutos(-30));
  return {
    data: fim.data,
    inicio: fim.data === inicio.data ? inicio.hora : "00:00",
    fim: fim.hora,
  };
}

/** Rótulo do destaque para uma data 'YYYY-MM-DD': "dd/mm". */
function diaMes(data: string): string {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
}

const destaque = (page: Page) => page.getByTestId("home-next-mentorship");
const listaProximas = (page: Page) => page.getByTestId("home-upcoming");

/** Abre a home e enquadra o selinho JUNTO com a lista "Próximas mentorias" —
 *  a prova é os dois contarem a mesma história no mesmo quadro. */
async function abrirHomeDoAluno(page: Page): Promise<void> {
  await page.goto("/home");
  await expect(page.getByText("Próximas mentorias").first()).toBeVisible();
  await pausa(page, 1500); // "onde estamos?"
  await page.evaluate(() => window.scrollTo({ top: 330 }));
  await pausa(page, 1400);
}

/** Traz a linha da tabela do admin para o quadro e deixa parada para leitura —
 *  ação fora da viewport é cena perdida. */
async function focarLinha(page: Page, texto: string, ms = 2400): Promise<void> {
  const linha = page.locator("tr", { hasText: texto }).first();
  await linha.scrollIntoViewIfNeeded();
  await expect(linha).toBeVisible();
  await pausa(page, ms);
}

/** Clica até o modal abrir. Sem cadência o clique pode chegar antes da
 *  hidratação do React — o botão está pintado, mas ainda não escuta. */
async function abrirModal(page: Page, nome: string | RegExp): Promise<void> {
  const botao = page.getByRole("button", { name: nome }).first();
  const dialog = page.getByRole("dialog");
  await expect(botao).toBeVisible();
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (await dialog.isVisible().catch(() => false)) break;
    await botao.click();
    await dialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  }
  await expect(dialog).toBeVisible();
}

/** Preenche o formulário de mentoria (criação ou edição) e salva. */
async function preencherFormulario(
  page: Page,
  campos: { titulo?: string; data: string; inicio: string; fim: string; live?: boolean },
  botao: RegExp
): Promise<void> {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await pausa(page, 1500);
  if (campos.live) {
    // live da comunidade: encontro sem custo em créditos — nada entra no ledger
    const kind = page.locator("#mentoria-kind");
    if (await kind.isVisible().catch(() => false)) {
      await kind.selectOption({ value: "live_comunidade" });
    }
  }
  if (campos.titulo) {
    const titulo = page.locator("#mentoria-title");
    await titulo.fill("");
    if (CADENCIA) await titulo.pressSequentially(campos.titulo, { delay: 45 });
    else await titulo.fill(campos.titulo);
  }
  await page.locator("#mentoria-data").fill(campos.data);
  await page.locator("#mentoria-inicio").fill(campos.inicio);
  await page.locator("#mentoria-fim").fill(campos.fim);
  await pausa(page, 700); // o formulário completo na tela antes de submeter
  await page.getByRole("button", { name: botao }).click();
}

async function criarDemo(
  page: Page,
  quando: { data: string; inicio: string; fim: string }
): Promise<void> {
  await page.goto("/admin/mentorships");
  await pausa(page, 1600);
  await abrirModal(page, "Nova mentoria");
  await preencherFormulario(page, { titulo: DEMO, live: true, ...quando }, /^Criar mentoria$/);
  await expect(page.getByText(DEMO).first()).toBeVisible({ timeout: 30_000 });
  await focarLinha(page, DEMO, 2400);
}

async function reagendarDemo(
  page: Page,
  quando: { data: string; inicio: string; fim: string }
): Promise<void> {
  await page.goto("/admin/mentorships");
  await pausa(page, 1400);
  await focarLinha(page, DEMO, 1600);
  await abrirModal(page, `Editar ${DEMO}`);
  await preencherFormulario(page, quando, /^Salvar alterações$/);
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
  await focarLinha(page, DEMO, 2600); // o novo horário na tabela, antes de trocar de persona
}

test("o destaque de 'próxima mentoria' na /home é calculado — e ignora o que já terminou", async ({
  context,
  page,
}) => {
  // ── Cena 0 · o que o report descreve: existe UMA "Mentoria Geral", de 06/07,
  //    passada — e era ela que a home anunciava, fixa, para todo aluno. ──────
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/mentorships");
  await pausa(page, 1600);
  await focarLinha(page, "Mentoria Geral", 3000); // a mentoria de 06/07 que a home anunciava
  await context.clearCookies();

  // ── Cena 1 · a home do aluno: destaque = 1º item da lista, e nada de copy
  //    fantasma. ──────────────────────────────────────────────────────────────
  await loginAs(context, BASE, PERFIS.alunoLegado);
  await abrirHomeDoAluno(page);
  await expect(destaque(page)).toBeVisible();
  await expect(destaque(page)).not.toContainText(COPY_FANTASMA);
  const tituloDestaque = await destaque(page).locator("b").first().innerText();
  await expect(listaProximas(page).first()).toContainText(tituloDestaque);
  await pausa(page, 3200); // momento-prova: destaque e lista contam a MESMA coisa

  // ── Cena 2 · o destaque é DADO, não texto: uma mentoria que começa daqui a
  //    pouco assume o topo. ─────────────────────────────────────────────────
  const futuro = janelaDemo();
  await context.clearCookies();
  await loginAs(context, BASE, PERFIS.admin);
  await criarDemo(page, futuro);
  await context.clearCookies();

  await loginAs(context, BASE, PERFIS.alunoLegado);
  await abrirHomeDoAluno(page);
  await expect(destaque(page)).toContainText(DEMO);
  await expect(destaque(page)).toContainText(diaMes(futuro.data));
  await expect(destaque(page)).toContainText(futuro.inicio.replace(":", "h"));
  await expect(listaProximas(page).first()).toContainText(DEMO);
  await pausa(page, 3400); // momento-prova: o selinho mudou junto com o banco

  // ── Cena 3 · o coração do bug: a MESMA mentoria, com horário que já
  //    terminou, deixa de ser "a próxima" na hora — não à meia-noite. ────────
  const encerrada = janelaEncerrada();
  await context.clearCookies();
  await loginAs(context, BASE, PERFIS.admin);
  await reagendarDemo(page, encerrada);
  await context.clearCookies();

  await loginAs(context, BASE, PERFIS.alunoLegado);
  await abrirHomeDoAluno(page);
  await expect(destaque(page)).not.toContainText(DEMO);
  await expect(destaque(page)).not.toContainText(COPY_FANTASMA);
  await expect(page.getByText(DEMO)).toHaveCount(0);
  await expect(destaque(page)).toContainText(tituloDestaque);
  await pausa(page, 3400); // momento-prova: mentoria encerrada some do destaque

  // ── Cena 3b · quem decide é o SERVIDOR: um navegador em Tóquio (onde já é
  //    outro dia) vê exatamente o mesmo destaque. ───────────────────────────
  const tokyo = await context.browser()!.newContext({
    baseURL: BASE,
    timezoneId: "Asia/Tokyo",
    locale: "pt-BR",
    viewport: { width: 1280, height: 720 },
  });
  await loginAs(tokyo, BASE, PERFIS.alunoLegado);
  const pageTokyo = await tokyo.newPage();
  await pageTokyo.goto("/home");
  await expect(pageTokyo.getByTestId("home-next-mentorship")).toContainText(tituloDestaque);
  await expect(pageTokyo.getByText(DEMO)).toHaveCount(0);
  await tokyo.close();

  // ── Cena 4 · desfazendo: de volta ao futuro, a mentoria reaparece. ───────
  await context.clearCookies();
  await loginAs(context, BASE, PERFIS.admin);
  await reagendarDemo(page, futuro);
  await context.clearCookies();

  await loginAs(context, BASE, PERFIS.alunoLegado);
  await abrirHomeDoAluno(page);
  await expect(destaque(page)).toContainText(DEMO);
  await pausa(page, 2600);

  // ── Limpeza: a mentoria demo sai do banco e a home volta ao estado real. ──
  await context.clearCookies();
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/mentorships");
  await focarLinha(page, DEMO, 1500);
  await abrirModal(page, `Excluir ${DEMO}`);
  await pausa(page, 1500);
  await page.getByRole("button", { name: "Excluir", exact: true }).last().click();
  await expect(page.getByText(DEMO)).toHaveCount(0, { timeout: 30_000 });
  await context.clearCookies();

  await loginAs(context, BASE, PERFIS.alunoLegado);
  await abrirHomeDoAluno(page);
  await expect(destaque(page)).toContainText(tituloDestaque);
  await expect(destaque(page)).not.toContainText(COPY_FANTASMA);
  await pausa(page, 2400);
});

test.afterAll(async () => {
  // Rede de segurança: se o teste morreu no meio, a mentoria demo não fica no
  // calendário real. Escopo pelo título demo — nunca por data/status.
  const postgres = (await import("postgres")).default;
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    await sql`DELETE FROM educacional.mentorship_events WHERE title = ${DEMO}`;
  } finally {
    await sql.end();
  }
});
