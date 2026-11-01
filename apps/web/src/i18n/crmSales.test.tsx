import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import type { Language } from '.';

const renderAs = (language: Language, path: string) => {
  localStorage.setItem('atlas.session', JSON.stringify({ ...demoSessions.director, user: { ...demoSessions.director!.user, language } }));
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });

describe('CRM and sales in each language', () => {
  it('lists clients in English', async () => {
    renderAs('en', '/crm');
    expect(await screen.findByRole('heading', { name: 'Clients' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add client/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeInTheDocument();
  });

  it('shows the funnel in Ukrainian with Ukrainian plural endings', async () => {
    renderAs('uk', '/sales');
    expect(await screen.findByRole('button', { name: /Нова угода/ }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByText(/\d+ угод(и|а)? · .* в активній роботі/)).toBeInTheDocument();
  });

  it('shows funnel settings in English', async () => {
    renderAs('en', '/sales/settings');
    expect(await screen.findByRole('heading', { name: 'Funnel settings' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByText(/\d+ funnels? · \d+ stages?/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add stage/ })).toBeInTheDocument();
  });
});
