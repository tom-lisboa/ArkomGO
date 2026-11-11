"use server";

import { redirect } from "next/navigation";
import { canAccessSolutionsDash, isSolutionsDash } from "@/lib/app-mode";
import { login } from "@/lib/auth";

export type LoginFormState = { error?: string };

export async function loginAction(
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Informe seu e-mail e a sua senha." };

  // dash dedicada: allowlist ANTES de autenticar — fora dela nem valida senha.
  if (!canAccessSolutionsDash(email)) {
    return { error: "Este acesso é restrito." };
  }

  const result = await login(email, password);
  if (!result.ok) return { error: result.error };
  if (result.user.must_change_password === 1) redirect("/settings?primeiro-acesso=1");
  // dash dedicada de Soluções: todo login cai direto na roda.
  if (isSolutionsDash()) redirect("/solutions");
  redirect(result.user.role === "admin" ? "/admin" : "/home");
}

