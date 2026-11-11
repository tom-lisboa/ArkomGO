"use client";

import {
  Bookmark,
  Clock3,
  Flame,
  GraduationCap,
  Layers,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";

import { useT } from "@/lib/i18n";
import type { IconType } from "@/lib/hub-data";
import { CourseRail } from "./CourseRail";
import { PortraitCard, TopNineCard } from "./cards";
import type { Course } from "./content";
import type { CourseRailIcon, CourseRailView } from "./rails";

/**
 * Corpo da listagem de Capacitações (client) — recebe o catálogo já carregado
 * do app_arkom pela page (server). Cursos com aulas viram os cards "Top";
 * cursos publicados sem aulas caem em "Em breve".
 *
 * Duas fontes possíveis para as prateleiras:
 *  · `rails` (config do /admin, migration 0013) — quando a flag
 *    `course_rails_enabled` está LIGADA e a configuração produziu ao menos uma
 *    prateleira com curso;
 *  · o layout HARDCODED abaixo — o comportamento histórico, usado sempre que
 *    `rails` vem `null` (flag desligada, banco sem a 0013, erro de leitura ou
 *    configuração vazia).
 */
export function CapacitacoesBody({
  cards,
  comingSoon,
  rails = null,
}: {
  cards: Course[];
  comingSoon: Course[];
  rails?: CourseRailView[] | null;
}) {
  const t = useT();
  return (
    <div className="w-full">
      <header className="mb-10">
        <h1 className="text-[27px] font-bold leading-none tracking-[-0.02em] text-st-ivory">
          {t.capacitacoes.title}
          <span className="ml-2.5 align-baseline text-[15px] font-normal text-st-ink-2">
            {t.capacitacoes.subtitle}
          </span>
        </h1>
        <p className="mt-4 max-w-[760px] text-[15px] font-normal leading-relaxed text-st-ink-2">
          {t.capacitacoes.intro}
        </p>
      </header>

      {rails && rails.length > 0 ? (
        rails.map((rail) => <ConfiguredRail key={rail.slug} rail={rail} />)
      ) : (
        <>
          {cards.length > 0 ? (
            <CourseRail
              icon={Trophy}
              title={t.capacitacoes.topNine(cards.length)}
              gap={32}
              peek={4.5}
            >
              {cards.map((course, i) => (
                <TopNineCard key={course.id} course={course} rank={i + 1} />
              ))}
            </CourseRail>
          ) : null}

          {comingSoon.length > 0 ? (
            <CourseRail icon={Clock3} title={t.capacitacoes.comingSoon}>
              {comingSoon.map((course) => (
                <PortraitCard key={course.id} course={course} />
              ))}
            </CourseRail>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Ícones oferecidos no /admin → componentes lucide. */
const RAIL_ICONS: Record<CourseRailIcon, IconType> = {
  trophy: Trophy,
  clock: Clock3,
  graduation: GraduationCap,
  sparkles: Sparkles,
  flame: Flame,
  star: Star,
  layers: Layers,
  bookmark: Bookmark,
};

/**
 * Uma prateleira vinda da configuração. Os parâmetros de layout (gap e o
 * "peek" do Netflix) seguem o estilo do card, exatamente como no hardcoded:
 * card de ranking = gap 32 + 4,5 cards visíveis; pôster = gap 24, larguras
 * naturais. Assim a prateleira cabe no desktop padrão sem scroll quebrado, e
 * no mobile mantém o comportamento atual do CourseRail (arrastar + chevrons).
 */
function ConfiguredRail({ rail }: { rail: CourseRailView }) {
  const rank = rail.cardStyle === "rank";
  // "Todos os cursos" (mode `todos`) lista TUDO na tela, em GRADE — sem trilho
  // (dono, 2026-07-25). Cards mantêm o tamanho fixo (322×425) e quebram linha.
  if (rail.mode === "todos" && !rank) {
    const Icon = RAIL_ICONS[rail.icon] ?? GraduationCap;
    return (
      <section className="relative z-20 pb-10 md:mb-12">
        <div className="mb-6 flex items-center">
          <Icon className="size-6 text-st-ink-2" />
          <h2 className="ml-4 text-2xl font-medium leading-8 text-st-ivory max-md:text-lg">
            {rail.title}
          </h2>
        </div>
        {/* 4 por linha ocupando a largura TOTAL (mesma do trilho do Top) —
            cards fluidos; 2 colunas no mobile. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {rail.courses.map((course) => (
            <PortraitCard
              key={course.id}
              course={course}
              disabled={!rail.clickable || course.comingSoon === true}
              fluid
            />
          ))}
        </div>
      </section>
    );
  }
  return (
    <CourseRail
      icon={RAIL_ICONS[rail.icon] ?? GraduationCap}
      title={rail.title}
      gap={rank ? 32 : 24}
      peek={rank ? 4.5 : undefined}
    >
      {rail.courses.map((course, i) =>
        rank ? (
          <TopNineCard
            key={course.id}
            course={course}
            rank={i + 1}
            disabled={!rail.clickable || course.comingSoon === true}
          />
        ) : (
          // "Em breve" nunca navega, mesmo dentro de prateleira clicável
          // ("Todos os cursos") — regra do plano: anunciado, não visitado.
          <PortraitCard
            key={course.id}
            course={course}
            disabled={!rail.clickable || course.comingSoon === true}
          />
        ),
      )}
    </CourseRail>
  );
}

/* Blocos de categoria com popover ("Ver todos") existiram por algumas horas em
   2026-07-25 e foram substituídos, por decisão do dono, pelos trilhos cheios
   empilhados: Top 5 → Todos os cursos → Em breve (ver TRACKING D14). */

