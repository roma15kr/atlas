import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { ApiError } from '../lib/api';
import * as dealOrders from '../lib/dealOrders';
import { formatMoney } from '../lib/format';

const DEAL = 'Сделка: Стартовый пакет';
const renderSales = () => {
  localStorage.setItem('atlas.session', JSON.stringify(demoSessions.director));
  return render(<MemoryRouter initialEntries={['/sales']}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};
const openDeal = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: DEAL }, { timeout: 5_000 }));
  return screen.getByRole('dialog', { name: DEAL });
};
const addProducts = async (user: ReturnType<typeof userEvent.setup>, deal: HTMLElement) => {
  await user.click(await within(deal).findByRole('button', { name: /Добавить товары/ }));
  const picker = screen.getByRole('dialog', { name: 'Товары сделки' });
  await user.type(within(picker).getByLabelText('Найти товар'), 'TXLP 200');
  await user.click(await within(picker).findByRole('button', { name: 'Добавить «TXLP/2R 200W 1.2-1.5 м²»' }));
  const quantity = within(picker).getByLabelText('Количество: TXLP/2R 200W 1.2-1.5 м²');
  await user.clear(quantity); await user.type(quantity, '3');
  await user.clear(within(picker).getByLabelText('Найти товар'));
  await user.type(within(picker).getByLabelText('Найти товар'), 'N-Comfort');
  await user.click(await within(picker).findByRole('button', { name: 'Добавить «Терморегулятор Nexans N-Comfort TR»' }));
  await user.click(within(picker).getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Товары сделки' })).not.toBeInTheDocument());
};

beforeEach(() => { localStorage.clear(); dealOrders.resetDemoDealOrders(); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe('products in a deal', () => {
  it('adds two products from the catalogue and the deal amount becomes their sum, not editable by hand', async () => {
    const user = userEvent.setup();
    renderSales();
    const deal = await openDeal(user);
    await addProducts(user, deal);
    const section = within(deal).getByRole('region', { name: 'Товары' });
    expect(within(section).getByText('TXLP/2R 200W 1.2-1.5 м²')).toBeInTheDocument();
    expect(within(section).getByText('3 шт')).toBeInTheDocument();
    const sum = formatMoney(5010 * 3 + 2650, 'UAH');
    expect(section.querySelector('tfoot')!.textContent).toContain(sum);
    expect([...deal.querySelectorAll('.deal-facts dd')].map((item) => item.textContent)).toContain(sum);
    await user.click(within(deal).getByRole('button', { name: 'Изменить сделку' }));
    const amount = within(deal).getByLabelText(/Сумма/);
    expect(amount).toHaveAttribute('readonly');
    expect(within(deal).getByText('Сумма считается по товарам')).toBeInTheDocument();
  }, 20_000);

  it('creates the order in BPI, shows its number, locks the products and lets them be changed again', async () => {
    const user = userEvent.setup();
    renderSales();
    const deal = await openDeal(user);
    await addProducts(user, deal);
    await user.click(within(deal).getByRole('button', { name: 'Создать заказ' }));
    expect(await within(deal).findByText(/Заказ в BPI № 90001/)).toBeInTheDocument();
    expect(within(deal).getByText('Товары заблокированы после создания заказа')).toBeInTheDocument();
    expect(within(deal).queryByRole('button', { name: /Изменить товары/ })).not.toBeInTheDocument();
    await user.click(within(deal).getByRole('button', { name: 'Изменить заказ' }));
    expect(await within(deal).findByRole('button', { name: /Изменить товары/ })).toBeInTheDocument();
    expect(within(deal).getByRole('button', { name: 'Создать заказ' })).toBeInTheDocument();
  }, 20_000);

  it('says when the catalogue is unavailable', async () => {
    const user = userEvent.setup();
    const backend = dealOrders.createDemoDealOrders();
    vi.spyOn(dealOrders, 'dealOrdersBackend').mockReturnValue({ ...backend, search: async () => { throw new ApiError('down', 503, undefined, 'CATALOGUE_UNAVAILABLE'); } });
    renderSales();
    const deal = await openDeal(user);
    await user.click(await within(deal).findByRole('button', { name: /Добавить товары/ }));
    const picker = screen.getByRole('dialog', { name: 'Товары сделки' });
    expect(await within(picker).findByRole('alert')).toHaveTextContent('Каталог временно недоступен');
  }, 15_000);
});
