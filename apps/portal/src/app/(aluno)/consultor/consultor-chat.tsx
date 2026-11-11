"use client";

// Chat "Gestor IA" — skin 100% tokens do shell (st-*), mesma gramática das
// Capacitações: cards rounded-14 sobre --st-card com hairline --st-line-2,
// relevo --st-elev-* (bevel + rest, hover ring + lift), micro-labels mono
// uppercase, display serif (Marcellus) no hero, acento cobre (gold-700) como
// assinatura. A mídia dos cards segue o idioma MediaSurface: capa com scrim,
// e fallback para glow do acento do item — nunca um ícone de imagem quebrada.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  History,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Presentation,
  Printer,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ArkomOrb } from "@/components/ArkomLogo";
import { MicBtn } from "@/components/mic-btn";
import {
  FASES_PLANO,
  type ChatResponse,
  type ConsultorCard,
  type ConsultorJourneyItem,
  type ConsultorMessage,
  type ConsultorMode,
  type ConsultorThread,
  type PlanoEstrategico,
  type ThreadResponse,
} from "@/lib/consultor/tipos";

const KIND_LABEL: Record<ConsultorCard["kind"], string> = {
  solucao: "Solução",
  curso: "Curso",
  aula: "Aula",
  genesis: "Genesis",
};

/** Variações do loader, sorteadas a cada turno (a espera não repete a mesma fala). */
type LoaderVariant = { titulo: string; passos: string[] };
const LOADER_VARIANTS: Record<ConsultorMode, LoaderVariant[]> = {
  consultor: [
    {
      titulo: "Preparando recomendações",
      passos: ["Lendo o seu contexto", "Cruzando com o catálogo", "Organizando os próximos passos"],
    },
    {
      titulo: "Escolhendo por onde começar",
      passos: ["Relendo o que você contou", "Separando o que resolve agora", "Priorizando o caminho"],
    },
    {
      titulo: "Afinando a recomendação",
      passos: ["Amarrando ao seu cenário", "Comparando as opções do catálogo", "Fechando a indicação"],
    },
    {
      titulo: "Consultando o catálogo",
      passos: ["Mapeando a sua dor", "Filtrando soluções e aulas", "Montando a resposta"],
    },
    {
      titulo: "Pensando no seu caso",
      passos: ["Revendo a conversa", "Buscando o encaixe certo", "Escrevendo a recomendação"],
    },
  ],
  planejamento: [
    {
      titulo: "Cronograma de IAtização",
      passos: ["Lendo o seu contexto", "Cruzando com o catálogo", "Montando o roadmap"],
    },
    {
      titulo: "Entendendo o seu cenário",
      passos: ["Organizando os sinais", "Checando o que falta perguntar", "Preparando o próximo passo"],
    },
    {
      titulo: "Desenhando as fases",
      passos: ["Priorizando por impacto", "Distribuindo em 4 fases", "Calibrando o esforço"],
    },
    {
      titulo: "Fechando o diagnóstico",
      passos: ["Amarrando negócio, objetivo e dor", "Escolhendo os itens do catálogo", "Escrevendo o racional"],
    },
  ],
};

const FALLBACK_ACCENT = "#c58b5f";

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 5) return "Boa noite";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/* ── átomos de tipografia (idioma das Capacitações) ───────────────────────── */

function MicroLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-st-ink-3",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── mídia do card — idioma MediaSurface: capa OU glow do acento ──────────── */

function CardMedia({ thumb, accent, titulo }: { thumb?: string; accent?: string; titulo: string }) {
  // Capa ausente/negada (404 no bucket, 401 sem sessão) cai para o glow do
  // acento do item em vez de mostrar um ícone de imagem quebrada.
  const [errored, setErrored] = useState(false);
  const cor = accent || FALLBACK_ACCENT;
  const showThumb = Boolean(thumb) && !errored;
  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden bg-st-card"
      style={
        showThumb
          ? undefined
          : { backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${cor}26 0%, transparent 62%)` }
      }
    >
      {showThumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="select-none text-[22px] font-[650] leading-none tracking-[-0.02em]"
          style={{ color: cor, opacity: 0.85 }}
        >
          {titulo.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}

/* ── card de recomendação — o coração da página (relevo cap-elev) ─────────── */

function RecommendationCard({ card }: { card: ConsultorCard }) {
  return (
    <Link
      href={card.url}
      className="consultor-elev group relative flex gap-4 rounded-[14px] border border-st-line-2 bg-st-card p-3.5"
    >
      <div className="relative h-[64px] w-[96px] shrink-0 overflow-hidden rounded-[10px] border border-st-line">
        <CardMedia thumb={card.thumb} accent={card.accent} titulo={card.titulo} />
      </div>
      <div className="min-w-0 flex-1 pr-5">
        <div className="flex items-baseline gap-2">
          <span
            className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: card.accent || FALLBACK_ACCENT }}
          >
            {KIND_LABEL[card.kind]}
          </span>
          {card.meta ? (
            <span className="truncate font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-st-ink-3">
              {card.meta}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-[15px] font-[650] leading-snug tracking-[-0.01em] text-st-ivory">
          {card.titulo}
        </p>
        <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-st-ink-2">
          {card.motivo || card.desc}
        </p>
        {card.resultado ? (
          <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-st-ink-2">
            <span className="mr-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-gold-700">
              Resultado
            </span>
            {card.resultado}
          </p>
        ) : null}
      </div>
      <ArrowUpRight
        className="absolute right-3.5 top-3.5 size-3.5 text-st-ink-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        strokeWidth={2}
        aria-hidden
      />
    </Link>
  );
}

/* ── bolhas ───────────────────────────────────────────────────────────────── */

function AssistantAvatar() {
  return (
    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-st-line-2 bg-st-card">
      <ArkomOrb size={15} />
    </span>
  );
}

function MessageRow({ msg }: { msg: ConsultorMessage }) {
  if (msg.role === "user") {
    return (
      <div className="consultor-in flex justify-end">
        <p
          className="max-w-[85%] whitespace-pre-wrap rounded-[16px] rounded-br-[5px] bg-st-copper px-4 py-2.5 text-[13.5px] leading-relaxed text-st-copper-ink sm:max-w-[70%]"
          style={{ boxShadow: "var(--st-elev-bevel)" }}
        >
          {msg.content}
        </p>
      </div>
    );
  }
  return (
    <div className="consultor-in flex flex-col gap-3.5">
      <div className="flex items-start gap-3">
        <AssistantAvatar />
        <p className="max-w-[62ch] whitespace-pre-wrap pt-0.5 text-[14px] leading-[1.75] text-st-ivory">
          {msg.content}
        </p>
      </div>
      {msg.cards.length > 0 ? (
        <div className="ml-10 flex max-w-[560px] flex-col gap-2.5">
          {msg.cards.map((card) => (
            <RecommendationCard key={`${msg.id}-${card.kind}-${card.ref}`} card={card} />
          ))}
        </div>
      ) : null}
      {msg.followup ? (
        <div className="ml-10 max-w-[62ch] border-l border-st-line-2 pl-3.5">
          <p className="text-[14px] font-[550] leading-relaxed text-st-ivory">{msg.followup}</p>
        </div>
      ) : null}
    </div>
  );
}

/* ── loader cadenciado (os 3 passos avançam enquanto o LLM pensa) ─────────── */

function ProgressCard({ mode }: { mode: ConsultorMode }) {
  // sorteia a variação UMA vez por montagem (cada turno de espera fala diferente)
  const [variant] = useState<LoaderVariant>(() => {
    const pool = LOADER_VARIANTS[mode];
    return pool[Math.floor(Math.random() * pool.length)];
  });
  const steps = variant.passos;
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 2600);
    return () => clearInterval(timer);
  }, [steps.length]);
  return (
    <div
      className="consultor-in w-full max-w-[400px] rounded-[14px] border border-st-line-2 bg-st-card p-4"
      style={{ boxShadow: "var(--st-elev-bevel), var(--st-elev-rest)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <MicroLabel className="text-st-ink-2">{variant.titulo}</MicroLabel>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-st-ink-3">
          10–30s
        </span>
      </div>
      <ul className="mt-3.5 flex flex-col gap-2.5">
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-2.5">
            <span className="flex size-4 shrink-0 items-center justify-center">
              {i < step ? (
                <Check className="size-3.5 text-gold-700" strokeWidth={2.5} />
              ) : i === step ? (
                <Loader2 className="size-3.5 animate-spin text-gold-700" strokeWidth={2.2} />
              ) : (
                <span className="size-[5px] rounded-full bg-st-ink-3/50" />
              )}
            </span>
            <span
              className={cn(
                "text-[12.5px] leading-none transition-colors",
                i <= step ? "text-st-ivory" : "text-st-ink-3",
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── painel "Sua Jornada" ─────────────────────────────────────────────────── */

function JourneyPanel({ journey }: { journey: ConsultorJourneyItem[] }) {
  return (
    <aside className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-st-line pb-3">
        <MicroLabel className="tracking-[0.18em]">Sua jornada</MicroLabel>
        {journey.length > 0 ? (
          <span className="font-mono text-[10px] tabular-nums text-st-ink-3">{journey.length}</span>
        ) : null}
      </div>
      {journey.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-st-ink-3">
          Cada recomendação do Gestor entra aqui, na ordem da conversa.
        </p>
      ) : (
        <ol className="relative flex flex-col gap-2.5 border-l border-st-line pl-4">
          {journey.map((item) => (
            <li key={item.id} className="relative">
              <span
                className="absolute -left-[20.5px] top-[18px] size-[7px] rounded-full bg-gold-700"
                aria-hidden
              />
              <Link
                href={item.url}
                className="group flex flex-col gap-1 rounded-[12px] border border-st-line bg-st-card p-3 transition-colors hover:border-st-line-2 hover:bg-st-card-2"
              >
                <MicroLabel className="text-[9px]">{KIND_LABEL[item.kind]}</MicroLabel>
                <span className="text-[13px] font-[600] leading-snug tracking-[-0.01em] text-st-ivory">
                  {item.titulo}
                </span>
                {item.motivo ? (
                  <span className="line-clamp-2 text-[11.5px] leading-relaxed text-st-ink-3">
                    {item.motivo}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

/* ── painel "Cronograma de IAtização" — o roadmap em 4 fases ──────────────── */

function PlanPanel({
  plan,
  onToggle,
  onMove,
  onRegenerate,
  regenerandoFase,
  onExportPdf,
  presentHref,
}: {
  plan: PlanoEstrategico | null;
  onToggle: (fase: number, item: number, done: boolean) => void;
  onMove: (fase: number, from: number, to: number) => void;
  onRegenerate: (fase: number) => void;
  regenerandoFase: number | null;
  onExportPdf: () => void;
  /** rota da apresentação em tela cheia (A Constelação) — null sem thread */
  presentHref: string | null;
}) {
  // esqueleto: a entrevista ainda não captou os sinais
  if (!plan) {
    return (
      <aside className="flex flex-col gap-4">
        <div className="border-b border-st-line pb-3">
          <MicroLabel className="tracking-[0.18em]">Cronograma de IAtização</MicroLabel>
        </div>
        <p className="text-[12px] leading-relaxed text-st-ink-3">
          Vou montar seu roadmap aqui assim que entender o cenário. A conversa capta três sinais, o
          negócio, o objetivo e a dor principal, e o plano sai em 4 fases com itens do catálogo.
        </p>
        <ol className="flex flex-col gap-2">
          {FASES_PLANO.map((nome, i) => (
            <li
              key={nome}
              className="flex items-center gap-3 rounded-[12px] border border-dashed border-st-line px-3.5 py-3"
            >
              <span className="font-mono text-[10px] tabular-nums text-st-ink-3">{i + 1}</span>
              <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-st-ink-3">
                {nome}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-[11.5px] leading-relaxed text-st-ink-3">
          Responda no chat ao lado. Sem formulário, só conversa.
        </p>
      </aside>
    );
  }

  const total = plan.fases.reduce((n, f) => n + f.itens.length, 0);
  const feitos = plan.fases.reduce((n, f) => n + f.itens.filter((i) => i.done).length, 0);
  const pct = total ? Math.round((feitos / total) * 100) : 0;

  return (
    <aside className="flex flex-col gap-4">
      <div className="border-b border-st-line pb-3">
        <div className="flex items-center justify-between gap-2">
          <MicroLabel className="tracking-[0.18em]">Cronograma de IAtização</MicroLabel>
          <div className="flex items-center gap-1.5">
            {presentHref ? (
              <Link
                href={presentHref}
                title="Apresentar o plano em tela cheia"
                className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-st-line bg-st-card px-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-gold-700 transition-colors hover:border-st-line-2 hover:text-st-ivory"
              >
                <Presentation className="size-3" strokeWidth={2} /> Apresentar
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onExportPdf}
              title="Exportar o roadmap em PDF"
              className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-st-line bg-st-card px-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-st-ink-2 transition-colors hover:border-st-line-2 hover:text-st-ivory"
            >
              <Printer className="size-3" strokeWidth={2} /> PDF
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[14px] font-[650] leading-snug tracking-[-0.01em] text-st-ivory">
          {plan.titulo}
        </p>
        <div className="mt-2.5 flex items-center gap-2.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-st-line">
            <div
              className="h-full rounded-full bg-gold-700 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-[10px] tabular-nums text-st-ink-3">
            {feitos}/{total} · {pct}%
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {plan.fases.map((fase, f) => {
          const done = fase.itens.filter((i) => i.done).length;
          const regenerando = regenerandoFase === f;
          return (
            <section key={fase.nome + f} className={cn(regenerando && "opacity-60")}>
              <div className="flex items-center justify-between gap-2">
                <MicroLabel className="text-gold-700">Fase {f + 1}</MicroLabel>
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] tabular-nums text-st-ink-3">
                    {done}/{fase.itens.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRegenerate(f)}
                    disabled={regenerandoFase !== null}
                    title="Gerar uma nova versão desta fase"
                    aria-label={`Gerar nova versão da fase ${f + 1}`}
                    className="flex size-5 items-center justify-center rounded-full text-st-ink-3 transition-colors hover:bg-st-card-2 hover:text-st-ivory disabled:pointer-events-none disabled:opacity-40"
                  >
                    <RefreshCw
                      className={cn("size-3", regenerando && "animate-spin text-gold-700")}
                      strokeWidth={2.2}
                    />
                  </button>
                </span>
              </div>
              <p className="mt-1 text-[12px] font-[600] leading-snug tracking-[-0.01em] text-st-ivory">
                {fase.objetivo}
              </p>
              {fase.itens.length === 0 ? (
                <p className="mt-2.5 rounded-[12px] border border-dashed border-st-line px-3.5 py-3 text-[11.5px] leading-relaxed text-st-ink-3">
                  Sem itens do catálogo nesta fase ainda. Gere uma nova versão dela.
                </p>
              ) : (
                <ul className="mt-2.5 flex flex-col gap-2">
                  {fase.itens.map((item, i) => (
                    <li
                      key={`${item.kind}-${item.ref}`}
                      className={cn(
                        "flex gap-2.5 rounded-[12px] border border-st-line bg-st-card p-3 transition-opacity",
                        item.done && "opacity-55",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onToggle(f, i, !item.done)}
                        aria-label={item.done ? "Desmarcar item" : "Marcar item como feito"}
                        className={cn(
                          "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors",
                          item.done
                            ? "border-gold-700 bg-gold-700 text-white"
                            : "border-st-line-2 hover:border-gold-700",
                        )}
                      >
                        {item.done ? <Check className="size-3" strokeWidth={3} /> : null}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span
                            className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em]"
                            style={{ color: item.accent || "#c58b5f" }}
                          >
                            {KIND_LABEL[item.kind]}
                          </span>
                          {item.esforco ? (
                            <span className="truncate font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-st-ink-3">
                              {item.esforco}
                            </span>
                          ) : null}
                        </div>
                        <Link
                          href={item.url}
                          className={cn(
                            "mt-0.5 block text-[12.5px] font-[600] leading-snug tracking-[-0.01em] text-st-ivory hover:underline",
                            item.done && "line-through decoration-st-ink-3",
                          )}
                        >
                          {item.titulo}
                        </Link>
                        {item.motivo ? (
                          <p className="mt-0.5 line-clamp-3 text-[11px] leading-relaxed text-st-ink-3">
                            {item.motivo}
                          </p>
                        ) : null}
                        {item.resultado ? (
                          <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-st-ink-2">
                            <span className="mr-1 font-mono text-[8.5px] font-semibold uppercase tracking-[0.12em] text-gold-700">
                              Resultado
                            </span>
                            {item.resultado}
                          </p>
                        ) : null}
                      </div>
                      {fase.itens.length > 1 ? (
                        <div className="flex shrink-0 flex-col items-center justify-center">
                          <button
                            type="button"
                            onClick={() => onMove(f, i, i - 1)}
                            disabled={i === 0 || regenerandoFase !== null}
                            aria-label="Mover item para cima"
                            className="flex size-4 items-center justify-center rounded text-st-ink-3 transition-colors hover:text-st-ivory disabled:pointer-events-none disabled:opacity-25"
                          >
                            <ChevronUp className="size-3.5" strokeWidth={2.2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onMove(f, i, i + 1)}
                            disabled={i === fase.itens.length - 1 || regenerandoFase !== null}
                            aria-label="Mover item para baixo"
                            className="flex size-4 items-center justify-center rounded text-st-ink-3 transition-colors hover:text-st-ivory disabled:pointer-events-none disabled:opacity-25"
                          >
                            <ChevronDown className="size-3.5" strokeWidth={2.2} />
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

/* ── folha de impressão do roadmap (Exportar PDF via window.print) ────────── */

const subscribeNoop = () => () => {};

/** Uma folha A4 do documento: cabeçalho corrente, conteúdo e rodapé de estado. */
function CpPagina({
  secao,
  folio,
  capa,
  titulo,
  pct,
  children,
}: {
  secao?: string;
  folio?: number;
  capa?: boolean;
  titulo: string;
  pct: number;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("cp-page", capa && "cp-page-capa")}>
      {capa ? null : (
        <header className="cp-phead">
          <span>
            <span className="cp-bdot" />
            Arkom · Gestor IA
          </span>
          <span>{secao}</span>
        </header>
      )}
      <div className="cp-pbody">{children}</div>
      {capa ? null : (
        <footer className="cp-pfoot">
          <span>
            {titulo} · {pct}% concluído
          </span>
          <span>{String(folio).padStart(2, "0")}</span>
        </footer>
      )}
    </section>
  );
}

/**
 * Card de entrega do Cronograma, DENTRO da conversa. É a porta principal:
 * aparece em qualquer largura (o painel lateral some abaixo de 768px) e
 * continua ali quando o aluno reabre a thread dias depois.
 */
function CronogramaEntregue({
  plan,
  href,
  onExportPdf,
}: {
  plan: PlanoEstrategico;
  href: string;
  onExportPdf: () => void;
}) {
  const total = plan.fases.reduce((n, f) => n + f.itens.length, 0);
  const feitos = plan.fases.reduce((n, f) => n + f.itens.filter((i) => i.done).length, 0);
  const pct = total ? Math.round((feitos / total) * 100) : 0;
  return (
    <div className="consultor-in flex items-start gap-3">
      <AssistantAvatar />
      <div className="consultor-elev min-w-0 flex-1 rounded-[14px] border border-st-line-2 bg-st-card p-4">
        <MicroLabel className="text-gold-700">Cronograma de IAtização pronto</MicroLabel>
        <p className="mt-1.5 text-[15px] font-[650] leading-snug tracking-[-0.01em] text-st-ivory">
          {plan.titulo}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-st-ink-2">
          {total} {total === 1 ? "ação" : "ações"} em {plan.fases.length} fases
          {feitos > 0 ? `, ${feitos} já ${feitos === 1 ? "concluída" : "concluídas"} (${pct}%)` : ""}.
          Abra em tela cheia pra apresentar, ou exporte em PDF.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={href}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-st-copper-line bg-st-card-2 px-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-700 transition-colors hover:text-st-ivory"
          >
            <Presentation className="size-3" strokeWidth={2.2} /> Abrir Cronograma
          </Link>
          <button
            type="button"
            onClick={onExportPdf}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-st-line bg-st-card px-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-st-ink-2 transition-colors hover:border-st-line-2 hover:text-st-ivory"
          >
            <Printer className="size-3" strokeWidth={2} /> Exportar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

/** Título de seção com a régua cobre (nosso marcador editorial). */
function CpSecao({ eyebrow, titulo }: { eyebrow: string; titulo: string }) {
  return (
    <>
      <span className="cp-rule" />
      <p className="cp-secao-eyebrow">{eyebrow}</p>
      <h2 className="cp-secao">{titulo}</h2>
    </>
  );
}

export function PlanPrintSheet({
  plan,
  descs,
  firstName,
  updatedAt,
}: {
  plan: PlanoEstrategico;
  /** descrição real de catálogo por item (kind:ref) — a apresentação passa */
  descs?: Record<string, string>;
  firstName?: string;
  /** data do plano (ISO) — impresso mostra a data de GERAÇÃO, não a do print */
  updatedAt?: string;
}) {
  // Documento paginado no idioma escuro da Arkom. Cada folha é um .cp-page
  // (caixa flex com padding próprio), porque margin é descartada na quebra de
  // página: o respiro tem que vir de dentro. Renderiza via portal no body para
  // que o print CSS colapse o app inteiro e o documento seja a única coisa
  // impressa (sem isso, a altura fantasma da tela vira páginas em branco).
  //
  // PORTAL no body de propósito: o conteúdo escondido da tela mantém a ALTURA
  // do documento no print (visibility não colapsa layout) e o Chrome paginava
  // esse vazio como páginas pretas. Com a folha como filha direta do body, o
  // print CSS colapsa os irmãos com display:none e a paginação fica exata.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const dataBase = updatedAt ? new Date(updatedAt.slice(0, 10) + "T12:00:00") : new Date();
  const hoje = dataBase.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const total = plan.fases.reduce((n, f) => n + f.itens.length, 0);
  const feitos = plan.fases.reduce((n, f) => n + f.itens.filter((i) => i.done).length, 0);
  const pct = total ? Math.round((feitos / total) * 100) : 0;
  const cenario = plan.cenario;
  const RING_C = 2 * Math.PI * 54;

  // numeração GLOBAL das ações: "próxima ação 03" na capa só é útil se o 03
  // existir uma vez no documento inteiro (a numeração deles reinicia por fase)
  const numeroGlobal = new Map<string, number>();
  let contador = 0;
  for (const fase of plan.fases) {
    for (const item of fase.itens) numeroGlobal.set(`${fase.nome}|${item.kind}:${item.ref}`, ++contador);
  }
  const proximo = (() => {
    for (const fase of plan.fases) {
      const pendente = fase.itens.find((i) => !i.done);
      if (pendente) {
        return {
          fase: fase.nome,
          item: pendente,
          n: numeroGlobal.get(`${fase.nome}|${pendente.kind}:${pendente.ref}`) ?? 1,
        };
      }
    }
    return null;
  })();

  // tipos de recurso presentes, na ordem em que aparecem no plano
  const tipos: { kind: string; label: string; n: number }[] = [];
  for (const fase of plan.fases) {
    for (const item of fase.itens) {
      const achado = tipos.find((t) => t.kind === item.kind);
      if (achado) achado.n += 1;
      else tipos.push({ kind: item.kind, label: KIND_LABEL[item.kind] ?? item.kind, n: 1 });
    }
  }

  // endereço por extenso: o documento tem que funcionar fora da plataforma.
  // Host local não vai pro papel (não serve pra ninguém que receber o PDF).
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const baseUtil = /^(localhost|127\.|0\.0\.0\.0)/.test(base) ? "" : base;
  const enderecoDe = (url: string) => (baseUtil ? `${baseUtil}${url}` : "");

  if (!mounted) return null;

  // mapa de páginas: capa, método, cenário, panorama, uma por fase, execução, fecho
  const folioCenario = 3;
  const folioPanorama = 4;
  const folioFase = (i: number) => folioPanorama + 1 + i;
  const folioExecucao = folioFase(plan.fases.length);
  const folioFecho = folioExecucao + 1;

  return createPortal(
    <div className="consultor-print" aria-hidden>
      {/* ── 01 · capa ─────────────────────────────────────────────────── */}
      <CpPagina titulo={plan.titulo} pct={pct} capa>
        <div className="cp-capa-topo">
          <span className="cp-bdot" />
          <span className="cp-capa-marca">Arkom · Gestor IA</span>
        </div>
        <div className="cp-capa-meio">
          <p className="cp-capa-eyebrow">Cronograma de IAtização · {hoje}</p>
          <h1 className="cp-title">{plan.titulo}</h1>
          {cenario?.negocio ? <p className="cp-capa-cenario">{cenario.negocio}</p> : null}
          {firstName ? <p className="cp-capa-para">Preparado pra {firstName}</p> : null}
        </div>
        <div className="cp-capa-numeros">
          <div>
            <b>{total}</b>
            <span>{total === 1 ? "ação no plano" : "ações no plano"}</span>
          </div>
          <div>
            <b>{plan.fases.length}</b>
            <span>fases de execução</span>
          </div>
          <div>
            <b>{pct}%</b>
            <span>concluído</span>
          </div>
          <div>
            <b>{proximo ? String(proximo.n).padStart(2, "0") : "OK"}</b>
            <span>{proximo ? "próxima ação" : "plano concluído"}</span>
          </div>
        </div>
      </CpPagina>

      {/* ── 02 · o que é este documento + índice ──────────────────────── */}
      <CpPagina titulo={plan.titulo} pct={pct} secao="01 · O documento" folio={2}>
        <CpSecao eyebrow="Comece por aqui" titulo="O que este Cronograma é" />
        <div className="cp-prosa">
          <p>
            Plano de IA costuma ser uma lista de ferramentas da moda, escrita sem olhar pra dentro
            do negócio. Este documento é o oposto: ele nasce de uma entrevista e termina em ação com
            endereço.
          </p>
          <p>
            O Gestor IA ouviu o seu cenário, identificou onde a operação trava e montou uma sequência
            de {total} {total === 1 ? "ação" : "ações"} tirada do catálogo real da Arkom, distribuída
            em {plan.fases.length} fases. Cada indicação existe por causa da anterior: a ordem entre
            as fases é o próprio método.
          </p>
          <p>
            Toda ação traz quatro coisas: por que ela cabe no seu caso, o que ela destrava nas fases
            seguintes, o que muda nos números que você mesmo informou, e o primeiro movimento que
            você executa hoje. Onde não houver afirmação honesta a fazer, o campo fica de fora em vez
            de virar promessa.
          </p>
          <p>
            O que este documento não faz: prometer prazo de retorno. Os tempos são esforço de
            implantação, não garantia de resultado. E ele é um retrato: o Cronograma continua vivo no
            Gestor IA, onde você marca progresso, reordena ações e regenera uma fase inteira quando o
            cenário muda.
          </p>
        </div>
        <p className="cp-microlabel">Índice</p>
        <ol className="cp-indice">
          <li>
            <span className="cp-indice-n">01</span>
            <span className="cp-indice-t">O cenário que o Gestor IA entendeu</span>
            <span className="cp-indice-d">A leitura que sustenta cada indicação</span>
            <span className="cp-indice-p">{String(folioCenario).padStart(2, "0")}</span>
          </li>
          <li>
            <span className="cp-indice-n">02</span>
            <span className="cp-indice-t">As {plan.fases.length} fases, em sequência</span>
            <span className="cp-indice-d">O cronograma inteiro numa página</span>
            <span className="cp-indice-p">{String(folioPanorama).padStart(2, "0")}</span>
          </li>
          {plan.fases.map((fase, f) => (
            <li key={fase.nome + f}>
              <span className="cp-indice-n">{String(f + 3).padStart(2, "0")}</span>
              <span className="cp-indice-t">Fase {String(f + 1).padStart(2, "0")}</span>
              <span className="cp-indice-d">{fase.nome}</span>
              <span className="cp-indice-p">{String(folioFase(f)).padStart(2, "0")}</span>
            </li>
          ))}
          <li>
            <span className="cp-indice-n">{String(plan.fases.length + 3).padStart(2, "0")}</span>
            <span className="cp-indice-t">Como tirar isto do papel</span>
            <span className="cp-indice-d">O que fazer depois de fechar o documento</span>
            <span className="cp-indice-p">{String(folioExecucao).padStart(2, "0")}</span>
          </li>
        </ol>
      </CpPagina>

      {/* ── 03 · cenário ──────────────────────────────────────────────── */}
      {cenario ? (
        <CpPagina titulo={plan.titulo} pct={pct} secao="01 · Cenário" folio={folioCenario}>
          <CpSecao eyebrow="01 · Cenário" titulo="O cenário que o Gestor IA entendeu" />
          <p className="cp-lead">
            Antes de indicar qualquer coisa, o Gestor IA precisou entender o negócio. Esta é a
            leitura que ele fez, com as suas palavras e os seus números, e é a base de cada ação das
            próximas páginas.
          </p>
          <dl className="cp-ficha">
            {cenario.negocio ? (
              <div>
                <dt>Negócio</dt>
                <dd>{cenario.negocio}</dd>
              </div>
            ) : null}
            {cenario.meta ? (
              <div>
                <dt>Onde quer chegar</dt>
                <dd>{cenario.meta}</dd>
              </div>
            ) : null}
            {cenario.dores.length ? (
              <div>
                <dt>O que trava hoje</dt>
                <dd>
                  <ul>
                    {cenario.dores.map((dor, i) => (
                      <li key={i}>{dor}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
            {cenario.execucao ? (
              <div>
                <dt>Quem executa</dt>
                <dd>{cenario.execucao}</dd>
              </div>
            ) : null}
          </dl>
          <div className="cp-callout">
            <p className="cp-callout-t">Como esta leitura foi feita</p>
            <p>
              Nada aqui veio de formulário. O Gestor IA perguntou, ouviu e escreveu com as suas
              palavras. Se algum ponto estiver torto, corrigir na conversa não obriga a refazer o
              Cronograma inteiro: uma fase pode ser regenerada com o contexto novo.
            </p>
          </div>
          <div className="cp-callout">
            <p className="cp-callout-t">O que este Cronograma não considera</p>
            <p>
              Orçamento não entra na conta. O Gestor IA monta a melhor sequência possível pro seu
              cenário e deixa a decisão de investimento com você. Prazo de retorno também não: os
              tempos de cada ação são esforço de implantação.
            </p>
          </div>
        </CpPagina>
      ) : null}

      {/* ── 04 · panorama das fases ───────────────────────────────────── */}
      <CpPagina titulo={plan.titulo} pct={pct} secao="02 · Panorama" folio={folioPanorama}>
        <CpSecao eyebrow="02 · Panorama" titulo={`As ${plan.fases.length} fases, em sequência`} />
        <p className="cp-lead">
          Cada fase abre a possibilidade da seguinte. A ordem entre elas não é negociável: dentro de
          cada uma, a sequência é sua. Entre os blocos está a condição pra avançar, que não é uma
          data no calendário, é um estado da operação.
        </p>
        {tipos.length ? (
          <p className="cp-tipos">
            {tipos.map((t) => (
              <span key={t.kind} className="cp-pill">
                {t.n} {t.n === 1 ? t.label.toLowerCase() : `${t.label.toLowerCase()}s`}
              </span>
            ))}
          </p>
        ) : null}
        <div className="cp-panorama">
          {plan.fases.map((fase, f) => {
            const dFase = fase.itens.filter((i) => i.done).length;
            const fechada = fase.itens.length > 0 && dFase === fase.itens.length;
            return (
              <div key={fase.nome + f}>
                <div className={cn("cp-pfase", fechada && "cp-pfase-ok")}>
                  <div className="cp-pfase-head">
                    <span className="cp-pfase-n">Fase {String(f + 1).padStart(2, "0")}</span>
                    <span className="cp-pfase-cnt">
                      {dFase} de {fase.itens.length}
                    </span>
                  </div>
                  <p className="cp-pfase-nome">{fase.nome}</p>
                  <p className="cp-pfase-obj">{fase.objetivo}</p>
                </div>
                {f < plan.fases.length - 1 ? (
                  <p className={cn("cp-avanco", fechada && "cp-avanco-ok")}>
                    {fechada
                      ? `condição atendida, ${dFase} de ${fase.itens.length} concluídas`
                      : `quando a fase ${String(f + 1).padStart(2, "0")} estiver rodando`}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </CpPagina>

      {/* ── uma página por fase ───────────────────────────────────────── */}
      {plan.fases.map((fase, f) => {
        const dFase = fase.itens.filter((i) => i.done).length;
        return (
          <CpPagina titulo={plan.titulo} pct={pct}
            key={fase.nome + f}
            secao={`${String(f + 3).padStart(2, "0")} · Fase ${String(f + 1).padStart(2, "0")}`}
            folio={folioFase(f)}
          >
            <span className="cp-fase-ghost" aria-hidden>
              {String(f + 1).padStart(2, "0")}
            </span>
            <CpSecao eyebrow={`Fase ${String(f + 1).padStart(2, "0")}`} titulo={fase.nome} />
            <p className="cp-objetivo">{fase.objetivo}</p>
            <div className="cp-fstats">
              <div>
                <b>{fase.itens.length}</b>
                <span>{fase.itens.length === 1 ? "ação nesta fase" : "ações nesta fase"}</span>
              </div>
              <div>
                <b>
                  {dFase} de {fase.itens.length}
                </b>
                <span>concluídas</span>
              </div>
            </div>
            <ul className="cp-itens">
              {fase.itens.map((item, i) => {
                const desc = descs?.[`${item.kind}:${item.ref}`];
                const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
                const motivoUtil =
                  item.motivo && norm(item.motivo) !== norm(desc ?? "") ? item.motivo : "";
                const n = numeroGlobal.get(`${fase.nome}|${item.kind}:${item.ref}`) ?? i + 1;
                const endereco = enderecoDe(item.url);
                return (
                  <li
                    key={`${item.kind}-${item.ref}-${i}`}
                    className={cn("cp-item", item.done && "cp-item-done")}
                    style={{ "--cp-ac": item.accent || "#c58b5f" } as React.CSSProperties}
                  >
                    <span className="cp-card">
                      <span className="cp-item-head">
                        <span className="cp-kind">
                          <span className="cp-dot" />
                          {String(n).padStart(2, "0")} · {KIND_LABEL[item.kind]}
                          {item.meta ? ` · ${item.meta}` : ""}
                          {item.esforco ? ` · ${item.esforco}` : ""}
                        </span>
                        <span className={cn("cp-check", item.done && "cp-check-done")}>
                          {item.done ? "✓ Feito" : "Pendente"}
                        </span>
                      </span>
                      <b className="cp-item-titulo">{item.titulo}</b>
                      {desc ? <span className="cp-idesc">{desc}</span> : null}
                      {motivoUtil ? (
                        <span className="cp-bloco">
                          <i className="cp-rlabel">Por que isso, no seu caso</i>
                          {motivoUtil}
                        </span>
                      ) : null}
                      {item.didatica ? (
                        <span className="cp-bloco cp-didatica">
                          <i className="cp-rlabel">O que isso destrava</i>
                          {item.didatica}
                        </span>
                      ) : null}
                      {item.resultado ? (
                        <span className="cp-resultado">
                          <i className="cp-rlabel">O que muda nos seus números</i>
                          {item.resultado}
                        </span>
                      ) : null}
                      {item.primeiroPasso ? (
                        <span className="cp-passo">
                          <i className="cp-rlabel">Primeiro movimento</i>
                          {item.primeiroPasso}
                        </span>
                      ) : null}
                      {endereco ? <span className="cp-endereco">{endereco}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CpPagina>
        );
      })}

      {/* ── execução ──────────────────────────────────────────────────── */}
      <CpPagina titulo={plan.titulo} pct={pct} secao={`${String(plan.fases.length + 3).padStart(2, "0")} · Execução`} folio={folioExecucao}>
        <CpSecao eyebrow="Execução" titulo="Como tirar isto do papel" />
        <p className="cp-lead">
          Um cronograma só vale o que sai dele. Estes são os passos que transformam as {total}{" "}
          {total === 1 ? "ação" : "ações"} deste documento em operação rodando.
        </p>
        <ol className="cp-passos">
          <li>
            <span className="cp-passo-n">01</span>
            <div>
              <p className="cp-passo-t">
                {proximo
                  ? `Abra a ação ${String(proximo.n).padStart(2, "0")}, ${proximo.item.titulo}.`
                  : "Revise o que já foi concluído."}
              </p>
              <p>
                {proximo
                  ? `Ela está na fase ${proximo.fase}${proximo.item.esforco ? `, com esforço estimado de ${proximo.item.esforco}` : ""}. Não comece por todas: a ordem dentro da fase já considera fricção, e o primeiro movimento dela está escrito no card.`
                  : "Todas as ações deste Cronograma estão marcadas como concluídas. Volte ao Gestor IA para gerar a próxima etapa do seu crescimento."}
              </p>
            </div>
          </li>
          <li>
            <span className="cp-passo-n">02</span>
            <div>
              <p className="cp-passo-t">Execute o primeiro movimento antes de planejar o resto.</p>
              <p>
                Cada card termina com uma ação concreta que cabe em uma sessão de trabalho. Fazer a
                primeira muda a natureza da conversa seguinte: você passa a discutir ajuste, não
                intenção.
              </p>
            </div>
          </li>
          <li>
            <span className="cp-passo-n">03</span>
            <div>
              <p className="cp-passo-t">Marque como concluída no Gestor IA.</p>
              <p>
                Marcar não é burocracia: é o que faz o Cronograma refletir a realidade quando você
                voltar nele em duas semanas e não lembrar onde parou. O progresso aparece nesta
                mesma folha na próxima exportação.
              </p>
            </div>
          </li>
          <li>
            <span className="cp-passo-n">04</span>
            <div>
              <p className="cp-passo-t">Releia o motivo antes de descartar uma indicação.</p>
              <p>
                Se alguma ação parecer errada, o bloco por que isso, no seu caso mostra o raciocínio
                que a colocou ali. Discordar dele é informação valiosa: leve pra conversa e o Gestor
                IA recalcula a fase.
              </p>
            </div>
          </li>
          <li>
            <span className="cp-passo-n">05</span>
            <div>
              <p className="cp-passo-t">Volte pra conversa, não pro formulário.</p>
              <p>
                O Gestor IA guarda a entrevista que originou este Cronograma. Continuar de lá preserva
                tudo o que ele já sabe do seu negócio, e essa é a diferença entre ajustar um plano e
                responder as mesmas perguntas de novo.
              </p>
            </div>
          </li>
        </ol>
        <div className="cp-callout">
          <p className="cp-callout-t">O que este documento não é</p>
          <p>
            Não é contrato de prazo nem garantia de resultado. Os tempos nos cards são referência de
            esforço de implantação. O que o Cronograma garante é a ordem: cada fase só pede o que a
            anterior já tornou possível.
          </p>
        </div>
      </CpPagina>

      {/* ── fecho ─────────────────────────────────────────────────────── */}
      <CpPagina titulo={plan.titulo} pct={pct} secao="Fecho" folio={folioFecho}>
        <div className="cp-fecho">
          <p className="cp-microlabel">Em uma frase</p>
          {cenario?.meta ? <p className="cp-fecho-meta">{cenario.meta}</p> : null}
          <p className="cp-fecho-prosa">
            As {total} {total === 1 ? "ação saiu" : "ações saíram"} do catálogo real da Arkom e foram
            conferidas contra ele: nada aqui é sugestão genérica. Cada uma tem endereço direto, o
            motivo escrito e um primeiro movimento. A ordem é o que transforma indicação em operação.
          </p>

          <div className="cp-fbody">
            <div className="cp-ringbox">
              <svg viewBox="0 0 120 120">
                <circle className="cp-ring-base" cx="60" cy="60" r="54" />
                <circle
                  className="cp-ring-fill"
                  cx="60"
                  cy="60"
                  r="54"
                  strokeDasharray={`${RING_C} ${RING_C}`}
                  strokeDashoffset={RING_C * (1 - (total ? feitos / total : 0))}
                />
              </svg>
              <span className="cp-ring-num">
                <b>{pct}%</b>
                concluído
              </span>
            </div>
            <div className="cp-sum">
              {plan.fases.map((fase, f) => {
                const dFase = fase.itens.filter((i) => i.done).length;
                const largura = fase.itens.length ? (dFase / fase.itens.length) * 100 : 0;
                return (
                  <div key={fase.nome + f} className="cp-sum-row">
                    <span className="cp-sum-nome">{fase.nome}</span>
                    <span className="cp-sum-cnt">
                      {dFase}/{fase.itens.length}
                    </span>
                    <span className="cp-sum-bar">
                      <i style={{ width: `${largura}%` }} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {proximo ? (
            <p className="cp-next">
              <i className="cp-rlabel">Comece por esta</i>
              <b>
                {String(proximo.n).padStart(2, "0")} · {proximo.item.titulo}
              </b>
              {` · ${proximo.fase}`}
              {proximo.item.esforco ? ` · ${proximo.item.esforco}` : ""}
              {enderecoDe(proximo.item.url) ? (
                <span className="cp-endereco">{enderecoDe(proximo.item.url)}</span>
              ) : null}
            </p>
          ) : null}

          <div className="cp-sign">
            <div>
              <span className="cp-slabel">Assinado por</span>
              <p className="cp-signame">Gestor IA</p>
              <span className="cp-slabel cp-sigdate">
                Gerado{firstName ? ` pra ${firstName}` : ""} · {hoje}
              </span>
            </div>
            <p className="cp-signote">
              Acompanhe o progresso e marque ações concluídas na plataforma, na área Gestor IA.
            </p>
          </div>
        </div>
      </CpPagina>
    </div>,
    document.body,
  );
}

/* ── componente principal ─────────────────────────────────────────────────── */

export function ConsultorChat({
  firstName,
  initialThreads,
  categorias,
  initialThreadId,
}: {
  firstName: string;
  initialThreads: ConsultorThread[];
  categorias: string[];
  /** deep-link ?thread=ID — abre a conversa direto ao carregar a página */
  initialThreadId?: number | null;
}) {
  const { toast } = useToast();
  const [threadId, setThreadId] = useState<number | null>(null);
  const [mode, setMode] = useState<ConsultorMode>("consultor");
  const [plan, setPlan] = useState<PlanoEstrategico | null>(null);
  const [messages, setMessages] = useState<ConsultorMessage[]>([]);
  const [journey, setJourney] = useState<ConsultorJourneyItem[]>([]);
  const [threads, setThreads] = useState<ConsultorThread[]>(initialThreads);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [carregandoThread, setCarregandoThread] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(true);
  const [regenerandoFase, setRegenerandoFase] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abriuDeepLink = useRef(false);

  // deep-link ?thread=ID: abre a conversa direto, uma vez, na montagem
  useEffect(() => {
    if (!initialThreadId || abriuDeepLink.current) return;
    abriuDeepLink.current = true;
    void abrirThread(initialThreadId);
    // disparo único de montagem; abrirThread é declaração interna estável
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialThreadId]);

  const emConversa = messages.length > 0 || pending;
  const titulo = useMemo(() => {
    const atual = threads.find((t) => t.id === threadId);
    if (atual) return atual.title;
    return messages.find((m) => m.role === "user")?.content.slice(0, 60) ?? "Nova conversa";
  }, [threads, threadId, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  function novaConversa() {
    setThreadId(null);
    setMode("consultor");
    setPlan(null);
    setMessages([]);
    setJourney([]);
    setInput("");
    setHistoryOpen(false);
  }

  /** Abre uma conversa nova já no modo planejamento (fala inicial canned). */
  async function iniciarPlanejamento() {
    if (pending || carregandoThread) return;
    setHistoryOpen(false);
    setCarregandoThread(true);
    try {
      const res = await fetch("/consultor/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ start: true, mode: "planejamento" }),
      });
      const j = (await res.json().catch(() => null)) as ChatResponse | { error?: string } | null;
      if (!res.ok || !j || "error" in j) {
        toast({
          variant: "error",
          title: (j as { error?: string })?.error ?? "Não deu para iniciar o planejamento.",
        });
        return;
      }
      const data = j as ChatResponse;
      setThreadId(data.threadId);
      setMode("planejamento");
      setPlan(null);
      setMessages(data.messages);
      setJourney([]);
      setThreads(data.threads);
      setInput("");
      inputRef.current?.focus();
    } catch {
      toast({ variant: "error", title: "Não deu para iniciar o planejamento." });
    } finally {
      setCarregandoThread(false);
    }
  }

  /** Setinhas do roadmap: reordena otimista + PATCH {fase, from, to}; reverte se negar. */
  async function moverItemPlano(fase: number, from: number, to: number) {
    if (!threadId || !plan) return;
    const itens = plan.fases[fase]?.itens ?? [];
    if (from === to || !itens[from] || to < 0 || to >= itens.length) return;
    const anterior = plan;
    const reordenados = [...itens];
    const [movido] = reordenados.splice(from, 1);
    reordenados.splice(to, 0, movido);
    setPlan({
      ...plan,
      fases: plan.fases.map((f, fi) => (fi === fase ? { ...f, itens: reordenados } : f)),
    });
    try {
      const res = await fetch(`/consultor/api/thread/${threadId}/plan`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fase, from, to }),
      });
      const j = (await res.json().catch(() => null)) as { plan?: PlanoEstrategico; error?: string } | null;
      if (!res.ok || !j?.plan) {
        setPlan(anterior);
        toast({ variant: "error", title: j?.error ?? "Não deu para reordenar o item." });
        return;
      }
      setPlan(j.plan);
    } catch {
      setPlan(anterior);
      toast({ variant: "error", title: "Não deu para reordenar o item." });
    }
  }

  /** Regenera UMA fase do roadmap (nova versão via LLM, mesma entrevista). */
  async function regenerarFase(fase: number) {
    if (!threadId || !plan || regenerandoFase !== null) return;
    setRegenerandoFase(fase);
    try {
      const res = await fetch(`/consultor/api/thread/${threadId}/plan/regenerar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fase }),
      });
      const j = (await res.json().catch(() => null)) as { plan?: PlanoEstrategico; error?: string } | null;
      if (!res.ok || !j?.plan) {
        toast({
          variant: "error",
          title: j?.error ?? "Não consegui montar uma nova versão desta fase agora.",
        });
        return;
      }
      setPlan(j.plan);
    } catch {
      toast({ variant: "error", title: "Não consegui montar uma nova versão desta fase agora." });
    } finally {
      setRegenerandoFase(null);
    }
  }

  /** Checkbox do roadmap: otimista + PATCH; reverte se o servidor negar. */
  async function alternarItemPlano(fase: number, item: number, done: boolean) {
    if (!threadId || !plan) return;
    const anterior = plan;
    const otimista: PlanoEstrategico = {
      ...plan,
      fases: plan.fases.map((f, fi) =>
        fi === fase
          ? { ...f, itens: f.itens.map((it, ii) => (ii === item ? { ...it, done } : it)) }
          : f,
      ),
    };
    setPlan(otimista);
    try {
      const res = await fetch(`/consultor/api/thread/${threadId}/plan`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fase, item, done }),
      });
      const j = (await res.json().catch(() => null)) as { plan?: PlanoEstrategico; error?: string } | null;
      if (!res.ok || !j?.plan) {
        setPlan(anterior);
        toast({ variant: "error", title: j?.error ?? "Não deu para salvar o item." });
        return;
      }
      setPlan(j.plan);
    } catch {
      setPlan(anterior);
      toast({ variant: "error", title: "Não deu para salvar o item." });
    }
  }

  async function abrirThread(id: number) {
    setHistoryOpen(false);
    setCarregandoThread(true);
    try {
      const res = await fetch(`/consultor/api/thread/${id}`);
      const j = (await res.json().catch(() => null)) as ThreadResponse | { error?: string } | null;
      if (!res.ok || !j || "error" in j) {
        toast({ variant: "error", title: (j as { error?: string })?.error ?? "Não deu para abrir a conversa." });
        return;
      }
      const data = j as ThreadResponse;
      setThreadId(data.threadId);
      setMode(data.mode);
      setPlan(data.plan);
      setMessages(data.messages);
      setJourney(data.journey);
    } catch {
      toast({ variant: "error", title: "Não deu para abrir a conversa." });
    } finally {
      setCarregandoThread(false);
    }
  }

  async function enviar(texto?: string) {
    const message = (texto ?? input).trim();
    if (!message || pending) return;
    setInput("");
    setPending(true);
    // otimista: a pergunta aparece na hora; o turno persistido substitui no retorno
    const tempId = -Date.now();
    setMessages((m) => [
      ...m,
      { id: tempId, role: "user", content: message, cards: [], followup: null, created_at: "" },
    ]);
    try {
      const res = await fetch("/consultor/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId, message }),
      });
      const j = (await res.json().catch(() => null)) as ChatResponse | { error?: string } | null;
      if (!res.ok || !j || "error" in j) {
        setMessages((m) => m.filter((msg) => msg.id !== tempId));
        setInput(message);
        toast({
          variant: "error",
          title: (j as { error?: string })?.error ?? "O Gestor não conseguiu responder agora.",
        });
        return;
      }
      const data = j as ChatResponse;
      setThreadId(data.threadId);
      setMode(data.mode);
      setPlan(data.plan);
      setMessages((m) => [...m.filter((msg) => msg.id !== tempId), ...data.messages]);
      setJourney(data.journey);
      setThreads(data.threads);
    } catch {
      setMessages((m) => m.filter((msg) => msg.id !== tempId));
      setInput(message);
      toast({ variant: "error", title: "O Gestor não conseguiu responder agora." });
    } finally {
      setPending(false);
    }
  }

  function usarChip(nome: string) {
    setInput(`Atuo com ${nome}. Meu cenário: `);
    inputRef.current?.focus();
  }

  /* ── composer (hero e conversa compartilham) ────────────────────────────── */
  const composer = (
    <div className="consultor-composer st-modal-elev rounded-[16px] border border-st-line-2 bg-st-bg p-3">
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void enviar();
          }
        }}
        rows={emConversa ? 2 : 3}
        maxLength={2000}
        placeholder="Descreva seu cenário, problema ou dúvida…"
        className="w-full resize-none bg-transparent px-1.5 py-1 text-[14px] leading-relaxed text-st-ivory outline-none placeholder:text-st-ink-3"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <span className="hidden px-1.5 font-mono text-[10px] tracking-[0.06em] text-st-ink-3 sm:inline">
          Enter envia · Shift+Enter quebra linha
        </span>
        <span className="flex items-center gap-2">
          {/* ditado por voz — Whisper primeiro (transcrição server-side) */}
          <MicBtn
            value={input}
            onChange={setInput}
            prefer="whisper"
            onBloqueado={() =>
              toast({ variant: "error", title: "Microfone bloqueado: libere o acesso no navegador." })
            }
            onErro={(msg) => toast({ variant: "error", title: msg })}
          />
          <button
            type="button"
            onClick={() => void enviar()}
            disabled={pending || input.trim().length === 0}
            aria-label="Enviar pergunta"
            className={cn(
              "flex size-9 items-center justify-center rounded-full transition-all duration-200",
              input.trim() && !pending
                ? "bg-st-copper text-st-copper-ink hover:opacity-90"
                : "bg-st-card-2 text-st-ink-3",
            )}
            style={input.trim() && !pending ? { boxShadow: "var(--st-elev-bevel)" } : undefined}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
            ) : (
              <ArrowUp className="size-4" strokeWidth={2.2} />
            )}
          </button>
        </span>
      </div>
    </div>
  );

  /* ── barra do topo (Nova · Histórico · Jornada) ─────────────────────────── */
  const topo = (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      {emConversa ? (
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-[650] tracking-[-0.01em] text-st-ivory">
          {titulo}
        </h1>
      ) : (
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-[650] tracking-[-0.01em] text-st-ivory">
          Gestor IA
        </h1>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={novaConversa}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-st-copper px-4 text-[12.5px] font-semibold text-st-copper-ink transition-opacity hover:opacity-90"
          style={{ boxShadow: "var(--st-elev-bevel)" }}
        >
          <Plus className="size-3.5" strokeWidth={2.4} /> Nova
        </button>
        <button
          type="button"
          onClick={() => void iniciarPlanejamento()}
          disabled={pending || carregandoThread}
          title="Montar seu Cronograma de IAtização: o Gestor entende o negócio e te entrega o roadmap."
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-st-line-2 bg-st-card px-4 text-[12.5px] font-medium text-st-ink-2 transition-colors hover:bg-st-card-2 hover:text-st-ivory disabled:opacity-50"
        >
          <ClipboardList className="size-3.5" strokeWidth={2.2} />
          <span className="hidden sm:inline">Cronograma de IAtização</span>
          <span className="sm:hidden">Plano</span>
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-st-line-2 bg-st-card px-4 text-[12.5px] font-medium text-st-ink-2 transition-colors hover:bg-st-card-2 hover:text-st-ivory"
          >
            {carregandoThread ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2.2} />
            ) : (
              <History className="size-3.5" strokeWidth={2.2} />
            )}
            Histórico
          </button>
          {historyOpen ? (
            <>
              <div className="fixed inset-0 z-20" aria-hidden onClick={() => setHistoryOpen(false)} />
              <div
                className="st-modal-elev absolute right-0 z-30 mt-2 max-h-[360px] w-[320px] overflow-y-auto rounded-[14px] border border-st-line-2 bg-st-bg p-1.5"
                style={{ boxShadow: "var(--st-shadow)" }}
              >
                {threads.length === 0 ? (
                  <p className="px-3 py-5 text-center text-[12px] text-st-ink-3">
                    Nenhuma conversa ainda — a primeira pergunta cria uma.
                  </p>
                ) : (
                  threads.map((t) => (
                    // container com DOIS alvos irmãos (nunca aninhados): abrir a
                    // conversa e, nas de Cronograma, ir direto pro documento
                    <div
                      key={t.id}
                      className={cn(
                        "flex items-center rounded-[10px] transition-colors hover:bg-st-card-2",
                        t.id === threadId && "bg-st-card-2",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void abrirThread(t.id)}
                        className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2.5 text-left"
                      >
                        <span className="flex items-center gap-2">
                          <span className="line-clamp-1 min-w-0 flex-1 text-[13px] font-[600] tracking-[-0.01em] text-st-ivory">
                            {t.title}
                          </span>
                          {t.mode === "planejamento" ? (
                            <span className="shrink-0 font-mono text-[8.5px] font-semibold uppercase tracking-[0.12em] text-gold-700">
                              Plano
                            </span>
                          ) : null}
                        </span>
                        <span className="line-clamp-1 text-[11.5px] text-st-ink-3">{t.preview}</span>
                      </button>
                      {t.mode === "planejamento" ? (
                        <Link
                          href={`/consultor/plano/${t.id}`}
                          title="Abrir o Cronograma desta conversa"
                          aria-label={`Abrir o Cronograma de ${t.title}`}
                          className="mr-2 flex size-7 shrink-0 items-center justify-center rounded-full text-st-ink-3 transition-colors hover:bg-st-card hover:text-gold-700"
                        >
                          <Presentation className="size-3.5" strokeWidth={2.2} />
                        </Link>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : null}
        </div>
        {emConversa ? (
          <button
            type="button"
            onClick={() => setJourneyOpen((v) => !v)}
            className="hidden h-9 items-center gap-1.5 rounded-full border border-st-line-2 bg-st-card px-4 text-[12.5px] font-medium text-st-ink-2 transition-colors hover:bg-st-card-2 hover:text-st-ivory md:inline-flex"
          >
            {journeyOpen ? (
              <PanelRightClose className="size-3.5" strokeWidth={2.2} />
            ) : (
              <PanelRightOpen className="size-3.5" strokeWidth={2.2} />
            )}
            {mode === "planejamento" ? "Roadmap" : "Jornada"}
          </button>
        ) : null}
      </div>
    </div>
  );

  /* ── tela vazia: saudação (display serif) + composer + chips de área ────── */
  if (!emConversa) {
    return (
      <div className="consultor-scope">
        {topo}
        <div className="mx-auto flex min-h-[58vh] w-full max-w-[620px] flex-col items-center justify-center pb-10 text-center">
          <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-st-line bg-st-card px-3.5 py-1.5">
            <span className="size-[6px] rounded-full bg-gold-700" aria-hidden />
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-st-ink-2">
              Gestor Arkom
            </span>
          </span>
          <h2 className="font-display text-[clamp(28px,4.2vw,42px)] leading-[1.15] tracking-[-0.01em] text-st-ivory">
            {saudacao()}, {firstName}.
            <br />
            <span className="text-st-ink-2">Como posso te ajudar hoje?</span>
          </h2>
          <p className="mt-4 max-w-[400px] text-[13.5px] leading-relaxed text-st-ink-2">
            Conte seu cenário, problema ou dúvida. Eu cruzo com o catálogo inteiro e trago o caminho
            específico pro seu caso.
          </p>
          <div className="mt-9 w-full text-left">{composer}</div>
          {categorias.length > 0 ? (
            <div className="mt-10 flex flex-col items-center gap-3.5">
              <MicroLabel className="tracking-[0.18em]">Explorar por área</MicroLabel>
              <div className="flex flex-wrap justify-center gap-2">
                {categorias.map((nome) => (
                  <button
                    key={nome}
                    type="button"
                    onClick={() => usarChip(nome)}
                    className="rounded-full border border-st-line bg-st-card-2 px-3.5 py-1.5 text-[12px] font-medium text-st-ink-2 transition-colors hover:border-st-line-2 hover:text-st-ivory"
                  >
                    {nome}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  /* ── conversa: feed + jornada + composer fixo embaixo ───────────────────── */
  return (
    <div className="consultor-scope">
      {topo}
      {/* invisível na tela: vira o PDF quando o aluno exporta (window.print) */}
      {mode === "planejamento" && plan ? (
        <PlanPrintSheet
          plan={plan}
          firstName={firstName}
          updatedAt={threads.find((t) => t.id === threadId)?.updated_at}
        />
      ) : null}
      <div
        className={cn(
          "grid gap-6 lg:gap-10",
          // monitor lateral/retrato (>=768px) já mostra o painel do Cronograma
          journeyOpen
            ? "md:grid-cols-[minmax(0,1fr)_250px] lg:grid-cols-[minmax(0,1fr)_270px]"
            : "md:grid-cols-1",
        )}
      >
        <div className="flex min-h-[60vh] flex-col">
          <div className="flex flex-1 flex-col gap-7 pb-8">
            {mode === "planejamento" ? (
              <div className="flex items-center gap-3 rounded-[14px] border border-st-line-2 bg-st-card px-4 py-3">
                <ClipboardList className="size-4 shrink-0 text-gold-700" strokeWidth={2} />
                <div className="min-w-0">
                  <MicroLabel className="text-gold-700">Modo Cronograma de IAtização</MicroLabel>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-st-ink-2">
                    Vamos conversar pra montar seu roadmap completo. Quando ele ficar pronto, aparece
                    aqui na conversa e no painel, em 4 fases priorizadas.
                  </p>
                </div>
              </div>
            ) : null}
            {messages.map((msg) => (
              <MessageRow key={msg.id} msg={msg} />
            ))}
            {mode === "planejamento" && plan && threadId && !pending ? (
              <CronogramaEntregue
                plan={plan}
                href={`/consultor/plano/${threadId}`}
                onExportPdf={() => window.print()}
              />
            ) : null}
            {pending ? (
              <div className="flex items-start gap-3">
                <AssistantAvatar />
                <ProgressCard mode={mode} />
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
          <div className="sticky bottom-4 z-10">{composer}</div>
        </div>
        {journeyOpen ? (
          <div className="hidden md:block">
            <div className="no-scrollbar sticky top-6 max-h-[calc(100vh-48px)] overflow-y-auto pb-6">
              {mode === "planejamento" ? (
                <PlanPanel
                  plan={plan}
                  onToggle={(f, i, done) => void alternarItemPlano(f, i, done)}
                  onMove={(f, from, to) => void moverItemPlano(f, from, to)}
                  onRegenerate={(f) => void regenerarFase(f)}
                  regenerandoFase={regenerandoFase}
                  onExportPdf={() => window.print()}
                  presentHref={threadId && plan ? `/consultor/plano/${threadId}` : null}
                />
              ) : (
                <JourneyPanel journey={journey} />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
