"use client";

import { ArrowRight } from "lucide-react";

import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { STAGES } from "./chart-matrix";

/** Stage number (1-4) → dict key, so labels/subs come from t.chart.stages. */
const STAGE_KEYS = ["foundation", "capture", "generate", "orchestrate"] as const;

/** The sticky X-axis header: rollout-order corner + the 4 named stage cards. */
export function StageRibbon() {
  const t = useT();
  return (
    <div className="ribbon">
      <div className="ribbon-corner">
        <span className="rc-k">{t.chart.rolloutOrder}</span>
        <span className="rc-arrow">
          {t.chart.first} <ArrowRight size={13} /> {t.chart.last}
        </span>
      </div>
      {STAGES.map((s) => {
        const key = STAGE_KEYS[s.n - 1];
        return (
        <div key={s.n} className="stage">
          <div className="s-top">
            <span className="s-num">{s.n}</span>
            <span className="s-name">{t.chart.stages[key]}</span>
          </div>
          <div className="s-sub">{t.chart.stageSub[key]}</div>
          <div className="s-pips">
            {[1, 2, 3, 4].map((i) => (
              <i key={i} className={cn(i <= s.n && "fill")} />
            ))}
          </div>
        </div>
        );
      })}
    </div>
  );
}
