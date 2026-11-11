"use client";

// Corpo da videoteca de jornadas v2 — a MATRIZ COMPLETA do sistema de horas
// (29 cenários, 7 blocos), gravada em cadência humana. Layout "tipo aula":
// player + descrição à esquerda, playlist agrupada por bloco à direita.
// Cada cenário lista o que o vídeo demonstra; quando a gravação encontrou um
// problema real (e ele foi corrigido), a descoberta aparece destacada.

import { useState } from "react";
import {
  CalendarCheck2,
  CalendarX2,
  Clock3,
  Coins,
  GraduationCap,
  KeyRound,
  ListChecks,
  PlayCircle,
  ShieldOff,
  SlidersHorizontal,
  Trash2,
  UsersRound,
  Wallet,
} from "lucide-react";

type Cenario = {
  slug: string;
  titulo: string;
  bloco: string;
  icone: React.ComponentType<{ className?: string }>;
  casos: string[];
  /** Problema real encontrado pela gravação (e corrigido). */
  descoberta?: string;
};

const VIDEO_PREFIX = "/api/media/resources/qa-jornadas-v2/";
const VIDEO_VERSION = "1";

const CENARIOS: Cenario[] = [
  // ── A · CONTAS & PLANOS ──────────────────────────────────────────────────
  {
    slug: "s01",
    titulo: "S01 · Admin cria o Aluno Básico já com o plano",
    bloco: "A · Contas & planos",
    icone: KeyRound,
    casos: [
      "Login do admin digitado na câmera",
      "Novo usuário com o campo Plano = Básico no próprio cadastro",
      "Ficha: plano Básico, 8h por mês, e as 8h já lançadas no extrato",
    ],
  },
  {
    slug: "s02",
    titulo: "S02 · Aluno Tração criado com 24h/mês",
    bloco: "A · Contas & planos",
    icone: Coins,
    casos: ["Mesmo fluxo, plano Tração: ficha com 24h por mês no extrato"],
  },
  {
    slug: "s03",
    titulo: "S03 · Aluno Enterprise — ilimitadas, extrato limpo",
    bloco: "A · Contas & planos",
    icone: Coins,
    casos: [
      "Plano Enterprise: cota Ilimitadas",
      "O extrato NÃO ganha lançamento — ilimitado não é número, é regra",
    ],
  },
  {
    slug: "s04",
    titulo: "S04 · Aluno Sem Plano — ficha zerada",
    bloco: "A · Contas & planos",
    icone: KeyRound,
    casos: [
      "Cadastro sem plano: 'Sem plano ativo' na ficha",
      "A senha temporária aparece na tela (o S05 usa exatamente ela)",
    ],
  },
  {
    slug: "s05",
    titulo: "S05 · Primeiro acesso: senha temporária → troca obrigatória",
    bloco: "A · Contas & planos",
    icone: KeyRound,
    casos: [
      "Login com a senha temporária do cadastro",
      "O produto FORÇA a troca de senha antes de qualquer tela",
      "Senha nova definida → /home abre sem redirecionar",
    ],
  },
  {
    slug: "s06",
    titulo: "S06 · CRUD de plano: criar, editar e excluir",
    bloco: "A · Contas & planos",
    icone: Coins,
    casos: [
      "Criar 'Plano Demo E2E' (5h/mês, 12 meses, publicado)",
      "EDITAR: 5h → 10h por mês, refletido na tabela",
      "Excluir (sem alunos vinculados sai limpo — com histórico o produto recusa)",
    ],
  },
  // ── B · CONSUMO ──────────────────────────────────────────────────────────
  {
    slug: "s07",
    titulo: "S07 · Básico consome: débito ao vivo e estorno",
    bloco: "B · Consumo por plano",
    icone: CalendarCheck2,
    casos: [
      "Login do aluno na câmera · contador 8h/8h",
      "Mentoria de 2h → 6h/8h · mentoria de 1h → 5h/8h (ao vivo, sem refresh)",
      "Desfazer antes do início: estorno como lançamento novo → 6h/8h",
    ],
  },
  {
    slug: "s08",
    titulo: "S08 · Live da comunidade não move o contador",
    bloco: "B · Consumo por plano",
    icone: PlayCircle,
    casos: [
      "Capa avisa 'Não consome horas do plano'",
      "Confirma e o contador segue 24h/24h — live é ponte, não cobrança",
    ],
  },
  {
    slug: "s09",
    titulo: "S09 · Fora da janela: começou, não devolve",
    bloco: "B · Consumo por plano",
    icone: Clock3,
    casos: [
      "Confirmação tardia numa mentoria que JÁ aconteceu debita normalmente",
      "Desconfirmar depois do início NÃO estorna — o aviso explica na tela",
      "As 2h ficam consumidas no contador (regra E1 na prática)",
    ],
  },
  {
    slug: "s10",
    titulo: "S10 · Enterprise: ilimitado de verdade",
    bloco: "B · Consumo por plano",
    icone: Coins,
    casos: ["Contador 'Ilimitado' · confirma mentoria sem débito nenhum"],
  },
  {
    slug: "s11",
    titulo: "S11 · Sem plano: mentoria recusada",
    bloco: "B · Consumo por plano",
    icone: ShieldOff,
    casos: [
      "Clique em confirmar → 'Seu plano não inclui mentorias ao vivo'",
    ],
    descoberta:
      "A gravação pegou um furo real: aluno sem plano confirmava DE GRAÇA (o fail-safe tratava 'sem plano' igual a 'banco fora do ar'). Corrigido: ausência limpa de plano agora bloqueia como fora-do-plano; erro de banco continua fail-open.",
  },
  {
    slug: "s12",
    titulo: "S12 · Edição de usuário atribui plano",
    bloco: "B · Consumo por plano",
    icone: Coins,
    casos: [
      "Modal Editar usuário → campo Plano → Plano Teste (3 mentorias)",
      "Ficha: 3h no total materializadas na hora",
    ],
  },
  {
    slug: "s13",
    titulo: "S13 · Esgotar o saldo: recusas e contador no vermelho",
    bloco: "B · Consumo por plano",
    icone: Wallet,
    casos: [
      "3h/3h → mentoria de 2h → 1h/3h",
      "Tentar 2h com 1h: aviso ANTES + clique RECUSADO ('Suas horas acabaram')",
      "A última 1h cabe → 0h/3h com o contador em VERMELHO",
      "Tentar com ZERO: recusado de novo — sem exceção",
    ],
  },
  {
    slug: "s14",
    titulo: "S14 · Vencido: loga, é barrado no consumo, catálogo continua",
    bloco: "B · Consumo por plano",
    icone: Clock3,
    casos: [
      "Prazo estourado: o LOGIN funciona (vencer não derruba a conta)",
      "Confirmar mentoria → barrado com a mensagem de renovação",
      "Concluir AULA → barrado com toast explicando (catálogo e player seguem abertos — X1/X3)",
    ],
    descoberta:
      "Segundo furo real: o erro de 'concluir aula' era ENGOLIDO (o botão só revertia, sem explicação). Agora o motivo chega em toast na tela do player.",
  },
  // ── C · EVENTOS & E3 ─────────────────────────────────────────────────────
  {
    slug: "s15",
    titulo: "S15 · Criar evento: custo automático pela duração",
    bloco: "C · Eventos & cancelamento",
    icone: CalendarCheck2,
    casos: [
      "Nova mentoria 14h–16h com o campo de horas VAZIO",
      "O produto assume a duração: 2h na listagem",
      "O aluno abre a capa do evento novo: 'Usa 2h do seu plano'",
    ],
  },
  {
    slug: "s16",
    titulo: "S16 · Cancelamento pelo Arkom: estorno automático (E3)",
    bloco: "C · Eventos & cancelamento",
    icone: CalendarX2,
    casos: [
      "Aluno confirma a demo (24h → 20h… já com 2h presas do S09)",
      "Admin cancela pelo Arkom: 'Cancelar e estornar'",
      "O aluno reabre a agenda com as horas DE VOLTA no contador",
    ],
    descoberta:
      "Achado de copy: o diálogo de cancelamento usava o botão default 'Excluir' — confuso para uma ação de estorno. Agora diz 'Cancelar e estornar'.",
  },
  {
    slug: "s17",
    titulo: "S17 · Evento com extrato não se apaga",
    bloco: "C · Eventos & cancelamento",
    icone: Trash2,
    casos: [
      "O evento cancelado vira RASCUNHO (fora do calendário do aluno)",
      "Excluir é RECUSADO: débito e estorno no extrato apontam para ele",
      "Mesma doutrina do plano com histórico — dinheiro não se reescreve",
    ],
  },
  // ── D · ADMIN & RELATÓRIOS ───────────────────────────────────────────────
  {
    slug: "s18",
    titulo: "S18 · Concessão manual com motivo",
    bloco: "D · Admin & relatórios",
    icone: Wallet,
    casos: [
      "'Ajustar horas' na ficha: +1h com motivo obrigatório",
      "O extrato mostra o lançamento com autor e horário",
    ],
  },
  {
    slug: "s19",
    titulo: "S19 · Relatório de vencimentos 30/60/90 + CSV",
    bloco: "D · Admin & relatórios",
    icone: Clock3,
    casos: [
      "Prazos definidos nas fichas: +20, +50 e +80 dias (com motivo)",
      "O relatório mostra as TRÊS janelas povoadas + o aluno vencido",
      "Exportação CSV clicada na câmera",
    ],
  },
  {
    slug: "s20",
    titulo: "S20 · Conta bloqueada não entra",
    bloco: "D · Admin & relatórios",
    icone: ShieldOff,
    casos: [
      "Admin bloqueia a conta → status Bloqueado na lista",
      "A tentativa de login é RECUSADA na tela",
      "Desbloqueio devolve o acesso",
    ],
  },
  {
    slug: "s21",
    titulo: "S21 · Flag sem deploy: contador some e volta",
    bloco: "D · Admin & relatórios",
    icone: SlidersHorizontal,
    casos: [
      "Admin DESLIGA 'Entitlements por perfil' em Configurações",
      "O aluno recarrega: tela LEGADO, sem contador",
      "Religa → contador de volta — liga/desliga vale em segundos",
    ],
  },
  {
    slug: "s22",
    titulo: "S22 · Modo sombra na prática",
    bloco: "D · Admin & relatórios",
    icone: SlidersHorizontal,
    casos: [
      "Bloqueio DESLIGADO (sombra assume): aluno com 0h de saldo CONFIRMA",
      "Nada é debitado — a sombra observa e registra, não cobra",
      "Bloqueio religado no fim — é o caminho de rollout do plano",
    ],
  },
  {
    slug: "s23",
    titulo: "S23 · O extrato conta a história inteira",
    bloco: "D · Admin & relatórios",
    icone: ListChecks,
    casos: [
      "Ficha do aluno esgotado: 3h do plano, débitos até zerar, +1h de cortesia",
      "Ficha do Tração: 24h, débito fora-da-janela mantido, estorno do E3",
    ],
  },
  // ── E · MENTORES ─────────────────────────────────────────────────────────
  {
    slug: "s24",
    titulo: "S24 · Mentores: CRUD total",
    bloco: "E · Mentores",
    icone: UsersRound,
    casos: [
      "Criar publicado → editar especialidade → REORDENAR a vitrine",
      "Despublicar (some da vitrine) → republicar",
      "Vincular à mentoria em 'Mentores do encontro' → desvincular → excluir",
    ],
  },
  {
    slug: "s25",
    titulo: "S25 · Aluno visita cada mentor",
    bloco: "E · Mentores",
    icone: UsersRound,
    casos: [
      "Vitrine com os 3 mentores (fallback de iniciais sem foto)",
      "Perfil de CADA um: bio + próximos encontros",
      "Capa com DOIS mentores · o X do perfil VOLTA para a capa",
    ],
  },
  {
    slug: "s26",
    titulo: "S26 · Lista de presença (E4)",
    bloco: "E · Mentores",
    icone: ListChecks,
    casos: [
      "Evento com vários confirmados da própria suíte",
      "Presente e ausente marcados, com auditoria de quem marcou",
      "É o dado que habilita 'só cobra quem participou' no futuro",
    ],
  },
  // ── F · CURSOS ───────────────────────────────────────────────────────────
  {
    slug: "s27",
    titulo: "S27 · Universidade IA do aluno",
    bloco: "F · Cursos",
    icone: GraduationCap,
    casos: [
      "Top 5 dinâmico por assistidos — travado em 5",
      "Trilho rolando pelos chevrons · grade com todos (4 por linha)",
      "Descrição só no hover · 'Em breve' anunciado, não navegável",
    ],
  },
  {
    slug: "s28",
    titulo: "S28 · Vitrine editável: admin muda, aluno vê",
    bloco: "F · Cursos",
    icone: SlidersHorizontal,
    casos: [
      "Admin tira a prateleira 'Em breve' do ar",
      "O aluno recarrega e a seção NÃO está mais lá",
      "Restauro na sequência — composição é dado, não código",
    ],
  },
  // ── G · LIMPEZA ──────────────────────────────────────────────────────────
  {
    slug: "s29",
    titulo: "S29 · Limpeza + conta excluída não loga",
    bloco: "G · Limpeza",
    icone: Trash2,
    casos: [
      "Os quatro alunos E2E são excluídos na câmera",
      "A conta EXCLUÍDA tenta logar → recusada na tela",
    ],
  },
  // ── H · AJUSTES DO QA DO DONO ────────────────────────────────────────────
  {
    slug: "s30",
    titulo: "S30 · Saldo insuficiente fala em custo × saldo",
    bloco: "H · Ajustes do QA do dono",
    icone: Wallet,
    casos: [
      "Admin cria um plano de 3h no total e um aluno já com ele",
      "Aluno entra com 3h/3h e gasta 2h numa mentoria real → 1h/3h",
      "Mentoria de 2h com 1h de saldo: aviso vermelho no modal + clique recusado",
      "Toast novo: “Esta mentoria usa 2h e você tem 1h de saldo” — na mesma língua do modal",
      "A última 1h cabe numa mentoria de 1h → contador zera no vermelho",
      "Só com 0h aparece “Suas horas de mentoria acabaram”",
    ],
    descoberta:
      "QA manual do dono (cenário 13, 2026-07-28): com 1h/2h no contador, o toast dizia “suas horas acabaram” — contradição na tela. O veredito de saldo tratava insuficiente e zerado como a mesma coisa. Agora saldo parcial gera mensagem com os números do caso real (custo × saldo) e o “acabaram” é exclusivo do saldo zero. Runbook do suporte atualizado (mensagens 1a/1b).",
  },
];

function Secao({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-st-ink-3">
        {titulo}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {itens.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2 text-[13.5px] leading-relaxed text-st-ink-2"
          >
            <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#c58b5f]" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function JornadasBody() {
  const [ativo, setAtivo] = useState<Cenario>(CENARIOS[0]);
  return (
    <div className="min-h-dvh bg-st-bg px-5 py-8 text-st-ivory sm:px-10">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#c58b5f]">
            Arkom · QA · suíte v2
          </p>
          <h1 className="mt-1 text-[27px] font-bold leading-none tracking-[-0.02em]">
            A matriz completa do sistema de horas — 29 cenários gravados
          </h1>
          <p className="mt-3 max-w-[860px] text-[15px] leading-relaxed text-st-ink-2">
            Um aluno por plano, todos os estados de consumo e de conta, cada
            combinação de configuração, relatórios, mentores e catálogo — em
            jornadas E2E reais, com login digitado e cadência humana. Quatro
            problemas reais foram encontrados pelas gravações e corrigidos; os
            cenários marcam onde.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-[14px] border border-st-line-2 bg-black">
              <video
                key={ativo.slug}
                controls
                playsInline
                className="aspect-video w-full"
                src={`${VIDEO_PREFIX}${ativo.slug}.webm?v=${VIDEO_VERSION}`}
              />
            </div>
            <div className="flex flex-col gap-5 rounded-[14px] border border-st-line bg-st-card p-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-st-ink-3">
                  {ativo.bloco}
                </p>
                <h2 className="mt-1 text-[20px] font-bold tracking-[-0.01em]">
                  {ativo.titulo}
                </h2>
              </div>
              <Secao titulo="O que o vídeo demonstra" itens={ativo.casos} />
              {ativo.descoberta ? (
                <div className="rounded-[10px] border border-[#c58b5f66] bg-[#c58b5f14] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#c58b5f]">
                    Problema real encontrado (corrigido)
                  </p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-st-ink-2">
                    {ativo.descoberta}
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <aside className="flex flex-col gap-1.5">
            {CENARIOS.map((cenario, i) => {
              const Icone = cenario.icone;
              const atual = cenario.slug === ativo.slug;
              const novoBloco = i === 0 || CENARIOS[i - 1].bloco !== cenario.bloco;
              return (
                <div key={cenario.slug}>
                  {novoBloco ? (
                    <p className="mb-1.5 mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-st-ink-3 first:mt-0">
                      {cenario.bloco}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setAtivo(cenario)}
                    className={`flex w-full items-start gap-3 rounded-[12px] border p-3 text-left transition-colors ${
                      atual
                        ? "border-[#c58b5f66] bg-st-card-2"
                        : "border-st-line bg-st-card hover:border-st-line-2 hover:bg-st-card-2"
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-[8px] border ${
                        atual ? "border-[#c58b5f66] text-[#c58b5f]" : "border-st-line text-st-ink-2"
                      }`}
                    >
                      <Icone className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-[650] text-st-ivory">
                        {cenario.titulo}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-st-ink-2">
                        {cenario.casos[0]}
                      </span>
                    </span>
                    {cenario.descoberta ? (
                      <span
                        title="Problema real encontrado (corrigido)"
                        aria-label="Problema real encontrado (corrigido)"
                        className="ml-auto mt-1 size-2 shrink-0 rounded-full bg-[#c58b5f]"
                      />
                    ) : null}
                  </button>
                </div>
              );
            })}
          </aside>
        </div>
      </div>
    </div>
  );
}
