import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { resetDemoFeedback } from '../lib/feedback';

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);

beforeEach(() => { localStorage.clear(); resetDemoFeedback(); localStorage.setItem('atlas.session', JSON.stringify(demoSessions.employee)); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('problem reports', () => {
  it('opens from the top bar on any page and records the page', async () => {
    const user = userEvent.setup();
    for (const path of ['/crm', '/tasks']) {
      renderAt(path);
      await user.click(await screen.findByRole('button', { name: 'Сообщить о проблеме' }));
      expect(within(screen.getByRole('dialog', { name: 'Сообщить о проблеме' })).getByText(new RegExp(`Страница: ${path}`))).toBeInTheDocument();
      cleanup();
    }
  });

  it('opens with Ctrl+Shift+F', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await screen.findByRole('button', { name: 'Сообщить о проблеме' });
    await user.keyboard('{Control>}{Shift>}F{/Shift}{/Control}');
    expect(screen.getByRole('dialog', { name: 'Сообщить о проблеме' })).toBeInTheDocument();
  });

  it('asks for more detail when the description is too short', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Сообщить о проблеме' }));
    const dialog = screen.getByRole('dialog', { name: 'Сообщить о проблеме' });
    await user.type(within(dialog).getByLabelText(/Что случилось/), 'не працює');
    await user.click(within(dialog).getByRole('button', { name: 'Отправить' }));
    expect(within(dialog).getByText('Опишите проблему подробнее')).toBeInTheDocument();
  });

  it('sends a complaint and shows it as waiting in «Мои обращения»', async () => {
    const user = userEvent.setup();
    renderAt('/sales');
    await user.click(await screen.findByRole('button', { name: 'Сообщить о проблеме' }));
    const dialog = screen.getByRole('dialog', { name: 'Сообщить о проблеме' });
    await user.click(within(dialog).getByRole('button', { name: 'Жалоба' }));
    await user.type(within(dialog).getByLabelText(/Что случилось/), 'Після натискання «Зберегти» зміни зникають');
    await user.click(within(dialog).getByRole('button', { name: 'Отправить' }));
    const done = await screen.findByRole('dialog', { name: 'Обращение отправлено' });
    await user.click(within(done).getByRole('button', { name: 'Мои обращения' }));
    const list = await screen.findByRole('region', { name: 'Мои обращения' });
    expect(await within(list).findByText(/зміни зникають/)).toBeInTheDocument();
    expect(within(list).getByText(/Жалоба/)).toBeInTheDocument();
    expect(within(list).getByText('Ожидает обработки')).toBeInTheDocument();
  });
});
