"use client";

// Admin > Universidade IA > Vitrine do catálogo — CRUD das prateleiras + a
// composição manual de cada uma, com preview de como fica para o aluno.
// Co-locado com a rota (como admin-nav.tsx e o painel de flags): é o chrome de
// uma tela só, não um componente de conteúdo reutilizável.

import { useMemo, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  LayoutList,
  MousePointerClick,
  Pencil,
  Plus,
  Trash2,
  X,
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
  useToast,
} from "@/components/ui";
import {
  adicionarCursoNaRail,
  alternarRail,
  criarRail,
  excluirRail,
  moverCursoNaRail,
  moverRail,
  removerCursoDaRail,
  salvarRail,
  type RailInput,
} from "@/app/admin/trainings/rails/actions";

export type AdminRail = {
  id: number;
  slug: string;
  title: string;
  mode: "manual" | "todos" | "top" | "em_breve";
  card_style: "rank" | "poster";
  icon: string;
  item_limit: number | null;
  clickable: boolean;
  sort_order: number;
  enabled: boolean;
  /** Cursos escolhidos à mão, na ordem das posições (só vale em mode=manual). */
  slot_course_ids: number[];
  /** Composição EFETIVA já resolvida no servidor (modo + limite aplicados). */
  preview_course_ids: number[];
  /** Título com o `{n}` trocado pela quantidade efetiva. */
  preview_title: string;
};

export type AdminRailCourse = {
  id: number;
  title: string;
  status: "draft" | "published";
  /** publicado, mas ainda sem nenhuma aula publicada. */
  comingSoon: boolean;
};

const MODE_LABEL: Record<AdminRail["mode"], string> = {
  manual: "Escolha manual",
  todos: "Todos os cursos",
  top: "Cursos com aulas",
  em_breve: "Cursos sem aulas (em breve)",
};

const MODE_HINT: Record<AdminRail["mode"], string> = {
  manual:
    "Você monta a lista curso a curso. Cadastrar um curso novo não muda esta prateleira.",
  todos: "O catálogo publicado inteiro, na ordem dos cursos.",
  top: "Todos os cursos publicados que já têm aula, na ordem dos cursos.",
  em_breve:
    "Todos os cursos publicados que ainda não têm aula. Entram e saem sozinhos.",
};

const CARD_STYLE_LABEL: Record<AdminRail["card_style"], string> = {
  rank: "Ranking (número gigante)",
  poster: "Pôster",
};

const ICON_OPTIONS: { value: string; label: string }[] = [
  { value: "trophy", label: "Troféu" },
  { value: "clock", label: "Relógio" },
  { value: "graduation", label: "Capelo" },
  { value: "sparkles", label: "Brilho" },
  { value: "flame", label: "Chama" },
  { value: "star", label: "Estrela" },
  { value: "layers", label: "Camadas" },
  { value: "bookmark", label: "Marcador" },
];

export function RailsManager({
  rails,
  cursos,
  flagLigada,
  migrationMissing,
}: {
  rails: AdminRail[];
  cursos: AdminRailCourse[];
  flagLigada: boolean;
  migrationMissing: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminRail | null>(null);
  const [deleting, setDeleting] = useState<AdminRail | null>(null);

  const cursoPorId = useMemo(
    () => new Map(cursos.map((curso) => [curso.id, curso])),
    [cursos],
  );

  if (migrationMissing) {
    return (
      <EmptyState
        icon={<LayoutList className="h-6 w-6" />}
        title="Banco ainda não preparado"
        description="As tabelas das prateleiras (migration db/migrations/0013-course-rails.sql) ainda não foram aplicadas neste ambiente. Enquanto isso, a Universidade IA segue com as prateleiras fixas do código."
      />
    );
  }

  function abrirCriar() {
    setEditing(null);
    setFormOpen(true);
  }

  function rodar(acao: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) {
    startTransition(async () => {
      const res = await acao();
      if (res.ok) {
        if (res.message) toast({ title: res.message });
        router.refresh();
      } else {
        toast({ title: "Não deu certo", description: res.error, variant: "error" });
      }
    });
  }

  async function handleDelete() {
    if (!deleting) return;
    const res = await excluirRail(deleting.id);
    if (res.ok) {
      toast({ title: res.message ?? "Prateleira excluída." });
      router.refresh();
    } else {
      toast({ title: "Erro ao excluir", description: res.error, variant: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {!flagLigada ? (
        <div className="rounded-card border border-border bg-surface-sunken px-5 py-4">
          <p className="text-sm font-medium text-primary">
            As prateleiras ainda não estão no ar.
          </p>
          <p className="mt-1 text-sm text-secondary">
            O aluno continua vendo as prateleiras fixas de sempre. Monte tudo
            aqui com calma e, quando estiver do jeito que você quer, ligue a
            chave <code className="font-mono text-xs">course_rails_enabled</code>{" "}
            em{" "}
            <Link href="/admin/settings" className="text-primary underline">
              Configurações
            </Link>
            .
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-end">
        <Button onClick={abrirCriar}>
          <Plus className="h-4 w-4" />
          Nova prateleira
        </Button>
      </div>

      {rails.length === 0 ? (
        <EmptyState
          icon={<LayoutList className="h-6 w-6" />}
          title="Nenhuma prateleira configurada"
          description="Crie a primeira prateleira para montar a vitrine da Universidade IA. Enquanto não houver nenhuma no ar, o aluno vê as prateleiras fixas de sempre."
          action={
            <Button onClick={abrirCriar}>
              <Plus className="h-4 w-4" />
              Criar prateleira
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {rails.map((rail, index) => (
            <RailCard
              key={rail.id}
              rail={rail}
              index={index}
              total={rails.length}
              cursos={cursos}
              cursoPorId={cursoPorId}
              pending={pending}
              onEditar={() => {
                setEditing(rail);
                setFormOpen(true);
              }}
              onExcluir={() => setDeleting(rail)}
              rodar={rodar}
            />
          ))}
        </div>
      )}

      {formOpen ? (
        <RailFormModal
          rail={editing}
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
        title={`Excluir a prateleira "${deleting?.title}"?`}
        description="A prateleira e a lista de cursos dela somem. Nenhum curso é apagado — eles continuam no catálogo."
      />
    </div>
  );
}

/* ── uma prateleira ───────────────────────────────────────────────────────── */

function RailCard({
  rail,
  index,
  total,
  cursos,
  cursoPorId,
  pending,
  onEditar,
  onExcluir,
  rodar,
}: {
  rail: AdminRail;
  index: number;
  total: number;
  cursos: AdminRailCourse[];
  cursoPorId: Map<number, AdminRailCourse>;
  pending: boolean;
  onEditar: () => void;
  onExcluir: () => void;
  rodar: (
    acao: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>,
  ) => void;
}) {
  const [novoCurso, setNovoCurso] = useState("");

  const disponiveis = cursos.filter((curso) => !rail.slot_course_ids.includes(curso.id));
  const preview = rail.preview_course_ids
    .map((id) => cursoPorId.get(id))
    .filter((curso): curso is AdminRailCourse => curso !== undefined);

  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-card-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-primary">{rail.title}</h2>
            <Badge status={rail.enabled ? "success" : "neutral"}>
              {rail.enabled ? "No ar" : "Fora do ar"}
            </Badge>
            <code className="font-mono text-xs text-tertiary">{rail.slug}</code>
          </div>
          <p className="mt-1 text-sm text-secondary">
            {MODE_LABEL[rail.mode]} · {CARD_STYLE_LABEL[rail.card_style]} ·{" "}
            {rail.item_limit === null
              ? "sem limite"
              : `no máximo ${rail.item_limit} curso${rail.item_limit === 1 ? "" : "s"}`}
            {rail.clickable ? "" : " · cards não clicáveis"}
          </p>
          <p className="mt-1 text-xs text-tertiary">{MODE_HINT[rail.mode]}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            aria-label={`Mover ${rail.title} para cima`}
            title="Subir"
            disabled={pending || index === 0}
            onClick={() => rodar(() => moverRail(rail.id, "up"))}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            aria-label={`Mover ${rail.title} para baixo`}
            title="Descer"
            disabled={pending || index === total - 1}
            onClick={() => rodar(() => moverRail(rail.id, "down"))}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            aria-label={rail.enabled ? `Tirar ${rail.title} do ar` : `Colocar ${rail.title} no ar`}
            title={rail.enabled ? "Tirar do ar" : "Colocar no ar"}
            disabled={pending}
            onClick={() => rodar(() => alternarRail(rail.id))}
          >
            {rail.enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            aria-label={`Editar ${rail.title}`}
            title="Editar"
            onClick={onEditar}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="px-2 text-red-600 hover:bg-danger-subtle"
            aria-label={`Excluir ${rail.title}`}
            title="Excluir"
            onClick={onExcluir}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* composição manual — só faz sentido no modo "escolha manual" */}
      {rail.mode === "manual" ? (
        <div className="mt-5 rounded-card border border-border-subtle bg-surface-sunken p-4">
          <p className="font-mono text-2xs uppercase tracking-ultra text-tertiary">
            Cursos escolhidos
          </p>

          {rail.slot_course_ids.length === 0 ? (
            <p className="mt-2 text-sm text-secondary">
              Nenhum curso escolhido ainda — enquanto ficar assim, a prateleira
              não aparece para o aluno.
            </p>
          ) : (
            <ol className="mt-2 flex flex-col gap-1">
              {rail.slot_course_ids.map((courseId, position) => {
                const curso = cursoPorId.get(courseId);
                return (
                  <li
                    key={courseId}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-hover"
                  >
                    <span className="w-6 shrink-0 font-mono text-xs text-tertiary">
                      {position + 1}.
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-primary">
                      {curso?.title ?? `Curso #${courseId} (removido do catálogo)`}
                    </span>
                    {curso?.status === "draft" ? (
                      <Badge variant="outline">Rascunho</Badge>
                    ) : null}
                    {curso?.comingSoon ? <Badge variant="outline">Sem aulas</Badge> : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2"
                      aria-label={`Subir ${curso?.title ?? courseId}`}
                      title="Subir"
                      disabled={pending || position === 0}
                      onClick={() => rodar(() => moverCursoNaRail(rail.id, courseId, "up"))}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2"
                      aria-label={`Descer ${curso?.title ?? courseId}`}
                      title="Descer"
                      disabled={pending || position === rail.slot_course_ids.length - 1}
                      onClick={() => rodar(() => moverCursoNaRail(rail.id, courseId, "down"))}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2 text-red-600 hover:bg-danger-subtle"
                      aria-label={`Tirar ${curso?.title ?? courseId} da prateleira`}
                      title="Tirar da prateleira"
                      disabled={pending}
                      onClick={() => rodar(() => removerCursoDaRail(rail.id, courseId))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Label htmlFor={`rail-${rail.id}-add`}>Adicionar curso</Label>
              <Select
                id={`rail-${rail.id}-add`}
                value={novoCurso}
                onChange={(event) => setNovoCurso(event.target.value)}
                disabled={pending || disponiveis.length === 0}
              >
                <option value="">
                  {disponiveis.length === 0
                    ? "Todos os cursos já estão nesta prateleira"
                    : "Selecione um curso…"}
                </option>
                {disponiveis.map((curso) => (
                  <option key={curso.id} value={curso.id}>
                    {curso.title}
                    {curso.status === "draft" ? " (rascunho)" : ""}
                    {curso.comingSoon ? " · sem aulas" : ""}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="secondary"
              disabled={pending || !novoCurso}
              onClick={() => {
                const courseId = Number(novoCurso);
                if (!Number.isInteger(courseId) || courseId <= 0) return;
                setNovoCurso("");
                rodar(() => adicionarCursoNaRail(rail.id, courseId));
              }}
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>
        </div>
      ) : null}

      {/* preview da composição efetiva — o que o aluno vê */}
      <div className="mt-4 rounded-card border border-border-subtle bg-surface-sunken p-4">
        <p className="font-mono text-2xs uppercase tracking-ultra text-tertiary">
          Como fica para o aluno
        </p>
        {preview.length === 0 ? (
          <p className="mt-2 text-sm text-secondary">
            Nenhum curso entra nesta prateleira hoje — ela simplesmente não
            aparece na página do aluno.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm font-semibold text-primary">
              {rail.preview_title}
            </p>
            <ol className="mt-2 flex flex-wrap gap-2">
              {preview.map((curso, position) => (
                <li
                  key={curso.id}
                  className="inline-flex items-center gap-2 rounded-chip border border-border bg-surface px-3 py-1 text-sm text-secondary"
                >
                  <span className="font-mono text-xs text-tertiary">{position + 1}</span>
                  <span className="truncate">{curso.title}</span>
                </li>
              ))}
            </ol>
            {rail.clickable ? null : (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-tertiary">
                <MousePointerClick aria-hidden className="h-3.5 w-3.5" />
                Os cards desta prateleira não abrem o curso.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ── formulário ───────────────────────────────────────────────────────────── */

function RailFormModal({
  rail,
  onClose,
  onSaved,
}: {
  rail: AdminRail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<AdminRail["mode"]>(rail?.mode ?? "manual");
  const [clickable, setClickable] = useState(rail?.clickable ?? true);
  const [enabled, setEnabled] = useState(rail?.enabled ?? true);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const input: RailInput = {
      title: String(fd.get("title") ?? ""),
      slug: String(fd.get("slug") ?? ""),
      mode,
      card_style: fd.get("card_style") === "rank" ? "rank" : "poster",
      icon: String(fd.get("icon") ?? "graduation"),
      item_limit: String(fd.get("item_limit") ?? ""),
      clickable,
      enabled,
    };

    startTransition(async () => {
      const res = rail ? await salvarRail(rail.id, input) : await criarRail(input);
      if (res.ok) {
        toast({
          title: rail ? "Prateleira atualizada!" : "Prateleira criada!",
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
      title={rail ? `Editar prateleira — ${rail.title}` : "Nova prateleira"}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="rail-title">Título *</Label>
            <Input
              id="rail-title"
              name="title"
              required
              maxLength={120}
              defaultValue={rail?.title ?? ""}
              placeholder="Ex.: Top {n} cursos no Brasil"
            />
            <p className="mt-1 text-xs text-tertiary">
              Escreva <code className="font-mono">{"{n}"}</code> onde quiser
              mostrar quantos cursos a prateleira tem.
            </p>
          </div>
          <div>
            <Label htmlFor="rail-slug">Identificador</Label>
            <Input
              id="rail-slug"
              name="slug"
              maxLength={60}
              defaultValue={rail?.slug ?? ""}
              placeholder="gerado a partir do título"
              className="font-mono"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="rail-mode">Quais cursos entram *</Label>
          <Select
            id="rail-mode"
            name="mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as AdminRail["mode"])}
          >
            <option value="manual">{MODE_LABEL.manual}</option>
            <option value="todos">{MODE_LABEL.todos}</option>
            <option value="top">{MODE_LABEL.top}</option>
            <option value="em_breve">{MODE_LABEL.em_breve}</option>
          </Select>
          <p className="mt-1 text-xs text-tertiary">{MODE_HINT[mode]}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="rail-card-style">Estilo do card</Label>
            <Select
              id="rail-card-style"
              name="card_style"
              defaultValue={rail?.card_style ?? "poster"}
            >
              <option value="rank">{CARD_STYLE_LABEL.rank}</option>
              <option value="poster">{CARD_STYLE_LABEL.poster}</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="rail-icon">Ícone</Label>
            <Select id="rail-icon" name="icon" defaultValue={rail?.icon ?? "graduation"}>
              {ICON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="rail-limit">Mostrar no máximo</Label>
            <Input
              id="rail-limit"
              name="item_limit"
              type="number"
              min={1}
              max={24}
              step={1}
              defaultValue={rail?.item_limit ?? ""}
              placeholder="vazio = todos"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-card border border-border bg-surface-sunken px-4 py-3">
          <input
            type="checkbox"
            checked={clickable}
            onChange={(event) => setClickable(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-gold-500"
          />
          <span>
            <span className="block text-sm font-medium text-primary">
              Os cards abrem o curso
            </span>
            <span className="mt-0.5 block text-sm text-secondary">
              Desmarque em prateleiras de anúncio, como “Em breve”: o curso
              aparece na vitrine, mas o aluno não consegue entrar nele.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-card border border-border bg-surface-sunken px-4 py-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-gold-500"
          />
          <span>
            <span className="block text-sm font-medium text-primary">
              Prateleira no ar
            </span>
            <span className="mt-0.5 block text-sm text-secondary">
              Desmarcada, ela fica guardada aqui e não aparece para o aluno.
            </span>
          </span>
        </label>

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : rail ? "Salvar alterações" : "Criar prateleira"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
