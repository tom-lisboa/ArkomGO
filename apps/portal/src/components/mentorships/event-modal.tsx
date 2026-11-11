"use client";

// Capa da mentoria (EventModal) — tema STEEL / Arkom gold.
// Usa o <Modal> compartilhado como shell (override p/ bg-st-card) e estiliza o
// conteúdo nos tokens steel do calendário do aluno. Mostra capa (CoverImage
// aspect="wide"), título, data/hora localizada, descrição, botão "Acessar
// mentoria" e o toggle de confirmação de presença (RSVP).
// Port de bilhon-ai/components/mentorias/event-modal.tsx (re-skin steel + i18n).
//
// ACESSO GATEADO (D18, 2026-07-29): "Acessar mentoria" só existe DEPOIS de
// confirmar presença — antes disso o botão fica travado (cadeado) e o clique
// explica em toast, em vez de abrir a sala sem debitar as horas do plano.
// O corte de verdade é do servidor: o payload nem traz o `redirect_url`
// (só `has_access_link`), e o <a> aponta para /api/mentorships/go/<id>,
// que revalida a confirmação a cada clique.

import { useTransition } from "react";
import { format } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import {
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  Loader2,
  Lock,
} from "lucide-react";
import { CoverImage, Modal, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n";
import { toggleConfirmation } from "@/app/(aluno)/mentorships/actions";
import { EventMentorsStrip, type MentorView } from "./mentors";
import {
  ACCESS_WINDOW_MINUTES,
  eventAccessOpen,
  eventAccessOpensLabel,
  eventCreditCost,
  eventHasEnded,
  eventTimeRangeLabel,
  parseEventDate,
  type MentorshipEvent,
} from "./event-utils";

const GOLD = "var(--arkom-gold, #b9915b)";

/** Créditos do aluno, do jeito que a capa precisa (ver Calendar.tsx). */
export type EventCredit = {
  visible: boolean;
  balance: number;
  unlimited: boolean;
  enforcing: boolean;
};

export function EventModal({
  event,
  confirmed,
  credit,
  mentors = [],
  onClose,
  onConfirmedChange,
  onBalanceChange,
  onOpenMentor,
}: {
  event: MentorshipEvent | null;
  confirmed: boolean;
  credit?: EventCredit;
  /** Mentores do encontro (Tarefa 2). Vazio ⇒ a capa fica idêntica à de antes. */
  mentors?: MentorView[];
  onClose: () => void;
  onConfirmedChange: (eventId: number, confirmed: boolean) => void;
  onBalanceChange?: (balance: number) => void;
  /** Abre o perfil do mentor (fechando esta capa — um modal por vez). */
  onOpenMentor?: (mentorId: number) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  if (!event) return null;

  const dfLocale = locale === "pt" ? ptBR : enUS;
  const dateLabel = format(
    parseEventDate(event.event_date),
    "EEEE, dd 'de' MMMM 'de' yyyy",
    { locale: dfLocale }
  );

  // Mentoria encerrada (regra do dono, 2026-07-27): capa vira memória — sem
  // confirmar, sem desconfirmar, sem acessar. O corte de verdade é o do
  // servidor; este espelho só poupa o clique.
  const ended = eventHasEnded(event);

  // Custo × saldo ANTES do clique: o aluno não descobre que está sem crédito
  // depois de tentar. Some por completo quando os créditos estão desligados.
  const cost = eventCreditCost(event);
  const showCredit = credit?.visible === true && !ended;
  // O aluno recebe só o boolean; `redirect_url` fica de fallback para callers
  // antigos que ainda passem a URL crua (a área do aluno não passa mais).
  const hasAccessLink = event.has_access_link === true || !!event.redirect_url;

  // JANELA DE ACESSO (dono, 2026-07-29): a sala abre 30 min antes do início.
  // Confirmar presença segue liberado com qualquer antecedência — só o link da
  // sala é que espera a hora. Espelho: quem barra de verdade é a rota gateada.
  const accessOpen = eventAccessOpen(event);
  const opensAtLabel = eventAccessOpensLabel(event);

  // Por que o acesso está travado? A presença ainda não foi confirmada (D18)
  // ou a sala ainda não abriu. Cada motivo tem a sua frase — botão travado que
  // não diz o porquê é o mesmo beco sem saída de antes.
  const travado = confirmed
    ? {
        testId: "access-early",
        title: t.mentorias.accessEarlyTitle,
        hint: t.mentorias.accessEarlyHint(
          ACCESS_WINDOW_MINUTES,
          opensAtLabel ?? event.starts_at.replace(":", "h"),
          dateLabel
        ),
      }
    : {
        testId: "access-locked",
        title: t.mentorias.accessLockedTitle,
        hint: t.mentorias.accessLockedHint,
      };
  const insufficient =
    showCredit &&
    credit.enforcing &&
    !credit.unlimited &&
    !confirmed &&
    cost > 0 &&
    credit.balance < cost;

  function handleToggle() {
    if (!event) return;
    const eventId = event.id;
    startTransition(async () => {
      const result = await toggleConfirmation(eventId);
      if (result.ok) {
        onConfirmedChange(eventId, result.confirmed);
        if (typeof result.saldo === "number") onBalanceChange?.(result.saldo);
        toast({
          title: result.confirmed ? t.mentorias.toastConfirmed : t.mentorias.toastRemoved,
          description: result.aviso
            ? result.aviso
            : result.confirmed
              ? t.mentorias.toastConfirmedSub
              : undefined,
          variant: result.aviso ? "info" : result.confirmed ? "success" : "info",
        });
      } else {
        toast({
          title: t.mentorias.toastError,
          description: result.error,
          variant: "error",
        });
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      className="border-st-line-2 bg-st-bg st-modal-elev !rounded-[18px]"
      footer={
        ended ? (
          <span
            data-testid="event-ended"
            className={cn(
              "inline-flex items-center gap-2 rounded-[10px] border px-4 py-2.5 text-[13px] font-semibold",
              confirmed
                ? "border-green-500/25 bg-green-500/10 text-green-300"
                : "border-st-line bg-st-card text-st-ink-3"
            )}
          >
            {confirmed ? (
              <>
                <CheckCircle2 className="size-4" />
                {t.mentorias.confirmedCta}
              </>
            ) : (
              <>
                <Clock className="size-4" />
                {t.mentorias.ended}
              </>
            )}
          </span>
        ) : (
        <>
          <button
            type="button"
            data-testid="confirm-presence"
            onClick={handleToggle}
            disabled={isPending}
            title={confirmed ? t.mentorias.undoHint : undefined}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-[10px] border px-4 py-2.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              confirmed
                ? "border-green-500/40 bg-green-500/10 text-green-300 hover:bg-green-500/15"
                : "border-st-line bg-st-card text-st-ink-2 hover:bg-st-card-2 hover:text-st-ivory"
            )}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t.mentorias.saving}
              </>
            ) : confirmed ? (
              <>
                <CheckCircle2 className="size-4" />
                {t.mentorias.confirmedCta}
              </>
            ) : (
              <>
                <CalendarCheck2 className="size-4" />
                {t.mentorias.confirm}
              </>
            )}
          </button>

          {hasAccessLink &&
            (confirmed && accessOpen ? (
              <a
                href={`/api/mentorships/go/${event.id}`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="access-mentoria"
                className="inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-st-bg transition-transform hover:-translate-y-px"
                style={{ backgroundColor: GOLD }}
              >
                {t.mentorias.access}
                <ExternalLink className="size-4" />
              </a>
            ) : (
              // Travado: clicável DE PROPÓSITO — quem clica direto em "Acessar"
              // (o furo original) ouve o porquê num toast, em vez de encontrar
              // um botão morto sem explicação. Dois motivos, mensagens próprias:
              // sem presença confirmada (D18) e fora da janela (dia seguinte).
              <button
                type="button"
                data-testid={travado.testId}
                aria-disabled
                title={travado.hint}
                onClick={() =>
                  toast({
                    title: travado.title,
                    description: travado.hint,
                    variant: "info",
                  })
                }
                className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-st-bg opacity-45"
                style={{ backgroundColor: GOLD }}
              >
                <Lock className="size-4" />
                {t.mentorias.access}
              </button>
            ))}
        </>
        )
      }
    >
      <div className="flex flex-col gap-4" data-testid="event-modal">
        <CoverImage src={event.cover_url} title={event.title} aspect="wide" />

        <div className="flex flex-col gap-2">
          <h2 className="text-[20px] font-bold tracking-[-0.01em] text-st-ivory">
            {event.title}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-st-ink-2">
            <span className="inline-flex items-center gap-1.5 capitalize">
              <CalendarDays className="size-4" style={{ color: GOLD }} />
              {dateLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" style={{ color: GOLD }} />
              {eventTimeRangeLabel(event)}
            </span>
          </div>
        </div>

        {showCredit && (
          <div
            data-testid="credit-summary"
            className={cn(
              "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] border px-3 py-2 text-[12.5px] font-medium",
              insufficient
                ? "border-red-500/30 bg-red-500/10 text-red-300"
                : "border-st-line bg-st-card text-st-ink-2"
            )}
          >
            <Coins
              className="size-4 shrink-0"
              style={{ color: insufficient ? undefined : GOLD }}
            />
            <span>{cost > 0 ? t.mentorias.creditCost(cost) : t.mentorias.creditFree}</span>
            <span aria-hidden className="text-st-ink-3">
              ·
            </span>
            <span>
              {credit.unlimited
                ? t.mentorias.creditUnlimited
                : t.mentorias.creditBalance(credit.balance)}
            </span>
            {insufficient && (
              <span className="basis-full">{t.mentorias.creditInsufficient}</span>
            )}
          </div>
        )}

        {event.description && (
          <p className="text-[14px] leading-relaxed text-st-ink-2">
            {event.description}
          </p>
        )}

        {onOpenMentor ? (
          <EventMentorsStrip mentors={mentors} onOpen={onOpenMentor} />
        ) : null}

        {ended ? (
          <p className="flex items-center gap-2 rounded-[10px] border border-st-line bg-st-card px-3 py-2 text-[12px] font-medium text-st-ink-2">
            <Clock className="size-4 shrink-0" style={{ color: GOLD }} />
            {t.mentorias.endedBanner}
          </p>
        ) : (
          confirmed && (
            <p className="flex items-center gap-2 rounded-[10px] border border-green-500/25 bg-green-500/10 px-3 py-2 text-[12px] font-medium text-green-300">
              <CheckCircle2 className="size-4 shrink-0" />
              {t.mentorias.confirmedBanner}
            </p>
          )
        )}
      </div>
    </Modal>
  );
}
