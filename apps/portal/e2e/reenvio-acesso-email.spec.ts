// e2e/reenvio-acesso-email.spec.ts — prova do report do dono (ClickUp 86ajrcy5c):
// em Membros, reenviar o e-mail de acesso devolvia "Não foi possível enviar o
// e-mail pelo Supabase." e o usuário ficava sem receber nada.
//
// Eram DUAS camadas:
//  1. o Supabase central estava SEM SMTP próprio (`smtp_host = null`) e caía no
//     mailer embutido, com teto de 2 e-mails por HORA (`rate_limit_email_sent`
//     = 2) — do 3º clique do dia em diante o envio batia em 429 e morria ali;
//  2. a tela descartava o motivo real: `sendAccessEmailAction` recebia o
//     `emailError` do servidor e o trocava por uma frase genérica, então quem
//     operava o admin não tinha o que fazer com o erro.
//
// Hoje o central envia pelo SMTP da Arkom (mail.arkom.ai, remetente
// noreply@arkom.ai, teto de 100/h) e, quando o servidor recusa, a tela DIZ o
// motivo — o corte continua sendo do servidor, a UI só passa a explicá-lo.
//
// Jornada: admin acha o membro → reenvia e o e-mail SAI → reenvia na sequência
// e o servidor barra pelo intervalo mínimo do MESMO endereço, com o motivo e o
// prazo na tela → reenvia para OUTRO membro na mesma hora e sai na hora →
// volta ao primeiro, passado o intervalo, e sai de novo. Os três envios em
// menos de dois minutos são a prova do teto derrubado: no mailer embutido, com
// `rate_limit_email_sent = 2`, o terceiro morria em 429 — que é exatamente o
// que o report descreve.
//
// Nada é criado nem apagado: o spec só reenvia acesso a membros que já existem,
// e reenviar acesso não troca a senha de ninguém.

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { PERFIS, educacionalUrl, loginAs } from "./helpers/arkom-session";

test.describe.configure({ mode: "serial" });

// E2E_CADENCIA=1 ⇒ take de VÍDEO (prova pra humano assistir): slowMo e pausas
// nos momentos-prova. Sem a env, regressão rápida — mesmas asserções nos dois
// modos.
const CADENCIA = process.env.E2E_CADENCIA === "1";
test.use({ launchOptions: { slowMo: CADENCIA ? 220 : 0 } });

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");

// Destinatário do reenvio. No take de vídeo aponta para uma caixa REAL (env),
// para o e-mail poder ser conferido na chegada; sem env, cai no aluno semeado.
const DESTINO = (process.env.E2E_EMAIL_REENVIO ?? "aluno@bilhon.ai").trim().toLowerCase();

// Segundo endereço, para provar que o teto POR PROJETO caiu (o intervalo que a
// cena 2 mostra é por endereço; o teto de 2/h do mailer embutido era do
// projeto inteiro e derrubava o envio seguinte, fosse pra quem fosse).
const SEGUNDO = (process.env.E2E_EMAIL_REENVIO_2 ?? "admin@bilhon.ai").trim().toLowerCase();

// `smtp_max_frequency` do projeto central: intervalo mínimo entre dois envios
// para o MESMO endereço. É o que a cena 2 provoca de propósito.
const INTERVALO_MIN_S = Number(process.env.E2E_SMTP_MIN_FREQ_S ?? 10);

/** Pausa de leitura — só no take de vídeo. */
async function pausa(page: Page, ms = 2000): Promise<void> {
  if (CADENCIA) await page.waitForTimeout(ms);
}

/** Os toasts do admin vivem 4s (src/components/ui/toast.tsx). No vídeo a pausa
 *  de leitura é dividida: o que sobra da vida do toast com a mensagem na tela,
 *  e um respiro depois — assim o espectador lê a frase inteira e nenhum corte
 *  cai no meio dela. */
async function lerToast(page: Page, respiroMs = 1200): Promise<void> {
  await pausa(page, 3300);
  await pausa(page, respiroMs);
}

/** O membro precisa existir e estar ativo: o reenvio é uma ação sobre conta
 *  viva (bloqueado o servidor recusa antes de tocar no e-mail). */
async function membroAtivo(email: string): Promise<{ id: number; nome: string }> {
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    const [row] = await sql<{ id: number; full_name: string }[]>`
      SELECT id, full_name FROM educacional.profiles
       WHERE lower(email) = lower(${email}) AND status = 'active' LIMIT 1
    `;
    if (!row) throw new Error(`sem perfil ativo para ${email} — ajuste E2E_EMAIL_REENVIO`);
    return { id: row.id, nome: row.full_name };
  } finally {
    await sql.end();
  }
}

/** Clica no envelope ("Enviar e-mail de boas-vindas") da linha do membro. */
async function reenviarAcesso(page: Page, email: string): Promise<void> {
  await page
    .locator("tr", { hasText: email })
    .locator('button[title="Enviar e-mail de boas-vindas"]')
    .click();
}

test.setTimeout(300_000);

test("reenvio do e-mail de acesso sai de verdade — e o motivo aparece quando o servidor recusa (ClickUp 86ajrcy5c)", async ({
  context,
  page,
}) => {
  const membro = await membroAtivo(DESTINO);
  await membroAtivo(SEGUNDO); // o segundo destinatário da cena 3 também precisa existir
  expect(SEGUNDO).not.toBe(DESTINO);

  // ── Palco · a tela do report: Membros, com o botão de reenviar acesso ─────
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Membros" })).toBeVisible();
  await pausa(page, 1800);

  const busca = page.getByRole("textbox", { name: "Buscar membros" });
  if (CADENCIA) await busca.pressSequentially(DESTINO, { delay: 60 });
  else await busca.fill(DESTINO);
  const linha = page.locator("tr", { hasText: DESTINO });
  await expect(linha).toHaveCount(1);
  await pausa(page, 2000); // o membro do report, sozinho na tela

  // O envelope é o gesto exato do report — o vídeo mostra QUAL botão, com o
  // título dele na tela, antes de clicar.
  const envelope = linha.locator('button[title="Enviar e-mail de boas-vindas"]');
  await envelope.hover();
  await pausa(page, 1800);

  // ── Cena 1 · O GESTO DO REPORT: o e-mail agora SAI ───────────────────────
  // Antes desta correção este clique devolvia "Não foi possível enviar o
  // e-mail pelo Supabase." — o mailer embutido já tinha estourado as 2/h.
  await reenviarAcesso(page, DESTINO);
  await expect(page.getByText("E-mail enviado pelo Supabase")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`Acesso enviado para ${DESTINO}.`)).toBeVisible();
  // Respiro curto de propósito: o segundo clique precisa cair com o intervalo
  // do servidor ainda cheio, senão a recusa da cena 2 anuncia "aguarde 1s" e
  // o bloqueio parece um detalhe — quando é ele o 429 do report.
  await lerToast(page, 300); // o envio que o report não conseguia

  // ── Cena 2 · MOMENTO-PROVA: o servidor recusa e a tela DIZ o porquê ──────
  // Dois envios seguidos para o mesmo endereço batem no intervalo mínimo do
  // projeto. É o mesmo 429 do report — a diferença é que agora ele chega
  // traduzido, com o prazo, em vez do beco sem saída genérico.
  await reenviarAcesso(page, DESTINO);
  const recusa = page.getByText(/Não foi possível enviar o e-mail de acesso:/);
  await expect(recusa).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/aguarde \d+s e tente de novo/i)).toBeVisible();
  // A frase que o dono viu no report não volta mais nesta tela.
  await expect(page.getByText("Não foi possível enviar o e-mail pelo Supabase.")).toHaveCount(0);
  await lerToast(page, 2600); // pausa mais longa do vídeo: o motivo, na tela

  // ── Cena 3 · o teto do projeto caiu: OUTRO membro, mesma hora, sai na hora ─
  // O intervalo da cena 2 é por endereço. O que matava o report era outro
  // limite — o teto de 2 e-mails por HORA do projeto inteiro, do mailer
  // embutido. Este é o SEGUNDO envio em menos de um minuto, para outro
  // destinatário: no mailer antigo já era o último que passaria.
  await busca.fill("");
  if (CADENCIA) await busca.pressSequentially(SEGUNDO, { delay: 60 });
  else await busca.fill(SEGUNDO);
  await expect(page.locator("tr", { hasText: SEGUNDO })).toHaveCount(1);
  await pausa(page, 1600);
  await reenviarAcesso(page, SEGUNDO);
  await expect(page.getByText(`Acesso enviado para ${SEGUNDO}.`)).toBeVisible({ timeout: 30_000 });
  await lerToast(page, 1500);

  // ── Cena 4 · o prazo era verdade: passado o intervalo, o primeiro volta ───
  // TERCEIRO envio em menos de dois minutos — o que o teto de 2/h do mailer
  // embutido não deixava acontecer de jeito nenhum.
  await busca.fill("");
  if (CADENCIA) await busca.pressSequentially(DESTINO, { delay: 60 });
  else await busca.fill(DESTINO);
  await expect(page.locator("tr", { hasText: DESTINO })).toHaveCount(1);
  await page.waitForTimeout((INTERVALO_MIN_S + 2) * 1000);
  await reenviarAcesso(page, DESTINO);
  await expect(page.getByText("E-mail enviado pelo Supabase")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`Acesso enviado para ${DESTINO}.`)).toBeVisible();
  await lerToast(page, 2400); // caminho certo funcionando, sem sair da tela

  // O membro segue exatamente como estava: reenviar acesso não altera conta.
  const depois = await membroAtivo(DESTINO);
  expect(depois.id).toBe(membro.id);
});
