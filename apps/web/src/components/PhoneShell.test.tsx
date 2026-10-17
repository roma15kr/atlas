import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { resetDemoChat } from '../lib/chat';
import { resetDemoTelegram } from '../lib/telegram';
import { phoneViewport } from '../test/phone';

let restore: () => void = () => undefined;
const renderAs = (username: keyof typeof demoSessions, path = '/') => {
  localStorage.setItem('atlas.session', JSON.stringify(demoSessions[username]));
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};

beforeEach(() => { localStorage.clear(); resetDemoChat(); resetDemoTelegram(); });
afterEach(() => { cleanup(); restore(); restore = () => undefined; localStorage.clear(); });

describe('phone shell', () => {
  it('shows the bottom bar with unread counts and switches screens from it', async () => {
    restore = phoneViewport();
    const user = userEvent.setup();
    renderAs('employee');
    const bar = await screen.findByRole('navigation', { name: 'Быстрая навигация' });
    expect(within(bar).getAllByRole('link').map((link) => link.textContent)).toEqual(['Задачи', expect.stringContaining('Сообщения'), expect.stringContaining('Telegram'), 'CRM']);
    expect(await within(bar).findByLabelText('непрочитанных: 4')).toBeInTheDocument();
    await user.click(within(bar).getByRole('link', { name: /Сообщения/ }));
    expect(within(bar).getByRole('link', { name: /Сообщения/ })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('region', { name: 'Разговоры' })).toBeInTheDocument();
  });

  it('opens the full menu from «Ещё»', async () => {
    restore = phoneViewport();
    const user = userEvent.setup();
    renderAs('employee');
    await user.click(within(await screen.findByRole('navigation', { name: 'Быстрая навигация' })).getByRole('button', { name: 'Ещё' }));
    expect(document.querySelector('.sidebar')).toHaveClass('sidebar--open');
  });

  it('keeps the sidebar and no bottom bar on a desktop', async () => {
    renderAs('employee');
    await screen.findByRole('navigation', { name: 'Основная навигация' });
    expect(screen.queryByRole('navigation', { name: 'Быстрая навигация' })).not.toBeInTheDocument();
  });

  it('measures the real top and bottom bars, so a conversation fits between them without the page scrolling', async () => {
    restore = phoneViewport();
    // An iPhone with a notch: the top bar is taller than on Android.
    const heights: Record<string, number> = { topbar: 102, 'bottom-nav': 64 };
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const height = Object.entries(heights).find(([name]) => this.classList.contains(name))?.[1] ?? 0;
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 390, height, toJSON: () => ({}) } as DOMRect;
    });
    try {
      renderAs('employee', '/messages?conversation=ch-general');
      await screen.findByRole('navigation', { name: 'Быстрая навигация' });
      await vi.waitFor(() => expect(document.documentElement.style.getPropertyValue('--topbar-height')).toBe('102px'));
      expect(document.documentElement.style.getPropertyValue('--bottom-nav-height')).toBe('64px');
    } finally { rect.mockRestore(); }
  });
});
