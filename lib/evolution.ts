import 'server-only';

export class EvolutionError extends Error {
  constructor(public status: number) { super(`Evolution API request failed (${status})`); }
}

/** Use from Next.js server components, route handlers, or server actions only. */
export async function evolutionRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const origin = process.env.EVOLUTION_API_ORIGIN;
  if (!baseUrl || !apiKey || !origin) {
    throw new Error('Missing Evolution API server environment variables');
  }
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Evolution API path must begin with a single slash');
  }
  const base = new URL(baseUrl);
  if (process.env.VERCEL && base.protocol !== 'https:') {
    throw new Error('Vercel requires an HTTPS Evolution API endpoint');
  }
  const url = new URL(path, base);
  if (url.origin !== base.origin) {
    throw new Error('Evolution API path must stay on the configured server');
  }
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      apikey: apiKey,
      Origin: origin,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
  });
  if (!response.ok) {
    // Avoid including upstream bodies, which may contain private session data.
    throw new EvolutionError(response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
