import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { formatBirthday, validateProfile, profileFormOf } from '../lib/profile';
import i18n, { type Language } from '.';

const renderAs = (language: Language, path: string, username: keyof typeof demoSessions = 'director') => {
  localStorage.setItem('atlas.session', JSON.stringify({ ...demoSessions[username], user: { ...demoSessions[username]!.user, language } }));
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('workspace screens in each language', () => {
  it('greets on the dashboard and names its panels in English', async () => {
    renderAs('en', '/');
    expect(await screen.findByRole('heading', { name: /^Good afternoon, / }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByText('Who\'s online')).toBeInTheDocument();
    expect(screen.getByText('KPI progress')).toBeInTheDocument();
  });

  it('shows the team page in Ukrainian', async () => {
    renderAs('uk', '/team');
    expect(await screen.findByRole('heading', { name: 'Команда' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByLabelText('Пошук співробітників')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Додати співробітника' })).toBeInTheDocument();
  });

  it('shows the profile in English', async () => {
    renderAs('en', '/profile', 'employee');
    expect(await screen.findByRole('heading', { name: 'Profile' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByText('Personal details')).toBeInTheDocument();
    expect(screen.getByText('Monitoring consent')).toBeInTheDocument();
  });

  it('shows reports and documents in Ukrainian', async () => {
    renderAs('uk', '/reports');
    expect(await screen.findByRole('heading', { name: 'Звіти' }, { timeout: 5_000 })).toBeInTheDocument();
    cleanup();
    renderAs('uk', '/documents');
    expect(await screen.findByRole('heading', { name: 'Документи' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Усі файли/ })).toBeInTheDocument();
  });

  it('formats birthdays and profile errors in the interface language', async () => {
    await i18n.changeLanguage('uk');
    expect(formatBirthday('1994-03-12')).toBe('12 березня');
    await i18n.changeLanguage('en');
    expect(formatBirthday('03-12')).toBe('12 March');
    const form = { ...profileFormOf(demoSessions.employee!.user), fullName: 'A', phone: 'abc' };
    expect(validateProfile(form)).toMatchObject({ fullName: 'Enter a name of at least 2 characters', phone: 'Digits, spaces, +, brackets and hyphens; at least 5 digits' });
  });
});
