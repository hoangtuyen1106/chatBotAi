const STORAGE_KEY = 'chatbot.token';

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null): void => {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

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

const buildHeaders = (init?: RequestInit): Headers => {
  const h = new Headers(init?.headers);
  const token = getToken();
  if (token) h.set('Authorization', `Bearer ${token}`);
  if (init?.body && !(init.body instanceof FormData) && !h.has('Content-Type')) {
    h.set('Content-Type', 'application/json');
  }
  return h;
};

export const apiUrl = (path: string): string => {
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};

export const apiFetch = async (path: string, init?: RequestInit): Promise<Response> => {
  const res = await fetch(apiUrl(path), { ...init, headers: buildHeaders(init) });
  if (res.status === 401) {
    setToken(null);
    for (const cb of onUnauthorized) cb();
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
