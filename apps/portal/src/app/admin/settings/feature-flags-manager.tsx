"use client";

// Admin > Configurações — painel das feature flags de runtime.
// Cada linha é uma flag de `feature_flags` (migration 0010): interruptor
// liga/desliga com efeito imediato (sem rebuild/deploy) + escopo opcional em
// JSON, editado como texto e validado na server action.
// Co-locado com a rota (como admin-nav.tsx): é o chrome de uma tela só.

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Braces, Pencil, SlidersHorizontal, ToggleLeft } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Label,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { alternarFlag, salvarEscopoFlag } from "@/app/admin/settings/actions";

export type AdminFeatureFlag = {
  key: string;
  enabled: boolean;
  scope: Record<string, unknown> | null;
  updated_by: string | null;
  updated_at_label: string | null;
};

/** Copy pt-BR das flags conhecidas (as semeadas pela 0010). Flag criada fora
 *  desta lista continua aparecendo — cai no fallback com a própria chave. */
const FLAG_CATALOG: Record<string, { label: string; description: string }> = {
  entitlements_enabled: {
    label: "Entitlements por perfil",
    description:
      "Passa a valer o entitlement real de cada aluno (plano, catálogo e prazo) no lugar do provisório “admin = Pro”.",
  },
  credit_shadow_mode: {
    label: "Horas em modo sombra",
    description:
      "Registra em credit_shadow_log o veredito que SERIA aplicado em cada confirmação de presença, sem mudar nada para o aluno e sem tocar no ledger. Serve para conferir os números antes de ligar o bloqueio.",
  },
  credit_blocking_enabled: {
    label: "Horas de mentoria valendo (bloqueio)",
    description:
      "Confirmar presença em mentoria do Arkom passa a debitar as horas do evento, e saldo insuficiente impede a confirmação. Exige “Entitlements por perfil” ligada — sem ela, o bloqueio vira modo sombra. Ligar só depois de conferir o modo sombra.",
  },
  expiration_enforcement: {
    label: "Prazo de acesso valendo",
    description:
      "Entitlement vencido para de consumir. O aluno continua entrando, vendo o catálogo e o próprio progresso.",
  },
  course_rails_enabled: {
    label: "Vitrine do catálogo configurável",
    description:
      "As prateleiras da Universidade IA passam a vir da configuração de Universidade IA › Vitrine do catálogo (título, ordem, cursos e limite) no lugar das prateleiras fixas do código. Desligada, o aluno vê exatamente o que sempre viu.",
  },
  mentors_enabled: {
    label: "Mentores na página do aluno",
    description:
      "Mostra a vitrine de mentores em Mentorias e os mentores de cada encontro na capa do evento. Desligada, o aluno vê a página exatamente como sempre — cadastrar mentor e conferir a lista de presença no /admin continua funcionando de qualquer jeito.",
  },
  debit_policy: {
    label: "Política de débito",
    description:
      "Quando o crédito sai do saldo. Escopo: {\"policy\":\"on_confirmation\"} (ao confirmar presença) ou {\"policy\":\"on_participation\"} (quando o mentor marca presença).",
  },
};

function flagCopy(key: string) {
  return (
    FLAG_CATALOG[key] ?? {
      label: key,
      description: "Flag sem descrição cadastrada nesta tela.",
    }
  );
}

function scopeToText(scope: Record<string, unknown> | null): string {
  return scope ? JSON.stringify(scope, null, 2) : "";
}

export function FeatureFlagsManager({
  flags,
  migrationMissing,
}: {
  flags: AdminFeatureFlag[];
  migrationMissing: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<AdminFeatureFlag | null>(null);

  if (migrationMissing) {
    return (
      <EmptyState
        icon={<SlidersHorizontal className="h-6 w-6" />}
        title="Banco ainda não preparado"
        description="A tabela de flags (migration db/migrations/0010-feature-flags.sql) ainda não foi aplicada neste ambiente. Enquanto isso, o app trata todas as flags como desligadas."
      />
    );
  }

  if (flags.length === 0) {
    return (
      <EmptyState
        icon={<ToggleLeft className="h-6 w-6" />}
        title="Nenhuma flag cadastrada"
        description="A tabela existe, mas está sem linhas. Reaplique os seeds da migration 0010 (insert … on conflict do nothing) para trazer as flags padrão."
      />
    );
  }

  function handleToggle(flag: AdminFeatureFlag) {
    const next = !flag.enabled;
    startTransition(async () => {
      const res = await alternarFlag(flag.key, next);
      if (res.ok) {
        toast({
          title: next ? "Flag ligada." : "Flag desligada.",
          description: `${flagCopy(flag.key).label} — vale agora aqui e em até 30s nas demais instâncias.`,
        });
        router.refresh();
      } else {
        toast({ title: "Erro ao alterar", description: res.error, variant: "error" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-border-subtle overflow-hidden rounded-card border border-border bg-surface">
        {flags.map((flag) => {
          const copy = flagCopy(flag.key);
          return (
            <li key={flag.key} className="flex items-start gap-4 px-5 py-4">
              <div className="pt-1">
                <Switch
                  checked={flag.enabled}
                  disabled={pending}
                  label={`${flag.enabled ? "Desligar" : "Ligar"} ${copy.label}`}
                  onToggle={() => handleToggle(flag)}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-primary">{copy.label}</p>
                  <Badge status={flag.enabled ? "success" : "neutral"}>
                    {flag.enabled ? "Ligada" : "Desligada"}
                  </Badge>
                  <code className="font-mono text-xs text-tertiary">{flag.key}</code>
                </div>
                <p className="mt-1 text-sm text-secondary">{copy.description}</p>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Braces aria-hidden className="h-3.5 w-3.5 text-tertiary" />
                  <code className="rounded-md bg-surface-sunken px-2 py-1 font-mono text-xs text-secondary">
                    {flag.scope ? JSON.stringify(flag.scope) : "sem escopo"}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(flag)}
                    disabled={pending}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar escopo
                  </Button>
                </div>

                <p className="mt-2 font-mono text-xs text-tertiary">
                  {flag.updated_at_label
                    ? `Última alteração: ${flag.updated_at_label}${
                        flag.updated_by ? ` · ${flag.updated_by}` : ""
                      }`
                    : "Sem histórico de alteração."}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {editing ? (
        <EditScopeModal flag={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

/** Interruptor acessível (role=switch). Não há Switch no átomo ui/ — este é o
 *  primeiro; se aparecer um segundo caso de uso, promover para components/ui. */
function Switch({
  checked,
  onToggle,
  disabled,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200",
        "focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40",
        checked
          ? "border-accent bg-accent"
          : "border-border-strong bg-surface-sunken"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-[18px] rounded-full bg-white shadow-card transition-transform duration-200",
          checked ? "translate-x-[23px]" : "translate-x-[3px]"
        )}
      />
    </button>
  );
}

/** Escopo em JSON — texto livre validado na action (objeto JSON ou vazio). */
function EditScopeModal({
  flag,
  onClose,
}: {
  flag: AdminFeatureFlag;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scopeText, setScopeText] = useState(scopeToText(flag.scope));

  const invalid = (() => {
    const raw = scopeText.trim();
    if (!raw) return false;
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed === null || typeof parsed !== "object" || Array.isArray(parsed);
    } catch {
      return true;
    }
  })();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const res = await salvarEscopoFlag(flag.key, scopeText);
      if (res.ok) {
        toast({ title: "Escopo salvo!", description: flagCopy(flag.key).label });
        onClose();
        router.refresh();
      } else {
        toast({ title: "Erro ao salvar", description: res.error, variant: "error" });
      }
    });
  }

  return (
    <Modal open onClose={onClose} title={`Escopo: ${flagCopy(flag.key).label}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-secondary">
          Parâmetros da flag em JSON (um objeto). Deixe em branco para remover o
          escopo. Exemplo:{" "}
          <code className="font-mono text-xs text-primary">
            {'{"policy":"on_confirmation"}'}
          </code>
        </p>
        <div>
          <Label htmlFor="flag_scope">Escopo (JSON)</Label>
          <Textarea
            id="flag_scope"
            name="scope"
            rows={6}
            value={scopeText}
            onChange={(e) => setScopeText(e.target.value)}
            aria-invalid={invalid}
            placeholder='{"policy":"on_confirmation"}'
            className="font-mono"
          />
          {invalid ? (
            <p className="mt-2 text-xs text-red-600">
              JSON inválido — precisa ser um objeto, como{" "}
              {'{"policy":"on_confirmation"}'}.
            </p>
          ) : null}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending || invalid}>
            {pending ? "Salvando..." : "Salvar escopo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
