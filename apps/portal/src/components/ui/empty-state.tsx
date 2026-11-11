// EmptyState — uso:
// <EmptyState icon={<Inbox className="h-6 w-6" />} title="Nada por aqui"
//   description="Quando houver conteúdo, ele aparece aqui." action={<Button>Criar</Button>} />

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-lg border border-border bg-surface px-5 py-14 text-center",
        className
      )}
    >
      {icon && (
        <div className="flex size-[56px] shrink-0 items-center justify-center rounded-full bg-neutral-100">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold tracking-[-0.01em] text-primary">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm leading-normal text-secondary">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
