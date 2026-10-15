import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

type Listener = (event: { data?: unknown; notification?: unknown; waitUntil: (promise: Promise<unknown>) => void }) => void;

/** Runs public/sw.js against a fake worker scope and returns its handlers and spies. */
function loadWorker(windows: Array<{ url: string; focused: boolean }>) {
  const listeners = new Map<string, Listener>();
  const clients = windows.map((window) => ({ ...window, focus: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined) }));
  const scope = {
    addEventListener: (name: string, listener: Listener) => listeners.set(name, listener),
    skipWaiting: vi.fn(), location: { origin: 'https://atlas.rdim.ua' },
    registration: { showNotification: vi.fn(async () => undefined) },
    clients: { matchAll: vi.fn(async () => clients), openWindow: vi.fn(async () => undefined), claim: vi.fn() },
  };
  new Function('self', readFileSync(resolve(__dirname, '../public/sw.js'), 'utf8'))(scope);
  const fire = async (name: string, event: object) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get(name)!({ ...event, waitUntil: (promise) => { pending = promise; } });
    await pending;
  };
  return { scope, clients, fire };
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
});
