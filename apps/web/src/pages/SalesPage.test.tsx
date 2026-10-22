import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';

const renderSales = (username: keyof typeof demoSessions = 'director') => {
  localStorage.setItem('atlas.session', JSON.stringify(demoSessions[username]));
  return render(<MemoryRouter initialEntries={['/sales']}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });

describe('deal notes', () => {
  it('writes formatted notes on a deal and saves a ticked checklist item', async () => {
    const user = userEvent.setup();
    renderSales();
    await user.click(await screen.findByRole('button', { name: 'Сделка: Стартовый пакет' }));
    let dialog = screen.getByRole('dialog', { name: 'Сделка: Стартовый пакет' });
    await user.click(within(dialog).getByRole('button', { name: 'Добавить заметки' }));
    await user.click(await within(dialog).findByRole('textbox', { name: 'Заметки к сделке' }));
    await user.keyboard('{Control>}b{/Control}Условия{Control>}b{/Control}: отсрочка 14 дней');
    await user.keyboard('{Enter}');
    await user.click(within(dialog).getByRole('button', { name: 'Чек-лист' }));
    await user.keyboard('договор подписан');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить заметки' }));
    expect(await within(dialog).findByText('Условия', { selector: 'strong' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Не выполнено' }));
    expect(await within(dialog).findByRole('checkbox', { name: 'Выполнено' })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Готово' }));
    await user.click(screen.getByRole('button', { name: 'Сделка: Стартовый пакет' }));
    dialog = screen.getByRole('dialog', { name: 'Сделка: Стартовый пакет' });
    expect(within(dialog).getByRole('checkbox', { name: 'Выполнено' })).toBeChecked();
    expect(within(dialog).getByText(/отсрочка 14 дней/)).toBeInTheDocument();
  }, 15_000);
});

describe('editing a deal', () => {
  it('lets the owner correct amount, probability and stage from the card, without an owner choice', async () => {
    const user = userEvent.setup();
    renderSales('employee');
    const card = (await screen.findByText('Годовой план', {}, { timeout: 5_000 })).closest('article')!;
    await user.click(within(card as HTMLElement).getByText('Годовой план'));
    const dialog = screen.getByRole('dialog', { name: 'Сделка: Годовой план' });
    await user.click(within(dialog).getByRole('button', { name: 'Изменить сделку' }));
    const form = within(dialog).getByRole('form', { name: 'Изменение сделки' });
    expect(within(form).getByLabelText('Ответственный')).toBeDisabled();
    await user.clear(within(form).getByLabelText('Сумма, ₴'));
    await user.type(within(form).getByLabelText('Сумма, ₴'), '3500000');
    await user.clear(within(form).getByLabelText('Вероятность, %'));
    await user.type(within(form).getByLabelText('Вероятность, %'), '80');
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(dialog).findByText('80%')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Готово' }));
    const updated = screen.getByText('Годовой план').closest('article') as HTMLElement;
    expect(within(updated).getByText('80%')).toBeInTheDocument();
    expect(within(updated).getByText(/3\s500\s000/)).toBeInTheDocument();
  }, 15_000);

  it('lets a head hand a deal to a colleague', async () => {
    const user = userEvent.setup();
    renderSales('manager');
    await user.click(await screen.findByRole('button', { name: 'Сделка: Пилот на 15 мест' }, { timeout: 5_000 }));
    const dialog = screen.getByRole('dialog', { name: 'Сделка: Пилот на 15 мест' });
    await user.click(within(dialog).getByRole('button', { name: 'Изменить сделку' }));
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Ответственный' }), 'Анна Петрова');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await within(dialog).findByText('Анна Петрова')).toBeInTheDocument();
  }, 15_000);
});

describe('deal amounts', () => {
  it('accepts an exact amount such as 10 550 ₴ (or with kopecks) when creating and editing a deal', async () => {
    const user = userEvent.setup();
    renderSales('employee');
    await user.click(await screen.findByRole('button', { name: /Новая сделка/ }, { timeout: 5_000 }));
    const amount = within(screen.getByRole('dialog', { name: 'Новая сделка' })).getByLabelText('Сумма, ₴') as HTMLInputElement;
    await user.type(amount, '10550');
    expect(amount.checkValidity()).toBe(true);
    await user.clear(amount);
    await user.type(amount, '10550.50');
    expect(amount.checkValidity()).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    await user.click(await screen.findByRole('button', { name: 'Сделка: Годовой план' }));
    const dialog = screen.getByRole('dialog', { name: 'Сделка: Годовой план' });
    await user.click(within(dialog).getByRole('button', { name: 'Изменить сделку' }));
    const edit = within(dialog).getByLabelText('Сумма, ₴') as HTMLInputElement;
    await user.clear(edit);
    await user.type(edit, '10550');
    expect(edit.checkValidity()).toBe(true);
  }, 15_000);
});

describe('changing a deal\'s client', () => {
  it('moves a deal to another client the owner can see', async () => {
    const user = userEvent.setup();
    renderSales('employee');
    await user.click(await screen.findByRole('button', { name: 'Сделка: Годовой план' }, { timeout: 5_000 }));
    const dialog = screen.getByRole('dialog', { name: 'Сделка: Годовой план' });
    await user.click(within(dialog).getByRole('button', { name: 'Изменить сделку' }));
    const client = within(dialog).getByRole('combobox', { name: 'Клиент' }) as HTMLSelectElement;
    expect(client.selectedOptions[0]!.textContent).toBe('Northstar Labs');
    await user.selectOptions(client, 'Arbor Group');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    // Saved: the form closes back to the deal's details.
    await within(dialog).findByRole('button', { name: 'Изменить сделку' });
    await user.click(within(dialog).getByRole('button', { name: 'Готово' }));
    const card = screen.getByRole('button', { name: 'Сделка: Годовой план' }).closest('article') as HTMLElement;
    expect(within(card).getByText('Arbor Group')).toBeInTheDocument();
  }, 15_000);
});

