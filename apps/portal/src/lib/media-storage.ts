// Server-only helpers for authenticated media storage.
// Files live in a private Supabase Storage bucket. Upload/download calls use
// the current user's Supabase Auth JWT, so Storage RLS is enforced normally.

import crypto from "node:crypto";
import { getCentralAccessToken } from "@/lib/central-auth";

if (typeof window !== "undefined") {
  throw new Error("lib/media-storage.ts must not be imported in the browser");
}

export const MEDIA_ROUTE_PREFIX = "/api/media/";

const DEFAULT_BUCKET = "arkom-media";
// Buckets privados permitidos: `arkom-media` (schema app_arkom, default) e
// `bilhon-media` (usado pelo bilhon-ai/educacional). O bucket efetivo vem de
// MEDIA_BUCKET; qualquer outro valor e rejeitado.
const ALLOWED_BUCKETS = ["arkom-media", "bilhon-media"] as const;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const SERVICE_AUTH_MODE = "service";

export const ALLOWED_MEDIA_MIME_TYPES = [
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
] as const;

type AllowedMimeType = (typeof ALLOWED_MEDIA_MIME_TYPES)[number];
const IMAGE_MIME_TYPES = ALLOWED_MEDIA_MIME_TYPES.slice(0, 4);
const RESOURCE_MIME_TYPES = ALLOWED_MEDIA_MIME_TYPES;

const EXT_BY_MIME: Record<AllowedMimeType, string> = {
  "image/avif": "avif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
};

export type MediaUploadKind =
  | "avatar"
  | "course-cover"
  | "mentorship-cover"
  | "mentor-photo"
  | "app-cover"
  | "lesson-resource";

function env(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} not configured`);
  return value;
}

function storageBase(): string {
  return `${env("CENTRAL_SUPABASE_URL").replace(/\/+$/, "")}/storage/v1`;
}

export function mediaBucketName(): string {
  const configuredBucket = process.env.MEDIA_BUCKET || DEFAULT_BUCKET;
  if (!(ALLOWED_BUCKETS as readonly string[]).includes(configuredBucket)) {
    throw new Error(`MEDIA_BUCKET must be one of: ${ALLOWED_BUCKETS.join(", ")}`);
  }
  return configuredBucket;
}

function serviceStorageHeaders(): Record<string, string> {
  const key = env("CENTRAL_SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, authorization: `Bearer ${key}` };
}

function userStorageHeaders(accessToken: string): Record<string, string> {
  const anonKey = env("CENTRAL_SUPABASE_ANON_KEY");
  return { apikey: anonKey, authorization: `Bearer ${accessToken}` };
}

async function storageHeaders(): Promise<Record<string, string>> {
  const mode = process.env.MEDIA_STORAGE_AUTH_MODE || "rls";
  if (mode !== "rls" && mode !== SERVICE_AUTH_MODE) {
    throw new Error("MEDIA_STORAGE_AUTH_MODE must be rls or service");
  }
  if (
    mode === SERVICE_AUTH_MODE
    && process.env.NODE_ENV !== "development"
    && process.env.NODE_ENV !== "test"
    && mediaBucketName() !== "bilhon-media"
  ) {
    // `arkom-media` tem RLS estrita (arkom_role) e nunca pode ser lido por
    // service role em producao. Ja o `bilhon-media` e o bucket compartilhado do
    // bilhon-ai, que em producao ja serve TODA a midia por service role
    // (o bilhon-ai roda MEDIA_STORAGE_AUTH_MODE=service); no modo educacional o
    // arkom-dash espelha esse modelo. O acesso segue gated por requireUser/sessao
    // na rota /api/media.
    throw new Error(
      "MEDIA_STORAGE_AUTH_MODE=service em producao so e permitido com o bucket bilhon-media (compartilhado com o bilhon-ai). Para arkom-media, use rls.",
    );
  }
  if (mode === SERVICE_AUTH_MODE) {
    return serviceStorageHeaders();
  }

  const accessToken = await getCentralAccessToken();
  if (!accessToken) throw new Error("Sessao Supabase expirada. Faca login novamente.");
  return userStorageHeaders(accessToken);
}

function storageObjectUrl(objectPath: string): string {
  return `${storageBase()}/object/${mediaBucketName()}/${encodeObjectPath(objectPath)}`;
}

function encodeObjectPath(objectPath: string): string {
  return objectPath.split("/").map(encodeURIComponent).join("/");
}

function sanitizeSegment(value: string): string {
  const clean = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "arquivo";
}

export function normalizeMediaPath(objectPath: string): string | null {
  const clean = objectPath.replace(/^\/+/, "");
  if (!/^(avatars|covers|resources)\//.test(clean)) return null;
  if (clean.split("/").some((part) => !part || part === "." || part === "..")) {
    return null;
  }
  return clean;
}

export function mediaUrlForObject(objectPath: string): string {
  return `${MEDIA_ROUTE_PREFIX}${encodeObjectPath(objectPath)}`;
}

function objectPrefix(kind: MediaUploadKind, userAuthId: string): string {
  switch (kind) {
    case "avatar":
      return `avatars/${userAuthId}`;
    case "course-cover":
      return "covers/courses";
    case "mentorship-cover":
      return "covers/mentorships";
    // Foto do mentor (0014). `covers/` já passa por normalizeMediaPath, então a
    // rota autenticada /api/media serve o objeto sem nenhuma outra alteração.
    case "mentor-photo":
      return "covers/mentors";
    case "app-cover":
      return "covers/apps";
    case "lesson-resource":
      return "resources/lessons";
  }
}

function allowedMimeTypesForKind(kind: MediaUploadKind): readonly string[] {
  return kind === "lesson-resource" ? RESOURCE_MIME_TYPES : IMAGE_MIME_TYPES;
}

export async function uploadToMediaBucket(
  file: File,
  kind: MediaUploadKind,
  userAuthId: string,
): Promise<{ objectPath: string; url: string }> {
  if (!allowedMimeTypesForKind(kind).includes(file.type)) {
    throw new Error(
      kind === "lesson-resource"
        ? "Use AVIF, JPG, PNG, WebP, PDF ou ZIP."
        : "Use AVIF, JPG, PNG ou WebP.",
    );
  }
  if (file.size <= 0) throw new Error("Arquivo vazio.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("O arquivo deve ter no maximo 5 MB.");

  const ext = EXT_BY_MIME[file.type as AllowedMimeType];
  const baseName = sanitizeSegment(file.name.replace(/\.[^.]+$/, ""));
  const objectPath = `${objectPrefix(kind, userAuthId)}/${Date.now()}-${crypto.randomUUID()}-${baseName}.${ext}`;
  const body = Buffer.from(await file.arrayBuffer());
  const headers = await storageHeaders();

  const uploaded = await fetch(storageObjectUrl(objectPath), {
    method: "POST",
    headers: {
      ...headers,
      "content-type": file.type,
      "cache-control": "3600",
      "x-upsert": "false",
    },
    body,
    cache: "no-store",
  });

  if (!uploaded.ok) {
    const text = await uploaded.text();
    throw new Error(`Upload falhou (${uploaded.status}): ${text.slice(0, 160)}`);
  }

  return { objectPath, url: mediaUrlForObject(objectPath) };
}

export async function fetchMediaObject(objectPath: string): Promise<Response | null> {
  const normalized = normalizeMediaPath(objectPath);
  if (!normalized) return null;
  let headers: Record<string, string>;
  try {
    headers = await storageHeaders();
  } catch {
    return null;
  }

  const res = await fetch(storageObjectUrl(normalized), {
    headers,
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res;
}
