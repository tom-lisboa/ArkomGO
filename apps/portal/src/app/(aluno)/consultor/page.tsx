// Gestor IA — página da vertical (área do aluno).
// Server Component: guard + histórico de conversas + chips de área; o chat em si
// roda como Client Component (consultor-chat.tsx), molde do genesis/builder-wizard.

import "./consultor.css";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listThreads } from "@/lib/consultor/store";
import { APP_SECTORS } from "@/components/apps/sectors";
import type { ConsultorThread } from "@/lib/consultor/tipos";
import { ToastProvider } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { ConsultorChat } from "./consultor-chat";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Gestor IA" };

export default async function ConsultorPage(props: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const user = await requireUser();
  const { thread } = await props.searchParams;
  const threadParam = Number(thread);
  const initialThreadId = Number.isInteger(threadParam) && threadParam > 0 ? threadParam : null;

  let threads: ConsultorThread[] = [];
  let dbPronto = true;
  try {
    threads = await listThreads(user.id);
  } catch {
    dbPronto = false; // migration 0017 ainda não aplicada
  }
  // Chips "explorar por área" = os SETORES do mapa (mesma taxonomia das pills
  // do grid /apps) — a taxonomia de categorias publicadas foi aposentada.
  const categorias = APP_SECTORS.map((s) => s.name);

  return (
    <Shell>
      <ToastProvider>
        {!dbPronto ? (
          <div className="mx-auto mt-10 max-w-2xl rounded-[14px] border border-st-line-2 bg-st-card p-6 text-[13.5px] leading-relaxed text-st-ink-2">
            <p className="font-[600] text-st-ivory">Gestor IA ainda não inicializado.</p>
            <p className="mt-1">
              Aplique a migration <code className="text-st-ink-3">db/migrations/0017-consultor-ia.sql</code> no
              schema de runtime para criar as tabelas do Gestor.
            </p>
          </div>
        ) : (
          <ConsultorChat
            firstName={user.full_name.split(" ")[0] || "aluno"}
            initialThreads={threads}
            categorias={categorias}
            initialThreadId={initialThreadId}
          />
        )}
      </ToastProvider>
    </Shell>
  );
}
