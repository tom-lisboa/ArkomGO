// Builder "Genesis" — página da vertical (área do aluno).
// Server Component: guard + histórico; o chat/wizard roda como Client Component.

import "./genesis.css";
import "../map/map.css"; // a jornada usa a RODA (SolutionWheel) — precisa das classes do /map
import { requireUser } from "@/lib/auth";
import { listSolutions, type BuilderSolution } from "@/lib/builder";
import { ToastProvider } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { BuilderWizard } from "./builder-wizard";

export const dynamic = "force-dynamic";

export default async function BuilderPage() {
  const user = await requireUser();

  let historico: BuilderSolution[] = [];
  let dbPronto = true;
  try {
    historico = await listSolutions(user.id);
  } catch {
    dbPronto = false; // migration 0006 ainda não aplicada
  }

  return (
    <Shell>
    <ToastProvider>
    {/* A jornada inteira (composer → análise → perguntas → resultado) roda SOBRE o
        mapa: o BuilderWizard é um palco fixo com a RODA de fundo. */}
    <div className="genesis-scope">
      {!dbPronto ? (
        <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-border bg-surface p-6 text-sm text-secondary">
          <p className="font-medium text-primary">Genesis ainda não inicializado.</p>
          <p className="mt-1">
            Aplique a migration <code className="text-tertiary">db/migrations/0006-builder-schema.sql</code> no schema
            <code className="text-tertiary"> educacional</code> para criar as tabelas do builder.
          </p>
        </div>
      ) : (
        <BuilderWizard
          historico={historico.map((s) => ({
            id: s.id,
            title: s.title,
            original_idea: s.original_idea,
            status: s.status,
          }))}
        />
      )}
    </div>
    </ToastProvider>
    </Shell>
  );
}
