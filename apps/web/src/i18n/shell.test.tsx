import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { ApiError } from '../lib/api';
import { loginErrorMessage } from '../pages/LoginPage';
import i18n from '.';

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });

describe('shell in each language', () => {
  it('shows the login screen in Ukrainian and switches it to English, remembered for this browser', async () => {
    await i18n.changeLanguage('uk');
    const user = userEvent.setup();
    renderAt('/login');
    expect(await screen.findByRole('heading', { name: 'Вхід до робочого простору' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Увійти/ })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'English' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Username/)).toBeInTheDocument();
    expect(localStorage.getItem('atlas.language')).toBe('en');
  });

  it('shows the menu, the page title and the bell in the account\'s language', async () => {
    localStorage.setItem('atlas.session', JSON.stringify({ ...demoSessions.employee, user: { ...demoSessions.employee!.user, language: 'en' } }));
    renderAt('/tasks');
    const menu = await screen.findByRole('navigation', { name: 'Main navigation' }, { timeout: 5_000 });
    expect(within(menu).getByRole('link', { name: /My tasks/ })).toBeInTheDocument();
    expect(within(menu).getByText('COMMUNICATION & CONTROL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Notifications/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report a problem' })).toBeInTheDocument();
  });

  it('explains sign-in failures in each language', async () => {
    const limited = new ApiError('Too many', 429);
    limited.retryAfterSeconds = 420;
    await i18n.changeLanguage('uk');
    expect(loginErrorMessage(limited)).toBe('Забагато спроб входу. Повторіть через 7 хв.');
    await i18n.changeLanguage('ru');
    expect(loginErrorMessage(limited)).toBe('Слишком много попыток входа. Повторите через 7 мин.');
    await i18n.changeLanguage('en');
    expect(loginErrorMessage(new ApiError('Bad', 401))).toMatch(/^Wrong username or password/);
  });
});
