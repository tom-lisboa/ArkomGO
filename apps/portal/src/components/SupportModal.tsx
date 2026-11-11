"use client";

// SupportModal — aberto pelo item "Suporte" da barra lateral. Espelha o modal do
// bilhon-solutions (WhatsApp + central de ajuda), no DS steel do arkom.

import { useEffect } from "react";
import { ExternalLink, LifeBuoy, MessageCircle, X } from "lucide-react";
import {
  SUPPORT_SITE_URL,
  SUPPORT_WHATSAPP,
  SUPPORT_WHATSAPP_LINK,
} from "@/lib/support";

export function SupportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Suporte"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="st-modal-elev relative w-full max-w-[420px] rounded-[18px] border border-st-line-2 bg-st-bg p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 text-st-ink-3 transition-colors hover:text-st-ivory"
        >
          <X className="size-4" />
        </button>

        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-[12px] border border-st-line-2 bg-st-card text-[#dcc279]">
            <LifeBuoy className="size-5" />
          </span>
          <h2 className="text-[18px] font-bold tracking-[-0.01em] text-st-ivory">Suporte Arkom</h2>
        </div>

        <p className="mb-5 text-[14px] leading-relaxed text-st-ink-2">
          Precisa de ajuda? Fale com a nossa equipe pelo WhatsApp ou acesse a central de
          ajuda. Atendimento de segunda a sexta, das 9h às 18h.
        </p>

        <div className="flex flex-col gap-2.5">
          <a
            href={SUPPORT_WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="cap-btn-p flex w-full items-center justify-center gap-2 rounded-[10px] bg-st-ivory px-4 py-3 text-[14px] font-bold text-st-bg"
          >
            <MessageCircle className="size-4" /> WhatsApp {SUPPORT_WHATSAPP}
          </a>
          <a
            href={SUPPORT_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-st-line-2 px-4 py-3 text-[14px] font-semibold text-st-ink-2 transition-colors hover:text-st-ivory"
          >
            <ExternalLink className="size-4" /> Central de ajuda
          </a>
        </div>
      </div>
    </div>
  );
}
