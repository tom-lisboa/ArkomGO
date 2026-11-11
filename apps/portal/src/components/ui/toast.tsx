"use client";

// Toast — feedback visual obrigatório ao salvar/concluir/avaliar/confirmar (PRD §13).
// Setup: <ToastProvider> já envolve o app no layout raiz.
// Uso em client components:
//   const { toast } = useToast();
//   toast({ title: "Aula concluída!", variant: "success" });

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";

export type ToastVariant = "success" | "error" | "info";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  action?: { label: string; onClick: () => void };
};

type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<{ toast: (t: ToastInput) => void } | null>(null);

const ICONS: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />,
  error: <XCircle className="h-5 w-5 shrink-0 text-red-400" />,
  info: <Info className="h-5 w-5 shrink-0 text-info" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach(clearTimeout);
      activeTimers.clear();
    };
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, variant: "success", ...input }]);
      const timer = setTimeout(() => {
        remove(id);
        timers.current.delete(timer);
      }, 4000);
      timers.current.add(timer);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="backend-surface pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(392px,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            // Casco SÓLIDO (mesma receita do GlassModal): o token translúcido
            // anterior (surface-inverse-panel) sumia sobre fundo escuro e o
            // texto se misturava com a página.
            className="toast-enter pointer-events-auto flex items-center gap-3 rounded-lg border p-4 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.7)]"
            style={{
              background: "rgba(16,20,29,0.98)",
              borderColor:
                t.variant === "error"
                  ? "rgba(229,72,77,0.55)"
                  : t.variant === "info"
                    ? "rgba(233,228,214,0.22)"
                    : "rgba(74,222,128,0.4)",
            }}
          >
            {ICONS[t.variant ?? "success"]}
            <div className="min-w-0 grow basis-0">
              <p className="text-sm font-semibold text-white">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-white/80">{t.description}</p>
              )}
            </div>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  remove(t.id);
                }}
                className="shrink-0 font-sans text-[13px] font-medium text-gold-300"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast deve ser usado dentro de <ToastProvider>.");
  return ctx;
}
