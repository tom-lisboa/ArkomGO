"use client";

// ConfirmDialog — confirmação obrigatória antes de exclusões (regra do PRD).
// Anatomia ARKOM · G4×ONE (12 §03 AlertDialog): tile 44px à esquerda + coluna de
// texto alinhada à esquerda + footer justify-end com par de botões auto-width.
// Uso:
// <ConfirmDialog open={open} onClose={...} onConfirm={async () => { await excluir(); }}
//   title="Excluir curso?" description="Esta ação não pode ser desfeita." />

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Excluir",
  loadingLabel = "Excluindo…",
  cancelLabel = "Cancelar",
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  loadingLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (loading) return;
    try {
      setLoading(true);
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm">
      {/* linha horizontal: tile de status à esquerda + coluna de texto */}
      <div className="flex gap-4">
        <div
          className={cn(
            "flex size-[44px] shrink-0 items-center justify-center rounded-[10px]",
            danger
              ? "bg-danger-subtle text-danger"
              : "bg-accent-subtle text-text-accent"
          )}
        >
          <TriangleAlert className="h-[22px] w-[22px]" />
        </div>
        <div className="flex min-w-0 grow basis-0 flex-col gap-2 pt-0.5">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-primary">
            {title}
          </h2>
          {description && (
            <p className="text-sm leading-relaxed text-secondary">{description}</p>
          )}
        </div>
      </div>
      {/* footer: par de botões auto-width, alinhados à direita */}
      <div className="mt-5 flex justify-end gap-[10px]">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? "danger" : "accent"}
          onClick={handleConfirm}
          aria-disabled={loading || undefined}
          className={loading ? "pointer-events-none opacity-90" : undefined}
        >
          {loading ? (
            <>
              <Loader2 className="h-[15px] w-[15px] shrink-0 animate-spin" />
              {loadingLabel}
            </>
          ) : (
            confirmLabel
          )}
        </Button>
      </div>
    </Modal>
  );
}
