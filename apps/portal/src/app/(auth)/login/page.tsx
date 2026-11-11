import type { Metadata } from "next";
import { LogIn } from "lucide-react";
import { AuthPanel } from "@/components/auth/auth-panel";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · Arkom" };

export default function LoginPage() {
  return (
    <AuthPanel
      eyebrow="Área de membros"
      title="Entrar"
      description="Use a identidade vinculada ao seu ambiente Arkom."
      icon={LogIn}
    >
      <LoginForm />
    </AuthPanel>
  );
}
