import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { sessionStore } from '../lib/api';

vi.mock('socket.io-client', () => ({ io: () => ({ onAny: vi.fn(), on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }) }));

const director = { id: 'u-9', username: 'boss', fullName: 'Елена Морозова', role: 'DIRECTOR', departmentName: null, rating: 0, kpis: [] };
const base = { kind: 'COMPLAINT', page: '/sales', hasScreenshot: false, createdAt: '2026-10-06T10:14:00Z', userId: 'u-3', reporterName: 'Анна Петрова', departmentName: 'Продажи', appVersion: 'a1b2c3d', userAgent: 'Chrome', viewport: '1440×900', attempts: 0, lastError: null, triagedAt: null };
const done = { ...base, id: 'f-1', message: 'Після «Зберегти» зміни зникають', status: 'ISSUE_CREATED', issueNumber: 42, issueUrl: 'https://github.com/roma15kr/atlas/issues/42', language: 'uk', titleEn: 'Deal changes disappear after saving', summaryEn: 'Changes are lost after saving.', translationEn: 'After clicking “Save” the changes disappear.', stepsEn: ['Open a deal', 'Click Save'], category: 'BUG', severity: 'HIGH', area: 'sales-pipeline' };
const failed = { ...base, id: 'f-2', message: 'Сповіщення приходять двічі', status: 'FAILED', attempts: 5, lastError: 'GitHub returned 502', issueNumber: null, issueUrl: null, language: null, titleEn: null, summaryEn: null, translationEn: null, stepsEn: null, category: null, severity: null, area: null };
const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push(`${init?.method ?? 'GET'} ${url}`);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url === '/api/v1/feedback/status') return json({ data: { openai: true, github: false, repository: null } });
    if (url.startsWith('/api/v1/feedback?')) return json({ data: [done, failed], meta: { total: 2 } });
    if (url === '/api/v1/feedback/f-1') return json({ data: { ...done, diagnostics: { events: [{ at: '2026-10-06T10:13:58Z', type: 'request', method: 'PATCH', path: '/api/v1/deals/7f3', status: 500, ms: 412, requestId: 'req-9c1e' }] } } });
    if (url === '/api/v1/feedback/f-2') return json({ data: { ...failed, diagnostics: { events: [] } } });
    if (url === '/api/v1/feedback/f-2/retry') return json({ data: { id: 'f-2', status: 'PENDING' } });
    if (url.startsWith('/api/v1/feedback/mine')) return json({ data: [], meta: { total: 0 } });
    if (url.startsWith('/api/v1/team')) return json({ data: [sessionStore.get()!.user] });
    return json({ data: [], meta: { total: 0 } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAs = (user: object) => {
  sessionStore.set({ accessToken: 'real-token', user } as never);
  render(<MemoryRouter initialEntries={['/feedback']}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};

describe('director inbox', () => {
  it('lists every report and opens one with the original, translation, log and GitHub link', async () => {
    const user = userEvent.setup();
    renderAs(director);
    const list = await screen.findByRole('region', { name: 'Все обращения' });
    expect(await within(list).findByText('Deal changes disappear after saving')).toBeInTheDocument();
    expect(within(list).getByText('Задача #42')).toBeInTheDocument();
    expect(within(list).getByText('Ошибка · попытка 5')).toBeInTheDocument();
    expect(await within(list).findByRole('note')).toHaveTextContent('задачи в GitHub не создаются: не задано GITHUB_TOKEN и GITHUB_REPOSITORY');
    await user.click(within(list).getByRole('button', { name: /Deal changes disappear/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Deal changes disappear after saving' });
    expect(await within(dialog).findByText('Після «Зберегти» зміни зникають')).toBeInTheDocument();
    expect(within(dialog).getByText('After clicking “Save” the changes disappear.')).toBeInTheDocument();
    expect(within(dialog).getByText(/PATCH \/api\/v1\/deals\/7f3 500 412 мс req req-9c1e/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'GitHub #42' })).toHaveAttribute('href', done.issueUrl);
    expect(within(dialog).queryByRole('button', { name: 'Обработать заново' })).not.toBeInTheDocument();
  });

  it('retries a failed report', async () => {
    const user = userEvent.setup();
    renderAs(director);
    const list = await screen.findByRole('region', { name: 'Все обращения' });
    await user.click(await within(list).findByRole('button', { name: /Сповіщення приходять двічі/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Обращение' });
    expect(await within(dialog).findByText('Последняя ошибка: GitHub returned 502')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Обработать заново' }));
    expect(calls).toContain('POST /api/v1/feedback/f-2/retry');
  });

  it('shows employees only their own reports', async () => {
    renderAs({ ...director, id: 'u-3', role: 'EMPLOYEE', departmentName: 'Продажи' });
    expect(await screen.findByRole('region', { name: 'Мои обращения' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Все обращения' })).not.toBeInTheDocument();
    expect(calls.some((call) => call.startsWith('GET /api/v1/feedback?'))).toBe(false);
  });
});
