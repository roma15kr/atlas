import { useTranslation } from 'react-i18next';
import { Check, CreditCard, ExternalLink, Repeat } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, EmptyState, LoadingState, PageHeader, SectionHeader, Segmented, Surface } from '../components/ui';
import { useWorkspace } from '../context/AppContext';
import { ApiError } from '../lib/api';
import {
  createDemoBilling, DemoBillingRedirect, formatUsd, isDemoBilling, monthlyPerUser, periodTotal, PLANS, remoteBilling, subscriptionState,
  type BillingBackend, type BillingOverview, type Invoice, type Period, type Plan, type PlanPrice,
} from '../lib/billing';
import { formatDate } from '../lib/format';

/** Billing dates always show the year: a renewal is often next year. */
export const billingDate = (value: string) => formatDate(value, { day: '2-digit', month: '2-digit', year: 'numeric' });

const KNOWN_ERRORS = ['BILLING_ALREADY_SUBSCRIBED', 'BILLING_NOT_CONFIGURED', 'BILLING_NO_CUSTOMER', 'BILLING_PROVIDER_ERROR'] as const;
const STATE_TONE = { active: 'success', overdue: 'warning', cancelling: 'info', ended: 'neutral', pending: 'neutral' } as const;

/** The billing backend for this session: the API, or the demo sample. */
export function useBillingBackend(): BillingBackend {
  const { users } = useWorkspace();
  const activeUsers = users.filter((user) => user.status !== 'DISABLED').length;
  return useMemo(() => isDemoBilling() ? createDemoBilling(activeUsers) : remoteBilling, [activeUsers]);
}

/** Director-only: the tariff, paid users, next charge, Stripe Checkout and portal, and invoices. */
export function BillingPage() {
  const { t } = useTranslation(['billing', 'common']);
  const backend = useBillingBackend();
  const [params, setParams] = useSearchParams();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const returned = params.get('checkout');

  const load = useCallback(async () => {
    try {
      const next = await backend.overview();
      setOverview(next);
      setInvoices(next.configured ? await backend.invoices().catch(() => []) : []);
      return next;
    } catch { setError(t('page.loadFailed')); return null; }
  }, [backend, t]);

  useEffect(() => { void load(); }, [load]);

  // Back from Stripe: the webhook may lag a few seconds, so refresh until the subscription shows up (30 s at most).
  useEffect(() => {
    if (!returned) return;
    setNotice(returned === 'success' ? t('page.paid') : t('page.cancelled'));
    setParams({}, { replace: true });
    if (returned !== 'success') return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      void load().then((next) => { if (next?.subscription || tries >= 10) window.clearInterval(timer); });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [returned, load, setParams, t]);

  useEffect(() => {
    const onSocket = (event: Event) => { if ((event as CustomEvent<{ event: string }>).detail.event === 'billing:changed') void load(); };
    window.addEventListener('atlas:socket', onSocket);
    return () => window.removeEventListener('atlas:socket', onSocket);
  }, [load]);

  const go = async (link: () => Promise<string>) => {
    setBusy(true); setError('');
    try { window.location.assign(await link()); } catch (reason) {
      const code = reason instanceof ApiError ? KNOWN_ERRORS.find((item) => item === reason.code) : undefined;
      setError(reason instanceof DemoBillingRedirect ? t('page.demo') : code ? t(`errors.${code}`) : t('page.actionFailed'));
      setBusy(false);
    }
  };

  const subscription = overview?.subscription ?? null;
  const state = subscription ? subscriptionState(subscription) : null;
  const choosing = Boolean(overview?.configured) && (!subscription || state === 'ended');

  return <>
    <PageHeader title={t('page.title')} description={t('page.description')} />
    {notice && <div className="notice notice--info" role="status">{notice}<button onClick={() => setNotice('')}>{t('common:actions.close')}</button></div>}
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>{t('common:actions.close')}</button></div>}
    {!overview ? (error ? null : <LoadingState label={t('page.loading')} />) : !overview.configured
      ? <Surface className="billing-card"><EmptyState title={t('page.title')} description={t('page.notConfigured')} icon={CreditCard} /></Surface>
      : <div className="billing">
        {subscription && state && <Surface className="billing-card">
          <SectionHeader title={subscription.plan ? t(`plan.${subscription.plan}`) : t('page.title')}
            meta={<>{subscription.period && <Badge tone="info">{t(`period.${subscription.period}`)}</Badge>}<Badge tone={STATE_TONE[state]}>{t(`status.${state}`)}</Badge></>}
            action={<div className="billing-card__actions">
              <Button variant="secondary" icon={Repeat} disabled={busy} onClick={() => void go(backend.portal)}>{t('summary.change')}</Button>
              <Button icon={CreditCard} disabled={busy} onClick={() => void go(backend.portal)}>{t('summary.manage')}</Button>
            </div>} />
          {state === 'overdue' && <div className="notice notice--warning billing-card__notice" role="alert">{t('summary.overdue')}</div>}
          <dl className="dialog-facts">
            <div><dt>{t('summary.users')}</dt><dd>{subscription.quantity ?? overview.activeUsers}</dd></div>
            {subscription.currentPeriodEnd && (state === 'cancelling'
              ? <div><dt>{t('summary.activeUntil')}</dt><dd>{t('summary.cancelNote', { date: billingDate(subscription.currentPeriodEnd) })}</dd></div>
              : <div><dt>{t('summary.next')}</dt><dd>{nextCharge(overview, subscription.currentPeriodEnd)}</dd></div>)}
          </dl>
        </Surface>}
        {choosing && <PlanChooser overview={overview} busy={busy} onPay={(plan, period) => void go(() => backend.checkout(plan, period))} />}
        <Surface className="billing-card">
          <SectionHeader title={t('invoices.title')} />
          {!invoices ? <LoadingState label={t('page.loading')} /> : invoices.length ? <div className="data-table-wrap"><table className="data-table billing-invoices">
            <thead><tr><th>{t('invoices.period')}</th><th>{t('invoices.amount')}</th><th>{t('invoices.status')}</th><th aria-label={t('invoices.pdf')} /></tr></thead>
            <tbody>{invoices.map((invoice, index) => <tr key={invoice.number ?? index}>
              <td>{billingDate(invoice.periodStart)} – {billingDate(invoice.periodEnd)}</td>
              <td>{formatUsd(invoice.amountDue, invoice.currency)}</td>
              <td><Badge tone={invoice.status === 'paid' ? 'success' : invoice.status === 'open' ? 'warning' : 'neutral'}>{t(invoice.status === 'paid' ? 'invoices.paid' : invoice.status === 'open' ? 'invoices.open' : 'invoices.other')}</Badge></td>
              <td>{(invoice.pdfUrl ?? invoice.hostedUrl) && <a href={invoice.pdfUrl ?? invoice.hostedUrl!} target="_blank" rel="noreferrer">{t('invoices.pdf')} <ExternalLink size={12} aria-hidden /></a>}</td>
            </tr>)}</tbody></table></div> : <p className="dialog-note">{t('invoices.empty')}</p>}
        </Surface>
      </div>}
  </>;
}

/** The next charge's date and amount, estimated from the current price and quantity. */
function nextCharge(overview: BillingOverview, end: string): string {
  const subscription = overview.subscription!;
  const price = overview.plans.find((item) => item.plan === subscription.plan && item.period === subscription.period);
  const amount = price ? ` · ${formatUsd(periodTotal(price, subscription.quantity ?? overview.activeUsers), price.currency)}` : '';
  return `${billingDate(end)}${amount}`;
}

function PlanChooser({ overview, busy, onPay }: { overview: BillingOverview; busy: boolean; onPay: (plan: Plan, period: Period) => void }) {
  const { t } = useTranslation('billing');
  const [period, setPeriod] = useState<Period>('YEAR');
  const priceOf = (plan: Plan, of: Period) => overview.plans.find((item) => item.plan === plan && item.period === of);
  const features: Record<Plan, string[]> = {
    STANDARD: [t('choose.featuresStandard1'), t('choose.featuresStandard2'), t('choose.featuresStandard3')],
    STANDARD_AI: [t('choose.featuresAi1'), t('choose.featuresAi2'), t('choose.featuresAi3')],
  };
  const saving = (plan: Plan) => {
    const [monthly, yearly] = [priceOf(plan, 'MONTH'), priceOf(plan, 'YEAR')];
    return monthly && yearly ? Math.round((1 - monthlyPerUser(yearly) / monthlyPerUser(monthly)) * 100) : 0;
  };
  return <Surface className="billing-card">
    <SectionHeader title={t('choose.title')} action={<Segmented label={t('choose.period')} value={period} onChange={setPeriod}
      options={[{ value: 'MONTH', label: t('period.MONTH') }, { value: 'YEAR', label: t('period.YEAR') }]} />} />
    <p className="dialog-note">{t('choose.beforeFirst')}</p>
    <div className="billing-plans">{PLANS.map((plan) => {
      const price: PlanPrice | undefined = priceOf(plan, period);
      if (!price) return null;
      return <article key={plan} className={`billing-plan ${plan === 'STANDARD_AI' ? 'billing-plan--ai' : ''}`} aria-label={t(`plan.${plan}`)}>
        <header><strong>{t(`plan.${plan}`)}</strong>{period === 'YEAR' && saving(plan) > 0 && <Badge tone="success">{t('choose.yearlySave', { percent: saving(plan) })}</Badge>}</header>
        <div className="billing-plan__price">{formatUsd(monthlyPerUser(price), price.currency)} <small>{t('choose.perUser')}</small></div>
        <small className="billing-plan__total">{t(period === 'YEAR' ? 'choose.totalYear' : 'choose.totalMonth', { count: overview.activeUsers, amount: formatUsd(periodTotal(price, overview.activeUsers), price.currency) })}</small>
        <ul>{features[plan].map((feature) => <li key={feature}><Check size={13} aria-hidden /> {feature}</li>)}</ul>
        <Button variant={plan === 'STANDARD_AI' ? 'primary' : 'secondary'} disabled={busy} onClick={() => onPay(plan, period)}>{t('choose.pay', { plan: t(`plan.${plan}`) })}</Button>
      </article>;
    })}</div>
  </Surface>;
}
