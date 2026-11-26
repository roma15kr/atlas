import { useTranslation } from 'react-i18next';
import { PackagePlus, Pencil, RefreshCw, Search, Send, Trash2, Unlock } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '../../context/AppContext';
import { ApiError } from '../../lib/api';
import { dealOrdersBackend, discountOf, type CatalogueProduct, type DealLine, type DealLinesState, type DealOrder, type LineInput } from '../../lib/dealOrders';
import { formatDateTime, formatMoney } from '../../lib/format';
import type { Deal } from '../../types';
import { Badge, Button, Dialog, IconButton, LoadingState } from '../ui';

const KNOWN_ERRORS = ['DEAL_ORDER_LOCKED', 'DEAL_PRODUCTS_REQUIRED', 'DEAL_CLIENT_REQUIRED', 'BPI_MANAGER_REQUIRED', 'DEAL_ORDER_PENDING', 'CATALOGUE_UNAVAILABLE', 'CATALOGUE_PRODUCT_NOT_FOUND'] as const;

function useErrorText() {
  const { t } = useTranslation('orders');
  return useCallback((reason: unknown) => {
    const code = reason instanceof ApiError ? reason.code : reason instanceof Error ? reason.message : undefined;
    const known = KNOWN_ERRORS.find((item) => item === code);
    return known ? t(`errors.${known}`) : t('errors.failed');
  }, [t]);
}

/** The deal card's products and its order in BPI: read-only rows, a picker dialog, and «Створити замовлення». */
export function DealProducts({ deal }: { deal: Deal }) {
  const { t } = useTranslation(['orders', 'common']);
  const { applyDealProducts } = useWorkspace();
  const backend = dealOrdersBackend();
  const errorText = useErrorText();
  const [state, setState] = useState<DealLinesState | null>(null);
  const [orders, setOrders] = useState<DealOrder[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [lines, history] = await Promise.all([backend.lines(deal.id), backend.orders(deal.id)]);
      setState(lines); setOrders(history);
    } catch (reason) { setError(errorText(reason)); setState({ lines: [], locked: Boolean(deal.productsLocked), value: deal.value }); }
  }, [backend, deal.id, deal.productsLocked, deal.value, errorText]);
  useEffect(() => { void load(); }, [load]);

  const accept = (next: DealLinesState) => {
    setState(next);
    applyDealProducts(deal.id, { productCount: next.lines.length, productsLocked: next.locked, ...(next.lines.length ? { value: next.value } : {}) });
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  };
  const createOrder = () => run(async () => {
    await backend.createOrder(deal.id);
    const [lines, history] = await Promise.all([backend.lines(deal.id), backend.orders(deal.id)]);
    accept(lines); setOrders(history);
  });
  const unlock = () => run(async () => {
    await backend.unlock(deal.id);
    accept(await backend.lines(deal.id));
  });
  const retry = (order: DealOrder) => run(async () => {
    await backend.retry(deal.id, order.id);
    setOrders(await backend.orders(deal.id));
  });

  if (!state) return <section className="deal-products" aria-label={t('section.title')}><LoadingState label={t('section.loading')} /></section>;
  const latest = orders[0];
  const total = state.lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return <section className="deal-products" aria-label={t('section.title')}>
    <header>
      <h3>{t('section.title')}</h3>
      {latest && <OrderBadge order={latest} />}
      {!state.locked && <button type="button" className="text-button" onClick={() => setPicking(true)}>{state.lines.length ? <><Pencil size={13} aria-hidden /> {t('section.edit')}</> : <><PackagePlus size={13} aria-hidden /> {t('section.add')}</>}</button>}
    </header>
    {state.lines.length ? <div className="data-table-wrap"><table className="data-table deal-products__table">
      <thead><tr><th>{t('col.product')}</th><th className="num">{t('col.quantity')}</th><th className="num">{t('col.price')}</th><th className="num">{t('col.total')}</th></tr></thead>
      <tbody>{state.lines.map((line, index) => <tr key={line.id ?? index}>
        <td><strong>{line.name}</strong>{line.byBox && <> <Badge tone="info">{t('box')}</Badge></>}<small className="table-subline">{line.code}{discountOf(line) > 0 ? ` · ${t('discount', { percent: discountOf(line) })}` : ''}</small></td>
        <td className="num">{line.byBox ? t('boxes', { count: line.quantity }) : t('unit', { count: line.quantity })}</td>
        <td className="num">{formatMoney(line.unitPrice, 'UAH')}</td>
        <td className="num">{formatMoney(line.lineTotal, 'UAH')}</td>
      </tr>)}</tbody>
      <tfoot><tr><td colSpan={3}>{t('total')}</td><td className="num">{formatMoney(total, 'UAH')}</td></tr></tfoot>
    </table></div> : <p className="deal-products__empty">{t('section.empty')}</p>}
    {latest?.status === 'CREATING' && <p className="form-hint">{t('order.pendingNote')}</p>}
    {orders.length > 0 && <details className="deal-products__history"><summary>{t('order.history')} · {orders.length}</summary><ul>
      {orders.map((order) => <li key={order.id}>{order.bpiOrderId
        ? t('order.historyItem', { number: order.bpiOrderId, time: formatDateTime(order.sentAt ?? order.createdAt), name: order.sentByName ?? '—' })
        : `${formatDateTime(order.createdAt)} · ${order.status === 'FAILED' ? t('order.notCreated') : t('order.waiting')}`}{order.replacesOrderId ? t('order.replaces', { number: order.replacesOrderId }) : ''}</li>)}
    </ul></details>}
    <div className="deal-products__actions">
      {state.locked && <span className="form-hint">{t('order.locked')}</span>}
      {latest?.status === 'FAILED' && <Button variant="secondary" icon={RefreshCw} disabled={busy} onClick={() => void retry(latest)}>{t('order.retry')}</Button>}
      {state.locked && latest?.status !== 'CREATING' && <Button variant="secondary" icon={Unlock} disabled={busy} onClick={() => void unlock()}>{t('order.unlock')}</Button>}
      {!state.locked && state.lines.length > 0 && <Button icon={Send} disabled={busy} onClick={() => void createOrder()}>{busy ? t('order.creating') : t('order.create')}</Button>}
    </div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {picking && <DealProductsDialog dealId={deal.id} initial={state.lines} onClose={() => setPicking(false)} onSaved={(next) => { accept(next); setPicking(false); }} />}
  </section>;
}

function OrderBadge({ order }: { order: DealOrder }) {
  const { t } = useTranslation('orders');
  if (order.status === 'SENT' && order.bpiOrderId) return <Badge tone="success">{t('order.sent', { number: order.bpiOrderId, time: formatDateTime(order.sentAt ?? order.createdAt) })}</Badge>;
  if (order.status === 'FAILED') return <Badge tone="danger">{t('order.failed')}</Badge>;
  return <Badge tone="warning">{t('order.pending')}</Badge>;
}

interface Draft { bpiProductId: number; name: string; code: string; codebox: string; price: number; pricebox: number; byBox: boolean; quantity: string; unitPrice: string }

const draftOf = (line: DealLine): Draft => ({
  bpiProductId: line.bpiProductId, name: line.name, code: line.byBox ? '' : line.code, codebox: line.byBox ? line.code : '',
  price: line.byBox ? 0 : line.cataloguePrice, pricebox: line.byBox ? line.cataloguePrice : 0, byBox: line.byBox, quantity: String(line.quantity), unitPrice: String(line.unitPrice),
});

/** Search the catalogue, choose lines, and set quantity, unit or box, and price. */
function DealProductsDialog({ dealId, initial, onClose, onSaved }: { dealId: string; initial: DealLine[]; onClose: () => void; onSaved: (state: DealLinesState) => void }) {
  const { t } = useTranslation(['orders', 'common']);
  const backend = dealOrdersBackend();
  const errorText = useErrorText();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogueProduct[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>(() => initial.map(draftOf));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      backend.search(query.trim())
        .then((found) => { if (active) { setResults(found); setError(''); } })
        .catch((reason) => { if (active) { setResults([]); setError(errorText(reason)); } })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps -- search follows the query only

  const add = (product: CatalogueProduct) => setDrafts((current) => [...current, {
    bpiProductId: product.id, name: product.name, code: product.code, codebox: product.codebox, price: product.price, pricebox: product.pricebox,
    byBox: false, quantity: '1', unitPrice: String(product.price),
  }]);
  const change = (index: number, patch: Partial<Draft>) => setDrafts((current) => current.map((draft, at) => at === index ? { ...draft, ...patch } : draft));
  const cataloguePrice = (draft: Draft) => draft.byBox ? draft.pricebox || draft.price : draft.price;
  const valid = drafts.every((draft) => /^\d+$/.test(draft.quantity) && Number(draft.quantity) >= 1 && Number(draft.unitPrice) >= 0 && draft.unitPrice.trim() !== '');
  const total = useMemo(() => drafts.reduce((sum, draft) => sum + (Number(draft.unitPrice) || 0) * (Number(draft.quantity) || 0), 0), [drafts]);

  const save = async () => {
    setSaving(true); setError('');
    try {
      const lines: LineInput[] = drafts.map((draft) => ({ bpiProductId: draft.bpiProductId, byBox: draft.byBox, quantity: Number(draft.quantity), unitPrice: Math.round(Number(draft.unitPrice) * 100) / 100 }));
      onSaved(await backend.saveLines(dealId, lines));
    } catch (reason) { setError(errorText(reason)); } finally { setSaving(false); }
  };

  return <Dialog open size="lg" title={t('dialog.title')} description={t('dialog.text')} onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
    <Button type="button" disabled={saving || !valid} onClick={() => void save()}>{saving ? t('common:actions.saving') : t('common:actions.save')}</Button></>}>
    <label className="table-search deal-products__search"><Search size={16} aria-hidden /><input aria-label={t('dialog.search')} placeholder={t('dialog.searchPlaceholder')} value={query} autoFocus onChange={(event) => setQuery(event.target.value)} /></label>
    <ul className="deal-products__results" aria-label={t('dialog.results')} aria-busy={searching}>
      {results === null ? <li className="form-hint">{t('dialog.searching')}</li> : results.length ? results.map((product) => <li key={product.id}>
        <span><strong>{product.name}</strong><small>{product.code} · {formatMoney(product.price, 'UAH')}{product.pricebox ? ` · ${t('dialog.boxPrice', { price: formatMoney(product.pricebox, 'UAH') })}` : ''} · {t('dialog.stock', { count: product.stock })}</small></span>
        <IconButton label={t('dialog.addLine', { name: product.name })} icon={PackagePlus} onClick={() => add(product)} />
      </li>) : <li className="form-hint">{t('dialog.nothing')}</li>}
    </ul>
    <h4 className="deal-products__subtitle">{t('dialog.lines')}</h4>
    {drafts.length ? <div className="deal-products__drafts">{drafts.map((draft, index) => <div className="deal-products__draft" key={`${draft.bpiProductId}-${index}`}>
      <span className="deal-products__draft-name"><strong>{draft.name}</strong><small>{draft.byBox ? draft.codebox || draft.code : draft.code} · {t('dialog.catalogue', { price: formatMoney(cataloguePrice(draft), 'UAH') })}</small></span>
      {draft.pricebox > 0 && <label className="deal-products__box"><input type="checkbox" aria-label={t('dialog.byBoxFor', { name: draft.name })} checked={draft.byBox}
        onChange={(event) => change(index, { byBox: event.target.checked, unitPrice: String(event.target.checked ? draft.pricebox : draft.price) })} /> {t('dialog.byBox')}</label>}
      <input className="deal-products__qty" type="number" min="1" max="100000" step="1" inputMode="numeric" aria-label={t('dialog.quantityFor', { name: draft.name })} value={draft.quantity} onChange={(event) => change(index, { quantity: event.target.value })} />
      <input className="deal-products__price" type="number" min="0" step="0.01" aria-label={t('dialog.priceFor', { name: draft.name })} value={draft.unitPrice} onChange={(event) => change(index, { unitPrice: event.target.value })} />
      <input className="deal-products__discount" type="number" min="0" max="100" step="0.1" aria-label={t('dialog.discountFor', { name: draft.name })}
        value={cataloguePrice(draft) > 0 && Number(draft.unitPrice) < cataloguePrice(draft) ? String(Math.round((1 - Number(draft.unitPrice) / cataloguePrice(draft)) * 1000) / 10) : ''}
        placeholder="%" onChange={(event) => change(index, { unitPrice: String(Math.round(cataloguePrice(draft) * (1 - (Number(event.target.value) || 0) / 100) * 100) / 100) })} />
      <IconButton label={t('dialog.removeFor', { name: draft.name })} icon={Trash2} onClick={() => setDrafts((current) => current.filter((_, at) => at !== index))} />
    </div>)}
      <p className="deal-products__total">{t('total')}: <strong>{formatMoney(total, 'UAH')}</strong></p>
    </div> : <p className="form-hint">{t('dialog.noLines')}</p>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </Dialog>;
}
