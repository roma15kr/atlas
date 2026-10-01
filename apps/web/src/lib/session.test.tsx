import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { apiRequest, sessionStore } from './api';

const ioCalls = vi.fn();
vi.mock('socket.io-client', () => ({ io: (...args: unknown[]) => { ioCalls(...args); return { onAny: vi.fn(), on: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), connect: vi.fn() }; } }));

const user = { id: 'u-1', username: 'anna', fullName: 'Анна Соколова', role: 'EMPLOYEE', departmentName: 'Продажи', rating: 0, kpis: [] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let refreshes = 0;
let refreshOk = true;

beforeEach(() => {
  refreshes = 0; refreshOk = true; ioCalls.mockClear();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/v1/auth/refresh') { refreshes += 1; return refreshOk ? json({ data: { accessToken: `fresh-${refreshes}`, user } }) : json({ error: { code: 'REFRESH_EXPIRED' } }, 401); }
    if (url.startsWith('/api/v1/team')) return json({ data: [user] });
    return json({ data: [], meta: { total: 0 } });
  }));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

const storedText = () => Object.keys(localStorage).map((key) => `${key}=${localStorage.getItem(key)}`).join('\n');
const renderApp = () => render(<MemoryRouter initialEntries={['/']}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);

describe('session storage', () => {
  it('keeps the access token out of browser storage and leaves only a hint', () => {
    sessionStore.set({ accessToken: 'secret-token', user } as never);
    expect(storedText()).not.toContain('secret-token');
    expect(localStorage.getItem('atlas.signedIn')).toBe('1');
    sessionStore.set(null);
    expect(storedText()).toBe('');
  });

  it('turns a session saved by an older version into a restore hint', () => {
    localStorage.setItem('atlas.session', JSON.stringify({ accessToken: 'old-token', user }));
    expect(sessionStore.get()).toBeNull();
    expect(storedText()).toBe('atlas.signedIn=1');
  });

  it('restores the session on reload through the refresh cookie without showing the login screen', async () => {
    localStorage.setItem('atlas.signedIn', '1');
    renderApp();
    expect(screen.getByText('Открываем рабочее пространство')).toBeInTheDocument();
    expect(await screen.findByText(/Добрый день, Анна/)).toBeInTheDocument();
    expect(storedText()).not.toContain('fresh-');
  });

  it('shows the login screen when the restore is refused', async () => {
    localStorage.setItem('atlas.signedIn', '1');
    refreshOk = false;
    renderApp();
    await waitFor(() => expect(screen.queryByText('Открываем рабочее пространство')).not.toBeInTheDocument());
    expect(screen.queryByText(/Добрый день/)).not.toBeInTheDocument();
    expect(localStorage.getItem('atlas.signedIn')).toBeNull();
  });
});

describe('token refresh', () => {
  it('shares one refresh between concurrent 401s and holds the cross-tab lock', async () => {
    const request = vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback());
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
    sessionStore.set({ accessToken: 'expired', user } as never);
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/auth/refresh') { refreshes += 1; return json({ data: { accessToken: 'renewed', user } }); }
      calls += 1;
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === 'Bearer renewed' ? json({ data: 'ok' }) : json({ error: { code: 'INVALID_ACCESS_TOKEN' } }, 401);
    }));
    const results = await Promise.all([apiRequest('/clients'), apiRequest('/deals')]);
    expect(results).toEqual(['ok', 'ok']);
    expect(refreshes).toBe(1);
    expect(request).toHaveBeenCalledWith('atlas-refresh', expect.any(Function));
    expect(calls).toBe(4);
    Reflect.deleteProperty(navigator, 'locks');
  });

  it('keeps the same socket when the access token is refreshed', async () => {
    sessionStore.set({ accessToken: 'first', user } as never);
    renderApp();
    await screen.findByText(/Добрый день, Анна/);
    expect(ioCalls).toHaveBeenCalledTimes(1);
    await act(async () => { sessionStore.set({ ...sessionStore.get()!, accessToken: 'second' }); window.dispatchEvent(new Event('focus')); });
    expect(ioCalls).toHaveBeenCalledTimes(1);
  });
});
