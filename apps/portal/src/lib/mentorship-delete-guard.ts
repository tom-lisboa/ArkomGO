// Regra: MENTORIA COM HISTÓRICO DE CRÉDITO NÃO SE EXCLUI.
//
// Por que existe (achado do dono no QA, 2026-07-28): `credit_ledger.event_id` e
// `credit_shadow_log.event_id` apontam para o evento com `ON DELETE SET NULL` —
// apagar a mentoria faria o Postgres tentar ZERAR esse vínculo dentro das duas
// tabelas. Só que as duas são append-only por trigger: recusam qualquer UPDATE
// e o DELETE morre com `23001` (`restrict_violation`). No /admin esse "não"
// aparecia como "Tente novamente" — mensagem enganosa, porque retentar nunca
// resolve: não é falha transitória, é regra do sistema.
//
// Extrato é histórico e não se apaga: mentoria que já gerou lançamento fica
// CANCELADA (fora do calendário do aluno, créditos estornados), nunca excluída.
//
// O texto do motivo mora aqui, e não na server action, para que a lista do
// /admin (que desabilita o botão Excluir) e o servidor (que corta de verdade)
// digam exatamente a mesma coisa — e para não exportar função não-async de um
// módulo `"use server"`.

/** Vínculos de crédito de UM evento. `sombra` = diário do modo sombra (0012). */
export type VinculosDeCredito = {
  /** Linhas no `credit_ledger` (débitos + estornos). */
  lancamentos: number;
  /** Alunos distintos com lançamento neste evento. */
  alunos: number;
  /** Linhas no `credit_shadow_log`. Bloqueiam sozinhas, mesmo sem extrato. */
  sombra: number;
};

/**
 * O motivo, em português de produto e com números para o admin conferir no
 * extrato. Devolve `null` quando não há vínculo — aí a exclusão pode seguir.
 */
export function motivoParaNaoExcluir(
  vinculos: VinculosDeCredito,
  cancelada: boolean,
): string | null {
  // Quem chama já diz "não pode ser excluída" no título (toast/erro): aqui o
  // texto entrega o MOTIVO e o caminho, sem repetir a negativa.
  const desfecho = cancelada
    ? "Ela permanece cancelada e fora do calendário do aluno."
    : 'Para tirá-la do ar, use "Cancelar pelo Arkom": sai do calendário do aluno e estorna os créditos.';

  if (vinculos.lancamentos > 0) {
    const plural = vinculos.lancamentos === 1 ? "lançamento" : "lançamentos";
    const quem = vinculos.alunos === 1 ? "de 1 aluno" : `de ${vinculos.alunos} alunos`;
    return (
      `Ela tem ${vinculos.lancamentos} ${plural} de crédito (débitos/estornos) ` +
      `no extrato ${quem}, e extrato é histórico: não se apaga. ${desfecho}`
    );
  }

  if (vinculos.sombra > 0) {
    const plural = vinculos.sombra === 1 ? "registro" : "registros";
    return (
      `Ela tem ${vinculos.sombra} ${plural} no histórico de créditos, ` +
      `que é permanente e não se apaga. ${desfecho}`
    );
  }

  return null;
}
