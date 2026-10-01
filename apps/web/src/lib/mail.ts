import { api, apiRequest } from './api';
import type { Client, Deal, User } from '../types';

export type MailProvider = 'IMAP' | 'GOOGLE' | 'MICROSOFT';
export type Security = 'SSL' | 'STARTTLS';
export type SpecialUse = 'INBOX' | 'SENT' | 'DRAFTS' | 'ARCHIVE' | 'JUNK' | 'TRASH' | 'ALL';
export type MailAction = 'read' | 'unread' | 'star' | 'unstar' | 'move' | 'archive' | 'spam' | 'trash' | 'delete';
export type DraftMode = 'NEW' | 'REPLY' | 'REPLY_ALL' | 'FORWARD';

export interface Address { address: string; name?: string }
export interface MailAccount {
  id: string; provider: MailProvider; email: string; displayName: string | null; imapHost: string; imapPort: number; imapSecurity: Security;
  smtpHost: string; smtpPort: number; smtpSecurity: Security; username: string; signature: string | null;
  status: 'CONNECTED' | 'NEEDS_ATTENTION'; statusReason: string | null; lastSyncedAt: string | null; unread: number; demo?: boolean;
}
export interface MailFolder { id: string; path: string; name: string; specialUse: SpecialUse | null; total: number; unread: number }
export interface LinkedClient { id: string; name: string; companyName: string | null }
export interface MailThread {
  id: string; accountId: string; mailboxEmail: string; subject: string; lastMessageAt: string; messageCount: number; unreadCount: number;
  hasAttachments: boolean; participants: string[]; snippet: string | null; flagged: boolean; correspondents: string | null; sendFailed?: boolean;
  client: LinkedClient | null; deal: { id: string; title: string } | null; linkSource: 'AUTO' | 'MANUAL' | null;
}
export interface MailAttachment { id: string; filename: string; contentType: string; size: number }
export interface MailMessage {
  id: string; fromAddress: string; fromName: string | null; to: Address[]; cc: Address[]; bcc: Address[]; replyTo: Address[]; subject: string;
  snippet: string; text: string | null; html: string | null; hasRemoteImages: boolean; sentAt: string; seen: boolean; flagged: boolean;
  sendStatus: 'SENDING' | 'SENT' | 'FAILED' | null; sendError: string | null; messageIdHeader: string | null;
  folderId: string | null; folderName: string | null; folderSpecialUse: SpecialUse | null; attachments: MailAttachment[];
}
export interface ThreadDetail extends MailThread { messages: MailMessage[]; linkSuggestions: Array<{ id: string; name: string; companyName: string | null; email: string | null }> }
export interface DraftAttachment { id: string; filename: string; contentType: string; size: number; forwardedId?: string }
export interface MailDraft {
  id: string; accountId: string; mode: DraftMode; sourceMessageId: string | null; to: Address[]; cc: Address[]; bcc: Address[];
  subject: string; html: string; attachments: DraftAttachment[]; clientId: string | null; dealId: string | null; updatedAt: string;
}
export interface DraftInput {
  accountId: string; mode?: DraftMode; sourceMessageId?: string | null; to?: Address[]; cc?: Address[]; bcc?: Address[]; subject?: string; html?: string;
  forwardAttachmentIds?: string[]; clientId?: string | null; dealId?: string | null;
}
export interface ImapAccountInput {
  email: string; displayName?: string | null; imap: { host: string; port: number; security: Security }; smtp: { host: string; port: number; security: Security };
  username: string; password: string; signature?: string | null;
}
export interface CommunicationEntry {
  channel: 'EMAIL' | 'TELEGRAM'; id: string; title: string; participants: string[]; lastActivityAt: string; messageCount: number;
  owner: { id: string; fullName: string } | null; snippet: string | null;
}
export interface CommunicationThread { id: string; subject: string; mailboxEmail: string; owner: { id: string; fullName: string }; messages: MailMessage[] }
export interface ThreadFilter { accountId?: string; folderId?: string; q?: string; starred?: boolean; offset?: number }

export interface MailBackend {
  providers(): Promise<{ imap: boolean; google: boolean; microsoft: boolean }>;
  accounts(): Promise<MailAccount[]>;
  testAccount(input: ImapAccountInput): Promise<void>;
  addAccount(input: ImapAccountInput): Promise<MailAccount>;
  updateAccount(id: string, patch: Partial<ImapAccountInput>): Promise<MailAccount>;
  removeAccount(id: string): Promise<void>;
  sync(id: string): Promise<void>;
  oauthStart(provider: 'google' | 'microsoft', loginHint?: string): Promise<string>;
  oauthComplete(provider: 'google' | 'microsoft', code: string, state: string): Promise<MailAccount>;
  folders(accountId: string): Promise<MailFolder[]>;
  threads(filter: ThreadFilter): Promise<{ items: MailThread[]; hasMore: boolean }>;
  thread(id: string): Promise<ThreadDetail>;
  showImages(messageId: string): Promise<string>;
  act(input: { threadIds?: string[]; messageIds?: string[]; fromFolderId?: string; action: MailAction; folderId?: string }): Promise<void>;
  drafts(): Promise<MailDraft[]>;
  createDraft(input: DraftInput): Promise<MailDraft>;
  updateDraft(id: string, patch: Partial<DraftInput>): Promise<MailDraft>;
  deleteDraft(id: string): Promise<void>;
  draftFromMessage(messageId: string): Promise<MailDraft>;
  attach(draftId: string, files: File[]): Promise<MailDraft>;
  detach(draftId: string, attachmentId: string): Promise<void>;
  send(draftId: string): Promise<{ threadId: string }>;
  link(threadId: string, link: { clientId?: string | null; dealId?: string | null }): Promise<void>;
  createClientFrom(threadId: string, input: { name: string; companyName?: string; email?: string }): Promise<{ clientId: string }>;
  createDealFrom(threadId: string, input: { funnelId: string; title: string; value: number; clientId?: string }): Promise<{ dealId: string }>;
  suggest(q: string): Promise<Array<{ address: string; name: string | null; source: 'client' | 'mail' }>>;
  unread(): Promise<number>;
  download(attachmentId: string): Promise<Blob>;
  clientHistory(clientId: string): Promise<CommunicationEntry[]>;
  dealHistory(dealId: string): Promise<CommunicationEntry[]>;
  historyThread(threadId: string): Promise<CommunicationThread>;
}

export const remoteMail: MailBackend = {
  providers: () => apiRequest('/mail/providers'),
  accounts: () => apiRequest('/mail/accounts'),
  testAccount: async (input) => { await apiRequest('/mail/accounts/test', { method: 'POST', body: input }); },
  addAccount: (input) => apiRequest('/mail/accounts', { method: 'POST', body: input }),
  updateAccount: (id, patch) => apiRequest(`/mail/accounts/${id}`, { method: 'PATCH', body: patch }),
  removeAccount: (id) => apiRequest(`/mail/accounts/${id}`, { method: 'DELETE' }),
  sync: async (id) => { await apiRequest(`/mail/accounts/${id}/sync`, { method: 'POST' }); },
  oauthStart: async (provider, loginHint) => (await apiRequest<{ url: string }>(`/mail/oauth/${provider}/start${loginHint ? `?loginHint=${encodeURIComponent(loginHint)}` : ''}`)).url,
  oauthComplete: (provider, code, state) => apiRequest(`/mail/oauth/${provider}/complete`, { method: 'POST', body: { code, state } }),
  folders: (accountId) => apiRequest(`/mail/accounts/${accountId}/folders`),
  threads: async (filter) => {
    const params = new URLSearchParams();
    Object.entries(filter).forEach(([key, value]) => { if (value !== undefined && value !== '' && value !== false) params.set(key, String(value)); });
    const page = await apiRequest<{ data: MailThread[]; meta: { hasMore: boolean } }>(`/mail/threads?${params}`, { envelope: true });
    return { items: page.data, hasMore: page.meta.hasMore };
  },
  thread: (id) => apiRequest(`/mail/threads/${id}`),
  showImages: async (messageId) => (await apiRequest<{ html: string }>(`/mail/messages/${messageId}/show-images`, { method: 'POST' })).html,
  act: async (input) => { await apiRequest('/mail/actions', { method: 'POST', body: input }); },
  drafts: () => apiRequest('/mail/drafts'),
  createDraft: (input) => apiRequest('/mail/drafts', { method: 'POST', body: input }),
  updateDraft: (id, patch) => apiRequest(`/mail/drafts/${id}`, { method: 'PATCH', body: patch }),
  deleteDraft: (id) => apiRequest(`/mail/drafts/${id}`, { method: 'DELETE' }),
  draftFromMessage: (messageId) => apiRequest(`/mail/drafts/from-message/${messageId}`, { method: 'POST' }),
  attach: (draftId, files) => { const form = new FormData(); files.forEach((file) => form.append('files', file)); return apiRequest(`/mail/drafts/${draftId}/attachments`, { method: 'POST', body: form }); },
  detach: (draftId, attachmentId) => apiRequest(`/mail/drafts/${draftId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  send: (draftId) => apiRequest('/mail/send', { method: 'POST', body: { draftId } }),
  link: async (threadId, link) => { await apiRequest(`/mail/threads/${threadId}/link`, { method: 'PATCH', body: link }); },
  createClientFrom: (threadId, input) => apiRequest(`/mail/threads/${threadId}/client`, { method: 'POST', body: input }),
  createDealFrom: (threadId, input) => apiRequest(`/mail/threads/${threadId}/deal`, { method: 'POST', body: input }),
  suggest: (q) => apiRequest(`/mail/suggest?q=${encodeURIComponent(q)}`),
  unread: async () => (await apiRequest<{ unread: number }>('/mail/unread')).unread,
  download: (attachmentId) => api.download(`/mail/attachments/${attachmentId}`),
  clientHistory: (clientId) => apiRequest(`/clients/${clientId}/communications`),
  dealHistory: (dealId) => apiRequest(`/deals/${dealId}/communications`),
  historyThread: (threadId) => apiRequest(`/communications/mail/${threadId}`),
};

// ---------------------------------------------------------------------------
// Helpers

export const folderOrder: SpecialUse[] = ['INBOX', 'SENT', 'DRAFTS', 'ARCHIVE', 'JUNK', 'TRASH', 'ALL'];
export const displayAddress = (item: Address): string => item.name ? `${item.name} <${item.address}>` : item.address;
export const senderName = (message: Pick<MailMessage, 'fromName' | 'fromAddress'>): string => message.fromName || message.fromAddress;

const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const replyPrefixed = (subject: string) => /^\s*(re|ответ)\s*:/i.test(subject) ? subject : `Re: ${subject}`;
const forwardPrefixed = (subject: string) => /^\s*(fwd?|пересл)\s*:/i.test(subject) ? subject : `Fwd: ${subject}`;

/** Recipients, subject and quoted body for reply, reply all and forward, never including the mailbox itself. */
export function replyDraft(message: MailMessage, mode: Exclude<DraftMode, 'NEW'>, mailboxEmail: string): { to: Address[]; cc: Address[]; subject: string; html: string } {
  const me = mailboxEmail.toLowerCase();
  const fromMe = message.fromAddress.toLowerCase() === me;
  const sender: Address = { address: message.fromAddress, name: message.fromName ?? undefined };
  const replyTarget = message.replyTo.length ? message.replyTo : fromMe ? message.to : [sender];
  const unique = (list: Address[], exclude: Set<string>) => list.filter((item) => {
    const key = item.address.toLowerCase();
    if (key === me || exclude.has(key)) return false;
    exclude.add(key);
    return true;
  });
  const quoted = `<p></p><blockquote>${message.html ?? escapeHtml(message.text ?? '').replace(/\n/g, '<br>')}</blockquote>`;
  const header = `<p>${escapeHtml(new Date(message.sentAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}, ${escapeHtml(senderName(message))}:</p>`;
  if (mode === 'FORWARD') {
    return { to: [], cc: [], subject: forwardPrefixed(message.subject), html: `<p></p><p>---------- Пересланное сообщение ----------</p>${header}${quoted}` };
  }
  const seen = new Set<string>();
  const to = unique(replyTarget, seen);
  const cc = mode === 'REPLY_ALL' ? unique([...message.to, ...message.cc], seen) : [];
  return { to, cc, subject: replyPrefixed(message.subject), html: `${header}${quoted}` };
}

/** Parses "Name <a@b.c>, d@e.f" into addresses; invalid entries are returned separately. */
export function parseAddresses(value: string): { valid: Address[]; invalid: string[] } {
  const valid: Address[] = [];
  const invalid: string[] = [];
  for (const raw of value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean)) {
    const match = /^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/.exec(raw);
    const address = (match ? match[2]! : raw).trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) valid.push({ address, name: match?.[1]?.trim() || undefined });
    else invalid.push(raw);
  }
  return { valid, invalid };
}

/** Well-known IMAP/SMTP settings by email domain, so most people only type their address and password. */
export function presetFor(email: string): Pick<ImapAccountInput, 'imap' | 'smtp'> | null {
  const domain = email.split('@')[1]?.toLowerCase();
  const presets: Record<string, Pick<ImapAccountInput, 'imap' | 'smtp'>> = {
    'gmail.com': { imap: { host: 'imap.gmail.com', port: 993, security: 'SSL' }, smtp: { host: 'smtp.gmail.com', port: 465, security: 'SSL' } },
    'outlook.com': { imap: { host: 'outlook.office365.com', port: 993, security: 'SSL' }, smtp: { host: 'smtp.office365.com', port: 587, security: 'STARTTLS' } },
    'hotmail.com': { imap: { host: 'outlook.office365.com', port: 993, security: 'SSL' }, smtp: { host: 'smtp.office365.com', port: 587, security: 'STARTTLS' } },
    'ukr.net': { imap: { host: 'imap.ukr.net', port: 993, security: 'SSL' }, smtp: { host: 'smtp.ukr.net', port: 465, security: 'SSL' } },
    'i.ua': { imap: { host: 'imap.i.ua', port: 993, security: 'SSL' }, smtp: { host: 'smtp.i.ua', port: 465, security: 'SSL' } },
    'meta.ua': { imap: { host: 'imap.meta.ua', port: 993, security: 'SSL' }, smtp: { host: 'smtp.meta.ua', port: 465, security: 'SSL' } },
    'yahoo.com': { imap: { host: 'imap.mail.yahoo.com', port: 993, security: 'SSL' }, smtp: { host: 'smtp.mail.yahoo.com', port: 465, security: 'SSL' } },
    'icloud.com': { imap: { host: 'imap.mail.me.com', port: 993, security: 'SSL' }, smtp: { host: 'smtp.mail.me.com', port: 587, security: 'STARTTLS' } },
  };
  if (!domain) return null;
  return presets[domain] ?? { imap: { host: `imap.${domain}`, port: 993, security: 'SSL' }, smtp: { host: `smtp.${domain}`, port: 465, security: 'SSL' } };
}

// ---------------------------------------------------------------------------
// Demo backend: an in-memory mailbox with the server's privacy and linking rules.

export class MailError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

interface DemoStore {
  accounts: MailAccount[]; folders: Array<MailFolder & { accountId: string }>;
  threads: Array<MailThread & { ownerId: string; autolinkBlocked: boolean }>; messages: Array<MailMessage & { threadId: string }>;
  drafts: Array<MailDraft & { userId: string }>;
}
let shared: DemoStore | null = null;
export function resetDemoMail(): void { shared = null; }

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

function demoStore(): DemoStore {
  if (shared) return shared;
  const account: MailAccount = {
    id: 'mb-anna', provider: 'IMAP', email: 'anna@atlas.example', displayName: 'Анна Петрова', imapHost: 'imap.atlas.example', imapPort: 993, imapSecurity: 'SSL',
    smtpHost: 'smtp.atlas.example', smtpPort: 465, smtpSecurity: 'SSL', username: 'anna@atlas.example', signature: 'Анна Петрова\nАккаунт-менеджер', status: 'CONNECTED',
    statusReason: null, lastSyncedAt: hoursAgo(0.05), unread: 1, demo: true,
  };
  const folder = (id: string, path: string, name: string, specialUse: SpecialUse | null, total = 0, unread = 0) => ({ id, accountId: account.id, path, name, specialUse, total, unread });
  const folders = [folder('f-inbox', 'INBOX', 'Входящие', 'INBOX', 3, 1), folder('f-sent', 'Sent', 'Отправленные', 'SENT', 1), folder('f-drafts', 'Drafts', 'Черновики', 'DRAFTS'),
    folder('f-archive', 'Archive', 'Архив', 'ARCHIVE'), folder('f-junk', 'Junk', 'Спам', 'JUNK'), folder('f-trash', 'Trash', 'Корзина', 'TRASH'), folder('f-projects', 'Projects', 'Проекты', null)];
  const thread = (id: string, subject: string, correspondents: string, participants: string[], client: LinkedClient | null, extra: Partial<MailThread> = {}) => ({
    id, accountId: account.id, mailboxEmail: account.email, subject, lastMessageAt: hoursAgo(2), messageCount: 1, unreadCount: 0, hasAttachments: false, participants,
    snippet: null, flagged: false, correspondents, client, deal: null, linkSource: client ? 'AUTO' as const : null, ownerId: 'u3', autolinkBlocked: false, ...extra,
  });
  const message = (id: string, threadId: string, folderId: string, from: Address, to: Address[], subject: string, body: string, hours: number, extra: Partial<MailMessage> = {}): MailMessage & { threadId: string } => {
    const folderRow = folders.find((item) => item.id === folderId)!;
    return {
      id, threadId, fromAddress: from.address, fromName: from.name ?? null, to, cc: [], bcc: [], replyTo: [], subject, snippet: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140),
      text: body.replace(/<[^>]+>/g, '\n'), html: body, hasRemoteImages: false, sentAt: hoursAgo(hours), seen: true, flagged: false, sendStatus: null, sendError: null,
      messageIdHeader: `<${id}@demo>`, folderId, folderName: folderRow.name, folderSpecialUse: folderRow.specialUse, attachments: [], ...extra,
    };
  };
  const me: Address = { address: account.email, name: 'Анна Петрова' };
  const sofia: Address = { address: 'sofia@northstar.example', name: 'София Тёрнер' };
  const noah: Address = { address: 'noah@vertex.example', name: 'Ной Уильямс' };
  const threads = [
    thread('t-northstar', 'Расширение лицензий', 'София Тёрнер', [sofia.address], { id: 'c1', name: 'София Тёрнер', companyName: 'Northstar Labs' }, { unreadCount: 1, messageCount: 2, hasAttachments: true }),
    thread('t-vertex', 'Демонстрация продукта', 'Ной Уильямс', [noah.address], null, { lastMessageAt: hoursAgo(20) }),
    thread('t-webinar', 'Итоги вебинара', 'Atlas Events', ['events@example.com'], null, { lastMessageAt: hoursAgo(30) }),
  ];
  const messages = [
    message('mm1', 't-northstar', 'f-sent', me, [sofia], 'Расширение лицензий', '<p>София, добрый день!</p><p>Отправляю предложение по расширению на <b>40 мест</b>.</p>', 26),
    message('mm2', 't-northstar', 'f-inbox', sofia, [me], 'Re: Расширение лицензий', '<p>Спасибо! Согласуем с финансовым отделом до пятницы.</p><p>София</p>', 2,
      { seen: false, attachments: [{ id: 'att-1', filename: 'Реквизиты Northstar.pdf', contentType: 'application/pdf', size: 184_000 }] }),
    message('mm3', 't-vertex', 'f-inbox', noah, [me], 'Демонстрация продукта', '<p>Добрый день! Можно провести демонстрацию в четверг?</p>', 20),
    message('mm4', 't-webinar', 'f-inbox', { address: 'events@example.com', name: 'Atlas Events' }, [me], 'Итоги вебинара',
      '<p>Запись вебинара и презентация доступны по ссылке.</p><img data-remote-src="https://example.com/banner.png" alt="Баннер">', 30, { hasRemoteImages: true }),
  ];
  threads.forEach((item) => { const last = messages.filter((row) => row.threadId === item.id).at(-1); item.snippet = last?.snippet ?? null; });
  shared = { accounts: [account], folders, threads, messages, drafts: [] };
  return shared;
}

/** In-memory mail for demo sessions: only the demo employee owns a mailbox, as on the server. */
export function createDemoMail(me: User, clients: Client[], deals: Deal[], addClient: (client: Omit<Client, 'id' | 'updatedAt'>) => Promise<Client>, addDeal: (deal: Omit<Deal, 'id'>) => Promise<void>): MailBackend {
  const store = demoStore();
  const mine = () => store.accounts.filter(() => me.username === 'employee');
  const ownThread = (id: string) => {
    const found = store.threads.find((item) => item.id === id && item.ownerId === me.id);
    if (!found) throw new MailError('MAIL_NOT_FOUND', 'Переписка недоступна');
    return found;
  };
  const refresh = (threadId: string) => {
    const thread = store.threads.find((item) => item.id === threadId);
    if (!thread) return;
    const rows = store.messages.filter((item) => item.threadId === threadId);
    if (!rows.length && !thread.client) { store.threads = store.threads.filter((item) => item !== thread); return; }
    thread.messageCount = rows.length;
    thread.unreadCount = rows.filter((item) => !item.seen && !item.sendStatus).length;
    thread.flagged = rows.some((item) => item.flagged);
    thread.lastMessageAt = rows.at(-1)?.sentAt ?? thread.lastMessageAt;
    thread.snippet = rows.at(-1)?.snippet ?? thread.snippet;
    store.folders.forEach((folder) => { folder.unread = store.messages.filter((item) => item.folderId === folder.id && !item.seen).length; folder.total = store.messages.filter((item) => item.folderId === folder.id).length; });
    store.accounts.forEach((account) => { account.unread = store.folders.find((folder) => folder.specialUse === 'INBOX')?.unread ?? 0; });
  };
  const visibleClient = (id: string) => clients.some((client) => client.id === id);
  const historyFor = (threadIds: string[]): CommunicationEntry[] => store.threads.filter((item) => threadIds.includes(item.id) && item.messageCount > 0).map((item) => ({
    channel: 'EMAIL', id: item.id, title: item.subject, participants: item.participants, lastActivityAt: item.lastMessageAt, messageCount: item.messageCount,
    owner: { id: item.ownerId, fullName: 'Анна Петрова' }, snippet: item.snippet,
  }));
  const copy = <T,>(value: T): T => structuredClone(value);
  const draftOf = (id: string) => {
    const draft = store.drafts.find((item) => item.id === id && item.userId === me.id);
    if (!draft) throw new MailError('MAIL_NOT_FOUND', 'Черновик не найден');
    return draft;
  };

  return {
    providers: async () => ({ imap: true, google: false, microsoft: false }),
    accounts: async () => copy(mine()),
    testAccount: async (input) => { if (input.password !== 'app-pass') throw new MailError('MAIL_CONNECTION_FAILED', 'IMAP: Неверный логин или пароль'); },
    addAccount: async (input) => {
      if (input.password !== 'app-pass') throw new MailError('MAIL_CONNECTION_FAILED', 'IMAP: Неверный логин или пароль');
      if (store.accounts.some((item) => item.email === input.email)) throw new MailError('MAIL_ACCOUNT_EXISTS', 'Этот ящик уже подключён');
      const account: MailAccount = { ...store.accounts[0]!, id: crypto.randomUUID(), email: input.email, displayName: input.displayName ?? null, imapHost: input.imap.host, imapPort: input.imap.port,
        imapSecurity: input.imap.security, smtpHost: input.smtp.host, smtpPort: input.smtp.port, smtpSecurity: input.smtp.security, username: input.username, signature: input.signature ?? null, unread: 0, lastSyncedAt: null };
      store.accounts.push(account);
      return copy(account);
    },
    updateAccount: async (id, patch) => {
      const account = store.accounts.find((item) => item.id === id);
      if (!account) throw new MailError('MAIL_NOT_FOUND', 'Ящик не найден');
      if (patch.password !== undefined && patch.password !== 'app-pass') throw new MailError('MAIL_CONNECTION_FAILED', 'IMAP: Неверный логин или пароль');
      if (patch.displayName !== undefined) account.displayName = patch.displayName;
      if (patch.signature !== undefined) account.signature = patch.signature;
      if (patch.password) { account.status = 'CONNECTED'; account.statusReason = null; }
      return copy(account);
    },
    removeAccount: async (id) => {
      store.accounts = store.accounts.filter((item) => item.id !== id);
      store.threads = store.threads.filter((item) => item.accountId !== id || item.client);
    },
    sync: async () => undefined,
    oauthStart: async () => { throw new MailError('MAIL_PROVIDER_UNAVAILABLE', 'Этот способ подключения не настроен на сервере'); },
    oauthComplete: async () => { throw new MailError('MAIL_PROVIDER_UNAVAILABLE', 'Этот способ подключения не настроен на сервере'); },
    folders: async (accountId) => copy(store.folders.filter((item) => item.accountId === accountId && mine().some((account) => account.id === accountId))),
    threads: async (filter) => {
      const words = filter.q?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
      const items = store.threads.filter((thread) => thread.ownerId === me.id && (!filter.accountId || thread.accountId === filter.accountId) && store.messages.some((message) =>
        message.threadId === thread.id && (!filter.folderId || message.folderId === filter.folderId) && (!filter.starred || message.flagged)
        && words.every((word) => `${message.subject} ${message.text} ${message.fromAddress} ${message.fromName}`.toLowerCase().includes(word))))
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
      return { items: copy(items), hasMore: false };
    },
    thread: async (id) => {
      const thread = ownThread(id);
      store.messages.filter((item) => item.threadId === id).forEach((item) => { item.seen = true; });
      refresh(id);
      return copy({ ...thread, messages: store.messages.filter((item) => item.threadId === id), linkSuggestions: [] });
    },
    showImages: async (messageId) => (store.messages.find((item) => item.id === messageId)?.html ?? '').replace(/data-remote-src=/g, 'src='),
    act: async ({ threadIds = [], messageIds = [], fromFolderId, action, folderId }) => {
      const rows = store.messages.filter((item) => (messageIds.includes(item.id) || (threadIds.includes(item.threadId) && (!fromFolderId || item.folderId === fromFolderId))));
      if (rows.some((item) => !store.threads.some((thread) => thread.id === item.threadId && thread.ownerId === me.id))) throw new MailError('MAIL_NOT_FOUND', 'Письма не найдены');
      const target = action === 'move' ? store.folders.find((item) => item.id === folderId)
        : action === 'archive' ? store.folders.find((item) => item.specialUse === 'ARCHIVE') : action === 'spam' ? store.folders.find((item) => item.specialUse === 'JUNK')
        : action === 'trash' ? store.folders.find((item) => item.specialUse === 'TRASH') : undefined;
      for (const row of rows) {
        if (action === 'read' || action === 'unread') row.seen = action === 'read';
        else if (action === 'star' || action === 'unstar') row.flagged = action === 'star';
        else if (action === 'delete' || (action === 'trash' && row.folderSpecialUse === 'TRASH')) store.messages = store.messages.filter((item) => item !== row);
        else if (target) { row.folderId = target.id; row.folderName = target.name; row.folderSpecialUse = target.specialUse; }
      }
      new Set(rows.map((row) => row.threadId)).forEach(refresh);
    },
    drafts: async () => copy(store.drafts.filter((item) => item.userId === me.id)),
    createDraft: async (input) => {
      const draft = { id: crypto.randomUUID(), accountId: input.accountId, mode: input.mode ?? 'NEW', sourceMessageId: input.sourceMessageId ?? null, to: input.to ?? [], cc: input.cc ?? [], bcc: input.bcc ?? [],
        subject: input.subject ?? '', html: input.html ?? '', clientId: input.clientId ?? null, dealId: input.dealId ?? null, updatedAt: new Date().toISOString(), userId: me.id,
        attachments: (input.forwardAttachmentIds ?? []).flatMap((id) => store.messages.flatMap((message) => message.attachments).filter((item) => item.id === id).map((item) => ({ ...item, forwardedId: item.id }))) };
      store.drafts.unshift(draft);
      return copy(draft);
    },
    updateDraft: async (id, patch) => { const draft = draftOf(id); Object.assign(draft, Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)), { updatedAt: new Date().toISOString() }); return copy(draft); },
    deleteDraft: async (id) => { store.drafts = store.drafts.filter((item) => item.id !== id); },
    draftFromMessage: async (messageId) => {
      const message = store.messages.find((item) => item.id === messageId)!;
      const draft = { id: crypto.randomUUID(), accountId: store.accounts[0]!.id, mode: 'NEW' as const, sourceMessageId: null, to: message.to, cc: message.cc, bcc: message.bcc, subject: message.subject,
        html: message.html ?? '', attachments: [], clientId: null, dealId: null, updatedAt: new Date().toISOString(), userId: me.id };
      store.drafts.unshift(draft);
      return copy(draft);
    },
    attach: async (draftId, files) => { const draft = draftOf(draftId); draft.attachments.push(...files.map((file) => ({ id: crypto.randomUUID(), filename: file.name, contentType: file.type, size: file.size }))); return copy(draft); },
    detach: async (draftId, attachmentId) => { const draft = draftOf(draftId); draft.attachments = draft.attachments.filter((item) => item.id !== attachmentId); },
    send: async (draftId) => {
      const draft = draftOf(draftId);
      const account = store.accounts.find((item) => item.id === draft.accountId)!;
      if (account.status !== 'CONNECTED') throw new MailError('MAIL_ACCOUNT_UNAVAILABLE', 'Подключите ящик заново, чтобы отправлять письма');
      const source = store.messages.find((item) => item.id === draft.sourceMessageId);
      const replying = source && draft.mode !== 'FORWARD';
      let threadId = replying ? source.threadId : '';
      if (!threadId) {
        threadId = crypto.randomUUID();
        store.threads.unshift({ id: threadId, accountId: account.id, mailboxEmail: account.email, subject: draft.subject, lastMessageAt: new Date().toISOString(), messageCount: 0, unreadCount: 0,
          hasAttachments: draft.attachments.length > 0, participants: draft.to.map((item) => item.address), snippet: null, flagged: false, correspondents: draft.to.map((item) => item.name ?? item.address).join(', '),
          client: null, deal: null, linkSource: null, ownerId: me.id, autolinkBlocked: false });
      }
      const sent = store.folders.find((item) => item.specialUse === 'SENT')!;
      const text = draft.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      store.messages.push({ id: crypto.randomUUID(), threadId, fromAddress: account.email, fromName: account.displayName, to: draft.to, cc: draft.cc, bcc: draft.bcc, replyTo: [], subject: draft.subject,
        snippet: text.slice(0, 140), text, html: draft.html, hasRemoteImages: false, sentAt: new Date().toISOString(), seen: true, flagged: false, sendStatus: 'SENT', sendError: null, messageIdHeader: null,
        folderId: sent.id, folderName: sent.name, folderSpecialUse: 'SENT', attachments: draft.attachments });
      const thread = store.threads.find((item) => item.id === threadId)!;
      if (draft.clientId && !thread.client) { const client = clients.find((item) => item.id === draft.clientId); if (client) thread.client = { id: client.id, name: client.name, companyName: client.companyName }; }
      refresh(threadId);
      store.drafts = store.drafts.filter((item) => item.id !== draftId);
      return { threadId };
    },
    link: async (threadId, link) => {
      const thread = ownThread(threadId);
      if (!link.clientId && !link.dealId) { thread.client = null; thread.deal = null; thread.linkSource = null; thread.autolinkBlocked = true; return; }
      const deal = link.dealId ? deals.find((item) => item.id === link.dealId) : undefined;
      if (link.dealId && !deal) throw new MailError('DEAL_NOT_FOUND', 'Сделка недоступна');
      const clientId = deal?.clientId ?? link.clientId!;
      if (!visibleClient(clientId)) throw new MailError('CLIENT_NOT_FOUND', 'Клиент недоступен');
      const client = clients.find((item) => item.id === clientId)!;
      thread.client = { id: client.id, name: client.name, companyName: client.companyName };
      thread.deal = deal ? { id: deal.id, title: deal.title } : null;
      thread.linkSource = 'MANUAL';
    },
    createClientFrom: async (threadId, input) => {
      const thread = ownThread(threadId);
      const client = await addClient({ name: input.name, companyName: input.companyName ?? input.name, email: input.email ?? '', phone: '', source: 'Почта', status: 'NEW', ownerId: me.id, ownerName: me.fullName, notes: '' });
      thread.client = { id: client.id, name: client.name, companyName: client.companyName };
      thread.linkSource = 'MANUAL';
      return { clientId: client.id };
    },
    createDealFrom: async (threadId, input) => {
      const thread = ownThread(threadId);
      const clientId = input.clientId ?? thread.client?.id;
      if (!clientId) throw new MailError('CLIENT_REQUIRED', 'Сначала привяжите переписку к клиенту');
      const client = clients.find((item) => item.id === clientId);
      const id = crypto.randomUUID();
      await addDeal({ clientId, title: input.title, companyName: client?.companyName ?? '', ownerId: me.id, ownerName: me.fullName, funnelId: input.funnelId,
        stage: { id: '', name: '', color: '#6B7280', outcome: 'OPEN' }, value: input.value, currency: 'UAH', probability: 20, expectedCloseAt: new Date(Date.now() + 30 * 86_400_000).toISOString() });
      thread.deal = { id, title: input.title };
      return { dealId: id };
    },
    suggest: async (q) => {
      const needle = q.toLowerCase();
      return clients.filter((client) => client.email && `${client.name} ${client.companyName} ${client.email}`.toLowerCase().includes(needle))
        .map((client) => ({ address: client.email, name: client.name, source: 'client' as const })).slice(0, 8);
    },
    unread: async () => mine().reduce((sum, account) => sum + account.unread, 0),
    download: async (attachmentId) => new Blob([`Демо-вложение ${attachmentId}`], { type: 'application/octet-stream' }),
    clientHistory: async (clientId) => {
      if (!visibleClient(clientId)) throw new MailError('CLIENT_NOT_FOUND', 'Клиент недоступен');
      return historyFor(store.threads.filter((item) => item.client?.id === clientId).map((item) => item.id));
    },
    dealHistory: async (dealId) => historyFor(store.threads.filter((item) => item.deal?.id === dealId).map((item) => item.id)),
    historyThread: async (threadId) => {
      const thread = store.threads.find((item) => item.id === threadId);
      if (!thread || !(thread.ownerId === me.id || (thread.client && visibleClient(thread.client.id)))) throw new MailError('MAIL_NOT_FOUND', 'Переписка недоступна');
      return copy({ id: thread.id, subject: thread.subject, mailboxEmail: thread.mailboxEmail, owner: { id: thread.ownerId, fullName: 'Анна Петрова' },
        messages: store.messages.filter((item) => item.threadId === threadId).map((item) => ({ ...item, bcc: thread.ownerId === me.id ? item.bcc : [] })) });
    },
  };
}
