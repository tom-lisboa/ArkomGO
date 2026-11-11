"use client";

// Mentores na área do ALUNO (Tarefa 2, migration 0014) — tema STEEL, como o
// resto de /mentorships.
//
// Três peças:
//   <MentorsShowcase>     a seção "Quem conduz as mentorias" da página
//   <EventMentorsStrip>   a faixa de mentores dentro da capa do evento
//   <MentorModal>         o perfil (foto, especialidade, descrição, agenda)
//
// UM MODAL POR VEZ: clicar num mentor DENTRO da capa do evento fecha a capa e
// abre o perfil. Empilhar dois <Modal> (ambos portais em z-50) faria o Esc
// fechar os dois e o `overflow: hidden` do body ser desfeito pelo de dentro ao
// desmontar. Como o perfil já lista os próximos encontros do mentor, o aluno
// não perde o contexto.
//
// SEM FOTO É ESTADO NORMAL, não erro: <CoverImage> já cai num gradiente com as
// iniciais (mesmo componente das capas de curso/mentoria — inclusive o
// fallback de erro de carregamento e o <img> da rota autenticada de mídia).

import { CalendarDays, UsersRound } from "lucide-react";
import { CoverImage, Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const GOLD = "var(--arkom-gold, #b9915b)";

/** Espelho client-side de `StudentMentor` (src/lib/mentors.ts). */
export type MentorView = {
  id: number;
  slug: string;
  full_name: string;
  specialty: string | null;
  bio: string | null;
  photo_url: string | null;
  upcoming: { id: number; title: string; event_date: string; starts_at: string }[];
};

/** 'YYYY-MM-DD' → 'dd/mm' sem risco de fuso (o texto já é a data local). */
function diaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return d && m ? `${d}/${m}` : iso;
}

/**
 * A vitrine. O grid é `auto-fit` com trilha de largura MÁXIMA (não `1fr`): com
 * 3 mentores as fotos ficam do mesmo tamanho que com 8, alinhadas à esquerda,
 * em vez de esticarem para preencher a linha e parecerem um vazio decorado.
 * No mobile são sempre 2 por linha.
 */
export function MentorsShowcase({
  mentors,
  onOpen,
}: {
  mentors: MentorView[];
  onOpen: (mentorId: number) => void;
}) {
  const t = useT();
  if (mentors.length === 0) return null;

  return (
    <section className="mt-10" data-testid="mentors-showcase">
      <div className="mb-4 flex items-center gap-2">
        <UsersRound className="size-[18px]" style={{ color: GOLD }} />
        <h2 className="text-[17px] font-bold tracking-[-0.01em] text-st-ivory">
          {t.mentorias.mentorsTitle}
        </h2>
      </div>
      <p className="mb-4 max-w-[720px] text-[14px] leading-relaxed text-st-ink-2">
        {t.mentorias.mentorsSub}
      </p>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(160px,196px))] sm:gap-4">
        {mentors.map((mentor) => (
          <li key={mentor.slug}>
            <button
              type="button"
              onClick={() => onOpen(mentor.id)}
              title={t.mentorias.mentorOpen(mentor.full_name)}
              data-testid="mentor-card"
              className="group flex w-full flex-col gap-2.5 rounded-[14px] border border-st-line bg-st-card p-2.5 text-left transition-colors hover:border-st-line-2 hover:bg-st-card-2"
            >
              <CoverImage
                src={mentor.photo_url}
                title={mentor.full_name}
                aspect="square"
                className="rounded-[10px]"
              />
              <span className="flex flex-col gap-0.5 px-0.5 pb-0.5">
                <span className="truncate text-[14px] font-semibold text-st-ivory">
                  {mentor.full_name}
                </span>
                {mentor.specialty ? (
                  <span className="line-clamp-2 text-[12px] leading-snug text-st-ink-3">
                    {mentor.specialty}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Faixa compacta de mentores dentro da capa do evento. */
export function EventMentorsStrip({
  mentors,
  onOpen,
}: {
  mentors: MentorView[];
  onOpen: (mentorId: number) => void;
}) {
  const t = useT();
  if (mentors.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="event-mentors">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-st-ink-3">
        {t.mentorias.mentorsOnEvent}
      </span>
      <div className="flex flex-wrap gap-2">
        {mentors.map((mentor) => (
          <button
            key={mentor.slug}
            type="button"
            onClick={() => onOpen(mentor.id)}
            title={t.mentorias.mentorOpen(mentor.full_name)}
            className="inline-flex items-center gap-2 rounded-full border border-st-line bg-st-card py-1 pl-1 pr-3 text-left transition-colors hover:border-st-line-2 hover:bg-st-card-2"
          >
            {/* O recorte circular fica no PAI: `cn` é join puro (sem
                tailwind-merge), então `rounded-full` no CoverImage conviveria
                com o `rounded-card` dele e a vitória dependeria da ordem do
                CSS gerado. O `overflow-hidden` aqui não depende de ordem. */}
            <span className="size-7 shrink-0 overflow-hidden rounded-full">
              <CoverImage
                src={mentor.photo_url}
                title={mentor.full_name}
                aspect="square"
                className="rounded-full"
              />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[12.5px] font-semibold text-st-ivory">
                {mentor.full_name}
              </span>
              {mentor.specialty ? (
                <span className="truncate text-[11px] leading-tight text-st-ink-3">
                  {mentor.specialty}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** O perfil do mentor. Mesma casca steel da capa do evento. */
export function MentorModal({
  mentor,
  onClose,
}: {
  mentor: MentorView | null;
  onClose: () => void;
}) {
  const t = useT();
  if (!mentor) return null;

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      className="border-st-line-2 bg-st-bg st-modal-elev"
    >
      <div className="flex flex-col gap-4" data-testid="mentor-modal">
        <div className="flex items-start gap-4">
          <span className="w-[104px] shrink-0">
            <CoverImage
              src={mentor.photo_url}
              title={mentor.full_name}
              aspect="square"
              className="rounded-[12px]"
            />
          </span>
          <span className="flex min-w-0 flex-col gap-1 pt-1">
            <h2 className="text-[19px] font-bold tracking-[-0.01em] text-st-ivory">
              {mentor.full_name}
            </h2>
            {mentor.specialty ? (
              <span className="text-[13px] leading-snug" style={{ color: GOLD }}>
                {mentor.specialty}
              </span>
            ) : null}
          </span>
        </div>

        <p
          className={cn(
            "whitespace-pre-line text-[14px] leading-relaxed",
            mentor.bio ? "text-st-ink-2" : "text-st-ink-3",
          )}
        >
          {mentor.bio || t.mentorias.mentorNoBio}
        </p>

        <div className="flex flex-col gap-2 rounded-[12px] border border-st-line bg-st-card p-3">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-st-ink-3">
            <CalendarDays className="size-3.5" style={{ color: GOLD }} />
            {t.mentorias.mentorNext}
          </span>
          {mentor.upcoming.length === 0 ? (
            <span className="text-[13px] text-st-ink-3">{t.mentorias.mentorNoNext}</span>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {mentor.upcoming.map((evento) => (
                <li
                  key={evento.id}
                  className="flex items-baseline gap-2 text-[13px] text-st-ink-2"
                >
                  <span className="shrink-0 font-mono text-[12px] text-st-ivory">
                    {diaMes(evento.event_date)}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] text-st-ink-3">
                    {evento.starts_at.replace(":", "h")}
                  </span>
                  <span className="truncate">{evento.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
