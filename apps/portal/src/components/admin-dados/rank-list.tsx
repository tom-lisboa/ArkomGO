// RankList — lista ranqueada com barras proporcionais (dashboard admin, Story 1.7).
// Uso: <RankList items={[{ label: "Curso X", value: 120 }]} unit="acessos" />

export type RankItem = { label: string; value: number };

export function RankList({ items, unit }: { items: RankItem[]; unit: string }) {
  if (items.length === 0) {
    return (
      <p className="py-5 text-center text-base text-tertiary">
        Sem dados registrados até o momento.
      </p>
    );
  }
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="flex items-center gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-semibold text-navy-800">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium text-primary">
                {item.label}
              </p>
              <p className="shrink-0 font-mono text-xs font-semibold text-secondary">
                {item.value.toLocaleString("pt-BR")} {unit}
              </p>
            </div>
            <div className="mt-1 h-3 w-full overflow-hidden rounded-sm bg-neutral-300">
              <div
                className="h-full rounded-sm bg-gold-500"
                style={{ width: `${Math.max(4, Math.round((item.value / max) * 100))}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
