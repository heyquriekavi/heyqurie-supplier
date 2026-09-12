/**
 * The real backend call. api.ts keeps the mock data for screens the server
 * does not serve yet; anything that talks to /api/v1 goes through request().
 * Adds the token, refreshes it once on 401, turns error bodies into ApiError.
 */
import { deleteItem, getItem, setItem } from './storage';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

export const KEYS = { access: 'qurie.access', refresh: 'qurie.refresh', lang: 'qurie.lang' } as const;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getTokens() {
  const [access, refresh] = await Promise.all([getItem(KEYS.access), getItem(KEYS.refresh)]);
  return { access, refresh };
}

export async function setTokens(t: { access_token?: string; refresh_token?: string }) {
  if (t.access_token) await setItem(KEYS.access, t.access_token);
  if (t.refresh_token) await setItem(KEYS.refresh, t.refresh_token);
}

export async function clearTokens() {
  await Promise.all([deleteItem(KEYS.access), deleteItem(KEYS.refresh)]);
}

type Opts = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; auth?: boolean; _retried?: boolean };

export async function request<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const { method = opts.body ? 'POST' : 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) {
    const { access } = await getTokens();
    if (access) headers.authorization = `Bearer ${access}`;
  }
  let res: Response;
  try {
    res = await fetch(API_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (res.status === 401 && auth && !opts._retried) {
    const { refresh } = await getTokens();
    if (refresh) {
      const r = await fetch(API_URL + '/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (r.ok) {
        await setTokens(await r.json());
        return request<T>(path, { ...opts, _retried: true });
      }
    }
    await clearTokens();
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : res.statusText;
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

/** Multipart POST (audio clips, photos). Same auth as request(); no JSON header so the browser sets the boundary. */
export async function upload<T = any>(path: string, form: FormData): Promise<T> {
  const { access } = await getTokens();
  let res: Response;
  try {
    res = await fetch(API_URL + path, { method: 'POST', headers: access ? { authorization: `Bearer ${access}` } : {}, body: form });
  } catch {
    throw new ApiError(0, 'network');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, typeof data?.detail === 'string' ? data.detail : res.statusText);
  return data as T;
}
