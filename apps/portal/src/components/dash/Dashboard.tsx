"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { useLocale, useT } from "@/lib/i18n";
import { loc, DASH_PT } from "@/lib/content-pt";
import { Ic } from "./icons";
import { DashboardBody } from "./DashboardBody";
import type { Center } from "./dash-data";
import type { DashApiPayload, DataState, LiveCenter } from "@/lib/dash/types";
import { buildMetaCenter } from "./meta-center";

/** Pill de procedência — cor/rótulo honestos por estado do dado. */
const PILL: Record<DataState, { pt: string; en: string; cls: string }> = {
  live: { pt: "dados reais", en: "live data", cls: "on" },
  "live-partial": { pt: "parcial", en: "partial", cls: "warn" },
  "live-empty": { pt: "sem dados", en: "no data", cls: "off" },
  demo: { pt: "demonstração", en: "demo", cls: "off" },
};

/** The full, entered dashboard (scrolls inside .ddashview). */
export function Dashboard({
  center,
  range,
  onRange,
  onOpenGuide,
  prebuilt = false,
}: {
  center: Center;
  range: string;
  onRange: (r: string) => void;
  onOpenGuide: () => void;
  /** center já veio construído do server (buildEffectiveCenters) — não cair
   *  no engine client do Meta enquanto a API do range não responde. */
  prebuilt?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const tr = (s: string) => loc(locale, s, DASH_PT[s]);
  const style = { "--a": center.color } as CSSProperties;

  // Camada de dados (lib/dash): busca o center construído no server
  // (/api/dash/[center]?range) — builder liberado devolve LiveCenter; sem
  // builder (ou erro/rede), `live` fica null e caímos no snapshot estático.
  const [live, setLive] = useState<LiveCenter | null>(null);
  useEffect(() => {
    let on = true;
    setLive(null);
    fetch(`/api/dash/${center.id}?range=${encodeURIComponent(range)}`)
      .then((r) => (r.ok ? (r.json() as Promise<DashApiPayload>) : null))
      .then((d) => {
        if (on) setLive(d && "center" in d ? d : null);
      })
      .catch(() => {
        if (on) setLive(null);
      });
    return () => {
      on = false;
    };
  }, [center.id, range]);

  // Fallback local: center pré-construído do server vale como está; senão,
  // Meta Ads usa o engine seeded client-side e os demais o snapshot estático.
  // O resultado do builder da API (por range) tem precedência.
  const body = useMemo(() => {
    if (live) return live.center;
    if (prebuilt) return center;
    return center.id === "meta" ? buildMetaCenter(range, center) : center;
  }, [live, center, range, prebuilt]);

  const pill = PILL[live?.state ?? "demo"];

  return (
    <div className="dwrap enter" style={style} key={center.id}>
      <div className="dhead">
        <h2>
          {tr(center.name)}
          <span className="dlogos">
            {center.tools.map((t) => (
              <span className="tlogo" key={t}>
                {t}
              </span>
            ))}
          </span>
          <span
            className={`dsource ${pill.cls}`}
            title={live?.source ?? (locale === "pt" ? "snapshot de demonstração" : "demo snapshot")}
          >
            {locale === "pt" ? pill.pt : pill.en}
          </span>
        </h2>
        <button type="button" className="guidebtn" onClick={onOpenGuide}>
          <Ic name="terminal" />
          <span>{tr("Build guide + one-shot prompt")}</span>
        </button>
        <div className="spacer" />
        {center.ranges ? (
          <div className="ranges" role="group" aria-label={t.dash.timeRange}>
            {center.ranges.map((r) => (
              <button key={r} type="button" className={r === range ? "on" : ""} onClick={() => onRange(r)} aria-pressed={r === range}>
                {tr(r)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <DashboardBody center={body} />
    </div>
  );
}
