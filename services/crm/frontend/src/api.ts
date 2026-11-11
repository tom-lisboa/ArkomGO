export type Session = {
  access_token: string;
  identity: { role: 'admin' | 'operator' | 'viewer' };
  apiBase: string;
};

export async function request<T>(
  path: string,
  session: Session,
  body: unknown,
  _key?: string,
  signal?: AbortSignal,
): Promise<T> {
  if (!path.startsWith('/v1/sdr/crm/')) throw new Error('Rota fora do CRM.');
  const response = await fetch(session.apiBase.replace(/\/$/, '') + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
    credentials: 'omit',
    redirect: 'error',
    signal: signal ?? AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Falha na operação do CRM.');
  return result;
}

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível confirmar a operação.';
}
