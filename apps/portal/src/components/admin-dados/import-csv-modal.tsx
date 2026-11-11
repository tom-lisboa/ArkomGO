"use client";

// ImportCsvModal — importação de alunos via CSV `nome,email` (Story 1.7).
// Cria alunos ativos com senha temporária gerada e exibe relatório na tela.

import { useRef, useState } from "react";
import { CheckCircle2, FileUp, TriangleAlert } from "lucide-react";
import { Button, Modal, useToast } from "@/components/ui";
import { importCsvAction, type ImportCsvResult } from "@/app/admin/students/actions";

type Report = Extract<ImportCsvResult, { ok: true }>;

export function ImportCsvModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  function reset() {
    setFileName(null);
    setErro(null);
    setReport(null);
    setImportando(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErro("Selecione um arquivo CSV para importar.");
      return;
    }
    setImportando(true);
    setErro(null);
    try {
      const text = await file.text();
      const result = await importCsvAction(text);
      if (!result.ok) {
        setErro(result.error);
        return;
      }
      setReport(result);
      toast({
        title: `Importação concluída: ${result.created} aluno${result.created === 1 ? "" : "s"} criado${result.created === 1 ? "" : "s"}.`,
        description:
          `${result.emailsSent} e-mail${result.emailsSent === 1 ? "" : "s"} enviado${result.emailsSent === 1 ? "" : "s"} pelo Supabase. ${
            result.ignored > 0
              ? `${result.ignored} linha${result.ignored === 1 ? "" : "s"} ignorada${result.ignored === 1 ? "" : "s"}.`
              : "Nenhuma linha ignorada."
          } ${result.provisioned} reservas provisionadas; ${result.provisioningFailed} falharam.`,
        variant: result.provisioningFailed > 0 ? "info" : "success",
      });
    } finally {
      setImportando(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Importar membros via CSV">
      {report ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-card bg-success-subtle p-4 text-center">
              <p className="text-4xl font-bold leading-none tracking-display text-green-600">{report.created}</p>
              <p className="text-sm font-medium text-green-700">
                aluno{report.created === 1 ? "" : "s"} criado
                {report.created === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-card bg-warning-subtle p-4 text-center">
              <p className="text-4xl font-bold leading-none tracking-display text-amber-600">{report.ignored}</p>
              <p className="text-sm font-medium text-amber-700">
                linha{report.ignored === 1 ? "" : "s"} ignorada
                {report.ignored === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {report.created > 0 && (
            <div className="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-secondary">
              <p className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                Membros criados como ativos e com troca de senha obrigatória no
                primeiro acesso. Contas centrais novas receberam senha temporária;
                identidades existentes foram preservadas. O e-mail de definição de senha
                foi enviado pelo Supabase para {report.emailsSent} aluno
                {report.emailsSent === 1 ? "" : "s"}.
              </p>
              {report.credentials.length > 0 && (
                <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-surface-sunken font-mono text-2xs tracking-ultra text-tertiary">
                      <tr>
                        <th className="px-3 py-2 font-semibold">E-mail</th>
                        <th className="px-3 py-2 font-semibold">Senha temporária</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.credentials.map((credential) => (
                        <tr key={credential.email} className="border-t border-neutral-100">
                          <td className="px-3 py-2 text-neutral-700">{credential.email}</td>
                          <td className="px-3 py-2 font-mono text-neutral-700">
                            {credential.password}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              report.provisioningFailed > 0
                ? "border-amber-400 bg-warning-subtle text-amber-900"
                : "border-green-300 bg-success-subtle text-green-800"
            }`}
          >
            <p className="font-semibold">
              Provisionamento: {report.provisioned} reserva
              {report.provisioned === 1 ? "" : "s"} criada
              {report.provisioned === 1 ? "" : "s"}; {report.provisioningFailed} falha
              {report.provisioningFailed === 1 ? "" : "s"}.
            </p>
            {report.provisioningFailures.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {report.provisioningFailures.map((failure) => (
                  <li key={failure.email}>
                    <strong>{failure.email}</strong>: {failure.failed}{" "}
                    {failure.failed === 1 ? "solução" : "soluções"} com falha
                    {failure.failures?.length
                      ? ` (${failure.failures
                          .map(
                            (item) =>
                              `${item.solutionName ?? item.solution}: ${item.error}`,
                          )
                          .join("; ")})`
                      : "."}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {report.details.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-surface-sunken font-mono text-2xs tracking-ultra text-tertiary">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Linha</th>
                    <th className="px-3 py-2 font-semibold">Conteúdo</th>
                    <th className="px-3 py-2 font-semibold">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {report.details.map((d) => (
                    <tr key={`${d.line}-${d.reason}`} className="border-t border-neutral-100">
                      <td className="px-3 py-2 text-neutral-500">{d.line}</td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-neutral-700">
                        {d.content}
                      </td>
                      <td className="px-3 py-2 text-amber-700">{d.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {report.emailFailures.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-amber-400 bg-warning-subtle">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-warning-subtle font-mono text-2xs tracking-ultra text-amber-800">
                  <tr>
                    <th className="px-3 py-2 font-semibold">E-mail</th>
                    <th className="px-3 py-2 font-semibold">Falha no envio</th>
                  </tr>
                </thead>
                <tbody>
                  {report.emailFailures.map((failure) => (
                    <tr key={failure.email} className="border-t border-amber-100">
                      <td className="px-3 py-2 text-amber-900">{failure.email}</td>
                      <td className="px-3 py-2 text-amber-800">{failure.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={reset}>
              Importar outro arquivo
            </Button>
            <Button onClick={handleClose}>Concluir</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {erro && (
            <div className="flex items-start gap-2.5 rounded-md border border-red-400 bg-danger-subtle px-4 py-3 text-sm font-medium text-red-700">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {erro}
            </div>
          )}

          <label
            htmlFor="csv-file"
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong bg-neutral-50/60 px-5 py-[40px] text-center transition-colors hover:border-accent hover:bg-accent-subtle"
          >
            <FileUp className="h-6 w-6 text-accent" />
            <span className="text-sm font-semibold text-neutral-800">
              {fileName ?? "Clique para selecionar o arquivo CSV"}
            </span>
            <span className="text-xs text-neutral-500">
              Uma linha por aluno, no formato <code className="font-mono">nome,email</code>
            </span>
            <input
              ref={fileRef}
              id="csv-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(e) => {
                setFileName(e.target.files?.[0]?.name ?? null);
                setErro(null);
              }}
            />
          </label>

          <div className="rounded-xl bg-surface-sunken px-4 py-3 text-xs text-secondary">
            <p className="font-semibold text-neutral-600">Como funciona:</p>
            <ul className="mt-1 list-disc pl-4">
              <li>Cada aluno é criado ativo com senha temporária única.</li>
              <li>Ao entrar pela primeira vez, o aluno precisa definir uma nova senha.</li>
              <li>E-mails duplicados e linhas inválidas são ignorados e listados no relatório.</li>
            </ul>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={handleClose} disabled={importando}>
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={importando || !fileName}>
              {importando ? "Importando…" : "Importar membros"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
