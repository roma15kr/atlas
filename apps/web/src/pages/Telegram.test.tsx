import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { phoneViewport } from '../test/phone';
import { resetDemoChat } from '../lib/chat';
import { resetDemoMail } from '../lib/mail';
import { resetDemoTelegram, seedDemoTelegramHistory } from '../lib/telegram';

const renderAs = (username: keyof typeof demoSessions, path = '/telegram') => {
  localStorage.setItem('atlas.session', JSON.stringify(demoSessions[username]));
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};
const list = () => screen.getByRole('region', { name: 'Клиенты в Telegram' });

beforeEach(() => { localStorage.clear(); resetDemoTelegram(); resetDemoMail(); resetDemoChat(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('Telegram inbox', () => {
  it('shows an employee only their own customers and lets them reply', async () => {
    const user = userEvent.setup();
    renderAs('employee');
    expect(await within(list()).findByRole('button', { name: /София Тёрнер/ })).toBeInTheDocument();
    expect(within(list()).queryByRole('button', { name: /Олена/ })).not.toBeInTheDocument();
    expect(within(list()).queryByRole('button', { name: /Ной Уильямс/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Импорт контактов' })).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Telegram: непрочитанных 4')).toBeInTheDocument();
    await user.click(within(list()).getByRole('button', { name: /София Тёрнер/ }));
    const chat = await screen.findByRole('region', { name: 'Переписка с София Тёрнер' });
    expect(await within(chat).findByText('Отлично, спасибо!')).toBeInTheDocument();
    expect(within(chat).getByRole('button', { name: 'Скачать photo.jpg' })).toBeInTheDocument();
    expect(within(chat).queryByRole('button', { name: /Ответственный/ })).not.toBeInTheDocument();
    await user.type(within(chat).getByLabelText('Ответ клиенту'), 'Счёт отправила на почту{Enter}');
    const reply = (await within(chat).findByText('Счёт отправила на почту')).closest('article')!;
    expect(within(reply).getByText('Анна Петрова')).toBeInTheDocument();
    // Only the blocked customer's old message stays unread.
    expect(await screen.findByLabelText('Telegram: непрочитанных 1')).toBeInTheDocument();
  });

  it('refuses to write to a customer who blocked the bot', async () => {
    const user = userEvent.setup();
    renderAs('employee');
    await user.click(await within(list()).findByRole('button', { name: /Игорь/ }));
    const chat = await screen.findByRole('region', { name: 'Переписка с Игорь' });
    expect(within(chat).getByText('Клиент заблокировал бота — сообщения ему не доходят')).toBeInTheDocument();
    expect(within(chat).queryByLabelText('Ответ клиенту')).not.toBeInTheDocument();
  });

  it('lets a head triage an unknown sender within their department', async () => {
    const user = userEvent.setup();
    renderAs('manager');
    await user.click(await screen.findByRole('button', { name: 'Неразобранные' }));
    await user.click(await within(list()).findByRole('button', { name: /Олена/ }));
    const chat = await screen.findByRole('region', { name: 'Переписка с Олена' });
    await user.click(within(chat).getByRole('button', { name: /Ответственный/ }));
    const dialog = screen.getByRole('dialog', { name: 'Ответственный за переписку' });
    const options = within(within(dialog).getByLabelText('Сотрудник')).getAllByRole('option').map((option) => option.textContent);
    expect(options).toContain('Анна Петрова · Продажи');
    expect(options.some((text) => text?.includes('Ольга Соколова'))).toBe(false);
    await user.selectOptions(within(dialog).getByLabelText('Сотрудник'), 'Анна Петрова · Продажи');
    await user.click(within(dialog).getByRole('button', { name: 'Назначить' }));
    await waitFor(() => expect(within(list()).queryByRole('button', { name: /Олена/ })).not.toBeInTheDocument());
  });

  it('previews an import and shows each row error', async () => {
    const user = userEvent.setup();
    renderAs('manager');
    await user.click(await screen.findByRole('button', { name: 'Импорт контактов' }));
    const dialog = screen.getByRole('dialog', { name: 'Импорт контактов Telegram' });
    await user.type(within(dialog).getByLabelText('Или вставьте содержимое'), 'telegram_id;client_email{enter}555000111;sofia@northstar.example{enter}abc;{enter}555000112;nobody@x.example');
    await user.click(within(dialog).getByRole('button', { name: 'Проверить файл' }));
    const table = await within(dialog).findByRole('table', { name: 'Предпросмотр импорта' });
    expect(within(table).getByText('Неверный Telegram ID')).toBeInTheDocument();
    expect(within(table).getByText('Клиент не найден')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Импортировать 1' }));
    expect(await screen.findByText('Импортировано: 1, с ошибками: 2')).toBeInTheDocument();
  });

  it('keeps bot settings for the director', async () => {
    renderAs('employee', '/telegram/settings');
    expect(await screen.findByText(/Добрый день, Анна/)).toBeInTheDocument();
    cleanup();
    renderAs('director', '/telegram/settings');
    expect(await screen.findByRole('heading', { name: 'Настройки Telegram' })).toBeInTheDocument();
    expect(await screen.findByText('Здравствуйте! Напишите ваш вопрос — менеджер ответит вам здесь.')).toBeInTheDocument();
  });

  it('records the Telegram conversation in the client history with who replied', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/crm/c1');
    const card = await screen.findByRole('region', { name: 'Переписка' });
    await user.click(await within(card).findByRole('button', { name: /София Тёрнер/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Telegram: София Тёрнер' });
    expect(await within(dialog).findByText('Добрый день! Когда сможете прислать счёт на 40 мест?')).toBeInTheDocument();
    expect(within(dialog).getByText('Анна Петрова')).toBeInTheDocument();
    await user.click(within(dialog).getAllByRole('button', { name: 'Закрыть' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Пригласить в Telegram' }));
    const invite = screen.getByRole('dialog', { name: 'Пригласить в Telegram' });
    await user.click(within(invite).getByRole('button', { name: 'Создать ссылку' }));
    expect((await within(invite).findByLabelText('Ссылка-приглашение') as HTMLInputElement).value).toMatch(/^https:\/\/t\.me\/atlas_demo_bot\?start=/);
  });

  it('opens the customer a notification links to', async () => {
    renderAs('employee', '/telegram?contact=tg1');
    expect(await screen.findByRole('region', { name: 'Переписка с София Тёрнер' })).toBeInTheDocument();
  });
});

describe('Telegram on a phone', () => {
  it('shows the customer list or one conversation, with a way back', async () => {
    const restore = phoneViewport();
    try {
      const user = userEvent.setup();
      renderAs('employee');
      await user.click(await within(list()).findByRole('button', { name: /София Тёрнер/ }));
      expect(await screen.findByRole('region', { name: 'Переписка с София Тёрнер' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Клиенты в Telegram' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'К списку' }));
      expect(await screen.findByRole('region', { name: 'Клиенты в Telegram' })).toBeInTheDocument();
    } finally { restore(); }
  });
});

describe('long Telegram history', () => {
  it('opens on the newest messages and loads earlier pages until the beginning', async () => {
    seedDemoTelegramHistory('tg1', 120);
    const user = userEvent.setup();
    renderAs('employee', '/telegram?contact=tg1');
    const chat = await screen.findByRole('region', { name: 'Переписка с София Тёрнер' });
    expect(await within(chat).findByText('Отлично, спасибо!')).toBeInTheDocument();
    expect(within(chat).queryByText('Старое сообщение 1')).not.toBeInTheDocument();
    await user.click(within(chat).getByRole('button', { name: 'Показать более ранние' }));
    await user.click(await within(chat).findByRole('button', { name: 'Показать более ранние' }));
    expect(await within(chat).findByText('Старое сообщение 1')).toBeInTheDocument();
    expect(within(chat).getByText('Начало переписки')).toBeInTheDocument();
    expect(within(chat).queryByRole('button', { name: 'Показать более ранние' })).not.toBeInTheDocument();
    // Every message is there exactly once, in order.
    expect(within(chat).getAllByText(/^Старое сообщение \d+$/)).toHaveLength(120);
    expect(within(chat).getByText('Отлично, спасибо!')).toBeInTheDocument();
  });
});

describe('Telegram day separators', () => {
  // 16 November 2026, 01:10 local: София's messages are at 23:10 and 23:40 yesterday, 00:10 and 00:30 today.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 16, 1, 10)); resetDemoTelegram(); });
  afterEach(() => { vi.useRealTimers(); });
  const separators = (region: HTMLElement) => within(region).queryAllByRole('separator').map((node) => node.getAttribute('aria-label'));

  it('splits a customer conversation by day', async () => {
    renderAs('employee', '/telegram?contact=tg1');
    const chat = await screen.findByRole('region', { name: 'Переписка с София Тёрнер' });
    await within(chat).findByText('Отлично, спасибо!');
    expect(separators(chat)).toEqual(['Вчера', 'Сегодня']);
    const today = within(chat).getByRole('separator', { name: 'Сегодня' });
    const firstToday = within(chat).getAllByRole('article')[2]!;
    expect(today.compareDocumentPosition(firstToday) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(chat).getAllByRole('article')[1]!.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps one separator for a day while older pages load', async () => {
    seedDemoTelegramHistory('tg1', 120);
    const user = userEvent.setup();
    renderAs('employee', '/telegram?contact=tg1');
    const chat = await screen.findByRole('region', { name: 'Переписка с София Тёрнер' });
    await within(chat).findByText('Отлично, спасибо!');
    expect(separators(chat)).toEqual(['Вчера', 'Сегодня']);
    await user.click(within(chat).getByRole('button', { name: 'Показать более ранние' }));
    await user.click(await within(chat).findByRole('button', { name: 'Показать более ранние' }));
    expect(await within(chat).findByText('Старое сообщение 1')).toBeInTheDocument();
    expect(separators(chat)).toEqual(['Вчера', 'Сегодня']);
  });
});
