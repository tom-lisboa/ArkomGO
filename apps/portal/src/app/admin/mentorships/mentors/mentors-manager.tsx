"use client";

// Admin > Mentorias > Mentores — cadastro dos mentores (Tarefa 2, 0014).
// Lista com foto, ordem da vitrine e status; formulário em <Modal> com o
// <CoverUploadField> em corte 1:1 (kind "mentor-photo" → covers/mentors).
// Co-locado com a rota, como em /admin/trainings/rails e /admin/settings.

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import {
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
import { CoverUploadField } from "@/components/admin-conteudo/cover-upload-field";
import { StatusBadge } from "@/components/admin-conteudo/status-badge";
import {
  alternarStatusMentor,
  atualizarMentor,
  criarMentor,
  excluirMentor,
  moverMentor,
  type MentorInput,
} from "@/app/admin/mentorships/mentors/actions";

export type AdminMentor = {
  id: number;
  slug: string;
  full_name: string;
  specialty: string | null;
  bio: string | null;
  photo_url: string | null;
  status: "draft" | "published";
  sort_order: number;
  /** Em quantos eventos ele está vinculado (só leitura). */
  events_count: number;
};

export function MentorsManager({
  mentores,
  flagLigada,
  migrationMissing,
}: {
  mentores: AdminMentor[];
  /** `mentors_enabled` — a vitrine do aluno está no ar? */
  flagLigada: boolean;
  migrationMissing: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<AdminMentor | null>(null);
  const [excluindo, setExcluindo] = useState<AdminMentor | null>(null);

  if (migrationMissing) {
    return (
      <EmptyState
        icon={<UsersRound className="h-6 w-6" />}
        title="Banco ainda não preparado"
        description="A migration db/migrations/0014-mentors.sql ainda não foi aplicada neste ambiente. Enquanto isso, a página de mentorias do aluno segue exatamente como está."
      />
    );
  }

  function abrirCriar() {
    setEditando(null);
    setFormOpen(true);
  }

  function abrirEditar(mentor: AdminMentor) {
    setEditando(mentor);
    setFormOpen(true);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: MentorInput = {
      full_name: String(fd.get("full_name") ?? ""),
      specialty: String(fd.get("specialty") ?? ""),
      bio: String(fd.get("bio") ?? ""),
      photo_url: String(fd.get("photo_url") ?? ""),
      status: fd.get("status") === "published" ? "published" : "draft",
    };
    const id = editando?.id ?? null;
    startTransition(async () => {
      const res = id ? await atualizarMentor(id, input) : await criarMentor(input);
      if (res.ok) {
        toast({ title: id ? "Mentor atualizado!" : "Mentor cadastrado!" });
        setFormOpen(false);
        router.refresh();
      } else {
        toast({ title: "Erro ao salvar", description: res.error, variant: "error" });
      }
    });
  }

  function handleToggle(mentor: AdminMentor) {
    startTransition(async () => {
      const res = await alternarStatusMentor(mentor.id);
      if (res.ok) {
        toast({
          title:
            mentor.status === "published" ? "Mentor despublicado." : "Mentor publicado!",
          description: res.message,
        });
        router.refresh();
      } else {
        toast({ title: "Erro", description: res.error, variant: "error" });
      }
    });
  }

  function handleMover(mentor: AdminMentor, direcao: -1 | 1) {
    startTransition(async () => {
      const res = await moverMentor(mentor.id, direcao);
      if (res.ok) router.refresh();
      else toast({ title: "Erro ao reordenar", description: res.error, variant: "error" });
    });
  }

  async function handleExcluir() {
    if (!excluindo) return;
    const res = await excluirMentor(excluindo.id);
    if (res.ok) {
      toast({ title: "Mentor excluído." });
      router.refresh();
    } else {
      toast({ title: "Erro ao excluir", description: res.error, variant: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary">
          {flagLigada
            ? "A vitrine de mentores está no ar para os alunos."
            : "A vitrine ainda está desligada para os alunos (Configurações › Mentores na página do aluno). Cadastrar e vincular funciona normalmente enquanto isso."}
        </p>
        <Button onClick={abrirCriar} disabled={pending}>
          <UserRoundPlus className="h-4 w-4" />
          Novo mentor
        </Button>
      </div>

      {mentores.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="h-6 w-6" />}
          title="Nenhum mentor cadastrado"
          description="Cadastre os mentores com nome, especialidade, descrição e foto. Eles aparecem na página de mentorias do aluno e podem ser vinculados a cada encontro."
          action={
            <Button onClick={abrirCriar}>
              <UserRoundPlus className="h-4 w-4" />
              Cadastrar mentor
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {mentores.map((mentor, index) => (
            <li
              key={mentor.id}
              className="flex gap-3 rounded-card border border-border bg-surface p-3 shadow-card-sm"
            >
              <div className="w-[84px] shrink-0">
                <CoverImage
                  src={mentor.photo_url}
                  title={mentor.full_name}
                  aspect="square"
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-primary">
                    {mentor.full_name}
                  </p>
                  <StatusBadge status={mentor.status} />
                </div>
                <p className="truncate text-xs text-secondary">
                  {mentor.specialty || "Sem especialidade cadastrada"}
                </p>
                <p className="font-mono text-2xs uppercase tracking-ultra text-tertiary">
                  {mentor.events_count === 0
                    ? "Sem encontros vinculados"
                    : `${mentor.events_count} encontro${mentor.events_count === 1 ? "" : "s"}`}
                </p>

                <div className="mt-auto flex flex-wrap items-center gap-1 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    title="Subir na vitrine"
                    aria-label={`Subir ${mentor.full_name}`}
                    disabled={pending || index === 0}
                    onClick={() => handleMover(mentor, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    title="Descer na vitrine"
                    aria-label={`Descer ${mentor.full_name}`}
                    disabled={pending || index === mentores.length - 1}
                    onClick={() => handleMover(mentor, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    title={mentor.status === "published" ? "Despublicar" : "Publicar"}
                    aria-label={
                      mentor.status === "published"
                        ? `Despublicar ${mentor.full_name}`
                        : `Publicar ${mentor.full_name}`
                    }
                    disabled={pending}
                    onClick={() => handleToggle(mentor)}
                  >
                    {mentor.status === "published" ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    title="Editar"
                    aria-label={`Editar ${mentor.full_name}`}
                    disabled={pending}
                    onClick={() => abrirEditar(mentor)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2 text-red-600 hover:bg-danger-subtle"
                    title="Excluir"
                    aria-label={`Excluir ${mentor.full_name}`}
                    disabled={pending}
                    onClick={() => setExcluindo(mentor)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editando ? "Editar mentor" : "Novo mentor"}
        size="lg"
      >
        <form
          key={editando?.id ?? "novo"}
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <div>
            <Label htmlFor="mentor-nome">Nome *</Label>
            <Input
              id="mentor-nome"
              name="full_name"
              required
              maxLength={120}
              defaultValue={editando?.full_name ?? ""}
              placeholder="Ex.: Carolina Prado"
            />
          </div>

          <div>
            <Label htmlFor="mentor-especialidade">Especialidade</Label>
            <Input
              id="mentor-especialidade"
              name="specialty"
              maxLength={120}
              defaultValue={editando?.specialty ?? ""}
              placeholder="Ex.: Tráfego pago e funis de venda"
            />
            <p className="mt-1 text-xs text-tertiary">
              Uma linha curta, exibida abaixo do nome na vitrine do aluno.
            </p>
          </div>

          <div>
            <Label htmlFor="mentor-bio">Descrição</Label>
            <Textarea
              id="mentor-bio"
              name="bio"
              rows={5}
              maxLength={4000}
              defaultValue={editando?.bio ?? ""}
              placeholder="Quem é o mentor, o que ele já fez e no que ele ajuda o aluno."
            />
          </div>

          <CoverUploadField
            id="mentor-foto"
            label="Foto do mentor"
            name="photo_url"
            kind="mentor-photo"
            defaultValue={editando?.photo_url ?? ""}
            previewTitle={editando?.full_name ?? "Mentor"}
            previewAspect="square"
            cropAspect={1}
            cropOutput={{ width: 640, height: 640 }}
            cropTitle="Ajuste a foto do mentor"
          />

          <div>
            <Label htmlFor="mentor-status">Status</Label>
            <Select
              id="mentor-status"
              name="status"
              defaultValue={editando?.status ?? "published"}
            >
              <option value="published">Publicado (aparece para os alunos)</option>
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
              {pending ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar mentor"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!excluindo}
        onClose={() => setExcluindo(null)}
        onConfirm={handleExcluir}
        title={`Excluir "${excluindo?.full_name}"?`}
        description={
          excluindo
            ? `O cadastro sai da vitrine e o vínculo com ${excluindo.events_count} encontro(s) é desfeito. Nenhuma confirmação, presença ou crédito de aluno é alterado. Para só tirar o mentor do ar, use "Despublicar".`
            : undefined
        }
      />
    </div>
  );
}
