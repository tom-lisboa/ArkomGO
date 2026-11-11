"use client";

// Onda 2 — a solução como OVERVIEW do /map, usando o COMPONENTE REAL RadialGraph.
// As 8 etapas viram 8 "departamentos" coloridos radiando de um centro: cada um com
// sigilo, rótulo Marcellus, galhos finos e pontinhos (.jdot) = as SAÍDAS da etapa.
// Vêm de graça: cores por ramo, partículas (motes) fluindo, cérebro, spokes,
// badgepop, hover — porque é o próprio /map. Escala estática (sem a câmera do
// MapView) num escopo .mapview neutralizado; clicar numa etapa abre o painel.

import { useEffect, useMemo, useRef, useState } from "react";
import { RadialGraph } from "@/components/map/RadialGraph";
import { StarField } from "@/components/map/StarField";
import { buildBrain, computeMiniTree, W_STEP, OVERVIEW_REACH, type MiniTree } from "@/components/map/geometry";
import { SIGILS, type Department, type Fn, type Job } from "@/components/map/skilltree-data";
import { STEP_META, STEP_ORDER, type StepKey } from "@/lib/builder-types";
import { isObj, pick, arr } from "./step-renderers";

type StepState = { status: string; content: unknown; error_message?: string | null };

// uma cor por etapa (paleta de departamentos do /map)
const STEP_COLORS = [
  "#ff9d5c", // sales
  "#ef4444", // deals
  "#a78bfa", // marketing
  "#5eead4", // operations
  "#7dd3fc", // intelligence
  "#fb7185", // customer
  "#facc15", // back office
  "#8ee6a8", // (8ª — verde suave)
];

const PILARES: [string, string][] = [
  ["data", "Dados"],
  ["prompt", "Prompt / Lógica"],
  ["models", "Modelos de IA"],
  ["automation", "Automação"],
  ["interface", "Interface"],
];
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const clip = (s: string, m = 40) => (s.length > m ? `${s.slice(0, m - 1).trimEnd()}…` : s);
const cleanTitle = (s: string) => {
  const i = s.indexOf(":");
  return (i >= 0 ? s.slice(i + 1) : s).trim();
};

/** as SAÍDAS REAIS de cada etapa (cada uma vira um pontinho com nome). */
function stepLeaves(stepKey: string, content: unknown): string[] {
  if (!isObj(content)) return [];
  const c = content;
  const L = (v: unknown, ...keys: string[]) =>
    arr(v)
      .map((it) => clip(str(pick(it, ...keys))))
      .filter(Boolean);
  switch (stepKey) {
    case "knowledge_base":
      return L(pick(c, "insights"), "label", "titulo", "title").map((s) => clip(cleanTitle(s)));
    case "framework": {
      const present = PILARES.filter(([key]) => c[key] !== undefined);
      return present.length ? present.map(([, l]) => l) : Object.keys(c);
    }
    case "architecture":
      return L(pick(c, "main_flow", "fluxo_principal", "fluxo"), "label", "titulo", "descricao", "description");
    case "tools":
      return L(pick(c, "tools", "ferramentas"), "name", "nome", "tool", "label", "titulo");
    case "action_plan":
      return L(pick(c, "sprints"), "name", "nome", "short_name", "shortName", "titulo");
    case "content":
      return L(pick(c, "contents", "conteudos", "conteúdos"), "title", "titulo");
    case "prompt_lovable":
      return L(pick(c, "prompts"), "label", "name", "titulo", "title", "tipo", "type");
    case "savings":
      return L(pick(c, "professionals", "profissionais"), "name", "nome", "role", "cargo", "titulo");
    default:
      return [];
  }
}

const chunk = <T,>(a: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};

function useBox(ref: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = useState({ w: 900, h: 560 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

export function SolutionWheel({
  steps,
  gerando,
  onSelect,
  fill = false,
  hideLabels = false,
}: {
  steps: Record<string, StepState>;
  gerando: ReadonlySet<StepKey>;
  onSelect: (k: StepKey) => void;
  /** true = ocupa o pai inteiro (fundo da jornada), sem moldura/altura fixa. */
  fill?: boolean;
  /** esconder rótulos (roda nascente de fundo — evita texto sobre o conteúdo). */
  hideLabels?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useBox(ref);
  const n = STEP_ORDER.length;
  const sigilVals = useMemo(() => Object.values(SIGILS), []);

  const brain = useMemo(() => buildBrain(STEP_COLORS), []);

  // 8 mini-árvores (uma por etapa) posicionadas a cada 45°, cor por etapa, e as
  // saídas concluídas viram jobs (pontinhos). computeMiniTree é o geometria REAL.
  const trees: MiniTree[] = useMemo(() => {
    const W = 360 / n;
    return STEP_ORDER.map((key, i) => {
      const done = steps[key]?.status === "completed" && !gerando.has(key);
      const outputs = done ? stepLeaves(key, steps[key]?.content).slice(0, 9) : [];
      const jobs: Job[] = outputs.map((label, j) => ({
        id: `${key}-${j}`,
        name: label,
        desc: "",
        skills: [],
        tools: [],
        level: "autonomous",
      }));
      const fns: Fn[] = chunk(jobs, 3).map((cj, fi) => ({ id: `${key}-f${fi}`, name: STEP_META[key].label, jobs: cj }));
      const dept: Department = {
        id: key,
        name: STEP_META[key].label,
        sub: STEP_META[key].hint,
        color: STEP_COLORS[i % STEP_COLORS.length],
        intro: "",
        sigil: sigilVals[i % sigilVals.length],
        functions: fns.length ? fns : [{ id: `${key}-f0`, name: STEP_META[key].label, jobs: [] }],
      };
      // índice único i + ângulo i*W: wheelA = i*(W - W_STEP) ⇒ deg = i*W
      return computeMiniTree(dept, i, i * (W - W_STEP));
    });
  }, [steps, gerando, n, sigilVals]);

  // escala estática pra caber a roda (raio ~OVERVIEW_REACH) na seção
  const half = Math.min(w, h) / 2;
  const k = Math.max(0.16, Math.min(0.6, (half - 18) / OVERVIEW_REACH));

  return (
    <div
      ref={ref}
      className={`mapview gx-solwheel${fill ? " gx-solwheel--fill" : ""}`}
      role="group"
      aria-label="Mapa da solução"
    >
      <div className="gx-solwheel-space" aria-hidden>
        <StarField />
      </div>
      <div
        className="graph-stage"
        style={{ left: "50%", top: "50%", transformOrigin: "0 0", transform: `scale(${k.toFixed(3)})` }}
      >
        <RadialGraph
          miniTrees={trees}
          brain={brain}
          mode="overview"
          divingIndex={null}
          showAllLabels={!hideLabels}
          hideLabels={hideLabels}
          onSelectDept={(i) => onSelect(STEP_ORDER[i])}
          onSelectHub={() => onSelect(STEP_ORDER[0])}
        />
      </div>
    </div>
  );
}
