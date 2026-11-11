// lib/consultor/catalogo.ts — o GROUNDING do Gestor IA.
//
// Monta, a partir das fontes REAIS (courses/lessons via trainings/data.ts e
// apps via components/apps/data.ts), duas coisas:
//   1. o texto de catálogo injetado no system prompt (compacto, com refs exatas
//      e o progresso do aluno — o Gestor sabe o que ele já concluiu);
//   2. o índice de enriquecimento: o LLM devolve só {kind, ref, motivo} e o
//      servidor completa título/desc/url/thumb do item real. Ref desconhecida
//      é descartada — o modelo não consegue inventar item de catálogo.
//
// Sem RAG/embeddings de propósito: o catálogo inteiro cabe folgado num prompt.

import { getCatalog, getCourseDetail, type StudentContext } from "@/components/trainings/data";
import { loadPublishedApps, type StudentApp } from "@/components/apps/data";
import { DEPARTMENTS } from "@/components/map/skilltree-data";
import type { ConsultorCard, ConsultorCardKind } from "./tipos";

/**
 * Camada de CONHECIMENTO (não-recomendável): o mapa Arkom completo — 6 áreas,
 * 13 funções/soluções e seus módulos reais, com descrição e ferramentas. Dá ao
 * Gestor o vocabulário de diagnóstico e o detalhe do que cada solução faz
 * por dentro. As refs recomendáveis continuam sendo SÓ as do catálogo.
 */
function buildMapaText(): string {
  const linhas: string[] = [];
  for (const dept of DEPARTMENTS) {
    linhas.push(`### Área ${dept.name} (${dept.sub})`);
    linhas.push(dept.intro);
    for (const fn of dept.functions) {
      linhas.push(`- Solução "${fn.name}" — módulos:`);
      for (const job of fn.jobs) {
        const tools = job.tools.length ? ` [ferramentas: ${job.tools.join(", ")}]` : "";
        linhas.push(`  · ${job.name}: ${job.desc.slice(0, 160)}${tools}`);
      }
    }
    linhas.push("");
  }
  return linhas.join("\n");
}

type LessonEntry = {
  titulo: string;
  desc: string;
  thumb?: string;
  courseName: string;
  courseSlug: string;
  ordinal: number;
  completed: boolean;
  accent: string;
};

type CourseEntry = {
  slug: string;
  nome: string;
  strap: string;
  cover: string;
  lessonsCount: number;
  locked: boolean;
  comingSoon: boolean;
  accent: string;
};

export type ConsultorCatalog = {
  /** texto pronto para o system prompt */
  promptText: string;
  apps: Map<string, StudentApp>;
  cursos: Map<string, CourseEntry>;
  aulas: Map<string, LessonEntry>;
};

/** Carrega o catálogo completo (apps + cursos + aulas) com o estado do aluno. */
export async function loadConsultorCatalog(user: StudentContext): Promise<ConsultorCatalog> {
  const [apps, { cards, comingSoon }] = await Promise.all([
    loadPublishedApps(),
    getCatalog(user),
  ]);

  const appIndex = new Map<string, StudentApp>(apps.map((a) => [String(a.id), a]));
  const cursos = new Map<string, CourseEntry>();
  const aulas = new Map<string, LessonEntry>();

  const linhas: string[] = [];

  linhas.push("# MAPA ARKOM (conhecimento de contexto — os itens daqui NÃO são refs recomendáveis)");
  linhas.push(buildMapaText());

  linhas.push("# CATÁLOGO RECOMENDÁVEL (única fonte de refs válidas para os cards)");
  linhas.push("");
  linhas.push("## SOLUÇÕES (apps prontos — ref = id numérico)");
  for (const app of apps) {
    const status = app.available ? "" : " [EM BREVE — não recomendar como caminho imediato]";
    const tagline = app.tagline ? ` — ${app.tagline}` : "";
    const desc = app.description ? ` ${app.description.slice(0, 360)}` : "";
    linhas.push(`- ref=${app.id} · ${app.name} (${app.categoryName})${status}${tagline}.${desc}`.trim());
  }

  linhas.push("");
  linhas.push("## CAPACITAÇÕES (cursos — ref = slug) e AULAS (ref = slug--NN)");

  // detalhe curso a curso (módulos + aulas + progresso do aluno); cursos ainda
  // bloqueados/sem aulas entram só como card de curso, sem aulas recomendáveis
  for (const card of cards) {
    const detail = await getCourseDetail(card.id, user);
    if (!detail) continue;
    cursos.set(card.id, {
      slug: card.id,
      nome: detail.name,
      strap: detail.strap,
      cover: detail.cover ?? "",
      lessonsCount: card.jobsCount,
      locked: !!detail.locked,
      comingSoon: !!card.comingSoon,
      accent: card.accent,
    });
    if (detail.locked) {
      linhas.push(`- curso ref=${card.id} · ${detail.name} [AINDA NÃO LIBERADO para este aluno]: ${detail.strap}`);
      continue;
    }
    linhas.push(`- curso ref=${card.id} · ${detail.name} (${card.jobsCount} aulas): ${detail.strap}`);
    let ordinal = 0;
    for (const mod of detail.modules) {
      for (const lesson of mod.lessons) {
        ordinal += 1;
        aulas.set(lesson.id, {
          titulo: lesson.title,
          desc: lesson.desc,
          thumb: lesson.thumb,
          courseName: detail.name,
          courseSlug: card.id,
          ordinal,
          completed: lesson.completed,
          accent: card.accent,
        });
        const feita = lesson.completed ? " [aluno JÁ CONCLUIU]" : "";
        const desc = lesson.desc ? `: ${lesson.desc.slice(0, 140)}` : "";
        linhas.push(`  - aula ref=${lesson.id} · ${lesson.title}${feita}${desc}`);
      }
    }
  }

  for (const card of comingSoon) {
    cursos.set(card.id, {
      slug: card.id,
      nome: card.name,
      strap: card.strap,
      cover: card.thumb ?? "",
      lessonsCount: 0,
      locked: false,
      comingSoon: true,
      accent: card.accent,
    });
    linhas.push(`- curso ref=${card.id} · ${card.name} [EM BREVE — sem aulas ainda]`);
  }

  return {
    promptText: linhas.join("\n"),
    apps: appIndex,
    cursos,
    aulas,
  };
}

/* ── Coerência motivo-item (o bug do "motivo trocado") ────────────────────── */

function normTexto(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function tituloDe(catalog: ConsultorCatalog, kind: ConsultorCardKind, ref: string): string {
  if (kind === "solucao") return catalog.apps.get(ref)?.name ?? "";
  if (kind === "curso") return catalog.cursos.get(ref)?.nome ?? "";
  if (kind === "genesis") return "Genesis";
  return catalog.aulas.get(ref)?.titulo ?? "";
}

/**
 * Heurística do "motivo trocado" (benchmark: card SOCIAL com texto de CRM): o
 * motivo cita textualmente o NOME de outro item do catálogo sem citar o do
 * próprio item. Itens relacionados não acusam (a aula pode citar o curso dela,
 * o curso pode citar as próprias aulas). Match por nome completo com borda de
 * palavra — conservador de propósito: falso positivo só rebaixa o motivo pra
 * descrição real do item, nunca inventa nada.
 */
export function motivoTrocado(
  catalog: ConsultorCatalog,
  kind: ConsultorCardKind,
  ref: string,
  motivo: string
): boolean {
  // o motivo de um card genesis descreve a solução A CONSTRUIR e pode citar
  // itens do catálogo legitimamente ("nada cobre X como o seu processo pede")
  if (kind === "genesis") return false;
  const texto = normTexto(motivo);
  if (!texto.trim()) return false;

  const cita = (nome: string): boolean => {
    if (nome.length < 4) return false;
    const esc = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, "u").test(texto);
  };

  const proprio = normTexto(tituloDe(catalog, kind, ref));
  if (proprio && cita(proprio)) return false;

  // nomes que podem aparecer legitimamente no motivo deste item
  const permitidos = new Set<string>([proprio]);
  if (kind === "aula") {
    const aula = catalog.aulas.get(ref);
    if (aula) permitidos.add(normTexto(aula.courseName));
  }
  if (kind === "curso") {
    for (const aula of catalog.aulas.values()) {
      if (aula.courseSlug === ref) permitidos.add(normTexto(aula.titulo));
    }
  }

  const candidatos: { kind: ConsultorCardKind; ref: string; nome: string }[] = [];
  for (const [id, app] of catalog.apps) candidatos.push({ kind: "solucao", ref: id, nome: normTexto(app.name) });
  for (const [slug, curso] of catalog.cursos) candidatos.push({ kind: "curso", ref: slug, nome: normTexto(curso.nome) });
  for (const [id, aula] of catalog.aulas) candidatos.push({ kind: "aula", ref: id, nome: normTexto(aula.titulo) });

  for (const c of candidatos) {
    if (c.kind === kind && c.ref === ref) continue;
    if (!c.nome || c.nome.length < 4 || permitidos.has(c.nome)) continue;
    // nomes aninhados (curso e aula homônimos, "X" dentro de "X Pro") não acusam
    if (proprio && (proprio.includes(c.nome) || c.nome.includes(proprio))) continue;
    if (cita(c.nome)) return true;
  }
  return false;
}

/**
 * Enriquecimento: transforma a referência crua do LLM num card completo com os
 * dados REAIS do catálogo. Retorna null para ref desconhecida (o chamador
 * descarta — anti-alucinação). `resultado` é texto do LLM como o motivo: passa
 * direto (a rota já normaliza com semTravessao).
 */
export function enrichCard(
  catalog: ConsultorCatalog,
  kind: ConsultorCardKind,
  ref: string,
  motivo: string,
  resultado?: string
): ConsultorCard | null {
  // card sintético do Genesis: não vive no catálogo, é a saída "construir a
  // solução que não existe". Ref é sempre "genesis" (o schema instrui; refs
  // criativas OU vazias do modelo caem aqui pra ref canônica — por isso este
  // branch vem ANTES do guard de ref vazia).
  if (kind === "genesis") {
    return {
      kind,
      ref: "genesis",
      titulo: "Construir no Genesis",
      desc: "Entrevista guiada que vira um projeto em 8 etapas, com arquitetura, ferramentas, plano em 3 sprints e o prompt do MVP pronto pro Lovable.",
      motivo,
      resultado,
      url: "/genesis",
      meta: "Solução sob medida",
      accent: "#c58b5f",
    };
  }

  const cleanRef = ref.trim();
  if (!cleanRef) return null;

  if (kind === "solucao") {
    const app = catalog.apps.get(cleanRef);
    if (!app) return null;
    return {
      kind,
      ref: cleanRef,
      titulo: app.name,
      desc: app.strap || app.description || "",
      motivo,
      resultado,
      url: `/apps/${app.id}`,
      thumb: app.coverUrl ?? undefined,
      meta: app.available ? app.categoryName : `${app.categoryName} · Em breve`,
      accent: app.accent,
    };
  }

  if (kind === "curso") {
    const curso = catalog.cursos.get(cleanRef);
    if (!curso) return null;
    return {
      kind,
      ref: cleanRef,
      titulo: curso.nome,
      desc: curso.strap,
      motivo,
      resultado,
      url: `/trainings/${curso.slug}`,
      thumb: curso.cover || undefined,
      meta: curso.comingSoon
        ? "Em breve"
        : curso.locked
          ? "Libera em breve para você"
          : `${curso.lessonsCount} aulas`,
      accent: curso.accent,
    };
  }

  const aula = catalog.aulas.get(cleanRef);
  if (!aula) return null;
  return {
    kind,
    ref: cleanRef,
    titulo: aula.titulo,
    desc: aula.desc,
    motivo,
    resultado,
    url: `/trainings/lesson/${cleanRef}`,
    thumb: aula.thumb,
    meta: `${aula.courseName} · aula ${String(aula.ordinal).padStart(2, "0")}`,
    accent: aula.accent,
  };
}
