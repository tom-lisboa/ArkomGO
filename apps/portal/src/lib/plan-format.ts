// lib/plan-format.ts — rótulos pt-BR dos campos de plano.
// Módulo puro (sem banco, sem React): usado pela tabela de /admin/plans e pelo
// painel de plano na ficha do aluno, para os dois falarem a MESMA língua.

export type PlanoDuracao = {
  permissive: boolean;
  duration_months: number | null;
};

export type PlanoCota = {
  permissive: boolean;
  mentorship_credits: number | null;
  credit_period: "month" | "total";
};

/** "Sem prazo" · "3 meses" */
export function rotuloDuracao(plano: PlanoDuracao): string {
  if (plano.permissive || plano.duration_months === null) return "Sem prazo";
  return `${plano.duration_months} ${plano.duration_months === 1 ? "mês" : "meses"}`;
}

/** "Ilimitadas" · "8h no total" · "24h por mês" (unidade = HORA de mentoria) */
export function rotuloCota(plano: PlanoCota): string {
  if (plano.permissive || plano.mentorship_credits === null) return "Ilimitadas";
  const sufixo = plano.credit_period === "month" ? "por mês" : "no total";
  return `${plano.mentorship_credits}h ${sufixo}`;
}
