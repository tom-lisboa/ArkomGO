"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { ARKOM_DEMO_PLAN_ENABLED, usePlan } from "@/lib/plan";
import { useT } from "@/lib/i18n";
import { GlassModal } from "@/components/GlassModal";
import { LoginModal } from "@/components/LoginModal";

interface PaywallModalProps {
  onClose: () => void;
  /** fired after the mock checkout / real login unlocks Pro. */
  onUnlocked?: () => void;
}

/**
 * Single reusable paywall on the canonical GlassModal. "Continue to checkout"
 * simulates a successful unlock (mock — flips the demo plan to pro). "Already a
 * member? Log in" opens the real Supabase LoginModal.
 */
export function PaywallModal({ onClose, onUnlocked }: PaywallModalProps) {
  const { upgrade, showToast } = usePlan();
  const t = useT();
  const p = t.modals.paywall;
  const [login, setLogin] = useState(false);
  const unlocks = [p.unlock1, p.unlock2, p.unlock3];

  const checkout = () => {
    upgrade();
    if (!ARKOM_DEMO_PLAN_ENABLED) return;
    showToast(p.welcomeToCohort);
    onUnlocked?.();
    onClose();
  };

  return (
    <>
      <GlassModal
        onClose={onClose}
        eyebrow={p.foundingCohort}
        title={p.joinCohort}
        maxWidth={440}
        bodyClassName="px-7 py-6"
      >
        <p className="text-[13px] text-st-ink-2">{p.seats}</p>

        <ul className="mt-5 flex flex-col gap-2.5">
          {unlocks.map((u) => (
            <li
              key={u}
              className="flex items-start gap-2.5 text-[13px] leading-snug text-st-ivory/90"
            >
              <Check size={15} className="mt-0.5 shrink-0 text-[#c58b5f]" />
              {u}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={checkout}
          className="mt-6 w-full rounded-[10px] bg-[#ECECEE] py-3 text-[13.5px] font-bold text-[#0A0A0C] transition-opacity hover:opacity-90"
        >
          {ARKOM_DEMO_PLAN_ENABLED ? p.checkout : "Upgrade indisponível"}
        </button>
        {ARKOM_DEMO_PLAN_ENABLED ? (
          <button
            type="button"
            onClick={() => setLogin(true)}
            className="mt-3 w-full text-center text-[12px] text-st-ink-2 transition-colors hover:text-st-ivory"
          >
            {p.alreadyMember}
          </button>
        ) : null}
      </GlassModal>

      {ARKOM_DEMO_PLAN_ENABLED && login ? (
        <LoginModal
          onClose={() => setLogin(false)}
          onSuccess={() => {
            onUnlocked?.();
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
