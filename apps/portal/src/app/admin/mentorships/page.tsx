// /admin/mentorships — gestão de eventos de mentoria (Story 1.6, RF016).
// Leitura em server component; CRUD + recorrência via server actions.
// Guard requireAdmin() aplicado no layout admin.

import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { motivoParaNaoExcluir } from "@/lib/mentorship-delete-guard";
import {
  MentorshipsManager,
  type AdminMentoria,
  type MentorOption,
} from "@/components/admin-conteudo/mentorships-manager";

export const metadata: Metadata = { title: "Mentorias" };

type EventoRow = Omit<
  AdminMentoria,
  "mentor_ids" | "attendance_count" | "delete_block_reason"
>;

export default async function AdminMentoriasPage() {
  await requireAdmin();
  const sql = getSql();

  // `event_kind`/`credit_cost`/`cancelled_at` vêm da migration 0012. Ambiente
  // que ainda não a aplicou (`42703`) cai no SELECT antigo e o gerenciador
  // esconde os campos de crédito — o cadastro de mentoria é anterior aos
  // créditos e não pode depender deles.
  let eventos: EventoRow[];
  let creditoDisponivel = true;
  try {
    eventos = await sql<EventoRow[]>`
       SELECT e.id, e.title, e.description, e.cover_url, e.event_date,
              e.starts_at, e.ends_at, e.redirect_url, e.recurrence_type,
              e.recurrence_until, e.status, e.event_kind, e.credit_cost,
              e.cancelled_at,
              (SELECT COUNT(*) FROM event_confirmations ec
                WHERE ec.event_id = e.id AND ec.confirmed = 1) AS confirmations_count
         FROM mentorship_events e
        ORDER BY e.event_date DESC, e.starts_at DESC, e.id DESC
     `;
  } catch (error) {
    if ((error as { code?: string })?.code !== "42703") throw error;
    creditoDisponivel = false;
    eventos = await sql<EventoRow[]>`
       SELECT e.id, e.title, e.description, e.cover_url, e.event_date,
              e.starts_at, e.ends_at, e.redirect_url, e.recurrence_type,
              e.recurrence_until, e.status,
              (SELECT COUNT(*) FROM event_confirmations ec
                WHERE ec.event_id = e.id AND ec.confirmed = 1) AS confirmations_count
         FROM mentorship_events e
        ORDER BY e.event_date DESC, e.starts_at DESC, e.id DESC
     `;
  }

  // Mentores, vínculos e presenças vêm da migration 0014 — em bloco separado
  // (e com 42P01 próprio) para que a ausência deles não afete o restante da
  // tela, que é anterior a esta tarefa.
  let mentores: MentorOption[] = [];
  const mentoresPorEvento = new Map<number, number[]>();
  const presentesPorEvento = new Map<number, number>();
  let mentoresDisponivel = true;
  try {
    mentores = await sql<MentorOption[]>`
      SELECT id, full_name, specialty, photo_url, status
        FROM mentors
       ORDER BY sort_order, id
    `;
    const vinculos = await sql<{ event_id: number; mentor_id: number }[]>`
      SELECT event_id, mentor_id
        FROM event_mentors
       ORDER BY event_id, sort_order, mentor_id
    `;
    for (const vinculo of vinculos) {
      const lista = mentoresPorEvento.get(vinculo.event_id) ?? [];
      lista.push(vinculo.mentor_id);
      mentoresPorEvento.set(vinculo.event_id, lista);
    }
    const presencas = await sql<{ event_id: number; total: number }[]>`
      SELECT event_id, COUNT(*)::int AS total
        FROM event_attendance
       WHERE attended
       GROUP BY event_id
    `;
    for (const presenca of presencas) {
      presentesPorEvento.set(presenca.event_id, presenca.total);
    }
  } catch (error) {
    if ((error as { code?: string })?.code !== "42P01") throw error;
    mentoresDisponivel = false;
  }

  // Vínculos de crédito por evento — o que impede a exclusão (extrato/diário
  // são append-only; ver src/lib/mentorship-delete-guard.ts). Duas agregações
  // para a lista inteira, não uma consulta por linha. Ambiente sem as 0011/0012
  // (`42P01`) fica sem vínculo nenhum e a tela segue como sempre foi.
  const lancamentosPorEvento = new Map<number, { total: number; alunos: number }>();
  const sombraPorEvento = new Map<number, number>();
  try {
    const extrato = await sql<{ event_id: number; total: number; alunos: number }[]>`
      SELECT event_id, COUNT(*)::int AS total, COUNT(DISTINCT profile_id)::int AS alunos
        FROM credit_ledger
       WHERE event_id IS NOT NULL
       GROUP BY event_id
    `;
    for (const linha of extrato) {
      lancamentosPorEvento.set(linha.event_id, { total: linha.total, alunos: linha.alunos });
    }
  } catch (error) {
    if ((error as { code?: string })?.code !== "42P01") throw error;
  }
  try {
    const sombra = await sql<{ event_id: number; total: number }[]>`
      SELECT event_id, COUNT(*)::int AS total
        FROM credit_shadow_log
       WHERE event_id IS NOT NULL
       GROUP BY event_id
    `;
    for (const linha of sombra) sombraPorEvento.set(linha.event_id, linha.total);
  } catch (error) {
    if ((error as { code?: string })?.code !== "42P01") throw error;
  }

  const linhas: AdminMentoria[] = eventos.map((evento) => {
    const extrato = lancamentosPorEvento.get(evento.id);
    return {
      ...evento,
      mentor_ids: mentoresPorEvento.get(evento.id) ?? [],
      attendance_count: presentesPorEvento.get(evento.id) ?? 0,
      delete_block_reason: motivoParaNaoExcluir(
        {
          lancamentos: extrato?.total ?? 0,
          alunos: extrato?.alunos ?? 0,
          sombra: sombraPorEvento.get(evento.id) ?? 0,
        },
        Boolean(evento.cancelled_at),
      ),
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-display font-extrabold tracking-display text-primary">Mentorias</h1>
        <p className="mt-1 text-base text-secondary">
          Cadastre eventos ao vivo, defina recorrência e acompanhe as confirmações de presença.
        </p>
      </div>
      <MentorshipsManager
        eventos={linhas}
        creditoDisponivel={creditoDisponivel}
        mentores={mentores}
        mentoresDisponivel={mentoresDisponivel}
      />
    </div>
  );
}
