"use client";

// Admin > Planos > Vencimentos — a tela da renovação (Tarefa 4).
// Co-locada com a rota (como admin-nav.tsx e rails-manager.tsx): é o chrome de
// uma tela só, não um componente reaproveitável.
//
// A leitura toda vem pronta do server (src/lib/access-expiration.ts) — aqui só
// existe filtro/busca em memória (58 perfis; paginar seria cerimônia) e o botão
// que dispara o job.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlarmClock,
  CalendarClock,
  CalendarX2,
  Download,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { processarExpiracoes } from "@/app/admin/plans/expirations/actions";

/** Espelho client-side de `ExpirationRow` (src/lib/access-expiration.ts). */
export type VencimentoRow = {
  profileId: number;
  fullName: string;
  email: string;
  profileStatus: "active" | "blocked";
  planName: string | null;
  source: "plan" | "manual";
  expiresAtLabel: string;
  daysRemaining: number;
  state: "ativo" | "expirando" | "expirado";
  reason: string | null;
  grantedByLabel: string | null;
  grantedAtLabel: string | null;
};

/** Espelho client-side de `ExpirationReport`. */
export type RelatorioVencimentos = {
  rows: VencimentoRow[];
  resumo: {
    comPrazo: number;
    ativos: number;
    expirando: number;
    expirados: number;
    semPrazo: number;
    totalPerfis: number;
    janelas: { dias: number; total: number }[];
  };
  leadDays: number;
  windows: number[];
  enforced: boolean;
  migrationMissing: boolean;
  ultimaExecucao: {
    runKey: string;
    source: string;
    leadDays: number;
    comPrazo: number;
    ativos: number;
    expirando: number;
    expirados: number;
    ranAtLabel: string;
    ranBy: string | null;
  } | null;
};

type Filtro = "todos" | "expirados" | `janela:${number}`;

const ESTADO: Record<
  VencimentoRow["state"],
  { label: string; tone: "success" | "warning" | "danger" }
> = {
  ativo: { label: "Ativo", tone: "success" },
  expirando: { label: "Expirando", tone: "warning" },
  expirado: { label: "Expirado", tone: "danger" },
};

/** "vence hoje" · "faltam 12 dias" · "venceu há 3 dias" */
function rotuloDias(dias: number): string {
  if (dias === 0) return "vence hoje";
  if (dias > 0) return `faltam ${dias} dia${dias === 1 ? "" : "s"}`;
  const passados = Math.abs(dias);
  return `venceu há ${passados} dia${passados === 1 ? "" : "s"}`;
}

export function ExpirationsManager({
  relatorio,
}: {
  relatorio: RelatorioVencimentos;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const { resumo, rows } = relatorio;

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((row) => {
      if (filtro === "expirados" && row.state !== "expirado") return false;
      if (filtro.startsWith("janela:")) {
        const dias = Number(filtro.slice("janela:".length));
        if (row.state === "expirado" || row.daysRemaining > dias) return false;
      }
      if (!q) return true;
      return (
        row.fullName.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        (row.planName ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, busca, filtro]);

  function handleProcessar() {
    startTransition(async () => {
      const res = await processarExpiracoes();
      if (res.ok) {
        toast({
          title: res.changed ? "Expirações processadas!" : "Nada mudou.",
          description: res.message,
        });
      } else {
        toast({ title: "Erro ao processar", description: res.error, variant: "error" });
      }
    });
  }

  if (relatorio.migrationMissing) {
    return (
      <EmptyState
        icon={<CalendarClock className="h-6 w-6" />}
        title="Banco ainda não preparado"
        description="As tabelas de planos e prazos (migration db/migrations/0011-entitlements-core.sql) ainda não foram aplicadas neste ambiente."
      />
    );
  }

  const temAlerta = resumo.expirados > 0 || resumo.expirando > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Alerta antecipado — o destaque que a Carol vê antes da lista. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border px-5 py-4",
          temAlerta
            ? "border-amber-200 bg-warning-subtle"
            : "border-border bg-surface-sunken",
        )}
      >
        <Numero
          icon={<CalendarX2 className="h-4 w-4" />}
          valor={resumo.expirados}
          rotulo="vencidos"
          destaque={resumo.expirados > 0}
        />
        <Numero
          icon={<AlarmClock className="h-4 w-4" />}
          valor={resumo.expirando}
          rotulo={`vencendo em até ${relatorio.leadDays} dia${relatorio.leadDays === 1 ? "" : "s"}`}
          destaque={resumo.expirando > 0}
        />
        <Numero
          icon={<ShieldCheck className="h-4 w-4" />}
          valor={resumo.comPrazo}
          rotulo="com prazo definido"
        />
        <span className="text-sm text-secondary">
          {resumo.semPrazo} de {resumo.totalPerfis} perfis não têm prazo nenhum.
        </span>
        {!relatorio.enforced ? (
          <span className="rounded-chip bg-surface px-3 py-1 font-mono text-2xs uppercase tracking-widest text-tertiary">
            prazo ainda não está valendo
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            ativo={filtro === "todos"}
            onClick={() => setFiltro("todos")}
            label="Todos"
            total={resumo.comPrazo}
          />
          <Chip
            ativo={filtro === "expirados"}
            onClick={() => setFiltro("expirados")}
            label="Vencidos"
            total={resumo.expirados}
          />
          {relatorio.windows.map((dias) => {
            const janela = resumo.janelas.find((j) => j.dias === dias);
            return (
              <Chip
                key={dias}
                ativo={filtro === `janela:${dias}`}
                onClick={() => setFiltro(`janela:${dias}`)}
                label={`${dias} dias`}
                total={janela?.total ?? 0}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary" />
            <Input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar por nome, e-mail ou plano…"
              className="pl-[36px]"
              aria-label="Buscar nos vencimentos"
            />
          </div>
          <a
            href="/api/admin/export?type=vencimentos"
            download
            className="inline-flex items-center justify-center gap-2 rounded-button border border-border bg-surface px-4 py-2 text-sm font-semibold text-secondary transition-colors hover:text-primary"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </a>
          <Button variant="secondary" onClick={handleProcessar} disabled={pending}>
            <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
            {pending ? "Processando…" : "Processar expirações"}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-6 w-6" />}
          title="Nenhum aluno tem prazo de acesso definido"
          description={`Os ${resumo.totalPerfis} perfis da plataforma estão no plano "Legado", que é permissivo: catálogo inteiro, mentorias ilimitadas e SEM data de expiração. Por isso esta lista está vazia — e não porque falte dado. Para um aluno passar a aparecer aqui: atribua um plano com duração em meses (Planos › novo plano → Duração) e o vencimento é calculado na atribuição; ou defina a data direto na ficha do aluno (Membros › aluno › Plano e créditos › Definir prazo), sempre com motivo.`}
        />
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="Nenhum resultado com este filtro"
          description="Tente outra janela, outro nome ou limpe a busca."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-navy-50 font-mono text-3xs uppercase tracking-widest text-tertiary">
                <th className="px-4 py-3 font-medium">Aluno</th>
                <th className="px-4 py-3 font-medium">Plano</th>
                <th className="px-4 py-3 font-medium">Expira em</th>
                <th className="px-4 py-3 font-medium">Dias restantes</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Origem do prazo</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((row) => {
                const estado = ESTADO[row.state];
                return (
                  <tr
                    key={row.profileId}
                    className="border-b border-border-subtle last:border-b-0 even:bg-navy-50 hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/students/${row.profileId}`}
                        className="font-medium text-primary hover:text-accent"
                      >
                        {row.fullName}
                      </Link>
                      <p className="text-xs text-secondary">{row.email}</p>
                      {row.profileStatus === "blocked" ? (
                        <Badge status="danger" className="mt-1">
                          Conta bloqueada
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-secondary">{row.planName ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-secondary">
                      {row.expiresAtLabel}
                    </td>
                    <td className="px-4 py-3 text-secondary">
                      {rotuloDias(row.daysRemaining)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={estado.tone}>{estado.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-secondary">
                        {row.source === "manual" ? "Definido à mão" : "Do plano"}
                      </p>
                      {row.source === "manual" && row.reason ? (
                        <p className="mt-0.5 text-xs text-tertiary">
                          “{row.reason}”
                          {row.grantedByLabel ? ` · ${row.grantedByLabel}` : ""}
                          {row.grantedAtLabel ? ` · ${row.grantedAtLabel}` : ""}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td
                  colSpan={6}
                  className="border-t border-border-subtle bg-surface-sunken px-4 py-3 font-mono text-2xs tracking-wider text-secondary"
                >
                  {filtrados.length} de {rows.length} aluno
                  {rows.length === 1 ? "" : "s"} com prazo.
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-tertiary">
        {relatorio.ultimaExecucao
          ? `Última verificação: ${relatorio.ultimaExecucao.ranAtLabel} (${relatorio.ultimaExecucao.runKey})${
              relatorio.ultimaExecucao.ranBy ? ` · ${relatorio.ultimaExecucao.ranBy}` : ""
            } — ${relatorio.ultimaExecucao.expirados} vencido(s), ${relatorio.ultimaExecucao.expirando} vencendo.`
          : "O job de expiração ainda não rodou neste banco. Ele não altera nada dos alunos: só recalcula os estados e registra o resumo do dia."}{" "}
        Rodar duas vezes no mesmo dia, com o mesmo estado, não registra nada de
        novo. Ainda não há e-mail de aviso: o alerta é este destaque e a contagem
        na Visão geral.
      </p>
    </div>
  );
}

function Numero({
  icon,
  valor,
  rotulo,
  destaque,
}: {
  icon: React.ReactNode;
  valor: number;
  rotulo: string;
  destaque?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg",
          destaque ? "bg-amber-100 text-amber-800" : "bg-surface text-tertiary",
        )}
      >
        {icon}
      </span>
      <span>
        <span className="font-mono text-xl font-semibold text-primary">{valor}</span>{" "}
        <span className="text-sm text-secondary">{rotulo}</span>
      </span>
    </span>
  );
}

function Chip({
  ativo,
  onClick,
  label,
  total,
}: {
  ativo: boolean;
  onClick: () => void;
  label: string;
  total: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "inline-flex items-center gap-2 rounded-chip border px-3 py-1.5 text-sm transition-colors",
        ativo
          ? "border-accent bg-accent-subtle text-text-accent"
          : "border-border bg-surface text-secondary hover:text-primary",
      )}
    >
      {label}
      <span className="font-mono text-2xs text-tertiary">{total}</span>
    </button>
  );
}
