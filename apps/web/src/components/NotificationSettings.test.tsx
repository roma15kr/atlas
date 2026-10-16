import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { sessionStore } from '../lib/api';
import { NotificationSettings } from './NotificationSettings';

vi.mock('socket.io-client', () => ({ io: () => ({ onAny: vi.fn(), on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }) }));

const PUBLIC_KEY = `B${'A'.repeat(86)}`;
const user = { id: 'u-1', username: 'anna', fullName: 'Анна', role: 'EMPLOYEE', departmentName: 'Продажи', rating: 0, kpis: [] };
let pushEnabled = true;
const calls: Array<{ method: string; url: string; body?: unknown }> = [];
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }), unsubscribe: vi.fn(async () => true) };
let current: typeof subscription | null = null;
const registration = { pushManager: { getSubscription: vi.fn(async () => current), subscribe: vi.fn(async () => { current = subscription; return subscription; }) } };

const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { 'Content-Type': 'application/json' } });
const respond = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input); const method = init?.method ?? 'GET';
  calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  if (url.endsWith('/notifications/push/config')) return json(pushEnabled ? { enabled: true, publicKey: PUBLIC_KEY } : { enabled: false, publicKey: null });
  if (url.endsWith('/notifications/preferences')) return json({ tasks: true, chat: method === 'PATCH' ? false : true, telegram: true, alerts: true });
  if (url.endsWith('/notifications/push/subscriptions')) return json({ id: 's1' }, 201);
  if (url.endsWith('/notifications/push/test')) return json({ browsers: 1, delivered: 1 });
  return json([]);
};
const setPermission = (permission: NotificationPermission) => {
  vi.stubGlobal('Notification', Object.assign(function Notification() { /* mock */ }, { permission, requestPermission: vi.fn(async () => { (window.Notification as unknown as { permission: string }).permission = 'granted'; return 'granted'; }) }));
};
const renderSettings = () => render(<MemoryRouter><AuthProvider><NotificationSettings /></AuthProvider></MemoryRouter>);

beforeEach(() => {
  pushEnabled = true; calls.length = 0; current = null;
  sessionStore.set({ accessToken: 'real-token', user } as never);
  vi.stubGlobal('fetch', vi.fn(respond));
  vi.stubGlobal('PushManager', function PushManager() { /* mock */ });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: vi.fn(async () => registration), ready: Promise.resolve(registration), getRegistration: vi.fn(async () => current ? registration : undefined) } });
  setPermission('default');
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); sessionStore.set(null); });

describe('notification settings', () => {
  it('turns desktop notifications on for this browser and sends a test', async () => {
    const actions = userEvent.setup();
    renderSettings();
    await actions.click(await screen.findByRole('button', { name: 'Включить на этом устройстве' }));
    expect(await screen.findByText('Включены в этом браузере')).toBeInTheDocument();
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(calls.find((call) => call.method === 'POST' && call.url.endsWith('/push/subscriptions'))?.body).toEqual(subscription.toJSON());
    await actions.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Проверочное уведомление отправлено');
  });

  it('explains how to unblock notifications and offers no button when the browser blocked them', async () => {
    setPermission('denied');
    renderSettings();
    expect(await screen.findByText('Заблокированы браузером')).toBeInTheDocument();
    expect(screen.getByText(/«Уведомления: Разрешить»/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Включить на этом устройстве' })).not.toBeInTheDocument();
  });

  it('saves which groups pop up', async () => {
    const actions = userEvent.setup();
    renderSettings();
    await actions.click(await screen.findByRole('switch', { name: 'Сообщения: всплывающие уведомления' }));
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ chat: false });
    expect(screen.getByRole('switch', { name: 'Сообщения: всплывающие уведомления' })).not.toBeChecked();
  });

  it('says desktop notifications are unavailable without server keys', async () => {
    pushEnabled = false;
    renderSettings();
    expect(await screen.findByText(/ещё не настроены на сервере/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('says they are unavailable in demo mode', async () => {
    sessionStore.set(null);
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.employee));
    renderSettings();
    expect(await screen.findByText('В демо-режиме всплывающие уведомления недоступны.')).toBeInTheDocument();
  });
});
