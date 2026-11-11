"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { FileUp, ImageUp, LinkIcon, X } from "lucide-react";
import {
  Button,
  CoverImage,
  Input,
  Label,
  useToast,
} from "@/components/ui";
import {
  uploadAdminMedia,
  type AdminMediaUploadKind,
} from "@/app/admin/media/actions";
import {
  ImageCropModal,
  type CropOutput,
} from "@/components/admin-conteudo/image-crop-modal";

type AdminMediaUploadFieldProps = {
  id: string;
  label: string;
  name?: string;
  kind: AdminMediaUploadKind;
  defaultValue?: string | null;
  previewTitle?: string;
  preview?: "cover" | "none";
  /** proporção do box do preview (default: portrait p/ course-cover, video p/ resto) */
  previewAspect?: "video" | "wide" | "portrait" | "square";
  /** liga o passo de corte: proporção da janela (largura/altura) */
  cropAspect?: number;
  /** dimensões-alvo do corte gerado (px) — obrigatório junto de cropAspect */
  cropOutput?: CropOutput;
  cropTitle?: string;
  accept?: string;
  uploadLabel?: string;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
};

const IMAGE_ACCEPT = "image/avif,image/jpeg,image/png,image/webp";
const RESOURCE_ACCEPT =
  "image/avif,image/jpeg,image/png,image/webp,application/pdf,application/zip,application/x-zip-compressed";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function acceptForKind(kind: AdminMediaUploadKind): string {
  return kind === "lesson-resource" ? RESOURCE_ACCEPT : IMAGE_ACCEPT;
}

function defaultHelperText(kind: AdminMediaUploadKind): string {
  return kind === "lesson-resource"
    ? "AVIF, JPG, PNG, WebP, PDF ou ZIP ate 5 MB. Arquivos enviados ficam no bucket autenticado."
    : "AVIF, JPG, PNG ou WebP ate 5 MB. Capas enviadas ficam no bucket autenticado.";
}

// Originais maiores são aceitos quando há corte: só o RECORTE (webp/jpeg
// comprimido) sobe pro bucket — o arquivo original nunca sai do navegador.
const MAX_CROP_SOURCE_BYTES = 20 * 1024 * 1024;

export function AdminMediaUploadField({
  id,
  label,
  name = "cover_url",
  kind,
  defaultValue,
  previewTitle = "Midia",
  preview = "cover",
  previewAspect,
  cropAspect,
  cropOutput,
  cropTitle,
  accept,
  uploadLabel,
  placeholder,
  helperText,
  required,
}: AdminMediaUploadFieldProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialMediaUrl = defaultValue ?? "";
  const [mediaState, setMediaState] = useState(() => ({
    source: initialMediaUrl,
    value: initialMediaUrl,
  }));
  const mediaUrl = mediaState.source === initialMediaUrl ? mediaState.value : initialMediaUrl;
  const setMediaUrl = (value: string) => {
    setMediaState({ source: initialMediaUrl, value });
  };
  const [pending, startTransition] = useTransition();
  const [cropFile, setCropFile] = useState<File | null>(null);
  const isResource = kind === "lesson-resource";
  const cropEnabled = cropAspect !== undefined && cropOutput !== undefined;
  const resolvedPreviewAspect =
    previewAspect ?? (kind === "course-cover" ? "portrait" : "video");

  function uploadFile(file: File) {
    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadAdminMedia(formData);
      if (result.ok) {
        setMediaUrl(result.url);
        toast({
          title: isResource ? "Arquivo enviado" : "Capa enviada",
          description: isResource
            ? "O arquivo foi vinculado ao formulario."
            : "A nova capa foi vinculada ao formulario.",
          variant: "success",
        });
      } else {
        toast({ title: "Erro no upload", description: result.error, variant: "error" });
      }
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    // Com corte ligado, o ajuste vem ANTES do upload (imagens apenas).
    if (cropEnabled && file.type.startsWith("image/")) {
      if (file.size > MAX_CROP_SOURCE_BYTES) {
        toast({
          title: "Arquivo muito grande",
          description: "Use uma imagem de ate 20 MB.",
          variant: "error",
        });
        return;
      }
      setCropFile(file);
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      toast({
        title: "Arquivo muito grande",
        description: "Use um arquivo de ate 5 MB.",
        variant: "error",
      });
      return;
    }
    uploadFile(file);
  }

  function handleCropped(file: File) {
    setCropFile(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({
        title: "Corte muito pesado",
        description: "O recorte passou de 5 MB — use uma imagem menor.",
        variant: "error",
      });
      return;
    }
    uploadFile(file);
  }

  const content = (
    <>
      {preview === "cover" && (
      <div className="overflow-hidden rounded-lg bg-surface">
        <CoverImage
          src={mediaUrl || null}
          title={previewTitle || "Capa"}
          aspect={resolvedPreviewAspect}
          className="rounded-lg"
        />
      </div>
      )}

      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        <div className="relative">
          <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary" />
          <Input
            id={id}
            name={name}
            type="text"
            value={mediaUrl}
            onChange={(event) => setMediaUrl(event.target.value)}
            className="pl-9"
            placeholder={placeholder ?? "Cole uma URL ou envie um arquivo"}
            required={required}
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={accept ?? acceptForKind(kind)}
            className="hidden"
            onChange={handleFileChange}
            disabled={pending}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending}
          >
            {isResource ? <FileUp className="h-4 w-4" /> : <ImageUp className="h-4 w-4" />}
            {pending ? "Enviando..." : uploadLabel ?? (isResource ? "Enviar arquivo" : "Enviar imagem")}
          </Button>
          {mediaUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMediaUrl("")}
              disabled={pending}
            >
              <X className="h-4 w-4" />
              Remover
            </Button>
          )}
        </div>

        <p className="mt-2 text-xs text-secondary">
          {helperText ?? defaultHelperText(kind)}
        </p>
      </div>
    </>
  );

  return (
    <div
      className={
        preview === "cover"
          ? "grid gap-3 rounded-card border border-border bg-surface-sunken p-3 sm:grid-cols-[150px_1fr]"
          : "rounded-card border border-border bg-surface-sunken p-3"
      }
    >
      {content}
      {cropFile && cropEnabled ? (
        <ImageCropModal
          file={cropFile}
          aspect={cropAspect!}
          output={cropOutput!}
          title={cropTitle}
          onCancel={() => setCropFile(null)}
          onCropped={handleCropped}
        />
      ) : null}
    </div>
  );
}

type CoverUploadFieldProps = Omit<
  AdminMediaUploadFieldProps,
  "preview" | "accept" | "uploadLabel" | "placeholder" | "helperText"
> & {
  previewTitle: string;
};

export function CoverUploadField(props: CoverUploadFieldProps) {
  return (
    <AdminMediaUploadField
      {...props}
      preview="cover"
      placeholder="Cole uma URL ou envie uma imagem"
      uploadLabel="Enviar imagem"
    />
  );
}
