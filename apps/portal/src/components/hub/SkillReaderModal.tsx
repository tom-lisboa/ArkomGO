"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, Copy, FileText, X } from "lucide-react";

import { useLocale, useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { SkillMarkdown } from "./SkillMarkdown";
import { deptNamePt, skillNamePt } from "./skill-names-pt";
import {
  canonicalSlug,
  getSkillFile,
  macInstallCmd,
  winInstallCmd,
} from "./skill-previews";
import { getSkillBodyLocalized } from "./skill-previews-pt";

type OS = "mac" | "win";

const OS_MAC = "Mac / Linux"; // OS names stay EN in both locales (per spec)
const OS_WIN = "Windows";

interface SkillReaderModalProps {
  slug: string;
  title: string;
  department: string;
  /** EN fallback body when the slug has no dataset preview (FD3). */
  description: string;
  onClose: () => void;
  /**
   * Optional block rendered at the TOP of the body, above the SKILL.md preview
   * (the map reader passes the rglance — AT A GLANCE / NEEDS / COVERS ON THE MAP).
   * Hub/drops omit it → identical to before.
   */
  glance?: ReactNode;
  /**
   * Free-tier gate (map). When true the preview body is capped + faded and the
   * install footer is replaced by `lockedFooter`. Hub/drops omit it → full body.
   */
  locked?: boolean;
  /** Replacement footer shown when `locked` (the become-a-member CTA). */
  lockedFooter?: ReactNode;
}

/**
 * Fresh-drops reader modal (Pkg11 · N7 FD2/FD3) — the `.im-card.im-reader` from the
 * live capture: head (icon + title + sub), the SKILL.md preview body, and the INSTALL
 * footer (Mac/Linux ⇄ Windows tabs + click-to-copy command + download + map link).
 * Body is EN (technical file); chrome is dict-translated. Token-driven for 2 themes.
 * The install command is a declared mock (skilltree.example) — see skill-previews.ts.
 */
export function SkillReaderModal({
  slug,
  title,
  department,
  description,
  onClose,
  glance,
  locked = false,
  lockedFooter,
}: SkillReaderModalProps) {
  const t = useT();
  const { locale } = useLocale();
  const { theme } = useTheme();
  const fadeTo = theme === "light" ? "#ffffff" : "rgb(16,20,29)";
  const [os, setOs] = useState<OS>("mac");
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const s = canonicalSlug(slug);
  const body = getSkillBodyLocalized(s, title, description, locale);
  const fileContent = getSkillFile(s, title, description);
  const command = os === "mac" ? macInstallCmd(s) : winInstallCmd(s);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  function download() {
    const blob = new Blob([fileContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "SKILL.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const osTab = (id: OS, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={os === id}
      onClick={() => setOs(id)}
      className={`rounded-[7px] px-2.5 py-1 text-[12px] font-semibold transition-colors ${
        os === id ? "bg-st-card-2 text-st-ivory" : "text-st-ink-3 hover:text-st-ivory"
      }`}
    >
      {label}
    </button>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center p-5"
      style={{ background: "rgba(6,7,10,.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[calc(100vh-56px)] w-full max-w-[720px] flex-col overflow-hidden rounded-[16px] border border-st-line-2 bg-st-card"
        style={{ boxShadow: "var(--st-shadow)" }}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t.common.close}
          className="absolute right-4 top-4 z-10 grid size-[30px] place-items-center rounded-full border border-st-line-2 bg-st-card text-st-ink-2 transition-colors hover:text-st-ivory"
        >
          <X size={15} />
        </button>

        {/* Head */}
        <div className="flex items-start gap-3.5 border-b border-st-line-2 px-6 py-5 pr-14">
          <span className="grid size-10 shrink-0 place-items-center rounded-[11px] border border-st-line-2 bg-st-card-2 text-st-ink-2">
            <FileText className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[17px] font-bold leading-tight tracking-[-0.01em] text-st-ivory">
              {skillNamePt(title, locale)}
            </h3>
            <span className="mt-1 block text-[12.5px] text-st-ink-2">
              {t.hub.reader.sub(deptNamePt(department, locale))}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="map-scroll flex-1 overflow-auto px-6 py-5">
          {glance}
          {locked ? (
            <div className="relative">
              <div className="max-h-[38vh] overflow-hidden">
                <SkillMarkdown markdown={body} />
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-20"
                style={{ background: `linear-gradient(to bottom, transparent, ${fadeTo})` }}
              />
            </div>
          ) : (
            <SkillMarkdown markdown={body} />
          )}
        </div>

        {/* Footer — install (member/drops) or the locked CTA (map free tier) */}
        {locked && lockedFooter ? (
          lockedFooter
        ) : (
        <div className="border-t border-st-line-2 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-st-ink-3">
              {t.hub.reader.installLabel}
            </span>
            <div
              role="tablist"
              aria-label="Operating system"
              className="flex items-center gap-1 rounded-[9px] border border-st-line-2 bg-st-card p-0.5"
            >
              {osTab("mac", OS_MAC)}
              {osTab("win", OS_WIN)}
            </div>
          </div>

          <button
            type="button"
            onClick={copy}
            title={t.hub.reader.copy}
            className="group relative mt-3 block w-full rounded-[10px] border border-st-line-2 bg-st-card-2 p-3 text-left"
          >
            <code className="block break-all pr-16 font-mono text-[12px] leading-relaxed text-st-ivory">
              {command}
            </code>
            <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-[6px] border border-st-line-2 bg-st-card px-2 py-1 text-[10.5px] font-semibold text-st-ink-2">
              {copied ? <Check className="size-3 text-[#c58b5f]" /> : <Copy className="size-3" />}
              {copied ? t.hub.reader.copied : t.hub.reader.copy}
            </span>
          </button>

          <p className="mt-3 text-[12px] leading-relaxed text-st-ink-3">
            {t.hub.reader.footRunPre}{" "}
            <code className="rounded-[5px] bg-st-card-2 px-1.5 py-0.5 font-mono text-[11px] text-st-ivory">
              /{s}
            </code>{" "}
            {t.hub.reader.footRunPost}
            <span className="text-st-ink-3"> · </span>
            <button
              type="button"
              onClick={download}
              className="font-medium text-st-ink-2 underline underline-offset-2 transition-colors hover:text-st-ivory"
            >
              {t.hub.reader.downloadFile}
            </button>
            <span className="text-st-ink-3"> · </span>
            <Link
              href="/map"
              className="font-medium text-st-ink-2 transition-colors hover:text-st-ivory"
            >
              {t.hub.reader.seeOnMap}
            </Link>
          </p>
        </div>
        )}
      </div>
    </div>,
    document.body
  );
}
