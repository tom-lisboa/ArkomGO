"use client";

// Admin > Membros > [aluno] — painel "Plano e créditos".
// Atribui plano (materializando os entitlements) e faz concessão/remoção
// MANUAL de crédito, sempre com motivo. O extrato abaixo é o próprio ledger:
// append-only, então "corrigir" ali é lançar um movimento novo.
//
// ⚠ O saldo NUNCA vem de coluna — é SUM(delta) do ledger, calculado no server
// component que monta este painel.

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  Coins,
  History,
  Infinity as InfinityIcon,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { rotuloCota, rotuloDuracao } from "@/lib/plan-format";
import {
  ajustarCreditoManual,
  atribuirPlanoAoAluno,
  definirPrazoDeAcesso,
  type AjusteCreditoInput,
} from "@/app/admin/plans/actions";

export type PlanoOpcao = {
  id: number;
  name: string;
  slug: string;
  permissive: boolean;
  duration_months: number | null;
  mentorship_credits: number | null;
  credit_period: "month" | "total";
};

export type PlanoAtualDoAluno = {
  planId: number | null;
  planName: string | null;
  planSlug: string | null;
  permissive: boolean;
  unlimitedCredits: boolean;
  mentorshipCredits: number | null;
  creditPeriod: "month" | "total";
  durationMonths: number | null;
  expiresAtLabel: string | null;
  expired: boolean;
};

/** Espelho client-side de `AccessStatus` (src/lib/entitlements.ts) + rótulos. */
export type PrazoDeAcessoView = {
  state: "ativo" | "expirando" | "expirado";
  hasDeadline: boolean;
  /** dd/mm/aaaa. `null` = sem prazo. */
  expiresAtLabel: string | null;
  /** AAAA-MM-DD para o <input type="date">. `null` = sem prazo. */
  expiresAtInput: string | null;
  daysRemaining: number | null;
  source: "plan" | "manual" | null;
  leadDays: number;
  /** A flag `expiration_enforcement` está ligada (o prazo barra de verdade)? */
  enforced: boolean;
};

/** Uma linha do histórico de prazo (linhas temporais do aluno, 0011). */
export type PrazoHistoricoItem = {
  id: number;
  vigente: boolean;
  /** dd/mm/aaaa. `null` = sem prazo. */
  expiresAtLabel: string | null;
  source: "plan" | "manual";
  reason: string | null;
  actorLabel: string | null;
  atLabel: string | null;
};

export type MovimentoDeCredito = {
  id: number;
  delta: number;
  reason: string;
  note: string | null;
  actorLabel: string | null;
  createdAtLabel: string | null;
  /** Mentoria que originou o movimento (débito/estorno), já formatada. */
  eventLabel?: string | null;
  eventId?: number | null;
};

const MOTIVO_LABEL: Record<string, string> = {
  plan_grant: "Horas do plano",
  plan_revoke: "Retirada por troca de plano",
  event_debit: "Débito por mentoria",
  event_refund: "Estorno de mentoria",
  admin_grant: "Concessão manual",
  admin_revoke: "Remoção manual",
};

const ESTADO_PRAZO: Record<
  PrazoDeAcessoView["state"],
  { label: string; tone: "success" | "warning" | "danger" }
> = {
  ativo: { label: "Dentro do prazo", tone: "success" },
  expirando: { label: "Expirando", tone: "warning" },
  expirado: { label: "Expirado", tone: "danger" },
};

export function StudentPlanPanel({
  profileId,
  profileName,
  plano,
  prazo,
  historicoPrazo,
  saldo,
  movimentos,
  planosDisponiveis,
  migrationMissing,
}: {
  profileId: number;
  profileName: string;
  plano: PlanoAtualDoAluno | null;
  prazo: PrazoDeAcessoView | null;
  historicoPrazo: PrazoHistoricoItem[];
  saldo: number;
  movimentos: MovimentoDeCredito[];
  planosDisponiveis: PlanoOpcao[];
  migrationMissing: boolean;
}) {
  const [planoModal, setPlanoModal] = useState(false);
  const [creditoModal, setCreditoModal] = useState(false);
  const [prazoModal, setPrazoModal] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  if (migrationMissing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Plano e horas de mentoria</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Coins className="h-6 w-6" />}
            title="Banco ainda não preparado"
            description="As tabelas de planos e créditos (migration db/migrations/0011-entitlements-core.sql) ainda não foram aplicadas neste ambiente."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plano e horas de mentoria</CardTitle>
        <CardDescription>
          Direito de acesso do aluno e o extrato de horas de mentoria (ledger)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-card border border-border bg-surface-sunken px-4 py-3">
            <p className="font-mono text-2xs uppercase tracking-ultra text-tertiary">
              Plano
            </p>
            {plano?.planName ? (
              <>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-primary">{plano.planName}</p>
                  {plano.permissive ? (
                    <Badge variant="gold-dim">
                      <ShieldCheck className="h-3 w-3" />
                      Acesso total
                    </Badge>
                  ) : null}
                  {plano.expired ? <Badge variant="danger">Vencido</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-secondary">
                  {rotuloDuracao({
                    permissive: plano.permissive,
                    duration_months: plano.durationMonths,
                  })}
                  {plano.expiresAtLabel ? ` · vence em ${plano.expiresAtLabel}` : ""} ·{" "}
                  {rotuloCota({
                    permissive: plano.permissive,
                    mentorship_credits: plano.mentorshipCredits,
                    credit_period: plano.creditPeriod,
                  })}{" "}
                  de mentoria
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-sm text-secondary">
                Sem plano ativo. Atribua um plano para materializar o direito
                deste aluno.
              </p>
            )}
          </div>

          <div className="rounded-card border border-border bg-surface-sunken px-4 py-3">
            <p className="font-mono text-2xs uppercase tracking-ultra text-tertiary">
              Saldo de horas
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <p className="font-mono text-2xl font-semibold text-primary">{saldo}</p>
              {plano?.unlimitedCredits ? (
                <Badge variant="gold-dim">
                  <InfinityIcon className="h-3 w-3" />
                  Mentorias ilimitadas
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-tertiary">
              Soma de todos os lançamentos do extrato. Não existe saldo guardado
              em campo — o extrato é a verdade.
            </p>
          </div>
        </div>

        {/* Prazo de acesso (Tarefa 4) — data + motivo + autor, com histórico. */}
        <div className="rounded-card border border-border bg-surface-sunken px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-2xs uppercase tracking-ultra text-tertiary">
                Prazo de acesso
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-primary">
                  {prazo?.hasDeadline
                    ? `Vence em ${prazo.expiresAtLabel}`
                    : "Sem prazo de expiração"}
                </p>
                {prazo?.hasDeadline ? (
                  <Badge status={ESTADO_PRAZO[prazo.state].tone}>
                    {ESTADO_PRAZO[prazo.state].label}
                  </Badge>
                ) : null}
                {prazo?.source === "manual" ? (
                  <Badge variant="outline">Definido à mão</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-secondary">
                {prazo?.hasDeadline
                  ? `${rotuloDiasRestantes(prazo.daysRemaining)} · “Expirando” é vencer em até ${prazo.leadDays} dia${
                      prazo.leadDays === 1 ? "" : "s"
                    }.`
                  : "O aluno acessa sem data para acabar. Um plano com duração em meses calcula o prazo na atribuição; aqui você define ou ajusta a data à mão."}
                {prazo && !prazo.enforced
                  ? " O prazo ainda NÃO está valendo (flag “Prazo de acesso valendo”, em Configurações): vencido continua consumindo."
                  : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPrazoModal(true)}
                disabled={!plano?.planName}
                title={
                  plano?.planName
                    ? undefined
                    : "Atribua um plano antes de definir o prazo de acesso."
                }
              >
                <CalendarClock className="h-4 w-4" />
                {prazo?.hasDeadline ? "Ajustar prazo" : "Definir prazo"}
              </Button>
              {historicoPrazo.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHistoricoAberto((aberto) => !aberto)}
                  aria-expanded={historicoAberto}
                >
                  <History className="h-4 w-4" />
                  Histórico ({historicoPrazo.length})
                </Button>
              ) : null}
            </div>
          </div>

          {historicoAberto && historicoPrazo.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3">
              {historicoPrazo.map((item) => (
                <li key={item.id} className="text-sm">
                  <span
                    className={cn(
                      "font-medium",
                      item.vigente ? "text-primary" : "text-secondary",
                    )}
                  >
                    {item.expiresAtLabel
                      ? `Vence em ${item.expiresAtLabel}`
                      : "Sem prazo"}
                  </span>
                  <span className="text-tertiary">
                    {" · "}
                    {item.vigente ? "vigente" : "substituído"}
                    {" · "}
                    {item.source === "manual" ? "definido à mão" : "do plano"}
                  </span>
                  {item.reason ? (
                    <p className="text-xs text-secondary">“{item.reason}”</p>
                  ) : null}
                  <p className="font-mono text-xs text-tertiary">
                    {item.atLabel ?? "—"}
                    {item.actorLabel ? ` · ${item.actorLabel}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setPlanoModal(true)}>
            <Coins className="h-4 w-4" />
            {plano?.planName ? "Trocar plano" : "Atribuir plano"}
          </Button>
          <Button variant="outline" onClick={() => setCreditoModal(true)}>
            <Receipt className="h-4 w-4" />
            Ajustar horas
          </Button>
        </div>

        <div>
          <p className="mb-2 font-mono text-2xs uppercase tracking-ultra text-tertiary">
            Extrato
          </p>
          {movimentos.length === 0 ? (
            <p className="rounded-card border border-border bg-surface-sunken px-4 py-6 text-center text-sm text-secondary">
              Nenhum lançamento de horas para este aluno.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle overflow-hidden rounded-card border border-border">
              {movimentos.map((movimento) => (
                <li
                  key={movimento.id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary">
                      {MOTIVO_LABEL[movimento.reason] ?? movimento.reason}
                    </p>
                    {movimento.note ? (
                      <p className="mt-0.5 text-sm text-secondary">{movimento.note}</p>
                    ) : null}
                    {movimento.eventLabel ? (
                      <p className="mt-0.5 text-xs text-secondary">
                        <CalendarDays aria-hidden className="mr-1 inline h-3.5 w-3.5" />
                        {movimento.eventLabel}
                      </p>
                    ) : null}
                    <p className="mt-0.5 font-mono text-xs text-tertiary">
                      {movimento.createdAtLabel ?? "—"}
                      {movimento.actorLabel ? ` · ${movimento.actorLabel}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-sm font-semibold ${
                      movimento.delta > 0 ? "text-green-700" : "text-red-600"
                    }`}
                  >
                    {movimento.delta > 0 ? (
                      <ArrowUpRight aria-hidden className="mr-1 inline h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight aria-hidden className="mr-1 inline h-3.5 w-3.5" />
                    )}
                    {movimento.delta > 0 ? `+${movimento.delta}` : movimento.delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      {planoModal ? (
        <AtribuirPlanoModal
          profileId={profileId}
          profileName={profileName}
          planoAtualId={plano?.planId ?? null}
          planos={planosDisponiveis}
          onClose={() => setPlanoModal(false)}
        />
      ) : null}

      {creditoModal ? (
        <AjustarCreditoModal
          profileId={profileId}
          profileName={profileName}
          saldo={saldo}
          onClose={() => setCreditoModal(false)}
        />
      ) : null}

      {prazoModal ? (
        <PrazoDeAcessoModal
          profileId={profileId}
          profileName={profileName}
          prazo={prazo}
          onClose={() => setPrazoModal(false)}
        />
      ) : null}
    </Card>
  );
}

/** "faltam 12 dias" · "vence hoje" · "venceu há 3 dias" */
function rotuloDiasRestantes(dias: number | null): string {
  if (dias === null) return "Sem prazo";
  if (dias === 0) return "Vence hoje";
  if (dias > 0) return `Faltam ${dias} dia${dias === 1 ? "" : "s"}`;
  const passados = Math.abs(dias);
  return `Venceu há ${passados} dia${passados === 1 ? "" : "s"}`;
}

/**
 * Define/ajusta/remove a data de expiração. MOTIVO é obrigatório nos três casos
 * — inclusive ao remover — e o banco também exige (CHECK
 * `profile_entitlements_manual_audit_ck`): o carimbo de quem/quando/por quê não
 * é opcional. Nada aqui derruba a sessão do aluno nem desmarca presença já
 * confirmada; o prazo vale para o que vem depois.
 */
function PrazoDeAcessoModal({
  profileId,
  profileName,
  prazo,
  onClose,
}: {
  profileId: number;
  profileName: string;
  prazo: PrazoDeAcessoView | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState(prazo?.expiresAtInput ?? "");
  const [motivo, setMotivo] = useState("");

  const motivoVazio = motivo.trim().length === 0;
  const temPrazo = prazo?.hasDeadline === true;

  function salvar(novaData: string) {
    startTransition(async () => {
      const res = await definirPrazoDeAcesso(profileId, {
        data: novaData,
        motivo,
      });
      if (res.ok) {
        toast({ title: "Prazo atualizado!", description: res.message });
        onClose();
        router.refresh();
      } else {
        toast({ title: "Erro ao salvar", description: res.error, variant: "error" });
      }
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) {
      toast({ title: "Informe a data de expiração.", variant: "error" });
      return;
    }
    salvar(data);
  }

  return (
    <Modal open onClose={onClose} title={`Prazo de acesso de ${profileName}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-secondary">
          {temPrazo
            ? `Hoje o acesso vence em ${prazo?.expiresAtLabel}.`
            : "Hoje o acesso deste aluno não tem data para acabar."}{" "}
          O dia escolhido vale inteiro (a validade termina às 23:59 dele, no
          horário de Brasília).
        </p>

        <div>
          <Label htmlFor="prazo-data">Data de expiração *</Label>
          <Input
            id="prazo-data"
            name="data"
            type="date"
            value={data}
            min="2000-01-01"
            max="2100-12-31"
            onChange={(event) => setData(event.target.value)}
          />
          <p className="mt-2 text-xs text-tertiary">
            Datar no passado vence o aluno imediatamente — e é reversível:
            “Remover prazo” devolve o acesso na hora.
          </p>
        </div>

        <div>
          <Label htmlFor="prazo-motivo">Motivo *</Label>
          <Textarea
            id="prazo-motivo"
            name="motivo"
            rows={3}
            required
            maxLength={500}
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            aria-invalid={motivoVazio}
            placeholder="Ex.: pacote de 3 meses fechado em 10/08 — contrato fora do plano padrão."
          />
          <p className="mt-2 text-xs text-tertiary">
            Obrigatório (inclusive para remover). Fica no histórico de prazo com
            o seu e-mail e o horário.
          </p>
        </div>

        <p className="rounded-md bg-accent-subtle px-3 py-2 text-sm text-text-accent">
          Vencer NÃO bloqueia o login: o aluno continua entrando, vendo o
          catálogo e o próprio progresso. Com a flag “Prazo de acesso valendo”
          ligada, ele deixa de confirmar presença em mentoria e de registrar
          aula nova. Presenças já confirmadas continuam valendo.
        </p>

        <div className="mt-2 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          {temPrazo ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => salvar("")}
              disabled={pending || motivoVazio}
            >
              Remover prazo
            </Button>
          ) : null}
          <Button type="submit" disabled={pending || motivoVazio || !data}>
            {pending ? "Salvando…" : "Salvar prazo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AtribuirPlanoModal({
  profileId,
  profileName,
  planoAtualId,
  planos,
  onClose,
}: {
  profileId: number;
  profileName: string;
  planoAtualId: number | null;
  planos: PlanoOpcao[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [planoId, setPlanoId] = useState<string>(
    String(planos.find((plano) => plano.id !== planoAtualId)?.id ?? planos[0]?.id ?? ""),
  );

  const selecionado = planos.find((plano) => String(plano.id) === planoId) ?? null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = Number(planoId);
    if (!Number.isInteger(id) || id <= 0) {
      toast({ title: "Escolha um plano.", variant: "error" });
      return;
    }
    startTransition(async () => {
      const res = await atribuirPlanoAoAluno(profileId, id);
      if (res.ok) {
        toast({ title: "Plano atribuído!", description: res.message });
        onClose();
        router.refresh();
      } else {
        toast({ title: "Erro ao atribuir", description: res.error, variant: "error" });
      }
    });
  }

  return (
    <Modal open onClose={onClose} title={`Plano de ${profileName}`}>
      {planos.length === 0 ? (
        <EmptyState
          icon={<Coins className="h-6 w-6" />}
          title="Nenhum plano publicado"
          description="Cadastre e publique um plano em Admin > Planos para poder atribuí-lo a um aluno."
        />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="aluno-plano">Plano *</Label>
            <Select
              id="aluno-plano"
              value={planoId}
              onChange={(event) => setPlanoId(event.target.value)}
            >
              {planos.map((plano) => (
                <option key={plano.id} value={plano.id}>
                  {plano.name}
                  {plano.id === planoAtualId ? " (plano atual)" : ""}
                </option>
              ))}
            </Select>
          </div>

          {selecionado ? (
            <p className="rounded-card bg-surface-sunken px-4 py-3 text-sm text-secondary">
              {rotuloDuracao(selecionado)} ·{" "}
              {rotuloCota(selecionado).toLowerCase()} de mentoria
              {selecionado.permissive ? " · catálogo inteiro" : ""}.
            </p>
          ) : null}

          <p className="rounded-md bg-accent-subtle px-3 py-2 text-sm text-text-accent">
            Atribuir substitui o direito vigente do aluno (o anterior fica no
            histórico) e lança no extrato os créditos do novo plano, quando ele
            tiver cota. O saldo atual é preservado.
          </p>

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Atribuindo…" : "Atribuir plano"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Chave de idempotência do formulário: reenviar o MESMO ajuste (duplo clique,
 *  retry) não lança o crédito duas vezes. Gerada uma vez por abertura do modal. */
function novaChaveDeAjuste(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function AjustarCreditoModal({
  profileId,
  profileName,
  saldo,
  onClose,
}: {
  profileId: number;
  profileName: string;
  saldo: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chave] = useState(novaChaveDeAjuste);
  const [operacao, setOperacao] = useState<"adicionar" | "remover">("adicionar");
  const [motivo, setMotivo] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const input: AjusteCreditoInput = {
      operacao,
      quantidade: Number(fd.get("quantidade") ?? 0),
      motivo,
      chave,
    };
    startTransition(async () => {
      const res = await ajustarCreditoManual(profileId, input);
      if (res.ok) {
        toast({ title: "Horas ajustadas!", description: res.message });
        onClose();
        router.refresh();
      } else {
        toast({ title: "Erro ao ajustar", description: res.error, variant: "error" });
      }
    });
  }

  const motivoVazio = motivo.trim().length === 0;

  return (
    <Modal open onClose={onClose} title={`Ajustar horas de ${profileName}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-secondary">
          Saldo atual:{" "}
          <span className="font-mono font-semibold text-primary">{saldo}h</span>{" "}
          de mentoria. O lançamento entra no extrato com o seu nome e o horário —
          e não pode ser apagado depois.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ajuste-operacao">Operação *</Label>
            <Select
              id="ajuste-operacao"
              value={operacao}
              onChange={(event) =>
                setOperacao(event.target.value === "remover" ? "remover" : "adicionar")
              }
            >
              <option value="adicionar">Adicionar horas</option>
              <option value="remover">Remover horas</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="ajuste-quantidade">Quantidade *</Label>
            <Input
              id="ajuste-quantidade"
              name="quantidade"
              type="number"
              min={1}
              max={100000}
              step={1}
              required
              defaultValue={1}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="ajuste-motivo">Motivo *</Label>
          <Textarea
            id="ajuste-motivo"
            name="motivo"
            rows={3}
            required
            maxLength={500}
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            aria-invalid={motivoVazio}
            placeholder="Ex.: cortesia por indisponibilidade da mentoria do dia 12/08."
          />
          <p className="mt-2 text-xs text-tertiary">
            Obrigatório. Fica registrado no extrato do aluno junto com o seu
            e-mail e o horário do lançamento.
          </p>
        </div>

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending || motivoVazio}>
            {pending
              ? "Lançando…"
              : operacao === "adicionar"
                ? "Adicionar horas"
                : "Remover horas"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
