"use client";

// A Constelação — apresentação em scroll vertical do plano estratégico.
// Conceito vencedor do design-lab (variante 5) portado pro app: fases como
// capítulos com header sticky, uma linha de constelação em cobre conectando os
// itens (cada segmento se acende quando o item entra na viewport) e um fecho
// assinado pelo Gestor IA. Toggle de feito persiste no mesmo PATCH do painel.
//
// Idioma visual: tokens st-*/gold-700 (o CSS da página só referencia as vars
// globais), Marcellus via --font-marcellus, micro-labels mono uppercase.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanoEstrategico } from "@/lib/consultor/tipos";
import { PlanPrintSheet } from "../../consultor-chat";

const KIND_LABEL: Record<string, string> = {
  solucao: "Solução",
  curso: "Curso",
  aula: "Aula",
  genesis: "Genesis",
};

const GOLD = "#c58b5f";
const RING_R = 56;
const RING_C = 2 * Math.PI * RING_R;
const SPARKLE =
  "M0 -8 C1.1 -2.2 2.2 -1.1 8 0 C2.2 1.1 1.1 2.2 0 8 C-1.1 2.2 -2.2 1.1 -8 0 C-2.2 -1.1 -1.1 -2.2 0 -8 Z";

function dataPt(iso: string): string {
  const dia = iso.slice(0, 10).split("-");
  if (dia.length !== 3) return iso.slice(0, 10);
  // formato longo, idêntico ao do PDF (consistência tela/papel)
  return new Date(Number(dia[0]), Number(dia[1]) - 1, Number(dia[2])).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Divide o título em duas linhas equilibradas pro reveal em máscara. */
function duasLinhas(titulo: string): [string, string] {
  const palavras = titulo.trim().split(/\s+/);
  if (palavras.length < 3) return [titulo, ""];
  let melhor = 1;
  let menorDelta = Infinity;
  for (let corte = 1; corte < palavras.length; corte++) {
    const a = palavras.slice(0, corte).join(" ").length;
    const b = palavras.slice(corte).join(" ").length;
    const delta = Math.abs(a - b);
    if (delta < menorDelta) {
      menorDelta = delta;
      melhor = corte;
    }
  }
  return [palavras.slice(0, melhor).join(" "), palavras.slice(melhor).join(" ")];
}

function ns<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

export function ConstelacaoView({
  threadId,
  initialPlan,
  firstName,
  updatedAt,
  descs,
}: {
  threadId: number;
  initialPlan: PlanoEstrategico;
  firstName: string;
  updatedAt: string;
  /** descrição real de catálogo por item (chave kind:ref) — pode faltar */
  descs: Record<string, string>;
}) {
  const [plan, setPlan] = useState<PlanoEstrategico>(initialPlan);

  const skyRef = useRef<SVGSVGElement>(null);
  const skyrootRef = useRef<SVGGElement>(null);
  const dustRef = useRef<SVGSVGElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const heroStarRef = useRef<HTMLSpanElement>(null);
  const finaleRef = useRef<HTMLElement>(null);
  const finaleCardRef = useRef<HTMLDivElement>(null);
  const chapterRefs = useRef<(HTMLElement | null)[]>([]);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  // estado imperativo do céu (fora do React: SVG montado via DOM)
  const segEls = useRef<SVGPathElement[][]>([]);
  const starEls = useRef<SVGGElement[]>([]);
  const seenSegs = useRef<Set<number>>(new Set());

  // itens achatados na ordem visual (fase a fase) — índices casam com o céu
  const flat = useMemo(
    () =>
      plan.fases.flatMap((fase, f) =>
        fase.itens.map((item, i) => ({ fase: f, idx: i, item })),
      ),
    [plan],
  );
  const total = flat.length;
  const feitos = flat.filter((x) => x.item.done).length;
  const pct = total ? Math.round((feitos / total) * 100) : 0;
  const [linha1, linha2] = useMemo(() => duasLinhas(plan.titulo), [plan.titulo]);
  const cenario = plan.cenario;
  /** primeiro item pendente na ordem do plano — o "próximo passo" do fecho */
  const proximo = useMemo(() => {
    for (const x of flat) if (!x.item.done) return { faseNome: plan.fases[x.fase].nome, item: x.item };
    return null;
  }, [flat, plan.fases]);

  /* ── céu: poeira + constelação (imperativo, reconstruído no resize) ────── */

  const rebuildSky = useCallback(() => {
    const sky = skyRef.current;
    const skyroot = skyrootRef.current;
    const dust = dustRef.current;
    const heroStar = heroStarRef.current;
    const finaleCard = finaleCardRef.current;
    if (!sky || !skyroot || !dust || !heroStar || !finaleCard) return;

    const docY = (r: DOMRect) => r.top + window.scrollY;

    // poeira determinística, quase invisível
    const w = window.innerWidth;
    const h = window.innerHeight;
    dust.setAttribute("viewBox", `0 0 ${w} ${h}`);
    let s = 42;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
    let html = "";
    for (let i = 0; i < 70; i++) {
      const x = (rnd() * w).toFixed(1);
      const y = (rnd() * h).toFixed(1);
      const r = (0.5 + rnd() * 0.9).toFixed(2);
      const o = (0.04 + rnd() * 0.09).toFixed(3);
      const tw = rnd() > 0.72;
      // fill=currentColor (a .pcz herda --st-ivory): mesma poeira no escuro,
      // tinta no claro — antes era #ececee cru e sumia no tema claro.
      const vars = tw
        ? ` style="--td:${(5 + rnd() * 5).toFixed(1)}s;--tdel:${(rnd() * 6).toFixed(1)}s;--tmax:${(0.14 + rnd() * 0.1).toFixed(2)}"`
        : "";
      html += `<circle${tw ? ' class="pcz-twk"' : ""} cx="${x}" cy="${y}" r="${r}" fill="currentColor" opacity="${o}"${vars}/>`;
    }
    dust.innerHTML = html;

    // geometria da constelação a partir do DOM real
    const H = document.documentElement.scrollHeight;
    const W = document.documentElement.clientWidth;
    sky.setAttribute("viewBox", `0 0 ${W} ${H}`);
    sky.setAttribute("width", String(W));
    sky.setAttribute("height", String(H));
    sky.style.height = `${H}px`;
    while (skyroot.firstChild) skyroot.removeChild(skyroot.firstChild);
    segEls.current = [];
    starEls.current = [];

    const cards = itemRefs.current.filter(Boolean) as HTMLElement[];
    const pts: { x: number; y: number; right?: boolean }[] = [];
    const hr = heroStar.getBoundingClientRect();
    pts.push({ x: hr.left + hr.width / 2, y: docY(hr) + hr.height / 2 });
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const isRight = card.classList.contains("pcz-right");
      pts.push({
        x: isRight ? rect.left - 44 : rect.right + 44,
        y: docY(rect) + 42,
        right: isRight,
      });
    }
    const fr = finaleCard.getBoundingClientRect();
    pts.push({ x: fr.left + fr.width / 2, y: docY(fr) - 44 });

    for (let k = 1; k < pts.length; k++) {
      const d = `M${pts[k - 1].x} ${pts[k - 1].y} L${pts[k].x} ${pts[k].y}`;
      const base = ns("path");
      base.setAttribute("d", d);
      base.setAttribute("class", "pcz-seg-base");
      skyroot.appendChild(base);
      const glow = ns("path");
      glow.setAttribute("d", d);
      glow.setAttribute("class", "pcz-seg-glow");
      const lit = ns("path");
      lit.setAttribute("d", d);
      lit.setAttribute("class", "pcz-seg-lit");
      const len = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      for (const p of [glow, lit]) {
        p.style.strokeDasharray = `${len} ${len}`;
        p.style.strokeDashoffset = seenSegs.current.has(k) ? "0" : String(len);
      }
      skyroot.appendChild(glow);
      skyroot.appendChild(lit);
      segEls.current.push([glow, lit]);
    }

    const oHalo = ns("circle");
    oHalo.setAttribute("cx", String(pts[0].x));
    oHalo.setAttribute("cy", String(pts[0].y));
    oHalo.setAttribute("r", "9");
    oHalo.setAttribute("class", "pcz-origin-halo");
    skyroot.appendChild(oHalo);

    cards.forEach((card, i) => {
      const p = pts[i + 1];
      const g = ns("g");
      g.setAttribute("class", "pcz-star");
      g.setAttribute("transform", `translate(${p.x} ${p.y})`);
      // estrela SEMPRE cobre: o fio da constelação é o elemento-assinatura da
      // marca; o acento por item fica nos detalhes do card (dot, check)
      const inner = ns("g");
      inner.setAttribute("class", "pcz-starin");
      const sp = ns("path");
      sp.setAttribute("d", SPARKLE);
      sp.setAttribute("class", "pcz-sparkle");
      const halo = ns("circle");
      halo.setAttribute("r", "13");
      halo.setAttribute("class", "pcz-halo");
      inner.appendChild(halo);
      inner.appendChild(sp);
      g.appendChild(inner);
      const tick = ns("line");
      const dir = p.right ? 1 : -1;
      tick.setAttribute("x1", String(dir * 14));
      tick.setAttribute("x2", String(dir * 36));
      tick.setAttribute("y1", "0");
      tick.setAttribute("y2", "0");
      tick.setAttribute("class", "pcz-tick");
      g.appendChild(tick);
      skyroot.appendChild(g);
      starEls.current.push(g);
      if (seenSegs.current.has(i + 1)) g.classList.add("lit");
      if (card.classList.contains("pcz-done")) g.classList.add("done");
    });

    const fp = pts[pts.length - 1];
    const fg = ns("g");
    fg.setAttribute("class", "pcz-star");
    fg.setAttribute("transform", `translate(${fp.x} ${fp.y})`);
    fg.style.setProperty("--ac", GOLD);
    const finner = ns("g");
    finner.setAttribute("class", "pcz-starin");
    finner.setAttribute("transform", "scale(1.4)");
    const fsp = ns("path");
    fsp.setAttribute("d", SPARKLE);
    fsp.setAttribute("class", "pcz-sparkle");
    const fhalo = ns("circle");
    fhalo.setAttribute("r", "13");
    fhalo.setAttribute("class", "pcz-halo");
    finner.appendChild(fhalo);
    finner.appendChild(fsp);
    fg.appendChild(finner);
    skyroot.appendChild(fg);
    starEls.current.push(fg);
    if (seenSegs.current.has(pts.length - 1)) fg.classList.add("lit");
  }, []);

  const lightSegment = useCallback((idx: number) => {
    if (seenSegs.current.has(idx)) return;
    seenSegs.current.add(idx);
    const seg = segEls.current[idx - 1];
    if (seg) for (const p of seg) p.style.strokeDashoffset = "0";
    const star = starEls.current[idx - 1];
    if (star) star.classList.add("lit");
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) skyRef.current?.classList.add("no-anim");

    rebuildSky();
    const onLoad = () => rebuildSky();
    window.addEventListener("load", onLoad);
    let fontsLive = true;
    document.fonts?.ready.then(() => {
      if (fontsLive) rebuildSky();
    });

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(rebuildSky, 160);
    };
    window.addEventListener("resize", onResize);

    // revelação por scroll: item visto acende o próprio segmento
    const cards = itemRefs.current.filter(Boolean) as HTMLElement[];
    const finaleCard = finaleCardRef.current;
    let io: IntersectionObserver | null = null;
    if (reduce || !("IntersectionObserver" in window)) {
      for (let k = 1; k <= cards.length + 1; k++) lightSegment(k);
      for (const c of cards) c.classList.add("pcz-seen");
      finaleCard?.classList.add("pcz-seen");
    } else {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const t = e.target as HTMLElement;
            t.classList.add("pcz-seen");
            if (t === finaleCard) lightSegment(cards.length + 1);
            else lightSegment(cards.indexOf(t) + 1);
            io?.unobserve(t);
          }
        },
        { threshold: 0.3, rootMargin: "0px 0px -8% 0px" },
      );
      for (const c of cards) io.observe(c);
      if (finaleCard) io.observe(finaleCard);
    }

    // barra de progresso do scroll
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (scrollbarRef.current) {
          scrollbarRef.current.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // setas navegam por capítulo
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "BUTTON" || alvo.tagName === "A")) {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      }
      const sections = [
        heroRef.current,
        ...chapterRefs.current,
        finaleRef.current,
      ].filter(Boolean) as HTMLElement[];
      const tops = sections.map((sec) => sec.getBoundingClientRect().top + window.scrollY - 8);
      const y = window.scrollY;
      let target: number | null = null;
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown") {
        for (const t of tops) if (t > y + 12) { target = t; break; }
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp") {
        for (let j = tops.length - 1; j >= 0; j--) if (tops[j] < y - 12) { target = tops[j]; break; }
        if (target === null && y > 4) target = 0;
      } else return;
      if (target !== null) {
        e.preventDefault();
        window.scrollTo({ top: target, behavior: reduce ? "auto" : "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      fontsLive = false;
      window.removeEventListener("load", onLoad);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      clearTimeout(resizeTimer);
      io?.disconnect();
    };
  }, [rebuildSky, lightSegment]);

  // estrelas refletem o done sem reconstruir o céu
  useEffect(() => {
    flat.forEach((x, i) => {
      starEls.current[i]?.classList.toggle("done", x.item.done);
    });
  }, [flat]);

  /* ── toggle: otimista + PATCH (servidor é autoridade; reverte se negar) ── */

  const alternar = useCallback(
    async (fase: number, idx: number, done: boolean) => {
      const anterior = plan;
      setPlan((p) => ({
        ...p,
        fases: p.fases.map((f, fi) =>
          fi === fase
            ? { ...f, itens: f.itens.map((it, ii) => (ii === idx ? { ...it, done } : it)) }
            : f,
        ),
      }));
      try {
        const res = await fetch(`/consultor/api/thread/${threadId}/plan`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fase, item: idx, done }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as { plan?: PlanoEstrategico };
        if (j.plan) setPlan(j.plan);
      } catch {
        setPlan(anterior);
      }
    },
    [plan, threadId],
  );

  /* ── render ────────────────────────────────────────────────────────────── */

  let contadorGlobal = 0;

  return (
    <div className="pcz">
      <div className="pcz-haze" aria-hidden />
      <svg ref={dustRef} className="pcz-dust" aria-hidden />
      <svg ref={skyRef} className="pcz-sky" aria-hidden>
        <defs>
          <filter id="pcz-fglow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="2.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g ref={skyrootRef} />
      </svg>

      <div ref={scrollbarRef} className="pcz-scrollbar" aria-hidden />

      <header className="pcz-topbar">
        <div className="pcz-brand">
          <span className="pcz-bdot" aria-hidden />
          <span className="pcz-micro">
            <b>Gestor IA</b> · Cronograma de IAtização
          </span>
        </div>
        <div className="pcz-tbright">
          <span className="pcz-micro pcz-gcount">
            <b>
              {feitos} de {total}
            </b>{" "}
            concluídos · {pct}%
          </span>
          <Link className="pcz-back" href="/consultor">
            Voltar ao chat
          </Link>
        </div>
      </header>

      <main className="pcz-main">
        <section ref={heroRef} className="pcz-hero">
          <div className="pcz-wrap">
            <div className="pcz-hero-micro pcz-rise" style={{ "--d": "0.05s" } as React.CSSProperties}>
              <span className="pcz-rule" aria-hidden />
              <span className="pcz-micro">Cronograma de IAtização · gerado em {dataPt(updatedAt)}</span>
            </div>
            <h1>
              <span className="pcz-mask">
                <span className="pcz-line" style={{ "--d": "0.22s" } as React.CSSProperties}>
                  {linha1}
                </span>
              </span>
              {linha2 ? (
                <span className="pcz-mask">
                  <span className="pcz-line" style={{ "--d": "0.38s" } as React.CSSProperties}>
                    {linha2}
                  </span>
                </span>
              ) : null}
            </h1>
            <p className="pcz-hero-sub pcz-rise" style={{ "--d": "0.62s" } as React.CSSProperties}>
              Preparado pra <b>{firstName}</b>. {plan.fases.length} fases, {total}{" "}
              {total === 1 ? "movimento" : "movimentos"}, uma constelação: cada estrela se acende
              conforme o plano avança.
            </p>
            {cenario ? (
              <div className="pcz-scenario pcz-rise" style={{ "--d": "0.8s" } as React.CSSProperties}>
                {cenario.negocio ? (
                  <div className="pcz-scell">
                    <span className="pcz-micro">Negócio</span>
                    <p>{cenario.negocio}</p>
                  </div>
                ) : null}
                {cenario.meta ? (
                  <div className="pcz-scell">
                    <span className="pcz-micro">Meta</span>
                    <p>{cenario.meta}</p>
                  </div>
                ) : null}
                {cenario.dores.length ? (
                  <div className="pcz-scell">
                    <span className="pcz-micro">Dores hoje</span>
                    <ul>
                      {cenario.dores.map((dor, i) => (
                        <li key={i}>{dor}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {cenario.execucao ? (
                  <div className="pcz-scell">
                    <span className="pcz-micro">Execução</span>
                    <p>{cenario.execucao}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="pcz-scroll-hint pcz-rise" style={{ "--d": "1.05s" } as React.CSSProperties}>
            <span className="pcz-micro">Role pra revelar o plano</span>
            <span className="pcz-vline" aria-hidden />
            <span ref={heroStarRef} className="pcz-herostar" aria-hidden />
          </div>
        </section>

        {plan.fases.map((fase, f) => {
          const dFase = fase.itens.filter((i) => i.done).length;
          return (
            <section
              key={fase.nome + f}
              ref={(el) => {
                chapterRefs.current[f] = el;
              }}
              className="pcz-chapter"
            >
              <div className="pcz-wrap">
                <header className="pcz-chead">
                  <div className="pcz-chrow">
                    <div className="pcz-chid">
                      <span className="pcz-chnum">Fase {String(f + 1).padStart(2, "0")}</span>
                      <span className="pcz-chname">{fase.nome}</span>
                    </div>
                    <div className="pcz-chprogress">
                      <span className="pcz-chcount">
                        {dFase} de {fase.itens.length}
                      </span>
                      <span className="pcz-phasebar">
                        <i
                          style={{
                            width: `${fase.itens.length ? (dFase / fase.itens.length) * 100 : 0}%`,
                          }}
                        />
                      </span>
                    </div>
                  </div>
                  <h2 className="pcz-objetivo">{fase.objetivo}</h2>
                </header>
                <div className="pcz-items">
                  {fase.itens.map((item, i) => {
                    const globalIdx = contadorGlobal++;
                    const lado = i % 2 === 0 ? "pcz-left" : "pcz-right";
                    const kindLabel = KIND_LABEL[item.kind] ?? item.kind;
                    return (
                      <article
                        key={`${item.kind}-${item.ref}-${i}`}
                        ref={(el) => {
                          itemRefs.current[globalIdx] = el;
                        }}
                        className={`pcz-item ${lado}${item.done ? " pcz-done" : ""}`}
                        style={{ "--ac": item.accent || GOLD } as React.CSSProperties}
                      >
                        <div className="pcz-itop">
                          <span className="pcz-kind">
                            <span className="pcz-dot" aria-hidden />
                            {kindLabel}
                            {item.meta ? ` · ${item.meta}` : ""}
                          </span>
                          <button
                            className="pcz-check"
                            type="button"
                            aria-pressed={item.done}
                            aria-label={`Marcar ${item.titulo} como ${item.done ? "pendente" : "feito"}`}
                            onClick={() => void alternar(f, i, !item.done)}
                          >
                            <svg viewBox="0 0 16 16" aria-hidden>
                              <circle className="pcz-cring" cx="8" cy="8" r="6.5" />
                              <path className="pcz-cmark" d="M5 8.2 7.2 10.4 11 5.8" />
                            </svg>
                            <span>{item.done ? "Feito" : "Marcar"}</span>
                          </button>
                        </div>
                        <h3 className="pcz-ititle">
                          <Link href={item.url}>{item.titulo}</Link>
                        </h3>
                        {(() => {
                          const desc = descs[`${item.kind}:${item.ref}`];
                          const norm = (t: string) =>
                            t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
                          const motivoUtil =
                            item.motivo && norm(item.motivo) !== norm(desc ?? "")
                              ? item.motivo
                              : "";
                          return (
                            <>
                              {desc ? <p className="pcz-idesc">{desc}</p> : null}
                              {motivoUtil ? <p className="pcz-motivo">{motivoUtil}</p> : null}
                            </>
                          );
                        })()}
                        {item.didatica ? (
                          <p className="pcz-didatica">
                            <span className="pcz-mlabel">O que isso destrava</span>
                            {item.didatica}
                          </p>
                        ) : null}
                        {item.esforco ? (
                          <div className="pcz-metarow">
                            <span className="pcz-eff">
                              Esforço · <b>{item.esforco}</b>
                            </span>
                          </div>
                        ) : null}
                        {item.resultado ? (
                          <div className="pcz-resinner">
                            <span className="pcz-rlabel">Resultado esperado</span>
                            <p>{item.resultado}</p>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}

        <section ref={finaleRef} className="pcz-finale">
          <div ref={finaleCardRef} className="pcz-fcard">
            <div className="pcz-fmicro">
              <span className="pcz-micro">Resumo do plano</span>
              <span className="pcz-frule" aria-hidden />
              <span className="pcz-micro">A constelação completa</span>
            </div>
            <div className="pcz-fbody">
              <div className="pcz-ringbox">
                <svg viewBox="0 0 132 132" aria-hidden>
                  <circle className="pcz-ringbase" cx="66" cy="66" r={RING_R} />
                  <circle
                    className="pcz-ringfill"
                    cx="66"
                    cy="66"
                    r={RING_R}
                    style={{
                      strokeDasharray: `${RING_C} ${RING_C}`,
                      strokeDashoffset: RING_C * (1 - (total ? feitos / total : 0)),
                    }}
                  />
                </svg>
                <div className="pcz-ringnum">
                  <b>{pct}%</b>
                  <span className="pcz-micro">concluído</span>
                </div>
              </div>
              <div className="pcz-fdetail">
                <p className="pcz-doneline">
                  <b>
                    {feitos} de {total}
                  </b>{" "}
                  itens do plano concluídos
                </p>
                {plan.fases.map((fase, f) => {
                  const dFase = fase.itens.filter((i) => i.done).length;
                  return (
                    <div key={fase.nome + f} className="pcz-fphase">
                      <span className="pcz-micro">{fase.nome}</span>
                      <span className="pcz-cnt">
                        {dFase}/{fase.itens.length}
                      </span>
                      <span className="pcz-phasebar">
                        <i
                          style={{
                            width: `${fase.itens.length ? (dFase / fase.itens.length) * 100 : 0}%`,
                          }}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            {cenario?.meta ? (
              <div className="pcz-fmeta">
                <span className="pcz-micro">Meta do plano</span>
                <p>{cenario.meta}</p>
              </div>
            ) : null}
            <div className="pcz-fnext">
              <span className="pcz-micro">{proximo ? "Próximo passo" : "Plano concluído"}</span>
              {proximo ? (
                <p>
                  <b>{proximo.item.titulo}</b>
                  <span className="pcz-fnext-meta">
                    {" "}
                    · {proximo.faseNome}
                    {proximo.item.esforco ? ` · ${proximo.item.esforco}` : ""}
                  </span>
                </p>
              ) : (
                <p>Todos os {total} itens do roadmap estão concluídos. A constelação está inteira.</p>
              )}
            </div>
            <div className="pcz-fsign">
              <div>
                <span className="pcz-micro">Assinado por</span>
                <div className="pcz-signame">Gestor IA</div>
                <span className="pcz-micro pcz-sigdate">
                  Gerado em {dataPt(updatedAt)} pra {firstName}
                </span>
              </div>
              <button className="pcz-btnexport" type="button" onClick={() => window.print()}>
                <svg viewBox="0 0 16 16" aria-hidden>
                  <path d="M8 2v8M4.8 7l3.2 3.2L11.2 7M3 12.5h10" />
                </svg>
                Exportar PDF
              </button>
            </div>
          </div>
        </section>
      </main>

      <PlanPrintSheet plan={plan} descs={descs} firstName={firstName} updatedAt={updatedAt} />
    </div>
  );
}
