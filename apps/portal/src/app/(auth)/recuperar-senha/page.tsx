import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { AuthPanel } from "@/components/auth/auth-panel";
import { RecoverForm } from "./recover-form";

export const metadata: Metadata = { title: "Recuperar senha · Arkom" };

export default function RecoverPage() {
  return (
    <AuthPanel
      eyebrow="Segurança da conta"
      title="Recuperar acesso"
      description="Enviaremos as instruções somente se houver um perfil Arkom ativo para o e-mail."
      icon={KeyRound}
    >
      <RecoverForm />
    </AuthPanel>
  );
}
