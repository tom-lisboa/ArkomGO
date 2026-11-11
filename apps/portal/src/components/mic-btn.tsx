"use client";

// MicBtn — ditado por voz compartilhado (extraído do genesis/builder-wizard).
//
// Dois caminhos:
//   · live    — Web Speech API (transcrição AO VIVO do navegador, sem custo) —
//               Chrome/Edge/Safari.
//   · whisper — MediaRecorder grava e o servidor transcreve via OpenAI Whisper
//               (endpoint /genesis/api/transcrever → bai_builder-stt ou
//               OPENAI_API_KEY local) — cobre Firefox/webviews e dá qualidade
//               superior de PT-BR.
//
// `prefer` escolhe o caminho primário quando ambos existem:
//   "live" (default, comportamento original do Genesis) ou "whisper"
//   (o Gestor usa este — Whisper primeiro, Web Speech só como fallback).

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

type RecAlt = { transcript: string };
type RecResult = ArrayLike<RecAlt> & { isFinal: boolean };
type RecEvent = { resultIndex: number; results: ArrayLike<RecResult> };
type RecErr = { error?: string };
const subscribeNoop = () => () => {};
const snapshotTrue = () => true;
const snapshotFalse = () => false;

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
  // evita mismatch de hidratação (window só no cliente): false no SSR, true no client
  const montado = useSyncExternalStore(subscribeNoop, snapshotTrue, snapshotFalse);
  const recRef = useRef<Rec | null>(null);
  const baseRef = useRef("");
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

// disponibilidade da transcrição server-side (1 consulta por endpoint por sessão de página)
const sttEnabledPromises = new Map<string, Promise<boolean>>();
function sttDisponivel(endpoint: string): Promise<boolean> {
  let p = sttEnabledPromises.get(endpoint);
  if (!p) {
    p = fetch(endpoint)
      .then((r) => (r.ok ? (r.json() as Promise<{ enabled?: boolean }>) : { enabled: false }))
      .then((j) => !!j.enabled)
      .catch(() => false);
    sttEnabledPromises.set(endpoint, p);
  }
  return p;
}

const GRAVACAO_MAX_MS = 120_000; // ~2 min — o limite do endpoint acompanha

// whisper: grava com MediaRecorder e transcreve no servidor (OpenAI Whisper)
function useDitadoGravado(opts: {
  endpoint: string;
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
  const { endpoint } = opts;

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
    void sttDisponivel(endpoint).then((ok) => {
      if (vivo) setDisponivel(ok);
    });
    return () => {
      vivo = false;
    };
  }, [endpoint]);

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
      const res = await fetch(endpoint, { method: "POST", body: form });
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

export function MicBtn({
  value,
  onChange,
  onBloqueado,
  onErro,
  endpoint = "/genesis/api/transcrever",
  prefer = "live",
}: {
  value: string;
  onChange: (t: string) => void;
  onBloqueado: () => void;
  onErro: (msg: string) => void;
  /** rota de transcrição server-side (GET {enabled} · POST FormData{audio}) */
  endpoint?: string;
  /** caminho primário quando ambos existem: Web Speech ("live") ou Whisper ("whisper") */
  prefer?: "live" | "whisper";
}) {
  const live = useDitado({ getBase: () => value, onText: onChange, onBloqueado });
  const gravado = useDitadoGravado({ endpoint, getBase: () => value, onText: onChange, onBloqueado, onErro });
  // "live": Web Speech tem prioridade (comportamento original do Genesis).
  // "whisper": gravação + Whisper primeiro; Web Speech só se o STT não estiver
  // configurado no servidor (o probe resolve async — até lá, cai no live).
  const usaLive = live.suportado && (prefer === "live" || !gravado.disponivel);
  const suportado = live.suportado || gravado.disponivel;
  const ouvindo = usaLive ? live.ouvindo : gravado.gravando;
  const toggle = usaLive ? live.toggle : gravado.toggle;
  const transcrevendo = !usaLive && gravado.transcrevendo;
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
