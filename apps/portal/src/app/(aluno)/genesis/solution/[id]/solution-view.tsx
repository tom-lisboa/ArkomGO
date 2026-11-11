"use client";

// Jornada visual das 8 etapas (roadmap 01→08 conectado) + geração PARALELA automática
// + painel de conteúdo. Theme-aware (acompanha o tema do app), linguagem ARKOM.
//
// Performance: as etapas dependem só dos resumos do esqueleto, então TODAS disparam em
// paralelo via /genesis/api/etapa (route handler — server actions serializariam). Única
// dependência real: "savings" espera "tools" para somar os custos reais das ferramentas.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { STEP_META, STEP_ORDER, type StepKey } from "@/lib/builder-types";
import { StepContent } from "./step-content";
import { SolutionWheel } from "./solution-wheel";
import { GenesisGuide } from "./genesis-guide";

type StepState = { step_key: string; status: string; content: unknown; error_message?: string | null };

export function SolutionView({
  solutionId,
  summaries,
  initialSteps,
  title,
}: {
  solutionId: number;
  summaries: Record<string, string>;
  initialSteps: StepState[];
  title: string;
}) {
  const [steps, setSteps] = useState<Record<string, StepState>>(
    Object.fromEntries(initialSteps.map((s) => [s.step_key, s]))
  );
  // nada selecionado de início — o painel "Etapa X de Y" só aparece ao CLICAR
  // numa etapa da roda (pedido do dono).
  const [ativo, setAtivo] = useState<StepKey | null>(null);
  const [gerando, setGerando] = useState<ReadonlySet<StepKey>>(new Set());
  const [rodando, setRodando] = useState(false);
  const [parou, setParou] = useState(false);
  const startedRef = useRef(false);
  // dedupe local com JOIN: uma segunda solicitação da mesma etapa reaproveita a
  // promise em voo em vez de duplicar o POST — assim "Continuar" durante um "Gerar"
  // manual espera e encadeia corretamente (o servidor ainda deduplica via claim
  // atômico, cobrindo outras abas/remontagens)
  const inFlightRef = useRef<Map<StepKey, Promise<boolean>>>(new Map());
  // épocas de tools/savings: detectam uma savings em voo calculada com custos VELHOS
  // de tools (começou antes da tools mais recente completar) — join nela seria errado
  const toolsEpochRef = useRef(0);
  const savingsEpochRef = useRef(0);

  // "Pronta" de verdade = completou COM conteúdo e não está sendo (re)gerada
  // agora — o contador nunca mais diz 8/8 com etapa vazia ou em voo.
  const prontas = STEP_ORDER.filter(
    (k) => steps[k]?.status === "completed" && steps[k]?.content != null && !gerando.has(k)
  ).length;
  const tudoPronto = prontas === STEP_ORDER.length;
  // em voo = disparada por ESTA aba (gerando) OU marcada 'generating' no banco
  // (outra aba/geração do wizard ainda rodando no servidor)
  const emVoo = STEP_ORDER.filter(
    (k) => gerando.has(k) || steps[k]?.status === "generating"
  ).length;

  function gerarUma(key: StepKey): Promise<boolean> {
    const emVoo = inFlightRef.current.get(key);
    if (emVoo) return emVoo;
    const promessa = (async () => {
      if (key === "savings") savingsEpochRef.current = toolsEpochRef.current;
      setGerando((prev) => new Set(prev).add(key));
      try {
        const res = await fetch("/genesis/api/etapa", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ solutionId, stepKey: key }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          step?: { status: string; content: unknown; error_message?: string | null };
        } | null;
        if (!res.ok || !j?.ok || !j.step) return false;
        const { status, content, error_message } = j.step;
        setSteps((prev) => ({ ...prev, [key]: { step_key: key, status, content, error_message } }));
        // 'completed' COM error_message = regeneração falhou e o servidor preservou o
        // conteúdo anterior — não é sucesso (não encadear savings, sinalizar pausa)
        const ok = status === "completed" && !error_message;
        if (ok && key === "tools") toolsEpochRef.current++;
        return ok;
      } catch {
        return false;
      } finally {
        inFlightRef.current.delete(key);
        setGerando((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    })();
    inFlightRef.current.set(key, promessa);
    return promessa;
  }

  // Recalcula a economia garantindo custos ATUAIS: se há uma savings em voo iniciada
  // antes da tools mais recente completar (época antiga), espera terminar e dispara
  // uma nova; se a em-voo já é da época atual, join nela basta.
  function gerarSavingsAtualizada(): Promise<boolean> {
    const emVoo = inFlightRef.current.get("savings");
    if (emVoo && savingsEpochRef.current === toolsEpochRef.current) return emVoo;
    if (emVoo) return emVoo.then(() => gerarUma("savings"));
    return gerarUma("savings");
  }

  // Geração manual (botões Gerar/Regerar): tools carrega os custos que alimentam a
  // economia — (re)gerar tools recalcula savings junto para nunca exibir números velhos
  function gerarManual(key: StepKey): Promise<boolean> {
    if (key === "tools") return gerarUma("tools").then((ok) => (ok ? gerarSavingsAtualizada() : false));
    return gerarUma(key);
  }

  async function gerarTudo() {
    if (rodando) return;
    setRodando(true);
    setParou(false);
    try {
      const pendentes = STEP_ORDER.filter((k) => steps[k]?.status !== "completed");
      // savings depende dos custos de tools: se tools vai ser (re)gerada (pendente ou
      // regeneração em voo), recalcula savings junto — evita economia desatualizada
      const toolsEmVoo = inFlightRef.current.get("tools");
      if ((pendentes.includes("tools") || toolsEmVoo) && !pendentes.includes("savings")) {
        pendentes.push("savings");
      }
      if (!pendentes.length) return;
      // dispara tudo em paralelo (gerarUma faz join no que já está em voo); "savings"
      // encadeia após "tools" e só roda se tools completou (sem os custos reais o
      // cálculo sai degradado)
      const promessas = new Map<StepKey, Promise<boolean>>();
      for (const k of pendentes) if (k !== "savings") promessas.set(k, gerarUma(k));
      if (pendentes.includes("savings")) {
        const aposTools =
          promessas.get("tools") ?? toolsEmVoo ?? Promise.resolve(steps["tools"]?.status === "completed");
        promessas.set(
          "savings",
          aposTools.then((ok) => (ok ? gerarSavingsAtualizada() : false))
        );
      }
      const oks = await Promise.all(promessas.values());
      if (oks.some((ok) => !ok)) setParou(true);
    } finally {
      setRodando(false);
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!tudoPronto) void gerarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const atual = ativo ? steps[ativo] : undefined;
  // etapa ativa "em geração" — cobre também a fila do auto-run (rodando) e as
  // gerações em voo no servidor (status 'generating' no banco): nunca mostrar
  // "Falha"/vazio enquanto ainda está gerando.
  const ativoPronto = atual?.status === "completed" && atual?.content != null;
  const gerandoAtivo = ativo
    ? gerando.has(ativo) || atual?.status === "generating" || (rodando && !ativoPronto)
    : false;

  const statusTxt = emVoo > 0 ? `gerando ${emVoo}…` : tudoPronto ? "completa" : parou ? "pausada" : "preparando";

  return (
    <div className="gx-journey gx-result">
      {/* a RODA cobre a seção toda (como o /map); com o popover aberto ela
          desliza pra DIREITA (metade livre), mesmo que o rótulo mais à direita
          quebre linha encostado na borda (aceito pelo dono) */}
      <div className={`gx-journey-wheel${ativo ? " gx-wheel--pushed" : ""}`}>
        <SolutionWheel fill steps={steps} gerando={gerando} onSelect={setAtivo} />
      </div>

      {/* guia lateral (esquerda) — texto digitado explicando cada seção; some
          atrás do drawer quando uma etapa está aberta */}
      <GenesisGuide onSelect={setAtivo} />

      {/* barra superior sobre a roda: voltar + título + progresso */}
      <div className="gx-result-top">
        <Link
          href="/genesis"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm text-st-ink-2 transition-colors hover:text-st-ivory"
        >
          <ArrowLeft className="h-4 w-4" /> Genesis
        </Link>
        <div className="min-w-0 flex-1 px-4 text-center">
          <p className="font-mono text-3xs uppercase tracking-widest text-gold-700">solução gerada por IA</p>
          <h1 className="truncate font-display text-base font-bold tracking-display text-st-ivory">{title}</h1>
        </div>
        <span className="shrink-0 font-mono text-2xs tabular-nums text-st-ink-2">
          {statusTxt} · {prontas}/{STEP_ORDER.length}
        </span>
      </div>

      {/* drawer sobreposto na roda — só ao CLICAR numa etapa; entra com animação */}
      {ativo ? (
          <div
            key={ativo}
            className="gx-canvas-drawer gx-drawer-in absolute bottom-3 left-3 top-[70px] z-30 flex w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-[14px] border border-st-line-2 shadow-modal lg:w-1/2"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 p-5 pb-2">
              <div className="min-w-0">
                <p className="font-mono text-3xs uppercase tracking-widest text-gold-700">
                  Etapa {STEP_ORDER.indexOf(ativo) + 1} de {STEP_ORDER.length}
                </p>
                <h2 className="font-display mt-0.5 truncate text-lg font-bold tracking-display text-primary">
                  {STEP_META[ativo].label}
                </h2>
                <p className="text-xs text-tertiary">{STEP_META[ativo].hint}</p>
              </div>
              <button
                type="button"
                onClick={() => setAtivo(null)}
                aria-label="Fechar"
                className="shrink-0 rounded-full p-1.5 text-tertiary transition-colors hover:bg-surface-hover hover:text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!gerandoAtivo && !rodando ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 pb-3">
                {parou && (
                  <button
                    type="button"
                    onClick={() => gerarTudo()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-gold-50 px-3 py-1.5 text-xs font-medium text-gold-700 transition-colors hover:bg-gold-100"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Continuar
                  </button>
                )}
                {!ativoPronto ? (
                  <button
                    type="button"
                    onClick={() => void gerarManual(ativo)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-canvas px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-surface-hover"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Gerar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void gerarManual(ativo)}
                    title="Gerar esta etapa novamente"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-canvas px-3 py-1.5 text-xs font-medium text-tertiary transition-colors hover:bg-surface-hover hover:text-secondary"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Regerar
                  </button>
                )}
              </div>
            ) : null}

            <div className="gx-scroll min-h-0 flex-1 overflow-auto px-5 pb-5">
              {gerandoAtivo ? (
                // em geração (desta aba, do auto-run ou do servidor) — NUNCA
                // mostrar "Falha"/vazio enquanto ainda está gerando
                <p className="flex items-center justify-center gap-2 py-12 text-sm text-tertiary">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" /> Gerando {STEP_META[ativo].label}…
                </p>
              ) : ativoPronto ? (
                <>
                  {atual?.error_message && (
                    <p className="mb-4 rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-xs text-gold-700">
                      A última regeneração falhou — exibindo a versão anterior. Use “Regerar” para tentar de novo.
                    </p>
                  )}
                  <StepContent stepKey={ativo} content={atual?.content} />
                </>
              ) : atual?.status === "error" ? (
                <p className="py-10 text-center text-sm text-danger">Falha ao gerar. Use “Gerar” para tentar de novo.</p>
              ) : (
                <p className="py-10 text-center text-sm text-secondary">{summaries[ativo] ?? "Aguardando geração…"}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="pointer-events-none absolute bottom-5 left-1/2 z-30 -translate-x-1/2 font-mono text-2xs uppercase tracking-widest text-st-ink-3">
            Clique numa etapa da roda para abrir o conteúdo
          </p>
        )}
    </div>
  );
}
