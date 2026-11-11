"use client";

import "../trainings/trainings.css";
import { useEffect, useMemo, useState } from "react";
import { Coins } from "lucide-react";
import { useT } from "@/lib/i18n";
import { ToastProvider } from "@/components/ui";
import {
  MentorshipCalendar,
  type StudentCreditView,
} from "@/components/mentorships/Calendar";
import {
  MentorModal,
  MentorsShowcase,
  type MentorView,
} from "@/components/mentorships/mentors";
import type { MentorshipEvent } from "@/components/mentorships/event-utils";

/**
 * Corpo client de /mentorships. Recebe os eventos publicados + os ids já
 * confirmados (server component) e renderiza o header (i18n "Mentorias") +
 * o calendário interativo (clicável → capa/EventModal → confirmar presença) +
 * a vitrine de mentores (Tarefa 2).
 *
 * A área do aluno não monta um <ToastProvider> global (só o admin e o genesis),
 * então o provider é montado aqui — mesmo padrão de (aluno)/genesis — para o
 * feedback de confirmação de presença (useToast no EventModal).
 *
 * O modal do MENTOR mora aqui, e não dentro do calendário, porque ele é aberto
 * de dois lugares (a vitrine e a capa do evento) e só pode existir um modal de
 * cada vez: quando o aluno clica num mentor a partir da capa, o calendário
 * fecha a capa e este componente abre o perfil.
 */
export function MentoriasBody({
  events,
  confirmedEventIds,
  credit,
  mentors = [],
  mentorsByEvent = {},
}: {
  events: MentorshipEvent[];
  confirmedEventIds: number[];
  /** Resumo de créditos do aluno. `visible: false` ⇒ a tela fica como sempre. */
  credit?: StudentCreditView;
  /** Mentores publicados (vazio com a flag `mentors_enabled` desligada). */
  mentors?: MentorView[];
  /** eventId → ids de mentor, na ordem de exibição. */
  mentorsByEvent?: Record<number, number[]>;
}) {
  const t = useT();
  // Perfil do mentor + DE ONDE ele foi aberto: vindo da capa de um evento, o
  // X do perfil VOLTA para a capa (pedido do dono, 2026-07-25); vindo da
  // vitrine, fecha e pronto. A capa do evento é controlada aqui pelo mesmo
  // motivo (o Calendar recebe selectedEventId/onSelectedEventIdChange).
  const [eventoAberto, setEventoAberto] = useState<number | null>(null);
  const [mentorAberto, setMentorAberto] = useState<{
    id: number;
    deEvento: number | null;
  } | null>(null);

  // Saldo VIVO no pai: o contador do cabeçalho (referência VDI "PLANO 8/8") e
  // a capa do evento mostram o mesmo número, atualizado a cada confirmação/
  // estorno sem refresh. Com a flag desligada (`credit.visible === false`) o
  // contador não renderiza e o cabeçalho fica byte a byte como sempre foi.
  const [saldoVivo, setSaldoVivo] = useState<number>(credit?.balance ?? 0);
  const contadorVisivel = credit?.visible === true;
  const semSaldo =
    contadorVisivel && !credit.unlimited && credit.enforcing && saldoVivo <= 0;

  const mentoresPorId = useMemo(
    () => new Map(mentors.map((mentor) => [mentor.id, mentor])),
    [mentors],
  );

  // Pré-carrega as capas dos PRÓXIMOS eventos em idle: quando o aluno abre a
  // capa, a imagem já está no cache do browser (que agora segura 7 dias —
  // /api/media é imutável por URL). Sem isso, toda primeira abertura baixava
  // a foto na hora e o modal abria "vazio".
  useEffect(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const capas = events
      .filter((e) => e.event_date >= hoje && e.cover_url)
      .slice(0, 12)
      .map((e) => e.cover_url as string);
    if (capas.length === 0) return;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 400));
    const handle = idle(() => {
      for (const url of capas) {
        const img = new Image();
        img.src = url;
      }
    });
    return () => {
      if (window.cancelIdleCallback && typeof handle === "number") window.cancelIdleCallback(handle);
    };
  }, [events]);

  return (
    <ToastProvider>
      <div className="w-full pb-20">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div>
            <h1 className="text-[27px] font-bold leading-none tracking-[-0.02em] text-st-ivory">
              {t.mentorias.title}
            </h1>
            <p className="mt-3 max-w-[720px] text-[15px] leading-relaxed text-st-ink-2">
              {t.mentorias.sub}
            </p>
          </div>
          {contadorVisivel && (
            <div
              data-testid="credit-counter"
              title={credit.planName ?? undefined}
              className={
                semSaldo
                  ? "inline-flex shrink-0 items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2"
                  : "inline-flex shrink-0 items-center gap-2 rounded-full border border-st-line bg-st-card px-4 py-2"
              }
            >
              <Coins
                className="size-4 shrink-0"
                style={{ color: semSaldo ? undefined : "var(--arkom-gold, #b9915b)" }}
                aria-hidden
              />
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-st-ink-3">
                {t.mentorias.planBadge}
              </span>
              <span
                className={
                  semSaldo
                    ? "text-[14px] font-bold leading-none text-red-300"
                    : "text-[14px] font-bold leading-none text-st-ivory"
                }
              >
                {credit.unlimited
                  ? t.mentorias.planBadgeUnlimited
                  : credit.quota !== null
                    ? `${saldoVivo}h/${credit.quota}h`
                    : `${saldoVivo}h`}
              </span>
            </div>
          )}
        </header>
        <MentorshipCalendar
          events={events}
          confirmedEventIds={confirmedEventIds}
          credit={credit}
          liveBalance={saldoVivo}
          onLiveBalanceChange={setSaldoVivo}
          mentorsById={mentoresPorId}
          mentorsByEvent={mentorsByEvent}
          selectedEventId={eventoAberto}
          onSelectedEventIdChange={setEventoAberto}
          // `eventoAberto` aqui é o valor do RENDER atual — o Calendar zera a
          // capa antes de chamar, mas o closure ainda aponta pro evento aberto.
          onOpenMentor={(mentorId) =>
            setMentorAberto({ id: mentorId, deEvento: eventoAberto })
          }
        />
        <MentorsShowcase
          mentors={mentors}
          onOpen={(mentorId) => setMentorAberto({ id: mentorId, deEvento: null })}
        />
      </div>

      <MentorModal
        mentor={
          mentorAberto === null ? null : (mentoresPorId.get(mentorAberto.id) ?? null)
        }
        onClose={() => {
          const voltarPara = mentorAberto?.deEvento ?? null;
          setMentorAberto(null);
          // Veio da capa de um evento ⇒ o X devolve para a MESMA capa.
          if (voltarPara !== null) setEventoAberto(voltarPara);
        }}
      />
    </ToastProvider>
  );
}
