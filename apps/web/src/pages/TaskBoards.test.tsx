import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';

const renderAs = (username: keyof typeof demoSessions, path: string) => {
  localStorage.setItem('atlas.session', JSON.stringify(demoSessions[username]));
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};
const card = (title: string) => screen.getByRole('button', { name: title }).closest('article')!;
const column = (name: string) => screen.getByRole('region', { name });
const columnNames = () => screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'));

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });

describe('my tasks', () => {
  it('shows only tasks assigned to the employee, across boards', async () => {
    renderAs('employee', '/tasks');
    expect(await screen.findByRole('heading', { name: 'Мои задачи' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Прайс для партнёров' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обновить недельный прогноз' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Согласовать дату демонстрации' })).not.toBeInTheDocument();
    expect(columnNames()).toEqual(['Не начато', 'В работе', 'Готово']);
  });

  it('moves a dropped card to the first stage of that category on its own board', async () => {
    renderAs('employee', '/tasks');
    await screen.findByRole('heading', { name: 'Мои задачи' });
    fireEvent.dragStart(card('Прайс для партнёров'), { dataTransfer: { effectAllowed: '' } });
    fireEvent.drop(column('В работе'));
    // "Запуск продукта" has two ACTIVE stages; the first one is "Разработка".
    expect(await within(column('В работе')).findByText('Запуск продукта · Разработка')).toBeInTheDocument();
    fireEvent.dragStart(card('Обновить недельный прогноз'), { dataTransfer: { effectAllowed: '' } });
    fireEvent.drop(column('Готово'));
    await waitFor(() => expect(within(column('Готово')).getAllByText('Задачи отдела · Готово')).toHaveLength(2));
    expect(within(card('Обновить недельный прогноз')).getByText('Задачи отдела · Готово')).toBeInTheDocument();
  });

  it('preselects the current user in a new task and limits assignees to board users', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/tasks');
    await user.click(await screen.findByRole('button', { name: 'Новая задача' }));
    const dialog = screen.getByRole('dialog', { name: 'Новая задача' });
    expect(await within(dialog).findByRole('checkbox', { name: /Анна Петрова \(вы\)/ })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Алексей Ким/ })).not.toBeChecked();
    expect(within(dialog).queryByRole('checkbox', { name: /Ольга Соколова/ })).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Доска'), within(dialog).getByRole('option', { name: 'Запуск продукта' }));
    // A cross-department member of the board becomes assignable there.
    expect(await within(dialog).findByRole('checkbox', { name: /Ольга Соколова/ })).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Название'), 'Подготовить демо');
    await user.click(within(dialog).getByRole('checkbox', { name: /Ольга Соколова/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Создать задачу' }));
    expect(await within(column('Не начато')).findByRole('button', { name: 'Подготовить демо' })).toBeInTheDocument();
    expect(within(card('Подготовить демо')).getByText('Запуск продукта · Бэклог')).toBeInTheDocument();
    expect(within(card('Подготовить демо')).getByLabelText(/Исполнители: .*Анна Петрова.*Ольга Соколова|Исполнители: .*Ольга Соколова.*Анна Петрова/)).toBeInTheDocument();
  });
});

describe('boards', () => {
  it('shows a colleague\'s task and switches columns with the board', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/boards');
    expect(await screen.findByRole('button', { name: 'Согласовать дату демонстрации' })).toBeInTheDocument();
    expect(columnNames()).toEqual(['Нужно сделать', 'В работе', 'Готово']);
    const switcher = screen.getByLabelText('Доска');
    expect(within(switcher).queryByRole('group', { name: 'Операции' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Настроить доски' })).not.toBeInTheDocument();
    await user.selectOptions(switcher, within(switcher).getByRole('option', { name: 'Запуск продукта' }));
    expect(columnNames()).toEqual(['Бэклог', 'Разработка', 'Проверка', 'Готово']);
    expect(screen.getByRole('button', { name: 'Проверить выгрузку заказов' })).toBeInTheDocument();
    expect(within(card('Сценарий демо-звонка')).getByText('+1')).toBeInTheDocument();
  });

  it('filters the board by assignee', async () => {
    const user = userEvent.setup();
    renderAs('manager', '/boards');
    await screen.findByRole('button', { name: 'Согласовать дату демонстрации' });
    await user.selectOptions(screen.getByLabelText('Исполнитель'), 'Анна Петрова');
    expect(screen.queryByRole('button', { name: 'Согласовать дату демонстрации' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подготовить коммерческое предложение' })).toBeInTheDocument();
  });
});

describe('board settings', () => {
  it('redirects an employee', async () => {
    renderAs('employee', '/boards/b-sales/settings');
    expect(await screen.findByText(/Добрый день, Анна/)).toBeInTheDocument();
  });

  it('lets a department head add a stage to their board', async () => {
    const user = userEvent.setup();
    renderAs('manager', '/boards/b-launch/settings');
    expect(await screen.findByRole('heading', { name: 'Запуск продукта' })).toBeInTheDocument();
    const list = document.querySelector('.team-list')!;
    expect(within(list as HTMLElement).queryByText(/Операции/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Удалить этап Готово' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Добавить этап' }));
    const dialog = screen.getByRole('dialog', { name: 'Новый этап' });
    await user.type(within(dialog).getByLabelText('Название'), 'Согласование');
    await user.selectOptions(within(dialog).getByLabelText('Категория'), 'DONE');
    await user.click(within(dialog).getByRole('button', { name: 'Добавить этап' }));
    expect(await screen.findByText('Согласование')).toBeInTheDocument();
    // With a second DONE stage, "Готово" may now be deleted.
    expect(screen.getByRole('button', { name: 'Удалить этап Готово' })).toBeEnabled();
    expect(await screen.findByText('Ольга Соколова')).toBeInTheDocument();
  });
});
