import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { resetDemoChat } from '../lib/chat';

const renderAs = (username: keyof typeof demoSessions, path = '/messages') => {
  localStorage.setItem('atlas.session', JSON.stringify(demoSessions[username]));
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};
const list = () => screen.getByRole('region', { name: 'Разговоры' });
const row = (name: string | RegExp) => within(list()).getByRole('button', { name });
const main = (title: string) => screen.getByRole('region', { name: `Разговор ${title}` });

beforeEach(() => { localStorage.clear(); resetDemoChat(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('team chat', () => {
  it('lists channels, groups and DMs with unread and mention counts', async () => {
    renderAs('employee');
    expect(await within(list()).findByRole('button', { name: /Продажи/ })).toBeInTheDocument();
    expect(row(/Общий/)).toBeInTheDocument();
    expect(row(/Демо для «Северного ветра»/)).toBeInTheDocument();
    expect(row(/Елена Морозова/)).toBeInTheDocument();
    expect(within(row(/Продажи/)).getByText('@1')).toBeInTheDocument();
    expect(within(list()).queryByRole('button', { name: /Идеи/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Сообщения: непрочитанных \d+/)).toBeInTheDocument();
  });

  it('sends a direct message and clears the unread count on open', async () => {
    const user = userEvent.setup();
    renderAs('employee');
    await user.click(await within(list()).findByRole('button', { name: /Елена Морозова/ }));
    const view = main('Елена Морозова');
    expect(await within(view).findByText('Анна, как прошла встреча с клиентом?')).toBeInTheDocument();
    await user.type(within(view).getByLabelText('Сообщение'), 'Хорошо, договорились о пилоте{Enter}');
    expect(await within(view).findByText('Хорошо, договорились о пилоте')).toBeInTheDocument();
    await waitFor(() => expect(within(row(/Елена Морозова/)).queryByText('1')).not.toBeInTheDocument());
  });

  it('replies in a thread and autocompletes mentions', async () => {
    const user = userEvent.setup();
    renderAs('employee');
    await user.click(await within(list()).findByRole('button', { name: /Продажи/ }));
    const view = main('Продажи');
    const message = (await within(view).findByText(/пришли, пожалуйста/)).closest('article')!;
    expect(within(message).getByText('@Анна Петрова')).toHaveClass('mention--me');
    await user.click(within(message).getByRole('button', { name: 'Ответить в обсуждении' }));
    const thread = screen.getByRole('region', { name: 'Обсуждение' });
    expect(await within(thread).findByText('Готовлю, будет к вечеру.')).toBeInTheDocument();
    const input = within(thread).getByLabelText('Ответ в обсуждении');
    await user.type(input, 'Готово, @мих');
    const suggestion = await screen.findByRole('option', { name: /Михаил Волков/ });
    await user.click(within(suggestion).getByRole('button'));
    expect(input).toHaveValue('Готово, @manager ');
    await user.type(input, '{Enter}');
    expect(await within(thread).findByText('@Михаил Волков')).toBeInTheDocument();
    expect(await within(view).findByRole('button', { name: /2 ответа/ })).toBeInTheDocument();
  });

  it('lets an employee join a public channel but not create one', async () => {
    const user = userEvent.setup();
    renderAs('employee');
    await user.click(await within(list()).findByRole('button', { name: 'Все каналы' }));
    const dialog = screen.getByRole('dialog', { name: 'Каналы' });
    expect(within(dialog).queryByRole('button', { name: 'Создать канал' })).not.toBeInTheDocument();
    await user.click(await within(dialog).findByRole('button', { name: /Идеи/ }));
    const view = await screen.findByRole('region', { name: 'Разговор Идеи' });
    expect(await within(view).findByText(/шаблон коммерческого предложения/)).toBeInTheDocument();
    expect(within(view).queryByLabelText('Сообщение')).not.toBeInTheDocument();
    await user.click(within(view).getByRole('button', { name: 'Вступить' }));
    expect(await within(view).findByLabelText('Сообщение')).toBeInTheDocument();
    expect(await within(list()).findByRole('button', { name: /Идеи/ })).toBeInTheDocument();
  });

  it('lets a department head create a private channel with a member', async () => {
    const user = userEvent.setup();
    renderAs('manager');
    await user.click(await within(list()).findByRole('button', { name: 'Все каналы' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Каналы' })).getByRole('button', { name: 'Создать канал' }));
    const dialog = screen.getByRole('dialog', { name: 'Новый канал' });
    await user.type(within(dialog).getByLabelText('Название'), 'Тендеры');
    await user.selectOptions(within(dialog).getByLabelText('Доступ'), 'PRIVATE');
    await user.click(within(dialog).getByRole('checkbox', { name: /Анна Петрова/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Создать канал' }));
    const view = await screen.findByRole('region', { name: 'Разговор Тендеры' });
    expect(within(view).getByText(/Закрытый канал · 2 участника/)).toBeInTheDocument();
  });

  it('keeps the last channel admin and shows the reason', async () => {
    const user = userEvent.setup();
    renderAs('manager');
    await user.click(await within(list()).findByRole('button', { name: /Продажи/ }));
    await user.click(within(main('Продажи')).getByRole('button', { name: 'Настройки канала' }));
    const settings = screen.getByRole('dialog', { name: 'Канал «Продажи»' });
    expect(await within(settings).findByRole('button', { name: 'Снять права администратора: Михаил Волков' })).toBeDisabled();
    await user.click(within(settings).getByRole('button', { name: 'Покинуть канал' }));
    const confirm = screen.getByRole('dialog', { name: 'Покинуть канал «Продажи»?' });
    await user.click(within(confirm).getByRole('button', { name: 'Выйти' }));
    expect(await within(confirm).findByRole('alert')).toHaveTextContent('Сначала назначьте другого администратора');
  });

  it('hides a private channel from an outsider', async () => {
    renderAs('director');
    await within(list()).findByRole('button', { name: /Общий/ });
    expect(within(list()).queryByRole('button', { name: /Продажи/ })).not.toBeInTheDocument();
  });
});
