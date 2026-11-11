"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { useLocale, useT } from "@/lib/i18n";
import {
  BRAIN_FILE_URL,
  INSTALL,
  generateSkillMd,
  macCommand,
  winCommand,
  type BrainSections,
} from "./content";

type OS = "mac" | "win";

/**
 * Post-build install card (findings A6). Mac/Linux ⇄ Windows toggle, a click-to-
 * copy command box, and a "Download it" link that generates the SKILL.md locally
 * from the answered sections. The command shows the mock {fileUrl} stand-in; the
 * real download is produced client-side, so nothing hits an external endpoint.
 */
export function BrainInstall({ brain }: { brain: BrainSections }) {
  const t = useT();
  const { locale } = useLocale();
  const [os, setOs] = useState<OS>("mac");
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const command = os === "mac" ? macCommand(BRAIN_FILE_URL) : winCommand(BRAIN_FILE_URL);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable (insecure context) — no-op */
    }
  }

  function download() {
    const blob = new Blob([generateSkillMd(brain)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "SKILL.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const tab = (id: OS, label: string) => (
    <button
      type="button"
      onClick={() => setOs(id)}
      aria-pressed={os === id}
      className={`rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${
        os === id
          ? "bg-st-card-2 text-st-ivory"
          : "text-st-ink-3 hover:text-st-ivory"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="mt-8 rounded-[16px] border border-st-line-2 bg-st-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-st-ink-3">
          {INSTALL.label[locale]}
        </span>
        <div className="flex items-center gap-1 rounded-[10px] border border-st-line-2 bg-st-card p-0.5">
          {tab("mac", INSTALL.osMac)}
          {tab("win", INSTALL.osWin)}
        </div>
      </div>

      {/* Command box — click to copy */}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? t.brain.copied : t.brain.copyCmd}
        className="group relative mt-4 block w-full rounded-[12px] border border-st-line-2 bg-st-card-2 p-4 text-left"
      >
        <code className="block break-all pr-16 font-mono text-[12px] leading-relaxed text-st-ivory">
          {command}
        </code>
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-[6px] border border-st-line-2 bg-st-card px-2 py-1 text-[10.5px] font-semibold text-st-ink-2">
          {copied ? <Check className="size-3 text-[#c58b5f]" /> : <Copy className="size-3" />}
          {copied ? t.brain.copied : t.brain.copyCmd}
        </span>
      </button>

      {/* Foot */}
      <p className="mt-4 text-[12px] leading-relaxed text-st-ink-3">
        {INSTALL.footMain[locale]}
        <span className="text-st-ink-3"> · </span>
        {INSTALL.footFilePrefix[locale]}{" "}
        <button
          type="button"
          onClick={download}
          className="font-medium text-st-ink-2 underline underline-offset-2 transition-colors hover:text-st-ivory"
        >
          {INSTALL.footFileLink[locale]}
        </button>
      </p>
    </section>
  );
}
