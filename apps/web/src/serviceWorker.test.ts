import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

type Listener = (event: { data?: unknown; notification?: unknown; waitUntil: (promise: Promise<unknown>) => void }) => void;

/** Runs public/sw.js against a fake worker scope and returns its handlers and spies. */
function loadWorker(windows: Array<{ url: string; focused: boolean; visibilityState?: 'visible' | 'hidden' }>, { chromium = true } = {}) {
  const listeners = new Map<string, Listener>();
  const clients = windows.map((window) => ({ visibilityState: window.focused ? 'visible' : 'hidden', ...window, focus: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined) }));
  const scope = {
    addEventListener: (name: string, listener: Listener) => listeners.set(name, listener),
    skipWaiting: vi.fn(), location: { origin: 'https://atlas.rdim.ua' }, navigator: chromium ? { userAgentData: { brands: [] } } : {},
    registration: { showNotification: vi.fn(async () => undefined) },
    clients: { matchAll: vi.fn(async () => clients), openWindow: vi.fn(async () => undefined), claim: vi.fn() },
  };
  const cached = new Map<string, unknown>();
  const caches = {
    open: vi.fn(async () => ({ add: vi.fn(async (request: { url: string }) => { cached.set(new URL(request.url, 'https://atlas.rdim.ua').pathname, 'offline page'); }) })),
    match: vi.fn(async (path: string) => cached.get(path)),
    keys: vi.fn(async () => ['atlas-offline-v1', 'old-cache']), delete: vi.fn(async () => true),
  };
  const network = { fail: false };
  const fetch = vi.fn(async () => { if (network.fail) throw new TypeError('Failed to fetch'); return 'network page'; });
  class Request { constructor(public url: string) {} }
  const Response = { error: () => 'error response' };
  new Function('self', 'caches', 'fetch', 'Request', 'Response', readFileSync(resolve(__dirname, '../public/sw.js'), 'utf8'))(scope, caches, fetch, Request, Response);
  const fire = async (name: string, event: object) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get(name)!({ ...event, waitUntil: (promise) => { pending = promise; } });
    await pending;
  };
  /** Dispatches a fetch event; resolves what the worker responded with, or undefined when it let the request through. */
  const request = async (mode: string, url: string) => {
    let responded: Promise<unknown> | undefined;
    listeners.get('fetch')!({ request: { mode, url }, respondWith: (promise: Promise<unknown>) => { responded = promise; } } as never);
    return responded ? await responded : undefined;
  };
  return { scope, clients, fire, request, network, caches, fetch };
}
const push = (payload: object) => ({ data: { json: () => payload, text: () => JSON.stringify(payload) } });

describe('service worker', () => {
  it('shows a pushed notification when no Atlas window is focused', async () => {
    const worker = loadWorker([{ url: 'https://atlas.rdim.ua/crm', focused: false }]);
    await worker.fire('push', push({ id: 'n1', title: 'Новая задача: КП', body: 'Наталія · Задачи отдела', link: '/tasks?task=t1', tag: 'TASK_ASSIGNED:t1' }));
    expect(worker.scope.registration.showNotification).toHaveBeenCalledWith('Новая задача: КП', expect.objectContaining({
      body: 'Наталія · Задачи отдела', tag: 'TASK_ASSIGNED:t1', icon: '/notification-icon.png', data: { link: '/tasks?task=t1' },
    }));
  });

  it('stays quiet while Atlas is the focused window, except for a test', async () => {
    const worker = loadWorker([{ url: 'https://atlas.rdim.ua/', focused: true }]);
    await worker.fire('push', push({ id: 'n2', title: 'Сообщение', link: '/messages' }));
    expect(worker.scope.registration.showNotification).not.toHaveBeenCalled();
    await worker.fire('push', push({ id: 'test-1', title: 'Atlas: проверка уведомлений', link: '/profile#notifications', tag: 'test' }));
    expect(worker.scope.registration.showNotification).toHaveBeenCalledTimes(1);
  });

  it('shows the pop-up when a minimised app still reports itself focused', async () => {
    const worker = loadWorker([{ url: 'https://atlas.rdim.ua/', focused: true, visibilityState: 'hidden' }]);
    await worker.fire('push', push({ id: 'n3', title: 'Сообщение от Наталії', link: '/messages' }));
    expect(worker.scope.registration.showNotification).toHaveBeenCalledTimes(1);
  });

  it('always shows the pop-up in Safari, which cancels subscriptions for silent pushes', async () => {
    const worker = loadWorker([{ url: 'https://atlas.rdim.ua/', focused: true, visibilityState: 'visible' }], { chromium: false });
    await worker.fire('push', push({ id: 'n4', title: 'Новая задача', link: '/tasks' }));
    expect(worker.scope.registration.showNotification).toHaveBeenCalledTimes(1);
  });

  it('opens the link in an existing Atlas window, or a new one', async () => {
    const notification = { close: vi.fn(), data: { link: '/telegram?contact=c1' } };
    const open = loadWorker([{ url: 'https://atlas.rdim.ua/', focused: false }]);
    await open.fire('notificationclick', { notification });
    expect(open.clients[0]!.focus).toHaveBeenCalled();
    expect(open.clients[0]!.navigate).toHaveBeenCalledWith('https://atlas.rdim.ua/telegram?contact=c1');
    const closed = loadWorker([]);
    await closed.fire('notificationclick', { notification });
    expect(closed.scope.clients.openWindow).toHaveBeenCalledWith('https://atlas.rdim.ua/telegram?contact=c1');
  });

  it('keeps the offline page and shows it when a page load fails, without touching API or asset requests', async () => {
    const worker = loadWorker([]);
    await worker.fire('install', {});
    await worker.fire('activate', {});
    expect(worker.caches.delete).toHaveBeenCalledWith('old-cache');
    expect(await worker.request('navigate', 'https://atlas.rdim.ua/tasks')).toBe('network page');
    worker.network.fail = true;
    expect(await worker.request('navigate', 'https://atlas.rdim.ua/tasks')).toBe('offline page');
    worker.fetch.mockClear();
    expect(await worker.request('cors', 'https://atlas.rdim.ua/api/v1/tasks')).toBeUndefined();
    expect(await worker.request('no-cors', 'https://atlas.rdim.ua/assets/index.js')).toBeUndefined();
    expect(worker.fetch).not.toHaveBeenCalled();
  });
});
