import type { Session } from '../types';

type ApiErrorBody = { message?: string; error?: string | { code?: string; message?: string; details?: unknown } };
export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown, public code?: string) {
    super(message);
  }
}

const TOKEN_KEY = 'atlas.session';
const API_BASE = '/api/v1';
let refreshPromise: Promise<string | null> | null = null;

export const sessionStore = {
  get(): Session | null {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  },
  set(session: Session | null) {
    if (session) localStorage.setItem(TOKEN_KEY, JSON.stringify(session));
    else localStorage.removeItem(TOKEN_KEY);
  },
};

const refreshAccessToken = async (): Promise<string | null> => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const current = sessionStore.get();
    if (!current) return null;
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: current.refreshToken ? JSON.stringify({ refreshToken: current.refreshToken }) : undefined,
    });
    if (!response.ok) {
      sessionStore.set(null);
      window.dispatchEvent(new Event('atlas:unauthorized'));
      return null;
    }
    const raw = (await response.json()) as { data?: Partial<Session> & { accessToken: string } } & Partial<Session> & { accessToken?: string };
    const payload = (raw.data ?? raw) as Partial<Session> & { accessToken: string };
    const next = { ...current, ...payload } as Session;
    sessionStore.set(next);
    return next.accessToken;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
};

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  retry?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = sessionStore.get();
  const isForm = options.body instanceof FormData;
  const headers = new Headers(options.headers);
  if (!isForm && options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (session?.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`);

  const response = await fetch(path.startsWith('/api') ? path : `${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : isForm ? options.body as FormData : JSON.stringify(options.body),
  });
  if (response.status === 401 && options.retry !== false && !path.includes('/auth/')) {
    const token = await refreshAccessToken();
    if (token) return apiRequest<T>(path, { ...options, retry: false });
  }
  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try { body = (await response.json()) as ApiErrorBody; } catch { body = undefined; }
    const nested = typeof body?.error === 'object' ? body.error : undefined;
    const message = body?.message ?? nested?.message ?? (typeof body?.error === 'string' ? body.error : undefined) ?? 'Не удалось выполнить запрос';
    throw new ApiError(message, response.status, nested?.details ?? body, nested?.code);
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as { data?: T } | T;
  if (payload && typeof payload === 'object' && 'data' in payload) return (payload as { data: T }).data;
  return payload as T;
}

export const api = {
  login: (username: string, password: string) =>
    apiRequest<Session>('/auth/login', { method: 'POST', body: { username, password }, retry: false }),
  logout: (refreshToken?: string) => apiRequest<void>('/auth/logout', { method: 'POST', body: { refreshToken } }),
  me: () => apiRequest<Session['user']>('/auth/me'),
  list: <T>(resource: string) => apiRequest<T[]>(`/${resource}`),
  create: <T>(resource: string, body: unknown) => apiRequest<T>(`/${resource}`, { method: 'POST', body }),
  update: <T>(resource: string, id: string, body: unknown) => apiRequest<T>(`/${resource}/${id}`, { method: 'PATCH', body }),
  remove: (resource: string, id: string) => apiRequest<void>(`/${resource}/${id}`, { method: 'DELETE' }),
  uploadDocument: (file: File, metadata: Record<string, string>) => {
    const form = new FormData();
    form.set('file', file);
    Object.entries(metadata).forEach(([key, value]) => form.set(key, value));
    return apiRequest('/documents', { method: 'POST', body: form });
  },
  download: async (path: string): Promise<Blob> => {
    const execute = (token?: string) => fetch(`${API_BASE}${path}`, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    let response = await execute(sessionStore.get()?.accessToken);
    if (response.status === 401) {
      const token = await refreshAccessToken();
      if (token) response = await execute(token);
    }
    if (!response.ok) {
      let body: ApiErrorBody | undefined;
      try { body = await response.json() as ApiErrorBody; } catch { body = undefined; }
      const nested = typeof body?.error === 'object' ? body.error : undefined;
      throw new ApiError(body?.message ?? nested?.message ?? 'Не удалось скачать файл', response.status, nested?.details, nested?.code);
    }
    return response.blob();
  },
};
