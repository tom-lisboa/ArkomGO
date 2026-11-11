"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  AuthField,
  AuthInput,
  AuthSubmitButton,
  AuthSuccess,
  authLinkClass,
} from "@/components/auth/auth-form";
import { recoverAction, type RecoverState } from "./actions";

const initialState: RecoverState = {};

export function RecoverForm() {
  const [state, action, pending] = useActionState(recoverAction, initialState);

  if (state.sent) {
    return (
      <AuthSuccess>
        <p className="text-[13px] font-semibold text-st-ivory">
          Se o e-mail existir na nossa base, enviaremos um link de recuperação.
        </p>
        <p className="mt-2 text-[11.5px] text-st-ink-2">Verifique também a caixa de spam.</p>
        <Link href="/login" className={`mt-5 inline-block text-[12px] ${authLinkClass}`}>
          Voltar para o login
        </Link>
      </AuthSuccess>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <AuthField label="E-mail cadastrado" htmlFor="recuperar-email">
        <AuthInput
          id="recuperar-email"
          name="email"
          type="email"
          placeholder="voce@empresa.com"
          autoComplete="email"
          required
        />
      </AuthField>
      <AuthSubmitButton pending={pending}>
        {pending ? "Enviando…" : "Enviar link de recuperação"}
      </AuthSubmitButton>
      <Link href="/login" className={`text-center text-[12px] ${authLinkClass}`}>
        Voltar para o login
      </Link>
    </form>
  );
}
