import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { resetDemoChat } from '../lib/chat';
import { resetDemoMail } from '../lib/mail';
import { resetDemoTelegram } from '../lib/telegram';

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
});
