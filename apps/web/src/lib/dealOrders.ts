/** The b2b catalogue (BPI) for deals, a deal's products, and its orders in BPI; with a demo backend. */
import { apiRequest, sessionStore } from './api';

export interface CatalogueProduct { id: number; name: string; code: string; codebox: string; price: number; pricebox: number; stock: number }
export interface DealLine { id?: string; bpiProductId: number; name: string; code: string; byBox: boolean; quantity: number; cataloguePrice: number; unitPrice: number; lineTotal: number }
export interface DealLinesState { lines: DealLine[]; locked: boolean; value: number }
export interface LineInput { bpiProductId: number; byBox: boolean; quantity: number; unitPrice?: number; discountPercent?: number }
export interface DealOrder {
  id: string; bpiOrderId: number | null; replacesOrderId: number | null; status: 'CREATING' | 'SENT' | 'FAILED';
  attempts: number; lastError: string | null; sentBy: string | null; sentByName: string | null; createdAt: string; sentAt: string | null;
}

export interface DealOrdersBackend {
  search(query: string): Promise<CatalogueProduct[]>;
  lines(dealId: string): Promise<DealLinesState>;
  saveLines(dealId: string, lines: LineInput[]): Promise<DealLinesState>;
  orders(dealId: string): Promise<DealOrder[]>;
  createOrder(dealId: string): Promise<DealOrder>;
  unlock(dealId: string): Promise<void>;
  retry(dealId: string, orderId: string): Promise<DealOrder>;
}

export const remoteDealOrders: DealOrdersBackend = {
  search: (query) => apiRequest<CatalogueProduct[]>(`/catalogue/products?query=${encodeURIComponent(query)}&limit=20`),
  lines: (dealId) => apiRequest<DealLinesState>(`/deals/${dealId}/products`),
  saveLines: (dealId, lines) => apiRequest<DealLinesState>(`/deals/${dealId}/products`, { method: 'PUT', body: { lines } }),
  orders: (dealId) => apiRequest<DealOrder[]>(`/deals/${dealId}/orders`),
  createOrder: (dealId) => apiRequest<DealOrder>(`/deals/${dealId}/orders`, { method: 'POST' }),
  unlock: async (dealId) => { await apiRequest(`/deals/${dealId}/orders/unlock`, { method: 'POST' }); },
  retry: (dealId, orderId) => apiRequest<DealOrder>(`/deals/${dealId}/orders/${orderId}/retry`, { method: 'POST' }),
};

const DEMO_CATALOGUE: CatalogueProduct[] = [
  { id: 1, name: 'TXLP/2R 200W 1.2-1.5 м²', code: '000006669', codebox: '000007078', price: 5010, pricebox: 5181, stock: 14 },
  { id: 2, name: 'TXLP/2R 300W 1.8-2.3 м²', code: '000006670', codebox: '000007079', price: 5490, pricebox: 5672, stock: 9 },
  { id: 3, name: 'TXLP/2R 400W 2.4-3.1 м²', code: '000006671', codebox: '000007080', price: 5960, pricebox: 6150, stock: 6 },
  { id: 4, name: 'TXLP/2R 600W 3.7-4.6 м²', code: '000006672', codebox: '000007081', price: 6780, pricebox: 6995, stock: 4 },
  { id: 5, name: 'Нагрівальний мат Nexans MILLIMAT 150W/m² 1 м²', code: '000008810', codebox: '', price: 3890, pricebox: 0, stock: 21 },
  { id: 6, name: 'Нагрівальний мат Nexans MILLIMAT 150W/m² 2 м²', code: '000008811', codebox: '', price: 5240, pricebox: 0, stock: 12 },
  { id: 7, name: 'Терморегулятор Nexans N-Comfort TR', code: '000004402', codebox: '', price: 2650, pricebox: 0, stock: 30 },
  { id: 8, name: 'Терморегулятор Nexans Millitemp Wi-Fi', code: '000004410', codebox: '', price: 4120, pricebox: 0, stock: 8 },
  { id: 9, name: 'Кабель DEFROST SNOW 30W/m 10 м', code: '000009120', codebox: '', price: 3150, pricebox: 0, stock: 5 },
  { id: 10, name: 'Кабель DEFROST SNOW 30W/m 20 м', code: '000009121', codebox: '', price: 5280, pricebox: 0, stock: 3 },
  { id: 11, name: 'Монтажна стрічка 10 м', code: '000002210', codebox: '', price: 180, pricebox: 0, stock: 120 },
  { id: 12, name: 'Датчик температури підлоги 3 м', code: '000002230', codebox: '', price: 390, pricebox: 0, stock: 44 },
];

/** Demo: the catalogue above, lines and orders in memory, order numbers from 90001. */
export function createDemoDealOrders(): DealOrdersBackend {
  const lines = new Map<string, DealLine[]>();
  const locked = new Set<string>();
  const orders = new Map<string, DealOrder[]>();
  let next = 90001;
  const state = (dealId: string, fallbackValue = 0): DealLinesState => {
    const current = lines.get(dealId) ?? [];
    return { lines: current, locked: locked.has(dealId), value: current.length ? Math.round(current.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100 : fallbackValue };
  };
  return {
    search: async (query) => {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      return DEMO_CATALOGUE.filter((product) => words.every((word) => `${product.name} ${product.code} ${product.codebox}`.toLowerCase().includes(word))).slice(0, 20);
    },
    lines: async (dealId) => state(dealId),
    saveLines: async (dealId, input) => {
      if (locked.has(dealId)) throw new Error('DEAL_ORDER_LOCKED');
      lines.set(dealId, input.map((line) => {
        const product = DEMO_CATALOGUE.find((item) => item.id === line.bpiProductId)!;
        const cataloguePrice = line.byBox ? product.pricebox || product.price : product.price;
        const unitPrice = Math.round((line.unitPrice ?? cataloguePrice * (1 - (line.discountPercent ?? 0) / 100)) * 100) / 100;
        return { bpiProductId: product.id, name: product.name, code: line.byBox ? product.codebox || product.code : product.code, byBox: line.byBox, quantity: line.quantity, cataloguePrice, unitPrice, lineTotal: Math.round(unitPrice * line.quantity * 100) / 100 };
      }));
      return state(dealId);
    },
    orders: async (dealId) => orders.get(dealId) ?? [],
    createOrder: async (dealId) => {
      const previous = (orders.get(dealId) ?? []).find((order) => order.status === 'SENT');
      const order: DealOrder = { id: crypto.randomUUID(), bpiOrderId: next++, replacesOrderId: previous?.bpiOrderId ?? null, status: 'SENT', attempts: 1, lastError: null,
        sentBy: sessionStore.get()?.user.id ?? null, sentByName: sessionStore.get()?.user.fullName ?? null, createdAt: new Date().toISOString(), sentAt: new Date().toISOString() };
      orders.set(dealId, [order, ...(orders.get(dealId) ?? [])]);
      locked.add(dealId);
      return order;
    },
    unlock: async (dealId) => { locked.delete(dealId); },
    retry: async (dealId, orderId) => (orders.get(dealId) ?? []).find((order) => order.id === orderId)!,
  };
}

let demo: DealOrdersBackend | null = null;
export const dealOrdersBackend = (): DealOrdersBackend => {
  if (!sessionStore.get()?.accessToken.startsWith('demo-')) return remoteDealOrders;
  demo ??= createDemoDealOrders();
  return demo;
};
export const resetDemoDealOrders = (): void => { demo = null; };

/** A line's discount from its catalogue price, in whole percent (0 when the price wasn't lowered). */
export const discountOf = (line: Pick<DealLine, 'cataloguePrice' | 'unitPrice'>): number =>
  line.cataloguePrice > 0 && line.unitPrice < line.cataloguePrice ? Math.round((1 - line.unitPrice / line.cataloguePrice) * 1000) / 10 : 0;
