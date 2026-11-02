import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { resetDemoChat } from '../lib/chat';
import { resetDemoMail } from '../lib/mail';
import { resetDemoTelegram } from '../lib/telegram';
import type { Language } from '.';

const renderAs = (language: Language, path: string, username: keyof typeof demoSessions = 'director') => {
  localStorage.setItem('atlas.session', JSON.stringify({ ...demoSessions[username], user: { ...demoSessions[username]!.user, language } }));
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};

beforeEach(() => { localStorage.clear(); resetDemoMail(); resetDemoTelegram(); resetDemoChat(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('mail and Telegram in each language', () => {
  it('shows mail folders and the compose window in English', async () => {
    const user = userEvent.setup();
    renderAs('en', '/mail', 'employee');
    const folders = await screen.findByRole('region', { name: 'Folders' }, { timeout: 5_000 });
    expect(await within(folders).findByRole('button', { name: /Inbox/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Conversations' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Compose' }));
    const dialog = await screen.findByRole('dialog', { name: 'New email' });
    expect(within(dialog).getByText('To')).toBeInTheDocument();
  });

  it('shows mail folders in Ukrainian', async () => {
    renderAs('uk', '/mail', 'employee');
    const folders = await screen.findByRole('region', { name: 'Папки' }, { timeout: 5_000 });
    expect(await within(folders).findByRole('button', { name: /Вхідні/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Листування' })).toBeInTheDocument();
  });

  it('shows the Telegram inbox and a conversation in Ukrainian', async () => {
    const user = userEvent.setup();
    renderAs('uk', '/telegram', 'employee');
    const list = await screen.findByRole('region', { name: 'Клієнти в Telegram' }, { timeout: 5_000 });
    await user.click(await within(list).findByRole('button', { name: /София Тёрнер/ }));
    const chat = await screen.findByRole('region', { name: 'Листування з София Тёрнер' });
    expect(within(chat).getByLabelText('Відповідь клієнту')).toBeInTheDocument();
    expect(within(chat).getByRole('button', { name: 'Завантажити photo.jpg' })).toBeInTheDocument();
  });

  it('shows the Telegram settings in English', async () => {
    renderAs('en', '/telegram/settings');
    expect(await screen.findByRole('heading', { name: 'Telegram settings' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByText('Greeting for a new customer')).toBeInTheDocument();
  });
});
