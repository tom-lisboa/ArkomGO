"use client";

// Modal — uso:
// const [open, setOpen] = useState(false);
// <Modal open={open} onClose={() => setOpen(false)} title="Título" footer={<Button>Ok</Button>}>corpo</Modal>

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

function subscribeToHydration() {
  return () => undefined;
}

function getClientHydrationSnapshot() {
  return true;
}

function getServerHydrationSnapshot() {
  return false;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  className,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
  /** `false` desativa fechar por Esc/clique no overlay — só o X e os botões
   *  fecham. Para conteúdo que não pode sumir por acidente (ex.: senha
   *  temporária exibida uma única vez). */
  dismissable?: boolean;
}) {
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, dismissable]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="backend-surface backend-modal-overlay modal-overlay-in fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissable) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          "modal-card-in flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-modal border border-border-subtle bg-surface shadow-modal",
          SIZES[size],
          className
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 p-5 pb-0">
          {title ? (
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-primary">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-[6px] text-tertiary transition-colors hover:bg-surface-hover hover:text-primary"
          >
            <X className="h-[20px] w-[20px]" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-[10px] px-5 pb-5 pt-1">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
