"use client";

// Admin > Mentorias — tabela ordenada por data + CRUD (Story 1.6).
// Recorrência diária/semanal materializa eventos concretos no cadastro (máx. 60).
// Editar/excluir afeta apenas a ocorrência selecionada.

import { useEffect, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CalendarPlus,
  CalendarRange,
  CalendarX2,
  CheckCircle2,
  Coins,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  UserRoundCheck,
  Users,
  UsersRound,
  X,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  CoverImage,
  EmptyState,
  Input,
  Label,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { cn, formatTime } from "@/lib/utils";
import {
  alternarStatusMentoria,
  atualizarMentoria,
  cancelarEventoComEstorno,
  criarMentoria,
  excluirMentoria,
  listarPresencas,
  marcarPresenca,
  type MentoriaInput,
  type PresencaContexto,
  type PresencaRow,
} from "@/app/admin/mentorships/actions";
import { CoverUploadField } from "@/components/admin-conteudo/cover-upload-field";
import { StatusBadge } from "@/components/admin-conteudo/status-badge";

export type AdminMentoria = {
  id: number;
  title: string;
  description: string | null;
  cover_url: string | null;
  event_date: string; // 'YYYY-MM-DD'
  starts_at: string; // 'HH:MM'
  ends_at: string | null;
  redirect_url: string | null;
  recurrence_type: "none" | "daily" | "weekly";
  recurrence_until: string | null;
  status: "draft" | "published";
  confirmations_count: number;
  /** migration 0012 — ausentes em ambiente que ainda não a aplicou */
  event_kind?: "mentoria_arkom" | "live_comunidade" | null;
  credit_cost?: number | null;
  cancelled_at?: string | Date | null;
  /** migration 0014 — mentores do evento, na ordem de exibição */
  mentor_ids: number[];
  /** migration 0014 — quantos foram marcados como PRESENTES */
  attendance_count: number;
  /**
   * Por que esta mentoria NÃO pode ser excluída (extrato/histórico de crédito
   * são append-only), ou `null` quando a exclusão está liberada. O texto vem do
   * servidor — mesma frase que a server action devolve se alguém forçar.
   */
  delete_block_reason: string | null;
};

/** Mentor cadastrado, do jeito que o seletor do formulário precisa (0014). */
export type MentorOption = {
  id: number;
  full_name: string;
  specialty: string | null;
  photo_url: string | null;
  status: "draft" | "published";
};

/** Formata 'YYYY-MM-DD' como 'dd/mm/aaaa' sem risco de fuso horário. */
function formatarData(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const RECURRENCE_LABELS: Record<AdminMentoria["recurrence_type"], string> = {
  none: "—",
  daily: "Diária",
  weekly: "Semanal",
};

/** Tipo do evento para efeito de crédito (migration 0012). */
type EventKind = "mentoria_arkom" | "live_comunidade";

/** Duração do evento em HORAS (arredondada, mínimo 1) — o custo padrão de uma
 *  mentoria quando o campo de horas fica vazio. Horário torto ⇒ 1h. */
function horasDoEvento(startsAt: string, endsAt: string): number {
  const re = /^(\d{2}):(\d{2})/;
  const ini = re.exec(startsAt);
  const fim = re.exec(endsAt);
  if (!ini || !fim) return 1;
  const minutos =
    Number(fim[1]) * 60 + Number(fim[2]) - (Number(ini[1]) * 60 + Number(ini[2]));
  if (!Number.isFinite(minutos) || minutos <= 0) return 1;
  return Math.max(1, Math.round(minutos / 60));
}

function kindOf(evento: AdminMentoria | null): EventKind {
  return evento?.event_kind === "mentoria_arkom" ? "mentoria_arkom" : "live_comunidade";
}

export function MentorshipsManager({
  eventos,
  creditoDisponivel = false,
  mentores = [],
  mentoresDisponivel = false,
}: {
  eventos: AdminMentoria[];
  /** A migration 0012 existe? Sem ela, os campos de crédito não aparecem. */
  creditoDisponivel?: boolean;
  /** Mentores cadastrados (0014), na ordem da vitrine. */
  mentores?: MentorOption[];
  /** A migration 0014 existe? Sem ela, o bloco de mentores não aparece. */
  mentoresDisponivel?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminMentoria | null>(null);
  const [recurrence, setRecurrence] = useState<"none" | "daily" | "weekly">("none");
  const [kind, setKind] = useState<EventKind>("live_comunidade");
  // Ordem importa: é ela que vira event_mentors.sort_order.
  const [mentoresDoEvento, setMentoresDoEvento] = useState<number[]>([]);
  const [deleting, setDeleting] = useState<AdminMentoria | null>(null);
  const [cancelando, setCancelando] = useState<AdminMentoria | null>(null);
  const [presencas, setPresencas] = useState<AdminMentoria | null>(null);

  function abrirCriar() {
    setEditing(null);
    setRecurrence("none");
    setKind("live_comunidade");
    setMentoresDoEvento([]);
    setFormOpen(true);
  }

  function abrirEditar(evento: AdminMentoria) {
    setEditing(evento);
    setRecurrence("none"); // edição afeta só a ocorrência — sem regenerar recorrência
    setKind(kindOf(evento));
    setMentoresDoEvento(evento.mentor_ids ?? []);
    setFormOpen(true);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: MentoriaInput = {
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? ""),
      cover_url: String(fd.get("cover_url") ?? ""),
      event_date: String(fd.get("event_date") ?? ""),
      starts_at: String(fd.get("starts_at") ?? ""),
      ends_at: String(fd.get("ends_at") ?? ""),
      redirect_url: String(fd.get("redirect_url") ?? ""),
      recurrence_type: editing ? "none" : recurrence,
      recurrence_until: String(fd.get("recurrence_until") ?? ""),
      status: fd.get("status") === "published" ? "published" : "draft",
      event_kind: kind,
      // Unidade = HORA de mentoria (2026-07-25). Campo vazio ⇒ a duração do
      // próprio evento (arredondada, mínimo 1h) vira o custo.
      credit_cost:
        kind === "mentoria_arkom"
          ? (() => {
              const cru = String(fd.get("credit_cost") ?? "").trim();
              if (cru !== "") return Math.max(0, Number(cru) || 0);
              return horasDoEvento(
                String(fd.get("starts_at") ?? ""),
                String(fd.get("ends_at") ?? ""),
              );
            })()
          : 0,
      mentor_ids: mentoresDisponivel ? mentoresDoEvento : [],
    };
    const id = editing?.id ?? null;
    startTransition(async () => {
      const res = id ? await atualizarMentoria(id, input) : await criarMentoria(input);
      if (res.ok) {
        toast({
          title: id ? "Mentoria atualizada!" : "Mentoria criada!",
          description:
            res.message ??
            (!id && recurrence !== "none"
              ? "Os eventos da recorrência foram gerados até a data final."
              : undefined),
        });
        setFormOpen(false);
        router.refresh();
      } else {
        toast({ title: "Erro ao salvar", description: res.error, variant: "error" });
      }
    });
  }

  function handleToggleStatus(evento: AdminMentoria) {
    startTransition(async () => {
      const res = await alternarStatusMentoria(evento.id);
      if (res.ok) {
        toast({
          title:
            evento.status === "published"
              ? "Mentoria despublicada."
              : "Mentoria publicada!",
          description: res.message,
        });
        router.refresh();
      } else {
        toast({ title: "Erro", description: res.error, variant: "error" });
      }
    });
  }

  async function handleDelete() {
    if (!deleting) return;
    const res = await excluirMentoria(deleting.id);
    if (res.ok) {
      toast({ title: "Mentoria excluída." });
      router.refresh();
    } else {
      // "Não foi possível excluir" e não "Erro ao excluir": quando o servidor
      // recusa por causa do extrato, isso não é falha — é a regra. O motivo
      // vem inteiro na descrição, e nada aqui sugere retentar.
      toast({ title: "Não foi possível excluir", description: res.error, variant: "error" });
      router.refresh();
    }
  }

  /** E3 — cancelamento pelo Arkom: despublica e estorna todos os débitos. */
  async function handleCancelar() {
    if (!cancelando) return;
    const res = await cancelarEventoComEstorno(cancelando.id);
    if (res.ok) {
      toast({
        title: "Mentoria cancelada.",
        description: res.message,
      });
      router.refresh();
    } else {
      toast({ title: "Erro ao cancelar", description: res.error, variant: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-display text-primary">Mentorias</h1>
          <p className="mt-1 text-base text-secondary">
            Agende encontros ao vivo. Recorrências geram um evento por ocorrência.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/mentorships/mentors">
            <Button variant="secondary">
              <UsersRound className="h-4 w-4" />
              Mentores
            </Button>
          </Link>
          <Button onClick={abrirCriar}>
            <CalendarPlus className="h-4 w-4" />
            Nova mentoria
          </Button>
        </div>
      </div>

      {eventos.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="h-6 w-6" />}
          title="Nenhuma mentoria agendada"
          description="Crie a primeira mentoria para ela aparecer no calendário dos alunos."
          action={
            <Button onClick={abrirCriar}>
              <CalendarPlus className="h-4 w-4" />
              Agendar mentoria
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-table border border-border bg-surface shadow-card-sm">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle font-mono text-2xs uppercase tracking-ultra text-tertiary">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Horário</th>
                <th className="px-4 py-3 font-medium">Título</th>
                {creditoDisponivel ? (
                  <th className="px-4 py-3 font-medium">Tipo / custo</th>
                ) : null}
                <th className="px-4 py-3 font-medium">Recorrência</th>
                <th className="px-4 py-3 font-medium">
                  {mentoresDisponivel ? "Confirmados / presentes" : "Presenças"}
                </th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((evento) => (
                <tr
                  key={evento.id}
                  className="border-b border-border-subtle last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-3 font-semibold text-primary">
                    {formatarData(evento.event_date)}
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {formatTime(evento.starts_at)}
                    {evento.ends_at ? ` – ${formatTime(evento.ends_at)}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-xs truncate font-semibold text-primary">
                      {evento.title}
                    </p>
                    {evento.cancelled_at ? (
                      <span className="mt-1 inline-block font-mono text-2xs uppercase tracking-ultra text-red-600">
                        Cancelada pelo Arkom
                      </span>
                    ) : null}
                  </td>
                  {creditoDisponivel ? (
                    <td className="px-4 py-3">
                      {kindOf(evento) === "mentoria_arkom" ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-secondary">
                          <Badge variant="orange">Mentoria</Badge>
                          <span className="font-mono text-xs text-tertiary">
                            {evento.credit_cost ?? 1}h
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm text-secondary">
                          <Badge>Live</Badge>
                          <span className="font-mono text-xs text-tertiary">grátis</span>
                        </span>
                      )}
                    </td>
                  ) : null}
                  <td className="px-4 py-3">
                    {evento.recurrence_type === "none" ? (
                      <span className="text-tertiary">—</span>
                    ) : (
                      <Badge variant="orange">
                        {RECURRENCE_LABELS[evento.recurrence_type]}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setPresencas(evento)}
                      title={
                        mentoresDisponivel
                          ? "Abrir a lista de presença (confirmados × presentes)"
                          : "Ver quem confirmou"
                      }
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-sm text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
                    >
                      <Users className="h-3.5 w-3.5 text-tertiary" />
                      {evento.confirmations_count}
                      {mentoresDisponivel ? (
                        <>
                          <span aria-hidden className="text-tertiary">
                            /
                          </span>
                          <span
                            className={
                              evento.attendance_count > 0
                                ? "text-green-700"
                                : "text-tertiary"
                            }
                          >
                            {evento.attendance_count}
                          </span>
                        </>
                      ) : null}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={evento.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        disabled={pending}
                        aria-label={
                          evento.status === "published"
                            ? `Despublicar ${evento.title}`
                            : `Publicar ${evento.title}`
                        }
                        title={evento.status === "published" ? "Despublicar" : "Publicar"}
                        onClick={() => handleToggleStatus(evento)}
                      >
                        {evento.status === "published" ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        aria-label={`Editar ${evento.title}`}
                        title="Editar"
                        onClick={() => abrirEditar(evento)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {creditoDisponivel ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-2"
                          aria-label={`Cancelar ${evento.title} e estornar créditos`}
                          title="Cancelar pelo Arkom (despublica e estorna os créditos)"
                          onClick={() => setCancelando(evento)}
                        >
                          <CalendarX2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {/* Mentoria com histórico de crédito não se exclui. O
                          botão fica TRAVADO E FALANTE: `aria-disabled` (não
                          `disabled`) para que o clique ainda chegue e possa
                          EXPLICAR o motivo — botão morto deixa o admin sem
                          saber por que nada aconteceu. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className={
                          evento.delete_block_reason
                            ? "px-2 text-disabled cursor-not-allowed hover:bg-transparent"
                            : "px-2 text-red-600 hover:bg-danger-subtle"
                        }
                        aria-disabled={!!evento.delete_block_reason}
                        aria-label={
                          evento.delete_block_reason
                            ? `Excluir ${evento.title} (bloqueado)`
                            : `Excluir ${evento.title}`
                        }
                        title={evento.delete_block_reason ?? "Excluir"}
                        onClick={() => {
                          if (evento.delete_block_reason) {
                            toast({
                              title: "Esta mentoria não pode ser excluída",
                              description: evento.delete_block_reason,
                              variant: "error",
                            });
                            return;
                          }
                          setDeleting(evento);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Editar mentoria" : "Nova mentoria"}
        size="lg"
      >
        <form
          key={editing?.id ?? "nova"}
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <div>
            <Label htmlFor="mentoria-title">Título *</Label>
            <Input
              id="mentoria-title"
              name="title"
              required
              defaultValue={editing?.title ?? ""}
              placeholder="Ex.: Mentoria ao vivo — Tira-dúvidas"
            />
          </div>
          <div>
            <Label htmlFor="mentoria-description">Descrição</Label>
            <Textarea
              id="mentoria-description"
              name="description"
              rows={3}
              defaultValue={editing?.description ?? ""}
            />
          </div>
          <CoverUploadField
            id="mentoria-cover"
            label="Capa da mentoria"
            kind="mentorship-cover"
            defaultValue={editing?.cover_url ?? ""}
            previewTitle={editing?.title ?? "Mentoria"}
          />
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="mentoria-data">Data *</Label>
              <Input
                id="mentoria-data"
                name="event_date"
                type="date"
                required
                defaultValue={editing?.event_date ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="mentoria-inicio">Início *</Label>
              <Input
                id="mentoria-inicio"
                name="starts_at"
                type="time"
                required
                defaultValue={editing?.starts_at ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="mentoria-fim">Fim (opcional)</Label>
              <Input
                id="mentoria-fim"
                name="ends_at"
                type="time"
                defaultValue={editing?.ends_at ?? ""}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="mentoria-link">Link de redirecionamento</Label>
            <Input
              id="mentoria-link"
              name="redirect_url"
              type="url"
              defaultValue={editing?.redirect_url ?? ""}
              placeholder="https://… (Zoom, Meet, YouTube…)"
            />
          </div>

          {creditoDisponivel ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="mentoria-kind">Tipo do evento</Label>
                <Select
                  id="mentoria-kind"
                  name="event_kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as EventKind)}
                >
                  <option value="live_comunidade">
                    Live da comunidade (não consome créditos)
                  </option>
                  <option value="mentoria_arkom">
                    Mentoria do Arkom (consome créditos)
                  </option>
                </Select>
              </div>
              {kind === "mentoria_arkom" ? (
                <div>
                  <Label htmlFor="mentoria-credit-cost">Horas de mentoria (custo)</Label>
                  <Input
                    id="mentoria-credit-cost"
                    name="credit_cost"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    defaultValue={editing?.credit_cost ?? ""}
                    placeholder="vazio = duração do evento"
                  />
                  <p className="mt-1 text-xs text-tertiary">
                    Vazio usa a duração do evento (ex.: 14h–16h = 2h). 0 libera sem
                    consumir horas. O débito só acontece com a flag &ldquo;Créditos
                    valendo&rdquo; ligada em Configurações.
                  </p>
                </div>
              ) : (
                <div className="flex items-end">
                  <p className="rounded-md bg-surface-sunken px-3 py-2 text-xs text-secondary">
                    <Coins aria-hidden className="mr-1 inline h-3.5 w-3.5" />
                    Lives da comunidade nunca consomem crédito, mesmo com o bloqueio
                    ligado.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {mentoresDisponivel ? (
            <MentorPicker
              mentores={mentores}
              selecionados={mentoresDoEvento}
              onChange={setMentoresDoEvento}
              recorrente={!editing && recurrence !== "none"}
            />
          ) : null}

          {editing ? (
            <p className="rounded-md bg-accent-subtle px-3 py-2 text-sm text-text-accent">
              A edição afeta apenas esta ocorrência. Para mudar a série, exclua as
              ocorrências e cadastre a recorrência novamente.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="mentoria-recorrencia">Recorrência</Label>
                <Select
                  id="mentoria-recorrencia"
                  name="recurrence_type"
                  value={recurrence}
                  onChange={(e) =>
                    setRecurrence(e.target.value as "none" | "daily" | "weekly")
                  }
                >
                  <option value="none">Sem recorrência</option>
                  <option value="daily">Diária</option>
                  <option value="weekly">Semanal</option>
                </Select>
              </div>
              {recurrence !== "none" && (
                <div>
                  <Label htmlFor="mentoria-until">Repetir até *</Label>
                  <Input
                    id="mentoria-until"
                    name="recurrence_until"
                    type="date"
                    required
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="mentoria-status">Status</Label>
            <Select
              id="mentoria-status"
              name="status"
              defaultValue={editing?.status ?? "published"}
            >
              <option value="published">Publicada</option>
              <option value="draft">Rascunho (invisível para alunos)</option>
            </Select>
          </div>

          <div className="mt-2 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFormOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : editing ? "Salvar alterações" : "Criar mentoria"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={`Excluir "${deleting?.title}"?`}
        description={
          deleting
            ? `A ocorrência de ${formatarData(deleting.event_date)} e as confirmações de presença serão excluídas. Esta ação não pode ser desfeita.`
            : undefined
        }
      />

      <ConfirmDialog
        open={!!cancelando}
        onClose={() => setCancelando(null)}
        onConfirm={handleCancelar}
        // Sem estes labels o ConfirmDialog usa o default "Excluir" — errado
        // para um CANCELAMENTO com estorno (achado da suíte E2E v2).
        confirmLabel="Cancelar e estornar"
        loadingLabel="Cancelando…"
        cancelLabel="Voltar"
        title={`Cancelar "${cancelando?.title}" pelo Arkom?`}
        description={
          cancelando
            ? `A mentoria de ${formatarData(cancelando.event_date)} sai do calendário do aluno (vira rascunho) e TODOS os créditos debitados por ela são estornados no extrato de cada aluno, como lançamento novo. Nada é apagado: as confirmações e o histórico permanecem.`
            : undefined
        }
      />

      {presencas ? (
        <PresencaModal
          evento={presencas}
          onClose={() => setPresencas(null)}
          onMudou={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

/** Formata o carimbo ISO UTC de confirmação como 'dd/mm/aaaa às hh:mm' local. */
function formatarConfirmadoEm(iso: string | Date | null): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(d)
    .replace(",", " às");
}

/* ───────────────────────── Mentores do encontro (0014) ───────────────────── */

/**
 * Seletor N:N com ORDEM: a posição na lista escolhida vira
 * `event_mentors.sort_order`, que é a ordem em que o aluno vê os mentores na
 * capa do evento. Lista de escolhidos (com ↑↓ e remover) + um <Select> para
 * acrescentar — em vez de uma lista de checkboxes, que não expressaria ordem.
 */
function MentorPicker({
  mentores,
  selecionados,
  onChange,
  recorrente,
}: {
  mentores: MentorOption[];
  selecionados: number[];
  onChange: (ids: number[]) => void;
  /** Cadastro com recorrência: os mesmos mentores valem para toda a série. */
  recorrente: boolean;
}) {
  const porId = new Map(mentores.map((mentor) => [mentor.id, mentor]));
  const escolhidos = selecionados.filter((id) => porId.has(id));
  const restantes = mentores.filter((mentor) => !escolhidos.includes(mentor.id));

  function mover(index: number, direcao: -1 | 1) {
    const alvo = index + direcao;
    if (alvo < 0 || alvo >= escolhidos.length) return;
    const proximos = [...escolhidos];
    [proximos[index], proximos[alvo]] = [proximos[alvo], proximos[index]];
    onChange(proximos);
  }

  return (
    <div className="rounded-card border border-border bg-surface-sunken p-3">
      <Label htmlFor="mentoria-mentor-add">Mentores do encontro</Label>

      {mentores.length === 0 ? (
        <p className="mt-1 text-xs text-tertiary">
          Nenhum mentor cadastrado ainda. Cadastre em Mentorias › Mentores para
          poder vincular.
        </p>
      ) : (
        <>
          {escolhidos.length === 0 ? (
            <p className="mt-1 text-xs text-tertiary">
              Nenhum mentor vinculado. Vale para mentoria do Arkom e para live da
              comunidade.
            </p>
          ) : (
            <ol className="mt-2 flex flex-col gap-1.5">
              {escolhidos.map((id, index) => {
                const mentor = porId.get(id)!;
                return (
                  <li
                    key={id}
                    className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5"
                  >
                    <span className="font-mono text-2xs text-tertiary">{index + 1}</span>
                    <div className="size-7 shrink-0 overflow-hidden rounded-full">
                      <CoverImage
                        src={mentor.photo_url}
                        title={mentor.full_name}
                        aspect="square"
                        className="rounded-full"
                      />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm text-primary">
                      {mentor.full_name}
                      {mentor.status === "draft" ? (
                        <span className="ml-2 font-mono text-2xs uppercase tracking-ultra text-tertiary">
                          rascunho
                        </span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-1.5"
                      title="Subir"
                      aria-label={`Subir ${mentor.full_name}`}
                      disabled={index === 0}
                      onClick={() => mover(index, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-1.5"
                      title="Descer"
                      aria-label={`Descer ${mentor.full_name}`}
                      disabled={index === escolhidos.length - 1}
                      onClick={() => mover(index, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-1.5 text-red-600 hover:bg-danger-subtle"
                      title="Remover do encontro"
                      aria-label={`Remover ${mentor.full_name}`}
                      onClick={() => onChange(escolhidos.filter((outro) => outro !== id))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}

          <Select
            id="mentoria-mentor-add"
            className="mt-2"
            value=""
            disabled={restantes.length === 0}
            onChange={(e) => {
              const id = Number(e.target.value);
              if (Number.isInteger(id) && id > 0) onChange([...escolhidos, id]);
            }}
          >
            <option value="">
              {restantes.length === 0
                ? "Todos os mentores já estão vinculados"
                : "Adicionar mentor…"}
            </option>
            {restantes.map((mentor) => (
              <option key={mentor.id} value={mentor.id}>
                {mentor.full_name}
                {mentor.specialty ? ` — ${mentor.specialty}` : ""}
                {mentor.status === "draft" ? " (rascunho)" : ""}
              </option>
            ))}
          </Select>

          <p className="mt-2 text-xs text-tertiary">
            A ordem acima é a ordem em que o aluno vê os mentores na capa do
            encontro.
            {recorrente
              ? " Os mesmos mentores são vinculados a todas as ocorrências da recorrência."
              : ""}
          </p>
        </>
      )}
    </div>
  );
}

/* ─────────────────────── Lista de presença — E4 (0014) ───────────────────── */

/**
 * A lista de presença do evento: quem confirmou (RSVP) e quem ESTEVE.
 * Carrega sob demanda ao abrir, como o antigo modal de confirmações.
 *
 * Marcar PRESENTE aciona `debitForParticipation` quando a política vigente é
 * `on_participation` e o bloqueio está ligado — idempotente, então remarcar
 * não cobra de novo. Marcar AUSENTE não estorna (aviso explícito no rodapé).
 */
function PresencaModal({
  evento,
  onClose,
  onMudou,
}: {
  evento: AdminMentoria;
  onClose: () => void;
  /** Avisa a tabela para recarregar os contadores. */
  onMudou: () => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<PresencaRow[] | null>(null);
  const [contexto, setContexto] = useState<PresencaContexto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    listarPresencas(evento.id).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setRows(res.rows);
        setContexto(res.contexto);
      } else {
        setError(res.error);
      }
    });
    return () => {
      alive = false;
    };
  }, [evento.id]);

  async function marcar(row: PresencaRow, presente: boolean) {
    if (salvando !== null) return;
    setSalvando(row.user_id);
    const res = await marcarPresenca(evento.id, row.user_id, presente);
    setSalvando(null);
    if (!res.ok) {
      toast({ title: "Erro ao marcar", description: res.error, variant: "error" });
      return;
    }
    setRows((atual) =>
      (atual ?? []).map((item) =>
        item.user_id === row.user_id
          ? { ...item, attended: presente, marked_at: new Date(), marked_by_name: null }
          : item,
      ),
    );
    toast({
      title: presente
        ? `${row.full_name} marcado como presente.`
        : `${row.full_name} marcado como ausente.`,
      description: res.message,
      variant: res.message ? "info" : "success",
    });
    onMudou();
  }

  const confirmados = (rows ?? []).filter((row) => row.confirmed).length;
  const presentes = (rows ?? []).filter((row) => row.attended === true).length;
  const ausentes = (rows ?? []).filter((row) => row.attended === false).length;
  const pendentes = (rows ?? []).filter((row) => row.attended === null).length;

  return (
    <Modal open onClose={onClose} size="lg" title={`Lista de presença — ${evento.title}`}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-secondary">
          {formatarData(evento.event_date)} · {formatTime(evento.starts_at)}
          {evento.ends_at ? ` – ${formatTime(evento.ends_at)}` : ""}
        </p>

        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : rows === null ? (
          <p className="text-sm text-tertiary">Carregando…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 font-mono text-2xs uppercase tracking-ultra text-tertiary">
              <Badge>{confirmados} confirmados</Badge>
              <Badge variant="success">{presentes} presentes</Badge>
              <Badge variant="danger">{ausentes} ausentes</Badge>
              {pendentes > 0 ? <Badge>{pendentes} sem marcação</Badge> : null}
            </div>

            {contexto && !contexto.disponivel ? (
              <p className="rounded-md bg-warning-subtle px-3 py-2 text-xs text-amber-800">
                A lista de presença ainda não existe neste ambiente (migration
                db/migrations/0014-mentors.sql). Abaixo, só quem confirmou.
              </p>
            ) : contexto?.debitaAoMarcar ? (
              <p className="rounded-md bg-accent-subtle px-3 py-2 text-xs text-text-accent">
                Marcar presente debita {contexto.cost} crédito
                {contexto.cost === 1 ? "" : "s"} do aluno (política &ldquo;por
                participação&rdquo;). Marcar de novo não cobra duas vezes.
              </p>
            ) : contexto?.policy === "on_participation" ? (
              <p className="rounded-md bg-surface-sunken px-3 py-2 text-xs text-secondary">
                Política &ldquo;por participação&rdquo; configurada, mas nada é
                debitado agora (bloqueio de créditos desligado ou evento sem custo).
              </p>
            ) : (
              <p className="rounded-md bg-surface-sunken px-3 py-2 text-xs text-secondary">
                O crédito deste evento sai na confirmação do aluno, não aqui.
                Marcar presença só registra quem apareceu.
              </p>
            )}

            {rows.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="Ninguém confirmou ainda"
                description="As confirmações dos alunos aparecem aqui assim que forem feitas — e é nesta lista que a presença é marcada."
              />
            ) : (
              <ul className="divide-y divide-border-subtle rounded-lg border border-border">
                {rows.map((row) => (
                  <li
                    key={row.user_id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-primary">
                        {row.full_name}
                        {!row.confirmed ? (
                          <span className="ml-2 font-mono text-2xs uppercase tracking-ultra text-tertiary">
                            sem confirmação
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-tertiary">
                        {row.email}
                      </span>
                      <span className="block truncate text-2xs text-tertiary">
                        {row.attended === null
                          ? `Confirmou em ${formatarConfirmadoEm(row.confirmed_at)}`
                          : `${row.attended ? "Presente" : "Ausente"} · marcado em ${formatarConfirmadoEm(row.marked_at)}${
                              row.marked_by_name ? ` por ${row.marked_by_name}` : ""
                            }`}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant={row.attended === true ? "primary" : "ghost"}
                        size="sm"
                        className={cn(
                          "px-2",
                          row.attended === true ? "" : "text-green-700 hover:bg-success-subtle",
                        )}
                        title="Marcar presente"
                        aria-label={`Marcar ${row.full_name} como presente`}
                        aria-pressed={row.attended === true}
                        disabled={
                          salvando !== null || contexto?.disponivel === false
                        }
                        onClick={() => marcar(row, true)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Presente
                      </Button>
                      <Button
                        type="button"
                        variant={row.attended === false ? "secondary" : "ghost"}
                        size="sm"
                        className={cn(
                          "px-2",
                          row.attended === false ? "" : "text-red-600 hover:bg-danger-subtle",
                        )}
                        title="Marcar ausente"
                        aria-label={`Marcar ${row.full_name} como ausente`}
                        aria-pressed={row.attended === false}
                        disabled={
                          salvando !== null || contexto?.disponivel === false
                        }
                        onClick={() => marcar(row, false)}
                      >
                        <XCircle className="h-4 w-4" />
                        Ausente
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="flex items-start gap-2 text-2xs text-tertiary">
              <UserRoundCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Corrigir a marcação é seguro: a presença é sobrescrita, com autor e
              horário. Trocar de presente para ausente NÃO estorna crédito — o
              estorno é lançamento manual no extrato do aluno, com motivo.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
