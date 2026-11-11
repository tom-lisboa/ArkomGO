import { NextResponse } from "next/server";

/**
 * MOCK — /api/brain-draft (Pkg10 · N6).
 *
 * Reproduces the real endpoint's CONTRACT captured in R1 findings A5:
 *   request  { url: string, text: string }
 *   response the 8 brain sections (company, one_liner, offers, icp, clients,
 *            voice, tools, notes).
 *
 * The real product calls Claude to draft all eight sections; this route NEVER
 * calls an external service. It is deterministic: `company` is derived from the
 * URL and the freeform `text` lands in `notes` (the freeform "anything else"
 * field). The remaining sections come back empty for the user to fill in the
 * edit pass — nothing is fabricated (No-Invention).
 */

const EMPTY_SECTIONS = {
  company: "",
  one_liner: "",
  offers: "",
  icp: "",
  clients: "",
  voice: "",
  tools: "",
  notes: "",
};

function companyFromUrl(url: string): string {
  const host = url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0];
  const label = host.split(".")[0] ?? "";
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "";
}

export async function POST(req: Request) {
  let url = "";
  let text = "";
  try {
    const body = (await req.json()) as { url?: unknown; text?: unknown };
    if (typeof body.url === "string") url = body.url;
    if (typeof body.text === "string") text = body.text;
  } catch {
    /* missing / invalid body → empty draft */
  }

  const sections = {
    ...EMPTY_SECTIONS,
    company: companyFromUrl(url),
    notes: text.trim(),
  };

  return NextResponse.json({ sections, mock: true });
}
