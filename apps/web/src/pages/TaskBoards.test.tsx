import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { resetDemoTaskComments } from '../lib/taskComments';
import { phoneViewport } from '../test/phone';

const renderAs = (username: keyof typeof demoSessions, path: string) => {
  localStorage.setItem('atlas.session', JSON.stringify(demoSessions[username]));
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};
const card = (title: string) => screen.getByRole('button', { name: title }).closest('article')!;
const column = (name: string) => screen.getByRole('region', { name });
const columnNames = () => screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'));

beforeEach(() => { localStorage.clear(); resetDemoTaskComments(); });
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

  it('shows a formatted description whose checklist items save on a tick', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/tasks');
    await user.click(await screen.findByRole('button', { name: 'Новая задача' }));
    let dialog = screen.getByRole('dialog', { name: 'Новая задача' });
    await within(dialog).findByRole('checkbox', { name: /Анна Петрова \(вы\)/ });
    await user.type(within(dialog).getByLabelText('Название'), 'КП для «Олді»');
    await user.click(await within(dialog).findByRole('textbox', { name: 'Описание' }));
    await user.click(within(dialog).getByRole('button', { name: 'Чек-лист' }));
    await user.keyboard('отправить КП');
    await user.click(within(dialog).getByRole('button', { name: 'Создать задачу' }));
    await user.click(await screen.findByRole('button', { name: 'КП для «Олді»' }));
    dialog = await screen.findByRole('dialog', { name: 'Задача' });
    expect(within(dialog).queryByRole('textbox', { name: 'Описание' })).not.toBeInTheDocument();
    expect(within(card('КП для «Олді»')).getByText('отправить КП')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Не выполнено' }));
    expect(await within(dialog).findByRole('checkbox', { name: 'Выполнено' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    await user.click(screen.getByRole('button', { name: 'КП для «Олді»' }));
    dialog = await screen.findByRole('dialog', { name: 'Задача' });
    expect(within(dialog).getByRole('checkbox', { name: 'Выполнено' })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Изменить описание' }));
    expect(await within(dialog).findByRole('textbox', { name: 'Описание' })).toHaveTextContent('отправить КП');
  }, 15_000);

  it('saves a typed comment with «Сохранить», and closes without a request when nothing else changed', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/tasks');
    await user.click(await screen.findByRole('button', { name: 'Прайс для партнёров' }));
    const dialog = await screen.findByRole('dialog', { name: 'Задача' });
    const comments = within(dialog).getByRole('region', { name: 'Комментарии' });
    await within(comments).findByText('Комментариев пока нет');
    await user.click(await within(comments).findByRole('textbox', { name: 'Новый комментарий' }));
    await user.keyboard('заказ сформирован, ждём доп. инфо');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Прайс для партнёров' }));
    const reopened = await screen.findByRole('dialog', { name: 'Задача' });
    expect(await within(reopened).findByText('заказ сформирован, ждём доп. инфо')).toBeInTheDocument();
    // Nothing changed and nothing typed: the dialog just closes, without «Нечего сохранять».
    await user.click(within(reopened).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reacts to a task comment and takes the reaction back', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/tasks');
    await user.click(await screen.findByRole('button', { name: 'Прайс для партнёров' }));
    const dialog = await screen.findByRole('dialog', { name: 'Задача' });
    const comments = within(dialog).getByRole('region', { name: 'Комментарии' });
    await user.click(await within(comments).findByRole('textbox', { name: 'Новый комментарий' }));
    await user.keyboard('Скидки согласованы');
    await user.click(within(comments).getByRole('button', { name: 'Добавить комментарий' }));
    const comment = (await within(comments).findByText('Скидки согласованы')).closest('li')!;
    await user.click(within(comment).getByRole('button', { name: 'Добавить реакцию' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Выбор реакции' })).getByRole('button', { name: 'нравится' }));
    const chip = await within(comment).findByRole('button', { name: /^👍 1\./ });
    expect(chip).toHaveAttribute('title', 'нравится: Вы');
    await user.click(chip);
    expect(within(comment).queryByRole('button', { name: /^👍/ })).not.toBeInTheDocument();
  });

  it('adds a formatted comment to a task', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/tasks');
    await user.click(await screen.findByRole('button', { name: 'Прайс для партнёров' }));
    const dialog = await screen.findByRole('dialog', { name: 'Задача' });
    const comments = within(dialog).getByRole('region', { name: 'Комментарии' });
    expect(await within(comments).findByText('Комментариев пока нет')).toBeInTheDocument();
    expect(within(comments).getByRole('button', { name: 'Добавить комментарий' })).toBeDisabled();
    await user.click(await within(comments).findByRole('textbox', { name: 'Новый комментарий' }));
    await user.keyboard('КП отправлено, {Control>}b{/Control}ждём ответа{Control>}b{/Control}');
    await user.click(within(comments).getByRole('button', { name: 'Добавить комментарий' }));
    expect(await within(comments).findByText('ждём ответа', { selector: 'strong' })).toBeInTheDocument();
    expect(within(comments).getByText('Анна Петрова')).toBeInTheDocument();
    await waitFor(() => expect(within(comments).getByRole('textbox', { name: 'Новый комментарий' })).toHaveTextContent(''));
  });

  it('attaches a file to a comment, posts it without text, and downloads it', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const created = vi.fn(() => 'blob:atlas/price');
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = created; URL.revokeObjectURL = vi.fn();
    onTestFinished(() => { URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke; });
    renderAs('employee', '/tasks');
    await user.click(await screen.findByRole('button', { name: 'Прайс для партнёров' }));
    const dialog = await screen.findByRole('dialog', { name: 'Задача' });
    const comments = within(dialog).getByRole('region', { name: 'Комментарии' });
    await within(comments).findByText('Комментариев пока нет');
    await user.upload(within(comments).getByLabelText('Файлы: Новый комментарий'), new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9])], 'прайс.xlsx'));
    expect(await within(comments).findByText('5 Б')).toBeInTheDocument();
    await user.click(within(comments).getByRole('button', { name: 'Добавить комментарий' }));

    const file = await within(comments).findByRole('button', { name: /Скачать прайс\.xlsx/ });
    expect(within(comments).queryByRole('list', { name: 'Прикреплённые файлы' })).not.toBeInTheDocument();
    await user.click(file);
    await waitFor(() => expect(created).toHaveBeenCalled());
  });

  it('refuses a program file in a comment with a Russian message', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderAs('employee', '/tasks');
    await user.click(await screen.findByRole('button', { name: 'Прайс для партнёров' }));
    const comments = within(await screen.findByRole('dialog', { name: 'Задача' })).getByRole('region', { name: 'Комментарии' });
    await user.upload(within(comments).getByLabelText('Файлы: Новый комментарий'), new File(['MZ'], 'setup.exe'));
    expect(await within(comments).findByText(/такой файл не прикрепить/)).toBeInTheDocument();
    expect(within(comments).getByRole('button', { name: 'Добавить комментарий' })).toBeDisabled();
  });

  it('preselects the current user and offers the whole company, grouped by department', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/tasks');
    await user.click(await screen.findByRole('button', { name: 'Новая задача' }));
    const dialog = screen.getByRole('dialog', { name: 'Новая задача' });
    expect(await within(dialog).findByRole('checkbox', { name: /Анна Петрова \(вы\)/ })).toBeChecked();
    // The board's own department comes first; other departments follow.
    const groups = within(dialog).getAllByRole('group').map((group) => group.getAttribute('aria-label')).filter(Boolean);
    expect(groups[0]).toBe('Продажи');
    expect(groups).toEqual(expect.arrayContaining(['Операции', 'Финансы']));
    await user.type(within(dialog).getByRole('searchbox', { name: 'Найти исполнителя' }), 'Ольга');
    expect(within(dialog).queryByRole('checkbox', { name: /Алексей Ким/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: /Анна Петрова/ })).toBeChecked();
    await user.click(within(within(dialog).getByRole('group', { name: 'Операции' })).getByRole('checkbox', { name: /Ольга Соколова/ }));
    expect(within(dialog).getByText(/увидят только эту задачу/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Название'), 'Подготовить демо');
    await user.click(within(dialog).getByRole('button', { name: 'Создать задачу' }));
    expect(await within(column('Не начато')).findByRole('button', { name: 'Подготовить демо' })).toBeInTheDocument();
    expect(within(card('Подготовить демо')).getByLabelText(/Исполнители: .*Анна Петрова.*Ольга Соколова|Исполнители: .*Ольга Соколова.*Анна Петрова/)).toBeInTheDocument();
  });

  it('shows a task assigned from another department, movable but not reassignable', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/tasks');
    await screen.findByRole('heading', { name: 'Мои задачи' });
    expect(within(card('Сверить остатки для Northstar')).getByText('Задачи отдела · Нужно сделать')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сверить остатки для Northstar' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Доска')).toHaveAttribute('readonly');
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(dialog).getByText(/видите только эту задачу/)).toBeInTheDocument();
    expect(within(within(dialog).getByLabelText('Этап')).getAllByRole('option').map((option) => option.textContent)).toEqual(['Нужно сделать · Не начато', 'В работе · В работе', 'Готово · Готово']);
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
    fireEvent.dragStart(card('Сверить остатки для Northstar'), { dataTransfer: { effectAllowed: '' } });
    fireEvent.drop(column('В работе'));
    expect(await within(column('В работе')).findByText('Задачи отдела · В работе')).toBeInTheDocument();
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

describe('personal tasks', () => {
  it('creates a task for yourself as personal, and shares it as soon as a colleague is added', async () => {
    const user = userEvent.setup();
    renderAs('employee', '/tasks');
    await user.click(await screen.findByRole('button', { name: 'Новая задача' }));
    const dialog = screen.getByRole('dialog', { name: 'Новая задача' });
    await within(dialog).findByRole('checkbox', { name: /Анна Петрова \(вы\)/ });
    const placement = within(dialog).getByRole('checkbox', { name: /Показать на доске/ });
    expect(placement).not.toBeChecked();
    expect(within(dialog).getByText(/Личная задача: её видят автор/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: /Алексей Ким/ }));
    expect(placement).toBeChecked();
    await user.click(within(dialog).getByRole('checkbox', { name: /Алексей Ким/ }));
    expect(placement).not.toBeChecked();
    await user.type(within(dialog).getByLabelText('Название'), 'Мой отчёт');
    await user.click(within(dialog).getByRole('button', { name: 'Создать задачу' }));
    expect(await within(card('Мой отчёт')).findByText('Личная')).toBeInTheDocument();
  });

  it('hides a colleague\'s personal task from the board, and shows it to the head with a filter', async () => {
    renderAs('employee', '/boards');
    await screen.findByRole('button', { name: 'Обновить недельный прогноз' });
    expect(screen.queryByRole('button', { name: 'Личный план звонков' })).not.toBeInTheDocument();
    cleanup();

    const user = userEvent.setup();
    renderAs('manager', '/boards');
    expect(await screen.findByRole('button', { name: 'Личный план звонков' })).toBeInTheDocument();
    expect(within(card('Личный план звонков')).getByText('Личная')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Видимость'), 'PERSONAL');
    expect(screen.getByRole('button', { name: 'Личный план звонков' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Обновить недельный прогноз' })).not.toBeInTheDocument();
  });

  it('offers no visibility filter to an employee', async () => {
    renderAs('employee', '/boards');
    await screen.findByRole('button', { name: 'Обновить недельный прогноз' });
    expect(screen.queryByLabelText('Видимость')).not.toBeInTheDocument();
  });
});

describe('my tasks on a phone', () => {
  it('shows one status at a time, chosen with tabs', async () => {
    const restore = phoneViewport();
    try {
      const user = userEvent.setup();
      renderAs('employee', '/tasks');
      await screen.findByRole('heading', { name: 'Мои задачи' });
      expect(columnNames()).toEqual(['Не начато']);
      expect(screen.getByRole('button', { name: 'Обновить недельный прогноз' })).toBeInTheDocument();
      await user.click(within(screen.getByRole('group', { name: 'Статус задач' })).getByRole('button', { name: /^В работе · \d+$/ }));
      expect(columnNames()).toEqual(['В работе']);
      expect(screen.queryByRole('button', { name: 'Обновить недельный прогноз' })).not.toBeInTheDocument();
      expect(within(column('В работе')).getAllByRole('article').length).toBeGreaterThan(0);
    } finally { restore(); }
  });
});
