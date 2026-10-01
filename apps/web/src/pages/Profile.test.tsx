import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';

vi.mock('socket.io-client', () => ({ io: () => ({ onAny: vi.fn(), on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }) }));

let user = { id: 'u-1', username: 'anna', fullName: 'Анна Соколова', role: 'EMPLOYEE', departmentName: 'Продажи', rating: 0, kpis: [] };
const patches: unknown[] = [];

beforeEach(() => {
  patches.length = 0;
  user = { ...user, fullName: 'Анна Соколова' };
  localStorage.setItem('atlas.session', JSON.stringify({ accessToken: 'real-token', user }));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url === '/api/v1/team/me' && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as { fullName: string; specialty: string };
      patches.push(body);
      user = { ...user, fullName: body.fullName };
      return json({ data: { id: 'u-1', fullName: body.fullName, specialty: body.specialty || null } });
    }
    if (url.startsWith('/api/v1/team')) return json({ data: [user] });
    return json({ data: [], meta: { total: 0 } });
  }));
});

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

describe('profile', () => {
  it('saves the name through the API and shows it in the sidebar', async () => {
    const actor = userEvent.setup();
    render(<MemoryRouter initialEntries={['/profile']}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
    const name = await screen.findByLabelText('Полное имя');
    await actor.clear(name);
    await actor.type(name, 'Анна Коваль');
    await actor.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(patches).toEqual([{ fullName: 'Анна Коваль', specialty: '' }]));
    expect(await screen.findByRole('heading', { name: 'Анна Коваль' })).toBeInTheDocument();
    expect(within(document.querySelector('.sidebar__user') as HTMLElement).getByText('Анна Коваль')).toBeInTheDocument();
  });

  it('offers no controls for settings Atlas does not have', async () => {
    render(<MemoryRouter initialEntries={['/profile']}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
    await screen.findByLabelText('Полное имя');
    expect(screen.queryByText('Двухфакторная аутентификация')).not.toBeInTheDocument();
    expect(screen.queryByText('Уведомления в интерфейсе')).not.toBeInTheDocument();
  });
});
