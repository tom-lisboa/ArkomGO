"use server";

import { requireAdmin } from "@/lib/auth";
import { uploadToMediaBucket, type MediaUploadKind } from "@/lib/media-storage";

export type AdminMediaUploadKind = Exclude<MediaUploadKind, "avatar">;

export type MediaUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const ADMIN_MEDIA_KINDS = new Set<AdminMediaUploadKind>([
  "course-cover",
  "mentorship-cover",
  "mentor-photo",
  "app-cover",
  "lesson-resource",
]);

export async function uploadAdminMedia(formData: FormData): Promise<MediaUploadResult> {
  const user = await requireAdmin();

  const kind = formData.get("kind");
  if (typeof kind !== "string" || !ADMIN_MEDIA_KINDS.has(kind as AdminMediaUploadKind)) {
    return { ok: false, error: "Destino de upload invalido." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione um arquivo para upload." };
  }

  try {
    const uploaded = await uploadToMediaBucket(file, kind as AdminMediaUploadKind, String(user.id));
    return { ok: true, url: uploaded.url };
  } catch (error) {
    console.error("Erro em uploadAdminMedia:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Nao foi possivel enviar o arquivo.",
    };
  }
}
