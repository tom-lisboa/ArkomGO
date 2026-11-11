// Tela do aluno cujo PLANO não libera os Sistemas (apps e templates) —
// ClickUp 86ajrgzef.
//
// A área se chama SISTEMAS na barra do aluno (i18n `shell.nav.apps`); "apps" é
// o nome interno (rota /apps, tabela `apps`). A copy segue o que está escrito
// na tela do aluno — quem lê o cadeado acabou de clicar em "Sistemas".
//
// Por que existe um componente só para isto: o corte de verdade é no servidor
// (a página nem carrega os apps, e as actions recusam), então o que sobra para
// a UI é a única coisa que ela faz melhor que um 404 — dizer POR QUÊ. O lead
// que entra num plano de FUP precisa entender que não é um erro nem uma tela
// quebrada: o plano dele não inclui esta área.
//
// O desenho espelha o estado "Em breve" de rota travada do Shell (cadeado em
// quadrado arredondado + título + linha de destaque + explicação), para o aluno
// reconhecer "isto está fechado para mim" sem precisar ler duas vezes.

import Link from "next/link";
import { Lock } from "lucide-react";

export function AppsBloqueado({ planName }: { planName: string | null }) {
  return (
    <div className="flex min-h-[64vh] flex-col items-center justify-center text-center">
      <span className="mb-5 flex size-16 items-center justify-center rounded-[20px] border border-st-line-2 bg-st-card text-st-ink-2">
        <Lock className="size-7" strokeWidth={1.8} />
      </span>
      <h1 className="text-[24px] font-bold tracking-[-0.02em] text-st-ivory">
        Sistemas
      </h1>
      <p className="mt-2.5 text-[13px] font-bold uppercase tracking-[0.14em] text-[#c58b5f]">
        Não incluso no seu plano
      </p>
      <p className="mt-3 max-w-[440px] text-[14px] leading-relaxed text-st-ink-2">
        {planName
          ? `O plano ${planName} dá acesso aos cursos, mas não à área de Sistemas (apps e templates).`
          : "Seu plano dá acesso aos cursos, mas não à área de Sistemas (apps e templates)."}{" "}
        Para liberar, fale com o time da Arkom.
      </p>
      <Link
        href="/trainings"
        className="mt-6 inline-flex items-center gap-2 rounded-full border border-st-line-2 bg-st-card px-5 py-2.5 text-[14px] font-semibold text-st-ivory transition-colors hover:border-white/20"
      >
        Ir para a Universidade IA
      </Link>
    </div>
  );
}
