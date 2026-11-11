"use client";

import { memo } from "react";

import { useLocale } from "@/lib/i18n";
import { skillName } from "@/lib/content-pt";
import { computeSatellites, type Pt } from "./geometry";

const SVG_HALF = 1600;

interface SkillSatellitesProps {
  /** world position of the job node the satellites orbit. */
  center: Pt;
  /** public skill slugs (names only — the file body stays paid/locked). */
  skills: string[];
  /** department accent, drives the hover ring. */
  color: string;
  onSelect: (slug: string) => void;
}

/**
 * Small skill nodes fanned on the OUTWARD side of a focused job. Lives in the
 * world (inside .graph-stage) so it scales with the camera. Connectors run in a
 * co-located SVG; the interactive dots are HTML so they can be clicked/hovered.
 * Our extension — no equivalent in the reference; slugs are public, bodies aren't.
 */
function SkillSatellitesImpl({ center, skills, color, onSelect }: SkillSatellitesProps) {
  const { locale } = useLocale();
  const sats = computeSatellites(center, skills);
  if (sats.length === 0) return null;

  return (
    <div className="sat-layer" style={{ ["--c" as string]: color }}>
      <svg
        className="sat-under"
        style={{ left: -SVG_HALF, top: -SVG_HALF }}
        width={SVG_HALF * 2}
        height={SVG_HALF * 2}
        viewBox={`${-SVG_HALF} ${-SVG_HALF} ${SVG_HALF * 2} ${SVG_HALF * 2}`}
        aria-hidden
      >
        {sats.map((s, i) => (
          <path
            key={`se-${s.slug}-${i}`}
            className="sat-edge"
            d={s.edge}
            style={{ ["--d" as string]: `${(i * 0.04).toFixed(2)}s` }}
          />
        ))}
      </svg>

      {sats.map((s, i) => (
        <button
          key={`sn-${s.slug}-${i}`}
          type="button"
          className="sat-node"
          style={{ left: s.pos.x, top: s.pos.y, ["--d" as string]: `${(0.1 + i * 0.04).toFixed(2)}s` }}
          onClick={() => onSelect(s.slug)}
          aria-label={`Skill file: ${s.slug}`}
        >
          <span className="sat-dot" />
          <span className="sat-label">{skillName(locale, s.slug)}</span>
        </button>
      ))}
    </div>
  );
}

export const SkillSatellites = memo(SkillSatellitesImpl);
