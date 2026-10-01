import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });

describe('team administration', () => {
  it('lets a head edit an employee without offering role or department', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team?user=u4');
    await user.click(await screen.findByRole('button', { name: 'Изменить' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText('Роль')).not.toBeInTheDocument();
    const title = within(dialog).getByLabelText('Должность');
    await user.clear(title);
    await user.type(title, 'Старший менеджер');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect((await screen.findAllByText('Старший менеджер')).length).toBeGreaterThan(0);
  });

  it('offers no administration of the head themselves or of other departments', async () => {
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team?user=u2');
    await screen.findByRole('heading', { name: 'Михаил Волков' });
    expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
  });

  it('asks before disabling and lists the person under "Отключённые"', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.director));
    renderAt('/team?user=u5');
    await user.click(await screen.findByRole('button', { name: 'Отключить' }));
    const dialog = screen.getByRole('dialog', { name: /Отключить сотрудника/ });
    expect(within(dialog).getByText(/открытые сеансы будут закрыты/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Отключить' }));
    expect(screen.queryByRole('button', { name: /Ольга Соколова/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Отключённые/ }));
    await user.click(await screen.findByRole('button', { name: /Ольга Соколова/ }));
    expect(screen.getByText('Отключён')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Включить' })).toBeInTheDocument();
  });

  it('shows copyable credentials after a password reset', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team?user=u4');
    await user.click(await screen.findByRole('button', { name: 'Сбросить пароль' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сбросить пароль' }));
    const done = await screen.findByRole('dialog', { name: 'Пароль сброшен' });
    expect(within(done).getByText('alex')).toBeInTheDocument();
    expect(within(done).getByRole('button', { name: 'Скопировать доступ' })).toBeInTheDocument();
  });
});

describe('forced password change', () => {
  it('shows only the change screen until the password is changed', async () => {
    const user = userEvent.setup();
    const session = demoSessions.employee;
    localStorage.setItem('atlas.session', JSON.stringify({ ...session, user: { ...session.user, mustChangePassword: true } }));
    renderAt('/crm');
    expect(await screen.findByRole('heading', { name: 'Задайте новый пароль' })).toBeInTheDocument();
    expect(screen.queryByText('Клиенты')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Текущий пароль'), 'Temporary-Pass-77');
    await user.type(screen.getByLabelText(/^Новый пароль/), 'short');
    await user.type(screen.getByLabelText('Повторите пароль'), 'short');
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Не менее 12 символов');
    await user.clear(screen.getByLabelText(/^Новый пароль/));
    await user.clear(screen.getByLabelText('Повторите пароль'));
    await user.type(screen.getByLabelText(/^Новый пароль/), 'My-Own-Secret-2026');
    await user.type(screen.getByLabelText('Повторите пароль'), 'My-Own-Secret-2026');
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
    expect(await screen.findByText(/Добрый день, Анна/)).toBeInTheDocument();
  });
});
