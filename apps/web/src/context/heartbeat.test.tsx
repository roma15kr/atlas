import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '../lib/api';
import { AuthProvider, WorkspaceProvider } from './AppContext';

const emit = vi.fn();
vi.mock('socket.io-client', () => ({ io: () => ({ onAny: vi.fn(), on: vi.fn(), emit, disconnect: vi.fn() }) }));

const user = { id: 'u-1', username: 'anna', fullName: 'Анна', role: 'EMPLOYEE', departmentName: 'Продажи', rating: 0, kpis: [] };
const heartbeats = () => emit.mock.calls.filter(([event]) => event === 'presence:heartbeat').map(([, payload]) => payload as { active: boolean });

beforeEach(() => {
  emit.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  sessionStore.set({ accessToken: 'real-token', user } as never);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [], meta: { total: 0 } }), { headers: { 'Content-Type': 'application/json' } })));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('presence heartbeats', () => {
  it('reports activity every minute, idleness within 15 seconds of 5 idle minutes, and activity again at once', async () => {
    render(<AuthProvider><WorkspaceProvider><span /></WorkspaceProvider></AuthProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(heartbeats().at(-1)).toEqual({ active: true });

    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(heartbeats().at(-1)).toEqual({ active: false });
    const idleBeats = heartbeats().length;

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown')); });
    expect(heartbeats().length).toBe(idleBeats + 1);
    expect(heartbeats().at(-1)).toEqual({ active: true });
  });
});
