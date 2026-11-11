/**
 * Loader das Capacitações — lê o schema `app_arkom` (o MESMO que o /admin grava)
 * e mapeia para os shapes que os componentes já consomem (Course / CourseDetail /
 * LessonRef). O front passa a ser REATIVO ao app: o que o admin cadastra aparece
 * aqui automaticamente. Substitui o antigo mock estático (content.ts).
 *
 * Enriquecimentos derivados (o schema é mais enxuto que o mock):
 *  · slug do curso   = slugify(title)               — a URL /trainings/{slug}
 *  · capa do curso   = cover_url ?? preview do 1º vídeo (Panda) — nunca fica vazio
 *  · capa da aula    = preview.webp do vídeo Panda / hqdefault do YouTube
 *  · minutos         = ui-state demo determinístico (schema não tem duração)
 *  · accent          = paleta por slug (config de apresentação, não é dado)
 */

import { getSql } from "@/lib/db";
import { allowedCourseIds } from "@/lib/entitlements";
import { daysUntilCourseRelease, isCourseReleased } from "@/lib/utils";
import { loadCourseRailViews, type CourseRailView } from "./rails";
import type {
  Course,
  CourseDetail,
  CourseModule,
  Lesson,
  LessonMaterial,
  LessonRef,
} from "./content";

/**
 * Contexto do aluno logado, passado do server component (requireUser) ao loader.
 * Necessário para: (a) estado por-usuário (concluída/curtida/nota), e (b) o
 * gating de liberação do curso (registered_at + release_after_days).
 */
export type StudentContext = { id: number; registered_at: string };

/** Estado por-usuário de uma aula, resolvido em lote por curso (não N+1). */
type LessonUserState = {
  completed: Set<number>;
  liked: Set<number>;
  rating: Map<number, number>;
  materials: Map<number, LessonMaterial[]>;
};

/* ── apresentação (não é dado do schema) ─────────────────────────────────── */
const ACCENT: Record<string, string> = {
  "claude-code": "#FF9D5C",
  lovable: "#A78BFA",
  heygen: "#7DD3FC",
  n8n: "#5EEAD4",
  codex: "#7DD3FC",
  gpt: "#A78BFA",
  shopify: "#FACC15",
  antigravity: "#FB7185",
};
const FALLBACK_ACCENTS = ["#FF9D5C", "#A78BFA", "#7DD3FC", "#5EEAD4", "#FACC15", "#FB7185", "#34D399"];

/**
 * Slug de ROTA em inglês/neutro (o nome exibido continua PT). Convenção do
 * Arkom original: rotas em inglês. Mapeia o slug PT (do título) → slug de rota.
 */
const SLUG_OVERRIDE: Record<string, string> = {
  "lovable-na-pratica": "lovable",
  "capacitacao-n8n": "n8n",
  "capacitacao-codex": "codex",
  "capacitacao-gpt": "gpt",
  "capacitacao-shopify": "shopify",
  "capacitacao-antigravity": "antigravity",
};

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** slug de rota do curso (inglês/neutro), derivado do título PT. */
export function courseSlug(title: string): string {
  const base = slugify(title);
  return SLUG_OVERRIDE[base] ?? base;
}

function accentFor(slug: string): string {
  if (ACCENT[slug]) return ACCENT[slug];
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return FALLBACK_ACCENTS[Math.abs(h) % FALLBACK_ACCENTS.length];
}

/** minutos: o schema não tem duração — ui-state demo estável (derivado do título). */
function demoMinutes(title: string): number {
  return 4 + (title.length % 17);
}

/**
 * Miniatura derivada da URL do vídeo — capa de aula sem depender de asset próprio.
 * Panda (player embed OU delivery b-vz) → cdn.pandavideo.com/vz-{lib}/{id}/preview.webp
 * YouTube → img.youtube.com/vi/{id}/hqdefault.jpg
 */
export function videoThumbUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const panda = url.match(
    /(?:player|b)-vz-([\w-]+)\.tv\.pandavideo\.com\.br\/(?:embed\/\?v=)?([0-9a-fA-F-]{36})/
  );
  if (panda) return `https://cdn.pandavideo.com/vz-${panda[1]}/${panda[2]}/preview.webp`;
  const yt = [
    /youtube\.com\/watch\?(?:.*&)?v=([\w-]{6,})/,
    /youtu\.be\/([\w-]{6,})/,
    /youtube\.com\/shorts\/([\w-]{6,})/,
    /youtube\.com\/embed\/([\w-]{6,})/,
  ];
  for (const re of yt) {
    const m = url.match(re);
    if (m) return `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`;
  }
  return undefined;
}

/* ── linhas do banco ─────────────────────────────────────────────────────── */
type CourseRow = {
  id: number;
  title: string;
  description: string | null;
  cover_url: string | null;
  release_type: string;
  release_after_days: number;
  modules: number;
  lessons: number;
  first_video: string | null;
};
type ModuleRow = { id: number; title: string; sort_order: number };
type LessonRow = {
  id: number;
  module_id: number;
  title: string;
  description: string | null;
  video_url: string;
  video_provider: string;
};

function provider(p: string): "youtube" | "panda" | undefined {
  return p === "youtube" || p === "panda" ? p : undefined;
}

function toLesson(row: LessonRow, id: string, state: LessonUserState): Lesson {
  const completed = state.completed.has(row.id);
  return {
    id,
    dbLessonId: row.id,
    title: row.title,
    minutes: demoMinutes(row.title),
    // Não há coluna de watch-%: a barra reflete a conclusão (0 ou 100).
    progress: completed ? 100 : 0,
    completed,
    liked: state.liked.has(row.id),
    rating: state.rating.get(row.id) ?? 0,
    thumb: videoThumbUrl(row.video_url),
    videoUrl: row.video_url,
    provider: provider(row.video_provider),
    desc: row.description ?? "",
    skills: [],
    materials: state.materials.get(row.id) ?? [],
  };
}

/**
 * Carrega, em LOTE (por curso), o estado por-usuário de todas as aulas do curso
 * + os materiais (lesson_resources). SQL relativa ao schema (getSql aplica o
 * search_path); nada de prefixo `app_arkom.`/`educacional.`.
 */
async function loadLessonUserState(
  courseId: number,
  userId: number
): Promise<LessonUserState> {
  const sql = getSql();
  const [progressRows, likeRows, ratingRows, resourceRows] = await Promise.all([
    sql<{ lesson_id: number; completed: number }[]>`
      SELECT p.lesson_id, p.completed
      FROM lesson_progress p
      JOIN lessons l ON l.id = p.lesson_id
      WHERE p.user_id = ${userId} AND l.course_id = ${courseId}`,
    sql<{ lesson_id: number; liked: number }[]>`
      SELECT k.lesson_id, k.liked
      FROM lesson_likes k
      JOIN lessons l ON l.id = k.lesson_id
      WHERE k.user_id = ${userId} AND l.course_id = ${courseId}`,
    sql<{ lesson_id: number; rating: number }[]>`
      SELECT g.lesson_id, g.rating
      FROM lesson_ratings g
      JOIN lessons l ON l.id = g.lesson_id
      WHERE g.user_id = ${userId} AND l.course_id = ${courseId}`,
    sql<{ lesson_id: number; id: number; title: string; resource_type: string; url: string }[]>`
      SELECT r.lesson_id, r.id, r.title, r.resource_type, r.url
      FROM lesson_resources r
      JOIN lessons l ON l.id = r.lesson_id
      WHERE l.course_id = ${courseId}
      ORDER BY r.lesson_id, r.sort_order, r.id`,
  ]);

  const materials = new Map<number, LessonMaterial[]>();
  for (const r of resourceRows) {
    const list = materials.get(r.lesson_id) ?? [];
    list.push({ id: r.id, title: r.title, resourceType: r.resource_type, url: r.url });
    materials.set(r.lesson_id, list);
  }

  return {
    completed: new Set(progressRows.filter((r) => r.completed === 1).map((r) => r.lesson_id)),
    liked: new Set(likeRows.filter((r) => r.liked === 1).map((r) => r.lesson_id)),
    rating: new Map(ratingRows.map((r) => [r.lesson_id, r.rating])),
    materials,
  };
}

/**
 * Capa do curso. Preferimos o `cover_url` real gravado pelo /admin — inclusive
 * `/api/media/covers/...`, que a rota serve a partir do bucket configurado
 * (`bilhon-media` no educacional, `arkom-media` no app_arkom). Sem `cover_url`,
 * caímos na capa estática `/trainings/{slug}.png`. A `MediaSurface` tem fallback
 * `onError`, então uma capa ausente/negada degrada para o glow do tema — nunca
 * um ícone de imagem quebrada.
 */
function resolveCover(slug: string, coverUrl: string | null): string {
  if (coverUrl) return coverUrl;
  return `/trainings/${slug}.png`;
}

/**
 * O curso está FORA do plano do aluno? (ClickUp 86ajrgzef)
 * `permitidos = null` significa "sem restrição" — flag desligada, plano
 * permissivo, aluno sem plano ou falha de leitura (fail-open, `lib/entitlements`).
 */
function foraDoPlano(row: CourseRow, permitidos: Set<number> | null): boolean {
  return permitidos !== null && !permitidos.has(row.id);
}

/** Card de curso (grid da listagem). `locked` = publicado mas ainda não liberado. */
function toCard(row: CourseRow, user: StudentContext, permitidos: Set<number> | null): Course {
  const slug = courseSlug(row.title);
  const hasLessons = row.lessons > 0;
  const semPlano = foraDoPlano(row, permitidos);
  // Duas razões distintas para o cadeado, com copy própria: o curso ainda não
  // liberou pelo tempo de casa (release_after_days) OU não está no plano.
  const locked = hasLessons && (semPlano || !isCourseReleased(row, user.registered_at));
  return {
    id: slug,
    name: row.title,
    kind: "course",
    strap: row.description ?? "",
    functionsCount: row.modules,
    jobsCount: row.lessons,
    accent: accentFor(slug),
    thumb: resolveCover(slug, row.cover_url),
    comingSoon: !hasLessons,
    locked,
    lockReason: locked ? (semPlano ? "plan" : "release") : undefined,
    releaseInDays:
      locked && !semPlano ? daysUntilCourseRelease(row, user.registered_at) : 0,
  };
}

/** Consulta de cards com contagens + 1º vídeo (fallback de capa). */
async function fetchCourseRows(): Promise<CourseRow[]> {
  const sql = getSql();
  return sql<CourseRow[]>`
    SELECT c.id, c.title, c.description, c.cover_url,
      c.release_type, c.release_after_days,
      (SELECT count(*)::int FROM course_modules m
         WHERE m.course_id = c.id AND m.status = 'published') AS modules,
      (SELECT count(*)::int FROM lessons l
         JOIN course_modules m ON m.id = l.module_id
        WHERE l.course_id = c.id AND l.status = 'published' AND m.status = 'published') AS lessons,
      (SELECT l.video_url FROM lessons l
         JOIN course_modules m ON m.id = l.module_id
        WHERE l.course_id = c.id AND l.status = 'published' AND m.status = 'published'
        ORDER BY m.sort_order, m.id, l.sort_order, l.id LIMIT 1) AS first_video
    FROM courses c
    WHERE c.status = 'published'
    ORDER BY c.sort_order, c.id`;
}

/**
 * Monta o CourseDetail completo (módulos + aulas) de um curso já resolvido,
 * com o estado por-usuário (concluída/curtida/nota/materiais) e o gating de
 * liberação. Cursos NÃO liberados voltam com `locked:true` e módulos vazios —
 * as páginas de curso/aula redirecionam antes de exibir qualquer conteúdo.
 */
async function loadDetail(
  row: CourseRow,
  user: StudentContext,
  permitidos: Set<number> | null,
): Promise<CourseDetail> {
  const slug = courseSlug(row.title);
  const cover = resolveCover(slug, row.cover_url);
  const semPlano = foraDoPlano(row, permitidos);
  const locked = semPlano || !isCourseReleased(row, user.registered_at);

  const base = {
    id: slug,
    dbCourseId: row.id,
    name: row.title,
    kind: "course" as const,
    strap: row.description ?? "",
    accent: accentFor(slug),
    cover,
    locked,
    lockReason: locked ? (semPlano ? ("plan" as const) : ("release" as const)) : undefined,
    releaseInDays:
      locked && !semPlano ? daysUntilCourseRelease(row, user.registered_at) : 0,
  };

  // Curso bloqueado: não carrega aulas nem estado por-usuário (a página guarda).
  if (locked) return { ...base, modules: [], comingSoon: false };

  const sql = getSql();
  const [moduleRows, state] = await Promise.all([
    sql<ModuleRow[]>`
      SELECT id, title, sort_order FROM course_modules
      WHERE course_id = ${row.id} AND status = 'published'
      ORDER BY sort_order, id`,
    loadLessonUserState(row.id, user.id),
  ]);

  // id da aula = slug do curso + ordinal no curso (ex.: claude-code--01),
  // seguindo a convenção de rota em inglês. `ord` corre entre módulos.
  let ord = 0;
  const modules: CourseModule[] = [];
  for (const [i, m] of moduleRows.entries()) {
    const lessonRows = await sql<LessonRow[]>`
      SELECT id, module_id, title, description, video_url, video_provider
      FROM lessons
      WHERE module_id = ${m.id} AND status = 'published'
      ORDER BY sort_order, id`;
    modules.push({
      id: String(m.id),
      name: m.title,
      position: i + 1,
      lessons: lessonRows.map((r) =>
        toLesson(r, `${slug}--${String(++ord).padStart(2, "0")}`, state)
      ),
    });
  }

  return {
    ...base,
    modules,
    comingSoon: modules.every((mod) => mod.lessons.length === 0),
  };
}

/* ── API pública do loader ───────────────────────────────────────────────── */

/** Catálogo da listagem: cards com aulas (TOP_NINE) e "em breve" (sem aulas).
 *  Cards liberados e bloqueados ficam ambos em `cards` (o bloqueado é exibido
 *  em estado locked pelo card); só cursos sem aulas caem em "em breve".
 *
 *  `rails` = prateleiras vindas da configuração do /admin (migration 0013),
 *  ou `null` quando a flag `course_rails_enabled` está desligada / o banco não
 *  tem a 0013 / a configuração não produziu nenhuma prateleira com curso — nos
 *  quatro casos o corpo da página usa o layout hardcoded de sempre. */
export async function getCatalog(
  user: StudentContext
): Promise<{ cards: Course[]; comingSoon: Course[]; rails: CourseRailView[] | null }> {
  const [rows, permitidos] = await Promise.all([
    fetchCourseRows(),
    allowedCourseIds(user.id),
  ]);
  const entries = rows.map((r) => ({ id: r.id, card: toCard(r, user, permitidos) }));
  const all = entries.map((entry) => entry.card);
  return {
    cards: all.filter((c) => !c.comingSoon),
    comingSoon: all.filter((c) => c.comingSoon),
    rails: await loadCourseRailViews(entries),
  };
}

/** Detalhe de um curso pelo slug de rota (inglês/neutro), com estado do aluno. */
export async function getCourseDetail(
  slug: string,
  user: StudentContext
): Promise<CourseDetail | null> {
  const rows = await fetchCourseRows();
  const row = rows.find((r) => courseSlug(r.title) === slug);
  if (!row) return null;
  return loadDetail(row, user, await allowedCourseIds(user.id));
}

/** Aula pelo id de rota `curso--NN` → curso completo + módulo + índice plano. */
export async function getLessonRef(
  lessonId: string,
  user: StudentContext
): Promise<LessonRef | null> {
  const sep = lessonId.lastIndexOf("--");
  if (sep === -1) return null;
  const slug = lessonId.slice(0, sep);

  const rows = await fetchCourseRows();
  const row = rows.find((r) => courseSlug(r.title) === slug);
  if (!row) return null;

  const course = await loadDetail(row, user, await allowedCourseIds(user.id));
  // Curso bloqueado: devolve o curso (locked) sem aula para a página guardar.
  if (course.locked) return { course, module: EMPTY_MODULE, lesson: EMPTY_LESSON, index: 0 };

  let index = 0;
  for (const track of course.modules) {
    for (const lesson of track.lessons) {
      index += 1;
      if (lesson.id === lessonId) return { course, module: track, lesson, index };
    }
  }
  return null;
}

/* Placeholders para o retorno de curso bloqueado (a página redireciona antes
 * de renderizar, então estes valores nunca chegam à UI). */
const EMPTY_MODULE: CourseModule = { id: "", name: "", position: 0, lessons: [] };
const EMPTY_LESSON: Lesson = {
  id: "",
  title: "",
  minutes: 0,
  progress: 0,
  completed: false,
  desc: "",
  skills: [],
};
