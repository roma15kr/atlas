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

describe('reports screen', () => {
  it('filters by schedule and opens a report with its figures and history', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/reports');
    await user.click(await screen.findByRole('button', { name: 'Ежемесячные' }));
    expect(screen.queryByText('Недельный пульс продаж')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Все' }));
    await user.click(screen.getByRole('button', { name: 'Недельный пульс продаж' }));
    const dialog = screen.getByRole('dialog', { name: 'Недельный пульс продаж' });
    expect(within(dialog).getByText('74%')).toBeInTheDocument();
    expect(within(dialog).getByText('3 / 8')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /История/ }));
    expect(await within(dialog).findByText('3 / 8 сделок')).toBeInTheDocument();
  });

  it('pauses a recurring report and deletes one after confirmation', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/reports');
    await user.click(await screen.findByRole('button', { name: 'Приостановить «Недельный пульс продаж»' }));
    expect(screen.getByText('Пауза')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Удалить «Недельный пульс продаж»' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Удалить отчёт?' })).getByRole('button', { name: 'Удалить' }));
    expect(screen.queryByText('Недельный пульс продаж')).not.toBeInTheDocument();
  });
});

describe('AI analysis', () => {
  it('lets a head request a forecast for an employee and shows the source', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team?user=u4');
    await user.click(await screen.findByRole('button', { name: 'AI-анализ' }));
    const dialog = screen.getByRole('dialog', { name: 'AI-анализ' });
    await user.click(within(dialog).getByRole('button', { name: 'Прогноз' }));
    await user.click(within(dialog).getByRole('button', { name: 'Сформировать' }));
    const result = await within(dialog).findByRole('region', { name: 'Результат анализа' });
    expect(within(result).getByText(/Прогноз/)).toBeInTheDocument();
    expect(within(result).getByText('Правила')).toBeInTheDocument();
  });

  it('offers employees analysis of themselves only', async () => {
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.employee));
    renderAt('/profile');
    expect(await screen.findByText('AI-рекомендации')).toBeInTheDocument();
    cleanup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.employee));
    renderAt('/team');
    expect(await screen.findByRole('button', { name: 'AI-анализ' })).toBeInTheDocument();
  });
});
