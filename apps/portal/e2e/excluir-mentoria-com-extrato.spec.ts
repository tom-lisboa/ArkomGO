// e2e/excluir-mentoria-com-extrato.spec.ts — prova do bug reportado pelo dono
// (ClickUp 86ajrcafy): excluir uma mentoria CANCELADA E ESTORNADA devolvia só
// "Não foi possível excluir a mentoria. Tente novamente." — mensagem enganosa,
// porque retentar nunca resolvia.
//
// A causa: `credit_ledger.event_id` e `credit_shadow_log.event_id` apontam para
// o evento com `ON DELETE SET NULL`, e as duas tabelas são append-only por
// trigger. Apagar a mentoria vira um UPDATE proibido e o banco recusa com
// `23001` (`restrict_violation`). Não é falha transitória: é regra do sistema.
//
// A regra agora aparece ANTES do clique (botão travado que EXPLICA) e o corte
// continua no SERVIDOR — a trava da lista é só o espelho de uma decisão que é
// tomada de novo, no servidor, a cada pedido de exclusão.
//
// Quatro cenas:
//   1. mentoria cancelada+estornada: Excluir travado, motivo na tela;
//   2. corrida — a lista carrega excluível, o extrato nasce com a tela aberta e
//      o SERVIDOR barra assim mesmo (a trava da lista é só o espelho);
//   3. mentoria sem lançamento nenhum: exclui normalmente (a regra não é geral);
//   4. o extrato do aluno com o débito e o estorno — o histórico protegido.
//
// SETUP (fora de câmera): o débito de confirmação é semeado direto no ledger,
// porque o aluno de demonstração está no plano Legado (ilimitado) e ilimitado
// não gera débito. O ESTORNO é real, feito pelo botão "Cancelar pelo Arkom" na
// própria gravação — é o estado exato do report. Tudo é expurgado no afterAll.
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

/** A do report: cobra crédito, tem débito e é cancelada+estornada em cena. */
const EVENTO_COM_EXTRATO = `Excluir COM extrato E2E ${SUF}`;
/** A da corrida: carrega excluível e ganha extrato com a tela aberta. */
const EVENTO_CORRIDA = `Excluir na CORRIDA E2E ${SUF}`;
/** O contraste: nunca gerou lançamento, então continua excluível. */
const EVENTO_SEM_EXTRATO = `Excluir SEM extrato E2E ${SUF}`;
const TITULOS = [EVENTO_COM_EXTRATO, EVENTO_CORRIDA, EVENTO_SEM_EXTRATO];

/** Aluno de demonstração que aparece no extrato da cena 4. */
const ALUNO = { id: PERFIS.alunoLegado, email: "aluno@bilhon.ai" };

function envLocal(chave: string): string | null {
  if (process.env[chave]) return process.env[chave]!;
  const arquivo = resolve(process.cwd(), ".env.local");
  if (!existsSync(arquivo)) return null;
  const m = readFileSync(arquivo, "utf-8").match(new RegExp(`^${chave}=(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

type Sql = Awaited<ReturnType<typeof abrirBanco>>;

async function abrirBanco() {
  const postgres = (await import("postgres")).default;
  return postgres(educacionalUrl(), { max: 1, prepare: false });
}

async function comBanco<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = await abrirBanco();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Pausa de leitura — só no take de vídeo. */
async function pausa(page: Page, ms = 2000): Promise<void> {
  if (CADENCIA) await page.waitForTimeout(ms);
}

/** Data de amanhã em 'YYYY-MM-DD' (âncora ao meio-dia UTC: nunca desloca). */
function amanha(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

function linha(page: Page, titulo: string) {
  return page.locator("tr", { hasText: titulo }).first();
}

function botaoExcluir(page: Page, titulo: string) {
  return linha(page, titulo).locator('button[aria-label^="Excluir"]');
}

/** Pelo aria-label, não pelo title: o title do botão Excluir bloqueado cita
 *  "Cancelar pelo Arkom" no texto do motivo e casaria por engano. */
function botaoCancelar(page: Page, titulo: string) {
  return linha(page, titulo).locator('button[aria-label^="Cancelar "]');
}

async function criarEvento(
  page: Page,
  titulo: string,
  opcoes: { cobraCredito: boolean },
): Promise<void> {
  await page.goto("/admin/mentorships");
  await pausa(page, 1500); // onde estamos: a lista de mentorias do /admin
  await page.getByRole("button", { name: /Nova mentoria/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await pausa(page, 1600); // modal aberto antes de interagir
  if (CADENCIA) {
    await page
      .getByRole("textbox", { name: /Título|Nome/ })
      .first()
      .pressSequentially(titulo, { delay: 45 });
  } else {
    await page.getByRole("textbox", { name: /Título|Nome/ }).first().fill(titulo);
  }
  await page.locator('input[type="date"]').first().fill(amanha());
  await page.locator('input[type="time"]').first().fill("14:00");
  await page.locator('input[type="time"]').nth(1).fill("16:00");
  await page
    .locator("#mentoria-kind")
    .selectOption({ value: opcoes.cobraCredito ? "mentoria_arkom" : "live_comunidade" });
  if (opcoes.cobraCredito) await page.locator("#mentoria-credit-cost").fill("1");
  const status = page.locator('select[name="status"]').last();
  if (await status.isVisible().catch(() => false)) {
    await status.selectOption({ value: "published" }).catch(() => {});
  }
  await pausa(page, 900); // o formulário completo é um quadro que o olho registra
  await page.getByRole("button", { name: /Criar mentoria|Salvar/ }).click();
  await expect(page.getByText(titulo).first()).toBeVisible();
  await pausa(page, 1500); // a mentoria nova aparecendo na lista
}

/**
 * Semeia o DÉBITO da confirmação (setup fora de câmera — ver cabeçalho). Copia,
 * campo a campo, o lançamento que `debitForParticipation` grava: mesma
 * `operation_key` (`confirm:evt=…:perfil=…:c=0`), mesma nota e mesmo `ref`.
 * É isso que faz o "Cancelar pelo Arkom" da gravação achar débito em aberto e
 * lançar um estorno DE VERDADE.
 */
async function semearDebito(titulo: string, profileId: number): Promise<number> {
  return comBanco(async (sql) => {
    const [evento] = await sql<{ id: number }[]>`
      SELECT id FROM educacional.mentorship_events WHERE title = ${titulo}
    `;
    if (!evento) throw new Error(`evento demo não encontrado: ${titulo}`);
    await sql`
      INSERT INTO educacional.credit_ledger
        (profile_id, delta, reason, note, ref, operation_key, event_id)
      VALUES (${profileId}, -1, 'event_debit',
              ${`Confirmação de presença em "${titulo}"`},
              ${`evento:${evento.id}`},
              ${`confirm:evt=${evento.id}:perfil=${profileId}:c=0`},
              ${evento.id})
      ON CONFLICT (operation_key) DO NOTHING
    `;
    return evento.id;
  });
}

/**
 * Expurgo do dado demo pela Management API (roda como DONO do banco).
 * O extrato e o diário de sombra são append-only: o trigger recusa UPDATE e
 * DELETE — é exatamente o mecanismo que este spec prova. Então: desliga os
 * gatilhos das duas tabelas, apaga SÓ as linhas destes eventos, RELIGA e aí
 * apaga os eventos.
 */
async function purgarDemoComoDono(ids: number[]): Promise<void> {
  const token = envLocal("SUPABASE_ACCESS_TOKEN");
  const central = envLocal("CENTRAL_SUPABASE_URL");
  if (!token || !central) {
    throw new Error(
      "SUPABASE_ACCESS_TOKEN/CENTRAL_SUPABASE_URL ausentes — sem eles o dado demo " +
        "não sai (extrato e diário são append-only). Limpe manualmente os eventos: " +
        ids.join(", "),
    );
  }
  const ref = new URL(central).hostname.split(".")[0];
  const lista = ids.join(", ");
  const query = `
    do $$
    declare ids int[] := array[${lista}]::int[];
    begin
      alter table educacional.credit_ledger     disable trigger user;
      alter table educacional.credit_shadow_log disable trigger user;
      delete from educacional.credit_ledger     where event_id = any(ids);
      delete from educacional.credit_shadow_log where event_id = any(ids);
      alter table educacional.credit_ledger     enable trigger user;
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

/** Ids dos eventos demo, guardados na criação para o expurgo do afterAll. */
const idsDemo: number[] = [];
/** Saldo do aluno antes do spec — tem de voltar idêntico no fim. */
let saldoAntes = 0;

test.beforeAll(async () => {
  saldoAntes = await comBanco(async (sql) => {
    const [row] = await sql<{ saldo: number }[]>`
      SELECT COALESCE(SUM(delta), 0)::int AS saldo
        FROM educacional.credit_ledger WHERE profile_id = ${ALUNO.id}
    `;
    return row?.saldo ?? 0;
  });
});

test.afterAll(async () => {
  const ids = await comBanco(async (sql) => {
    const linhas = await sql<{ id: number }[]>`
      SELECT id FROM educacional.mentorship_events WHERE title IN ${sql(TITULOS)}
    `;
    return [...new Set([...idsDemo, ...linhas.map((l) => l.id)])];
  });
  if (ids.length > 0) await purgarDemoComoDono(ids);

  // Confere que o banco voltou byte a byte: nada do demo sobrou, o saldo do
  // aluno é o de antes e os gatilhos append-only estão religados.
  const sobra = await comBanco(async (sql) => {
    const [row] = await sql<
      { eventos: number; extrato: number; sombra: number; gatilhos: number; saldo: number }[]
    >`
      SELECT (SELECT count(*) FROM educacional.mentorship_events
               WHERE id = ANY(${ids}))::int AS eventos,
             (SELECT count(*) FROM educacional.credit_ledger
               WHERE event_id = ANY(${ids}))::int AS extrato,
             (SELECT count(*) FROM educacional.credit_shadow_log
               WHERE event_id = ANY(${ids}))::int AS sombra,
             (SELECT count(*) FROM pg_trigger
               WHERE tgrelid IN ('educacional.credit_ledger'::regclass,
                                 'educacional.credit_shadow_log'::regclass)
                 AND NOT tgisinternal AND tgenabled = 'O')::int AS gatilhos,
             (SELECT COALESCE(SUM(delta), 0) FROM educacional.credit_ledger
               WHERE profile_id = ${ALUNO.id})::int AS saldo
    `;
    return row;
  });

  expect(sobra.eventos, "evento demo sobrou no banco").toBe(0);
  expect(sobra.extrato, "lançamento demo sobrou no extrato").toBe(0);
  expect(sobra.sombra, "registro demo sobrou no diário de sombra").toBe(0);
  expect(sobra.gatilhos, "gatilhos append-only não voltaram").toBe(4);
  expect(sobra.saldo, "saldo do aluno mudou").toBe(saldoAntes);
});

test("mentoria com extrato não se exclui — e a tela DIZ o porquê", async ({ context, page }) => {
  // ── Palco: dois eventos amanhã. Um cobra crédito, o outro é live aberta ──
  await loginAs(context, BASE, PERFIS.admin);
  await criarEvento(page, EVENTO_COM_EXTRATO, { cobraCredito: true });
  await criarEvento(page, EVENTO_CORRIDA, { cobraCredito: true });
  await criarEvento(page, EVENTO_SEM_EXTRATO, { cobraCredito: false });
  idsDemo.push(await semearDebito(EVENTO_COM_EXTRATO, ALUNO.id));

  // ── O Arkom cancela e estorna: nasce o estado EXATO do report ───────────
  await page.goto("/admin/mentorships");
  await pausa(page, 2000);
  await botaoCancelar(page, EVENTO_COM_EXTRATO).click();
  await pausa(page, 1800);
  await page.getByRole("button", { name: "Cancelar e estornar" }).click();
  await expect(page.getByText(/1 estorno\(s\) lançado\(s\)/).first()).toBeVisible();
  await pausa(page, 3000); // cancelada E estornada
  // A lista volta carimbada — é dela que sai o motivo da cena 1.
  await expect(linha(page, EVENTO_COM_EXTRATO).getByText("Cancelada pelo Arkom")).toBeVisible();
  await pausa(page, 2000);

  // ══ CENA 1 — o gesto do report: Excluir travado, com o motivo na tela ══
  const excluirBloqueado = botaoExcluir(page, EVENTO_COM_EXTRATO);
  await excluirBloqueado.scrollIntoViewIfNeeded();
  await expect(excluirBloqueado).toHaveAttribute("aria-disabled", "true");
  await excluirBloqueado.hover();
  await pausa(page, 1900);
  // `aria-disabled` (e não `disabled`): o clique ainda chega e o botão EXPLICA.
  await excluirBloqueado.click({ force: true });
  await expect(page.getByText("Esta mentoria não pode ser excluída")).toBeVisible();
  await expect(page.getByText(/extrato é histórico: não se apaga/)).toBeVisible();
  await expect(page.getByText(/permanece cancelada e fora do calendário/)).toBeVisible();
  // O que o bug produzia — some da tela para sempre.
  await expect(page.getByText("Tente novamente")).toHaveCount(0);
  await pausa(page, 3800); // MOMENTO-PROVA: a mensagem que a task pediu

  // ══ CENA 2 — quem decide é o SERVIDOR, não a tela ══════════════════════
  // A trava da lista é só o espelho. Aqui a tela está DESATUALIZADA de
  // propósito: a mentoria da corrida foi carregada sem extrato (botão
  // liberado) e ganha um débito por baixo, como se um aluno confirmasse
  // agora. O clique passa reto pela UI — e o servidor barra do mesmo jeito.
  const excluirCorrida = botaoExcluir(page, EVENTO_CORRIDA);
  await excluirCorrida.scrollIntoViewIfNeeded();
  await expect(excluirCorrida).not.toHaveAttribute("aria-disabled", "true");
  await pausa(page, 2300); // a tela ainda acha que dá pra excluir
  idsDemo.push(await semearDebito(EVENTO_CORRIDA, ALUNO.id));
  await excluirCorrida.click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  await pausa(page, 1800);
  await dialogo.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(page.getByText("Não foi possível excluir")).toBeVisible();
  await expect(page.getByText(/extrato é histórico: não se apaga/)).toBeVisible();
  await expect(page.getByText("Tente novamente")).toHaveCount(0);
  await pausa(page, 3600); // o corte é do SERVIDOR, não da UI
  // A mentoria continua lá — e a lista já se corrige sozinha: agora trava.
  await expect(page.getByText(EVENTO_CORRIDA).first()).toBeVisible();
  await expect(botaoExcluir(page, EVENTO_CORRIDA)).toHaveAttribute("aria-disabled", "true");
  await pausa(page, 2800);

  // ══ CENA 3 — sem lançamento nenhum, excluir funciona como sempre ═══════
  const excluirLiberado = botaoExcluir(page, EVENTO_SEM_EXTRATO);
  await excluirLiberado.scrollIntoViewIfNeeded();
  await expect(excluirLiberado).not.toHaveAttribute("aria-disabled", "true");
  await pausa(page, 1900);
  await excluirLiberado.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await pausa(page, 1800);
  await page.getByRole("dialog").getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(page.getByText("Mentoria excluída.")).toBeVisible();
  await expect(page.getByText(EVENTO_SEM_EXTRATO)).toHaveCount(0);
  await pausa(page, 3400); // a regra não é geral: só protege o que tem extrato

  // ══ CENA 4 — o histórico que a regra protege, intacto no extrato ═══════
  await page.goto("/admin/students");
  await pausa(page, 1800);
  await page
    .locator("tr", { hasText: ALUNO.email })
    .getByRole("link", { name: "Ver detalhe" })
    .click();
  await expect(page.getByText("Saldo de horas")).toBeVisible();
  await pausa(page, 2000);
  // O débito da confirmação e o estorno do cancelamento, lado a lado.
  const debito = page.getByText(`Confirmação de presença em "${EVENTO_COM_EXTRATO}"`).first();
  const estorno = page.getByText(`Cancelamento de "${EVENTO_COM_EXTRATO}" pelo Arkom`).first();
  await debito.scrollIntoViewIfNeeded();
  await expect(debito).toBeVisible();
  await expect(estorno).toBeVisible();
  await pausa(page, 3800); // é ISTO que não se apaga
});
