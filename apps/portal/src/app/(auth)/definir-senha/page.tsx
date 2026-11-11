import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { AuthPanel } from "@/components/auth/auth-panel";
import { DefinePasswordForm } from "./define-password-form";

export const metadata: Metadata = { title: "Definir senha · Arkom" };

export default async function DefinePasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Fluxo à prova de scanner: o link traz `token_hash` na QUERY (visível no
  // servidor). O OTP só é consumido no submit (POST /verify na action), então um
  // GET de prefetch/preview não queima o link. `access_token` (fluxo antigo, no
  // hash) é lido no cliente pelo próprio form.
  const sp = await searchParams;
  const tokenHash = typeof sp.token_hash === "string" ? sp.token_hash : "";
  const tokenType = typeof sp.type === "string" ? sp.type : "";

  return (
    <AuthPanel
      eyebrow="Segurança da conta"
      title="Definir senha"
      description="Escolha uma nova senha para sua identidade Arkom compartilhada com as soluções."
      icon={ShieldCheck}
    >
      <DefinePasswordForm tokenHash={tokenHash} tokenType={tokenType} />
    </AuthPanel>
  );
}
