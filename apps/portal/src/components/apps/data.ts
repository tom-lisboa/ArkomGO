// components/apps/data.ts — loader schema-agnóstico dos apps publicados.
//
// Fonte única para as verticais do aluno /solutions (roda radial) e /apps
// (grid). Lê `apps` JOIN `app_categories` (ambos publicados), ordenado por
// sort_order, com os "em breve" (redirect_url LIKE 'coming-soon:%') por último.
// SQL relativa ao schema — getSql() aplica o search_path (ARKOM_RUNTIME_SCHEMA,
// prod=`educacional`); NUNCA prefixe o schema aqui.
//
// A "solução" que aparece para o aluno é a linha de `apps`: name = title,
// category = slug de app_categories, live = redirect_url que NÃO começa com
// `coming-soon:`, strap = tagline || description, accent por nome/categoria,
// link de acesso = redirect_url decodificado (só para apps disponíveis).

import { getSql } from "@/lib/db";
import { publicAppRedirectUrl } from "@/lib/apps";
import { sectorFor } from "@/components/apps/sectors";

/** Categoria publicada — chips do grid vêm daqui (da tabela, não hardcoded). */
export interface AppCategory {
  id: number;
  name: string;
  slug: string;
}

/** Um app publicado, na forma que a roda + o grid consomem. */
export interface StudentApp {
  id: number;
  name: string;
  /** slug da categoria (app_categories.slug) */
  category: string;
  /** nome de exibição da categoria (app_categories.name) — crumb/chip/label */
  categoryName: string;
  /** setor do MAPA (sectors.ts, derivado do título) — pills de filtro do grid */
  sector: string;
  /** disponível = redirect_url NÃO começa com `coming-soon:` */
  available: boolean;
  /** copy curta: tagline com fallback para description */
  strap: string;
  tagline: string | null;
  description: string | null;
  coverUrl: string | null;
  /** URL externa decodificada — só preenchida quando o app está disponível */
  redirectUrl: string | null;
  /** cor de acento (nome do app → paleta dos flagships; senão → categoria) */
  accent: string;
}

type AppRow = {
  id: number;
  title: string;
  tagline: string | null;
  description: string | null;
  cover_url: string | null;
  redirect_url: string | null;
  available: boolean;
  category_name: string;
  category_slug: string;
};

/** Um app com os campos da TELA INTERNA (vídeo + avaliação + botão). */
export interface StudentAppDetail extends StudentApp {
  videoProvider: "youtube" | "panda" | null;
  videoUrl: string | null;
  buttonLabel: string;
  /** média da comunidade (app_ratings) — null quando não há avaliações. */
  avgRating: number | null;
  ratingCount: number;
}

type AppDetailRow = AppRow & {
  video_provider: string | null;
  video_url: string | null;
  button_label: string | null;
  avg_rating: number | null;
  rating_count: number;
};

const CATEGORY_ACCENT: Record<string, string> = {
  agentes: "#FF9D5C",
  dashboards: "#A78BFA",
  automacao: "#5EEAD4",
};

/** Paleta dos flagships (preserva as cores dos mocks do fundador). */
const NAME_ACCENT: [RegExp, string][] = [
  [/\bbia\b/i, "#FF9D5C"],
  [/\bsdr\b/i, "#EF4444"],
  [/\bdesk\b/i, "#38BDF8"],
  [/\bads\b/i, "#A78BFA"],
  [/finance|financ/i, "#FACC15"],
  [/social/i, "#FB7185"],
  [/\bcrm\b/i, "#5EEAD4"],
];

/** Acento por nome (flagship) → categoria (slug) → gold neutro. */
function accentFor(title: string, categorySlug: string): string {
  for (const [re, accent] of NAME_ACCENT) {
    if (re.test(title)) return accent;
  }
  return CATEGORY_ACCENT[categorySlug] ?? "#c9a84c";
}

function toStudentApp(row: AppRow): StudentApp {
  const available = row.available === true;
  const tagline = row.tagline?.trim() || null;
  const description = row.description?.trim() || null;
  return {
    id: row.id,
    name: row.title,
    category: row.category_slug,
    categoryName: row.category_name,
    sector: sectorFor(row.title),
    available,
    strap: tagline ?? description ?? "",
    tagline,
    description,
    coverUrl: row.cover_url?.trim() || null,
    // URL externa só é exposta para apps disponíveis; "em breve" = sem acesso.
    redirectUrl: available ? publicAppRedirectUrl(row.redirect_url) : null,
    accent: accentFor(row.title, row.category_slug),
  };
}

/** Apps publicados (com categoria publicada), disponíveis primeiro. */
export async function loadPublishedApps(): Promise<StudentApp[]> {
  const sql = getSql();
  const rows = await sql<AppRow[]>`
    SELECT a.id, a.title, a.tagline, a.description, a.cover_url, a.redirect_url,
           (a.redirect_url NOT LIKE 'coming-soon:%') AS available,
           c.name AS category_name, c.slug AS category_slug
      FROM apps a
      JOIN app_categories c ON c.id = a.category_id
     WHERE a.status = 'published'
       AND c.status = 'published'
     ORDER BY (CASE WHEN a.redirect_url LIKE 'coming-soon:%' THEN 1 ELSE 0 END),
              a.sort_order, a.id
  `;
  return rows.map(toStudentApp);
}

/**
 * Um app publicado por id, com os campos da tela interna + a média/contagem de
 * avaliações (app_ratings). Retorna null se não existe / não está publicado.
 * Não filtra "em breve" — o detalhe abre, mas o CTA fica travado.
 */
export async function loadAppById(id: number): Promise<StudentAppDetail | null> {
  const appId = Number(id);
  if (!Number.isInteger(appId) || appId <= 0) return null;
  const sql = getSql();
  const rows = await sql<AppDetailRow[]>`
    SELECT a.id, a.title, a.tagline, a.description, a.cover_url, a.redirect_url,
           a.video_provider, a.video_url, a.button_label,
           (a.redirect_url NOT LIKE 'coming-soon:%') AS available,
           c.name AS category_name, c.slug AS category_slug,
           AVG(r.rating)::float AS avg_rating,
           COUNT(r.rating)::int AS rating_count
      FROM apps a
      JOIN app_categories c ON c.id = a.category_id
      LEFT JOIN app_ratings r ON r.app_id = a.id
     WHERE a.id = ${appId}
       AND a.status = 'published'
       AND c.status = 'published'
     GROUP BY a.id, c.name, c.slug
  `;
  const row = rows[0];
  if (!row) return null;
  const base = toStudentApp(row);
  const provider =
    row.video_provider === "panda" || row.video_provider === "youtube"
      ? row.video_provider
      : null;
  return {
    ...base,
    videoProvider: provider,
    videoUrl: row.video_url?.trim() || null,
    buttonLabel: row.button_label?.trim() || "Acessar solução",
    avgRating: row.rating_count > 0 ? row.avg_rating : null,
    ratingCount: row.rating_count,
  };
}

/** Nota que ESTE usuário deu ao app (1–5) — null se ainda não avaliou. */
export async function loadUserRating(userId: number, appId: number): Promise<number | null> {
  const sql = getSql();
  const rows = await sql<{ rating: number }[]>`
    SELECT rating FROM app_ratings WHERE user_id = ${userId} AND app_id = ${appId} LIMIT 1
  `;
  return rows[0]?.rating ?? null;
}

/** Categorias publicadas (para os chips do grid), na ordem de sort_order. */
export async function loadPublishedCategories(): Promise<AppCategory[]> {
  const sql = getSql();
  return sql<AppCategory[]>`
    SELECT c.id, c.name, c.slug
      FROM app_categories c
     WHERE c.status = 'published'
     ORDER BY c.sort_order, c.name
  `;
}

