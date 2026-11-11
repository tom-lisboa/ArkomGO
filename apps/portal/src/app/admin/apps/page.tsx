// /admin/apps — gestão de apps/soluções e categorias (Story 1.6, RF017).
// Leitura em server component; CRUD via server actions em ./actions.ts.
// Guard requireAdmin() aplicado no layout admin.

import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import {
  AppsManager,
  type AdminApp,
  type AdminCategory,
} from "@/components/admin-conteudo/apps-manager";

export const metadata: Metadata = { title: "Apps e Soluções" };

export default async function AdminAppsPage() {
  await requireAdmin();
  const sql = getSql();

  const apps = await sql<AdminApp[]>`
       SELECT a.id, a.category_id, a.title, a.tagline, a.description, a.cover_url,
              a.video_provider, a.video_url, a.button_label,
              CASE
                WHEN a.redirect_url LIKE 'coming-soon:%' THEN NULLIF(SUBSTRING(a.redirect_url FROM 13), '')
                ELSE a.redirect_url
              END AS redirect_url,
              CASE
                WHEN a.redirect_url LIKE 'coming-soon:%' THEN 'coming_soon'
                ELSE 'available'
              END AS availability,
              a.sort_order, a.status,
              c.name AS category_name,
              (SELECT COUNT(*) FROM app_clicks ac WHERE ac.app_id = a.id) AS clicks,
              (SELECT ROUND(AVG(ar.rating), 1) FROM app_ratings ar WHERE ar.app_id = a.id) AS avg_rating
         FROM apps a
         JOIN app_categories c ON c.id = a.category_id
        ORDER BY a.sort_order, a.id
     `;

  const categories = await sql<AdminCategory[]>`
       SELECT c.id, c.name, c.slug, c.sort_order,
              (SELECT COUNT(*) FROM apps a WHERE a.category_id = c.id) AS apps_count
         FROM app_categories c
        ORDER BY c.sort_order, c.id
     `;

  return <AppsManager apps={apps} categories={categories} />;
}
