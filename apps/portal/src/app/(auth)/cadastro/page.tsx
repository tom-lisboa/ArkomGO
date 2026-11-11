import type { Metadata } from "next";
import { TicketCheck } from "lucide-react";
import { AuthPanel } from "@/components/auth/auth-panel";
import { CadastroForm } from "./cadastro-form";

export const metadata: Metadata = { title: "Criar conta · Arkom" };

export default function CadastroPage() {
  return (
    <AuthPanel
      eyebrow="Entrada controlada"
      title="Ativar acesso"
      description="Use o convite emitido pelo administrador do seu ambiente Arkom."
      icon={TicketCheck}
    >
      <CadastroForm />
    </AuthPanel>
  );
}
