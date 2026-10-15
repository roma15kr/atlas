import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { resetDemoNotifications } from '../lib/notifications';

const renderAs = (username: keyof typeof demoSessions, path: string) => {
  localStorage.setItem('atlas.session', JSON.stringify(demoSessions[username]));
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};

beforeEach(() => { localStorage.clear(); resetDemoNotifications(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('notification bell', () => {
  it('lists notifications and opens the task from one, marking it read', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/');
    await user.click(await screen.findByRole('button', { name: 'Уведомления: 2 непрочитанных' }));
    const panel = screen.getByRole('dialog', { name: 'Уведомления' });
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3);
    await user.click(within(panel).getByRole('button', { name: /Новая задача: Подготовить коммерческое предложение/ }));
    expect(await screen.findByRole('heading', { name: 'Мои задачи' })).toBeInTheDocument();
    expect(await screen.findByRole('dialog', { name: 'Задача' })).toHaveTextContent('Задачи отдела');
    expect(screen.getByRole('button', { name: 'Уведомления: 1 непрочитанное' })).toBeInTheDocument();
  });

  it('marks everything read', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/');
    await user.click(await screen.findByRole('button', { name: /Уведомления: 2/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Уведомления' })).getByRole('button', { name: /Прочитать все/ }));
    expect(screen.getByRole('button', { name: 'Уведомления' })).toBeInTheDocument();
  });

  it('adds a notification that arrives live', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/');
    await screen.findByRole('button', { name: /Уведомления: 2/ });
    act(() => {
      window.dispatchEvent(new CustomEvent('atlas:socket', { detail: { event: 'notification:new', payload: {
        id: 'live-1', kind: 'CHAT_DIRECT', title: 'Михаил Волков', body: 'Зайди, пожалуйста', link: '/messages', createdAt: new Date().toISOString(), readAt: null,
      } } }));
    });
    await user.click(screen.getByRole('button', { name: 'Уведомления: 3 непрочитанных' }));
    expect(within(screen.getByRole('dialog', { name: 'Уведомления' })).getByText('Зайди, пожалуйста')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/');
    await user.click(await screen.findByRole('button', { name: /Уведомления: 2/ }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Уведомления' })).not.toBeInTheDocument();
  });
});
