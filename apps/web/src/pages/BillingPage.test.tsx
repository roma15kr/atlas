import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider, WorkspaceProvider } from '../context/AppContext';
import { demoSessions } from '../data/demo';
import { formatUsd } from '../lib/billing';
import { billingDate } from './BillingPage';

const text = (value: string) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s/g, '\\s'));

const renderAs = (username: keyof typeof demoSessions, path = '/settings/billing') => {
  localStorage.setItem('atlas.session', JSON.stringify(demoSessions[username]));
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><WorkspaceProvider><App /></WorkspaceProvider></AuthProvider></MemoryRouter>);
};
const noSubscription = () => localStorage.setItem('atlas.demoBilling', 'none');
const subscription = (overrides: Record<string, unknown>) => localStorage.setItem('atlas.demoBilling', JSON.stringify({
  plan: 'STANDARD_AI', period: 'YEAR', status: 'active', quantity: 6, currentPeriodEnd: '2027-11-22T00:00:00.000Z', cancelAtPeriodEnd: false, paymentFailedAt: null, ...overrides,
}));

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('plan and billing', () => {
  it('shows the four prices per user and the totals for the active users', async () => {
    const user = userEvent.setup();
    noSubscription();
    renderAs('director');
    const standard = await screen.findByRole('article', { name: 'Стандарт' }, { timeout: 5_000 });
    const ai = screen.getByRole('article', { name: 'Стандарт + AI' });
    expect(within(standard).getByText(text(formatUsd(500)))).toBeInTheDocument();
    expect(within(standard).getByText(text(`6 пользователей · ${formatUsd(36000)} в год`))).toBeInTheDocument();
    expect(within(ai).getByText(text(`6 пользователей · ${formatUsd(57600)} в год`))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ежемесячно' }));
    expect(within(screen.getByRole('article', { name: 'Стандарт' })).getByText(text(`${formatUsd(4200)} в месяц`))).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Стандарт + AI' })).getByText(text(`${formatUsd(6000)} в месяц`))).toBeInTheDocument();
  });

  it('sends the director to Stripe with the chosen tariff and period', async () => {
    const user = userEvent.setup();
    noSubscription();
    const billing = await import('../lib/billing');
    const checkout = vi.fn(async () => 'https://checkout.stripe.test/s_1');
    vi.spyOn(billing, 'createDemoBilling').mockImplementation((users) => ({ ...billing.createDemoBillingSample(users), checkout }));
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    renderAs('director');
    await user.click(await screen.findByRole('button', { name: 'Оплатить «Стандарт + AI»' }, { timeout: 5_000 }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.test/s_1'));
    expect(checkout).toHaveBeenCalledWith('STANDARD_AI', 'YEAR');
  });

  it('shows the active tariff, the next charge and the invoices', async () => {
    renderAs('director');
    expect(await screen.findByRole('heading', { name: 'Стандарт + AI' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByText('Активен')).toBeInTheDocument();
    expect([...document.querySelectorAll('dd')].map((item) => item.textContent)).toContain(`${billingDate('2027-11-22T00:00:00.000Z')} · ${formatUsd(57600)}`);
    expect(screen.getAllByText('Оплачено')).toHaveLength(2);
    expect(screen.queryByRole('article', { name: 'Стандарт' })).not.toBeInTheDocument();
  });

  it('shows the overdue warning and the manage-payment action', async () => {
    subscription({ status: 'past_due', paymentFailedAt: '2026-11-22T08:00:00.000Z' });
    renderAs('director');
    expect(await screen.findByText('Оплата просрочена', {}, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Оплата не прошла');
    expect(screen.getByRole('button', { name: 'Управлять оплатой' })).toBeInTheDocument();
  });

  it('says when a cancelled tariff stays active', async () => {
    subscription({ cancelAtPeriodEnd: true });
    renderAs('director');
    expect(await screen.findByText(`Активен до ${billingDate('2027-11-22T00:00:00.000Z')}, не будет продлён`, {}, { timeout: 5_000 })).toBeInTheDocument();
  }, 15_000);

  it('says payments are not configured', async () => {
    const billing = await import('../lib/billing');
    vi.spyOn(billing, 'createDemoBilling').mockImplementation((users) => ({ ...billing.createDemoBillingSample(users), overview: async () => ({ configured: false, activeUsers: users, plans: [], subscription: null }) }));
    renderAs('director');
    expect(await screen.findByText(/Оплата не настроена на сервере/, {}, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Оплатить/ })).not.toBeInTheDocument();
  });

  it('gives a manager no item and sends the address to the dashboard', async () => {
    renderAs('manager');
    expect(await screen.findByRole('heading', { name: /^Добрый день, / }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Тариф и оплата' })).not.toBeInTheDocument();
  }, 15_000);

  it('prompts a director without a tariff on the dashboard, until dismissed', async () => {
    const user = userEvent.setup();
    noSubscription();
    renderAs('director', '/');
    const prompt = await screen.findByText('Выберите тариф Atlas', {}, { timeout: 5_000 });
    await user.click(within(prompt.closest('section, div.consent-notice, [role="note"]') as HTMLElement).getByRole('button', { name: 'Позже' }));
    expect(screen.queryByText('Выберите тариф Atlas')).not.toBeInTheDocument();
    expect(localStorage.getItem('atlas.billingPromptDismissed')).toBe('1');
  }, 15_000);

  it('replaces «Сформировать» with the tariff hint in the AI dialog on «Стандарт»', async () => {
    const user = userEvent.setup();
    subscription({ plan: 'STANDARD' });
    renderAs('director', '/team');
    await user.click(await screen.findByRole('button', { name: 'AI-анализ' }, { timeout: 5_000 }));
    const dialog = await screen.findByRole('dialog', { name: 'AI-анализ' });
    expect(await within(dialog).findByText('AI-анализ входит в тариф «Стандарт + AI».')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Сформировать' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Изменить тариф' })).toHaveAttribute('href', '/settings/billing');
  }, 15_000);
});
