"use client";

// Admin > Capacitações — tabela de cursos com CRUD completo (Story 1.6).
// Criar/editar em Modal; excluir com ConfirmDialog; reordenar com ↑↓;
// publicar/despublicar rápido; link "Gerenciar aulas".

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GraduationCap,
  LayoutList,
  ListOrdered,
  Pencil,
  Plus,
  Trash2,
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
import {
  alternarStatusCurso,
  excluirCurso,
  moverCurso,
  salvarCurso,
  type CourseInput,
} from "@/app/admin/trainings/actions";
import { CoverUploadField } from "@/components/admin-conteudo/cover-upload-field";
import { StatusBadge } from "@/components/admin-conteudo/status-badge";

export type AdminCourse = {
  id: number;
  title: string;
  description: string | null;
  cover_url: string | null;
  release_type: "immediate" | "after_days";
  release_after_days: number;
  sort_order: number;
  status: "draft" | "published";
  modules_count: number;
  lessons_count: number;
};

export function CoursesManager({ courses }: { courses: AdminCourse[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCourse | null>(null);
  const [releaseType, setReleaseType] = useState<"immediate" | "after_days">("immediate");
  const [deleting, setDeleting] = useState<AdminCourse | null>(null);

  function abrirCriar() {
    setEditing(null);
    setReleaseType("immediate");
    setFormOpen(true);
  }

  function abrirEditar(course: AdminCourse) {
    setEditing(course);
    setReleaseType(course.release_type);
    setFormOpen(true);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: CourseInput = {
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? ""),
      cover_url: String(fd.get("cover_url") ?? ""),
      release_type: releaseType,
      release_after_days: Number(fd.get("release_after_days") ?? 0),
      status: fd.get("status") === "published" ? "published" : "draft",
    };
    const id = editing?.id ?? null;
    startTransition(async () => {
      const res = await salvarCurso(id, input);
      if (res.ok) {
        toast({ title: id ? "Curso atualizado!" : "Curso criado!" });
        setFormOpen(false);
        router.refresh();
      } else {
        toast({ title: "Erro ao salvar", description: res.error, variant: "error" });
      }
    });
  }

  function handleToggleStatus(course: AdminCourse) {
    startTransition(async () => {
      const res = await alternarStatusCurso(course.id);
      if (res.ok) {
        toast({
          title:
            course.status === "published" ? "Curso despublicado." : "Curso publicado!",
          description:
            course.status === "published"
              ? "Ele deixou de aparecer para os alunos."
              : "Já está visível para os alunos.",
        });
        router.refresh();
      } else {
        toast({ title: "Erro", description: res.error, variant: "error" });
      }
    });
  }

  function handleMove(course: AdminCourse, direction: "up" | "down") {
    startTransition(async () => {
      const res = await moverCurso(course.id, direction);
      if (res.ok) router.refresh();
      else toast({ title: "Erro", description: res.error, variant: "error" });
    });
  }

  async function handleDelete() {
    if (!deleting) return;
    const res = await excluirCurso(deleting.id);
    if (res.ok) {
      toast({
        title: "Curso excluído.",
        description: "Módulos, aulas e progresso relacionados também foram removidos.",
      });
      router.refresh();
    } else {
      toast({ title: "Erro ao excluir", description: res.error, variant: "error" });
    }
  }

  const releaseLabel = (c: AdminCourse) =>
    c.release_type === "after_days"
      ? `Após ${c.release_after_days} ${c.release_after_days === 1 ? "dia" : "dias"}`
      : "Imediata";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-display text-primary">
            Capacitações
          </h1>
          <p className="mt-1 text-base text-secondary">
            Crie, ordene e publique os cursos da plataforma.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/admin/trainings/rails">
            <Button variant="secondary">
              <LayoutList className="h-4 w-4" />
              Vitrine do catálogo
            </Button>
          </Link>
          <Button onClick={abrirCriar}>
            <Plus className="h-4 w-4" />
            Novo curso
          </Button>
        </div>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title="Nenhum curso ainda"
          description="Crie o primeiro curso para começar a montar as capacitações."
          action={
            <Button onClick={abrirCriar}>
              <Plus className="h-4 w-4" />
              Criar curso
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-table border border-border bg-surface shadow-card-sm">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle font-mono text-2xs uppercase tracking-ultra text-tertiary">
                <th className="px-4 py-3 font-medium">Curso</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Liberação</th>
                <th className="px-4 py-3 font-medium">Conteúdo</th>
                <th className="px-4 py-3 font-medium">Ordem</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course, index) => (
                <tr
                  key={course.id}
                  className="border-b border-border-subtle last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-20 shrink-0">
                        <CoverImage
                          src={course.cover_url}
                          title={course.title}
                          aspect="portrait"
                          className="rounded-lg"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-primary">
                          {course.title}
                        </p>
                        {course.description && (
                          <p className="max-w-xs truncate text-xs text-tertiary">
                            {course.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={course.status} />
                  </td>
                  <td className="px-4 py-3 text-secondary">{releaseLabel(course)}</td>
                  <td className="px-4 py-3 text-secondary">
                    {course.modules_count}{" "}
                    {course.modules_count === 1 ? "módulo" : "módulos"} ·{" "}
                    {course.lessons_count} {course.lessons_count === 1 ? "aula" : "aulas"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        aria-label={`Mover ${course.title} para cima`}
                        disabled={pending || index === 0}
                        onClick={() => handleMove(course, "up")}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        aria-label={`Mover ${course.title} para baixo`}
                        disabled={pending || index === courses.length - 1}
                        onClick={() => handleMove(course, "down")}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/trainings/${course.id}/lessons`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-button px-2.5 text-xs font-semibold text-text-accent transition-colors hover:bg-accent-subtle"
                      >
                        <ListOrdered className="h-4 w-4" />
                        Gerenciar aulas
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        disabled={pending}
                        aria-label={
                          course.status === "published"
                            ? `Despublicar ${course.title}`
                            : `Publicar ${course.title}`
                        }
                        title={course.status === "published" ? "Despublicar" : "Publicar"}
                        onClick={() => handleToggleStatus(course)}
                      >
                        {course.status === "published" ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        aria-label={`Editar ${course.title}`}
                        title="Editar"
                        onClick={() => abrirEditar(course)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2 text-red-600 hover:bg-danger-subtle"
                        aria-label={`Excluir ${course.title}`}
                        title="Excluir"
                        onClick={() => setDeleting(course)}
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
        title={editing ? "Editar curso" : "Novo curso"}
        size="lg"
      >
        <form
          key={editing?.id ?? "novo"}
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <div>
            <Label htmlFor="curso-title">Título *</Label>
            <Input
              id="curso-title"
              name="title"
              required
              defaultValue={editing?.title ?? ""}
              placeholder="Ex.: Automação com IA"
            />
          </div>
          <div>
            <Label htmlFor="curso-description">Descrição</Label>
            <Textarea
              id="curso-description"
              name="description"
              rows={3}
              defaultValue={editing?.description ?? ""}
              placeholder="O que o aluno vai aprender neste curso?"
            />
          </div>
          <CoverUploadField
            id="curso-cover"
            label="Capa do curso"
            kind="course-cover"
            defaultValue={editing?.cover_url ?? ""}
            previewTitle={editing?.title ?? "Curso"}
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="curso-release">Liberação</Label>
              <Select
                id="curso-release"
                name="release_type"
                value={releaseType}
                onChange={(e) =>
                  setReleaseType(e.target.value === "after_days" ? "after_days" : "immediate")
                }
              >
                <option value="immediate">Imediata</option>
                <option value="after_days">Após X dias do cadastro</option>
              </Select>
            </div>
            {releaseType === "after_days" && (
              <div>
                <Label htmlFor="curso-dias">Liberar após (dias) *</Label>
                <Input
                  id="curso-dias"
                  name="release_after_days"
                  type="number"
                  min={1}
                  required
                  defaultValue={
                    editing && editing.release_after_days > 0
                      ? editing.release_after_days
                      : 30
                  }
                />
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="curso-status">Status</Label>
            <Select
              id="curso-status"
              name="status"
              defaultValue={editing?.status ?? "draft"}
            >
              <option value="draft">Rascunho (invisível para alunos)</option>
              <option value="published">Publicado</option>
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
              {pending ? "Salvando…" : editing ? "Salvar alterações" : "Criar curso"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={`Excluir "${deleting?.title}"?`}
        description="Todos os módulos, aulas, materiais e o progresso dos alunos neste curso serão excluídos. Esta ação não pode ser desfeita."
      />
    </div>
  );
}
