"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { useT } from "@/lib/i18n";

/**
 * Thin dismissible nudge that points members to set a password instead of
 * relying on the email magic link. Shows in BOTH tiers with the member copy
 * (Pkg5 Item 2) — dismissible.
 */
export function PasswordBanner() {
  const t = useT();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-[12px] border border-st-line-2 bg-st-card px-5 py-3.5">
      <p className="text-[13px] text-st-ink-2">
        {t.hub.passwordPre}
        <Link
          href="/settings"
          className="font-medium text-st-ivory underline-offset-2 hover:underline"
        >
          {t.hub.passwordLink}
        </Link>
        {t.hub.passwordPost}
      </p>
      <button
        type="button"
        aria-label={t.hub.dismiss}
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-[7px] p-1 text-st-ink-3 transition-colors hover:bg-white/[0.06] hover:text-st-ivory"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
