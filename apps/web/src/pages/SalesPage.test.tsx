import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';

const renderSales = () => {
  localStorage.setItem('atlas.session', JSON.stringify(demoSessions.director));
  return render(<MemoryRouter initialEntries={['/sales']}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });

describe('deal notes', () => {
  it('writes formatted notes on a deal and saves a ticked checklist item', async () => {
    const user = userEvent.setup();
    renderSales();
    await user.click(await screen.findByRole('button', { name: 'Заметки: Стартовый пакет' }));
    let dialog = screen.getByRole('dialog', { name: 'Заметки: Стартовый пакет' });
    await user.click(await within(dialog).findByRole('textbox', { name: 'Заметки к сделке' }));
    await user.keyboard('{Control>}b{/Control}Условия{Control>}b{/Control}: отсрочка 14 дней');
    await user.keyboard('{Enter}');
    await user.click(within(dialog).getByRole('button', { name: 'Чек-лист' }));
    await user.keyboard('договор подписан');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await within(dialog).findByText('Условия', { selector: 'strong' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Не выполнено' }));
    expect(await within(dialog).findByRole('checkbox', { name: 'Выполнено' })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Готово' }));
    await user.click(screen.getByRole('button', { name: 'Заметки: Стартовый пакет' }));
    dialog = screen.getByRole('dialog', { name: 'Заметки: Стартовый пакет' });
    expect(within(dialog).getByRole('checkbox', { name: 'Выполнено' })).toBeChecked();
    expect(within(dialog).getByText(/отсрочка 14 дней/)).toBeInTheDocument();
  }, 15_000);
});
