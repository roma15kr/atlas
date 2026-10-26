import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';

const renderCrm = () => {
  localStorage.setItem('atlas.session', JSON.stringify(demoSessions.director));
  return render(<MemoryRouter initialEntries={['/crm']}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });

describe('new client', () => {
  it('can be created without an email', async () => {
    const user = userEvent.setup();
    renderCrm();
    await user.click(await screen.findByRole('button', { name: /Добавить клиента/ }, { timeout: 5_000 }));
    const dialog = screen.getByRole('dialog', { name: 'Новый клиент' });
    const email = within(dialog).getByLabelText(/Email/) as HTMLInputElement;
    expect(email).not.toBeRequired();
    expect(within(dialog).getByText('Необязательно')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Компания/), 'ТОВ Сумиенергосервіс');
    await user.type(within(dialog).getByLabelText(/Контактное лицо/), 'Олег Коваль');
    await user.type(within(dialog).getByLabelText(/Телефон/), '+380 67 123 45 67');
    await user.type(within(dialog).getByLabelText(/Источник/), 'Звонок');
    await user.click(within(dialog).getByRole('button', { name: 'Создать карточку' }));
    expect(await screen.findByText('ТОВ Сумиенергосервіс', {}, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Новый клиент' })).not.toBeInTheDocument();
  }, 15_000);
});
