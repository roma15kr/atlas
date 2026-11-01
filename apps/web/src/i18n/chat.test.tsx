import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { resetDemoChat } from '../lib/chat';
import { attachmentProblem } from '../lib/chatAttachments';
import { emojiName, searchEmoji } from '../lib/reactions';
import { searchChannelIcons } from '../lib/channelIcons';
import i18n, { type Language } from '.';

const renderAs = (language: Language, path: string) => {
  localStorage.setItem('atlas.session', JSON.stringify({ ...demoSessions.director, user: { ...demoSessions.director!.user, language } }));
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};

beforeEach(() => { localStorage.clear(); resetDemoChat(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('chat in each language', () => {
  it('shows the conversation list and a channel in English', async () => {
    renderAs('en', '/messages?conversation=ch-general');
    const list = await screen.findByRole('region', { name: 'Conversations' }, { timeout: 5_000 });
    expect(within(list).getByText('Direct messages')).toBeInTheDocument();
    const conversation = await screen.findByRole('region', { name: /^Conversation / });
    expect(within(conversation).getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(within(conversation).getByText(/Public channel · \d+ members?/)).toBeInTheDocument();
  });

  it('searches channel icons in Ukrainian with Ukrainian group headings', async () => {
    const user = userEvent.setup();
    renderAs('uk', '/messages?conversation=ch-general');
    const conversation = await screen.findByRole('region', { name: /^Розмова / }, { timeout: 5_000 });
    await user.click(within(conversation).getByRole('button', { name: 'Іконка каналу' }));
    const picker = within(screen.getByRole('dialog', { name: 'Вибір іконки' }));
    await user.type(picker.getByLabelText('Знайти іконку'), 'вантаж');
    expect(picker.getByRole('button', { name: 'Вантажівка' })).toBeInTheDocument();
    expect(picker.getByText('Склад і доставка')).toBeInTheDocument();
  });

  it('names and finds emoji, and explains file rules, in English', async () => {
    await i18n.changeLanguage('en');
    expect(emojiName('👍')).toBe('like');
    expect(searchEmoji('thanks').map((item) => item.emoji)).toContain('🙏');
    expect(searchChannelIcons('truck').map((item) => item.key)).toContain('truck');
    expect(attachmentProblem({ name: 'setup.exe', size: 10 })).toMatch(/^«setup\.exe»: this file can’t be attached\. Allowed: PDF/);
  });
});
