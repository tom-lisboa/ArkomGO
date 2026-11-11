// components/apps/sectors.ts — os SETORES do mapa (as áreas de
// skilltree-data DEPARTMENTS) como taxonomia de filtro do grid /apps.
// Módulo sem dependência de servidor: o client (apps-body) importa as pills
// daqui e o loader (data.ts) importa o matcher — nunca importar db aqui.
//
// Nomes/cores/ordem espelham o mapa (DEPT_PT): Back Office, Clientes,
// Produto, Marketing, Vendas, Inteligência.

/** Um setor do mapa — pill do grid /apps. */
export interface AppSector {
  slug: string;
  name: string;
  /** acento hex da área no mapa (paleta "space" por departamento) */
  color: string;
}

/** Na ordem das áreas do mapa (skilltree-data DEPARTMENTS). */
export const APP_SECTORS: AppSector[] = [
  { slug: "back-office", name: "Back Office", color: "#FACC15" },
  { slug: "clientes", name: "Clientes", color: "#FB7185" },
  { slug: "produto", name: "Produto", color: "#A78BFA" },
  { slug: "marketing", name: "Marketing", color: "#38BDF8" },
  { slug: "vendas", name: "Vendas", color: "#EF4444" },
  { slug: "inteligencia", name: "Inteligência", color: "#7DD3FC" },
];

/** Fallback para app cujo título não casa com nenhum setor — nunca some do grid. */
export const SECTOR_FALLBACK: AppSector = {
  slug: "outros",
  name: "Outros",
  color: "#c9a84c",
};

/** título do app → setor do mapa (mesmo espírito do NAME_ACCENT: regex por
 *  flagship). A ORDEM importa — "social selling" (Vendas) antes do "social"
 *  genérico (Marketing). */
const SECTOR_MATCH: [RegExp, string][] = [
  // Vendas — SDR · CRM · pipeline · prospecção
  [/social selling|linkedin/i, "vendas"],
  [/\bsdr\b|\bpipe\b|\bcrm\b/i, "vendas"],
  // Back Office — jurídico · RH · financeiro
  [/harvey|peticion|jur[ií]d/i, "back-office"],
  [/holly|recruta|\brh\b/i, "back-office"],
  [/financ/i, "back-office"],
  // Clientes — onboarding · atendimento · CS
  [/onboard|\bdesk\b|atendimento/i, "clientes"],
  [/\bcs\b/i, "clientes"],
  // Produto — Genesis
  [/genesis|builder/i, "produto"],
  // Marketing — anúncios · redes sociais
  [/\bads\b|an[úu]ncio|social/i, "marketing"],
  // Inteligência — dashboards de BI
  [/atlas|painel|dashboard|\bbi\b/i, "inteligencia"],
];

/** Setor (slug) de um app pelo título; "outros" quando nada casa. */
export function sectorFor(title: string): string {
  for (const [re, slug] of SECTOR_MATCH) {
    if (re.test(title)) return slug;
  }
  return SECTOR_FALLBACK.slug;
}
