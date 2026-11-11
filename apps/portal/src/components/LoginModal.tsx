"use client";

import { useState } from "react";
import Link from "next/link";

import { usePlan } from "@/lib/plan";
import { GlassModal } from "@/components/GlassModal";

/** Arkom dual-session email/password sign-in on the canonical GlassModal. */
export function LoginModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { login, showToast } = usePlan();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await login(email.trim(), password);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    showToast("Login realizado. Bem-vindo de volta.");
    onSuccess?.();
    onClose();
  };

  return (
    <GlassModal onClose={onClose} eyebrow="Área de membros" title="Entrar" maxWidth={400}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-st-ink-2">E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
            placeholder="voce@empresa.com"
            className="rounded-[10px] border border-st-line-2 bg-white/[0.03] px-3.5 py-2.5 text-[14px] text-st-ivory outline-none placeholder:text-st-ink-3 focus:border-white/25"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-st-ink-2">Senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="rounded-[10px] border border-st-line-2 bg-white/[0.03] px-3.5 py-2.5 text-[14px] text-st-ivory outline-none placeholder:text-st-ink-3 focus:border-white/25"
          />
        </label>

        {error ? <p className="text-[12.5px] text-[#ef6b6b]">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 rounded-[10px] bg-[#ECECEE] py-2.5 text-[13px] font-bold text-[#0A0A0C] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
        <div className="flex items-center justify-between gap-3 text-[12px] text-st-ink-2">
          <Link href="/recuperar-senha" onClick={onClose} className="hover:text-st-ivory">
            Esqueci minha senha
          </Link>
          <Link href="/cadastro" onClick={onClose} className="hover:text-st-ivory">
            Tenho um convite
          </Link>
        </div>
      </form>
    </GlassModal>
  );
}
