// StatCard — card de métrica do dashboard admin (Story 1.7).
// Pilha VERTICAL do ARKOM: kicker mono → número-herói (MetricNumber) → apoio.
// variant="metric" adiciona a régua dourada (border-l-2 border-gold-500 pl-4).
// Uso: <StatCard icon={<Users />} label="Total de alunos" value={30} hint="+2 este mês" />

import type { ReactNode } from "react";
import { Card, MetricNumber } from "@/components/ui";
import { cn } from "@/lib/utils";

export function StatCard({
  icon,
  label,
  value,
  hint,
  variant = "default",
}: {
  icon?: ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  variant?: "default" | "metric";
}) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-3 p-6",
        variant === "metric" && "border-l-2 border-l-gold-500 pl-4"
      )}
    >
      {/* Kicker mono — ícone (se mantido) vira glifo secundário, não domina */}
      <div className="flex items-center gap-2">
        {icon && (
          <span className="shrink-0 text-tertiary [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )}
        <p className="font-mono text-2xs uppercase tracking-ultra text-metric-kicker">
          {label}
        </p>
      </div>
      {/* Número-herói canônico: DM Sans text-5xl bold leading-none, sem tracking */}
      <MetricNumber value={value} />
      {hint && <p className="font-sans text-sm text-secondary">{hint}</p>}
    </Card>
  );
}
