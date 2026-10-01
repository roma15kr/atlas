import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, REFRESH_INTERVAL_MS, useWorkspace, WorkspaceProvider } from './AppContext';

vi.mock('socket.io-client', () => ({ io: () => ({ onAny: vi.fn(), on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }) }));

const employee = { id: 'u-1', username: 'anna', fullName: 'Анна Соколова', role: 'EMPLOYEE', departmentName: 'Продажи', rating: 0, kpis: [] };
const director = { ...employee, id: 'u-9', username: 'boss', role: 'DIRECTOR' };
const metrics = { clients: 230, pipelineValue: 1_250_000, weightedPipeline: 500_000, currency: 'UAH', openDeals: 7, tasks: { total: 9, overdue: 2, done: 4 }, online: 3, teamSize: 12 };
const clients = Array.from({ length: 230 }, (_, index) => ({ id: `c-${index}`, name: `Клиент ${index}`, ownerId: 'u-1' }));

let requests: string[] = [];
let failing = false;
let clientTotal = 230;

function respond(url: string): Response {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const { pathname, searchParams } = new URL(url, 'http://atlas.test');
  if (pathname === '/api/v1/team') return json({ data: [session.user] });
  if (pathname === '/api/v1/dashboard') return json({ data: { metrics } });
  if (pathname === '/api/v1/clients') {
    const offset = Number(searchParams.get('offset') ?? 0), limit = Number(searchParams.get('limit') ?? 25);
    return json({ data: clients.slice(0, clientTotal).slice(offset, offset + limit), meta: { total: clientTotal, limit, offset } });
  }
  return json({ data: [], meta: { total: 0 } });
}

let session = { accessToken: 'real-token', user: employee };

function Probe() {
  const { clients: loaded, dashboardMetrics, dataStatus } = useWorkspace();
  return <p data-testid="probe">{`${dataStatus}|${loaded.length}|${dashboardMetrics?.pipelineValue ?? '-'}`}</p>;
}

const renderWorkspace = () => render(<AuthProvider><WorkspaceProvider><Probe /></WorkspaceProvider></AuthProvider>);

beforeEach(() => {
  requests = []; failing = false; clientTotal = 230; session = { accessToken: 'real-token', user: employee };
  localStorage.setItem('atlas.session', JSON.stringify(session));
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (failing) throw new TypeError('Failed to fetch');
    return respond(url);
  }));
});

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('workspace loading', () => {
  it('follows pagination until every client is loaded and reads totals from /dashboard', async () => {
    renderWorkspace();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready|230|1250000'));
    const clientPages = requests.filter((url) => url.startsWith('/api/v1/clients?'));
    expect(clientPages).toHaveLength(3);
  });

  it('does not ask for the audit log in an employee session', async () => {
    renderWorkspace();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready|230'));
    expect(requests.some((url) => url.startsWith('/api/v1/audit'))).toBe(false);
  });

  it('loads one audit page for a director', async () => {
    session = { accessToken: 'real-token', user: director };
    localStorage.setItem('atlas.session', JSON.stringify(session));
    renderWorkspace();
    await waitFor(() => expect(requests.some((url) => url === '/api/v1/audit?limit=100')).toBe(true));
  });
});

describe('background refresh', () => {
  it('reloads every few minutes while visible and keeps data when a refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWorkspace();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready|230'));

    clientTotal = 231;
    clients.push({ id: 'c-new', name: 'Новый клиент', ownerId: 'u-1' });
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS); });
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready|231'));

    failing = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS); });
    expect(screen.getByTestId('probe')).toHaveTextContent('ready|231|1250000');
    clients.pop();
  });

  it('refreshes on focus only when the data is older than a minute', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWorkspace();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready|230'));
    const loads = () => requests.filter((url) => url === '/api/v1/dashboard').length;
    expect(loads()).toBe(1);
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(loads()).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(loads()).toBe(2));
  });
});
