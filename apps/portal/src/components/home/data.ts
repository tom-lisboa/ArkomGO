/**
 * Loader do /home — dados REAIS do aluno logado (schema-agnóstico, `getSql()`).
 *
 * Substitui os mocks de `@/components/home/content` (computeProgress,
 * resolveContinue, upcomingEvents, LAST_ACCESSES, SOLUTIONS) pelo que o aluno
 * de fato fez no banco. Espelha as queries do bilhon-ai (`/inicio`), adaptado
 * às rotas EN do arkom (`/trainings/{slug}`, `/trainings/lesson/{slug--NN}`).
 *
 * Reuso: `getCourseDetail`/`courseSlug` das Capacitações (mapeamento de rota +
 * gating de liberação) e `loadPublishedApps` dos Apps (acento + disponibilidade).
 * SQL SEMPRE relativa ao schema — nunca prefixe `app_arkom.`/`educacional.`.
 */

import { getSql } from "@/lib/db";
import { isCourseReleased } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth";
import { hasAppsAccess } from "@/lib/entitlements";
import { courseSlug, getCourseDetail } from "@/components/trainings/data";
import { loadPublishedApps, type StudentApp } from "@/components/apps/data";
import { EVENT_TIMEZONE } from "@/lib/credit-policy";

/* ── shapes entregues ao client body ─────────────────────────────────────── */

/** Progresso de um curso liberado e já iniciado (faixa de KPIs + "Seu progresso"). */
export interface HomeCourseProgress {
  /** slug de rota — link /trainings/{id} */
  id: string;
  name: string;
  accent: string;
  lessonsDone: number;
  lessonsTotal: number;
  pct: number;
}

/** "Continuar de onde parou" — curso com atividade mais recente + próxima aula. */
export interface HomeContinue {
  /** slug de rota do curso */
  id: string;
  name: string;
  strap: string;
  accent: string;
  /** id de rota da próxima aula não concluída (`{slug}--NN`); null = curso 100%. */
  lessonId: string | null;
  /** miniatura da próxima aula (fallback: última aula / capa do curso). */
  thumb: string | null;
  lessonsDone: number;
  lessonsTotal: number;
  pct: number;
}

export interface HomeUpcomingEvent {
  id: number;
  title: string;
  event_date: string; // 'YYYY-MM-DD'
  starts_at: string; // 'HH:MM'
  ends_at: string | null;
}

export interface HomeFeaturedApp {
  id: number;
  name: string;
  strap: string;
  accent: string;
  /** capa do card (override do slot → capa do app); null = tile de nome colorido */
  coverUrl: string | null;
  /** destino do card (override do slot; default = detalhe do app) */
  href: string;
}

/** Banner do topo da /home — campos null caem nos defaults do body (Claude Code). */
export interface HomeBanner {
  imageUrl: string | null;
  pill: string | null;
  title: string | null;
  description: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
}

export interface HomeLastAccess {
  kind: "curso" | "app";
  label: string;
  href: string;
  /** ISO string ('YYYY-MM-DDTHH:MM:SS.MSZ') — o client calcula "há N horas". */
  ts: string;
}

export interface HomeData {
  firstName: string;
  progress: HomeCourseProgress[];
  cont: HomeContinue | null;
  events: HomeUpcomingEvent[];
  featured: HomeFeaturedApp[];
  /** copy da seção "Soluções em destaque" (admin) — null = default do i18n */
  featuredTitle: string | null;
  featuredSubtitle: string | null;
  /** banner do topo — null = desligado no admin */
  banner: HomeBanner | null;
  lastAccesses: HomeLastAccess[];
}

/* ── linhas cruas ────────────────────────────────────────────────────────── */
type HomeSettingsRow = {
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

type FeaturedSlotRow = {
  app_id: number;
  title: string | null;
  strap: string | null;
  cover_url: string | null;
  accent: string | null;
  href: string | null;
};

type CourseProgressRow = {
  id: number;
  title: string;
  release_type: string;
  release_after_days: number;
  sort_order: number;
  total_lessons: number;
  completed_lessons: number;
};

/* ── apresentação (não é dado do schema) — paleta por slug de curso ──────────
 * Mesma tabela do loader de Capacitações; mantida aqui para não exportar o
 * helper interno. O acento é config de apresentação, não dado do aluno. */
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
function accentForSlug(slug: string): string {
  if (ACCENT[slug]) return ACCENT[slug];
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return FALLBACK_ACCENTS[Math.abs(h) % FALLBACK_ACCENTS.length];
}

/**
 * Config da home editada no /admin/home (migration 0009). Sem linha em
 * home_settings — ou com as tabelas ainda não aplicadas neste ambiente
 * (42P01) — a /home mantém o comportamento automático original.
 */
async function loadShowcaseConfig(sql: ReturnType<typeof getSql>): Promise<{
  settings: HomeSettingsRow | null;
  slots: FeaturedSlotRow[];
}> {
  try {
    const [settingsRows, slots] = await Promise.all([
      sql<HomeSettingsRow[]>`
        SELECT featured_title, featured_subtitle, featured_limit,
               banner_enabled, banner_image_url, banner_pill, banner_title,
               banner_description, banner_cta_label, banner_cta_href
        FROM home_settings
        WHERE id = 1
      `,
      sql<FeaturedSlotRow[]>`
        SELECT app_id, title, strap, cover_url, accent, href
        FROM home_featured_slots
        ORDER BY sort_order ASC, id ASC
      `,
    ]);
    return { settings: settingsRows[0] ?? null, slots };
  } catch (error) {
    if ((error as { code?: string })?.code === "42P01") {
      return { settings: null, slots: [] };
    }
    throw error;
  }
}

/** Quantas mentorias o destaque + a lista da /home mostram. */
const UPCOMING_LIMIT = 3;

/**
 * Carrega TODO o painel /home do aluno logado numa passada. As consultas
 * independentes vão em paralelo; a "continuar" depende do progresso + atividade,
 * então é resolvida depois (via `getCourseDetail`, que reaplica o gating).
 */
export async function loadHomeData(user: SessionUser): Promise<HomeData> {
  const sql = getSql();
  const student = { id: user.id, registered_at: user.registered_at };

  // Plano com os apps fechados (ClickUp 86ajrgzef): a vitrine de soluções e os
  // "últimos acessos" de app somem da home. O corte é aqui, no loader — não
  // adianta bloquear /apps e continuar servindo nome, capa e link na home.
  const appsLiberados = await hasAppsAccess(user.id);

  const [
    progressRows,
    activityRows,
    events,
    apps,
    clickRows,
    courseAccess,
    appAccess,
    showcase,
  ] = await Promise.all([
      // Progresso por curso publicado (aulas publicadas em módulos publicados).
      sql<CourseProgressRow[]>`
        SELECT c.id, c.title, c.release_type, c.release_after_days, c.sort_order,
               COUNT(l.id)::int AS total_lessons,
               COALESCE(SUM(CASE WHEN p.completed = 1 THEN 1 ELSE 0 END), 0)::int
                 AS completed_lessons
        FROM courses c
        JOIN course_modules m ON m.course_id = c.id AND m.status = 'published'
        JOIN lessons l ON l.module_id = m.id AND l.status = 'published'
        LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = ${user.id}
        WHERE c.status = 'published'
        GROUP BY c.id
        ORDER BY c.sort_order ASC, c.id ASC
      `,
      // Atividade por curso: acesso (log) OU conclusão de aula, o mais recente.
      sql<{ id: number; last_activity: string }[]>`
        SELECT c.id, MAX(a.ts) AS last_activity
        FROM courses c
        JOIN (
          SELECT course_id, accessed_at AS ts
          FROM course_access_logs WHERE user_id = ${user.id}
          UNION ALL
          SELECT l.course_id, p.completed_at AS ts
          FROM lesson_progress p
          JOIN lessons l ON l.id = p.lesson_id
          WHERE p.user_id = ${user.id} AND p.completed = 1 AND p.completed_at IS NOT NULL
        ) a ON a.course_id = c.id
        WHERE c.status = 'published'
        GROUP BY c.id
        ORDER BY last_activity DESC
      `,
      // Próximas mentorias publicadas: as que AINDA NÃO TERMINARAM, pelo relógio
      // do BANCO no fuso do produto. Duas armadilhas moram aqui: (1) cortar só
      // por DATA deixava a mentoria que acabou às 16h no topo de "próximas" até
      // a meia-noite — foi o que fez o destaque da home anunciar encontro
      // passado; (2) "hoje" pelo relógio do SERVIDOR (UTC em produção) sumia com
      // a mentoria da mesma noite assim que virava o dia lá. O instante é
      // montado como no `credit-policy` (event_date/starts_at/ends_at são TEXT;
      // sem `ends_at` válido o encontro dura 60 min; dado torto ⇒ NULL, e a
      // mentoria fica visível — a favor do aluno).
      sql<HomeUpcomingEvent[]>`
        SELECT id, title, event_date, starts_at, ends_at
        FROM (
          SELECT id, title, event_date, starts_at, ends_at,
                 CASE
                   WHEN event_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    AND ends_at ~ '^[0-9]{2}:[0-9]{2}'
                   THEN ((event_date || ' ' || substring(ends_at from 1 for 5))::timestamp
                           AT TIME ZONE ${EVENT_TIMEZONE})
                   WHEN event_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    AND starts_at ~ '^[0-9]{2}:[0-9]{2}'
                   THEN (((event_date || ' ' || substring(starts_at from 1 for 5))::timestamp
                           + interval '60 minutes') AT TIME ZONE ${EVENT_TIMEZONE})
                   ELSE NULL
                 END AS ends_at_ts
          FROM mentorship_events
          WHERE status = 'published'
            AND event_date >= to_char(now() AT TIME ZONE ${EVENT_TIMEZONE}, 'YYYY-MM-DD')
        ) e
        WHERE ends_at_ts IS NULL OR ends_at_ts > now()
        ORDER BY event_date ASC, starts_at ASC
        LIMIT ${UPCOMING_LIMIT}
      `,
      // Apps publicados (acento/disponibilidade já resolvidos). Plano sem apps
      // ⇒ nem consulta: a vitrine nasce vazia.
      appsLiberados ? loadPublishedApps() : Promise.resolve([]),
      // Contagem de cliques por app (ranqueia os "em destaque").
      sql<{ app_id: number; clicks: number }[]>`
        SELECT app_id, COUNT(*)::int AS clicks FROM app_clicks GROUP BY app_id
      `,
      // Últimos acessos do aluno — cursos.
      sql<{ id: number; title: string; ts: string }[]>`
        SELECT c.id, c.title, MAX(g.accessed_at) AS ts
        FROM course_access_logs g
        JOIN courses c ON c.id = g.course_id
        WHERE g.user_id = ${user.id} AND c.status = 'published'
        GROUP BY c.id
      `,
      // Últimos acessos do aluno — apps.
      sql<{ id: number; title: string; ts: string }[]>`
        SELECT a.id, a.title, MAX(k.clicked_at) AS ts
        FROM app_clicks k
        JOIN apps a ON a.id = k.app_id
        WHERE k.user_id = ${user.id} AND a.status = 'published'
        GROUP BY a.id
      `,
      // Config da vitrine + banner (admin > Home).
      loadShowcaseConfig(sql),
    ]);

  // ── Progresso: só cursos liberados e já iniciados (KPIs + "Seu progresso"). ──
  const releasedIds = new Set(
    progressRows.filter((r) => isCourseReleased(r, user.registered_at)).map((r) => r.id)
  );
  const rowById = new Map(progressRows.map((r) => [r.id, r]));

  const progress: HomeCourseProgress[] = progressRows
    .filter((r) => releasedIds.has(r.id) && r.completed_lessons > 0)
    .map((r) => {
      const slug = courseSlug(r.title);
      return {
        id: slug,
        name: r.title,
        accent: accentForSlug(slug),
        lessonsDone: r.completed_lessons,
        lessonsTotal: r.total_lessons,
        pct: r.total_lessons
          ? Math.round((r.completed_lessons / r.total_lessons) * 100)
          : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct);

  // ── Continuar de onde parou: curso liberado com atividade mais recente. ──
  let cont: HomeContinue | null = null;
  const winnerId = activityRows.find((r) => releasedIds.has(r.id))?.id ?? null;
  if (winnerId != null) {
    const row = rowById.get(winnerId)!;
    const slug = courseSlug(row.title);
    const detail = await getCourseDetail(slug, student);
    if (detail && !detail.locked) {
      const lessons = detail.modules.flatMap((m) => m.lessons);
      const done = lessons.filter((l) => l.completed).length;
      const total = lessons.length;
      const next = lessons.find((l) => !l.completed) ?? null;
      const last = lessons.length ? lessons[lessons.length - 1] : null;
      cont = {
        id: detail.id,
        name: detail.name,
        strap: detail.strap,
        accent: detail.accent,
        lessonId: next?.id ?? null,
        thumb: next?.thumb ?? last?.thumb ?? detail.cover ?? null,
        lessonsDone: done,
        lessonsTotal: total,
        pct: total ? Math.round((done / total) * 100) : 0,
      };
    }
  }

  // ── Soluções em destaque: slots manuais do admin primeiro (na ordem), e as
  // vagas restantes até o limite completadas pelo ranking automático de cliques
  // (disponíveis primeiro). Sem config → top 4 automático, como sempre foi. ──
  const { settings, slots } = showcase;
  const featuredLimit = settings?.featured_limit ?? 4;
  const appById = new Map(apps.map((a) => [a.id, a]));

  const manual: HomeFeaturedApp[] = slots
    .map((s) => ({ s, a: appById.get(s.app_id) }))
    // slot cujo app foi despublicado sai da vitrine (apps só tem publicados)
    .filter((x): x is { s: FeaturedSlotRow; a: StudentApp } => Boolean(x.a))
    .slice(0, featuredLimit)
    .map(({ s, a }) => ({
      id: a.id,
      name: s.title?.trim() || a.name,
      strap: s.strap?.trim() || a.strap,
      accent: s.accent || a.accent,
      coverUrl: s.cover_url?.trim() || a.coverUrl,
      href: s.href?.trim() || `/apps/${a.id}`,
    }));

  const pickedIds = new Set(manual.map((f) => f.id));
  const clickBy = new Map(clickRows.map((r) => [r.app_id, r.clicks]));
  const autoFill: HomeFeaturedApp[] = apps
    .filter((a) => !pickedIds.has(a.id))
    .map((a) => ({ a, clicks: clickBy.get(a.id) ?? 0 }))
    .sort((x, y) => {
      if (x.a.available !== y.a.available) return x.a.available ? -1 : 1;
      if (y.clicks !== x.clicks) return y.clicks - x.clicks;
      return y.a.id - x.a.id;
    })
    .slice(0, Math.max(0, featuredLimit - manual.length))
    .map(({ a }) => ({
      id: a.id,
      name: a.name,
      strap: a.strap,
      accent: a.accent,
      coverUrl: a.coverUrl,
      href: `/apps/${a.id}`,
    }));

  const featured = [...manual, ...autoFill];

  // ── Banner do topo: null = desligado; campos null = defaults do body. ──
  const banner: HomeBanner | null =
    settings && !settings.banner_enabled
      ? null
      : {
          imageUrl: settings?.banner_image_url?.trim() || null,
          pill: settings?.banner_pill?.trim() || null,
          title: settings?.banner_title?.trim() || null,
          description: settings?.banner_description?.trim() || null,
          ctaLabel: settings?.banner_cta_label?.trim() || null,
          ctaHref: settings?.banner_cta_href?.trim() || null,
        };

  // ── Últimos acessos: cursos + apps mesclados, mais recentes primeiro. ──
  const lastAccesses: HomeLastAccess[] = [
    ...courseAccess.map((c) => ({
      kind: "curso" as const,
      label: c.title,
      href: `/trainings/${courseSlug(c.title)}`,
      ts: c.ts,
    })),
    // Histórico de app só aparece para quem ainda tem os apps no plano.
    ...(appsLiberados ? appAccess : []).map((a) => ({
      kind: "app" as const,
      label: a.title,
      href: "/apps",
      ts: a.ts,
    })),
  ]
    .sort((x, y) => (x.ts < y.ts ? 1 : -1))
    .slice(0, 5);

  return {
    firstName: user.full_name.split(" ")[0] || user.full_name,
    progress,
    cont,
    events,
    featured,
    featuredTitle: settings?.featured_title?.trim() || null,
    featuredSubtitle: settings?.featured_subtitle?.trim() || null,
    banner,
    lastAccesses,
  };
}
