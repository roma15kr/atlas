import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { resetDemoDepartments } from '../lib/departments';

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);

beforeEach(() => { localStorage.clear(); resetDemoDepartments(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('team administration', () => {
  it('lets a head edit an employee without offering role or department', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team?user=u4');
    await user.click(await screen.findByRole('button', { name: 'Изменить' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText('Роль')).not.toBeInTheDocument();
    const title = within(dialog).getByLabelText('Должность');
    await user.clear(title);
    await user.type(title, 'Старший менеджер');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect((await screen.findAllByText('Старший менеджер')).length).toBeGreaterThan(0);
  });

  it('offers no administration of the head themselves or of other departments', async () => {
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team?user=u2');
    await screen.findByRole('heading', { name: 'Михаил Волков' });
    expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
  });

  it('asks before disabling and lists the person under "Отключённые"', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.director));
    renderAt('/team?user=u5');
    await user.click(await screen.findByRole('button', { name: 'Отключить' }));
    const dialog = screen.getByRole('dialog', { name: /Отключить сотрудника/ });
    expect(within(dialog).getByText(/открытые сеансы будут закрыты/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Отключить' }));
    expect(screen.queryByRole('button', { name: /Ольга Соколова/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Отключённые/ }));
    await user.click(await screen.findByRole('button', { name: /Ольга Соколова/ }));
    expect(screen.getByText('Отключён')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Включить' })).toBeInTheDocument();
  });

  it('shows copyable credentials after a password reset', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team?user=u4');
    await user.click(await screen.findByRole('button', { name: 'Сбросить пароль' }));
    // The note sits above the password field, so the field and «Сгенерировать» get the dialog's full width.
    expect(screen.getByRole('dialog').querySelector('form')).toHaveClass('settings-form--single');
    expect(within(screen.getByRole('dialog')).getByLabelText('Временный пароль')).not.toHaveValue('');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сбросить пароль' }));
    const done = await screen.findByRole('dialog', { name: 'Пароль сброшен' });
    expect(within(done).getByText('alex')).toBeInTheDocument();
    expect(within(done).getByRole('button', { name: 'Скопировать доступ' })).toBeInTheDocument();
  });
});

describe('forced password change', () => {
  it('shows only the change screen until the password is changed', async () => {
    const user = userEvent.setup();
    const session = demoSessions.employee;
    localStorage.setItem('atlas.session', JSON.stringify({ ...session, user: { ...session.user, mustChangePassword: true } }));
    renderAt('/crm');
    expect(await screen.findByRole('heading', { name: 'Задайте новый пароль' })).toBeInTheDocument();
    expect(screen.queryByText('Клиенты')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Текущий пароль'), 'Temporary-Pass-77');
    await user.type(screen.getByLabelText(/^Новый пароль/), 'short');
    await user.type(screen.getByLabelText('Повторите пароль'), 'short');
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Не менее 12 символов');
    await user.clear(screen.getByLabelText(/^Новый пароль/));
    await user.clear(screen.getByLabelText('Повторите пароль'));
    await user.type(screen.getByLabelText(/^Новый пароль/), 'My-Own-Secret-2026');
    await user.type(screen.getByLabelText('Повторите пароль'), 'My-Own-Secret-2026');
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
    expect(await screen.findByText(/Добрый день, Анна/, {}, { timeout: 5_000 })).toBeInTheDocument();
  });
});

describe('member details', () => {
  it('shows contacts, the birthday without a year and the "about" text', async () => {
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team?user=u4');
    await screen.findByRole('heading', { name: 'Алексей Ким' });
    expect(screen.getByRole('link', { name: '+380 67 123 45 67' })).toHaveAttribute('href', 'tel:+380671234567');
    expect(screen.getByRole('link', { name: 'alex.kim@atlas.test' })).toHaveAttribute('href', 'mailto:alex.kim@atlas.test');
    expect(screen.getByText('21 июля')).toBeInTheDocument();
    expect(screen.getByText(/Веду партнёрские продажи/)).toBeInTheDocument();
  });

  it('lets a director remove a member photo after confirming', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.director));
    renderAt('/team?user=u5');
    await screen.findByRole('heading', { name: 'Ольга Соколова' });
    expect(document.querySelector('.team-profile .avatar img')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Удалить фото' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Удалить фото?' })).getByRole('button', { name: 'Удалить' }));
    expect(document.querySelector('.team-profile .avatar img')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Удалить фото' })).not.toBeInTheDocument();
  });

  it('does not offer photo removal to an employee', async () => {
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.alex));
    renderAt('/team');
    await screen.findByRole('heading', { name: 'Алексей Ким' });
    expect(screen.queryByRole('button', { name: 'Удалить фото' })).not.toBeInTheDocument();
  });
});

describe('job description', () => {
  it('lets a head fill in a missing description from the template', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team?user=u3');
    const heading = await screen.findByRole('heading', { name: 'Анна Петрова' });
    const card = heading.closest('.team-detail') as HTMLElement;
    expect(within(card).getByText(/Не заполнена/)).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Анна Петрова/ })).getByText('Нет инструкции')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Заполнить' }));
    const dialog = screen.getByRole('dialog', { name: 'Должностная инструкция' });
    expect(within(dialog).getByText(/Используется AI-аналитикой/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Вставить шаблон' }));
    const text = await within(dialog).findByRole('textbox', { name: 'Текст инструкции' });
    expect(await within(text).findByRole('heading', { name: 'Обязанности' })).toBeInTheDocument();
    await user.click(text);
    await user.keyboard('вести ключевых клиентов');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await within(card).findByText(/вести ключевых клиентов/)).toBeInTheDocument();
    expect(within(card).getByRole('heading', { name: 'Показатели результата' })).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Анна Петрова/ })).queryByText('Нет инструкции')).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Изменить инструкцию' })).toBeInTheDocument();
  });

  it('clears a description when saved empty', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team?user=u4');
    const card = (await screen.findByRole('heading', { name: 'Алексей Ким' })).closest('.team-detail') as HTMLElement;
    expect(within(card).getByText(/Развивает партнёрский канал/)).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Изменить инструкцию' }));
    await user.click(await within(screen.getByRole('dialog')).findByRole('textbox', { name: 'Текст инструкции' }));
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сохранить' }));
    expect(await within(card).findByText(/Не заполнена/)).toBeInTheDocument();
  });

  it('shows an employee their description read-only, and a note when it is missing', async () => {
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.alex));
    renderAt('/team');
    const card = (await screen.findByRole('heading', { name: 'Алексей Ким' })).closest('.team-detail') as HTMLElement;
    expect(within(card.querySelector('.job-description') as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
    cleanup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.employee));
    renderAt('/profile');
    expect(await screen.findByText('Не заполнена — заполняет руководитель')).toBeInTheDocument();
  });

  it('no longer offers the field in the general edit dialog', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team?user=u4');
    await user.click(await screen.findByRole('button', { name: 'Изменить' }));
    expect(within(screen.getByRole('dialog')).queryByLabelText(/Должностная инструкция/)).not.toBeInTheDocument();
  });
});

describe('department structure', () => {
  it('lets a director place a department under another one', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.director));
    renderAt('/team');
    await user.click(await screen.findByRole('button', { name: 'Отделы' }));
    const dialog = screen.getByRole('dialog', { name: 'Отделы' });
    const finance = await within(dialog).findByLabelText('Входит в: Финансы');
    expect(within(finance).queryByRole('option', { name: 'Финансы' })).not.toBeInTheDocument();
    await user.selectOptions(finance, 'Продажи');
    expect(await within(dialog).findByRole('status')).toHaveTextContent('Михаил Волков («Продажи») теперь видит людей и данные «Финансы»');
    expect(within(dialog).getByText('↳ Финансы')).toBeInTheDocument();
    // «Продажи» now has a sub-department, so it can't be placed under another one.
    expect(within(dialog).getByLabelText('Входит в: Продажи')).toBeDisabled();
  });

  it('shows the parent\'s head for a sub-department without its own', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.director));
    renderAt('/team');
    await user.click(await screen.findByRole('button', { name: 'Отделы' }));
    const dialog = screen.getByRole('dialog', { name: 'Отделы' });
    await user.selectOptions(await within(dialog).findByLabelText('Входит в: Финансы'), 'Продажи');
    await within(dialog).findByRole('status');
    const finance = within(dialog).getByText('↳ Финансы').closest('tr')!;
    expect(finance).toHaveTextContent('Михаил Волков · через «Продажи»');
    const sales = within(dialog).getByText('Продажи', { selector: 'td' }).closest('tr')!;
    expect(sales).not.toHaveTextContent('через');
  });

  it('shows no structure button to a head', async () => {
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team');
    await screen.findByRole('heading', { name: 'Команда' });
    expect(screen.queryByRole('button', { name: 'Отделы' })).not.toBeInTheDocument();
  });
});


describe('company directory', () => {
  it('lets an employee find colleagues of every department and open a contact card without actions', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.employee));
    renderAt('/team');
    const list = (await screen.findByLabelText('Поиск сотрудников')).closest('.team-list') as HTMLElement;
    expect(await within(list).findByRole('button', { name: /Ольга Соколова/ })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: /Иван Смирнов/ })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Поиск сотрудников'), 'Алексей');
    await user.click(within(list).getByRole('button', { name: /Алексей Ким/ }));
    const card = screen.getByLabelText('Контакты: Алексей Ким');
    expect(within(card).getByText('Менеджер по развитию')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: '+380 67 123 45 67' })).toBeInTheDocument();
    expect(screen.queryByText('KPI текущего периода')).not.toBeInTheDocument();
    expect(screen.queryByText('Рейтинг')).not.toBeInTheDocument();
    expect(screen.queryByText('Должностная инструкция')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /AI-анализ|Изменить|Сбросить пароль|Отключить/ })).not.toBeInTheDocument();
  });

  it('gives a head actions for their own team only', async () => {
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team?user=u5');
    expect(await screen.findByLabelText('Контакты: Ольга Соколова')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Изменить|Сбросить пароль|Отключить/ })).not.toBeInTheDocument();
    cleanup();
    renderAt('/team?user=u4');
    await screen.findByRole('heading', { name: 'Алексей Ким' });
    for (const name of ['Изменить', 'Сбросить пароль', 'Отключить']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
  });

  it('shows a head who is online across the company, live, without last-seen times', async () => {
    const user = userEvent.setup();
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team?user=u5');
    const list = (await screen.findByLabelText('Поиск сотрудников')).closest('.team-list') as HTMLElement;
    const ivan = await within(list).findByRole('button', { name: /Иван Смирнов/ });
    expect(within(ivan).getByText('В сети')).toBeInTheDocument();
    expect(within(within(list).getByRole('button', { name: /Ольга Соколова/ })).getByText('Не в сети')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'В сети' }));
    expect(within(list).getByRole('button', { name: /Иван Смирнов/ })).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: /Ольга Соколова/ })).not.toBeInTheDocument();
    // Ольга was selected but is offline: the detail follows the filtered list instead of staying on her.
    expect(screen.queryByLabelText('Контакты: Ольга Соколова')).not.toBeInTheDocument();

    act(() => { window.dispatchEvent(new CustomEvent('atlas:socket', { detail: { event: 'presence:online', payload: { userId: 'u6', online: false } } })); });
    expect(within(list).queryByRole('button', { name: /Иван Смирнов/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Не в сети' }));
    await user.click(within(list).getByRole('button', { name: /Иван Смирнов/ }));
    const card = screen.getByLabelText('Контакты: Иван Смирнов');
    expect(within(card).getByText('Не в сети')).toBeInTheDocument();
    expect(within(card).queryByText(/назад/)).not.toBeInTheDocument();
  });

  it('lists online people first, then offline, each alphabetically', async () => {
    localStorage.setItem('atlas.session', JSON.stringify(demoSessions.manager));
    renderAt('/team');
    const list = (await screen.findByLabelText('Поиск сотрудников')).closest('.team-list') as HTMLElement;
    await within(list).findByRole('button', { name: /Иван Смирнов/ });
    const names = within(list).getAllByRole('button').map((row) => row.querySelector('strong')?.textContent);
    expect(names).toEqual(['Анна Петрова', 'Елена Морозова', 'Иван Смирнов', 'Михаил Волков', 'Алексей Ким', 'Ольга Соколова']);
  });
});

