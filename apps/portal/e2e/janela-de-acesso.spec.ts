// e2e/janela-de-acesso.spec.ts — prova do bug reportado pelo dono
// (ClickUp 86ajrbk7y): "Acessar mentoria" aparecia num evento do DIA SEGUINTE.
// A regra nova: a sala abre 30 minutos antes do início e fecha no fim do
// evento. Confirmar presença segue liberado com qualquer antecedência — o que
// não vale é ENTRAR antes da hora. O corte é do SERVIDOR: a rota
// /api/mentorships/go/<id> devolve o aluno para /mentorships mesmo com a URL
// digitada na mão; a capa só espelha e explica.
//
// Dois eventos LIVE (custo 0 — nada toca o ledger) provam os dois lados:
// um AMANHÃ (fora da janela) e um EM ANDAMENTO (dentro). Ambos são apagados no
// afterAll, com as confirmações indo junto por ON DELETE CASCADE.
//
// E2E_CADENCIA=1 ⇒ take de VÍDEO (pausas + digitação visível). Sem a env, roda
// como prova de regressão rápida — mesmas asserções nos dois modos.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PERFIS, educacionalUrl, loginAs } from "./helpers/arkom-session";

test.describe.configure({ mode: "serial" });

const CADENCIA = process.env.E2E_CADENCIA === "1";
test.use({ launchOptions: { slowMo: CADENCIA ? 220 : 0 } });

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const SUF = process.env.E2E_SUF ?? Math.random().toString(36).slice(2, 7);

const EVENTO_AMANHA = `Janela Amanha E2E ${SUF}`;
const EVENTO_AGORA = `Janela Agora E2E ${SUF}`;
const SALA = "https://example.com/sala-da-mentoria-arkom";

/** Agora no fuso do produto (GMT-3), em partes 'YYYY-MM-DD' e 'HH:MM'.
 *  O relógio da MÁQUINA pode estar em qualquer fuso — o admin digita horário
 *  de Brasília, que é como o banco lê `event_date`/`starts_at`. */
function agoraSP(offsetMin = 0): { data: string; hora: string } {
  const d = new Date(Date.now() + offsetMin * 60_000);
  // 'sv-SE' formata como "2026-07-29 14:05" (ISO-ish), com o fuso aplicado.
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  const [data, hora] = s.split(" ");
  return { data, hora };
}

/** Dia seguinte a 'YYYY-MM-DD' (âncora ao meio-dia UTC: nunca desloca o dia). */
function diaSeguinte(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Pausa de leitura — só no take de vídeo. */
async function pausa(page: Page, ms = 2000): Promise<void> {
  if (CADENCIA) await page.waitForTimeout(ms);
}

async function digitar(page: Page, seletor: string, texto: string): Promise<void> {
  const campo = page.locator(seletor);
  if (CADENCIA) await campo.pressSequentially(texto, { delay: 45 });
  else await campo.fill(texto);
}

/** Cria a mentoria pela UI do admin (LIVE: não consome horas de ninguém). */
async function criarEvento(
  page: Page,
  titulo: string,
  data: string,
  inicio: string,
  fim: string,
): Promise<void> {
  await page.goto("/admin/mentorships");
  await pausa(page, 2000);
  // O clique só "pega" depois da hidratação — repete até o formulário abrir.
  const novo = page.getByRole("button", { name: /Nova mentoria/ }).first();
  await expect(async () => {
    await novo.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 45_000 });
  await pausa(page, 1700);
  await digitar(page, "#mentoria-title", titulo);
  await page.locator("#mentoria-data").fill(data);
  await page.locator("#mentoria-inicio").fill(inicio);
  await page.locator("#mentoria-fim").fill(fim);
  // O link da sala é o que o gate protege: sem ele não existe botão nenhum.
  await page.locator("#mentoria-link").fill(SALA);
  // O seletor de tipo só existe com a flag de créditos ligada; sem ela o evento
  // já nasce sem custo — em qualquer um dos casos, nada de ledger.
  const tipo = page.locator("#mentoria-kind");
  if (await tipo.isVisible().catch(() => false)) {
    await tipo.selectOption({ value: "live_comunidade" });
  }
  await page.locator("#mentoria-status").selectOption({ value: "published" });
  await pausa(page, 900); // formulário completo na tela antes de submeter
  await page.getByRole("button", { name: /Criar mentoria|Salvar/ }).click();
  const linha = page.locator("tr", { hasText: titulo }).first();
  await expect(linha).toBeVisible({ timeout: 30_000 });
  await linha.scrollIntoViewIfNeeded();
  await pausa(page, 2900); // a linha nova na agenda, com data e horário legíveis
}

/** Abre a capa do evento no calendário do aluno (avança o mês se preciso). */
async function abrirCapa(page: Page, titulo: string): Promise<void> {
  await page.goto("/mentorships");
  await pausa(page, 2200); // "onde estamos?" — o calendário do aluno
  const pill = page.getByRole("button", { name: new RegExp(titulo) }).first();
  for (let i = 0; i < 3 && (await pill.count()) === 0; i++) {
    await page.getByRole("button", { name: "›" }).click();
    await page.waitForTimeout(300);
  }
  await pill.scrollIntoViewIfNeeded();
  await pausa(page, 1500); // o evento na grade, antes do clique
  await pill.click();
  await expect(page.getByTestId("event-modal")).toBeVisible();
  await pausa(page, 2400); // a capa aberta: título, data e horário na tela
}

async function idDoEvento(titulo: string): Promise<number> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    const [row] = await sql<{ id: number }[]>`
      SELECT id FROM educacional.mentorship_events WHERE title = ${titulo} LIMIT 1`;
    if (!row) throw new Error(`evento "${titulo}" não encontrado no banco`);
    return row.id;
  } finally {
    await sql.end();
  }
}

function envLocal(chave: string): string | null {
  if (process.env[chave]) return process.env[chave]!;
  const arquivo = resolve(process.cwd(), ".env.local");
  if (!existsSync(arquivo)) return null;
  const m = readFileSync(arquivo, "utf-8").match(new RegExp(`^${chave}=(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

/**
 * Expurgo do dado demo pela Management API (roda como DONO do banco).
 * Confirmar presença grava no `credit_shadow_log`, que é append-only: o
 * trigger recusa UPDATE/DELETE, e o FK `event_id ON DELETE SET NULL` faz o
 * DELETE do evento virar um UPDATE proibido. Então: desliga os gatilhos do
 * diário, apaga SÓ as linhas destes eventos, RELIGA e aí apaga os eventos.
 */
async function purgarDemoComoDono(titulos: string[]): Promise<void> {
  const token = envLocal("SUPABASE_ACCESS_TOKEN");
  const central = envLocal("CENTRAL_SUPABASE_URL");
  if (!token || !central) {
    throw new Error(
      "SUPABASE_ACCESS_TOKEN/CENTRAL_SUPABASE_URL ausentes — sem eles o dado demo " +
        "não sai (o diário de sombra é append-only). Limpe manualmente: " +
        titulos.join(", "),
    );
  }
  const ref = new URL(central).hostname.split(".")[0];
  const lista = titulos.map((t) => `'${t.replace(/'/g, "''")}'`).join(", ");
  const query = `
    do $$
    declare ids int[];
    begin
      select array_agg(id) into ids
        from educacional.mentorship_events where title in (${lista});
      if ids is null then return; end if;
      alter table educacional.credit_shadow_log disable trigger user;
      delete from educacional.credit_shadow_log where event_id = any(ids);
      alter table educacional.credit_shadow_log enable trigger user;
      delete from educacional.mentorship_events where id = any(ids);
    end $$;`;
  const resp = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) {
    throw new Error(`Management API ${resp.status} no expurgo: ${await resp.text()}`);
  }
}

test.afterAll(async () => {
  const titulos = [EVENTO_AMANHA, EVENTO_AGORA];
  const postgres = (await import("postgres")).default;
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    // Caminho simples primeiro: sem linha de sombra (flags OFF), a role do app
    // dá conta e as confirmações vão junto por ON DELETE CASCADE.
    await sql`DELETE FROM educacional.mentorship_events WHERE title IN ${sql(titulos)}`;
  } catch {
    // Barrou (o diário de sombra recusa o UPDATE do ON DELETE SET NULL): o
    // expurgo vai pela Management API, como dono do banco.
    await purgarDemoComoDono(titulos);
  } finally {
    // Confere que o banco voltou byte a byte: nada do demo sobrou e o gatilho
    // append-only do diário está religado.
    const [sobra] = await sql<{ eventos: number; sombra: number; gatilhos: number }[]>`
      SELECT (SELECT count(*) FROM educacional.mentorship_events
               WHERE title IN ${sql(titulos)})::int AS eventos,
             (SELECT count(*) FROM educacional.credit_shadow_log
               WHERE event_title IN ${sql(titulos)})::int AS sombra,
             (SELECT count(*) FROM pg_trigger t
                JOIN pg_class c ON c.oid = t.tgrelid
               WHERE c.relname = 'credit_shadow_log'
                 AND NOT t.tgisinternal AND t.tgenabled = 'O')::int AS gatilhos`;
    await sql.end();
    expect(sobra.eventos, "evento demo sobrou no calendário").toBe(0);
    expect(sobra.sombra, "linha demo sobrou no diário de sombra").toBe(0);
    expect(sobra.gatilhos, "gatilhos append-only do diário ficaram desligados").toBe(2);
  }
});

test("sala fechada antes da hora: capa explica e o servidor barra a URL na mão", async ({
  context,
  page,
}) => {
  // A mentoria "liberada" começa em 10 MINUTOS: já está dentro da janela de 30
  // min — é a régua nova em ação, não só "o evento está rolando". A outra é no
  // dia seguinte a ela, que é o caso exato do report.
  const comeca = agoraSP(10);
  const termina = agoraSP(70);
  if (comeca.data !== termina.data) {
    throw new Error("Take na virada do dia: rode fora da janela 23h–00h (GMT-3).");
  }
  const amanha = diaSeguinte(comeca.data);

  // ── Admin monta o palco: uma mentoria AMANHÃ e uma PRESTES A COMEÇAR ─────
  await loginAs(context, BASE, PERFIS.admin);
  await criarEvento(page, EVENTO_AMANHA, amanha, "14:00", "16:00");
  await criarEvento(page, EVENTO_AGORA, comeca.data, comeca.hora, termina.hora);
  const idAmanha = await idDoEvento(EVENTO_AMANHA);
  const idAgora = await idDoEvento(EVENTO_AGORA);
  await context.clearCookies();

  // ── Aluno abre a mentoria de AMANHÃ: sem confirmar, o cadeado é o do D18 ─
  await loginAs(context, BASE, PERFIS.alunoLegado);
  await abrirCapa(page, EVENTO_AMANHA);
  await expect(page.getByTestId("access-mentoria")).toHaveCount(0);
  const semPresenca = page.getByTestId("access-locked");
  await expect(semPresenca).toBeVisible();
  await semPresenca.click({ force: true }); // aria-disabled: exige force
  await expect(page.getByText("Confirme sua presença primeiro")).toBeVisible();
  await pausa(page, 3200);

  // ── Confirma presença — isso sempre pôde ser feito com antecedência ──────
  await page.getByTestId("confirm-presence").click();
  await expect(page.getByTestId("confirm-presence")).toContainText("Presença confirmada");
  await pausa(page, 2800);

  // ── O GESTO DO REPORT: mesmo confirmado, a sala de amanhã não abre ───────
  await expect(page.getByTestId("access-mentoria")).toHaveCount(0);
  const travado = page.getByTestId("access-early");
  await expect(travado).toBeVisible();
  await travado.click({ force: true });
  await expect(page.getByText("Ainda não é hora de entrar")).toBeVisible();
  // A frase diz a REGRA e a HORA: evento das 14h00 ⇒ sala a partir das 13h30.
  await expect(
    page.getByText(/A sala abre 30 minutos antes do início — a partir das 13h30/),
  ).toBeVisible();
  await pausa(page, 3500); // MOMENTO-PROVA: o botão travado e o porquê na tela
  await page.keyboard.press("Escape");
  await pausa(page, 1800);

  // ── Forçar por fora: a URL da rota digitada na mão volta pro calendário ──
  await page.goto(`/api/mentorships/go/${idAmanha}`);
  await expect(page).toHaveURL(/\/mentorships$/);
  await expect(page.getByRole("heading", { name: "Mentorias" }).first()).toBeVisible();
  await pausa(page, 3600); // o corte é do SERVIDOR, não da tela

  // ── O caminho certo: a mentoria que começa em 10 min JÁ está na janela ───
  await abrirCapa(page, EVENTO_AGORA);
  await page.getByTestId("confirm-presence").click();
  await expect(page.getByTestId("confirm-presence")).toContainText("Presença confirmada");
  await pausa(page, 2600);
  const acesso = page.getByTestId("access-mentoria");
  await expect(acesso).toBeVisible();
  await expect(acesso).toHaveAttribute("href", `/api/mentorships/go/${idAgora}`);
  await pausa(page, 3200); // o botão dourado, liberado, no evento da vez

  // a mesma rota que barrou a de amanhã entrega a sala desta (302 real)
  await page.goto(`/api/mentorships/go/${idAgora}`);
  await expect(page).toHaveURL(/^https:\/\/example\.com\/sala-da-mentoria-arkom/);
  await pausa(page, 3500); // MOMENTO-PROVA: a sala abriu para o evento certo

  // ── Desfazer volta a barrar: sem presença, nem dentro da janela ──────────
  await abrirCapa(page, EVENTO_AGORA);
  await page.getByTestId("confirm-presence").click();
  await expect(page.getByTestId("confirm-presence")).toContainText("Confirmar presença");
  await expect(page.getByTestId("access-mentoria")).toHaveCount(0);
  await expect(page.getByTestId("access-locked")).toBeVisible();
  await pausa(page, 3200);
  await page.goto(`/api/mentorships/go/${idAgora}`);
  await expect(page).toHaveURL(/\/mentorships$/);
  await pausa(page, 3600); // ciclo fechado: o servidor barra os dois casos
});
