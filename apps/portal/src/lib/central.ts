// lib/central.ts — cliente server-only do Supabase CENTRAL (projeto `solutions`),
// via REST/PostgREST com fetch puro (sem @supabase/supabase-js — cumpre a regra
// "nenhuma dependência nova" do Arkom).
//
// A service_role acessa TODOS os schemas ignorando RLS, então NUNCA pode ir pro
// browser: o guard abaixo lança se o módulo for avaliado no cliente. Use só em
// Server Components / Server Actions / Route Handlers.
//
// Envs (SEM NEXT_PUBLIC — ficam só no server):
//   CENTRAL_SUPABASE_URL
//   CENTRAL_SUPABASE_SERVICE_ROLE_KEY

if (typeof window !== "undefined") {
  throw new Error("lib/central.ts importado no browser — a service_role do central é server-only");
}

export type CentralSchema = "public" | "core" | "analytics_core" | `app_${string}`;

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} não configurada — veja .env.example (Supabase central)`);
  return v;
}

function restBase(): string {
  return `${env("CENTRAL_SUPABASE_URL").replace(/\/+$/, "")}/rest/v1`;
}

function authHeaders(): Record<string, string> {
  const key = env("CENTRAL_SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, authorization: `Bearer ${key}` };
}

const TIMEOUT_MS = 15_000;

/** SELECT numa tabela/view de um schema do central. `query` = querystring PostgREST. */
export async function centralSelect<T>(
  schema: CentralSchema,
  table: string,
  query: string,
): Promise<{ rows: T[]; error: string | null }> {
  try {
    const res = await fetch(`${restBase()}/${table}?${query}`, {
      method: "GET",
      headers: { ...authHeaders(), "accept-profile": schema, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.text();
    if (!res.ok) return { rows: [], error: `PostgREST ${res.status}: ${body.slice(0, 200)}` };
    return { rows: JSON.parse(body) as T[], error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** INSERT best-effort num schema do central (return=minimal). */
export async function centralInsert(
  schema: CentralSchema,
  table: string,
  row: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(`${restBase()}/${table}`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "content-type": "application/json",
        "content-profile": schema,
        prefer: "return=minimal",
      },
      body: JSON.stringify(row),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** RPC (função) num schema do central. Retorna o corpo JSON já parseado. */
export async function centralRpc<T>(
  schema: CentralSchema,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${restBase()}/rpc/${fn}`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "content-type": "application/json",
        "content-profile": schema,
        accept: "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) return { data: null, error: `PostgREST ${res.status}: ${text.slice(0, 200)}` };
    return { data: (text ? JSON.parse(text) : null) as T, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

