"use client";

// Admin > Apps e Soluções — tabela com CRUD + gestão de categorias (Story 1.6).
// Criar/editar em Modal; excluir com ConfirmDialog; publicar/despublicar rápido.
// Categorias: criar, renomear e reordenar (↑↓) num modal dedicado.

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  MousePointerClick,
  Pencil,
  Plus,
  Star,
  Tags,
  Trash2,
} from "lucide-react";
import {
  Button,
  Badge,
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
import {
  alternarStatusApp,
  excluirApp,
  moverCategoria,
  salvarApp,
  salvarCategoria,
  type AppInput,
} from "@/app/admin/apps/actions";
import { StatusBadge } from "@/components/admin-conteudo/status-badge";

type AppAvailability = "available" | "coming_soon";
const APP_COMING_SOON_LABEL = "Em breve";
const APP_COMING_SOON_REDIRECT_PREFIX = "coming-soon:";

function normalizeAppAvailability(value: unknown): AppAvailability {
  return value === "coming_soon" ? "coming_soon" : "available";
}

function isAppAvailable(app: {
  availability?: string | null;
  redirect_url?: string | null;
}): boolean {
  if (app.availability) {
    return normalizeAppAvailability(app.availability) === "available";
  }
  return !app.redirect_url?.startsWith(APP_COMING_SOON_REDIRECT_PREFIX);
}

export type AdminApp = {
  id: number;
  category_id: number;
  title: string;
  tagline: string | null;
  description: string | null;
  cover_url: string | null;
  video_provider: "youtube" | "panda" | null;
  video_url: string | null;
  button_label: string;
  redirect_url: string | null;
  availability: AppAvailability;
  sort_order: number;
  status: "draft" | "published";
  category_name: string;
  clicks: number;
  avg_rating: number | null;
};

export type AdminCategory = {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  apps_count: number;
};

export function AppsManager({
  apps,
  categories,
}: {
  apps: AdminApp[];
  categories: AdminCategory[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminApp | null>(null);
  const [provider, setProvider] = useState<"youtube" | "panda">("youtube");
  const [availability, setAvailability] = useState<AppAvailability>("available");
  const [deleting, setDeleting] = useState<AdminApp | null>(null);
  const [catOpen, setCatOpen] = useState(false);

  function abrirCriar() {
    if (categories.length === 0) {
      toast({
        title: "Crie uma categoria primeiro",
        description: "Toda solução precisa de uma categoria.",
        variant: "error",
      });
      setCatOpen(true);
      return;
    }
    setEditing(null);
    setProvider("youtube");
    setAvailability("available");
    setFormOpen(true);
  }

  function abrirEditar(app: AdminApp) {
    setEditing(app);
    setProvider(app.video_provider === "panda" ? "panda" : "youtube");
    setAvailability(normalizeAppAvailability(app.availability));
    setFormOpen(true);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: AppInput = {
      category_id: Number(fd.get("category_id") ?? 0),
      title: String(fd.get("title") ?? ""),
      tagline: String(fd.get("tagline") ?? ""),
      description: String(fd.get("description") ?? ""),
      cover_url: String(fd.get("cover_url") ?? ""),
      video_provider: provider,
      video_url: String(fd.get("video_url") ?? ""),
      button_label: String(fd.get("button_label") ?? ""),
      redirect_url: String(fd.get("redirect_url") ?? ""),
      availability: normalizeAppAvailability(fd.get("availability")),
      sort_order: Number(fd.get("sort_order") ?? 0),
      status: fd.get("status") === "published" ? "published" : "draft",
    };
    const id = editing?.id ?? null;
    startTransition(async () => {
      const res = await salvarApp(id, input);
      if (res.ok) {
        toast({ title: id ? "Solução atualizada!" : "Solução criada!" });
        setFormOpen(false);
        router.refresh();
      } else {
        toast({ title: "Erro ao salvar", description: res.error, variant: "error" });
      }
    });
  }

  function handleToggleStatus(app: AdminApp) {
    startTransition(async () => {
      const res = await alternarStatusApp(app.id);
      if (res.ok) {
        toast({
          title: app.status === "published" ? "Solução despublicada." : "Solução publicada!",
          description:
            app.status === "published"
              ? "Deixou de aparecer para os alunos."
              : "Já está visível para os alunos.",
        });
        router.refresh();
      } else {
        toast({ title: "Erro", description: res.error, variant: "error" });
      }
    });
  }

  async function handleDelete() {
    if (!deleting) return;
    const res = await excluirApp(deleting.id);
    if (res.ok) {
      toast({ title: "Solução excluída.", description: "Avaliações e cliques também foram removidos." });
      router.refresh();
    } else {
      toast({ title: "Erro ao excluir", description: res.error, variant: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-display text-primary">Apps e Soluções</h1>
          <p className="mt-1 text-base text-secondary">
            Gerencie as soluções do ecossistema, categorias, cliques e avaliações.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setCatOpen(true)}>
            <Tags className="h-4 w-4" /> Categorias
          </Button>
          <Button onClick={abrirCriar}>
            <Plus className="h-4 w-4" /> Nova solução
          </Button>
        </div>
      </div>

      {apps.length === 0 ? (
        <EmptyState
          icon={<AppIcon />}
          title="Nenhuma solução cadastrada"
          description="Crie a primeira solução para exibi-la aos alunos."
          action={<Button onClick={abrirCriar}>Nova solução</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-table border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-navy-50 text-left font-mono text-3xs uppercase tracking-widest text-tertiary">
                <th className="px-4 py-3 font-medium">Solução</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Cliques</th>
                <th className="px-4 py-3 text-right font-medium">Estrelas</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id} className="border-b border-border-subtle last:border-0 even:bg-navy-50 hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-16 shrink-0 overflow-hidden rounded-md">
                        <CoverImage
                          src={app.cover_url}
                          title={app.title}
                          locked={!isAppAvailable(app)}
                          lockedLabel={!isAppAvailable(app) ? APP_COMING_SOON_LABEL : undefined}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-primary">{app.title}</p>
                        {app.tagline && (
                          <p className="truncate text-xs text-tertiary">{app.tagline}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-secondary">{app.category_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge status={app.status} />
                      {!isAppAvailable(app) && (
                        <Badge status="warning" dot>
                          {APP_COMING_SOON_LABEL}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center justify-end gap-1 font-mono text-sm text-primary">
                      <MousePointerClick className="h-3.5 w-3.5 text-tertiary" />
                      {app.clicks}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {app.avg_rating != null ? (
                      <span className="inline-flex items-center justify-end gap-1 font-mono text-sm text-primary">
                        <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                        {app.avg_rating.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        title={app.status === "published" ? "Despublicar" : "Publicar"}
                        onClick={() => handleToggleStatus(app)}
                        disabled={pending}
                      >
                        {app.status === "published" ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </IconButton>
                      <IconButton title="Editar" onClick={() => abrirEditar(app)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton title="Excluir" onClick={() => setDeleting(app)} danger>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td
                  colSpan={6}
                  className="border-t border-border-subtle bg-surface-sunken px-4 py-3 font-mono text-2xs tracking-wider text-secondary"
                >
                  {apps.length} soluç{apps.length === 1 ? "ão" : "ões"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Modal criar/editar solução */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Editar solução" : "Nova solução"}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="title">Título</Label>
            <Input id="title" name="title" defaultValue={editing?.title ?? ""} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category_id">Categoria</Label>
              <Select id="category_id" name="category_id" defaultValue={String(editing?.category_id ?? categories[0]?.id ?? "")}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue={editing?.status ?? "draft"}>
                <option value="draft">Rascunho</option>
                <option value="published">Publicado</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="availability">Disponibilidade</Label>
            <Select
              id="availability"
              name="availability"
              value={availability}
              onChange={(e) =>
                setAvailability(normalizeAppAvailability(e.target.value))
              }
            >
              <option value="available">Liberado para acesso</option>
              <option value="coming_soon">Em breve com cadeado</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="tagline">Tagline (categoria exibida no detalhe)</Label>
            <Input id="tagline" name="tagline" defaultValue={editing?.tagline ?? ""} />
          </div>
          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea id="description" name="description" rows={3} defaultValue={editing?.description ?? ""} />
          </div>
          <CoverUploadField
            id="app-cover"
            label="Capa da solução"
            kind="app-cover"
            defaultValue={editing?.cover_url ?? ""}
            previewTitle={editing?.title ?? "Solução"}
          />
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="video_provider">Vídeo</Label>
              <Select
                id="video_provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as "youtube" | "panda")}
              >
                <option value="youtube">YouTube</option>
                <option value="panda">Panda</option>
              </Select>
            </div>
            <div className="col-span-2">
              <Label htmlFor="video_url">URL/embed do tutorial</Label>
              <Input id="video_url" name="video_url" defaultValue={editing?.video_url ?? ""} placeholder="https://..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="button_label">Texto do botão</Label>
              <Input id="button_label" name="button_label" defaultValue={editing?.button_label ?? "Acessar solução"} />
            </div>
            <div>
              <Label htmlFor="sort_order">Ordem</Label>
              <Input id="sort_order" name="sort_order" type="number" defaultValue={editing?.sort_order ?? 0} />
            </div>
          </div>
          <div>
            <Label htmlFor="redirect_url">URL de redirecionamento (acesso/remix)</Label>
            <Input
              id="redirect_url"
              name="redirect_url"
              defaultValue={editing?.redirect_url ?? ""}
              required={availability === "available"}
              placeholder={
                availability === "available"
                  ? "https://..."
                  : "Opcional enquanto estiver em breve"
              }
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal de categorias */}
      <CategoriesModal
        open={catOpen}
        onClose={() => setCatOpen(false)}
        categories={categories}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Excluir solução?"
        description={`"${deleting?.title}" será removida, junto de suas avaliações e cliques. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
      />
    </div>
  );
}

function CategoriesModal({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: AdminCategory[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [novoNome, setNovoNome] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");

  function criar() {
    if (!novoNome.trim()) return;
    startTransition(async () => {
      const res = await salvarCategoria(null, novoNome);
      if (res.ok) {
        toast({ title: "Categoria criada!" });
        setNovoNome("");
        router.refresh();
      } else {
        toast({ title: "Erro", description: res.error, variant: "error" });
      }
    });
  }

  function renomear(id: number) {
    startTransition(async () => {
      const res = await salvarCategoria(id, editNome);
      if (res.ok) {
        toast({ title: "Categoria atualizada!" });
        setEditId(null);
        router.refresh();
      } else {
        toast({ title: "Erro", description: res.error, variant: "error" });
      }
    });
  }

  function mover(id: number, direction: "up" | "down") {
    startTransition(async () => {
      const res = await moverCategoria(id, direction);
      if (res.ok) router.refresh();
      else toast({ title: "Erro", description: res.error, variant: "error" });
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Categorias">
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="nova_categoria">Nova categoria</Label>
            <Input
              id="nova_categoria"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Ex.: Agentes"
            />
          </div>
          <Button onClick={criar} disabled={pending || !novoNome.trim()}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>

        {categories.length === 0 ? (
          <p className="text-sm text-secondary">Nenhuma categoria ainda.</p>
        ) : (
          <ul className="divide-y divide-border-subtle rounded-lg border border-border">
            {categories.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                {editId === c.id ? (
                  <>
                    <Input
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      className="flex-1"
                    />
                    <Button size="sm" onClick={() => renomear(c.id)} disabled={pending}>
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-primary">
                      {c.name}{" "}
                      <span className="font-mono text-xs text-tertiary">
                        ({c.apps_count})
                      </span>
                    </span>
                    <IconButton
                      title="Subir"
                      onClick={() => mover(c.id, "up")}
                      disabled={pending || i === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      title="Descer"
                      onClick={() => mover(c.id, "down")}
                      disabled={pending || i === categories.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      title="Renomear"
                      onClick={() => {
                        setEditId(c.id);
                        setEditNome(c.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function IconButton({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40 ${
        danger ? "hover:bg-danger-subtle hover:text-red-600" : "hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function AppIcon() {
  return <MousePointerClick className="h-6 w-6" />;
}
