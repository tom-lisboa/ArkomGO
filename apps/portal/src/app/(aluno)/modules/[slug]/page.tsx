import { notFound } from "next/navigation";

import { ModuleDetail } from "@/components/modules/ModuleDetail";
import { MODULE_DETAIL, type ModuleSlug } from "@/components/modules/content";

/**
 * Module detail route (Pkg10 · N5). Server wrapper: pins the three live slugs at
 * build time and 404s anything else, then hands the validated slug to the client
 * detail component. This kills the modules-index prefetch 404 (the cards link to
 * /modules/{start-here|foundations|second-brain}).
 */
export function generateStaticParams() {
  return (Object.keys(MODULE_DETAIL) as ModuleSlug[]).map((slug) => ({ slug }));
}

export const dynamicParams = false;

export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!(slug in MODULE_DETAIL)) notFound();
  return <ModuleDetail slug={slug as ModuleSlug} />;
}
