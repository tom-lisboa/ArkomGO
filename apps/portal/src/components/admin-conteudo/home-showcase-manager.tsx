"use client";

// Admin > Home — config única da home do aluno: banner do topo + vitrine
// "Soluções em destaque". Um form salva a config (home_settings id=1); os
// cards da vitrine (home_featured_slots) têm CRUD imediato: adicionar app,
// reordenar (↑↓), editar overrides (título/texto/capa/cor/link) e remover.
// Campo em branco = herda o padrão (i18n / cadastro do app) — os placeholders
// mostram o valor herdado.

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Home,
  Pencil,
  Plus,
  Sparkles,
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
import { CoverUploadField } from "@/components/admin-conteudo/cover-upload-field";
import { StatusBadge } from "@/components/admin-conteudo/status-badge";
import {
  adicionarDestaque,
  moverDestaque,
  removerDestaque,
  salvarConfigHome,
  salvarDestaque,
  type DestaqueInput,
  type HomeConfigInput,
} from "@/app/admin/home/actions";

export type AdminHomeSettings = {
  featured_title: string | null;
  featured_subtitle: string | null;
  featured_limit: number;
  banner_enabled: boolean;
  banner_image_url: string | null;
  banner_pill: string | null;
  banner_title: string | null;
  banner_description: string | null;
  banner_cta_label: string | null;
  banner_cta_href: string | null;
};

export type AdminFeaturedSlot = {
  id: number;
  app_id: number;
  title: string | null;
  strap: string | null;
  cover_url: string | null;
  accent: string | null;
  href: string | null;
  app_title: string;
  app_tagline: string | null;
  app_cover_url: string | null;
  app_status: "draft" | "published";
};

export type AdminPickerApp = {
  id: number;
  title: string;
  status: string;
  clicks: number;
};

// Defaults em vigor no /home (mesmos fallbacks do home-body). O form vem
// PRÉ-PREENCHIDO com o valor efetivo — o admin vê o que o aluno vê e edita por
// cima; apagar o campo e salvar volta ao padrão (null no banco = fallback).
const DEFAULT_FEATURED_TITLE = "Soluções em destaque";
const DEFAULT_FEATURED_SUBTITLE = "Os apps e templates mais usados pela comunidade";
const DEFAULT_BANNER_PILL = "Soluções em destaque";
const DEFAULT_BANNER_IMAGE = "/trainings/claude-code.png";
const DEFAULT_BANNER_TITLE = "Claude Code";
const DEFAULT_BANNER_DESCRIPTION = "Programe com IA agentiva — do terminal ao deploy";
const DEFAULT_BANNER_CTA_LABEL = "Ver capacitações";
const DEFAULT_BANNER_CTA_HREF = "/trainings/claude-code";
const DEFAULT_ACCENT = "#c9a84c";

export function HomeShowcaseManager({
  settings,
  slots,
  apps,
  migrationMissing,
}: {
  settings: AdminHomeSettings | null;
  slots: AdminFeaturedSlot[];
  apps: AdminPickerApp[];
  migrationMissing: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [bannerEnabled, setBannerEnabled] = useState(
    settings?.banner_enabled ?? true
  );
  const [editing, setEditing] = useState<AdminFeaturedSlot | null>(null);
  const [deleting, setDeleting] = useState<AdminFeaturedSlot | null>(null);
  const [novoAppId, setNovoAppId] = useState<string>("");

  if (migrationMissing) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader />
        <EmptyState
          icon={<Home className="h-6 w-6" />}
          title="Banco ainda não preparado"
          description="As tabelas da home (migration db/migrations/0009-home-showcase.sql) ainda não foram aplicadas neste ambiente. Aplique a migration e recarregue a página."
        />
      </div>
    );
  }

  const slottedIds = new Set(slots.map((s) => s.app_id));
  const availableApps = apps.filter((a) => !slottedIds.has(a.id));

  function handleSaveConfig(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: HomeConfigInput = {
      featured_title: String(fd.get("featured_title") ?? ""),
      featured_subtitle: String(fd.get("featured_subtitle") ?? ""),
      featured_limit: Number(fd.get("featured_limit") ?? 4),
      banner_enabled: bannerEnabled,
      banner_image_url: String(fd.get("banner_image_url") ?? ""),
      banner_pill: String(fd.get("banner_pill") ?? ""),
      banner_title: String(fd.get("banner_title") ?? ""),
      banner_description: String(fd.get("banner_description") ?? ""),
      banner_cta_label: String(fd.get("banner_cta_label") ?? ""),
      banner_cta_href: String(fd.get("banner_cta_href") ?? ""),
    };
    startTransition(async () => {
      const res = await salvarConfigHome(input);
      if (res.ok) {
        toast({ title: "Configuração salva!", description: "A home já reflete as mudanças." });
        router.refresh();
      } else {
        toast({ title: "Erro ao salvar", description: res.error, variant: "error" });
      }
    });
  }

  function handleAdd() {
    const id = Number(novoAppId);
    if (!id) return;
    startTransition(async () => {
      const res = await adicionarDestaque(id);
      if (res.ok) {
        toast({ title: "Solução adicionada à vitrine!" });
        setNovoAppId("");
        router.refresh();
      } else {
        toast({ title: "Erro", description: res.error, variant: "error" });
      }
    });
  }

  function handleMove(slot: AdminFeaturedSlot, direction: "up" | "down") {
    startTransition(async () => {
      const res = await moverDestaque(slot.id, direction);
      if (res.ok) router.refresh();
      else toast({ title: "Erro", description: res.error, variant: "error" });
    });
  }

  async function handleDelete() {
    if (!deleting) return;
    const res = await removerDestaque(deleting.id);
    if (res.ok) {
      toast({
        title: "Destaque removido.",
        description: "A vaga volta a ser preenchida automaticamente.",
      });
      router.refresh();
    } else {
      toast({ title: "Erro ao remover", description: res.error, variant: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader />

      {/* ── Config única (banner + copy/limite da vitrine) ─────────────── */}
      <form onSubmit={handleSaveConfig} className="flex flex-col gap-6">
        <section className="rounded-card border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-primary">Banner do topo</h2>
          <p className="mt-1 text-sm text-secondary">
            O destaque grande logo abaixo da saudação — os campos já mostram o
            que está no ar; edite por cima. Apagar um campo e salvar volta ao
            padrão (capacitação Claude Code).
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <div className="max-w-[240px]">
              <Label htmlFor="banner_enabled">Exibição</Label>
              <Select
                id="banner_enabled"
                value={bannerEnabled ? "on" : "off"}
                onChange={(e) => setBannerEnabled(e.target.value === "on")}
              >
                <option value="on">Visível na home</option>
                <option value="off">Oculto</option>
              </Select>
            </div>
            {/* corte travado na faixa do banner da home (~1124×190 → 6:1) */}
            <CoverUploadField
              id="banner-image"
              label="Imagem do banner"
              name="banner_image_url"
              kind="app-cover"
              defaultValue={settings?.banner_image_url ?? DEFAULT_BANNER_IMAGE}
              previewTitle="Banner"
              previewAspect="wide"
              cropAspect={6}
              cropOutput={{ width: 2280, height: 380 }}
              cropTitle="Corte do banner — faixa exibida na home"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="banner_pill">Selo (pílula)</Label>
                <Input
                  id="banner_pill"
                  name="banner_pill"
                  defaultValue={settings?.banner_pill ?? DEFAULT_BANNER_PILL}
                  placeholder={DEFAULT_BANNER_PILL}
                />
              </div>
              <div>
                <Label htmlFor="banner_title">Título</Label>
                <Input
                  id="banner_title"
                  name="banner_title"
                  defaultValue={settings?.banner_title ?? DEFAULT_BANNER_TITLE}
                  placeholder={DEFAULT_BANNER_TITLE}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="banner_description">Descrição</Label>
              <Textarea
                id="banner_description"
                name="banner_description"
                rows={2}
                defaultValue={settings?.banner_description ?? DEFAULT_BANNER_DESCRIPTION}
                placeholder={DEFAULT_BANNER_DESCRIPTION}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="banner_cta_label">Texto do link</Label>
                <Input
                  id="banner_cta_label"
                  name="banner_cta_label"
                  defaultValue={settings?.banner_cta_label ?? DEFAULT_BANNER_CTA_LABEL}
                  placeholder={DEFAULT_BANNER_CTA_LABEL}
                />
              </div>
              <div>
                <Label htmlFor="banner_cta_href">Destino do link</Label>
                <Input
                  id="banner_cta_href"
                  name="banner_cta_href"
                  defaultValue={settings?.banner_cta_href ?? DEFAULT_BANNER_CTA_HREF}
                  placeholder={DEFAULT_BANNER_CTA_HREF}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-card border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-primary">
            Seção &quot;Soluções em destaque&quot;
          </h2>
          <p className="mt-1 text-sm text-secondary">
            Título, subtítulo e quantas vagas a vitrine tem. Vagas sem card
            escolhido são preenchidas automaticamente pelos apps mais clicados.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_140px]">
            <div>
              <Label htmlFor="featured_title">Título da seção</Label>
              <Input
                id="featured_title"
                name="featured_title"
                defaultValue={settings?.featured_title ?? DEFAULT_FEATURED_TITLE}
                placeholder={DEFAULT_FEATURED_TITLE}
              />
            </div>
            <div>
              <Label htmlFor="featured_subtitle">Subtítulo</Label>
              <Input
                id="featured_subtitle"
                name="featured_subtitle"
                defaultValue={settings?.featured_subtitle ?? DEFAULT_FEATURED_SUBTITLE}
                placeholder={DEFAULT_FEATURED_SUBTITLE}
              />
            </div>
            <div>
              <Label htmlFor="featured_limit">Vagas (1–12)</Label>
              <Input
                id="featured_limit"
                name="featured_limit"
                type="number"
                min={1}
                max={12}
                defaultValue={settings?.featured_limit ?? 4}
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : "Salvar configurações"}
          </Button>
        </div>
      </form>

      {/* ── Cards escolhidos da vitrine (CRUD imediato) ─────────────────── */}
      <section className="rounded-card border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-primary">Cards da vitrine</h2>
            <p className="mt-1 text-sm text-secondary">
              Aparecem primeiro, nesta ordem. Apps em rascunho não aparecem para
              os alunos mesmo escolhidos aqui.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-[220px]">
              <Label htmlFor="novo_destaque">Adicionar solução</Label>
              <Select
                id="novo_destaque"
                value={novoAppId}
                onChange={(e) => setNovoAppId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {availableApps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                    {a.status !== "published" ? " (rascunho)" : ""} · {a.clicks} cliques
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={pending || !novoAppId} type="button">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </div>

        {slots.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Sparkles className="h-6 w-6" />}
              title="Nenhum card escolhido"
              description="A vitrine está 100% automática (apps mais clicados). Adicione uma solução para fixá-la na frente."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border-subtle rounded-lg border border-border">
            {slots.map((slot, i) => {
              const cover = slot.cover_url ?? slot.app_cover_url;
              const accent = slot.accent ?? DEFAULT_ACCENT;
              return (
                <li key={slot.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="font-mono text-xs text-tertiary">{i + 1}º</span>
                  <div className="w-16 shrink-0 overflow-hidden rounded-md">
                    <CoverImage src={cover} title={slot.title ?? slot.app_title} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium text-primary">
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-full border border-border"
                        style={{ background: accent }}
                        title={slot.accent ? `Cor ${slot.accent}` : "Cor herdada"}
                      />
                      {slot.title?.trim() || slot.app_title}
                    </p>
                    <p className="truncate text-xs text-tertiary">
                      {slot.title?.trim() ? `app: ${slot.app_title} · ` : ""}
                      {slot.href?.trim() || `/apps/${slot.app_id}`}
                    </p>
                  </div>
                  <StatusBadge status={slot.app_status} />
                  <div className="flex items-center gap-1">
                    <IconButton
                      title="Subir"
                      onClick={() => handleMove(slot, "up")}
                      disabled={pending || i === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      title="Descer"
                      onClick={() => handleMove(slot, "down")}
                      disabled={pending || i === slots.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </IconButton>
                    <IconButton title="Editar card" onClick={() => setEditing(slot)}>
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      title="Remover da vitrine"
                      onClick={() => setDeleting(slot)}
                      danger
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing ? (
        <EditSlotModal slot={editing} onClose={() => setEditing(null)} />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Remover da vitrine?"
        description={`"${deleting?.title?.trim() || deleting?.app_title}" sai dos destaques da home (o app continua existindo). A vaga volta ao preenchimento automático.`}
        confirmLabel="Remover"
        danger
      />
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-display font-bold tracking-display text-primary">
        Home do aluno
      </h1>
      <p className="mt-1 text-base text-secondary">
        Controle o banner do topo e a vitrine &quot;Soluções em destaque&quot; da
        página inicial.
      </p>
    </div>
  );
}

/** Modal de overrides do card — vazio herda do cadastro do app. */
function EditSlotModal({
  slot,
  onClose,
}: {
  slot: AdminFeaturedSlot;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [accent, setAccent] = useState(slot.accent ?? "");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: DestaqueInput = {
      title: String(fd.get("title") ?? ""),
      strap: String(fd.get("strap") ?? ""),
      cover_url: String(fd.get("cover_url") ?? ""),
      accent,
      href: String(fd.get("href") ?? ""),
    };
    startTransition(async () => {
      const res = await salvarDestaque(slot.id, input);
      if (res.ok) {
        toast({ title: "Card atualizado!" });
        onClose();
        router.refresh();
      } else {
        toast({ title: "Erro ao salvar", description: res.error, variant: "error" });
      }
    });
  }

  const colorValue = /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent : DEFAULT_ACCENT;

  return (
    <Modal open onClose={onClose} title={`Card: ${slot.app_title}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-secondary">
          Campos em branco herdam o cadastro do app (Admin &gt; Apps).
        </p>
        <div>
          <Label htmlFor="slot_title">Título no card</Label>
          <Input
            id="slot_title"
            name="title"
            defaultValue={slot.title ?? ""}
            placeholder={slot.app_title}
          />
        </div>
        <div>
          <Label htmlFor="slot_strap">Texto do card</Label>
          <Textarea
            id="slot_strap"
            name="strap"
            rows={2}
            defaultValue={slot.strap ?? ""}
            placeholder={slot.app_tagline ?? "Texto curto exibido sob o título"}
          />
        </div>
        {/* corte travado no topo do card da vitrine (~266×132 → 2:1) */}
        <CoverUploadField
          id="slot-cover"
          label="Capa do card"
          name="cover_url"
          kind="app-cover"
          defaultValue={slot.cover_url ?? ""}
          previewTitle={slot.title ?? slot.app_title}
          cropAspect={2}
          cropOutput={{ width: 1064, height: 532 }}
          cropTitle="Corte da capa — área exibida no card da home"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="slot_accent">Cor de acento</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Escolher cor de acento"
                value={colorValue}
                onChange={(e) => setAccent(e.target.value.toUpperCase())}
                className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                disabled={pending}
              />
              <Input
                id="slot_accent"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                placeholder="Herdada (automática)"
              />
              {accent && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAccent("")}
                  disabled={pending}
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="slot_href">Link do card</Label>
            <Input
              id="slot_href"
              name="href"
              defaultValue={slot.href ?? ""}
              placeholder={`/apps/${slot.app_id}`}
            />
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
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
