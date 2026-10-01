import type { Session } from '../types';

type ApiErrorBody = { message?: string; error?: string | { code?: string; message?: string; details?: unknown } };
export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown, public code?: string) {
    super(message);
  }
}

const API_BASE = '/api/v1';
/** Legacy key that held the whole session, access token included; removed on first load. */
const LEGACY_KEY = 'atlas.session';
/** "This browser has a signed-in session": try restoring it through the refresh cookie on load. */
const HINT_KEY = 'atlas.signedIn';
/** Demo sessions carry no secret, so they are kept whole. */
const DEMO_KEY = 'atlas.demoSession';
let refreshPromise: Promise<string | null> | null = null;
let current: Session | null = null;

const storage = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string | null) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage may be blocked */ } },
};
const isDemo = (session: Session | null) => Boolean(session?.accessToken.startsWith('demo-'));

/** Moves a session saved by older versions: demo sessions are kept, real ones become a restore hint. */
function migrateLegacy(): boolean {
  const raw = storage.get(LEGACY_KEY);
  if (raw === null) return false;
  storage.set(LEGACY_KEY, null);
  current = null;
  try {
    const legacy = JSON.parse(raw) as Session;
    if (isDemo(legacy)) storage.set(DEMO_KEY, JSON.stringify(legacy));
    else if (legacy?.accessToken) storage.set(HINT_KEY, '1');
  } catch { /* unreadable: nothing to keep */ }
  return true;
}

/**
 * The access token and user live only in memory, so a script injected into the page can't read
 * them from storage. A reload restores the session through the httpOnly refresh cookie.
 */
export const sessionStore = {
  get(): Session | null {
    migrateLegacy();
    if (current) return current;
    const demo = storage.get(DEMO_KEY);
    if (!demo) return null;
    try { current = JSON.parse(demo) as Session; } catch { storage.set(DEMO_KEY, null); }
    return current;
  },
  set(session: Session | null) {
    current = session;
    storage.set(LEGACY_KEY, null);
    storage.set(DEMO_KEY, session && isDemo(session) ? JSON.stringify(session) : null);
    storage.set(HINT_KEY, session && !isDemo(session) ? '1' : null);
  },
  /** True when a real session may be restorable from the refresh cookie. */
  canRestore(): boolean {
    migrateLegacy();
    return !current && storage.get(HINT_KEY) === '1';
  },
};

type RefreshPayload = { accessToken: string; user?: Record<string, unknown> };

/** Calls /auth/refresh; serialized across tabs so a rotated cookie is never presented twice. */
async function refreshCall(): Promise<RefreshPayload | null> {
  const run = async () => {
    const response = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
    if (!response.ok) return null;
    const raw = (await response.json()) as { data?: RefreshPayload } & Partial<RefreshPayload>;
    const payload = (raw.data ?? raw) as RefreshPayload;
    return payload.accessToken ? payload : null;
  };
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: { request: <T>(name: string, callback: () => Promise<T>) => Promise<T> } }).locks : undefined;
  if (locks?.request) return locks.request('atlas-refresh', run);
  // Without Web Locks, a short random delay makes two tabs refreshing at once unlikely to collide.
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 300));
  return run();
}

const refreshAccessToken = async (): Promise<string | null> => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const session = sessionStore.get();
    if (!session || isDemo(session)) return null;
    const payload = await refreshCall();
    if (!payload) {
      sessionStore.set(null);
      window.dispatchEvent(new Event('atlas:unauthorized'));
      return null;
    }
    // Keep the normalized user the app already holds; only the token changes.
    sessionStore.set({ ...session, accessToken: payload.accessToken });
    return payload.accessToken;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
};

/** Restores a session after a reload from the refresh cookie; returns the raw API user to normalize. */
export async function restoreSession(): Promise<RefreshPayload | null> {
  if (!sessionStore.canRestore()) return null;
  const payload = await refreshCall().catch(() => null);
  if (!payload) storage.set(HINT_KEY, null);
  return payload;
}

/** Exposed for the socket: refresh the token after the server refused it. */
export const renewAccessToken = refreshAccessToken;

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  retry?: boolean;
  /** Return the whole `{ data, meta }` payload instead of unwrapping `data`. */
  envelope?: boolean;
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
  if (options.envelope) return payload as T;
  if (payload && typeof payload === 'object' && 'data' in payload) return (payload as { data: T }).data;
  return payload as T;
}

const PAGE_SIZE = 100;

/** Follows limit/offset pagination until every row the caller may see has been loaded. */
export async function listAll<T>(resource: string, params: Record<string, string> = {}): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = new URLSearchParams({ ...params, limit: String(PAGE_SIZE), offset: String(offset) });
    const page = await apiRequest<{ data: T[]; meta?: { total?: number } }>(`/${resource}?${query}`, { envelope: true });
    rows.push(...page.data);
    if (page.data.length < PAGE_SIZE || rows.length >= (page.meta?.total ?? rows.length)) return rows;
  }
}

/** One page of a paginated resource, newest first. */
export async function listPage<T>(resource: string, limit: number): Promise<T[]> {
  return apiRequest<T[]>(`/${resource}?limit=${limit}`);
}

export const api = {
  login: (username: string, password: string) =>
    apiRequest<Session>('/auth/login', { method: 'POST', body: { username, password }, retry: false }),
  logout: (refreshToken?: string) => apiRequest<void>('/auth/logout', { method: 'POST', body: { refreshToken } }),
  me: () => apiRequest<Session['user']>('/auth/me'),
  list: <T>(resource: string) => apiRequest<T[]>(`/${resource}`),
  get: <T>(path: string) => apiRequest<T>(path),
  create: <T>(resource: string, body: unknown) => apiRequest<T>(`/${resource}`, { method: 'POST', body }),
  update: <T>(resource: string, id: string, body: unknown) => apiRequest<T>(`/${resource}/${id}`, { method: 'PATCH', body }),
  remove: (resource: string, id: string) => apiRequest<void>(`/${resource}/${id}`, { method: 'DELETE' }),
  put: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
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
