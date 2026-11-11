"use client";

import { useActionState, useRef, useState } from "react";

import {
  changePasswordAction,
  type PasswordActionState,
} from "@/app/(conta)/settings/actions";
import { usePlan } from "@/lib/plan";
import { useT } from "@/lib/i18n";
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE_HINT } from "@/lib/password-policy";

/**
 * Member settings (Pkg15 · Feature B). The five cards measured on the original
 * (R2 settings-markup.html). Kills the sidebar "Member · Settings" 404. Auth
 * Session data and password updates are backed by the Arkom auth layer. Billing
 * remains informational until a billing provider is connected.
 */
const initialPasswordState: PasswordActionState = {};

export function SettingsContent({ firstAccess = false }: { firstAccess?: boolean }) {
  const t = useT();
  const s = t.settings;
  const { email, logout, showToast } = usePlan();
  const [passwordState, passwordAction, passwordPending] = useActionState(
    changePasswordAction,
    initialPasswordState,
  );

  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPhoto(URL.createObjectURL(file));
  };

  const cardClass =
    "rounded-[14px] border border-st-line-2 bg-st-card p-[20px_22px]";
  const headClass =
    "mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-st-ink-2";
  const btnGlass =
    "inline-flex h-9 items-center justify-center rounded-[10px] border border-st-line-2 bg-st-card px-3.5 text-[13px] font-medium text-st-ivory transition-colors hover:bg-st-card-2";
  const btnPrimary =
    "inline-flex h-9 items-center justify-center rounded-[10px] bg-st-ivory px-3.5 text-[13px] font-medium text-st-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="w-full">
      <h1 className="text-[30px] font-extrabold leading-none tracking-tight text-st-ivory">
        {s.title}
      </h1>

      <div className="mt-7 flex w-full max-w-[720px] flex-col gap-4">
        {firstAccess ? (
          <section className="rounded-[14px] border border-[#c58b5f]/45 bg-[#c58b5f]/10 p-[18px_20px]">
            <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-[#e0b58e]">
              Primeiro acesso
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-st-ivory">
              Troque a senha temporária para liberar o restante do Arkom.
            </p>
          </section>
        ) : null}
        {/* Profile photo */}
        <section className={cardClass}>
          <div className={headClass}>{s.photo.head}</div>
          <div className="flex items-center gap-4">
            <span className="flex size-[54px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-st-card-2 text-[15px] font-semibold text-st-ivory">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="size-full object-cover" />
              ) : (
                (email ?? "AR").slice(0, 2).toUpperCase()
              )}
            </span>
            <div className="flex flex-col items-start gap-1.5">
              <label className={`${btnGlass} cursor-pointer`}>
                {s.photo.upload}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={onPhoto}
                  hidden
                />
              </label>
              <span className="text-[12px] text-st-ink-3">{s.photo.hint}</span>
            </div>
          </div>
        </section>

        {/* Account */}
        <section className={cardClass}>
          <div className={headClass}>{s.account.head}</div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 text-[14px]">
              <span className="text-st-ink-2">{s.account.emailLabel}</span>
              <span className="text-st-ivory">{email ?? "—"}</span>
            </div>
          </div>
        </section>

        {/* Password */}
        <section className={cardClass}>
          <div className={headClass}>{s.password.head}</div>
          <form action={passwordAction}>
            <label className="text-[14px] text-st-ivory">{s.password.label}</label>
            <p className="mt-1.5 max-w-[520px] text-[13px] leading-relaxed text-st-ink-2">
              {firstAccess
                ? "Confirme a senha temporária e escolha uma nova senha."
                : "Confirme sua senha atual e escolha uma nova senha."}{" "}
              {PASSWORD_RULE_HINT}
            </p>
            {passwordState.error ? (
              <p role="alert" className="mt-3 rounded-[10px] border border-red-400/35 bg-red-500/10 px-3 py-2.5 text-[12.5px] text-red-200">
                {passwordState.error}
              </p>
            ) : null}
            <div className="mt-3.5 grid gap-2.5 sm:grid-cols-3">
              <input
                name="current_password"
                type="password"
                autoComplete="current-password"
                placeholder="Senha atual"
                required
                className="h-9 rounded-[10px] border border-st-line-2 bg-st-card px-3 text-[13px] text-st-ivory outline-none placeholder:text-st-ink-3 focus:border-st-ink-3"
              />
              <input
                name="new_password"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                placeholder="Nova senha"
                required
                className="h-9 rounded-[10px] border border-st-line-2 bg-st-card px-3 text-[13px] text-st-ivory outline-none placeholder:text-st-ink-3 focus:border-st-ink-3"
              />
              <input
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                placeholder="Confirmar senha"
                required
                className="h-9 rounded-[10px] border border-st-line-2 bg-st-card px-3 text-[13px] text-st-ivory outline-none placeholder:text-st-ink-3 focus:border-st-ink-3"
              />
            </div>
            <div className="mt-3">
              <button type="submit" className={btnPrimary} disabled={passwordPending}>
                {passwordPending ? "Salvando…" : s.password.save}
              </button>
            </div>
          </form>
        </section>

        {/* Billing */}
        <section className={cardClass}>
          <div className={headClass}>{s.billing.head}</div>
          <p className="mb-3.5 max-w-[520px] text-[13px] leading-relaxed text-st-ink-2">
            {s.billing.hint}
          </p>
          <button type="button" className={btnPrimary} onClick={() => showToast(s.billing.toast)}>
            {s.billing.button}
          </button>
        </section>

        {/* Log out */}
        <section className={cardClass}>
          <div className={headClass}>{s.logout.head}</div>
          <p className="mb-3.5 max-w-[520px] text-[13px] leading-relaxed text-st-ink-2">
            {s.logout.hint}
          </p>
          <button
            type="button"
            className={btnGlass}
            onClick={async () => {
              await logout();
              showToast(s.logout.toast);
              window.location.assign("/login");
            }}
          >
            {s.logout.button}
          </button>
        </section>

        <p className="mt-2 text-[12.5px] leading-relaxed text-st-ink-3">{s.note}</p>
      </div>
    </div>
  );
}
