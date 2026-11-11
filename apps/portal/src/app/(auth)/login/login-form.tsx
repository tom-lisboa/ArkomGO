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
import { loginAction, type LoginFormState } from "./actions";

const initialState: LoginFormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? (
        <AuthError>{state.error}</AuthError>
      ) : null}
      <AuthField label="E-mail" htmlFor="login-email">
        <AuthInput
          id="login-email"
          name="email"
          type="email"
          placeholder="voce@empresa.com"
          autoComplete="email"
          required
        />
      </AuthField>
      <AuthField
        label="Senha"
        htmlFor="login-password"
        aside={
          <Link href="/recuperar-senha" className={`text-[11.5px] ${authLinkClass}`}>
            Esqueci minha senha
          </Link>
        }
      >
        <AuthInput
          id="login-password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </AuthField>
      <AuthSubmitButton pending={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </AuthSubmitButton>
      <p className="border-t border-st-line pt-4 text-center text-[12px] text-st-ink-3">
        Recebeu um convite?{" "}
        <Link href="/cadastro" className={authLinkClass}>
          Criar minha conta
        </Link>
      </p>
    </form>
  );
}
