import { api, apiRequest } from './api';
import type { Client, Deal, User } from '../types';

export type ContactStatus = 'ACTIVE' | 'BLOCKED' | 'UNVERIFIED';
export type ContactFilter = 'mine' | 'unassigned' | 'all';
export interface TelegramContact {
  id: string; telegramUserId: string; username: string | null; firstName: string | null; lastName: string | null; displayName: string;
  status: ContactStatus; boundVia: string | null; lastMessageAt: string | null; createdAt: string; unread: number;
  client: { id: string; name: string; companyName: string | null } | null; responsible: { id: string; fullName: string } | null;
  lastMessage: { text: string | null; direction: 'IN' | 'OUT'; createdAt: string } | null; deals: Array<{ id: string; title: string }>;
}
export interface TelegramMessage {
  id: string; direction: 'IN' | 'OUT'; text: string | null; kind: string; summary: string | null; fileName: string | null; mimeType: string | null; fileSize: number | null;
  fileReady: boolean; fileTooLarge: boolean; status: 'RECEIVED' | 'SENDING' | 'SENT' | 'FAILED'; error: string | null; editedAt: string | null; createdAt: string;
  replyToId: string | null; sentBy: { id: string; fullName: string } | null;
}
export interface TelegramStatus {
  configured: boolean; botUsername: string | null; mode?: string; lastUpdateAt?: string | null; lastError?: string | null;
  greetingText?: string | null; welcomeText?: string | null; defaultResponsibleId?: string | null;
}
export interface ImportRow { line: number; telegramId: string; name: string | null; status: 'NEW' | 'UPDATE' | 'UNCHANGED' | 'ERROR'; error: string | null; clientName: string | null; responsibleName: string | null }
export interface ImportPreview { id: string; rows: ImportRow[]; summary: { new: number; update: number; unchanged: number; error: number } }

export interface TelegramBackend {
  status(): Promise<TelegramStatus>;
  updateSettings(patch: { greetingText?: string; welcomeText?: string; defaultResponsibleId?: string | null }): Promise<void>;
  checkConnection(): Promise<{ botUsername: string; mode: string; url: string | null; pendingUpdates: number; lastError: string | null }>;
  contacts(filter: ContactFilter, q?: string): Promise<TelegramContact[]>;
  contact(id: string): Promise<TelegramContact>;
  messages(id: string, before?: string): Promise<{ items: TelegramMessage[]; hasMore: boolean }>;
  send(id: string, input: { text: string; file?: File | null; replyToId?: string | null }): Promise<TelegramMessage>;
  read(id: string): Promise<void>;
  update(id: string, patch: { clientId?: string | null; responsibleId?: string | null }): Promise<TelegramContact>;
  createClient(id: string, input: { name: string; companyName?: string; phone?: string }): Promise<{ clientId: string }>;
  createDeal(id: string, input: { funnelId: string; title: string; value: number }): Promise<{ dealId: string }>;
  remove(id: string): Promise<void>;
  previewImport(csv: string): Promise<ImportPreview>;
  applyImport(previewId: string): Promise<{ applied: number; rejected: number; unchanged: number }>;
  invite(clientId: string): Promise<{ url: string; expiresAt: string }>;
  unread(): Promise<number>;
  download(messageId: string): Promise<Blob>;
  history(contactId: string): Promise<{ id: string; title: string; responsible: { id: string; fullName: string } | null; messages: TelegramMessage[] }>;
}

export const remoteTelegram: TelegramBackend = {
  status: () => apiRequest('/telegram/status'),
  updateSettings: async (patch) => { await apiRequest('/telegram/settings', { method: 'PATCH', body: patch }); },
  checkConnection: () => apiRequest('/telegram/webhook/check', { method: 'POST' }),
  contacts: (filter, q) => apiRequest(`/telegram/contacts?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ''}&limit=100`),
  contact: (id) => apiRequest(`/telegram/contacts/${id}`),
  messages: async (id, before) => {
    const page = await apiRequest<{ data: TelegramMessage[]; meta: { hasMore: boolean } }>(`/telegram/contacts/${id}/messages${before ? `?before=${before}` : ''}`, { envelope: true });
    return { items: page.data, hasMore: page.meta.hasMore };
  },
  send: (id, input) => {
    const form = new FormData();
    form.set('text', input.text);
    if (input.file) form.set('file', input.file);
    if (input.replyToId) form.set('replyToId', input.replyToId);
    return apiRequest(`/telegram/contacts/${id}/messages`, { method: 'POST', body: form });
  },
  read: async (id) => { await apiRequest(`/telegram/contacts/${id}/read`, { method: 'POST' }); },
  update: (id, patch) => apiRequest(`/telegram/contacts/${id}`, { method: 'PATCH', body: patch }),
  createClient: (id, input) => apiRequest(`/telegram/contacts/${id}/client`, { method: 'POST', body: input }),
  createDeal: (id, input) => apiRequest(`/telegram/contacts/${id}/deal`, { method: 'POST', body: input }),
  remove: (id) => apiRequest(`/telegram/contacts/${id}`, { method: 'DELETE' }),
  previewImport: (csv) => apiRequest('/telegram/import/preview', { method: 'POST', body: { csv } }),
  applyImport: (previewId) => apiRequest(`/telegram/import/${previewId}/apply`, { method: 'POST' }),
  invite: (clientId) => apiRequest(`/clients/${clientId}/telegram-invite`, { method: 'POST' }),
  unread: async () => (await apiRequest<{ unread: number }>('/telegram/unread')).unread,
  download: (messageId) => api.download(`/telegram/files/${messageId}`),
  history: (contactId) => apiRequest(`/communications/telegram/${contactId}`),
};

export const statusLabel: Record<ContactStatus, string | null> = { ACTIVE: null, BLOCKED: 'Заблокировал бота', UNVERIFIED: 'Не подтверждён' };

// ---------------------------------------------------------------------------
// Demo backend with the server's access and routing rules.

export class TelegramError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

interface DemoContact extends Omit<TelegramContact, 'unread' | 'lastMessage' | 'client' | 'responsible' | 'deals'> { clientId: string | null; responsibleId: string | null; dealIds: string[] }
interface DemoStore { contacts: DemoContact[]; messages: Array<TelegramMessage & { contactId: string }>; reads: Map<string, string>; settings: Required<Omit<TelegramStatus, 'mode'>> & { mode: string } }
let shared: DemoStore | null = null;
export function resetDemoTelegram(): void { shared = null; }
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function store(): DemoStore {
  if (shared) return shared;
  const contact = (id: string, firstName: string, username: string | null, clientId: string | null, responsibleId: string | null, status: ContactStatus, lastMinutes: number | null): DemoContact => ({
    id, telegramUserId: String(100000000 + Number(id.replace(/\D/g, ''))), username, firstName, lastName: null, displayName: firstName, status, boundVia: clientId ? 'INVITE' : null,
    lastMessageAt: lastMinutes === null ? null : minutesAgo(lastMinutes), createdAt: minutesAgo(60 * 24 * 7), clientId, responsibleId, dealIds: [],
  });
  const message = (contactId: string, direction: 'IN' | 'OUT', text: string, minutes: number, sentBy: { id: string; fullName: string } | null = null, extra: Partial<TelegramMessage> = {}) => ({
    id: crypto.randomUUID(), contactId, direction, text, kind: 'TEXT', summary: null, fileName: null, mimeType: null, fileSize: null, fileReady: false, fileTooLarge: false,
    status: direction === 'IN' ? 'RECEIVED' as const : 'SENT' as const, error: null, editedAt: null, createdAt: minutesAgo(minutes), replyToId: null, sentBy, ...extra,
  });
  const anna = { id: 'u3', fullName: 'Анна Петрова' };
  shared = {
    contacts: [
      { ...contact('tg1', 'София Тёрнер', 'sofia_turner', 'c1', 'u3', 'ACTIVE', 40), dealIds: ['d1'] },
      contact('tg2', 'Олена', 'olena_shop', null, null, 'ACTIVE', 20),
      contact('tg3', 'Ной Уильямс', null, 'c2', 'u4', 'UNVERIFIED', null),
      contact('tg4', 'Игорь', 'ex_customer', null, 'u3', 'BLOCKED', 60 * 24 * 10),
    ],
    messages: [
      message('tg1', 'IN', 'Добрый день! Когда сможете прислать счёт на 40 мест?', 120),
      message('tg1', 'OUT', 'Здравствуйте, София! Счёт пришлю сегодня до 17:00.', 90, anna),
      message('tg1', 'IN', '', 60, null, { kind: 'PHOTO', summary: 'Фото', text: 'Реквизиты для счёта', fileName: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 84_000, fileReady: true }),
      message('tg1', 'IN', 'Отлично, спасибо!', 40),
      message('tg2', 'OUT', 'Здравствуйте! Напишите ваш вопрос — менеджер ответит вам здесь.', 21),
      message('tg2', 'IN', 'Здравствуйте, сколько стоит доставка в Днепр?', 20),
      message('tg4', 'IN', 'Больше не пишите мне', 60 * 24 * 10),
    ],
    reads: new Map(),
    settings: { configured: true, botUsername: 'atlas_demo_bot', mode: 'webhook', lastUpdateAt: minutesAgo(20), lastError: null,
      greetingText: 'Здравствуйте! Напишите ваш вопрос — менеджер ответит вам здесь.', welcomeText: 'Спасибо! Теперь ваш менеджер будет отвечать вам в этом чате.', defaultResponsibleId: null },
  };
  return shared;
}

export function createDemoTelegram(me: User, users: User[], clients: Client[], deals: Deal[], addClient: (client: Omit<Client, 'id' | 'updatedAt'>) => Promise<Client>, addDeal: (deal: Omit<Deal, 'id'>) => Promise<void>): TelegramBackend {
  const data = store();
  const userOf = (id: string | null) => users.find((user) => user.id === id);
  const visible = (contact: DemoContact) => me.role === 'DIRECTOR' || contact.responsibleId === me.id
    || (me.role === 'MANAGER' && (!contact.responsibleId || userOf(contact.responsibleId)?.departmentId === me.departmentId));
  const find = (id: string) => {
    const contact = data.contacts.find((item) => item.id === id);
    if (!contact || !visible(contact)) throw new TelegramError('TELEGRAM_CONTACT_NOT_FOUND', 'Переписка недоступна');
    return contact;
  };
  const view = (contact: DemoContact): TelegramContact => {
    const rows = data.messages.filter((item) => item.contactId === contact.id);
    const readAt = data.reads.get(`${contact.id}:${me.id}`) ?? '';
    const client = clients.find((item) => item.id === contact.clientId);
    const responsible = userOf(contact.responsibleId);
    const last = rows.at(-1);
    return {
      ...contact, unread: rows.filter((item) => item.direction === 'IN' && item.createdAt > readAt).length,
      client: client ? { id: client.id, name: client.name, companyName: client.companyName } : contact.clientId ? { id: contact.clientId, name: 'Клиент', companyName: null } : null,
      responsible: responsible ? { id: responsible.id, fullName: responsible.fullName } : null,
      lastMessage: last ? { text: last.text || last.summary, direction: last.direction, createdAt: last.createdAt } : null,
      deals: contact.dealIds.map((id) => ({ id, title: deals.find((deal) => deal.id === id)?.title ?? 'Сделка' })),
    };
  };
  const copy = <T,>(value: T): T => structuredClone(value);
  return {
    status: async () => me.role === 'DIRECTOR' ? copy(data.settings) : { configured: data.settings.configured, botUsername: data.settings.botUsername },
    updateSettings: async (patch) => {
      if (me.role !== 'DIRECTOR') throw new TelegramError('TELEGRAM_FORBIDDEN', 'Настройки бота меняет директор');
      Object.assign(data.settings, Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)));
    },
    checkConnection: async () => ({ botUsername: 'atlas_demo_bot', mode: 'webhook', url: 'https://atlas.example/api/telegram/webhook', pendingUpdates: 0, lastError: null }),
    contacts: async (filter, q) => copy(data.contacts.filter(visible)
      .filter((item) => filter === 'all' || (filter === 'mine' ? item.responsibleId === me.id : !item.responsibleId))
      .filter((item) => !q || `${item.displayName} ${item.username ?? ''}`.toLowerCase().includes(q.toLowerCase()))
      .map(view).sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))),
    contact: async (id) => copy(view(find(id))),
    messages: async (id) => { find(id); return { items: copy(data.messages.filter((item) => item.contactId === id)), hasMore: false }; },
    send: async (id, input) => {
      const contact = find(id);
      if (contact.status === 'BLOCKED') throw new TelegramError('TELEGRAM_CONTACT_BLOCKED', 'Клиент заблокировал бота');
      if (contact.status === 'UNVERIFIED') throw new TelegramError('TELEGRAM_CONTACT_UNREACHABLE', 'Клиент ещё не писал этому боту');
      const message = { id: crypto.randomUUID(), contactId: id, direction: 'OUT' as const, text: input.text || null, kind: input.file ? 'DOCUMENT' : 'TEXT', summary: null,
        fileName: input.file?.name ?? null, mimeType: input.file?.type ?? null, fileSize: input.file?.size ?? null, fileReady: Boolean(input.file), fileTooLarge: false,
        status: 'SENT' as const, error: null, editedAt: null, createdAt: new Date().toISOString(), replyToId: input.replyToId ?? null, sentBy: { id: me.id, fullName: me.fullName } };
      data.messages.push(message);
      contact.lastMessageAt = message.createdAt;
      data.reads.set(`${id}:${me.id}`, message.createdAt);
      return copy(message);
    },
    read: async (id) => { find(id); data.reads.set(`${id}:${me.id}`, new Date().toISOString()); },
    update: async (id, patch) => {
      const contact = find(id);
      if (patch.clientId && !clients.some((client) => client.id === patch.clientId)) throw new TelegramError('CLIENT_NOT_FOUND', 'Клиент недоступен');
      if (patch.responsibleId !== undefined && patch.responsibleId !== contact.responsibleId) {
        if (me.role === 'EMPLOYEE') throw new TelegramError('TELEGRAM_FORBIDDEN', 'Переназначать переписку могут директор и руководитель отдела');
        const target = userOf(patch.responsibleId ?? null);
        if (me.role === 'MANAGER' && patch.responsibleId && target?.departmentId !== me.departmentId) throw new TelegramError('TELEGRAM_FORBIDDEN', 'Руководитель назначает только сотрудников своего отдела');
        contact.responsibleId = patch.responsibleId ?? null;
      }
      if (patch.clientId !== undefined) { contact.clientId = patch.clientId; contact.boundVia = patch.clientId ? 'TRIAGE' : contact.boundVia; }
      return copy(view(contact));
    },
    createClient: async (id, input) => {
      const contact = find(id);
      const client = await addClient({ name: input.name, companyName: input.companyName || input.name, email: '', phone: input.phone ?? '', source: 'Telegram', status: 'NEW', ownerId: me.id, ownerName: me.fullName, notes: '' });
      contact.clientId = client.id; contact.responsibleId ??= me.id;
      return { clientId: client.id };
    },
    createDeal: async (id, input) => {
      const contact = find(id);
      if (!contact.clientId) throw new TelegramError('CLIENT_REQUIRED', 'Сначала привяжите переписку к клиенту');
      const client = clients.find((item) => item.id === contact.clientId);
      await addDeal({ clientId: contact.clientId, title: input.title, companyName: client?.companyName ?? '', ownerId: me.id, ownerName: me.fullName, funnelId: input.funnelId,
        stage: { id: '', name: '', color: '#6B7280', outcome: 'OPEN' }, value: input.value, currency: 'UAH', probability: 20, expectedCloseAt: new Date(Date.now() + 30 * 86_400_000).toISOString() });
      const dealId = crypto.randomUUID();
      contact.dealIds.push(dealId);
      return { dealId };
    },
    remove: async (id) => {
      if (me.role !== 'DIRECTOR') throw new TelegramError('TELEGRAM_FORBIDDEN', 'Удалять переписку может директор');
      find(id);
      data.contacts = data.contacts.filter((item) => item.id !== id);
      data.messages = data.messages.filter((item) => item.contactId !== id);
    },
    previewImport: async (csv) => {
      if (me.role === 'EMPLOYEE') throw new TelegramError('TELEGRAM_FORBIDDEN', 'Импортировать контакты могут директор и руководители отделов');
      const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
      const header = lines.shift()?.toLowerCase().split(/[;,]/).map((item) => item.trim()) ?? [];
      if (!header.includes('telegram_id')) throw new TelegramError('TELEGRAM_IMPORT_INVALID', 'В файле нет колонки telegram_id');
      const seen = new Set<string>();
      const rows: ImportRow[] = lines.map((line, index) => {
        const cells = line.split(/[;,]/).map((item) => item.trim());
        const get = (name: string) => cells[header.indexOf(name)] || null;
        const telegramId = get('telegram_id') ?? '';
        const base = { line: index + 2, telegramId, name: get('name'), clientName: null, responsibleName: null };
        if (!/^[1-9]\d{0,14}$/.test(telegramId)) return { ...base, status: 'ERROR', error: 'Неверный Telegram ID' };
        if (seen.has(telegramId)) return { ...base, status: 'ERROR', error: 'Повтор строки' };
        seen.add(telegramId);
        const email = get('client_email');
        const client = email ? clients.find((item) => item.email.toLowerCase() === email.toLowerCase()) : undefined;
        if (email && !client) return { ...base, status: 'ERROR', error: 'Клиент не найден' };
        return { ...base, status: data.contacts.some((item) => item.telegramUserId === telegramId) ? 'UPDATE' : 'NEW', error: null, clientName: client?.companyName ?? null, responsibleName: client?.ownerName ?? null };
      });
      const count = (status: ImportRow['status']) => rows.filter((row) => row.status === status).length;
      demoPreviews.set('preview', rows);
      return { id: 'preview', rows, summary: { new: count('NEW'), update: count('UPDATE'), unchanged: count('UNCHANGED'), error: count('ERROR') } };
    },
    applyImport: async () => {
      const rows = demoPreviews.get('preview') ?? [];
      for (const row of rows.filter((item) => item.status === 'NEW')) {
        data.contacts.push({ id: crypto.randomUUID(), telegramUserId: row.telegramId, username: null, firstName: row.name, lastName: null, displayName: row.name ?? `Telegram ${row.telegramId}`,
          status: 'UNVERIFIED', boundVia: 'IMPORT', lastMessageAt: null, createdAt: new Date().toISOString(), clientId: null, responsibleId: me.role === 'DIRECTOR' ? null : me.id, dealIds: [] });
      }
      return { applied: rows.filter((row) => row.status === 'NEW' || row.status === 'UPDATE').length, rejected: rows.filter((row) => row.status === 'ERROR').length, unchanged: 0 };
    },
    invite: async (clientId) => {
      if (!clients.some((client) => client.id === clientId)) throw new TelegramError('CLIENT_NOT_FOUND', 'Клиент недоступен');
      return { url: `https://t.me/atlas_demo_bot?start=${crypto.randomUUID().replace(/-/g, '')}`, expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() };
    },
    unread: async () => data.contacts.filter(visible).filter((item) => item.responsibleId === me.id || (!item.responsibleId && me.role !== 'EMPLOYEE'))
      .reduce((sum, item) => sum + view(item).unread, 0),
    download: async (messageId) => new Blob([`Демо-файл ${messageId}`]),
    history: async (contactId) => {
      const contact = data.contacts.find((item) => item.id === contactId);
      if (!contact || !(visible(contact) || clients.some((client) => client.id === contact.clientId))) throw new TelegramError('TELEGRAM_CONTACT_NOT_FOUND', 'Переписка недоступна');
      const responsible = userOf(contact.responsibleId);
      return copy({ id: contact.id, title: contact.displayName, responsible: responsible ? { id: responsible.id, fullName: responsible.fullName } : null,
        messages: data.messages.filter((item) => item.contactId === contactId) });
    },
  };
}
const demoPreviews = new Map<string, ImportRow[]>();
