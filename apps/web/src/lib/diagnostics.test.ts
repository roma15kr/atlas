import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, sessionStore } from './api';
import { cleanPath, diagnosticsSnapshot, MAX_EVENTS, recordDiagnostic, resetDiagnostics, summarizeDiagnostics } from './diagnostics';

beforeEach(() => resetDiagnostics());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); sessionStore.set(null); });

describe('diagnostic log', () => {
  it('strips query strings and fragments from paths', () => {
    expect(cleanPath('/api/v1/clients?q=Ромашка&token=abc#x')).toBe('/api/v1/clients');
    expect(cleanPath('https://atlas.example/api/v1/deals/7f3?x=1')).toBe('/api/v1/deals/7f3');
  });

  it('records a failed API request with method, path, status and request id, and never the body', async () => {
    sessionStore.set({ accessToken: 'real-token', user: { id: 'u-1' } } as never);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR' } }), { status: 500, headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-500' } })));
    await expect(apiRequest('/deals/7f3?draft=1', { method: 'PATCH', body: { title: 'Секретна угода', value: 125000 } })).rejects.toThrow();
    const [event] = diagnosticsSnapshot().events;
    expect(event).toMatchObject({ type: 'request', method: 'PATCH', path: '/api/v1/deals/7f3', status: 500, requestId: 'req-500' });
    expect(JSON.stringify(diagnosticsSnapshot())).not.toMatch(/Секретна|125000|draft|real-token/);
  });

  it('keeps at most 100 events from the last 15 minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T10:00:00Z'));
    recordDiagnostic({ type: 'route', path: '/old' });
    vi.setSystemTime(new Date('2026-10-06T10:20:00Z'));
    for (let index = 0; index < MAX_EVENTS + 5; index += 1) recordDiagnostic({ type: 'route', path: `/p${index}` });
    const events = diagnosticsSnapshot(Date.parse('2026-10-06T10:20:00Z')).events;
    expect(events).toHaveLength(MAX_EVENTS);
    expect(events.some((event) => event.type === 'route' && event.path === '/old')).toBe(false);
  });

  it('summarises errors, requests and failures in plain words', () => {
    recordDiagnostic({ type: 'error', message: 'boom' });
    recordDiagnostic({ type: 'request', method: 'GET', path: '/api/v1/clients', status: 200, ms: 40 });
    recordDiagnostic({ type: 'request', method: 'PATCH', path: '/api/v1/deals/1', status: 500, ms: 400 });
    expect(summarizeDiagnostics(diagnosticsSnapshot())[0]).toBe('Ошибок приложения: 1; запросов к серверу: 2 (с ошибкой: 1)');
  });
});
