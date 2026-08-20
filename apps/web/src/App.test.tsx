import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { AuthProvider, WorkspaceProvider } from './context/AppContext';
import { demoSessions } from './data/demo';

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider>
  </MemoryRouter>,
);

describe('role-aware routing', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('redirects an employee away from director audit', async () => {
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.employee));
    renderAt('/audit');
    expect(await screen.findByText(/Добрый день, Анна/)).toBeInTheDocument();
    expect(screen.queryByText('Журнал аудита')).not.toBeInTheDocument();
  });

  it('shows director-only export in CRM', async () => {
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.director));
    renderAt('/crm');
    expect(await screen.findByRole('button', { name: 'Экспорт' })).toBeInTheDocument();
  });

  it('hides onboarding from employees', async () => {
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.employee));
    renderAt('/team');
    expect(await screen.findByRole('heading', { name: 'Команда' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить сотрудника' })).not.toBeInTheDocument();
  });

  it('forces managers to onboard employees in their own department', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team');
    await user.click(await screen.findByRole('button', { name: 'Добавить сотрудника' }));
    const role = screen.getByLabelText('Роль') as HTMLSelectElement;
    expect(role).toBeDisabled();
    expect(role.value).toBe('EMPLOYEE');
    expect(within(role).queryByRole('option', { name: 'Директор' })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Продажи')).toBeDisabled();
  });

  it('adds and selects a team member in demo mode', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.director));
    renderAt('/team');
    await user.click(await screen.findByRole('button', { name: 'Добавить сотрудника' }));
    await user.type(screen.getByLabelText('ФИО'), 'Дарья Лебедева');
    await user.type(screen.getByLabelText('Логин'), 'd.lebedeva');
    await user.selectOptions(screen.getByLabelText('Роль'), 'MANAGER');
    await user.type(screen.getByLabelText('Отдел'), 'Маркетинг');
    await user.type(screen.getByLabelText('Должность'), 'Руководитель маркетинга');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Добавить сотрудника' }));
    expect(await screen.findByRole('heading', { name: 'Сотрудник добавлен' })).toBeInTheDocument();
    expect(screen.getByText('d.lebedeva')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.getAllByText('Дарья Лебедева').length).toBeGreaterThan(0);
  });
});
