// e2e/credit-system-v2.spec.ts — SUÍTE COMPLETA gravada (vídeo+trace por
// cenário): a matriz de estados inteira do sistema de horas, como o dono
// testaria. 29 cenários em 7 blocos:
//
//  A · CONTAS & PLANOS
//   S01 admin loga (câmera) e cria Aluno Básico JÁ com plano → 8h no extrato
//   S02 cria Aluno Tração (24h/mês)   S03 cria Enterprise (∞, sem lançamento)
//   S04 cria Aluno Sem Plano (ficha zerada; senha temporária fica NA TELA)
//   S05 PRIMEIRO ACESSO real: senha temporária → troca obrigatória → home
//   S06 CRUD de plano: criar 5h/mês → EDITAR p/ 10h → excluir (tabela limpa)
//  B · CONSUMO — todos os estados
//   S07 Básico: 8h/8h → 2h → 6h/8h → 1h → 5h/8h → estorno → 6h/8h
//   S08 Tração: live da comunidade não move o contador
//   S09 fora da janela: mentoria que JÁ COMEÇOU — desconfirmar NÃO estorna
//   S10 Enterprise: Ilimitado, confirma sem débito
//   S11 Sem Plano: clique recusado ("não inclui mentorias ao vivo")
//   S12 edição de usuário cria um plano de 3h e o atribui ao Sem Plano
//   S13 esgotar: 1h/3h → 2h RECUSADA → 0h/3h vermelho → tenta com ZERO → recusada
//   S14 vencido: LOGA (conta não cai) → mentoria barrada → concluir AULA
//       barrado → catálogo continua (X1/X3)
//  C · EVENTOS & CANCELAMENTO PELO ARKOM (E3)
//   S15 admin cria mentoria (custo VAZIO = duração 2h) → aluno vê "Usa 2h"
//   S16 aluno confirma a demo → admin CANCELA PELO ARKOM → estorno automático
//   S17 admin exclui o evento demo
//  D · ADMIN & RELATÓRIOS
//   S18 concessão manual +1h com motivo (extrato auditado)
//   S19 prazos +20/+50/+80 nas fichas → relatório 30/60/90 + vencido + CSV
//   S20 bloqueio: login RECUSADO na tela → desbloqueio
//   S21 flag entitlements OFF (aluno sem contador) → ON (volta) — sem deploy
//   S22 MODO SOMBRA: bloqueio OFF → aluno com 0h confirma SEM barrar/debitar
//   S23 extratos: as fichas contam a história inteira
//  E · MENTORES
//   S24 CRUD total: criar→editar→reordenar→despublicar→republicar→vincular→excluir
//   S25 aluno: perfil de CADA mentor + capa com 2 + X volta pra capa
//   S26 lista de presença: vários confirmados, presente/ausente
//  F · CURSOS
//   S27 aluno: Top 5 dinâmico, grade, hover, em-breve inerte
//   S28 admin muda a vitrine e o aluno VÊ (e o restauro)
//  G · S29 limpeza na câmera + login de conta EXCLUÍDA recusado
//
// Regravável: e-mails com sufixo por gravação; teardown remove confirmações/
// presenças dos descartáveis; plano/evento demo são excluídos na própria
// jornada; planos/mentores reais não são tocados.

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import {
  PERFIS,
  definirSenhaDoAluno,
  educacionalUrl,
  loginAs,
} from "./helpers/arkom-session";

test.describe.configure({ mode: "serial" });

// Pré-limpeza da rodada: eventos que rodadas ANTERIORES criaram ("Em Andamento
// E2E", "Mentoria Demo E2E") empurram os eventos reais para fora da lista de
// próximos encontros e quebram os cenários de consumo (aconteceu no S10).
// Despublicar basta — sai do calendário do aluno sem tocar no ledger
// (deletar dispararia o SET NULL do extrato, que o gatilho append-only barra).
test.beforeAll(async () => {
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  await sql`UPDATE educacional.mentorship_events SET status = 'draft'
             WHERE (title LIKE 'Em Andamento E2E %' OR title LIKE 'Mentoria Demo E2E %')
               AND title NOT LIKE ${`%${SUF}`}`;
  await sql.end();
});
test.use({ launchOptions: { slowMo: 350 } });

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_SENHA = process.env.E2E_ADMIN_PASSWORD ?? "";
const SENHA_ALUNOS = process.env.E2E_PASSWORD ?? "ArkomTeste2026!";

// Um sufixo por GRAVAÇÃO: e-mails novos a cada rodada da suíte. Passe E2E_SUF
// para RETOMAR uma gravação interrompida com os mesmos alunos.
const SUF = process.env.E2E_SUF ?? Math.random().toString(36).slice(2, 7);
const ALUNOS = {
  basico: { nome: "Aluno Básico E2E", email: `basico.${SUF}@bilhon.ai`, plano: "Básico" },
  tracao: { nome: "Aluno Tração E2E", email: `tracao.${SUF}@bilhon.ai`, plano: "Tração" },
  enterprise: { nome: "Aluno Enterprise E2E", email: `enterprise.${SUF}@bilhon.ai`, plano: "Enterprise" },
  semplano: { nome: "Aluno Sem Plano E2E", email: `semplano.${SUF}@bilhon.ai`, plano: null as string | null },
};
// Capturada do toast na criação do Aluno Sem Plano; usada no 1º acesso (S05).
let senhaTemporariaSemPlano = "";

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

async function irParaMentorias(page: Page): Promise<void> {
  await page.goto("/mentorships");
  await expect(page.getByRole("heading", { name: "Mentorias", exact: true })).toBeVisible();
  await respirar(page, 1800);
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

async function criarAlunoComPlano(
  page: Page,
  aluno: { nome: string; email: string; plano: string | null },
): Promise<void> {
  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Membros" })).toBeVisible();
  await respirar(page, 1500);
  await page.getByRole("button", { name: "Novo usuário" }).click();
  await page.getByRole("textbox", { name: "Nome completo" }).fill(aluno.nome);
  await page.getByRole("textbox", { name: "E-mail" }).fill(aluno.email);
  if (aluno.plano) {
    await page.locator("#al-plano").selectOption({ label: aluno.plano });
  }
  await respirar(page, 1500);
  await page.getByRole("button", { name: "Criar usuário" }).click();
  await expect(page.getByText(aluno.email).first()).toBeVisible({ timeout: 30_000 });
  await respirar(page, 2000);
}

async function abrirFicha(page: Page, email: string): Promise<void> {
  await page.goto("/admin/students");
  await page.locator("tr", { hasText: email }).getByRole("link", { name: "Ver detalhe" }).click();
  await expect(page.getByText("Saldo de horas")).toBeVisible();
  await respirar(page, 2200);
}

// ═══════════════════════ BLOCO A · CONTAS & PLANOS ═════════════════════════

test("S01 · admin loga e cria o Aluno Básico JÁ com o plano — 8h/mês entram no extrato", async ({ page }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_SENHA, "credenciais E2E de admin ausentes");
  await loginNoFormulario(page, ADMIN_EMAIL, ADMIN_SENHA);
  await criarAlunoComPlano(page, ALUNOS.basico);
  await abrirFicha(page, ALUNOS.basico.email);
  await expect(page.getByText("Básico").first()).toBeVisible();
  await expect(page.getByText(/8h por mês/).first()).toBeVisible();
  await expect(page.getByText("Horas do plano").first()).toBeVisible();
  await respirar(page, 2500);
  await definirSenhaDoAluno(ALUNOS.basico.email, SENHA_ALUNOS); // setup fora de vídeo
});

test("S02 · cria o Aluno Tração com o plano no cadastro — 24h/mês", async ({ context, page }) => {
  await loginAs(context, BASE, PERFIS.admin);
  await criarAlunoComPlano(page, ALUNOS.tracao);
  await abrirFicha(page, ALUNOS.tracao.email);
  await expect(page.getByText("Tração").first()).toBeVisible();
  await expect(page.getByText(/24h por mês/).first()).toBeVisible();
  await respirar(page, 2200);
  await definirSenhaDoAluno(ALUNOS.tracao.email, SENHA_ALUNOS);
});

test("S03 · cria o Aluno Enterprise — ilimitadas, e o extrato NÃO ganha lançamento", async ({ context, page }) => {
  await loginAs(context, BASE, PERFIS.admin);
  await criarAlunoComPlano(page, ALUNOS.enterprise);
  await abrirFicha(page, ALUNOS.enterprise.email);
  await expect(page.getByText("Enterprise").first()).toBeVisible();
  await expect(page.getByText(/Ilimitadas/).first()).toBeVisible();
  await expect(page.getByText("Nenhum lançamento de horas para este aluno.")).toBeVisible();
  await respirar(page, 2200);
  await definirSenhaDoAluno(ALUNOS.enterprise.email, SENHA_ALUNOS);
});

test("S04 · cria o Aluno Sem Plano — ficha zerada e senha temporária NA TELA", async ({ context, page }) => {
  await loginAs(context, BASE, PERFIS.admin);
  await criarAlunoComPlano(page, ALUNOS.semplano);
  // A senha temporária fica num MODAL persistente (não some sozinha) — o
  // vídeo mostra, o admin copia, e o S05 usa.
  const campoSenha = page.getByTestId("senha-temporaria");
  if (await campoSenha.isVisible().catch(() => false)) {
    senhaTemporariaSemPlano = ((await campoSenha.textContent()) ?? "").trim();
    await respirar(page, 2500);
    await page.getByRole("button", { name: "Concluir" }).click();
  }
  await abrirFicha(page, ALUNOS.semplano.email);
  await expect(page.getByText(/Sem plano ativo/).first()).toBeVisible();
  await respirar(page, 2200);
});

test("S05 · PRIMEIRO ACESSO: senha temporária → troca obrigatória de senha → home", async ({ page }) => {
  test.skip(!senhaTemporariaSemPlano, "senha temporária não capturada no S04");
  await page.goto("/login");
  await respirar(page, 1000);
  await page.getByRole("textbox", { name: "E-mail" }).fill(ALUNOS.semplano.email);
  await page.getByRole("textbox", { name: "Senha" }).fill(senhaTemporariaSemPlano);
  await respirar(page, 800);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Primeiro acesso força a troca de senha antes de qualquer outra tela.
  await page.waitForURL(/settings.*primeiro-acesso|\/settings/);
  await respirar(page, 2200);
  await page.locator('input[name="current_password"]').fill(senhaTemporariaSemPlano);
  await page.locator('input[name="new_password"]').fill(SENHA_ALUNOS);
  await page.locator('input[name="confirm_password"]').fill(SENHA_ALUNOS);
  await respirar(page, 1200);
  await page
    .getByRole("button", { name: /Salvar|Definir|Atualizar|Trocar/ })
    .first()
    .click();
  await respirar(page, 2500);
  // Prova: sem o primeiro-acesso pendente, /home abre sem redirecionar.
  await page.goto("/home");
  await expect(page).toHaveURL(/\/home/);
  await respirar(page, 2000); // senha trocada — a conta está pronta
  // Cinto de segurança fora de vídeo: garante a senha conhecida mesmo se a
  // troca visual falhar em regravações.
  await definirSenhaDoAluno(ALUNOS.semplano.email, SENHA_ALUNOS);
});

test("S06 · CRUD de plano: criar 5h/mês → EDITAR para 10h/mês → excluir (tabela limpa)", async ({ context, page }) => {
  // Regravável: sobras antigas de demos são arquivadas (liberam o slug).
  {
    const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
    await sql`UPDATE educacional.plans
                 SET slug = slug || '-' || id, name = name || ' (arquivado)', status = 'draft'
               WHERE name = 'Plano Demo E2E'`;
    await sql.end();
  }
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/plans");
  await expect(page.getByRole("heading", { name: "Planos" })).toBeVisible();
  await respirar(page, 1800);

  await page.getByRole("button", { name: "Novo plano" }).click();
  await respirar(page, 1000);
  await page.getByRole("textbox", { name: "Nome *" }).fill("Plano Demo E2E");
  await page.getByRole("spinbutton", { name: "Duração (meses)" }).fill("12");
  await page.getByRole("spinbutton", { name: "Horas de mentoria" }).fill("5");
  await page.getByLabel("Cota vale").selectOption({ label: "Por mês" });
  await page.getByRole("checkbox", { name: "Claude Code" }).setChecked(true);
  await page.getByLabel("Status").selectOption({ label: "Publicado" });
  await respirar(page, 1500);
  await page.getByRole("button", { name: "Criar plano" }).click();
  await expect(page.getByText("5h por mês").first()).toBeVisible();
  await respirar(page, 2200);

  // EDITAR: 5h → 10h por mês.
  await page.getByRole("button", { name: "Editar Plano Demo E2E", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Horas de mentoria" }).fill("10");
  await respirar(page, 1200);
  await page.getByRole("button", { name: /Salvar/ }).click();
  await expect(page.getByText("10h por mês").first()).toBeVisible();
  await respirar(page, 2200);

  // EXCLUIR: sem aluno vinculado, sai limpo.
  await page.getByRole("button", { name: "Excluir Plano Demo E2E", exact: true }).click();
  await respirar(page, 1000);
  const conf = page.getByRole("dialog").getByRole("button", { name: /Excluir/ }).last();
  if (await conf.isVisible().catch(() => false)) await conf.click();
  await expect(page.getByRole("button", { name: "Excluir Plano Demo E2E", exact: true })).toHaveCount(0);
  await respirar(page, 1800);
});

// ══════════════════════ BLOCO B · CONSUMO POR PLANO ════════════════════════

test("S07 · Aluno Básico consome: 8h/8h → 2h → 6h/8h → 1h → 5h/8h → estorno → 6h/8h", async ({ page }) => {
  await loginNoFormulario(page, ALUNOS.basico.email, SENHA_ALUNOS);
  await irParaMentorias(page);
  await expect(contador(page)).toContainText("8h/8h");
  await respirar(page, 1800);

  await abrirEvento(page, /29 JUL Mentoria/); // 2h
  await expect(page.getByText("Usa 2h do seu plano")).toBeVisible();
  await page.getByTestId("confirm-presence").click();
  await expect(page.getByText("Presença confirmada").first()).toBeVisible();
  await respirar(page, 1800);
  await fecharModal(page);
  await expect(contador(page)).toContainText("6h/8h");
  await respirar(page, 1800);

  await abrirEvento(page, /28 JUL Mentoria/); // 1h (20h–21h)
  await expect(page.getByText("Usa 1h do seu plano")).toBeVisible();
  await page.getByTestId("confirm-presence").click();
  await respirar(page, 1500);
  await fecharModal(page);
  await expect(contador(page)).toContainText("5h/8h");
  await respirar(page, 1800);

  await abrirEvento(page, /28 JUL Mentoria/); // desfaz antes do início → estorno
  await page.getByTestId("confirm-presence").click();
  await respirar(page, 1500);
  await fecharModal(page);
  await expect(contador(page)).toContainText("6h/8h");
  await respirar(page, 2200);
});

test("S08 · Aluno Tração: live da comunidade confirma sem mover o contador", async ({ page }) => {
  await loginNoFormulario(page, ALUNOS.tracao.email, SENHA_ALUNOS);
  await irParaMentorias(page);
  await expect(contador(page)).toContainText("24h/24h");
  await respirar(page, 1800);

  await abrirEvento(page, /27 JUL Raio X/);
  await expect(page.getByText("Não consome horas do plano")).toBeVisible();
  await page.getByTestId("confirm-presence").click();
  await expect(page.getByText("Presença confirmada").first()).toBeVisible();
  await respirar(page, 1800);
  await fecharModal(page);
  await expect(contador(page)).toContainText("24h/24h");
  await respirar(page, 2000);

  await abrirEvento(page, /27 JUL Raio X/); // desfaz — sem rastro
  await page.getByTestId("confirm-presence").click();
  await fecharModal(page);
});

test("S09 · encerrada CONGELA (sem confirmar/acessar) — e em andamento (E1): desconfirmar NÃO devolve as horas", async ({ context, page }) => {
  // Parte 1 — mentoria que JÁ PASSOU (16/07): a capa vira memória (regra do
  // dono, 2026-07-27): sem botão de presença, sem link de acesso, contador
  // parado. O corte é o fim do horário do evento (GMT-3).
  await loginNoFormulario(page, ALUNOS.tracao.email, SENHA_ALUNOS);
  await irParaMentorias(page);
  await expect(contador(page)).toContainText("24h/24h");
  await respirar(page, 1500);

  await page.locator('button[title="14h00 – 16h00 Mentoria Implementação"]').first().click();
  await expect(page.getByTestId("event-modal")).toBeVisible();
  await respirar(page, 1800);
  await expect(page.getByTestId("event-ended")).toContainText("Mentoria encerrada");
  await expect(page.getByTestId("confirm-presence")).toHaveCount(0);
  await expect(page.getByTestId("access-mentoria")).toHaveCount(0);
  await expect(page.getByText(/já aconteceu/).first()).toBeVisible();
  await respirar(page, 2800); // capa encerrada: chip no rodapé + banner explicando
  await fecharModal(page);
  await expect(contador(page)).toContainText("24h/24h"); // nada debitado
  await respirar(page, 1500);

  // Parte 2 — mentoria EM ANDAMENTO (começou há 1h, termina daqui a 2h):
  // confirmar AINDA pode (o corte é o fim, não o início) e debita; mas
  // desconfirmar depois do início NÃO estorna (E1) — o aviso explica na tela.
  // O admin cria o evento com o relógio da rodada (datas/horas em GMT-3).
  await context.clearCookies();
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/mentorships");
  const brt = (mins: number) =>
    new Date(Date.now() - 3 * 3_600_000 + mins * 60_000).toISOString();
  await page.getByRole("button", { name: /Nova mentoria|Novo evento|Criar/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await respirar(page, 1200);
  await page.getByRole("textbox", { name: /Título|Nome/ }).first().fill(`Em Andamento E2E ${SUF}`);
  await page.locator('input[type="date"]').first().fill(brt(0).slice(0, 10));
  await page.locator('input[type="time"]').first().fill(brt(-60).slice(11, 16));
  await page.locator('input[type="time"]').nth(1).fill(brt(120).slice(11, 16));
  await page.locator("#mentoria-kind").selectOption({ value: "mentoria_arkom" });
  await page.locator("#mentoria-credit-cost").fill("2");
  const statusAndamento = page.locator('select[name="status"]').last();
  if (await statusAndamento.isVisible().catch(() => false)) {
    await statusAndamento.selectOption({ value: "published" }).catch(() => {});
  }
  await respirar(page, 1500);
  await page.getByRole("button", { name: /Criar mentoria|Salvar/ }).click();
  await expect(page.getByText(`Em Andamento E2E ${SUF}`).first()).toBeVisible();
  await respirar(page, 2000);

  await context.clearCookies();
  await loginNoFormulario(page, ALUNOS.tracao.email, SENHA_ALUNOS);
  await irParaMentorias(page);
  await abrirEvento(page, new RegExp(`Em Andamento E2E ${SUF}`));
  await page.getByTestId("confirm-presence").click();
  await respirar(page, 1500);
  await fecharModal(page);
  await expect(contador(page)).toContainText("22h/24h"); // debitou 2h em pleno evento
  await respirar(page, 1800);

  await abrirEvento(page, new RegExp(`Em Andamento E2E ${SUF}`));
  await page.getByTestId("confirm-presence").click();
  await expect(page.getByText(/o crédito não volta|antes de a mentoria começar/).first()).toBeVisible();
  await respirar(page, 3200); // aviso de estorno negado em tela
  await fecharModal(page);
  await expect(contador(page)).toContainText("22h/24h"); // E1: as 2h ficaram consumidas
  await respirar(page, 2200);

  // O evento em andamento cumpriu o papel (débito + estorno negado provados no
  // extrato). Sai do ar: a lista de próximos encontros do aluno mostra só 6
  // itens, e uma vaga a menos empurraria o "31 JUL Demo" do S15 para fora.
  {
    const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
    await sql`UPDATE educacional.mentorship_events SET status = 'draft'
               WHERE title = ${`Em Andamento E2E ${SUF}`}`;
    await sql.end();
  }
});

test("S10 · Aluno Enterprise: Ilimitado — mentoria confirma sem débito nenhum", async ({ page }) => {
  await loginNoFormulario(page, ALUNOS.enterprise.email, SENHA_ALUNOS);
  await irParaMentorias(page);
  await expect(contador(page)).toContainText("Ilimitado");
  await respirar(page, 1800);

  await abrirEvento(page, /30 JUL Mentoria/);
  await expect(page.getByText("horas de mentoria ilimitadas")).toBeVisible();
  await page.getByTestId("confirm-presence").click();
  await expect(page.getByText("Presença confirmada").first()).toBeVisible();
  await respirar(page, 1800);
  await fecharModal(page);
  await expect(contador(page)).toContainText("Ilimitado");
  await respirar(page, 1800);

  await abrirEvento(page, /30 JUL Mentoria/);
  await page.getByTestId("confirm-presence").click();
  await fecharModal(page);
});

test("S11 · Aluno Sem Plano: clique recusado — 'Seu plano não inclui mentorias ao vivo'", async ({ page }) => {
  await loginNoFormulario(page, ALUNOS.semplano.email, SENHA_ALUNOS);
  await irParaMentorias(page);
  await abrirEvento(page, /29 JUL Mentoria/);
  await page.getByTestId("confirm-presence").click();
  await expect(page.getByText(/não inclui mentorias ao vivo/).first()).toBeVisible();
  await respirar(page, 3000);
  await fecharModal(page);
});

test("S12 · edição de usuário atribui um plano de 3h ao Aluno Sem Plano", async ({ context, page }) => {
  await loginAs(context, BASE, PERFIS.admin);

  // A suíte é autossuficiente: cria o próprio plano de 3h (o catálogo real só
  // tem Legado/Básico/Tração/Enterprise — nada de depender de plano de teste
  // pré-existente no banco).
  const planoTeste = `Plano Teste E2E ${SUF}`;
  await page.goto("/admin/plans");
  await expect(page.getByRole("heading", { name: "Planos" })).toBeVisible();
  await respirar(page, 1500);
  await page.getByRole("button", { name: "Novo plano" }).click();
  await respirar(page, 1000);
  await page.getByRole("textbox", { name: "Nome *" }).fill(planoTeste);
  await page.getByRole("spinbutton", { name: "Duração (meses)" }).fill("12");
  await page.getByRole("spinbutton", { name: "Horas de mentoria" }).fill("3");
  await page.getByLabel("Cota vale").selectOption({ value: "total" });
  await page.getByLabel("Status").selectOption({ label: "Publicado" });
  await respirar(page, 1500);
  await page.getByRole("button", { name: "Criar plano" }).click();
  await expect(page.getByText("3h no total").first()).toBeVisible();
  await respirar(page, 2000);

  await page.goto("/admin/students");
  await page.locator("tr", { hasText: ALUNOS.semplano.email }).getByRole("button", { name: "Editar" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await respirar(page, 1800);
  await page.locator("#al-plano").selectOption({ label: planoTeste });
  await respirar(page, 1200);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText(/Usuário atualizado/).first()).toBeVisible();
  await respirar(page, 1500);
  await abrirFicha(page, ALUNOS.semplano.email);
  await expect(page.getByText(planoTeste).first()).toBeVisible();
  await expect(page.getByText(/3h no total/).first()).toBeVisible();
  await respirar(page, 2500);
});

test("S13 · esgotar o saldo: 1h/3h → 2h RECUSADA → 0h/3h no vermelho → tentar com ZERO → recusada", async ({ page }) => {
  await loginNoFormulario(page, ALUNOS.semplano.email, SENHA_ALUNOS);
  await irParaMentorias(page);
  await expect(contador(page)).toContainText("3h/3h");
  await respirar(page, 1800);

  await abrirEvento(page, /29 JUL Mentoria/); // 2h
  await page.getByTestId("confirm-presence").click();
  await respirar(page, 1500);
  await fecharModal(page);
  await expect(contador(page)).toContainText("1h/3h");
  await respirar(page, 1800);

  // 2h com 1h de saldo: aviso ANTES + clique RECUSADO. Saldo PARCIAL fala em
  // custo × saldo — "acabaram" é só pro zerado (achado do dono, 2026-07-28).
  await abrirEvento(page, /30 JUL Mentoria/);
  await expect(
    page.getByText("Você não tem horas suficientes para confirmar esta mentoria."),
  ).toBeVisible();
  await respirar(page, 2000);
  await page.getByTestId("confirm-presence").click();
  await expect(page.getByText(/usa 2h e você tem 1h de saldo/).first()).toBeVisible();
  await respirar(page, 2800);
  await fecharModal(page);

  // A última 1h cabe: o contador ZERA e fica vermelho.
  await abrirEvento(page, /28 JUL Mentoria/); // 1h
  await page.getByTestId("confirm-presence").click();
  await respirar(page, 1500);
  await fecharModal(page);
  await expect(contador(page)).toContainText("0h/3h");
  await respirar(page, 2200);

  // TENTAR COM SALDO ZERO: qualquer mentoria é recusada.
  await abrirEvento(page, /29 JUL Raio-X|31 JUL|30 JUL Mentoria/);
  await expect(
    page.getByText("Você não tem horas suficientes para confirmar esta mentoria."),
  ).toBeVisible();
  await respirar(page, 1800);
  await page.getByTestId("confirm-presence").click();
  await expect(page.getByText(/horas de mentoria acabaram/).first()).toBeVisible();
  await respirar(page, 3000); // zero = recusado, sempre
  await fecharModal(page);
});

test("S14 · vencido: LOGA normalmente, mentoria barrada, concluir AULA barrado, catálogo continua", async ({ page }) => {
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  await sql`
    UPDATE educacional.profile_entitlements e
       SET expires_at = now() - interval '1 day'
      FROM educacional.profiles p
     WHERE p.id = e.profile_id AND p.email = ${ALUNOS.basico.email}
       AND e.kind = 'temporal' AND e.status = 'active'`;
  await sql.end();

  await loginNoFormulario(page, ALUNOS.basico.email, SENHA_ALUNOS); // vencer ≠ derrubar conta
  await irParaMentorias(page);
  await abrirEvento(page, /30 JUL Mentoria/);
  await page.getByTestId("confirm-presence").click();
  await expect(page.getByText(/acesso está vencido/).first()).toBeVisible();
  await respirar(page, 3000);
  await fecharModal(page);

  // X1/X3: catálogo e aula ABREM; o que é barrado é CONSUMIR (concluir aula).
  await page.goto("/trainings");
  await expect(page.getByRole("heading", { name: "Todos os cursos" })).toBeVisible();
  await respirar(page, 2200);
  await page.locator("section", { hasText: "Top 5 cursos" }).first().getByRole("link").first().click();
  await respirar(page, 2200); // página do curso abre normalmente
  const primeiraAula = page.getByRole("link", { name: /Aula|aula/ }).first();
  if (await primeiraAula.isVisible().catch(() => false)) {
    await primeiraAula.click();
    await respirar(page, 2200);
    const concluir = page.getByRole("button", { name: /Concluir|concluída/ }).first();
    if (await concluir.isVisible().catch(() => false)) {
      await concluir.click();
      await expect(page.getByText(/vencido|renova/i).first()).toBeVisible();
      await respirar(page, 3000); // consumo de aula barrado com mensagem
    }
  }
});

// ═══════════ BLOCO C · EVENTOS & CANCELAMENTO PELO ARKOM (E3) ══════════════

test("S15 · admin cria uma mentoria (custo vazio = DURAÇÃO) e o aluno a vê custando 2h", async ({ context, page }) => {
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/mentorships");
  await page.getByRole("button", { name: /Nova mentoria|Novo evento|Criar/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await respirar(page, 1500);
  await page.getByRole("textbox", { name: /Título|Nome/ }).first().fill(`Mentoria Demo E2E ${SUF}`);
  await page.locator('input[type="date"]').first().fill("2026-07-31");
  await page.locator('input[type="time"]').first().fill("14:00");
  await page.locator('input[type="time"]').nth(1).fill("16:00");
  await page.locator("#mentoria-kind").selectOption({ value: "mentoria_arkom" });
  // Custo em horas fica VAZIO de propósito: o produto usa a duração (2h).
  await page.locator("#mentoria-credit-cost").fill("");
  const status = page.locator('select[name="status"]').last();
  if (await status.isVisible().catch(() => false)) {
    await status.selectOption({ value: "published" }).catch(() => {});
  }
  await respirar(page, 1800);
  await page.getByRole("button", { name: /Criar mentoria|Salvar/ }).click();
  await expect(page.getByText(`Mentoria Demo E2E ${SUF}`).first()).toBeVisible();
  await expect(page.locator("tr", { hasText: `Mentoria Demo E2E ${SUF}` }).getByText("2h")).toBeVisible();
  await respirar(page, 2500); // custo automático = 2h na listagem

  // O aluno vê o evento novo custando 2h.
  await context.clearCookies();
  await loginNoFormulario(page, ALUNOS.tracao.email, SENHA_ALUNOS);
  await irParaMentorias(page);
  await abrirEvento(page, new RegExp(`31 JUL Mentoria Demo E2E ${SUF}`));
  await expect(page.getByText("Usa 2h do seu plano")).toBeVisible();
  await respirar(page, 2500);
  await fecharModal(page);
});

test("S16 · cancelamento pelo Arkom (E3): aluno confirmado recebe o ESTORNO automático", async ({ context, page }) => {
  // Aluno confirma a demo (22h → 20h)… (idempotente em regravações: se a
  // presença já está confirmada de uma tentativa anterior, segue direto)
  await loginNoFormulario(page, ALUNOS.tracao.email, SENHA_ALUNOS);
  await irParaMentorias(page);
  await abrirEvento(page, new RegExp(`31 JUL Mentoria Demo E2E ${SUF}`));
  const botaoPresenca = page.getByTestId("confirm-presence");
  if (((await botaoPresenca.textContent()) ?? "").includes("Confirmar presença")) {
    await botaoPresenca.click();
    await respirar(page, 1500);
  }
  await fecharModal(page);
  await expect(contador(page)).toContainText("20h/24h");
  await respirar(page, 2000);

  // …o Arkom CANCELA o evento…
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/mentorships");
  const linha = page.locator("tr", { hasText: `Mentoria Demo E2E ${SUF}` });
  await linha.locator('button[title*="Cancelar"]').click();
  await respirar(page, 1200);
  const conf = page.getByRole("dialog").getByRole("button", { name: "Cancelar e estornar" });
  await conf.click();
  await expect(page.getByText(/cancelada/i).first()).toBeVisible();
  await respirar(page, 2500); // cancelado: estorno em massa disparado

  // …e o aluno reabre a agenda com as horas DE VOLTA.
  await context.clearCookies();
  await loginNoFormulario(page, ALUNOS.tracao.email, SENHA_ALUNOS);
  await irParaMentorias(page);
  await expect(contador(page)).toContainText("22h/24h");
  await respirar(page, 2800); // estorno automático confirmado no contador
});

test("S17 · o evento cancelado vira RASCUNHO e não pode ser excluído (o extrato o referencia)", async ({ context, page }) => {
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/mentorships");
  const linha = page.locator("tr", { hasText: `Mentoria Demo E2E ${SUF}` });
  // Cancelado pelo Arkom = fora do calendário do aluno (rascunho).
  await expect(linha.getByText(/Rascunho|rascunho/).first()).toBeVisible();
  await respirar(page, 2200);
  // Excluir é RECUSADO: débito e estorno no extrato apontam para este evento —
  // histórico financeiro não se apaga (mesma doutrina do plano com histórico).
  await linha.getByRole("button", { name: /Excluir/ }).click();
  await respirar(page, 1200);
  const conf = page.getByRole("dialog").getByRole("button", { name: /Excluir/ }).last();
  if (await conf.isVisible().catch(() => false)) await conf.click();
  await expect(page.getByText(/Não foi possível excluir|Erro ao excluir/i).first()).toBeVisible();
  await respirar(page, 3000); // a proteção explicada em tela
  await expect(page.getByText(`Mentoria Demo E2E ${SUF}`).first()).toBeVisible(); // segue lá
  await respirar(page, 1500);
});

// ═════════════════════ BLOCO D · ADMIN & RELATÓRIOS ════════════════════════

test("S18 · concessão manual: +1h com motivo — o extrato audita autor e horário", async ({ context, page }) => {
  await loginAs(context, BASE, PERFIS.admin);
  await abrirFicha(page, ALUNOS.semplano.email); // está com 0h de 3h
  await page.getByRole("button", { name: "Ajustar horas" }).click();
  const ajuste = page.getByRole("dialog");
  await ajuste.getByLabel(/Operação/).selectOption({ label: "Adicionar horas" });
  await ajuste.getByRole("spinbutton").first().fill("1");
  await ajuste.getByRole("textbox", { name: /Motivo/ }).fill("Cortesia — cliente pediu uma hora extra (jornada E2E).");
  await respirar(page, 1500);
  await ajuste.getByRole("button", { name: /Adicionar horas/ }).click();
  await expect(page.getByText(/Horas ajustadas/).first()).toBeVisible();
  await respirar(page, 3000); // extrato: grant do plano, débitos e a cortesia
});

test("S19 · prazos definidos NAS FICHAS (+20/+50/+80 dias) → relatório 30/60/90 + CSV", async ({ context, page }) => {
  await loginAs(context, BASE, PERFIS.admin);

  const prazos: Array<[string, number]> = [
    [ALUNOS.tracao.email, 20],
    [ALUNOS.enterprise.email, 50],
    [ALUNOS.semplano.email, 80],
  ];
  for (const [email, dias] of prazos) {
    await abrirFicha(page, email);
    await page.getByRole("button", { name: /Definir prazo|Ajustar prazo/ }).click();
    const dlg = page.getByRole("dialog");
    const data = new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
    await dlg.locator('input[type="date"]').fill(data);
    await dlg.getByRole("textbox", { name: /Motivo/ }).fill(`Prazo de ${dias} dias — jornada E2E.`);
    await respirar(page, 1200);
    await dlg.getByRole("button", { name: /Definir prazo|Salvar|Ajustar/ }).click();
    await respirar(page, 1800);
  }

  await page.goto("/admin/plans/expirations");
  await expect(page.getByText(ALUNOS.tracao.nome).first()).toBeVisible();
  await expect(page.getByText(ALUNOS.enterprise.nome).first()).toBeVisible();
  await expect(page.getByText(ALUNOS.semplano.nome).first()).toBeVisible();
  await expect(page.getByText(ALUNOS.basico.nome).first()).toBeVisible(); // o vencido (S14)
  await respirar(page, 3500);

  const exportar = page
    .getByRole("button", { name: /Exportar|CSV/ })
    .or(page.getByRole("link", { name: /Exportar|CSV/ }));
  if (await exportar.first().isVisible().catch(() => false)) {
    const download = page.waitForEvent("download").catch(() => null);
    await exportar.first().click();
    await download;
    await respirar(page, 2000);
  }
});

test("S20 · bloqueio de conta: admin bloqueia → login RECUSADO na tela → desbloqueia", async ({ context, page }) => {
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/students");
  const linha = page.locator("tr", { hasText: ALUNOS.enterprise.email });
  await linha.getByRole("button", { name: "Bloquear" }).click();
  await respirar(page, 1000);
  const conf = page.getByRole("dialog").getByRole("button", { name: /Bloquear/ }).last();
  if (await conf.isVisible().catch(() => false)) await conf.click();
  await expect(linha.getByText(/Bloqueado/).first()).toBeVisible();
  await respirar(page, 2000);

  await context.clearCookies();
  await page.goto("/login");
  await page.getByRole("textbox", { name: "E-mail" }).fill(ALUNOS.enterprise.email);
  await page.getByRole("textbox", { name: "Senha" }).fill(SENHA_ALUNOS);
  await respirar(page, 800);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/login/);
  await expect(page.getByText(/bloquead|não foi possível|inválid/i).first()).toBeVisible();
  await respirar(page, 3000);

  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/students");
  const linha2 = page.locator("tr", { hasText: ALUNOS.enterprise.email });
  await linha2.getByRole("button", { name: "Desbloquear" }).click();
  await respirar(page, 1000);
  const conf2 = page.getByRole("dialog").getByRole("button", { name: /Desbloquear/ }).last();
  if (await conf2.isVisible().catch(() => false)) await conf2.click();
  await expect(linha2.getByText(/^Ativo$/).first()).toBeVisible();
  await respirar(page, 2000);
});

test("S21 · flags sem deploy: entitlements OFF apaga o contador do aluno; ON traz de volta", async ({ context, page }) => {
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/settings");
  const item = page.locator("li", { hasText: "entitlements_enabled" });
  await item.getByRole("switch").click();
  await expect(item.getByText("Desligada").first()).toBeVisible();
  await respirar(page, 2200);

  await context.clearCookies();
  await loginNoFormulario(page, ALUNOS.tracao.email, SENHA_ALUNOS);
  await irParaMentorias(page);
  await expect(contador(page)).toHaveCount(0); // tela legado, sem contador
  await respirar(page, 2500);

  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/settings");
  const item2 = page.locator("li", { hasText: "entitlements_enabled" });
  await item2.getByRole("switch").click();
  await expect(item2.getByText("Ligada").first()).toBeVisible();
  await respirar(page, 1800);

  await context.clearCookies();
  await loginNoFormulario(page, ALUNOS.tracao.email, SENHA_ALUNOS);
  await irParaMentorias(page);
  await expect(contador(page)).toContainText("22h/24h");
  await respirar(page, 2200);
});

test("S22 · MODO SOMBRA: com o bloqueio desligado, o aluno de 0h confirma sem barrar e sem debitar", async ({ context, page }) => {
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/settings");
  const item = page.locator("li", { hasText: "credit_blocking_enabled" });
  await item.getByRole("switch").click();
  await expect(item.getByText("Desligada").first()).toBeVisible();
  await respirar(page, 2200); // bloqueio OFF — sombra assume

  await context.clearCookies();
  await loginNoFormulario(page, ALUNOS.semplano.email, SENHA_ALUNOS); // 1h/3h após a cortesia
  await irParaMentorias(page);
  await abrirEvento(page, /30 JUL Mentoria/); // 2h > 1h de saldo
  await page.getByTestId("confirm-presence").click();
  await expect(page.getByText("Presença confirmada").first()).toBeVisible(); // SOMBRA: passa
  await respirar(page, 2500);
  await fecharModal(page);
  await expect(contador(page)).toContainText("1h/3h"); // e NÃO debitou
  await respirar(page, 2500);

  await abrirEvento(page, /30 JUL Mentoria/); // desfaz — sem rastro
  await page.getByTestId("confirm-presence").click();
  await fecharModal(page);

  await loginAs(context, BASE, PERFIS.admin); // religa o bloqueio
  await page.goto("/admin/settings");
  const item2 = page.locator("li", { hasText: "credit_blocking_enabled" });
  await item2.getByRole("switch").click();
  await expect(item2.getByText("Ligada").first()).toBeVisible();
  await respirar(page, 1800);
});

test("S23 · extratos: as fichas contam a história inteira (grants, débitos, estornos, cortesia)", async ({ context, page }) => {
  await loginAs(context, BASE, PERFIS.admin);
  await abrirFicha(page, ALUNOS.semplano.email);
  await expect(page.getByText("Horas do plano").first()).toBeVisible();
  await respirar(page, 3500); // 3h do plano, débitos até zerar, +1h de cortesia
  await abrirFicha(page, ALUNOS.tracao.email);
  await respirar(page, 3000); // 24h, débito fora-da-janela mantido, estorno E3
});

// ════════════════════════════ BLOCO E · MENTORES ═══════════════════════════

test("S24 · mentores CRUD total: criar, editar, reordenar, despublicar/republicar, vincular e excluir", async ({ context, page }) => {
  const NOME = `Mentor E2E ${SUF}`;
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/mentorships/mentors");

  await page.getByRole("button", { name: "Novo mentor" }).click();
  await page.getByRole("textbox", { name: "Nome *" }).fill(NOME);
  await page.getByRole("textbox", { name: "Especialidade" }).fill("Qualidade & Testes");
  await page.getByRole("textbox", { name: "Descrição" }).fill("Mentor criado ao vivo pela suíte E2E v2.");
  await respirar(page, 1200);
  await page.getByRole("button", { name: /Cadastrar mentor/ }).click();
  await expect(page.getByText(NOME).first()).toBeVisible();
  await respirar(page, 2000);

  await page.getByRole("button", { name: `Editar ${NOME}` }).click();
  await page.getByRole("textbox", { name: "Especialidade" }).fill("QA & Automação");
  await respirar(page, 1000);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("QA & Automação").first()).toBeVisible();
  await respirar(page, 2000);

  await page.getByRole("button", { name: `Subir ${NOME}` }).click();
  await respirar(page, 2000); // reordenado na vitrine

  await page.getByRole("button", { name: `Editar ${NOME}` }).click();
  await page.locator("#mentor-status").selectOption({ value: "draft" });
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText(/Rascunho/i).first()).toBeVisible();
  await respirar(page, 2000); // despublicado: some da vitrine do aluno
  await page.getByRole("button", { name: `Editar ${NOME}` }).click();
  await page.locator("#mentor-status").selectOption({ value: "published" });
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await respirar(page, 1800); // republicado

  await page.goto("/admin/mentorships");
  const linha = page.locator("tr", { hasText: "30/07/2026" }).filter({ hasText: "Mentoria" }).first();
  await linha.getByRole("button", { name: /^Editar/ }).click();
  await expect(page.getByText("Mentores do encontro")).toBeVisible();
  await page.locator("#mentoria-mentor-add").selectOption({ label: `${NOME} — QA & Automação` });
  await expect(page.getByRole("dialog").getByText(NOME).first()).toBeVisible();
  await respirar(page, 2000);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText(/Mentoria atualizada/).first()).toBeVisible();
  await respirar(page, 1800);
  await linha.getByRole("button", { name: /^Editar/ }).click();
  await page.getByRole("button", { name: `Remover ${NOME}` }).click();
  await respirar(page, 1000);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await respirar(page, 1500);

  await page.goto("/admin/mentorships/mentors");
  await page.getByRole("button", { name: `Excluir ${NOME}` }).click();
  await respirar(page, 1000);
  const conf = page.getByRole("button", { name: /^Excluir$|Confirmar/ }).last();
  if (await conf.isVisible().catch(() => false)) await conf.click();
  await expect(page.getByText(NOME)).toHaveCount(0);
  await respirar(page, 1800);
});

test("S25 · aluno visita a vitrine e o perfil de CADA mentor; capa com 2 e o X volta", async ({ page }) => {
  await loginNoFormulario(page, ALUNOS.tracao.email, SENHA_ALUNOS);
  await irParaMentorias(page);

  const vitrine = page.getByTestId("mentors-showcase");
  await vitrine.scrollIntoViewIfNeeded();
  await expect(vitrine.getByTestId("mentor-card")).toHaveCount(3);
  await respirar(page, 2200);

  for (const nome of ["Mentor Teste — Implementação", "Mentor Teste — Growth", "Mentor Teste — Operações"]) {
    await vitrine.getByRole("button", { name: new RegExp(nome.split(" — ")[1]) }).click();
    await expect(page.getByRole("heading", { name: nome })).toBeVisible();
    await expect(page.getByText("Próximos encontros")).toBeVisible();
    await respirar(page, 2500);
    await page.getByRole("button", { name: "Fechar" }).click();
    await respirar(page, 1000);
  }

  await abrirEvento(page, /27 JUL Mentoria/);
  const chips = page.getByTestId("event-mentors");
  await expect(chips.getByRole("button")).toHaveCount(2);
  await chips.getByRole("button", { name: /Growth/ }).click();
  await expect(page.getByRole("heading", { name: "Mentor Teste — Growth" })).toBeVisible();
  await respirar(page, 2200);
  await page.getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByTestId("event-modal")).toBeVisible(); // voltou pra capa
  await respirar(page, 2000);
  await fecharModal(page);
});

test("S26 · lista de presença com vários confirmados: presente e ausente marcados", async ({ context, page }) => {
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    await loginAs(context, BASE, PERFIS.admin);
    await page.goto("/admin/mentorships");
    // 29/07 tem confirmações desta suíte (S07 Básico e S13 Sem Plano).
    const linha = page.locator("tr", { hasText: "29/07/2026" }).filter({ hasText: "Mentoria" }).first();
    await linha.locator('button[title*="lista de presença"]').click();
    await expect(page.getByText(/Confirmou em/).first()).toBeVisible();
    await respirar(page, 2500);

    await page.getByRole("button", { name: /como presente/ }).first().click();
    await expect(page.getByText(/Presente · marcado em/).first()).toBeVisible();
    await respirar(page, 2000);
    await page.getByRole("button", { name: /como ausente/ }).nth(1).click();
    await expect(page.getByText(/Ausente · marcado em/).first()).toBeVisible();
    await respirar(page, 2500);
    await page.keyboard.press("Escape");
  } finally {
    await sql`DELETE FROM educacional.event_attendance WHERE marked_at > now() - interval '10 minutes'`;
    await sql.end();
  }
});

// ════════════════════════════ BLOCO F · CURSOS ═════════════════════════════

test("S27 · Universidade IA do aluno: Top 5 dinâmico, grade, hover e em-breve inerte", async ({ page }) => {
  await loginNoFormulario(page, ALUNOS.tracao.email, SENHA_ALUNOS);
  await page.goto("/trainings");

  await expect(page.getByRole("heading", { name: /Top 5 cursos/ })).toBeVisible();
  const top = page.locator("section", { hasText: "Top 5 cursos" }).first();
  await expect(top.getByRole("link")).toHaveCount(5);
  await respirar(page, 2200);
  await top.getByRole("button", { name: "Rolar para a direita" }).click();
  await respirar(page, 1500);
  await top.getByRole("button", { name: "Rolar para a esquerda" }).click();
  await respirar(page, 1200);

  const grade = page.locator("section", { hasText: "Todos os cursos" }).first();
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 450);
    await respirar(page, 800);
  }
  await grade.scrollIntoViewIfNeeded();
  await respirar(page, 1800);

  const claude = grade.getByRole("link", { name: /Claude Code/ });
  const descricao = claude.getByText(/agente de desenvolvimento/);
  await expect(descricao).toHaveCSS("opacity", "0");
  await claude.hover();
  await expect(descricao).toHaveCSS("opacity", "1");
  await respirar(page, 2200);

  const urlAntes = page.url();
  await grade.getByText("Capacitação em Antigravity").click();
  await respirar(page, 1000);
  expect(page.url()).toBe(urlAntes);

  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 600);
    await respirar(page, 800);
  }
  await expect(page.getByRole("heading", { name: "Em breve" })).toBeVisible();
  await respirar(page, 2000);
});

test("S28 · admin muda a vitrine do catálogo e o aluno VÊ a mudança (e o restauro)", async ({ context, page }) => {
  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/trainings/rails");
  await respirar(page, 2000);

  await page.getByRole("button", { name: /Tirar Em breve do ar/ }).click();
  await expect(page.getByText("Fora do ar").first()).toBeVisible();
  await respirar(page, 2200);

  await context.clearCookies();
  await loginNoFormulario(page, ALUNOS.tracao.email, SENHA_ALUNOS);
  await page.goto("/trainings");
  await expect(page.getByRole("heading", { name: /Top 5 cursos/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Em breve" })).toHaveCount(0);
  await respirar(page, 2800); // a prateleira sumiu para o aluno

  await loginAs(context, BASE, PERFIS.admin);
  await page.goto("/admin/trainings/rails");
  await page.getByRole("button", { name: /Colocar Em breve no ar/ }).click();
  await expect(page.getByText(/Colocar Em breve no ar/)).toHaveCount(0);
  await respirar(page, 2000);
});

// ═══════════════ BLOCO G · LIMPEZA + CONTA EXCLUÍDA NO LOGIN ═══════════════

test("S29 · limpeza na câmera: alunos E2E excluídos — e conta EXCLUÍDA não loga mais", async ({ context, page }) => {
  const sql = postgres(educacionalUrl(), { max: 1, prepare: false });
  try {
    await loginAs(context, BASE, PERFIS.admin);
    await page.goto("/admin/students");
    for (const aluno of Object.values(ALUNOS)) {
      const linha = page.locator("tr", { hasText: aluno.email });
      if (!(await linha.first().isVisible().catch(() => false))) continue;
      await linha.getByRole("button", { name: "Excluir" }).click();
      await respirar(page, 800);
      const conf = page.getByRole("dialog").getByRole("button", { name: /Excluir/ }).last();
      if (await conf.isVisible().catch(() => false)) await conf.click();
      await expect(page.getByText(aluno.email)).toHaveCount(0);
      await respirar(page, 1200);
    }

    // Conta EXCLUÍDA tentando logar: recusada na tela.
    await context.clearCookies();
    await page.goto("/login");
    await page.getByRole("textbox", { name: "E-mail" }).fill(ALUNOS.tracao.email);
    await page.getByRole("textbox", { name: "Senha" }).fill(SENHA_ALUNOS);
    await respirar(page, 800);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/login/);
    await expect(
      page.getByText(/incorretos|inválid|não foi possível|desativad|bloquead/i).first(),
    ).toBeVisible();
    await respirar(page, 3000);
  } finally {
    await sql`
      DELETE FROM educacional.event_confirmations
       WHERE user_id IN (SELECT id FROM educacional.profiles WHERE email LIKE ${"%." + SUF + "@bilhon.ai"})`;
    await sql`
      DELETE FROM educacional.event_attendance
       WHERE profile_id IN (SELECT id FROM educacional.profiles WHERE email LIKE ${"%." + SUF + "@bilhon.ai"})`;
    await sql.end();
  }
});
