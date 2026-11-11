/**
 * Capacitações — mock catalog (N1 · plano capacitacoes-outsider-merge).
 *
 * No-Invention: every "course" here IS the app's own taxonomy — the 7 real
 * departments and 3 real modules already shipped in skilltree-data.ts and
 * modules-data.ts. Nothing external is fabricated (no instructor names, no
 * made-up course brands). Progress percentages are DEMO ui-state, same layer
 * as the dash demo numbers (Layer C).
 *
 * Visual note: courses have no photography — media areas render as token-only
 * surfaces (department accent glow over --st-card), keeping the Arkom skin.
 */

export interface CourseEpisode {
  id: string;
  /** episode title — a real function name from the department */
  title: string;
  /** course it belongs to — a real department/module name */
  courseName: string;
  /** demo ui-state: percentage watched (0-100) */
  progress: number;
  /** lesson number inside the course */
  lesson: number;
  /** department accent hex (from skilltree-data DEPARTMENTS) */
  accent: string;
  /** capa exata da plataforma Outsider (frame vivo), nome seco = id do item */
  thumb?: string;
}

export interface Course {
  id: string;
  /** real department or module name */
  name: string;
  kind: "department" | "module" | "course";
  /** short strap derived from the dept's real strap in skilltree-data */
  strap: string;
  /** real counts from the taxonomy */
  functionsCount: number;
  jobsCount: number;
  /** department accent hex; modules use var(--st-ivory) (theme-adaptive) */
  accent: string;
  /** capa exata da plataforma Outsider (frame vivo), nome seco = id do item */
  thumb?: string;
  /** curso publicado no catálogo, mas ainda sem trilhas ou aulas */
  comingSoon?: boolean;
  /** curso publicado mas AINDA não liberado p/ este aluno (release_after_days) */
  locked?: boolean;
  /** POR QUE está bloqueado: tempo de casa (`release`) ou fora do plano (`plan`).
   *  Muda só a copy do cadeado — o bloqueio é o mesmo. */
  lockReason?: CourseLockReason;
  /** dias até liberar (quando locked por tempo) — "Libera em X dias" */
  releaseInDays?: number;
}

/** Motivo do cadeado de um curso (ClickUp 86ajrgzef acrescentou o `plan`). */
export type CourseLockReason = "release" | "plan";

/* Catálogo = SOMENTE os cursos que existem no schema `educacional`
 * (8 no total: 3 com aulas + 5 "em breve"). Os "cursos de departamento"
 * do mock antigo foram REMOVIDOS por não existirem no banco. */

/** Cursos publicados no catálogo vivo `educacional` (ids 11, 12 e 13). */
export const PORTED_COURSE_CARDS: Course[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    kind: "course",
    strap: "Curso prático para usar Claude Code como um agente de desenvolvimento: instalação, interface, comandos, fluxo de trabalho e transformação de ideias em ferramentas.",
    functionsCount: 1,
    jobsCount: 7,
    accent: "#FF9D5C",
    thumb: "/trainings/claude-code.png",
  },
  {
    id: "lovable-na-pratica",
    name: "Lovable na Prática",
    kind: "course",
    strap: "Aprenda a transformar ideias em aplicações reais com Lovable: estrutura de projeto, telas, ajustes, publicação e iteração rápida sem depender de um time técnico.",
    functionsCount: 1,
    jobsCount: 17,
    accent: "#A78BFA",
    thumb: "/trainings/lovable-na-pratica.png",
  },
  {
    id: "heygen",
    name: "HeyGen",
    kind: "course",
    strap: "Aprenda a criar vídeos profissionais com avatares de IA: roteiro, criação do avatar, cenas, ajustes de voz e exportação para campanhas, treinamentos e conteúdo comercial.",
    functionsCount: 1,
    jobsCount: 5,
    accent: "#7DD3FC",
    thumb: "/trainings/heygen.png",
  },
];

/** Cursos publicados no catálogo vivo, ainda sem módulos, aulas ou recursos. */
export const COMING_SOON_COURSES: Course[] = [
  {
    id: "capacitacao-n8n",
    name: "Capacitação N8N",
    kind: "course",
    strap: "EM BREVE",
    functionsCount: 0,
    jobsCount: 0,
    accent: "#5EEAD4",
    thumb: "/trainings/capacitacao-n8n.png",
    comingSoon: true,
  },
  {
    id: "capacitacao-codex",
    name: "Capacitação de CODEX",
    kind: "course",
    strap: "EM BREVE",
    functionsCount: 0,
    jobsCount: 0,
    accent: "#7DD3FC",
    thumb: "/trainings/capacitacao-codex.png",
    comingSoon: true,
  },
  {
    id: "capacitacao-gpt",
    name: "Capacitação GPT",
    kind: "course",
    strap: "EM BREVE",
    functionsCount: 0,
    jobsCount: 0,
    accent: "#A78BFA",
    thumb: "/trainings/capacitacao-gpt.png",
    comingSoon: true,
  },
  {
    id: "capacitacao-shopify",
    name: "Capacitação em SHOPIFY",
    kind: "course",
    strap: "EM BREVE",
    functionsCount: 0,
    jobsCount: 0,
    accent: "#FACC15",
    thumb: "/trainings/capacitacao-shopify.png",
    comingSoon: true,
  },
  {
    id: "capacitacao-antigravity",
    name: "Capacitação em Antigravity",
    kind: "course",
    strap: "EM BREVE",
    functionsCount: 0,
    jobsCount: 0,
    accent: "#FB7185",
    thumb: "/trainings/capacitacao-antigravity.png",
    comingSoon: true,
  },
];

/* ── Continuar assistindo — vazio: nenhuma aula tem progresso real ainda ── */
export const CONTINUE_WATCHING: CourseEpisode[] = [];

/* ── Cursos (com aulas) — os 3 cursos vivos do catálogo `educacional` ───── */
export const TOP_NINE: Course[] = [...PORTED_COURSE_CARDS];

/* ── Séries — removido (era só os departamentos-mock, fora do banco) ────── */
export const SERIES: Course[] = [];

/* ── Cursos que você pode gostar — removido (dependia dos departamentos) ── */
export const MIGHT_LIKE: Course[] = [];

/* ── Módulos & Aulas (N1 · plano capacitacoes-modulos-aula) ────────────────
 * Course detail data. Modules = the course's real FUNCTIONS from
 * skilltree-data; lessons = the function's real JOBS (No-Invention).
 * Durations/progress are deterministic DEMO ui-state (derived from name
 * lengths — same layer as the dash demo numbers). The rename the source
 * itself suggested: seasons are labeled "Módulo {n}" (its mobile select).
 */

/** Material da aula (schema: lesson_resources) — surface p/ o aluno na aba "Materiais". */
export interface LessonMaterial {
  /** id no banco (lesson_resources.id) */
  id: number;
  title: string;
  /** 'pdf' | 'image' | 'zip' | 'external_link' */
  resourceType: string;
  url: string;
}

export interface Lesson {
  id: string;
  /**
   * id REAL da aula no banco (lessons.id) — carregado pelo loader (data.ts) e
   * usado pelas server actions (toggleProgress/toggleLike/rateLesson). O `id`
   * acima é o slug de ROTA `curso--NN`, NÃO serve para gravar. Opcional porque
   * o mock estático (content.ts, consumido pelo /home) não tem id de banco.
   */
  dbLessonId?: number;
  /** real job title from the taxonomy */
  title: string;
  /** demo minutes */
  minutes: number;
  /** demo ui-state 0-100 */
  progress: number;
  completed: boolean;
  /** curtida REAL do aluno logado (lesson_likes.liked=1) */
  liked?: boolean;
  /** avaliação REAL do aluno logado (lesson_ratings.rating; 0/undefined = sem nota) */
  rating?: number;
  /** episode thumb (exact live frame) — optional; accent glow fallback */
  thumb?: string;
  /** real video source; absent keeps the honest demo-player fallback */
  videoUrl?: string;
  provider?: "youtube" | "panda";
  /** real job description from the taxonomy (No-Invention) */
  desc: string;
  /** the job's real skill files — the lesson's "course files" */
  skills: string[];
  /** materiais REAIS da aula (lesson_resources), ordenados por sort_order,id */
  materials?: LessonMaterial[];
}

export interface CourseModule {
  id: string;
  /** real function name from the taxonomy */
  name: string;
  position: number;
  lessons: Lesson[];
}

export interface CourseDetail {
  id: string;
  /** id REAL do curso no banco (courses.id) — usado p/ course_access_logs (PA-03) */
  dbCourseId?: number;
  name: string;
  kind: "department" | "module" | "course";
  strap: string;
  accent: string;
  cover?: string;
  modules: CourseModule[];
  comingSoon?: boolean;
  /** curso publicado mas AINDA não liberado p/ este aluno (guard de acesso) */
  locked?: boolean;
  /** por que está bloqueado: tempo de casa (`release`) ou fora do plano (`plan`) */
  lockReason?: CourseLockReason;
  /** dias até liberar (quando locked por tempo) */
  releaseInDays?: number;
}

const COMING_SOON_DETAILS: Record<string, CourseDetail> = Object.fromEntries(
  COMING_SOON_COURSES.map((course) => [
    course.id,
    {
      id: course.id,
      name: course.name,
      kind: course.kind,
      strap: course.strap,
      accent: course.accent,
      cover: course.thumb,
      modules: [],
      comingSoon: true,
    },
  ] as const)
);

export const COURSE_DETAILS: Record<string, CourseDetail> = {
  ...COMING_SOON_DETAILS,
  /* Catálogo vivo `educacional`, extraído em transação READ ONLY.
   * O schema não possui coluna de duração: Claude traz minutos aproximados
   * na descrição; Lovable e HeyGen usam Math.ceil(sum(#EXTINF) / 60) dos
   * manifests HLS, evitando exibir menos tempo que o vídeo. Resources vivos: 0,
   * portanto skills permanece []. */
  "claude-code": {
    id: "claude-code", name: "Claude Code", kind: "course",
    strap: "Curso prático para usar Claude Code como um agente de desenvolvimento: instalação, interface, comandos, fluxo de trabalho e transformação de ideias em ferramentas.",
    accent: "#FF9D5C", cover: "/trainings/claude-code.png",
    modules: [
      {
        id: "claude-code-m1", name: "Claude Code na prática", position: 1,
        lessons: [
          { id: "claude-code--claude-code-na-pratica--o-que-e-o-claude-code", title: "O que é o Claude Code", minutes: 3, progress: 0, completed: false, provider: "panda", desc: "Aula 1 do curso Claude Code. Duração aproximada: 3 min.", skills: [] },
          { id: "claude-code--claude-code-na-pratica--visao-claude-code-como-seu-time", title: "Visão: Claude Code como seu time", minutes: 6, progress: 0, completed: false, provider: "panda", desc: "Aula 2 do curso Claude Code. Duração aproximada: 6 min.", skills: [] },
          { id: "claude-code--claude-code-na-pratica--baixando-o-claude-code-na-pratica", title: "Baixando o Claude Code na prática", minutes: 5, progress: 0, completed: false, provider: "panda", desc: "Aula 3 do curso Claude Code. Duração aproximada: 5 min.", skills: [] },
          { id: "claude-code--claude-code-na-pratica--tour-pela-interface-e-seu-primeiro-agente", title: "Tour pela interface e seu primeiro agente", minutes: 7, progress: 0, completed: false, provider: "panda", desc: "Aula 4 do curso Claude Code. Duração aproximada: 7 min.", skills: [] },
          { id: "claude-code--claude-code-na-pratica--comandos-claude-code", title: "Comandos Claude Code", minutes: 5, progress: 0, completed: false, provider: "panda", desc: "Aula 5 do curso Claude Code. Duração aproximada: 5 min.", skills: [] },
          { id: "claude-code--claude-code-na-pratica--fluxo-de-ouro-cerebro-empresarial", title: "Fluxo de ouro + Cérebro Empresarial", minutes: 7, progress: 0, completed: false, provider: "panda", desc: "Aula 6 do curso Claude Code. Duração aproximada: 7 min.", skills: [] },
          { id: "claude-code--claude-code-na-pratica--transformando-ideias-em-ferramentas", title: "Transformando ideias em ferramentas", minutes: 13, progress: 0, completed: false, provider: "panda", desc: "Aula 7 do curso Claude Code. Duração aproximada: 13 min.", skills: [] },
        ],
      },
    ],
  },
  "lovable-na-pratica": {
    id: "lovable-na-pratica", name: "Lovable na Prática", kind: "course",
    strap: "Aprenda a transformar ideias em aplicações reais com Lovable: estrutura de projeto, telas, ajustes, publicação e iteração rápida sem depender de um time técnico.",
    accent: "#A78BFA", cover: "/trainings/lovable-na-pratica.png",
    modules: [
      {
        id: "lovable-na-pratica-m1", name: "Aulas", position: 1,
        lessons: [
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-01", title: "Lovable na Prática - Aula 01", minutes: 2, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 01. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-02", title: "Lovable na Prática - Aula 02", minutes: 6, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 02. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-03", title: "Lovable na Prática - Aula 03", minutes: 9, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 03. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-04", title: "Lovable na Prática - Aula 04", minutes: 4, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 04. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-05", title: "Lovable na Prática - Aula 05", minutes: 9, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 05. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-06", title: "Lovable na Prática - Aula 06", minutes: 5, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 06. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-07", title: "Lovable na Prática - Aula 07", minutes: 7, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 07. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-08", title: "Lovable na Prática - Aula 08", minutes: 10, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 08. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-09", title: "Lovable na Prática - Aula 09", minutes: 4, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 09. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-10", title: "Lovable na Prática - Aula 10", minutes: 13, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 10. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-11", title: "Lovable na Prática - Aula 11", minutes: 6, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 11. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-12", title: "Lovable na Prática - Aula 12", minutes: 8, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 12. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-13", title: "Lovable na Prática - Aula 13", minutes: 6, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 13. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-14", title: "Lovable na Prática - Aula 14", minutes: 13, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 14. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-15", title: "Lovable na Prática - Aula 15", minutes: 21, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 15. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-16", title: "Lovable na Prática - Aula 16", minutes: 7, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 16. Assista até o final.", skills: [] },
          { id: "lovable-na-pratica--aulas--lovable-na-pratica-aula-17", title: "Lovable na Prática - Aula 17", minutes: 11, progress: 0, completed: false, provider: "panda", desc: "Nesta aula: lovable na prática - aula 17. Assista até o final.", skills: [] },
        ],
      },
    ],
  },
  "heygen": {
    id: "heygen", name: "HeyGen", kind: "course",
    strap: "Aprenda a criar vídeos profissionais com avatares de IA: roteiro, criação do avatar, cenas, ajustes de voz e exportação para campanhas, treinamentos e conteúdo comercial.",
    accent: "#7DD3FC", cover: "/trainings/heygen.png",
    modules: [
      {
        id: "heygen-m1", name: "Aulas", position: 1,
        lessons: [
          { id: "heygen--aulas--heygen-aula-01", title: "HeyGen - Aula 01", minutes: 7, progress: 0, completed: false, provider: "panda", desc: "Primeiro contato com HeyGen, principais recursos e como estruturar um vídeo com avatar de IA.", skills: [] },
          { id: "heygen--aulas--heygen-aula-02", title: "HeyGen - Aula 02", minutes: 5, progress: 0, completed: false, provider: "panda", desc: "Configuração da base do vídeo: roteiro, avatar, voz e organização da cena.", skills: [] },
          { id: "heygen--aulas--heygen-aula-03", title: "HeyGen - Aula 03", minutes: 5, progress: 0, completed: false, provider: "panda", desc: "Refinamento da apresentação, ajustes visuais e boas práticas para deixar o vídeo profissional.", skills: [] },
          { id: "heygen--aulas--heygen-aula-04", title: "HeyGen - Aula 04", minutes: 5, progress: 0, completed: false, provider: "panda", desc: "Finalização do projeto, revisão, exportação e aplicações comerciais do material produzido.", skills: [] },
          { id: "heygen--aulas--hey-gen-aula-05", title: "Hey Gen - Aula 05", minutes: 5, progress: 0, completed: false, provider: "panda", desc: "", skills: [] },
        ],
      },
    ],
  },
};

/** aliases: "-2" card ids on the main page point at the same course */
export function resolveCourseId(raw: string): string {
  return raw.replace(/-2$/, "");
}

export interface LessonRef {
  course: CourseDetail;
  module: CourseModule;
  lesson: Lesson;
  /** flat position for "Aula N" labels */
  index: number;
}

export function findLesson(lessonId: string): LessonRef | null {
  for (const course of Object.values(COURSE_DETAILS)) {
    let idx = 0;
    for (const track of course.modules) {
      for (const lesson of track.lessons) {
        idx += 1;
        if (lesson.id === lessonId) return { course, module: track, lesson, index: idx };
      }
    }
  }
  return null;
}

/** Continuar Assistindo episode ids → real lesson ids (first partially-watched).
 * Vazio: os episódios-mock de departamento saíram (não existiam no banco). */
export const EPISODE_TO_LESSON: Record<string, string> = {};
