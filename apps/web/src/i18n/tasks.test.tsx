import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import type { Language } from '.';

const renderAs = (username: 'director' | 'employee', language: Language, path: string) => {
  const session = demoSessions[username]!;
  localStorage.setItem('atlas.session', JSON.stringify({ ...session, user: { ...session.user, language } }));
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });

describe('tasks in each language', () => {
  it('shows «My tasks» in English with its status columns and counts', async () => {
    renderAs('employee', 'en', '/tasks');
    expect(await screen.findByRole('heading', { name: 'My tasks' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Not started' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByText(/^\d+ tasks?( · \d+ overdue)?( · on \d+ boards?)?$/)).toBeInTheDocument();
  });

  it('opens a task in Ukrainian', async () => {
    const user = userEvent.setup();
    renderAs('employee', 'uk', '/tasks');
    await user.click(await screen.findByRole('button', { name: 'Прайс для партнёров' }, { timeout: 5_000 }));
    const dialog = await screen.findByRole('dialog', { name: 'Задача' });
    expect(within(dialog).getByText('Опис')).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Пріоритет' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Зберегти' })).toBeInTheDocument();
  });

  it('shows a board in Ukrainian and board settings in English', async () => {
    renderAs('director', 'uk', '/boards');
    expect(await screen.findByRole('combobox', { name: 'Виконавець' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Усі виконавці' })).toBeInTheDocument();
    cleanup();
    renderAs('director', 'en', '/boards/settings');
    expect(await screen.findByRole('heading', { name: 'Board settings' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByText(/^\d+ boards? · \d+ stages?$/)).toBeInTheDocument();
  });
});
