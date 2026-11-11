"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUpRight, Lock, X } from "lucide-react";

import "./solutions.css";
import "../trainings/trainings.css";
import { useT } from "@/lib/i18n";
import { resolveWorkspaceName } from "@/components/home/content";
import type { StudentApp } from "@/components/apps/data";
import { registerClick } from "../apps/actions";

/**
 * /solutions — a roda das soluções conectadas, agora alimentada pelos apps
 * reais do banco (StudentApp[]). Mantém o visual (painel terminal-inverse,
 * grafo radial, linhas gold tracejadas, drawer left-anchored do MAP) e troca:
 * · núcleo = nome do workspace do setup do Brain (localStorage), resolvido aqui;
 * · satélites = apps publicados (live = disponível; em breve = dimmed + cadeado);
 * · drawer CTA "Acessar" para apps disponíveis → registra o clique e abre o
 *   redirect_url externo; "em breve" fica travado. Apps não têm aula, então o
 *   antigo CTA "ver aula" saiu.
 */

const RADIUS_PCT = 38;

function satellitePos(i: number, n: number) {
  const angle = (-90 + (360 / n) * i) * (Math.PI / 180);
  return {
    left: `${50 + RADIUS_PCT * Math.cos(angle)}%`,
    top: `${50 + RADIUS_PCT * Math.sin(angle)}%`,
    lineX: 50 + RADIUS_PCT * Math.cos(angle),
    lineY: 50 + RADIUS_PCT * Math.sin(angle),
  };
}

export function SolutionsBody({ apps }: { apps: StudentApp[] }) {
  const t = useT();
  const [selected, setSelected] = useState<StudentApp | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // client-only: lê o storage da entrevista do Brain (skilltree-brain)
    setWorkspace(resolveWorkspaceName(t.solucoes.yourWorkspace));
  }, [t.solucoes.yourWorkspace]);

  // A roda é desenhada num tamanho NATURAL fixo (760px, onde os 12 satélites
  // não se sobrepõem) e escalada pra caber no espaço disponível — assim cabe na
  // primeira dobra sem scroll E sem satélite entrando "no cu do outro".
  const wheelWrapRef = useRef<HTMLDivElement>(null);
  const [wheelScale, setWheelScale] = useState(1);
  useEffect(() => {
    const el = wheelWrapRef.current;
    if (!el) return;
    const NAT = 760;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) {
        setWheelScale(Math.min(1, Math.min(r.width, r.height) / NAT));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const liveCount = apps.filter((s) => s.available).length;
  const categories = new Set(apps.map((s) => s.category)).size;

  /** Abre o app externo: janela síncrona (sobrevive ao bloqueador de popup) +
   *  registra o clique em app_clicks; se o popup foi bloqueado, navega a aba.
   *  Sem "noopener" na feature string: com ela o window.open SEMPRE retorna
   *  null (spec) e o fallback navegava a aba atual JUNTO com a nova aba —
   *  cortamos o opener na mão (mesma segurança, ref válida). */
  function openApp(app: StudentApp) {
    if (!app.available) return;
    const target = app.redirectUrl;
    const win = target ? window.open(target, "_blank") : null;
    if (win) win.opener = null;
    startTransition(async () => {
      const res = await registerClick(app.id);
      if (res.ok && !win) window.location.href = res.redirectUrl;
    });
  }

  return (
    <div className="w-full">
      {/* desktop: painel ocupa a viewport inteira (primeira dobra, sem scroll);
          mobile: altura natural (rola normalmente). */}
      <div className="sol-panel flex flex-col overflow-hidden px-6 pb-4 pt-5 sm:h-[calc(100dvh-90px)]">
        {/* terminal chrome — 3 dots + path */}
        <div className="relative z-10 mb-4 flex shrink-0 items-center gap-3">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2.5 rounded-full bg-white/15" />
            ))}
          </span>
          <span className="font-mono text-[11px] tracking-[0.04em] text-white/40">
            {t.solucoes.terminal}
          </span>
        </div>

        {/* headline */}
        <div className="relative z-10 mx-auto max-w-[680px] shrink-0 text-center">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.22em] text-[#c9a84c]">
            {t.solucoes.eyebrow}
          </p>
          <h1 className="mt-2 text-[clamp(26px,3.2vw,40px)] font-bold leading-[1.05] tracking-[-0.02em] text-white">
            {t.solucoes.title}
          </h1>
          <p className="mx-auto mt-2.5 max-w-[520px] text-[13.5px] leading-relaxed text-white/55">
            {t.solucoes.sub}
          </p>
        </div>

        {/* the wheel — ocupa o espaço restante; a roda natural (760px) é escalada
            pra caber (1ª dobra sem scroll, satélites sem sobrepor) */}
        <div
          ref={wheelWrapRef}
          className="relative z-10 mt-4 flex h-[92vw] max-h-[540px] items-center justify-center overflow-hidden sm:h-auto sm:max-h-none sm:min-h-0 sm:flex-1"
        >
          <div
            className="absolute left-1/2 top-1/2 h-[760px] w-[760px]"
            style={{ transform: `translate(-50%, -50%) scale(${wheelScale})` }}
          >
          {/* rings + lines */}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r={RADIUS_PCT} stroke="#ffffff14" strokeWidth="0.25" />
            <circle cx="50" cy="50" r={RADIUS_PCT * 0.62} stroke="#ffffff0d" strokeWidth="0.25" />
            {apps.map((s, i) => {
              const p = satellitePos(i, apps.length);
              return (
                <line
                  key={s.id}
                  x1="50"
                  y1="50"
                  x2={p.lineX}
                  y2={p.lineY}
                  stroke={s.available ? "#c9a84c66" : "#ffffff1f"}
                  strokeWidth="0.3"
                  className={s.available ? "sol-line" : undefined}
                />
              );
            })}
          </svg>

          {/* core — workspace name from the Brain setup */}
          <div
            className="sol-core absolute left-1/2 top-1/2 z-10 flex h-[176px] w-[176px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full text-center"
            style={{
              background: "radial-gradient(80% 80% at 50% 32%, #232323 0%, #161616 70%)",
              border: "1px solid #c9a84c3d",
              boxShadow: "0 0 60px -18px #c9a84c66, inset 0 1px 0 #ffffff14",
            }}
          >
            <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-white/45">
              {t.solucoes.core}
            </span>
            <span className="mt-1.5 max-w-[140px] truncate px-2 text-[19px] font-bold tracking-[-0.01em] text-white">
              {workspace ?? "—"}
            </span>
            <span className="mt-2 flex items-center gap-1.5 text-[9.5px] text-white/50">
              <span className="size-1.5 rounded-full" style={{ background: "#7fd48a" }} />
              {t.solucoes.coreOnline(liveCount, apps.length)}
            </span>
          </div>

          {/* satellites — apps reais. Live = destacado (acento, opaco); em breve
              = compacto, esmaecido, com cadeado (mantém a roda legível com N alto). */}
          {apps.map((s, i) => {
            const p = satellitePos(i, apps.length);
            const active = selected?.id === s.id;
            const live = s.available;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelected(s)}
                className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-[10px] text-center transition-transform hover:scale-[1.05] ${
                  live ? "px-4 py-2.5" : "px-2.5 py-1.5"
                }`}
                style={{
                  left: p.left,
                  top: p.top,
                  background: active ? "#222222" : "#1a1a1acc",
                  border: `1px solid ${active ? s.accent : live ? "#ffffff24" : "#ffffff12"}`,
                  boxShadow: active
                    ? `0 0 0 1px ${s.accent}55, 0 18px 44px -22px #000000cc`
                    : "0 14px 38px -26px #000000aa",
                  backdropFilter: "blur(6px)",
                  opacity: live ? 1 : 0.6,
                  zIndex: active ? 30 : live ? 20 : 10,
                }}
              >
                <span
                  className={`block max-w-[132px] truncate font-bold uppercase tracking-[0.05em] text-white ${
                    live ? "text-[12px]" : "text-[10px]"
                  }`}
                >
                  {s.name}
                </span>
                <span className="mt-1 flex items-center justify-center gap-1 text-[8px] font-bold uppercase tracking-[0.14em] text-white/40">
                  {live ? (
                    <span className="max-w-[120px] truncate">{s.categoryName}</span>
                  ) : (
                    <>
                      {t.solucoes.comingSoon} <Lock className="size-2.5" />
                    </>
                  )}
                </span>
              </button>
            );
          })}

          {/* drawer — o padrão JobDrawer do MAP, left-anchored (adendo 2) */}
          {selected ? (
            <aside
              className="sol-drawer-in cap-scroll absolute left-0 top-[8px] z-40 w-[calc(100%-56px)] max-w-[364px] rounded-[10px] p-5"
              style={{
                maxHeight: "calc(100% - 16px)",
                overflowY: "auto",
                background: "#141416f2",
                backdropFilter: "blur(16px) saturate(1.2)",
                WebkitBackdropFilter: "blur(16px) saturate(1.2)",
                border: "1px solid #ffffff1f",
                boxShadow: "0 30px 80px -30px rgba(0,0,0,.7)",
              }}
            >
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Fechar"
                className="float-right grid size-[30px] place-items-center rounded-full text-[13px] text-white/60 transition-colors hover:text-white"
                style={{ border: "1px solid #ffffff1f" }}
              >
                <X size={13} />
              </button>

              {/* c-state */}
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                {selected.available ? t.solucoes.live : t.solucoes.comingSoon}
              </span>

              {/* c-name */}
              <h2 className="mb-1 mt-3 text-[26px] font-bold tracking-[-0.01em] text-white">
                {selected.name}
              </h2>

              {/* c-crumb */}
              <div className="mb-3 text-[11px] tracking-[0.06em] text-white/45">
                {workspace ?? "—"} · {selected.categoryName}
              </div>

              {/* body */}
              {selected.strap ? (
                <p className="mb-4 text-[13px] leading-[1.65] text-white/80">
                  {selected.strap}
                </p>
              ) : null}

              {/* facts — a grade de labels (92px) do JobDrawer */}
              <div className="mb-5 flex flex-col gap-2.5">
                <div className="flex gap-3">
                  <span className="w-[92px] shrink-0 pt-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/40">
                    Categoria
                  </span>
                  <span className="min-w-0 text-[12px] leading-relaxed text-white/75">
                    {selected.categoryName}
                  </span>
                </div>
                <div className="flex gap-3">
                  <span className="w-[92px] shrink-0 pt-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/40">
                    Status
                  </span>
                  <span className="min-w-0 text-[12px] leading-relaxed text-white/75">
                    {selected.available ? t.solucoes.live : t.solucoes.comingSoon}
                  </span>
                </div>
              </div>

              {/* CTA — Acessar (registra o clique + abre o redirect externo) ou
                  travado. Apps não têm aula: sem CTA "ver aula". */}
              {selected.available ? (
                <button
                  type="button"
                  onClick={() => openApp(selected)}
                  disabled={pending}
                  className="cap-btn-p flex w-full items-center justify-center gap-2 rounded-[9px] bg-white px-4 py-2.5 text-[12.5px] font-bold text-black disabled:opacity-60"
                >
                  {t.apps.access} <ArrowUpRight className="size-4" />
                </button>
              ) : (
                <span className="flex items-center justify-center gap-2 rounded-[9px] border border-white/10 px-4 py-2.5 text-[12.5px] font-bold text-white/35">
                  <Lock className="size-3.5" /> {t.solucoes.comingSoon}
                </span>
              )}
            </aside>
          ) : null}
          </div>
        </div>

        {/* footer strip */}
        <div className="relative z-10 mt-3 shrink-0 border-t border-white/10 pt-3 text-center">
          <p className="text-[11px] tracking-[0.04em] text-white/40">
            {t.solucoes.footer(apps.length, categories)}
          </p>
        </div>
      </div>
    </div>
  );
}
