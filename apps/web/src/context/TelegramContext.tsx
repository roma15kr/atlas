import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { demoUsers } from '../data/demo';
import type { CommunicationEntry } from '../lib/mail';
import { createDemoTelegram, remoteTelegram, type TelegramBackend, type TelegramStatus } from '../lib/telegram';
import { useAuth, useWorkspace } from './AppContext';

interface TelegramValue {
  backend: TelegramBackend;
  status: TelegramStatus | null;
  unread: number;
  isDemo: boolean;
  refresh: () => Promise<void>;
  subscribe: (listener: (event: { contactId?: string }) => void) => () => void;
  notify: (event: { contactId?: string }) => void;
  /** Demo mode only: Telegram entries of a client's history (the real API merges them on the server). */
  demoHistory: (filter: { clientId?: string; dealId?: string }) => Promise<CommunicationEntry[]>;
}

const TelegramContext = createContext<TelegramValue | null>(null);

export function TelegramProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { clients, deals, addClient, addDeal } = useWorkspace();
  const user = session!.user;
  const isDemo = session!.accessToken.startsWith('demo-');
  const crm = useRef({ clients, deals, addClient, addDeal });
  crm.current = { clients, deals, addClient, addDeal };
  const backend = useMemo<TelegramBackend>(() => {
    if (!isDemo) return remoteTelegram;
    const demo = () => createDemoTelegram(user, demoUsers, crm.current.clients, crm.current.deals, crm.current.addClient, crm.current.addDeal);
    return new Proxy({} as TelegramBackend, { get: (_target, key) => (...args: unknown[]) => (demo()[key as keyof TelegramBackend] as (...values: unknown[]) => unknown)(...args) });
  }, [isDemo, user]);
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [unread, setUnread] = useState(0);
  const listeners = useRef(new Set<(event: { contactId?: string }) => void>());

  const refresh = useCallback(async () => {
    try {
      const [current, count] = await Promise.all([backend.status(), backend.unread()]);
      setStatus(current); setUnread(count);
    } catch { /* keep the last known state */ }
  }, [backend]);
  useEffect(() => { void refresh(); }, [refresh]);
  const notify = useCallback((event: { contactId?: string }) => listeners.current.forEach((listener) => listener(event)), []);

  useEffect(() => {
    if (isDemo) return;
    let timer: number | null = null;
    const handle = (raw: Event) => {
      const { event, payload } = (raw as CustomEvent<{ event: string; payload: { contactId?: string } }>).detail;
      if (!event.startsWith('telegram:') && event !== 'connect') return;
      notify({ contactId: payload?.contactId });
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 200);
    };
    window.addEventListener('atlas:socket', handle);
    return () => { window.removeEventListener('atlas:socket', handle); if (timer) window.clearTimeout(timer); };
  }, [isDemo, notify, refresh]);

  const demoHistory = useCallback(async ({ clientId, dealId }: { clientId?: string; dealId?: string }): Promise<CommunicationEntry[]> => {
    if (!isDemo) return [];
    const contacts = await backend.contacts('all');
    return contacts.filter((contact) => (clientId && contact.client?.id === clientId && !dealId) || (dealId && contact.deals.some((deal) => deal.id === dealId))).filter((contact) => contact.lastMessage)
      .map((contact) => ({ channel: 'TELEGRAM' as const, id: contact.id, title: contact.displayName, participants: [contact.username ? `@${contact.username}` : contact.telegramUserId],
        lastActivityAt: contact.lastMessageAt ?? contact.createdAt, messageCount: 0, owner: contact.responsible, snippet: contact.lastMessage?.text ?? null }));
  }, [backend, isDemo]);

  const subscribe = useCallback((listener: (event: { contactId?: string }) => void) => { listeners.current.add(listener); return () => { listeners.current.delete(listener); }; }, []);

  const value = useMemo<TelegramValue>(() => ({
    backend, status, unread, isDemo, refresh, notify, demoHistory,
    subscribe,
  }), [backend, status, unread, isDemo, refresh, notify, demoHistory, subscribe]);
  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

export const useTelegram = () => {
  const value = useContext(TelegramContext);
  if (!value) throw new Error('useTelegram must be used inside TelegramProvider');
  return value;
};
