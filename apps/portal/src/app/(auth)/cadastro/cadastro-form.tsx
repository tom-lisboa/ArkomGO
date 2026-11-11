"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  AuthError,
  AuthField,
  AuthInput,
  AuthSubmitButton,
  authLinkClass,
} from "@/components/auth/auth-form";
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE_HINT } from "@/lib/password-policy";
import { registerAction, type CadastroFormState } from "./actions";

const initialState: CadastroFormState = {};

export function CadastroForm() {
  const [state, action, pending] = useActionState(registerAction, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? (
        <AuthError>{state.error}</AuthError>
      ) : null}
      <AuthField label="Nome completo" htmlFor="cadastro-nome">
        <AuthInput id="cadastro-nome" name="full_name" autoComplete="name" required />
      </AuthField>
      <AuthField label="E-mail" htmlFor="cadastro-email">
        <AuthInput id="cadastro-email" name="email" type="email" autoComplete="email" required />
      </AuthField>
      <AuthField label="Senha" htmlFor="cadastro-senha">
        <AuthInput
          id="cadastro-senha"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
        <p className="mt-2 text-[11.5px] leading-relaxed text-st-ink-3">{PASSWORD_RULE_HINT}</p>
      </AuthField>
      <AuthField label="Código de convite" htmlFor="cadastro-convite">
        <AuthInput
          id="cadastro-convite"
          name="invite_code"
          autoComplete="off"
          maxLength={32}
          required
          className="font-mono uppercase tracking-[0.12em]"
        />
      </AuthField>
      <label className="flex items-start gap-2.5 text-[11.5px] leading-relaxed text-st-ink-2">
        <input name="accept_terms" type="checkbox" required className="mt-0.5 accent-[var(--arkom-gold)]" />
        <span>Li e aceito os Termos de Uso da plataforma.</span>
      </label>
      <label className="flex items-start gap-2.5 text-[11.5px] leading-relaxed text-st-ink-2">
        <input name="accept_privacy" type="checkbox" required className="mt-0.5 accent-[var(--arkom-gold)]" />
        <span>Concordo com a Política de Privacidade e o tratamento dos meus dados.</span>
      </label>
      <AuthSubmitButton pending={pending}>
        {pending ? "Criando conta…" : "Criar minha conta"}
      </AuthSubmitButton>
      <p className="border-t border-st-line pt-4 text-center text-[12px] text-st-ink-3">
        Já tem acesso?{" "}
        <Link href="/login" className={authLinkClass}>
          Entrar
        </Link>
      </p>
    </form>
  );
}
