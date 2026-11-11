"use client";

// GenesisGuide — indicador lateral (esquerda) da tela de resultado do Genesis.
// No DS do mapa (serifa display + copper), com o texto sendo DIGITADO em
// sequência: intro + as 8 etapas, cada uma um link que abre o popover da etapa
// (onSelect → setAtivo). Fica atrás do drawer (z menor), então some quando uma
// etapa está aberta e reaparece ao fechar.

import { useEffect, useMemo, useState } from "react";
import { STEP_ORDER, STEP_META, type StepKey } from "@/lib/builder-types";

/** Uma frase curta explicando o que tem em cada seção (voz direta). */
const GUIDE_PT: Record<StepKey, string> = {
  knowledge_base: "o cérebro do projeto — o que a IA extraiu do seu contexto.",
  framework: "os pilares que sustentam a construção.",
  architecture: "o mapa dos fluxos do seu MVP.",
  tools: "as ferramentas essenciais e suas alternativas.",
  action_plan: "o passo a passo em sprints.",
  prompt_lovable: "o prompt pronto pra colar no Lovable.",
  content: "as aulas que ensinam cada etapa.",
  savings: "quanto você economiza e quem substitui.",
};

type Seg = { text: string; key?: StepKey; n?: number; kind: "intro" | "step" };

/** Digita uma sequência de frases, uma por vez, char a char. */
function useSequentialType(texts: string[], speed = 16, linePause = 220) {
  const [done, setDone] = useState(0);
  const [partial, setPartial] = useState("");
  useEffect(() => {
    if (done >= texts.length) return;
    const full = texts[done];
    if (partial.length < full.length) {
      const t = setTimeout(() => setPartial(full.slice(0, partial.length + 1)), speed);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setDone((d) => d + 1);
      setPartial("");
    }, linePause);
    return () => clearTimeout(t);
  }, [done, partial, texts, speed, linePause]);
  return { done, partial };
}

function Caret() {
  return <span className="gx-guide-caret" aria-hidden>▋</span>;
}

export function GenesisGuide({ onSelect }: { onSelect: (k: StepKey) => void }) {
  const segments = useMemo<Seg[]>(
    () => [
      { text: "Seu plano, etapa por etapa.", kind: "intro" },
      { text: "Toque numa seção pra abrir o conteúdo.", kind: "intro" },
      ...STEP_ORDER.map<Seg>((k, i) => ({
        text: `${STEP_META[k].label} — ${GUIDE_PT[k]}`,
        key: k,
        n: i + 1,
        kind: "step",
      })),
    ],
    []
  );

  const { done, partial } = useSequentialType(segments.map((s) => s.text));

  return (
    <aside className="gx-guide hidden lg:block absolute left-5 top-[66px] z-20 w-[290px]">
      <div className="flex flex-col gap-1">
        {segments.map((s, i) => {
          const shown = i < done;
          const active = i === done;
          if (!shown && !active) return null;

          if (s.kind === "intro") {
            return (
              <p
                key={i}
                className={`gx-guide-intro ${i === 0 ? "gx-guide-lead" : ""}`}
              >
                {shown ? s.text : partial}
                {active ? <Caret /> : null}
              </p>
            );
          }

          // etapa — label (serifa) + explicação (dim); vira link quando digitada
          const [lbl, ...rest] = s.text.split(" — ");
          const expl = rest.join(" — ");
          const inner = active ? (
            <span className="gx-guide-tx">
              {partial}
              <Caret />
            </span>
          ) : (
            <span className="gx-guide-tx">
              <span className="gx-guide-lbl">{lbl}</span>
              <span className="gx-guide-expl"> — {expl}</span>
            </span>
          );

          const body = (
            <>
              <span className="gx-guide-n">{String(s.n).padStart(2, "0")}</span>
              {inner}
            </>
          );

          return shown ? (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(s.key!)}
              className="gx-guide-step"
            >
              {body}
            </button>
          ) : (
            <div key={i} className="gx-guide-step is-typing">
              {body}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
