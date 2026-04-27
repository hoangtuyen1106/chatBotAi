const CSRF_COOKIE = 'csrf_token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const onUnauthorized = new Set<() => void>();
export const subscribeUnauthorized = (cb: () => void): (() => void) => {
  onUnauthorized.add(cb);
  return () => onUnauthorized.delete(cb);
};

const readCookie = (name: string): string | null => {
  const all = document.cookie.split(';');
  for (const part of all) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
};

export const apiUrl = (path: string): string => {
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};

const buildHeaders = (init?: RequestInit): Headers => {
  const h = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !h.has('Content-Type')) {
    h.set('Content-Type', 'application/json');
  }
  const method = (init?.method ?? 'GET').toUpperCase();
  if (!SAFE_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) h.set('X-CSRF-Token', csrf);
  }
  return h;
};

const doFetch = (path: string, init?: RequestInit): Promise<Response> =>
  fetch(apiUrl(path), { ...init, credentials: 'include', headers: buildHeaders(init) });

let refreshInFlight: Promise<boolean> | null = null;

const tryRefresh = async (): Promise<boolean> => {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await doFetch('/auth/refresh', { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Hold the same promise long enough to dedupe concurrent callers,
      // but always reset before returning so the next 401 retries fresh.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
};

export const apiFetch = async (path: string, init?: RequestInit): Promise<Response> => {
  let res = await doFetch(path, init);
  if (res.status === 401 && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch(path, init);
    } else {
      for (const cb of onUnauthorized) cb();
    }
  }
  return res;
};

export const api = async <T = unknown>(path: string, init?: RequestInit): Promise<T> => {
  const res = await apiFetch(path, init);
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : ({} as Record<string, unknown>);
  if (!res.ok) {
    const code = typeof body.error === 'string' ? body.error : 'http_error';
    const msg = typeof body.message === 'string' ? body.message : `HTTP ${res.status}`;
    throw new ApiError(res.status, code, msg);
  }
  return body as T;
};
