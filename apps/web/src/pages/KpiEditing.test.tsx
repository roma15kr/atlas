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

describe('KPI editing', () => {
  it('lets a head add an automatic KPI without an actual-value field', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team?user=u4');
    await user.click(await screen.findByRole('button', { name: 'Добавить KPI' }));
    const dialog = screen.getByRole('dialog', { name: 'Новый KPI' });
    await user.selectOptions(within(dialog).getByLabelText('Источник'), 'DEALS_WON_COUNT');
    expect(within(dialog).queryByLabelText('Факт')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Единица')).toHaveValue('сделок');
    await user.type(within(dialog).getByLabelText('Название'), 'Выигранные сделки');
    await user.type(within(dialog).getByLabelText('Цель'), '5');
    await user.click(within(dialog).getByRole('button', { name: 'Добавить KPI' }));
    expect(await screen.findByText('Выигранные сделки')).toBeInTheDocument();
    expect(screen.getByText('Авто')).toBeInTheDocument();
  });

  it('shows KPIs read-only to an employee', async () => {
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.employee));
    renderAt('/team');
    expect(await screen.findByText('Закрытая выручка')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить KPI' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Изменить KPI/ })).not.toBeInTheDocument();
  });

  it('deletes a KPI after confirmation', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.director));
    renderAt('/team?user=u5');
    await user.click(await screen.findByRole('button', { name: 'Удалить KPI «SLA заявок»' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Удалить KPI?' })).getByRole('button', { name: 'Удалить' }));
    expect(await screen.findByText('KPI не назначены')).toBeInTheDocument();
  });
});
