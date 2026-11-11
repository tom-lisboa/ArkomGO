"use client";

// ImageCropModal — passo de corte entre "escolher arquivo" e "upload".
// O admin arrasta/dá zoom numa janela TRAVADA na proporção em que a imagem é
// exibida (ex.: banner da home 6:1, capa de card 2:1) e o resultado é gerado
// via canvas já nas dimensões-alvo — o que se vê no corte é o que aparece na
// home, sem surpresa do object-cover. Saída WebP (fallback JPEG), sem upscale
// além do recorte real.

import { useEffect, useMemo, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button, Modal, useToast } from "@/components/ui";

export type CropOutput = { width: number; height: number };

async function cropFileToTarget(
  file: File,
  area: Area,
  output: CropOutput
): Promise<File> {
  // from-image respeita a orientação EXIF de fotos de celular
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    // nunca upscale: se o recorte é menor que o alvo, entrega no tamanho do recorte
    const outWidth = Math.max(1, Math.round(Math.min(output.width, area.width)));
    const outHeight = Math.max(1, Math.round(outWidth * (output.height / output.width)));

    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponível neste navegador.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      bitmap,
      area.x,
      area.y,
      area.width,
      area.height,
      0,
      0,
      outWidth,
      outHeight
    );

    const toBlob = (type: string, quality: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    const blob = (await toBlob("image/webp", 0.92)) ?? (await toBlob("image/jpeg", 0.9));
    if (!blob) throw new Error("Não foi possível gerar a imagem cortada.");

    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "imagem";
    return new File([blob], `${baseName}-${outWidth}x${outHeight}.${ext}`, {
      type: blob.type,
    });
  } finally {
    bitmap.close();
  }
}

export function ImageCropModal({
  file,
  aspect,
  output,
  title = "Ajustar corte",
  helper = "Arraste e dê zoom — a janela é a área exata exibida na home.",
  onCancel,
  onCropped,
}: {
  file: File;
  /** proporção da janela de corte (largura/altura), ex.: 6 p/ banner, 2 p/ card */
  aspect: number;
  /** dimensões máximas geradas (px) — o corte sai exatamente nessa proporção */
  output: CropOutput;
  title?: string;
  helper?: string;
  onCancel: () => void;
  onCropped: (file: File) => void;
}) {
  const { toast } = useToast();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [pending, setPending] = useState(false);

  const imageUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(imageUrl), [imageUrl]);

  async function confirmar() {
    if (!area || pending) return;
    setPending(true);
    try {
      onCropped(await cropFileToTarget(file, area, output));
    } catch (error) {
      console.error("Erro ao cortar imagem:", error);
      toast({
        title: "Erro ao cortar",
        description:
          error instanceof Error ? error.message : "Tente outra imagem.",
        variant: "error",
      });
      setPending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      size="lg"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirmar} disabled={!area || pending}>
            {pending ? "Cortando..." : "Usar este corte"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-secondary">{helper}</p>
        <div className="relative h-[340px] w-full overflow-hidden rounded-lg bg-navy-950">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            minZoom={1}
            maxZoom={4}
            aspect={aspect}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, croppedAreaPixels) => setArea(croppedAreaPixels)}
          />
        </div>
        <label className="flex items-center gap-3 text-xs text-secondary">
          Zoom
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-current"
            aria-label="Zoom do corte"
          />
        </label>
      </div>
    </Modal>
  );
}
