// Política de senha do Arkom — fonte ÚNICA das regras de senha NOVA.
//
// Até 2026-07-29 cada tela repetia `password.length < 6` e "      " (seis
// espaços) passava: o Auth central gravava uma senha praticamente vazia
// (ClickUp 86ajraqhj). Comprimento sozinho não mede nada. As três portas que
// definem senha — primeiro acesso (/settings), link de e-mail (/definir-senha)
// e cadastro por convite (/cadastro) — chamam `validateNewPassword` ANTES de
// qualquer escrita no GoTrue. A UI espelha as regras (minLength + a dica), mas
// o corte é no servidor: burlar o HTML não vale nada.
//
// Módulo puro de propósito (sem Buffer, sem env): os formulários importam
// `PASSWORD_MIN_LENGTH` e `PASSWORD_RULE_HINT` do mesmo lugar que o servidor
// valida, então a dica na tela nunca desencontra da regra real.

export const PASSWORD_MIN_LENGTH = 8;

/** O bcrypt do GoTrue só considera os primeiros 72 bytes: acima disso o resto
 *  da senha é ignorado em silêncio. Melhor recusar do que prometer o que não
 *  vale. */
export const PASSWORD_MAX_BYTES = 72;

/** Frase única mostrada nas três telas — mesma verdade que o servidor cobra. */
export const PASSWORD_RULE_HINT =
  `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres, misturando letras e números. ` +
  "Espaços não valem como senha.";

export type PasswordValidation = { ok: true } | { ok: false; error: string };

const TEM_LETRA = /\p{L}/u;
const TEM_NUMERO = /\p{Nd}/u;

export function validateNewPassword(password: string): PasswordValidation {
  if (!password) return { ok: false, error: "Informe a nova senha." };

  // `trim()` do JS remove espaço, tab, quebra de linha e também o espaço
  // inquebrável ( ) que vem de copiar-e-colar — é o que barra o report.
  if (password.trim().length === 0) {
    return { ok: false, error: "A senha não pode ser só espaços. Use letras e números." };
  }
  // Não aparamos a senha em silêncio: o login não apara, e o aluno ficaria
  // preso fora da conta que acabou de criar. Recusamos e explicamos.
  if (password !== password.trim()) {
    return { ok: false, error: "A senha não pode começar nem terminar com espaço." };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    };
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return {
      ok: false,
      error: `A senha pode ter no máximo ${PASSWORD_MAX_BYTES} caracteres.`,
    };
  }
  if (!TEM_LETRA.test(password) || !TEM_NUMERO.test(password)) {
    return { ok: false, error: "A senha precisa misturar letras e números." };
  }
  return { ok: true };
}
