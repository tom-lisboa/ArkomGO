// lib/app-mode.ts — modo de deploy do app (env ARKOM_APP_MODE).
//
// O MESMO codebase sobe em dois serviços Railway:
//   · (sem env)                → app principal (app.arkom.ai): /solutions NÃO existe
//     (rota 404 + item fora da sidebar).
//   · ARKOM_APP_MODE=solutions → dash dedicada de Soluções: só /solutions (+ fluxo
//     de auth/senha) é servido; o middleware redireciona o resto pra /solutions.
//
// Leitura em runtime (process.env) — sem NEXT_PUBLIC: o valor nunca é inlinado
// no bundle client; quem precisa do modo decide no server (página/action/middleware).

export function isSolutionsDash(): boolean {
  return process.env.ARKOM_APP_MODE === "solutions";
}

/** ARKOM_APP_MODE=qa → serviço dedicado de QA (2026-07-25): só /jornadas —
 *  a videoteca das jornadas E2E gravadas do credit-system — é servida, no
 *  mesmo padrão da dash de Soluções. Exige sessão de ADMIN (área interna). */
export function isQaDash(): boolean {
  return process.env.ARKOM_APP_MODE === "qa";
}

/** Allowlist da dash de Soluções — só estes e-mails entram (csv na env;
 *  default: aluno@bilhon.ai). Sem bypass por role: a regra é literal. */
const SOLUTIONS_ALLOW_DEFAULT = "aluno@bilhon.ai";

function solutionsAllowEmails(): Set<string> {
  return new Set(
    (process.env.ARKOM_SOLUTIONS_ALLOW_EMAILS ?? SOLUTIONS_ALLOW_DEFAULT)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Fora da dash dedicada não há restrição extra; nela, só a allowlist entra.
 *  Aplicar nas DUAS portas de login (action + /api/auth/login) e nos guards
 *  de página/API — o middleware não vê e-mail (só presença de cookie). */
export function canAccessSolutionsDash(email: string | null | undefined): boolean {
  if (!isSolutionsDash()) return true;
  return !!email && solutionsAllowEmails().has(email.trim().toLowerCase());
}
