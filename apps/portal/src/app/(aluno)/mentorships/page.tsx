// /mentorships — calendário de mentorias do aluno.
// Server component: busca eventos PUBLICADOS (rascunho nunca aparece p/ aluno)
// e as confirmações de presença do usuário logado. A interatividade
// (calendário → capa/EventModal → confirmar presença) vive no client
// (mentorias-body). Substitui a antiga agenda hardcoded de content.ts pelo
// banco real (app_arkom.mentorship_events): admin cria → aluno vê.
//
// Créditos (Tarefa 1): o SELECT traz `event_kind`/`credit_cost` (migration
// 0012) e a página carrega o resumo de créditos do aluno para que ele veja
// saldo e custo ANTES de clicar. Com `entitlements_enabled` desligada, o
// resumo vem invisível e a tela fica idêntica à de hoje. Ambiente sem a 0012
// (coluna ausente, `42703`) degrada para o SELECT antigo.

import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { getStudentCreditSummary } from "@/lib/credit-policy";
import { loadMentorsShowcase } from "@/lib/mentors";
import type { MentorshipEvent } from "@/components/mentorships/event-utils";
import { MentoriasBody } from "./mentorias-body";

export default async function MentoriasPage() {
  const user = await requireUser();
  const sql = getSql();

  // O `redirect_url` NUNCA vai ao navegador (D18): o payload só diz SE o
  // evento tem link (`has_access_link`), e o acesso confirmado passa pela rota
  // gateada /api/mentorships/go/<id> — que exige presença confirmada no server.
  let events: MentorshipEvent[];
  try {
    events = await sql<MentorshipEvent[]>`
      SELECT id, title, description, cover_url, event_date, starts_at, ends_at,
             (redirect_url IS NOT NULL AND btrim(redirect_url) <> '') AS has_access_link,
             event_kind, credit_cost
      FROM mentorship_events
      WHERE status = 'published'
      ORDER BY event_date, starts_at
    `;
  } catch (error) {
    if ((error as { code?: string })?.code !== "42703") throw error;
    // Migration 0012 ausente neste ambiente: segue sem os campos de crédito.
    events = await sql<MentorshipEvent[]>`
      SELECT id, title, description, cover_url, event_date, starts_at, ends_at,
             (redirect_url IS NOT NULL AND btrim(redirect_url) <> '') AS has_access_link
      FROM mentorship_events
      WHERE status = 'published'
      ORDER BY event_date, starts_at
    `;
  }

  const confirmations = await sql<{ event_id: number }[]>`
    SELECT event_id FROM event_confirmations WHERE user_id = ${user.id} AND confirmed = 1
  `;

  const credit = await getStudentCreditSummary(user.id);

  // Mentores (Tarefa 2). Flag `mentors_enabled` desligada ⇒ volta vazio sem
  // tocar no banco, e a página renderiza idêntica à de antes desta tarefa.
  const mentores = await loadMentorsShowcase();

  return (
    <Shell>
      <MentoriasBody
        events={events}
        confirmedEventIds={confirmations.map((c) => c.event_id)}
        credit={{
          visible: credit.visible,
          balance: credit.balance,
          unlimited: credit.unlimited,
          quota: credit.quota,
          planName: credit.planName,
          enforcing: credit.enforcing,
        }}
        mentors={mentores.mentors}
        mentorsByEvent={mentores.byEvent}
      />
    </Shell>
  );
}
