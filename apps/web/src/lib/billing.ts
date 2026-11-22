/** Tariffs and payments through Stripe: the director's overview, Checkout and portal links, invoices, and AI access. */
import { apiRequest, sessionStore } from './api';
import { localeOf } from '../i18n';

export type Plan = 'STANDARD' | 'STANDARD_AI';
export type Period = 'MONTH' | 'YEAR';
export const PLANS: Plan[] = ['STANDARD', 'STANDARD_AI'];

export interface PlanPrice { plan: Plan; period: Period; unitAmount: number; currency: string }
export interface Subscription {
  plan: Plan | null; period: Period | null; status: string | null; quantity: number | null;
  currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; paymentFailedAt: string | null;
}
export interface BillingOverview { configured: boolean; activeUsers: number; plans: PlanPrice[]; subscription: Subscription | null }
export interface Invoice {
  number: string | null; periodStart: string; periodEnd: string; amountDue: number; amountPaid: number; currency: string;
  status: string | null; hostedUrl: string | null; pdfUrl: string | null;
}

export interface BillingBackend {
  overview(): Promise<BillingOverview>;
  checkout(plan: Plan, period: Period): Promise<string>;
  portal(): Promise<string>;
  invoices(): Promise<Invoice[]>;
  features(): Promise<{ ai: boolean }>;
}

export const remoteBilling: BillingBackend = {
  overview: () => apiRequest<BillingOverview>('/billing'),
  checkout: async (plan, period) => (await apiRequest<{ url: string }>('/billing/checkout', { method: 'POST', body: { plan, period } })).url,
  portal: async () => (await apiRequest<{ url: string }>('/billing/portal', { method: 'POST' })).url,
  invoices: () => apiRequest<Invoice[]>('/billing/invoices'),
  features: () => apiRequest<{ ai: boolean }>('/billing/features'),
};

/** A Stripe link can't be opened in demo mode; the screen says so instead of redirecting. */
export class DemoBillingRedirect extends Error {}

const DEMO_PRICES: PlanPrice[] = [
  { plan: 'STANDARD', period: 'MONTH', unitAmount: 700, currency: 'USD' }, { plan: 'STANDARD', period: 'YEAR', unitAmount: 6000, currency: 'USD' },
  { plan: 'STANDARD_AI', period: 'MONTH', unitAmount: 1000, currency: 'USD' }, { plan: 'STANDARD_AI', period: 'YEAR', unitAmount: 9600, currency: 'USD' },
];
const DEMO_KEY = 'atlas.demoBilling';
/** Demo mode: «Стандарт + AI», yearly, active, with two sample invoices; a stored override lets tests try other states. */
export function createDemoBillingSample(activeUsers: number): BillingBackend {
  const subscription = (): Subscription | null => {
    try {
      const stored = localStorage.getItem(DEMO_KEY);
      if (stored === 'none') return null;
      if (stored) return JSON.parse(stored) as Subscription;
    } catch { /* fall back to the sample */ }
    return { plan: 'STANDARD_AI', period: 'YEAR', status: 'active', quantity: activeUsers, currentPeriodEnd: '2027-11-22T00:00:00.000Z', cancelAtPeriodEnd: false, paymentFailedAt: null };
  };
  return {
    overview: async () => ({ configured: true, activeUsers, plans: DEMO_PRICES, subscription: subscription() }),
    checkout: async () => { throw new DemoBillingRedirect(); },
    portal: async () => { throw new DemoBillingRedirect(); },
    invoices: async () => [
      { number: 'DEMO-0002', periodStart: '2026-11-22T00:00:00.000Z', periodEnd: '2027-11-22T00:00:00.000Z', amountDue: 9600 * activeUsers, amountPaid: 9600 * activeUsers, currency: 'USD', status: 'paid', hostedUrl: null, pdfUrl: null },
      { number: 'DEMO-0001', periodStart: '2025-11-22T00:00:00.000Z', periodEnd: '2026-11-22T00:00:00.000Z', amountDue: 9600 * activeUsers, amountPaid: 9600 * activeUsers, currency: 'USD', status: 'paid', hostedUrl: null, pdfUrl: null },
    ],
    features: async () => {
      const current = subscription();
      return { ai: !current || (current.plan === 'STANDARD_AI' && !['canceled', 'incomplete_expired'].includes(current.status ?? '')) };
    },
  };
}

/** The demo backend; tests replace it to try other states. */
export function createDemoBilling(activeUsers: number): BillingBackend { return createDemoBillingSample(activeUsers); }

export const isDemoBilling = (): boolean => Boolean(sessionStore.get()?.accessToken.startsWith('demo-'));

/** Stripe amounts are in cents; prices are shown per user per month, a yearly price divided by 12. */
export const monthlyPerUser = (price: PlanPrice): number => price.period === 'YEAR' ? price.unitAmount / 12 : price.unitAmount;
/** What one period costs for `users` people, in cents. */
export const periodTotal = (price: PlanPrice, users: number): number => price.unitAmount * Math.max(1, users);
export const formatUsd = (cents: number, currency = 'USD'): string =>
  new Intl.NumberFormat(localeOf(), { style: 'currency', currency, minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);

/** How a subscription stands, for its badge: overdue first, then cancelled, active or ended. */
export function subscriptionState(subscription: Subscription): 'overdue' | 'cancelling' | 'active' | 'ended' | 'pending' {
  if (subscription.paymentFailedAt || subscription.status === 'past_due' || subscription.status === 'unpaid') return 'overdue';
  if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') return 'ended';
  if (subscription.cancelAtPeriodEnd) return 'cancelling';
  if (subscription.status === 'active' || subscription.status === 'trialing') return 'active';
  return 'pending';
}
