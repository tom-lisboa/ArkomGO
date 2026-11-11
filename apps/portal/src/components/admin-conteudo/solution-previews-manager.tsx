"use client";

// Admin > Soluções (mapa) — edita preview de aula + link de remix por solução.
// Cada linha salva na tabela reativa app_arkom.solution_previews via server action;
// o mapa (drawer do nó-solução) lê essa tabela.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Save } from "lucide-react";

import { Button, Input, Label, useToast } from "@/components/ui";
import { salvarPreviewSolucao } from "@/app/admin/solutions/actions";

export type AdminSolutionPreview = {
  solution_slug: string;
  name: string;
  preview_url: string;
  remix_url: string;
};

function Row({ sol }: { sol: AdminSolutionPreview }) {
  const router = useRouter();
  const { toast } = useToast();
  const [preview, setPreview] = useState(sol.preview_url);
  const [remix, setRemix] = useState(sol.remix_url);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const dirty = preview !== sol.preview_url || remix !== sol.remix_url;

  function salvar() {
    start(async () => {
      const res = await salvarPreviewSolucao({
        solution_slug: sol.solution_slug,
        preview_url: preview,
        remix_url: remix,
      });
      if (res.ok) {
        setSaved(true);
        toast({ title: "Salvo", description: `${sol.name} atualizada.`, variant: "success" });
        router.refresh();
        setTimeout(() => setSaved(false), 1800);
      } else {
        toast({ title: "Erro", description: res.error, variant: "error" });
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-primary">{sol.name}</div>
          <div className="font-mono text-xs text-tertiary">{sol.solution_slug}</div>
        </div>
        <Button
          size="sm"
          variant={saved ? "accent" : "primary"}
          onClick={salvar}
          disabled={pending || !dirty}
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Salvo" : pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`preview-${sol.solution_slug}`}>Preview da aula (embed)</Label>
          <Input
            id={`preview-${sol.solution_slug}`}
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
            placeholder="https://player-vz-…pandavideo.com.br/embed/?v=…  (vazio = sem vídeo)"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`remix-${sol.solution_slug}`}>Link de remix</Label>
          <Input
            id={`remix-${sol.solution_slug}`}
            value={remix}
            onChange={(e) => setRemix(e.target.value)}
            placeholder="/genesis, URL do repo, ou vazio (usa o padrão)"
          />
        </div>
      </div>
    </div>
  );
}

export function SolutionPreviewsManager({ solucoes }: { solucoes: AdminSolutionPreview[] }) {
  return (
    <div className="flex flex-col gap-3">
      {solucoes.map((sol) => (
        <Row key={sol.solution_slug} sol={sol} />
      ))}
    </div>
  );
}
