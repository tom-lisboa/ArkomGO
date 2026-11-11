// /admin/home — configuração da home do aluno: banner do topo + vitrine
// "Soluções em destaque" (copy da seção, limite de vagas e cards manuais com
// overrides). Leitura em server component; CRUD via server actions em
// ./actions.ts. Guard requireAdmin() aplicado no layout admin.

import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import {
  HomeShowcaseManager,
  type AdminHomeSettings,
  type AdminFeaturedSlot,
  type AdminPickerApp,
} from "@/components/admin-conteudo/home-showcase-manager";

export const metadata: Metadata = { title: "Home do aluno" };

export default async function AdminHomePage() {
  await requireAdmin();
  const sql = getSql();

  let settings: AdminHomeSettings | null = null;
  let slots: AdminFeaturedSlot[] = [];
  let apps: AdminPickerApp[] = [];
  let migrationMissing = false;

  try {
    [settings, slots, apps] = await Promise.all([
      sql<AdminHomeSettings[]>`
        SELECT featured_title, featured_subtitle, featured_limit,
               banner_enabled, banner_image_url, banner_pill, banner_title,
               banner_description, banner_cta_label, banner_cta_href
          FROM home_settings
         WHERE id = 1
      `.then((rows) => rows[0] ?? null),
      sql<AdminFeaturedSlot[]>`
        SELECT s.id, s.app_id, s.title, s.strap, s.cover_url, s.accent, s.href,
               a.title AS app_title, a.tagline AS app_tagline,
               a.cover_url AS app_cover_url, a.status AS app_status
          FROM home_featured_slots s
          JOIN apps a ON a.id = s.app_id
         ORDER BY s.sort_order, s.id
      `,
      sql<AdminPickerApp[]>`
        SELECT a.id, a.title, a.status,
               (SELECT COUNT(*) FROM app_clicks ac WHERE ac.app_id = a.id)::int AS clicks
          FROM apps a
         ORDER BY a.title, a.id
      `,
    ]);
  } catch (error) {
    // Tabelas da migration 0009 ainda não aplicadas neste ambiente.
    if ((error as { code?: string })?.code === "42P01") migrationMissing = true;
    else throw error;
  }

  return (
    <HomeShowcaseManager
      settings={settings}
      slots={slots}
      apps={apps}
      migrationMissing={migrationMissing}
    />
  );
}
