"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import {
  AuthError,
  AuthField,
  AuthInput,
  AuthSubmitButton,
  authLinkClass,
} from "@/components/auth/auth-form";
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE_HINT } from "@/lib/password-policy";
import { definePasswordAction, type DefinePasswordState } from "./actions";

const initialState: DefinePasswordState = {};

const RECOVERY_PENDING = "pending";

function subscribeToRecoveryHash(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function getRecoveryHashSnapshot() {
  return `ready:${window.location.hash}`;
}

function getRecoveryHashServerSnapshot() {
  return RECOVERY_PENDING;
}

type RecoveryCredentials = {
  rawHash: string;
  accessToken: string;
  linkType: string;
};

function parseRecoveryHash(rawHash: string): RecoveryCredentials {
  const params = new URLSearchParams(rawHash.replace(/^#/, ""));
  return {
    rawHash,
    accessToken: params.get("access_token") ?? "",
    linkType: params.get("type") ?? "",
  };
}

export function DefinePasswordForm({
  tokenHash = "",
  tokenType = "",
}: {
  tokenHash?: string;
  tokenType?: string;
}) {
  const [state, action, pending] = useActionState(definePasswordAction, initialState);

  // FLUXO NOVO (à prova de scanner): `token_hash` vem na query (server-provided).
  // O OTP só é consumido no submit (POST /verify na action), então prefetch do
  // navegador / preview de WhatsApp-e-mail / scanner não queimam mais o link.
  const hasTokenHash = Boolean(tokenHash) && (tokenType === "" || tokenType === "recovery");

  // FLUXO ANTIGO (compat): `access_token` no hash (#), lido no cliente. Só usado
  // quando não há token_hash na query (links já enviados antes deste fix).
  const [capturedRecovery, setCapturedRecovery] = useState<RecoveryCredentials | null>(null);
  const recoverySnapshot = useSyncExternalStore(
    subscribeToRecoveryHash,
    getRecoveryHashSnapshot,
    getRecoveryHashServerSnapshot,
  );
  const hashReady = recoverySnapshot !== RECOVERY_PENDING;
  const hash = hashReady ? recoverySnapshot.slice("ready:".length) : "";
  const liveRecovery = parseRecoveryHash(hash);
  const recovery = capturedRecovery ?? liveRecovery;

  useEffect(() => {
    // Limpa a URL após capturar as credenciais (query token_hash ou hash) — não
    // deixa token no histórico/Referer. O valor já está no campo hidden do form.
    if (hasTokenHash) {
      const frame = requestAnimationFrame(() => {
        history.replaceState(null, "", window.location.pathname);
      });
      return () => cancelAnimationFrame(frame);
    }
    if (!hashReady || !hash || capturedRecovery?.rawHash === hash) return;
    const frame = requestAnimationFrame(() => {
      setCapturedRecovery(parseRecoveryHash(hash));
      history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [capturedRecovery?.rawHash, hash, hashReady, hasTokenHash]);

  // token_hash está pronto na hora (prop do servidor); access_token depende de o
  // cliente montar e ler o hash.
  const ready = hasTokenHash || hashReady;
  const accessToken = hasTokenHash ? "" : recovery.accessToken;
  const linkType = hasTokenHash ? tokenType : recovery.linkType;
  const hasCredential = hasTokenHash || Boolean(accessToken);
  const invalid = !hasCredential || (linkType !== "" && linkType !== "recovery");

  if (!ready) return <div className="h-40" aria-busy="true" />;
  if (invalid) {
    return (
      <div className="flex flex-col gap-4">
        <AuthError>
          <span>
            <strong className="block font-semibold text-red-200">Link inválido ou expirado.</strong>
            Solicite um novo e-mail para definir sua senha.
          </span>
        </AuthError>
        <Link href="/recuperar-senha" className={`text-center text-[12px] ${authLinkClass}`}>
          Enviar novo e-mail
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? (
        <AuthError>{state.error}</AuthError>
      ) : null}
      {hasTokenHash ? (
        <input type="hidden" name="token_hash" value={tokenHash} />
      ) : (
        <input type="hidden" name="access_token" value={accessToken} />
      )}
      <AuthField label="Nova senha" htmlFor="definir-senha">
        <AuthInput
          id="definir-senha"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
      </AuthField>
      <AuthField label="Confirmar nova senha" htmlFor="confirmar-senha">
        <AuthInput
          id="confirmar-senha"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
      </AuthField>
      <p className="text-[11.5px] leading-relaxed text-st-ink-3">{PASSWORD_RULE_HINT}</p>
      <AuthSubmitButton pending={pending}>
        {pending ? "Salvando…" : "Definir senha"}
      </AuthSubmitButton>
    </form>
  );
}
