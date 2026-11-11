/**
 * Brand constants — the ONE place the product identity lives (plano
 * 2026-07-08_rebuild N4). Runtime code must read from here; the data files
 * (skill previews/meta) embed the domain as literal text — to re-brand those,
 * run a repo-wide swap of DOMAIN's old value (1 sed), then update this file.
 */
export const BRAND = "Arkom";
export const DOMAIN = "arkom.ai";
export const HUB_URL = `${DOMAIN}/hub`;
export const INSTALL_CMD = "npx arkom add"; // + ` ${slug}`
