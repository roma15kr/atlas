import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { sessionStore } from '../lib/api';
import { AiAnalysisDialog } from './AiAnalysisDialog';

vi.mock('socket.io-client', () => ({ io: () => ({ onAny: vi.fn(), on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }) }));

const me = { id: 'u-1', username: 'head', fullName: 'Михаил Волков', role: 'MANAGER', departmentName: 'Продажи', rating: 0, kpis: [] };
const stored = { id: 'a-1', mode: 'FORECAST', createdAt: '2026-10-01T09:00:00Z', subjectId: 'u-4', requestedById: 'u-1', requestedByName: 'Михаил Волков', summary: 'Старый прогноз', recommendations: [], source: 'RULES' };
const fresh = { id: 'a-2', mode: 'ADVICE', createdAt: '2026-10-06T10:00:00Z', subjectId: 'u-4', requestedById: 'u-1', summary: 'Приоритеты на неделю', recommendations: ['Закрыть просроченные задачи'], source: 'AI', model: 'gpt-6-luna' };

beforeEach(() => {
  sessionStore.set({ accessToken: 'real-token', user: me } as never);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url === '/api/v1/ai/analyze' && init?.method === 'POST') return json({ data: fresh });
    if (url.startsWith('/api/v1/ai/analyses?targetUserId=u-4')) return json({ data: [stored], meta: { total: 1 } });
    if (url.startsWith('/api/v1/team')) return json({ data: [me] });
    return json({ data: [], meta: { total: 0 } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('AI analysis dialog', () => {
  it('shows the model badge for an AI result and adds it to the stored history', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AuthProvider><WorkspaceProvider><AiAnalysisDialog targetUserId="u-4" targetName="Алексей Ким" onClose={() => undefined} /></WorkspaceProvider></AuthProvider></MemoryRouter>);
    const dialog = screen.getByRole('dialog', { name: 'AI-анализ' });
    expect(await within(dialog).findByRole('button', { name: /История · 1/ })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Сформировать' }));
    const result = await within(dialog).findByRole('region', { name: 'Результат анализа' });
    expect(within(result).getByText('AI · gpt-6-luna')).toBeInTheDocument();
    expect(within(result).queryByText(/Модель недоступна/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /История · 2/ }));
    const list = within(dialog).getByRole('list', { name: 'История анализов' });
    const [first, second] = within(list).getAllByRole('button');
    expect(within(first!).getByText('AI · gpt-6-luna')).toBeInTheDocument();
    expect(within(second!).getByText('Правила')).toBeInTheDocument();
  });
});
