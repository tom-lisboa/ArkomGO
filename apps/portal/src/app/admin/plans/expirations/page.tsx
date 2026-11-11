// /admin/plans/expirations — RELATÓRIO DE VENCIMENTOS (Tarefa 4).
//
// A ferramenta de renovação: quem vence, quando, em quantos dias, em janelas de
// 30/60/90 dias. Leitura pura em server component (src/lib/access-expiration.ts);
// a única mutação é o botão "Processar expirações" (./actions.ts).
//
// Fica como sub-rota de Planos (com botão no cabeçalho de /admin/plans) em vez
// de virar um 11º item da nav lateral — mesmo precedente de
// /admin/trainings/rails (D8) e /admin/mentorships/mentors (D9): o prazo é a
// dimensão temporal do plano. A contagem também aparece no /admin (Visão
// geral), que é onde a Carol entra todo dia. Convenção rota-em-inglês /
// label-pt-BR (D5).
//
// Ambiente sem a 0011 degrada por 42P01: a tela avisa que o banco não está
// preparado e nada quebra.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { loadExpirationReport } from "@/lib/access-expiration";
import { ExpirationsManager } from "@/app/admin/plans/expirations/expirations-manager";

export const metadata: Metadata = { title: "Vencimentos" };

export const dynamic = "force-dynamic";

export default async function AdminVencimentosPage() {
  await requireAdmin();
  const relatorio = await loadExpirationReport();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/admin/plans"
          className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para os planos
        </Link>
        <h1 className="mt-3 text-2xl font-display font-bold tracking-display text-primary">
          Vencimentos
        </h1>
        <p className="mt-1 text-base text-secondary">
          Quem vence e quando — a lista de renovação. As janelas de 30, 60 e 90
          dias contam a partir de hoje; “Expirando” é quem vence em até{" "}
          {relatorio.leadDays} dia{relatorio.leadDays === 1 ? "" : "s"} (ajustável
          em Configurações, sem novo deploy).
        </p>
      </div>

      <ExpirationsManager relatorio={relatorio} />
    </div>
  );
}
