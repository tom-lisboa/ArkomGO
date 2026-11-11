"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { usePlan } from "@/lib/plan";
import { useLocale } from "@/lib/i18n";
import { skillName } from "@/lib/content-pt";
import { GlassModal } from "@/components/GlassModal";
import { type Job } from "./skilltree-data";
import { SKILL_PREVIEWS } from "./skill-previews";
import { SKILL_PREVIEWS_GENERATED } from "./skill-previews-generated";
import { SkillPreviewMarkdown } from "./skill-preview-md";

interface SkillFilePopupProps {
  slug: string;
  job: Job;
  onClose: () => void;
}

/**
 * Per-skill preview on the canonical GlassModal — opened by clicking a leaf/dot
 * on the fan (or a skill satellite). Renders the real marketing-safe excerpt
 * (SKILL_PREVIEWS, EN — founder exception). Reading is open to everyone; members
 * additionally get the install command. Chrome localizes; the technical body does not.
 */
export function SkillFilePopup({ slug, job, onClose }: SkillFilePopupProps) {
  const { isPro } = usePlan();
  const { locale } = useLocale();
  const pt = locale === "pt";
  const [copied, setCopied] = useState(false);

  // real preview first (78 verbatim from the original); generated pattern as
  // fallback (Pacote 13 N3 — flagged generated: true, never verbatim).
  const preview = SKILL_PREVIEWS[slug] ?? SKILL_PREVIEWS_GENERATED[slug]?.body;

  const copyInstall = async () => {
    try {
      await navigator.clipboard.writeText(`npx arkom add ${slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <>
      <GlassModal
        onClose={onClose}
        eyebrow={pt ? "Arquivo de skill" : "Skill file"}
        title={skillName(locale, slug)}
        maxWidth={460}
      >
        {/* preview body — reading is OPEN in both tiers (matches the original .rpanel);
            the gate lives on the actions below, not on a fade/cap of the text. */}
        {preview ? (
          <div className="pb-1">
            <SkillPreviewMarkdown md={preview} />
          </div>
        ) : (
          <p className="text-[12.5px] leading-[1.65] text-st-ink-2">
            {pt
              ? `Job: ${job.name}. A prévia completa desta skill ainda não está publicada — o arquivo executável vem no plano de membro.`
              : `Part of: ${job.name}. The full preview for this skill isn't published yet — the runnable file ships with membership.`}
          </p>
        )}

        {/* member action — install command (reading is open to everyone above) */}
        {isPro ? (
          <div
            className="mt-4 flex flex-col items-center gap-3 rounded-[10px] px-5 py-6 text-center"
            style={{ border: "1px solid rgba(94,234,212,.3)", background: "rgba(94,234,212,.06)" }}
          >
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-st-ivory">
              <Check size={14} className="text-[#5eead4]" />
              {pt ? "LER · SKILL.MD" : "READ · SKILL.MD"}
            </span>
            <button
              type="button"
              onClick={copyInstall}
              className="inline-flex items-center gap-2 rounded-[10px] bg-[#ECECEE] px-5 py-2.5 text-[12.5px] font-bold text-[#0A0A0C] transition-opacity hover:opacity-90"
            >
              <Copy size={13} />
              {copied ? (pt ? "Copiado" : "Copied") : (pt ? "Copiar comando de instalação" : "Copy install command")}
            </button>
            <code className="text-[11px] text-st-ink-2">npx arkom add {slug}</code>
          </div>
        ) : null}
      </GlassModal>
    </>
  );
}
