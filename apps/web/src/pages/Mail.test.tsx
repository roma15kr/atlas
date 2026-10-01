import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { resetDemoChat } from '../lib/chat';
import { resetDemoMail } from '../lib/mail';

const renderAs = (username: keyof typeof demoSessions, path = '/mail') => {
  localStorage.setItem('atlas.session', JSON.stringify(demoSessions[username]));
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};
const threadList = () => screen.getByRole('region', { name: 'Переписки' });
const folders = () => screen.getByRole('region', { name: 'Папки' });
const openThread = async (user: ReturnType<typeof userEvent.setup>, subject: string) => {
  await user.click(await within(threadList()).findByRole('button', { name: new RegExp(subject) }));
  return screen.findByRole('region', { name: `Переписка «${subject}»` });
};

beforeEach(() => { localStorage.clear(); resetDemoMail(); resetDemoChat(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('mail', () => {
  it('shows the inbox with unread mail and the client link of a thread', async () => {
    const user = userEvent.setup();
    renderAs('employee');
    expect(await within(threadList()).findByRole('button', { name: /Расширение лицензий/ })).toBeInTheDocument();
    expect(within(folders()).getByRole('button', { name: /Входящие/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByLabelText('Почта: непрочитанных 1')).toBeInTheDocument();
    const reader = await openThread(user, 'Расширение лицензий');
    expect(within(reader).getByRole('button', { name: 'Northstar Labs' })).toBeInTheDocument();
    expect(within(reader).getByRole('button', { name: 'Скачать Реквизиты Northstar.pdf' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText('Почта: непрочитанных 1')).not.toBeInTheDocument());
  });

  it('blocks remote images until the owner allows them', async () => {
    const user = userEvent.setup();
    renderAs('employee');
    const reader = await openThread(user, 'Итоги вебинара');
    const frame = within(reader).getByTitle('Текст письма');
    expect(frame.getAttribute('srcdoc')).toContain('img-src data:"');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts');
    await user.click(within(reader).getByRole('button', { name: 'Показать изображения' }));
    await waitFor(() => expect(within(reader).getByTitle('Текст письма').getAttribute('srcdoc')).toContain('img-src data: https:'));
    expect(within(reader).getByTitle('Текст письма').getAttribute('srcdoc')).toContain('src="https://example.com/banner.png"');
  });

  it('replies in the thread with the sender prefilled', async () => {
    const user = userEvent.setup();
    renderAs('employee');
    const reader = await openThread(user, 'Расширение лицензий');
    await user.click(within(reader).getByRole('button', { name: 'Ответить' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ответ' });
    expect(await within(dialog).findByText('София Тёрнер · sofia@northstar.example')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Тема')).toHaveValue('Re: Расширение лицензий');
    await user.click(within(dialog).getByRole('button', { name: 'Отправить' }));
    expect(await screen.findByText('Письмо отправлено')).toBeInTheDocument();
    const updated = await screen.findByRole('region', { name: 'Переписка «Расширение лицензий»' });
    await waitFor(() => expect(within(updated).getAllByRole('article')).toHaveLength(3));
  });

  it('keeps a closed message as a draft', async () => {
    const user = userEvent.setup();
    renderAs('employee');
    await user.click(await screen.findByRole('button', { name: 'Написать' }));
    const dialog = await screen.findByRole('dialog', { name: 'Новое письмо' });
    await user.type(await within(dialog).findByLabelText('Тема'), 'Счёт за октябрь');
    await user.click(within(dialog).getAllByRole('button', { name: 'Закрыть' }).at(-1)!);
    await user.click(within(folders()).getByRole('button', { name: /Черновики/ }));
    expect(await within(threadList()).findByRole('button', { name: /Счёт за октябрь/ })).toBeInTheDocument();
  });

  it('archives a thread out of the inbox', async () => {
    const user = userEvent.setup();
    renderAs('employee');
    const reader = await openThread(user, 'Демонстрация продукта');
    await user.click(within(reader).getByRole('button', { name: 'Архивировать' }));
    await waitFor(() => expect(within(threadList()).queryByRole('button', { name: /Демонстрация продукта/ })).not.toBeInTheDocument());
    await user.click(within(folders()).getByRole('button', { name: /Архив/ }));
    expect(await within(threadList()).findByRole('button', { name: /Демонстрация продукта/ })).toBeInTheDocument();
  });

  it('creates a client from an unlinked thread', async () => {
    const user = userEvent.setup();
    renderAs('employee');
    const reader = await openThread(user, 'Демонстрация продукта');
    expect(within(reader).getByText(/переписку видите только вы/)).toBeInTheDocument();
    await user.click(within(reader).getByRole('button', { name: 'Создать клиента' }));
    const dialog = screen.getByRole('dialog', { name: 'Новый клиент из письма' });
    expect(within(dialog).getByLabelText('Контакт')).toHaveValue('Ной Уильямс');
    await user.type(within(dialog).getByLabelText('Компания'), 'Vertex Media');
    await user.click(within(dialog).getByRole('button', { name: 'Создать клиента' }));
    expect(await within(screen.getByRole('region', { name: 'Переписка «Демонстрация продукта»' })).findByRole('button', { name: 'Vertex Media' })).toBeInTheDocument();
  });

  it('keeps mail private: a director without a mailbox sees no one else\'s mail', async () => {
    renderAs('director');
    expect(await screen.findByText('Почта не подключена')).toBeInTheDocument();
    expect(screen.queryByText('Расширение лицензий')).not.toBeInTheDocument();
  });

  it('shows a Russian reason when the mailbox password is wrong', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/mail/settings');
    await user.click(await screen.findByRole('button', { name: 'Подключить ящик' }));
    const choose = screen.getByRole('dialog', { name: 'Подключить почтовый ящик' });
    expect(within(choose).getByRole('button', { name: /Google/ })).toBeDisabled();
    await user.click(within(choose).getByRole('button', { name: /Другая почта/ }));
    const form = screen.getByRole('dialog', { name: 'Другая почта' });
    await user.type(within(form).getByLabelText('Email'), 'sales@ukr.net');
    await user.tab();
    expect(within(form).getByLabelText('IMAP: сервер')).toHaveValue('imap.ukr.net');
    await user.type(within(form).getByLabelText(/^Пароль/), 'wrong');
    await user.click(within(form).getByRole('button', { name: 'Подключить' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Неверный логин или пароль');
  });

  it('shows linked correspondence on the client card, read-only', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/crm/c1');
    const card = await screen.findByRole('region', { name: 'Переписка' });
    await user.click(await within(card).findByRole('button', { name: /Расширение лицензий/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Расширение лицензий' });
    expect(within(dialog).getByText(/только для чтения/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Ответить' })).not.toBeInTheDocument();
  });
});
