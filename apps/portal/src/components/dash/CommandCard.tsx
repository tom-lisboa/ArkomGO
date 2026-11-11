"use client";

import type { CSSProperties } from "react";

import { useLocale } from "@/lib/i18n";
import { loc, DASH_PT } from "@/lib/content-pt";
import { DashboardBody } from "./DashboardBody";
import type { Center } from "./dash-data";

/** One face of the 3D ring — a scaled, static preview of the full dashboard. */
export function CommandCard({
  center,
  cardRef,
  onActivate,
}: {
  center: Center;
  cardRef: (el: HTMLDivElement | null) => void;
  onActivate: () => void;
}) {
  const { locale } = useLocale();
  const tr = (s: string) => loc(locale, s, DASH_PT[s]);
  const style = { "--c": center.color } as CSSProperties;
  const scalerStyle = { "--a": center.color } as CSSProperties;
  return (
    <div className="ccard" ref={cardRef} style={style} onClick={onActivate} role="button" tabIndex={-1} aria-label={`Open ${tr(center.name)}`}>
      <div className="cface">
        <div className="cprev">
          <div className="scaler dwrap" style={scalerStyle}>
            <DashboardBody center={center} preview />
          </div>
        </div>
        <div className="cmeta">
          <div className="cname">
            <span className="dot" />
            {tr(center.name)}
          </div>
          <div className="csub">{tr(center.sub)}</div>
          <div className="clogos">
            {center.tools.map((t) => (
              <span className="tlogo" key={t}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="cback">
        <div className="bk">ARKOM</div>
      </div>
    </div>
  );
}
