import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import i18n from '../i18n';
import { sessionStore } from '../lib/api';

const renderProfile = () => render(<MemoryRouter initialEntries={['/profile']}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);

beforeEach(() => { localStorage.clear(); localStorage.setItem('atlas.session', JSON.stringify(demoSessions.employee)); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('interface language setting', () => {
  it('switches to English at once, keeps it on the account, and comes back in English', async () => {
    const user = userEvent.setup();
    renderProfile();
    const section = (await screen.findByRole('radiogroup', { name: 'Язык интерфейса' }, { timeout: 5_000 })).closest('section, div.surface, .language-settings') as HTMLElement;
    expect(within(section).getByRole('radio', { name: 'Русский' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(section).getByRole('radio', { name: 'English' }));

    expect(await screen.findByRole('radiogroup', { name: 'Interface language' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.lang).toBe('en');
    expect(sessionStore.get()?.user.language).toBe('en');

    // Signed in again (a reload): the account's language wins over the browser's.
    const saved = sessionStore.get();
    cleanup();
    await i18n.changeLanguage('ru');
    localStorage.setItem('atlas.session', JSON.stringify(saved));
    sessionStore.set(saved);
    renderProfile();
    await waitFor(() => expect(screen.getByRole('radiogroup', { name: 'Interface language' })).toBeInTheDocument(), { timeout: 5_000 });
  }, 15_000);
});
