"use client";

// Admin > Planos — tabela + CRUD dos planos comerciais.
// Co-locado com a rota (como admin-nav.tsx e o painel de flags): é o chrome de
// uma tela só, não um componente de conteúdo reutilizável.
//
// Plano PERMISSIVO é um caso especial: catálogo inteiro, mentorias ilimitadas
// e sem prazo. Quando marcado, o formulário esconde duração/cota/cursos/apps —
// a action também zera esses campos, para o banco não guardar contradição.
//
// Os APPS são um liga/desliga ÚNICO (ClickUp 86ajrgzef): libera todos ou não
// libera nenhum, sem seleção app a app. Ambiente sem a migration 0016
// (`appsDisponivel=false`) esconde o campo — o resto da tela continua de pé.

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BadgePlus,
  Coins,
  Eye,
  EyeOff,
  Infinity as InfinityIcon,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { StatusBadge } from "@/components/admin-conteudo/status-badge";
import { rotuloCota, rotuloDuracao } from "@/lib/plan-format";
import {
  alternarStatusPlano,
  criarPlano,
  excluirPlano,
  salvarPlano,
  type PlanoInput,
} from "@/app/admin/plans/actions";

export type AdminPlano = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  duration_months: number | null;
  mentorship_credits: number | null;
  credit_period: "month" | "total";
  permissive: boolean;
  status: "draft" | "published";
  sort_order: number;
  students_count: number;
  course_ids: number[];
  /** Liga/desliga único dos Apps e Templates (migration 0016). */
  apps_included: boolean;
};

export type AdminCursoOpcao = {
  id: number;
  title: string;
  status: "draft" | "published";
};

export function PlansManager({
  planos,
  cursos,
  migrationMissing,
  appsDisponivel,
}: {
  planos: AdminPlano[];
  cursos: AdminCursoOpcao[];
  migrationMissing: boolean;
  /** `false` = ambiente sem a migration 0016: o campo de apps não aparece. */
  appsDisponivel: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminPlano | null>(null);
  const [deleting, setDeleting] = useState<AdminPlano | null>(null);

  const cursoPorId = useMemo(
    () => new Map(cursos.map((curso) => [curso.id, curso])),
    [cursos],
  );

  if (migrationMissing) {
    return (
      <EmptyState
        icon={<Coins className="h-6 w-6" />}
        title="Banco ainda não preparado"
        description="As tabelas de planos e créditos (migration db/migrations/0011-entitlements-core.sql) ainda não foram aplicadas neste ambiente. Enquanto isso, o app segue com o comportamento anterior."
      />
    );
  }

  function abrirCriar() {
    setEditing(null);
    setFormOpen(true);
  }

  function abrirEditar(plano: AdminPlano) {
    setEditing(plano);
    setFormOpen(true);
  }

  function handleToggleStatus(plano: AdminPlano) {
    startTransition(async () => {
      const res = await alternarStatusPlano(plano.id);
      if (res.ok) {
        toast({ title: res.message ?? "Status alterado." });
        router.refresh();
      } else {
        toast({ title: "Erro", description: res.error, variant: "error" });
      }
    });
  }

  async function handleDelete() {
    if (!deleting) return;
    const res = await excluirPlano(deleting.id);
    if (res.ok) {
      toast({ title: res.message ?? "Plano excluído." });
      router.refresh();
    } else {
      toast({ title: "Erro ao excluir", description: res.error, variant: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <Button onClick={abrirCriar}>
          <BadgePlus className="h-4 w-4" />
          Novo plano
        </Button>
      </div>

      {planos.length === 0 ? (
        <EmptyState
          icon={<Coins className="h-6 w-6" />}
          title="Nenhum plano cadastrado"
          description="Crie o primeiro plano para definir duração de acesso, horas de mentoria e quais cursos ficam liberados."
          action={
            <Button onClick={abrirCriar}>
              <BadgePlus className="h-4 w-4" />
              Criar plano
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-table border border-border bg-surface shadow-card-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle font-mono text-2xs uppercase tracking-ultra text-tertiary">
                <th className="px-4 py-3 font-medium">Plano</th>
                <th className="px-4 py-3 font-medium">Duração</th>
                <th className="px-4 py-3 font-medium">Horas de mentoria</th>
                <th className="px-4 py-3 font-medium">Catálogo</th>
                <th className="px-4 py-3 font-medium">Alunos</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {planos.map((plano) => (
                <tr
                  key={plano.id}
                  className="border-b border-border-subtle last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-primary">{plano.name}</p>
                      {plano.permissive ? (
                        <Badge variant="gold-dim">
                          <InfinityIcon className="h-3 w-3" />
                          Permissivo
                        </Badge>
                      ) : null}
                    </div>
                    <code className="font-mono text-xs text-tertiary">{plano.slug}</code>
                  </td>
                  <td className="px-4 py-3 text-secondary">{rotuloDuracao(plano)}</td>
                  <td className="px-4 py-3 text-secondary">{rotuloCota(plano)}</td>
                  <td className="px-4 py-3 text-secondary">
                    {plano.permissive ? (
                      "Todos os cursos"
                    ) : plano.course_ids.length === 0 ? (
                      <span className="text-tertiary">Nenhum curso</span>
                    ) : (
                      <span title={plano.course_ids
                        .map((id) => cursoPorId.get(id)?.title ?? `#${id}`)
                        .join(", ")}>
                        {plano.course_ids.length} curso
                        {plano.course_ids.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {/* Sistemas: só aparece quando NÃO libera — o padrão
                        (libera) é o comportamento de sempre e não vira ruído. */}
                    {!plano.permissive && !plano.apps_included ? (
                      <span className="mt-1 block text-xs text-tertiary">Sem sistemas</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-secondary">
                    {plano.students_count}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={plano.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        disabled={pending}
                        aria-label={
                          plano.status === "published"
                            ? `Despublicar ${plano.name}`
                            : `Publicar ${plano.name}`
                        }
                        title={
                          plano.status === "published"
                            ? "Voltar para rascunho"
                            : "Publicar (libera para atribuir a alunos)"
                        }
                        onClick={() => handleToggleStatus(plano)}
                      >
                        {plano.status === "published" ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        aria-label={`Editar ${plano.name}`}
                        title="Editar"
                        onClick={() => abrirEditar(plano)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2 text-red-600 hover:bg-danger-subtle"
                        aria-label={`Excluir ${plano.name}`}
                        title="Excluir"
                        onClick={() => setDeleting(plano)}
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

      {formOpen ? (
        <PlanoFormModal
          plano={editing}
          cursos={cursos}
          appsDisponivel={appsDisponivel}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={`Excluir o plano "${deleting?.name}"?`}
        description="Só é possível excluir planos sem nenhum aluno vinculado (inclusive histórico). Esta ação não pode ser desfeita."
      />
    </div>
  );
}

function PlanoFormModal({
  plano,
  cursos,
  appsDisponivel,
  onClose,
  onSaved,
}: {
  plano: AdminPlano | null;
  cursos: AdminCursoOpcao[];
  appsDisponivel: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [permissive, setPermissive] = useState(plano?.permissive ?? false);
  const [courseIds, setCourseIds] = useState<number[]>(plano?.course_ids ?? []);
  // Plano novo nasce liberando os apps — é o comportamento de hoje.
  const [appsIncluded, setAppsIncluded] = useState(plano?.apps_included ?? true);

  function alternarCurso(id: number) {
    setCourseIds((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id],
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const input: PlanoInput = {
      name: String(fd.get("name") ?? ""),
      slug: String(fd.get("slug") ?? ""),
      description: String(fd.get("description") ?? ""),
      duration_months: String(fd.get("duration_months") ?? ""),
      mentorship_credits: String(fd.get("mentorship_credits") ?? ""),
      credit_period: fd.get("credit_period") === "month" ? "month" : "total",
      permissive,
      status: fd.get("status") === "published" ? "published" : "draft",
      course_ids: courseIds,
      apps_included: appsIncluded,
    };

    startTransition(async () => {
      const res = plano ? await salvarPlano(plano.id, input) : await criarPlano(input);
      if (res.ok) {
        toast({
          title: plano ? "Plano atualizado!" : "Plano criado!",
          description: res.message,
        });
        onSaved();
      } else {
        toast({ title: "Erro ao salvar", description: res.error, variant: "error" });
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={plano ? `Editar plano — ${plano.name}` : "Novo plano"}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="plano-name">Nome *</Label>
            <Input
              id="plano-name"
              name="name"
              required
              maxLength={120}
              defaultValue={plano?.name ?? ""}
              placeholder="Ex.: Trimestral"
            />
          </div>
          <div>
            <Label htmlFor="plano-slug">Identificador</Label>
            <Input
              id="plano-slug"
              name="slug"
              maxLength={60}
              defaultValue={plano?.slug ?? ""}
              placeholder="gerado a partir do nome"
              className="font-mono"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="plano-description">Descrição</Label>
          <Textarea
            id="plano-description"
            name="description"
            rows={2}
            defaultValue={plano?.description ?? ""}
            placeholder="O que este plano dá ao aluno."
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-card border border-border bg-surface-sunken px-4 py-3">
          <input
            type="checkbox"
            checked={permissive}
            onChange={(event) => setPermissive(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-gold-500"
          />
          <span>
            <span className="block text-sm font-medium text-primary">
              Plano permissivo (acesso total)
            </span>
            <span className="mt-0.5 block text-sm text-secondary">
              Catálogo inteiro, mentorias ilimitadas e sem prazo de expiração —
              inclusive para cursos criados depois. É o que o plano “Legado” usa
              para preservar o acesso de quem já era aluno.
            </span>
          </span>
        </label>

        {permissive ? null : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="plano-duration">Duração (meses)</Label>
                <Input
                  id="plano-duration"
                  name="duration_months"
                  type="number"
                  min={1}
                  max={240}
                  step={1}
                  defaultValue={plano?.duration_months ?? ""}
                  placeholder="vazio = sem prazo"
                />
              </div>
              <div>
                <Label htmlFor="plano-credits">Horas de mentoria</Label>
                <Input
                  id="plano-credits"
                  name="mentorship_credits"
                  type="number"
                  min={0}
                  max={100000}
                  step={1}
                  defaultValue={plano?.mentorship_credits ?? ""}
                  placeholder="vazio = ilimitado"
                />
              </div>
              <div>
                <Label htmlFor="plano-period">Cota vale</Label>
                <Select
                  id="plano-period"
                  name="credit_period"
                  defaultValue={plano?.credit_period ?? "total"}
                >
                  <option value="total">No total do plano</option>
                  <option value="month">Por mês</option>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="plano-cursos">Cursos inclusos</Label>
              {cursos.length === 0 ? (
                <p
                  id="plano-cursos"
                  className="rounded-card border border-border bg-surface-sunken px-4 py-3 text-sm text-secondary"
                >
                  Nenhum curso cadastrado ainda. Crie cursos em Universidade IA
                  para poder incluí-los em um plano.
                </p>
              ) : (
                <div
                  id="plano-cursos"
                  className="max-h-52 overflow-y-auto rounded-card border border-border bg-surface-sunken p-1"
                >
                  {cursos.map((curso) => (
                    <label
                      key={curso.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-hover"
                    >
                      <input
                        type="checkbox"
                        checked={courseIds.includes(curso.id)}
                        onChange={() => alternarCurso(curso.id)}
                        className="size-4 shrink-0 accent-gold-500"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-primary">
                        {curso.title}
                      </span>
                      {curso.status === "draft" ? (
                        <Badge variant="outline">Rascunho</Badge>
                      ) : null}
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-tertiary">
                Sem nenhum curso marcado, o plano não libera nada do catálogo.
              </p>
            </div>

            {/* Apps e Templates — liga/desliga do plano INTEIRO (86ajrgzef).
                Não há seleção app a app de propósito: "todos" precisa valer
                também para os apps publicados depois. */}
            {appsDisponivel ? (
              <div>
                <Label htmlFor="plano-apps">Sistemas (apps e templates)</Label>
                <label
                  htmlFor="plano-apps"
                  className="flex cursor-pointer items-start gap-3 rounded-card border border-border bg-surface-sunken px-4 py-3"
                >
                  <input
                    id="plano-apps"
                    type="checkbox"
                    // Nome acessível curto e estável: sem ele, os DOIS <label>
                    // que apontam para este input (o do campo e o do texto
                    // explicativo) se concatenam num nome ilegível.
                    aria-label="Liberar todos os sistemas"
                    checked={appsIncluded}
                    onChange={(event) => setAppsIncluded(event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-gold-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-primary">
                      Liberar todos os sistemas
                    </span>
                    <span className="mt-0.5 block text-sm text-secondary">
                      {appsIncluded
                        ? "O aluno acessa a área de Sistemas inteira, inclusive os que forem publicados depois."
                        : "O aluno NÃO acessa nenhum sistema: a área fica bloqueada, com o motivo explicado na tela."}
                    </span>
                  </span>
                </label>
              </div>
            ) : null}
          </>
        )}

        <div>
          <Label htmlFor="plano-status">Status</Label>
          <Select id="plano-status" name="status" defaultValue={plano?.status ?? "draft"}>
            <option value="draft">Rascunho (não pode ser atribuído)</option>
            <option value="published">Publicado</option>
          </Select>
        </div>

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : plano ? "Salvar alterações" : "Criar plano"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
