import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { AuthProvider, WorkspaceProvider } from '../../context/AppContext';
import { demoSessions } from '../../data/demo';
import { sessionStore } from '../../lib/api';
import { resetDemoChat } from '../../lib/chat';

vi.mock('socket.io-client', () => ({ io: () => ({ onAny: vi.fn(), on: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), connect: vi.fn() }) }));

const renderApp = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
const firstMessage = async () => (await screen.findAllByRole('article', { name: /^Сообщение / }))[0]!;

beforeEach(() => { localStorage.clear(); resetDemoChat(); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

describe('reactions in chat', () => {
  it('adds a quick reaction, shows who reacted, and takes it back with a click', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.employee));
    renderApp('/messages?conversation=ch-general');
    const message = await firstMessage();
    await user.click(within(message).getByRole('button', { name: 'Добавить реакцию' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Выбор реакции' })).getByRole('button', { name: 'нравится' }));
    const chip = await within(message).findByRole('button', { name: /^👍 1\./ });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveAttribute('title', 'нравится: Вы');
    await user.click(chip);
    expect(within(message).queryByRole('button', { name: /^👍/ })).not.toBeInTheDocument();
  });

  it('finds an emoji by its Russian name in the full picker', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.employee));
    renderApp('/messages?conversation=ch-general');
    const message = await firstMessage();
    await user.click(within(message).getByRole('button', { name: 'Добавить реакцию' }));
    await user.click(screen.getByRole('button', { name: 'Все эмодзи' }));
    await user.type(screen.getByRole('textbox', { name: 'Найти эмодзи' }), 'огонь');
    const results = screen.getByRole('dialog', { name: 'Выбор реакции' });
    expect(within(results).getAllByRole('button', { name: /огонь/ }).length).toBeGreaterThan(0);
    await user.click(within(results).getByRole('button', { name: 'огонь' }));
    expect(await within(message).findByRole('button', { name: /^🔥 1\./ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Выбор реакции' })).not.toBeInTheDocument();
  });

  it('shows a colleague\'s reaction as soon as it arrives', async () => {
    const conversation = { id: 'c-1', kind: 'CHANNEL', name: 'Продажі', description: null, visibility: 'PUBLIC', isDefault: false, archivedAt: null, myRole: 'MEMBER', isMember: true,
      canRead: true, canSee: true, canManage: false, unread: 0, mentions: 0, muted: false, memberCount: 3, participants: null, lastActivityAt: new Date().toISOString(), lastMessage: null };
    const message = { id: 'msg-1', conversationId: 'c-1', parentId: null, body: 'План на тиждень', replyCount: 0, lastReplyAt: null, editedAt: null, deletedAt: null,
      createdAt: new Date().toISOString(), author: { id: 'u-2', fullName: 'Наталія Денисюк', username: 'denysiuk', active: true }, mentionedUserIds: [], reactions: [] };
    const json = (data: unknown, meta?: unknown) => new Response(JSON.stringify(meta ? { data, meta } : { data }), { headers: { 'Content-Type': 'application/json' } });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/chat/conversations/c-1/messages')) return json([message], { hasMore: false });
      if (url.endsWith('/chat/conversations/c-1')) return json(conversation);
      if (url.endsWith('/chat/conversations')) return json([conversation]);
      if (url.endsWith('/chat/people')) return json([{ id: 'u-2', fullName: 'Наталія Денисюк', username: 'denysiuk' }]);
      return json([], { total: 0, unreadCount: 0, hasMore: false });
    }));
    sessionStore.set({ accessToken: 'real-token', user: { id: 'u-1', username: 'anna', fullName: 'Анна', role: 'EMPLOYEE', departmentName: 'Продажи', rating: 0, kpis: [] } } as never);
    renderApp('/messages?conversation=c-1');
    const item = await screen.findByRole('article', { name: 'Сообщение Наталія Денисюк' });
    act(() => {
      window.dispatchEvent(new CustomEvent('atlas:socket', { detail: { event: 'chat:reactions', payload: {
        conversationId: 'c-1', messageId: 'msg-1', reactions: [{ emoji: '🎉', count: 1, users: [{ id: 'u-2', fullName: 'Наталія Денисюк' }] }],
      } } }));
    });
    const chip = await within(item).findByRole('button', { name: /^🎉 1\./ });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).toHaveAttribute('title', 'ура: Наталія Денисюк');
  });
});
