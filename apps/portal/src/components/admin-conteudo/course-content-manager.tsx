"use client";

// Admin > Capacitações > Módulos e Aulas (Story 1.6).
// Módulos em ordem com suas aulas; CRUD + reordenação de módulos e aulas;
// mover aula entre módulos (select no form); gestão de materiais da aula.

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  FolderPlus,
  Layers,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  excluirAula,
  excluirMaterial,
  excluirModulo,
  moverAula,
  moverModulo,
  salvarAula,
  salvarMaterial,
  salvarModulo,
  type LessonInput,
  type ModuleInput,
  type ResourceInput,
} from "@/app/admin/trainings/[id]/lessons/actions";
import { AdminMediaUploadField } from "@/components/admin-conteudo/cover-upload-field";
import { StatusBadge } from "@/components/admin-conteudo/status-badge";

export type AdminCourseHeader = {
  id: number;
  title: string;
  status: "draft" | "published";
};

export type AdminModule = {
  id: number;
  title: string;
  description: string | null;
  sort_order: number;
  status: "draft" | "published";
};

export type AdminLesson = {
  id: number;
  module_id: number;
  title: string;
  description: string | null;
  video_provider: "youtube" | "panda";
  video_url: string;
  sort_order: number;
  status: "draft" | "published";
};

export type AdminResource = {
  id: number;
  lesson_id: number;
  title: string;
  resource_type: "pdf" | "image" | "zip" | "external_link";
  url: string;
  sort_order: number;
};

const RESOURCE_LABELS: Record<AdminResource["resource_type"], string> = {
  pdf: "PDF",
  image: "Imagem",
  zip: "ZIP",
  external_link: "Link externo",
};

const RESOURCE_ACCEPT: Record<AdminResource["resource_type"], string> = {
  pdf: "application/pdf",
  image: "image/avif,image/jpeg,image/png,image/webp",
  zip: "application/zip,application/x-zip-compressed",
  external_link: "",
};

export function CourseContentManager({
  course,
  modules,
  lessons,
  resources,
}: {
  course: AdminCourseHeader;
  modules: AdminModule[];
  lessons: AdminLesson[];
  resources: AdminResource[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Módulos
  const [moduleFormOpen, setModuleFormOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<AdminModule | null>(null);
  const [deletingModule, setDeletingModule] = useState<AdminModule | null>(null);

  // Aulas
  const [lessonFormOpen, setLessonFormOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<AdminLesson | null>(null);
  const [lessonModulePreset, setLessonModulePreset] = useState<number | null>(null);
  const [deletingLesson, setDeletingLesson] = useState<AdminLesson | null>(null);

  // Materiais
  const [resourcesLessonId, setResourcesLessonId] = useState<number | null>(null);
  const [editingResource, setEditingResource] = useState<AdminResource | null>(null);
  const [deletingResource, setDeletingResource] = useState<AdminResource | null>(null);
  const [resourceType, setResourceType] = useState<AdminResource["resource_type"]>("pdf");
  const [resourceFormVersion, setResourceFormVersion] = useState(0);

  const lessonsByModule = (moduleId: number) =>
    lessons.filter((l) => l.module_id === moduleId);
  const resourcesByLesson = (lessonId: number) =>
    resources.filter((r) => r.lesson_id === lessonId);

  const resourcesLesson =
    resourcesLessonId !== null
      ? lessons.find((l) => l.id === resourcesLessonId) ?? null
      : null;

  function feedback(res: { ok: boolean; error?: string }, successTitle: string) {
    if (res.ok) {
      toast({ title: successTitle });
      router.refresh();
      return true;
    }
    toast({ title: "Erro", description: res.error, variant: "error" });
    return false;
  }

  // ------------------------------------------------------------ Módulos
  function handleModuleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: ModuleInput = {
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? ""),
      status: fd.get("status") === "draft" ? "draft" : "published",
    };
    const id = editingModule?.id ?? null;
    startTransition(async () => {
      const res = await salvarModulo(course.id, id, input);
      if (feedback(res, id ? "Módulo atualizado!" : "Módulo criado!")) {
        setModuleFormOpen(false);
      }
    });
  }

  async function handleModuleDelete() {
    if (!deletingModule) return;
    const res = await excluirModulo(course.id, deletingModule.id);
    if (res.ok) {
      toast({
        title: "Módulo excluído.",
        description: "As aulas e materiais do módulo também foram removidos.",
      });
      router.refresh();
    } else {
      toast({ title: "Erro ao excluir", description: res.error, variant: "error" });
    }
  }

  function handleModuleMove(moduleId: number, direction: "up" | "down") {
    startTransition(async () => {
      const res = await moverModulo(course.id, moduleId, direction);
      if (res.ok) router.refresh();
      else toast({ title: "Erro", description: res.error, variant: "error" });
    });
  }

  // ------------------------------------------------------------ Aulas
  function abrirNovaAula(moduleId: number) {
    setEditingLesson(null);
    setLessonModulePreset(moduleId);
    setLessonFormOpen(true);
  }

  function abrirEditarAula(lesson: AdminLesson) {
    setEditingLesson(lesson);
    setLessonModulePreset(lesson.module_id);
    setLessonFormOpen(true);
  }

  function handleLessonSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: LessonInput = {
      module_id: Number(fd.get("module_id")),
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? ""),
      video_provider: fd.get("video_provider") === "panda" ? "panda" : "youtube",
      video_url: String(fd.get("video_url") ?? ""),
      status: fd.get("status") === "draft" ? "draft" : "published",
    };
    const id = editingLesson?.id ?? null;
    startTransition(async () => {
      const res = await salvarAula(course.id, id, input);
      if (feedback(res, id ? "Aula atualizada!" : "Aula criada!")) {
        setLessonFormOpen(false);
      }
    });
  }

  async function handleLessonDelete() {
    if (!deletingLesson) return;
    const res = await excluirAula(course.id, deletingLesson.id);
    if (res.ok) {
      toast({
        title: "Aula excluída.",
        description: "Materiais e progresso da aula também foram removidos.",
      });
      router.refresh();
    } else {
      toast({ title: "Erro ao excluir", description: res.error, variant: "error" });
    }
  }

  function handleLessonMove(lesson: AdminLesson, direction: "up" | "down") {
    startTransition(async () => {
      const res = await moverAula(course.id, lesson.module_id, lesson.id, direction);
      if (res.ok) router.refresh();
      else toast({ title: "Erro", description: res.error, variant: "error" });
    });
  }

  // ------------------------------------------------------------ Materiais
  function handleResourceSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (resourcesLessonId === null) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const input: ResourceInput = {
      title: String(fd.get("title") ?? ""),
      resource_type:
        (String(fd.get("resource_type")) as AdminResource["resource_type"]) ||
        "external_link",
      url: String(fd.get("url") ?? ""),
    };
    const id = editingResource?.id ?? null;
    startTransition(async () => {
      const res = await salvarMaterial(course.id, resourcesLessonId, id, input);
      if (feedback(res, id ? "Material atualizado!" : "Material adicionado!")) {
        setEditingResource(null);
        setResourceType("pdf");
        setResourceFormVersion((version) => version + 1);
        form.reset();
      }
    });
  }

  async function handleResourceDelete() {
    if (!deletingResource) return;
    const res = await excluirMaterial(course.id, deletingResource.id);
    if (res.ok) {
      toast({ title: "Material excluído." });
      router.refresh();
    } else {
      toast({ title: "Erro ao excluir", description: res.error, variant: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/trainings"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-500 transition-colors hover:text-link"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para Capacitações
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-display text-neutral-900">
              {course.title}
            </h1>
            <StatusBadge status={course.status} />
          </div>
          <p className="mt-1 text-base text-neutral-500">
            Organize os módulos e as aulas deste curso.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingModule(null);
            setModuleFormOpen(true);
          }}
        >
          <FolderPlus className="h-4 w-4" />
          Novo módulo
        </Button>
      </div>

      {modules.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title="Nenhum módulo ainda"
          description="Crie o primeiro módulo para começar a adicionar aulas."
          action={
            <Button
              onClick={() => {
                setEditingModule(null);
                setModuleFormOpen(true);
              }}
            >
              <FolderPlus className="h-4 w-4" />
              Criar módulo
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {modules.map((module, moduleIndex) => {
            const moduleLessons = lessonsByModule(module.id);
            return (
              <Card key={module.id}>
                <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-5 pb-4">
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5"
                        aria-label={`Mover módulo ${module.title} para cima`}
                        disabled={pending || moduleIndex === 0}
                        onClick={() => handleModuleMove(module.id, "up")}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5"
                        aria-label={`Mover módulo ${module.title} para baixo`}
                        disabled={pending || moduleIndex === modules.length - 1}
                        onClick={() => handleModuleMove(module.id, "down")}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-neutral-900">
                          {moduleIndex + 1}. {module.title}
                        </h2>
                        <StatusBadge status={module.status} />
                      </div>
                      {module.description && (
                        <p className="mt-0.5 text-sm text-neutral-500">
                          {module.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => abrirNovaAula(module.id)}
                    >
                      <Plus className="h-4 w-4" />
                      Nova aula
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2"
                      aria-label={`Editar módulo ${module.title}`}
                      title="Editar módulo"
                      onClick={() => {
                        setEditingModule(module);
                        setModuleFormOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2 text-danger hover:bg-danger-subtle"
                      aria-label={`Excluir módulo ${module.title}`}
                      title="Excluir módulo"
                      onClick={() => setDeletingModule(module)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-2 p-5 pt-4">
                  {moduleLessons.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-5 text-center text-sm text-neutral-400">
                      Nenhuma aula neste módulo ainda.
                    </p>
                  ) : (
                    moduleLessons.map((lesson, lessonIndex) => {
                      const lessonResources = resourcesByLesson(lesson.id);
                      return (
                        <div
                          key={lesson.id}
                          className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-sunken px-3 py-2"
                        >
                          <div className="flex shrink-0 items-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-1.5"
                              aria-label={`Mover aula ${lesson.title} para cima`}
                              disabled={pending || lessonIndex === 0}
                              onClick={() => handleLessonMove(lesson, "up")}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-1.5"
                              aria-label={`Mover aula ${lesson.title} para baixo`}
                              disabled={pending || lessonIndex === moduleLessons.length - 1}
                              onClick={() => handleLessonMove(lesson, "down")}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-neutral-900">
                              {lessonIndex + 1}. {lesson.title}
                            </p>
                            <p className="truncate text-xs text-neutral-400">
                              {lesson.video_url}
                            </p>
                          </div>
                          <Badge variant={lesson.video_provider === "youtube" ? "danger" : "default"}>
                            {lesson.video_provider === "youtube" ? "YouTube" : "Panda"}
                          </Badge>
                          <StatusBadge status={lesson.status} />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 px-2 text-neutral-600"
                            title="Gerenciar materiais"
                            onClick={() => {
                              setResourcesLessonId(lesson.id);
                              setEditingResource(null);
                            }}
                          >
                            <Paperclip className="h-4 w-4" />
                            <span className="text-xs font-semibold">
                              {lessonResources.length}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="px-2"
                            aria-label={`Editar aula ${lesson.title}`}
                            title="Editar aula"
                            onClick={() => abrirEditarAula(lesson)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="px-2 text-danger hover:bg-danger-subtle"
                            aria-label={`Excluir aula ${lesson.title}`}
                            title="Excluir aula"
                            onClick={() => setDeletingLesson(lesson)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------------------------------------------------------- Modal módulo */}
      <Modal
        open={moduleFormOpen}
        onClose={() => setModuleFormOpen(false)}
        title={editingModule ? "Editar módulo" : "Novo módulo"}
      >
        <form
          key={editingModule?.id ?? "novo-modulo"}
          onSubmit={handleModuleSubmit}
          className="flex flex-col gap-4"
        >
          <div>
            <Label htmlFor="modulo-title">Título *</Label>
            <Input
              id="modulo-title"
              name="title"
              required
              defaultValue={editingModule?.title ?? ""}
              placeholder="Ex.: Fundamentos"
            />
          </div>
          <div>
            <Label htmlFor="modulo-description">Descrição</Label>
            <Textarea
              id="modulo-description"
              name="description"
              rows={2}
              defaultValue={editingModule?.description ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="modulo-status">Status</Label>
            <Select
              id="modulo-status"
              name="status"
              defaultValue={editingModule?.status ?? "published"}
            >
              <option value="published">Publicado</option>
              <option value="draft">Rascunho (invisível para alunos)</option>
            </Select>
          </div>
          <div className="mt-2 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModuleFormOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : editingModule ? "Salvar alterações" : "Criar módulo"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---------------------------------------------------------- Modal aula */}
      <Modal
        open={lessonFormOpen}
        onClose={() => setLessonFormOpen(false)}
        title={editingLesson ? "Editar aula" : "Nova aula"}
        size="lg"
      >
        <form
          key={editingLesson?.id ?? `nova-aula-${lessonModulePreset}`}
          onSubmit={handleLessonSubmit}
          className="flex flex-col gap-4"
        >
          <div>
            <Label htmlFor="aula-modulo">Módulo *</Label>
            <Select
              id="aula-modulo"
              name="module_id"
              required
              defaultValue={lessonModulePreset ?? modules[0]?.id}
            >
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </Select>
            {editingLesson && (
              <p className="mt-1 text-xs text-neutral-500">
                Selecione outro módulo para mover esta aula (ela entra no fim do módulo
                destino).
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="aula-title">Título *</Label>
            <Input
              id="aula-title"
              name="title"
              required
              defaultValue={editingLesson?.title ?? ""}
              placeholder="Ex.: Introdução ao módulo"
            />
          </div>
          <div>
            <Label htmlFor="aula-description">Descrição</Label>
            <Textarea
              id="aula-description"
              name="description"
              rows={3}
              defaultValue={editingLesson?.description ?? ""}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="aula-provider">Player</Label>
              <Select
                id="aula-provider"
                name="video_provider"
                defaultValue={editingLesson?.video_provider ?? "youtube"}
              >
                <option value="youtube">YouTube</option>
                <option value="panda">Panda</option>
              </Select>
            </div>
            <div className="col-span-2">
              <Label htmlFor="aula-video">URL do vídeo *</Label>
              <Input
                id="aula-video"
                name="video_url"
                required
                defaultValue={editingLesson?.video_url ?? ""}
                placeholder="Cole a URL do vídeo"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="aula-status">Status</Label>
            <Select
              id="aula-status"
              name="status"
              defaultValue={editingLesson?.status ?? "published"}
            >
              <option value="published">Publicada</option>
              <option value="draft">Rascunho (invisível para alunos)</option>
            </Select>
          </div>
          <div className="mt-2 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLessonFormOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : editingLesson ? "Salvar alterações" : "Criar aula"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---------------------------------------------------------- Modal materiais */}
      <Modal
        open={resourcesLessonId !== null}
        onClose={() => {
          setResourcesLessonId(null);
          setEditingResource(null);
          setResourceType("pdf");
        }}
        title={
          resourcesLesson
            ? `Materiais — ${resourcesLesson.title}`
            : "Materiais da aula"
        }
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <p className="text-base text-neutral-500">
            Os materiais aparecem para o aluno como botões de redirecionamento abaixo do
            vídeo da aula.
          </p>

          {resourcesLessonId !== null &&
            (resourcesByLesson(resourcesLessonId).length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-5 text-center text-sm text-neutral-400">
                Nenhum material nesta aula ainda.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {resourcesByLesson(resourcesLessonId).map((resource) => (
                  <div
                    key={resource.id}
                    className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-sunken px-3 py-2"
                  >
                    <Badge variant="outline">
                      {RESOURCE_LABELS[resource.resource_type]}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-neutral-900">
                        {resource.title}
                      </p>
                      <p className="truncate text-xs text-neutral-400">{resource.url}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2"
                      aria-label={`Editar material ${resource.title}`}
                      title="Editar material"
                      onClick={() => {
                        setEditingResource(resource);
                        setResourceType(resource.resource_type);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2 text-danger hover:bg-danger-subtle"
                      aria-label={`Excluir material ${resource.title}`}
                      title="Excluir material"
                      onClick={() => setDeletingResource(resource)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ))}

          <form
            key={`${editingResource?.id ?? "novo-material"}-${resourceFormVersion}`}
            onSubmit={handleResourceSubmit}
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          >
            <p className="text-sm font-bold text-neutral-900">
              {editingResource ? "Editar material" : "Adicionar material"}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label htmlFor="material-title">Título *</Label>
                <Input
                  id="material-title"
                  name="title"
                  required
                  defaultValue={editingResource?.title ?? ""}
                  placeholder="Ex.: Apostila do módulo"
                />
              </div>
              <div>
                <Label htmlFor="material-type">Tipo</Label>
                <Select
                  id="material-type"
                  name="resource_type"
                  value={resourceType}
                  onChange={(event) =>
                    setResourceType(event.target.value as AdminResource["resource_type"])
                  }
                >
                  <option value="pdf">PDF</option>
                  <option value="image">Imagem</option>
                  <option value="zip">ZIP</option>
                  <option value="external_link">Link externo</option>
                </Select>
              </div>
            </div>
            {resourceType === "external_link" ? (
              <div>
                <Label htmlFor="material-url">URL *</Label>
                <Input
                  id="material-url"
                  name="url"
                  type="url"
                  required
                  defaultValue={editingResource?.url ?? ""}
                  placeholder="https://..."
                />
              </div>
            ) : (
              <AdminMediaUploadField
                id="material-url"
                name="url"
                label="Arquivo do material *"
                kind="lesson-resource"
                defaultValue={editingResource?.url ?? ""}
                preview="none"
                accept={RESOURCE_ACCEPT[resourceType]}
                placeholder="Cole uma URL ou envie um arquivo"
                uploadLabel="Enviar arquivo"
                helperText="PDF, imagem ou ZIP ate 5 MB. Materiais enviados ficam no bucket autenticado."
                required
              />
            )}
            <div className="flex justify-end gap-3">
              {editingResource && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditingResource(null);
                    setResourceType("pdf");
                  }}
                  disabled={pending}
                >
                  Cancelar edição
                </Button>
              )}
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Salvando…"
                  : editingResource
                    ? "Salvar material"
                    : "Adicionar material"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* ---------------------------------------------------------- Confirmações */}
      <ConfirmDialog
        open={!!deletingModule}
        onClose={() => setDeletingModule(null)}
        onConfirm={handleModuleDelete}
        title={`Excluir módulo "${deletingModule?.title}"?`}
        description="Todas as aulas, materiais e o progresso dos alunos neste módulo serão excluídos. Esta ação não pode ser desfeita."
      />
      <ConfirmDialog
        open={!!deletingLesson}
        onClose={() => setDeletingLesson(null)}
        onConfirm={handleLessonDelete}
        title={`Excluir aula "${deletingLesson?.title}"?`}
        description="Os materiais e o progresso dos alunos nesta aula serão excluídos. Esta ação não pode ser desfeita."
      />
      <ConfirmDialog
        open={!!deletingResource}
        onClose={() => setDeletingResource(null)}
        onConfirm={handleResourceDelete}
        title={`Excluir material "${deletingResource?.title}"?`}
        description="O botão deixará de aparecer para os alunos na aula. Esta ação não pode ser desfeita."
      />
    </div>
  );
}
