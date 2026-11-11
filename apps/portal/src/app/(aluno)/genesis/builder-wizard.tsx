"use client";

// Chat "Genesis" — jornada modelada no builder do VdI:
// input (composer + histórico) → loading (loader animado) → questions (cadenciadas, 1 por
// vez, tela cheia, com microfone) → ready ("Pronto para gerar?") → loading → /solucao/:id.

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Mic, Plus, Sparkles, X, Zap } from "lucide-react";
import { Badge, Button, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { AnalyzeResult, StepKey } from "@/lib/builder-types";
import { analisarIdeia, criarSolucao, maisPerguntas } from "./actions";
import { SolutionWheel } from "./solution/[id]/solution-wheel";

type Estado = "input" | "loading" | "questions" | "ready";
type Pergunta = AnalyzeResult["questions"][number];
type HistItem = { id: number; title: string | null; original_idea: string; status: string };
type LoaderInfo = { title: string; subtitle: string; step: string };

const SUGESTOES = [
  "Qualificar leads do Instagram e enviar propostas por WhatsApp",
  "SDR com IA que agenda reuniões automaticamente",
  "Dashboard financeiro que categoriza gastos sozinho",
  "Automação de cobrança recorrente via WhatsApp",
];

// ============================ ditado por voz ============================
// 1º caminho: Web Speech API (transcrição AO VIVO do navegador, sem custo) —
// Chrome/Edge/Safari. 2º caminho (fallback): MediaRecorder grava e o servidor
// transcreve via OpenAI (/genesis/api/transcrever, requer OPENAI_API_KEY) —
// cobre Firefox e webviews sem SpeechRecognition.
type RecAlt = { transcript: string };
type RecResult = ArrayLike<RecAlt> & { isFinal: boolean };
type RecEvent = { resultIndex: number; results: ArrayLike<RecResult> };
type RecErr = { error?: string };
type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: RecEvent) => void;
  onend: () => void;
  onerror: (e: RecErr) => void;
  start: () => void;
  stop: () => void;
};

// transcrição AO VIVO (interim + contínuo), com base = texto já digitado; detecta bloqueio.
function useDitado(opts: { getBase: () => string; onText: (full: string) => void; onBloqueado: () => void }) {
  const { getBase, onText, onBloqueado } = opts;
  const [ouvindo, setOuvindo] = useState(false);
  const [montado, setMontado] = useState(false); // evita mismatch de hidratação (window só no cliente)
  const recRef = useRef<Rec | null>(null);
  const baseRef = useRef("");
  useEffect(() => setMontado(true), []);
  const w =
    typeof window !== "undefined"
      ? (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec })
      : undefined;
  const Ctor = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
  const suportado = montado && !!Ctor;

  async function toggle() {
    if (!Ctor) return;
    if (ouvindo && recRef.current) {
      recRef.current.stop();
      return;
    }
    // pede permissão explicitamente → detecta microfone BLOQUEADO antes de iniciar
    try {
      const md = navigator.mediaDevices;
      if (md?.getUserMedia) {
        const stream = await md.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch {
      onBloqueado();
      return;
    }
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.interimResults = true;
    rec.continuous = true;
    baseRef.current = getBase();
    let finais = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const seg = e.results[i];
        const txt = seg[0]?.transcript ?? "";
        if (seg.isFinal) finais += `${txt} `;
        else interim += txt;
      }
      const base = baseRef.current;
      const dito = `${finais}${interim}`.replace(/\s+/g, " ").trim();
      onText(base ? `${base} ${dito}`.trim() : dito);
    };
    rec.onend = () => setOuvindo(false);
    rec.onerror = (e) => {
      setOuvindo(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") onBloqueado();
    };
    recRef.current = rec;
    setOuvindo(true);
    try {
      rec.start();
    } catch {
      setOuvindo(false);
    }
  }
  return { suportado, ouvindo, toggle };
}

// disponibilidade do fallback de transcrição (1 consulta por sessão de página)
let sttEnabledPromise: Promise<boolean> | null = null;
function sttDisponivel(): Promise<boolean> {
  sttEnabledPromise ??= fetch("/genesis/api/transcrever")
    .then((r) => (r.ok ? (r.json() as Promise<{ enabled?: boolean }>) : { enabled: false }))
    .then((j) => !!j.enabled)
    .catch(() => false);
  return sttEnabledPromise;
}

const GRAVACAO_MAX_MS = 120_000; // ~2 min — o limite do endpoint acompanha

// fallback: grava com MediaRecorder e transcreve no servidor (OpenAI Whisper)
function useDitadoGravado(opts: {
  getBase: () => string;
  onText: (full: string) => void;
  onBloqueado: () => void;
  onErro: (msg: string) => void;
}) {
  // refs "latest": a base do campo é lida no momento em que a transcrição CONCLUI —
  // texto digitado DURANTE a gravação/transcrição é preservado, nunca sobrescrito
  const getBaseRef = useRef(opts.getBase);
  const onTextRef = useRef(opts.onText);
  const onErroRef = useRef(opts.onErro);
  const onBloqueadoRef = useRef(opts.onBloqueado);
  getBaseRef.current = opts.getBase;
  onTextRef.current = opts.onText;
  onErroRef.current = opts.onErro;
  onBloqueadoRef.current = opts.onBloqueado;

  const [disponivel, setDisponivel] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iniciandoRef = useRef(false); // guard SÍNCRONO: getUserMedia pendente ≠ segundo recorder
  const desmontouRef = useRef(false); // pós-unmount: para o mic e descarta o resultado

  useEffect(() => {
    // só consulta o servidor quando este caminho pode ser necessário
    if (typeof MediaRecorder === "undefined") return;
    let vivo = true;
    void sttDisponivel().then((ok) => {
      if (vivo) setDisponivel(ok);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // cleanup no unmount: solta o microfone imediatamente (privacidade) e descarta
  // qualquer transcrição pendente — o resultado iria para um campo que já sumiu
  useEffect(() => {
    desmontouRef.current = false;
    return () => {
      desmontouRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      const rec = recRef.current;
      if (rec && rec.state !== "inactive") rec.stop(); // onstop libera as tracks
    };
  }, []);

  async function transcrever(blob: Blob) {
    setTranscrevendo(true);
    try {
      const form = new FormData();
      form.append("audio", blob);
      const res = await fetch("/genesis/api/transcrever", { method: "POST", body: form });
      if (desmontouRef.current) return;
      const j = (await res.json().catch(() => null)) as { ok?: boolean; text?: string; error?: string } | null;
      if (!res.ok || !j?.ok) {
        onErroRef.current(j?.error ?? "Não foi possível transcrever o áudio. Tente novamente.");
        return;
      }
      const dito = (j.text ?? "").trim();
      const base = getBaseRef.current();
      if (dito) onTextRef.current(base ? `${base} ${dito}`.trim() : dito);
    } catch {
      if (!desmontouRef.current) onErroRef.current("Não foi possível transcrever o áudio. Tente novamente.");
    } finally {
      setTranscrevendo(false);
    }
  }

  async function toggle() {
    if (gravando) {
      recRef.current?.stop();
      return;
    }
    if (transcrevendo || iniciandoRef.current) return;
    iniciandoRef.current = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      iniciandoRef.current = false;
      onBloqueadoRef.current();
      return;
    }
    if (desmontouRef.current) {
      // desmontou enquanto o usuário decidia a permissão — solta o mic e sai
      stream.getTracks().forEach((t) => t.stop());
      iniciandoRef.current = false;
      return;
    }
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      stream.getTracks().forEach((t) => t.stop());
      setGravando(false);
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (!desmontouRef.current && blob.size > 0) void transcrever(blob);
    };
    recRef.current = rec;
    setGravando(true);
    rec.start();
    iniciandoRef.current = false;
    timerRef.current = setTimeout(() => {
      if (rec.state === "recording") rec.stop();
    }, GRAVACAO_MAX_MS);
  }

  return { disponivel, gravando, transcrevendo, toggle };
}

function MicBtn({
  value,
  onChange,
  onBloqueado,
  onErro,
}: {
  value: string;
  onChange: (t: string) => void;
  onBloqueado: () => void;
  onErro: (msg: string) => void;
}) {
  const live = useDitado({ getBase: () => value, onText: onChange, onBloqueado });
  const gravado = useDitadoGravado({ getBase: () => value, onText: onChange, onBloqueado, onErro });
  // Web Speech tem prioridade (ao vivo); senão, gravação + transcrição no servidor
  const suportado = live.suportado || gravado.disponivel;
  const ouvindo = live.suportado ? live.ouvindo : gravado.gravando;
  const toggle = live.suportado ? live.toggle : gravado.toggle;
  const transcrevendo = !live.suportado && gravado.transcrevendo;
  if (!suportado) return null;
  if (transcrevendo) {
    return (
      <span
        title="Transcrevendo…"
        aria-label="Transcrevendo áudio"
        style={{ height: 30, width: 30 }}
        className="inline-flex shrink-0 items-center justify-center rounded-full text-gold-700"
      >
        <Loader2 className="animate-spin" style={{ height: 16, width: 16 }} />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={toggle}
      title={ouvindo ? "Ouvindo… toque para parar" : "Ditar por voz"}
      aria-label={ouvindo ? "Parar ditado" : "Ditar por voz"}
      style={{ height: 30, width: 30 }}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full transition-colors",
        ouvindo ? "bg-gold-50 text-gold-700" : "text-tertiary hover:bg-surface-hover hover:text-secondary"
      )}
    >
      {ouvindo && <span className="absolute inset-0 rounded-full bg-accent/25 mic-ping" aria-hidden />}
      {ouvindo ? (
        <span className="relative flex items-end gap-[2px]" style={{ height: 13 }} aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="mic-bar rounded-full bg-gold-700" style={{ width: 2, animationDelay: `${i * 140}ms` }} />
          ))}
        </span>
      ) : (
        <Mic style={{ height: 16, width: 16 }} />
      )}
      <style>{`
        .mic-bar { height: 40%; animation: micBar .85s ease-in-out infinite; }
        .mic-ping { animation: micPing 1.4s cubic-bezier(0,0,.2,1) infinite; }
        @keyframes micBar { 0%,100%{height:28%} 50%{height:100%} }
        @keyframes micPing { 0%{transform:scale(1);opacity:.5} 100%{transform:scale(1.9);opacity:0} }
        @media (prefers-reduced-motion: reduce){ .mic-bar{animation:none;height:70%} .mic-ping{animation:none;opacity:0} }
      `}</style>
    </button>
  );
}

// A JORNADA acontece SOBRE O MAPA: a roda (nascente) é o palco fixo de fundo em
// TODOS os estados (composer / análise / perguntas / ready); um scrim garante a
// leitura e o conteúdo sobe por cima. Durante análise/geração (`busy`) a roda pulsa.
const EMPTY_STEPS: Record<string, never> = {};
const EMPTY_SET: ReadonlySet<StepKey> = new Set<StepKey>();

function Overlay({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <div className={`gx-journey${busy ? " is-busy" : ""}`}>
      <div className="gx-journey-wheel" aria-hidden>
        <SolutionWheel fill hideLabels steps={EMPTY_STEPS} gerando={EMPTY_SET} onSelect={() => {}} />
      </div>
      <div className="gx-journey-scrim" aria-hidden />
      <div className="gx-journey-content">{children}</div>
    </div>
  );
}

const ANALYZE_LOADER: LoaderInfo = {
  title: "Analisando sua ideia…",
  subtitle: "Mapeando as tecnologias ideais para o seu caso…",
  step: "Etapa 1 de 3 — Análise",
};
const MORE_LOADER: LoaderInfo = {
  title: "Preparando mais perguntas…",
  subtitle: "Aprofundando com base nas suas respostas…",
  step: "Perguntas complementares",
};
const GENERATE_LOADER: LoaderInfo = {
  title: "Projetando sua solução…",
  subtitle: "Montando ferramentas, arquitetura e plano de ação…",
  step: "Etapa 3 de 3 — Geração",
};

export function BuilderWizard({ historico = [] }: { historico?: HistItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [estado, setEstado] = useState<Estado>("input");
  const [idea, setIdea] = useState("");
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [respostas, setRespostas] = useState<string[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [expandiu, setExpandiu] = useState(false);
  const [loader, setLoader] = useState<LoaderInfo>(ANALYZE_LOADER);
  const [micBloqueado, setMicBloqueado] = useState(false);
  const [pending, start] = useTransition();

  const setRespostaAt = (i: number, val: string) => setRespostas((r) => r.map((v, j) => (j === i ? val : v)));
  const handleBloqueado = () => {
    setMicBloqueado(true);
    toast({ variant: "error", title: "Microfone bloqueado — libere o acesso ao microfone no navegador." });
  };
  const handleErroDitado = (msg: string) => toast({ variant: "error", title: msg });

  function analisar() {
    if (idea.trim().length < 30) {
      toast({ variant: "info", title: "Descreva a ideia com pelo menos 30 caracteres." });
      return;
    }
    setLoader(ANALYZE_LOADER);
    setEstado("loading");
    start(async () => {
      const res = await analisarIdeia(idea);
      if (!res.ok) {
        toast({ variant: "error", title: res.error });
        setEstado("input");
        return;
      }
      setPerguntas(res.result.questions);
      setRespostas(new Array(res.result.questions.length).fill(""));
      setQIndex(0);
      setExpandiu(false);
      setEstado("questions");
    });
  }

  function proxima() {
    if ((respostas[qIndex]?.trim() ?? "").length === 0) return;
    if (qIndex < perguntas.length - 1) setQIndex((i) => i + 1);
    else setEstado("ready");
  }

  function voltar() {
    if (qIndex === 0) setEstado("input");
    else setQIndex((i) => i - 1);
  }

  function responderMais() {
    setLoader(MORE_LOADER);
    setEstado("loading");
    start(async () => {
      const answers = perguntas.map((q, i) => ({ question: q.question, answer: respostas[i]?.trim() ?? "" }));
      const res = await maisPerguntas(idea, answers);
      if (!res.ok) {
        toast({ variant: "error", title: res.error });
        setEstado("ready");
        return;
      }
      const novas = res.questions ?? [];
      if (!novas.length) {
        setEstado("ready");
        return;
      }
      const base = perguntas.length;
      setPerguntas((p) => [...p, ...novas]);
      setRespostas((r) => [...r, ...new Array(novas.length).fill("")]);
      setExpandiu(true);
      setQIndex(base);
      setEstado("questions");
    });
  }

  function gerar() {
    const answers = perguntas.map((q, i) => ({ question: q.question, answer: respostas[i]?.trim() ?? "" }));
    if (answers.some((a) => a.answer.length === 0)) {
      toast({ variant: "info", title: "Responda todas as perguntas para gerar a solução." });
      setEstado("questions");
      return;
    }
    setLoader(GENERATE_LOADER);
    setEstado("loading");
    start(async () => {
      const res = await criarSolucao(idea, answers);
      if (!res.ok) {
        toast({ variant: "error", title: res.error });
        setEstado("ready");
        return;
      }
      router.push(`/genesis/solution/${res.solutionId}`);
    });
  }

  // ===== loader (análise / mais perguntas / geração) — a RODA pulsa ao fundo =====
  if (estado === "loading") {
    return (
      <Overlay busy>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="gx-canvas-drawer gx-drawer-in rounded-2xl border border-st-line-2 px-8 py-7 shadow-modal">
            <h2 className="font-display text-2xl font-bold tracking-display text-primary sm:text-3xl">{loader.title}</h2>
            <p className="mt-2 text-sm text-tertiary">{loader.subtitle}</p>
            <div className="mx-auto mt-4 h-px w-40 bg-border" />
            <p className="mt-4 font-mono text-2xs uppercase tracking-ultra text-tertiary">{loader.step}</p>
          </div>
        </div>
      </Overlay>
    );
  }

  // ===== perguntas cadenciadas (uma por vez, tela cheia) =====
  if (estado === "questions" && perguntas.length > 0) {
    const q = perguntas[qIndex];
    const total = perguntas.length;
    const pct = Math.round(((qIndex + 1) / total) * 100);
    const resp = respostas[qIndex] ?? "";
    const podeAvancar = resp.trim().length > 0;
    const ultima = qIndex === total - 1;
    return (
      <Overlay>
        <div className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6">
        <div className="gx-canvas-drawer flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-st-line-2 shadow-modal">
        {/* barra superior */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <span className="inline-flex items-center gap-2 font-display text-sm font-bold tracking-display text-primary">
            <Sparkles className="h-4 w-4 text-accent" /> Genesis
          </span>
          <button
            type="button"
            onClick={() => setEstado("input")}
            aria-label="Fechar"
            className="text-tertiary transition-colors hover:text-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* progresso */}
        <div className="shrink-0 px-5 pt-5 sm:px-6">
          <div className="mb-2 flex items-center justify-between font-mono text-2xs uppercase tracking-widest text-tertiary">
            <span>
              Pergunta {qIndex + 1} de {total} · obrigatória
            </span>
            <span className="tabular-nums text-secondary">{pct}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* corpo (rola dentro do card) */}
        <div className="gx-scroll min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          <div className="mb-6 inline-flex w-fit max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs">
            <span className="font-medium text-secondary">Sua ideia:</span>
            <span className="line-clamp-1 text-tertiary">{idea}</span>
          </div>

          <div className="mb-4 flex items-center gap-3">
            <span className="font-display text-4xl font-bold tabular-nums leading-none text-tertiary">
              {String(qIndex + 1).padStart(2, "0")}
            </span>
            {q.category && <Badge variant="gold-dim">{q.category}</Badge>}
          </div>
          <h2 className="font-display text-2xl font-bold leading-tight tracking-display text-primary sm:text-[2rem]">
            {q.question}
          </h2>
          {q.why_important && <p className="mt-2.5 text-sm leading-relaxed text-tertiary">{q.why_important}</p>}

          <div className="relative mt-6">
            <textarea
              value={resp}
              onChange={(e) => setRespostaAt(qIndex, e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  proxima();
                }
              }}
              rows={4}
              maxLength={2000}
              autoFocus
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 pr-12 text-base leading-relaxed text-primary outline-none transition-colors focus:border-border-strong"
              placeholder="Sua resposta… (ou use o microfone)"
            />
            <div className="absolute right-2.5 top-2.5">
              {/* key={qIndex}: trocar de pergunta REMONTA o botão — o cleanup do hook
                  para uma gravação ativa, evitando ditado entregue à pergunta errada */}
              <MicBtn key={qIndex} value={resp} onChange={(t) => setRespostaAt(qIndex, t)} onBloqueado={handleBloqueado} onErro={handleErroDitado} />
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between font-mono text-2xs text-tertiary">
            <span>
              {micBloqueado ? (
                <span className="text-danger">Microfone bloqueado — libere o acesso no navegador.</span>
              ) : (
                <span className="hidden sm:inline">⌘/Ctrl + Enter para avançar</span>
              )}
            </span>
            <span className="tabular-nums">{resp.length}/2000</span>
          </div>

          {/* navegação */}
          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" size="md" onClick={voltar} disabled={pending}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> {qIndex === 0 ? "Voltar" : "Anterior"}
            </Button>
            <Button variant="accent" size="lg" onClick={proxima} disabled={pending || !podeAvancar}>
              {ultima ? "Revisar" : "Próxima"} <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>

          {/* paginação */}
          <div className="mt-7 flex items-center justify-center gap-1.5">
            {perguntas.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === qIndex ? "w-6 bg-accent" : respostas[i]?.trim() ? "w-1.5 bg-gold-700/60" : "w-1.5 bg-border"
                )}
              />
            ))}
          </div>
        </div>
        </div>
        </div>
      </Overlay>
    );
  }

  // ===== "Pronto para gerar?" =====
  if (estado === "ready") {
    const respondidas = respostas.filter((r) => r?.trim()).length;
    return (
      <Overlay>
        <div className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="gx-canvas-drawer flex w-full max-w-2xl flex-col items-center gap-7 rounded-2xl border border-st-line-2 p-8 text-center shadow-modal">
          <span
            style={{ height: 56, width: 56 }}
            className="flex items-center justify-center rounded-2xl border border-accent bg-gold-50 text-gold-700"
          >
            <Zap style={{ height: 26, width: 26 }} />
          </span>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-display text-primary sm:text-3xl">
              Pronto para gerar?
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-secondary">
              Você respondeu {respondidas} pergunta{respondidas === 1 ? "" : "s"}. Pode gerar agora ou responder mais
              para uma solução ainda mais precisa.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={gerar}
              disabled={pending}
              className="group flex flex-col items-start gap-3 rounded-2xl border border-accent bg-gold-50 p-5 text-left transition-all hover:shadow-card disabled:opacity-60"
            >
              <span
                style={{ height: 44, width: 44 }}
                className="flex items-center justify-center rounded-xl bg-accent/15 text-gold-700"
              >
                <Zap style={{ height: 22, width: 22 }} />
              </span>
              <span className="font-display text-base font-bold text-primary">Gerar agora</span>
              <span className="text-xs leading-relaxed text-secondary">
                A IA já tem informações suficientes para projetar sua solução.
              </span>
            </button>

            {!expandiu ? (
              <button
                type="button"
                onClick={responderMais}
                disabled={pending}
                className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-5 text-left transition-all hover:border-border-strong disabled:opacity-60"
              >
                <span
                  style={{ height: 44, width: 44 }}
                  className="flex items-center justify-center rounded-xl border border-border text-secondary"
                >
                  <Plus style={{ height: 22, width: 22 }} />
                </span>
                <span className="font-display text-base font-bold text-primary">Responder mais</span>
                <span className="text-xs leading-relaxed text-secondary">
                  +5 perguntas para uma solução ainda mais detalhada.
                </span>
              </button>
            ) : (
              <div className="flex flex-col items-start justify-center gap-2 rounded-2xl border border-dashed border-border p-5 text-left">
                <span className="font-display text-base font-bold text-primary">Bem detalhado!</span>
                <span className="text-xs leading-relaxed text-tertiary">
                  Você já respondeu as complementares. É só gerar.
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setQIndex(perguntas.length - 1);
              setEstado("questions");
            }}
            disabled={pending}
            className="font-mono text-2xs uppercase tracking-ultra text-tertiary transition-colors hover:text-secondary"
          >
            Voltar para a pergunta anterior
          </button>
        </div>
        </div>
      </Overlay>
    );
  }

  // ===== input (composer + histórico) SOBRE o mapa =====
  return (
    <Overlay>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-10 sm:px-8">
        {/* logo Genesis (a marca é o hero) */}
        <div className="mb-8 flex flex-col items-center">
          <h1 className="sr-only">Genesis</h1>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/genesis/logo-light.png" alt="" className="genesis-logo-light w-full max-w-md px-4 sm:px-0" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/genesis/logo-dark.png" alt="" className="genesis-logo-dark w-full max-w-md px-4 sm:px-0" />
        </div>

      <div className="gx-canvas-drawer rounded-2xl border border-st-line-2 p-6 shadow-modal sm:p-8">
        <label className="mb-3 flex items-center gap-2 text-base font-semibold text-primary">
          <Sparkles className="h-5 w-5 text-accent" /> O que vamos construir?
        </label>
        <div className="relative">
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                analisar();
              }
            }}
            rows={4}
            maxLength={2000}
            className="w-full rounded-xl border border-border bg-canvas px-4 py-3 pr-12 text-base leading-relaxed text-primary outline-none transition-colors focus:border-border-strong"
            placeholder="Ex: Quero automatizar a qualificação de leads que chegam pelo Instagram e enviar propostas por WhatsApp…"
          />
          <div className="absolute right-2.5 top-2.5">
            <MicBtn value={idea} onChange={setIdea} onBloqueado={handleBloqueado} onErro={handleErroDitado} />
          </div>
        </div>
        {micBloqueado && (
          <p className="mt-2 font-mono text-2xs text-danger">
            Microfone bloqueado — libere o acesso ao microfone nas configurações do navegador e recarregue.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGESTOES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setIdea(s)}
              className="rounded-full border border-border bg-canvas px-3 py-1.5 text-xs text-secondary transition-colors hover:border-border-strong hover:text-primary"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <span className="font-mono text-2xs tabular-nums text-tertiary">{idea.length}/2000</span>
          <Button variant="accent" size="lg" onClick={analisar} disabled={pending}>
            Analisar ideia <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>

      {historico.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-mono text-2xs uppercase tracking-ultra text-tertiary">Suas soluções</h2>
            <span className="font-mono text-2xs tabular-nums text-tertiary">{historico.length}</span>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {historico.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/genesis/solution/${s.id}`}
                  className="group flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 transition-all hover:border-border-strong hover:bg-surface-hover"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-semibold leading-snug text-primary">
                      {s.title ?? s.original_idea.slice(0, 60)}
                    </span>
                    <Badge variant={s.status === "completed" ? "success" : "neutral"}>
                      {s.status === "completed" ? "concluída" : "em progresso"}
                    </Badge>
                  </div>
                  <span className="line-clamp-2 text-xs leading-relaxed text-tertiary">
                    {s.original_idea.slice(0, 120)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </Overlay>
  );
}
