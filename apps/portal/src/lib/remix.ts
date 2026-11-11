// lib/remix.ts — DISTRIBUIÇÃO das soluções Arkom, server-only.
// O Arkom é o front único de acesso: fala DIRETO com o Supabase central
// (lib/central.ts, service_role) — sem intermediário. Dois modos de entrega:
//   • Caso A · Usuário-final — provisiona o email de compra (core.provision_instance,
//     modo 'assigned'); o comprador loga no app com esse email e claim_by_email
//     casa a org dele.
//   • Caso B · Remix — link estável (/api/remix/go/<slug>) que 302a pro magic-code
//     fresco de core.remix_link (rotaciona ~diário; edge remix-refresh-magic-codes).
//
// DOIS conjuntos DISTINTOS de propósito (não confundir):
//   • REMIX_SOLUTIONS — as soluções PROVISIONADAS no cadastro (1 conta = orgs
//     reservadas). Muda isto só quando core.provision_instance suportar o slug.
//   • REMIX_GO_SLUGS  — todo slug que tem link de remix em core.remix_link e pode
//     ser servido por /api/remix/go/<slug>. Superset do primeiro. Ampliar aqui
//     NÃO liga provisionamento — é só a porta de acesso ao magic-code.

import { centralInsert, centralRpc, centralSelect } from "@/lib/central";

/** Soluções PROVISIONADAS no cadastro (slugs = core.provision_instance). NÃO
 *  ampliar sem suporte de provisionamento no central — cada slug aqui vira uma
 *  instância reservada por email a cada conta criada. */
export const REMIX_SOLUTIONS: Record<
  string,
  { name: string; desc: string; publishedUrl: string | null }
> = {
  sdr: { name: "SDR Suite · Bia", desc: "SDR com IA (Bia) via Evolution API.", publishedUrl: "https://bilhon-sdr.lovable.app" },
  cmo: { name: "Agente Autônomo CMO", desc: "Agente de marketing — campanhas e decisões sob aprovação.", publishedUrl: null },
  atendimento: { name: "Atendimento Multi-Agentes", desc: "Atendimento multi-agente no WhatsApp com IA.", publishedUrl: null },
  ad_manager: { name: "Bilhon Ads", desc: "Gestão de anúncios Meta/Facebook Ads.", publishedUrl: null },
  financeai: { name: "FinanceAI", desc: "ERP financeiro — contas, NF-e e integrações bancárias.", publishedUrl: null },
  social: { name: "Mega Automação de Redes Sociais", desc: "Criação, agendamento e publicação com IA.", publishedUrl: null },
};

/** Slugs que têm link de remix no registry (core.remix_link) e podem ser
 *  servidos por /api/remix/go/<slug>. Os 6 provisionados + o catálogo estendido
 *  (só distribuição de código, sem provisionar org). Fonte de verdade do link é
 *  o registry central; esta lista é o gate de slug conhecido do endpoint. */
export const REMIX_GO_SLUGS: ReadonlySet<string> = new Set([
  ...Object.keys(REMIX_SOLUTIONS),
  "gestor_onboarding", // Onboarding
  "dashboards", // ATLAS
  "cs", // CS AI
  "peticionamento", // HARVEY
  "recruta", // Recruta.AI (arkom-recruta / e514097a)
  "bia_rh", // Holly RH (arkom-bia-rh / a8ccd4bf) — produto distinto do recruta
  "crm_armo", // PIPE (bilhon-crm / 50aff569)
]);

export interface RemixLinkRow {
  solution: string;
  invite_link: string | null;
  process_status: string;
  expires_at: string | null;
  last_refreshed_at: string | null;
}

/** O invite-link está utilizável? (mesma régua do console do bilhon-os). */
export function isRemixLinkValid(
  row: Pick<RemixLinkRow, "invite_link" | "process_status" | "expires_at">,
): boolean {
  if (row.process_status !== "success" || !row.invite_link) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return false;
  return true;
}

/** Link de remix estável (endpoint do PRÓPRIO Arkom). Relativo = portável dev/prod. */
export function remixGoPath(solution: string): string {
  return `/api/remix/go/${solution}`;
}

function isInstanceId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Um invite-link fresco pra uma solução — usado pelo redirect /api/remix/go/[solution]. */
export async function fetchInviteLink(
  solution: string,
): Promise<{ link: string | null; error: string | null }> {
  const { rows, error } = await centralSelect<RemixLinkRow>(
    "core",
    "remix_link",
    `solution=eq.${encodeURIComponent(solution)}&select=solution,invite_link,process_status,expires_at,last_refreshed_at&limit=1`,
  );
  if (error) return { link: null, error };
  const row = rows[0];
  if (!row || !isRemixLinkValid(row)) return { link: null, error: null };
  return { link: row.invite_link, error: null };
}

/** Clique de remix em core.remix_click_logs — atribuição best-effort, nunca bloqueia. */
export async function logRemixClick(solution: string, source: string): Promise<boolean> {
  return centralInsert("core", "remix_click_logs", { solution, metadata: { source } });
}

/**
 * Pré-provisiona uma instância amarrada ao EMAIL de compra (central-34).
 * core.provision_instance em modo 'assigned': a instância nasce reservada a esse
 * email; quando o comprador logar, claim_by_email casa a org dele.
 */
export async function provisionInstanceForEmail(
  solution: string,
  email: string,
): Promise<{ ok: boolean; instanceId?: string; error?: string }> {
  const e = (email || "").trim().toLowerCase();
  if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
    return { ok: false, error: "Informe um email válido." };
  }
  if (!REMIX_SOLUTIONS[solution]) {
    return { ok: false, error: `solução desconhecida: ${solution}` };
  }
  const { data, error } = await centralRpc<string>("core", "provision_instance", {
    _solution: solution,
    _claim_mode: "assigned",
    _intended_owner_email: e,
  });
  if (error) return { ok: false, error };
  if (!isInstanceId(data)) {
    return {
      ok: false,
      error: "O central não retornou o ID da instância provisionada.",
    };
  }
  return { ok: true, instanceId: data };
}

/**
 * Provisiona o email de um MEMBRO recém-criado nas 6 soluções oficiais (central).
 * Chamado na criação da conta pela interface do admin — é o gatilho autoritativo
 * do provisionamento ("1 conta criada aqui = orgs reservadas nas soluções").
 * Best-effort: a criação do membro local nunca é revertida por uma indisponibilidade
 * do central, mas cada falha é devolvida para a interface administrativa.
 */
export interface MemberProvisioningAttempt {
  solution: string;
  solutionName: string;
  ok: boolean;
  instanceId?: string;
  error?: string;
}

export interface MemberProvisioningResult {
  total: number;
  provisioned: number;
  failed: number;
  results: MemberProvisioningAttempt[];
  failures: Array<Required<Pick<MemberProvisioningAttempt, "solution" | "solutionName" | "error">>>;
}

export async function provisionMemberForAllSolutions(
  email: string,
): Promise<MemberProvisioningResult> {
  const e = (email || "").trim().toLowerCase();
  const slugs = Object.keys(REMIX_SOLUTIONS);

  if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
    const results = slugs.map<MemberProvisioningAttempt>((solution) => ({
      solution,
      solutionName: REMIX_SOLUTIONS[solution].name,
      ok: false,
      error: "Informe um email válido.",
    }));
    return {
      total: results.length,
      provisioned: 0,
      failed: results.length,
      results,
      failures: results.map(({ solution, solutionName, error }) => ({
        solution,
        solutionName,
        error: error ?? "Falha de validação.",
      })),
    };
  }

  const settled = await Promise.allSettled(
    slugs.map((slug) =>
      centralRpc<string>("core", "provision_instance", {
        _solution: slug,
        _claim_mode: "assigned",
        _intended_owner_email: e,
      }),
    ),
  );

  const results = settled.map<MemberProvisioningAttempt>((result, index) => {
    const solution = slugs[index];
    const solutionName = REMIX_SOLUTIONS[solution].name;
    if (result.status === "rejected") {
      return {
        solution,
        solutionName,
        ok: false,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    }
    if (result.value.error) {
      return { solution, solutionName, ok: false, error: result.value.error };
    }
    if (!isInstanceId(result.value.data)) {
      return {
        solution,
        solutionName,
        ok: false,
        error: "O central não retornou o ID da instância provisionada.",
      };
    }
    return {
      solution,
      solutionName,
      ok: true,
      instanceId: result.value.data,
    };
  });

  const failures = results
    .filter((result) => !result.ok)
    .map(({ solution, solutionName, error }) => ({
      solution,
      solutionName,
      error: error ?? "Falha desconhecida no provisionamento.",
    }));

  return {
    total: results.length,
    provisioned: results.length - failures.length,
    failed: failures.length,
    results,
    failures,
  };
}

