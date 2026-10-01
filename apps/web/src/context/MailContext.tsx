import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createDemoMail, remoteMail, type MailAccount, type MailBackend } from '../lib/mail';
import { useAuth, useWorkspace } from './AppContext';

interface MailValue {
  backend: MailBackend;
  accounts: MailAccount[];
  providers: { imap: boolean; google: boolean; microsoft: boolean };
  unread: number;
  loaded: boolean;
  refresh: () => Promise<void>;
  /** Called for live `mail:*` events and local changes, so open views can reload. */
  subscribe: (listener: (event: { type: 'changed' | 'account'; accountId?: string }) => void) => () => void;
  notify: (event: { type: 'changed' | 'account'; accountId?: string }) => void;
}

const MailContext = createContext<MailValue | null>(null);

export function MailProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { clients, deals, addClient, addDeal } = useWorkspace();
  const isDemo = session!.accessToken.startsWith('demo-');
  const user = session!.user;
  // The demo backend reads the latest CRM lists through refs, so it isn't rebuilt (and its state kept) on every change.
  const crm = useRef({ clients, deals, addClient, addDeal });
  crm.current = { clients, deals, addClient, addDeal };
  const backend = useMemo<MailBackend>(() => {
    if (!isDemo) return remoteMail;
    const demo = () => createDemoMail(user, crm.current.clients, crm.current.deals, crm.current.addClient, crm.current.addDeal);
    return new Proxy({} as MailBackend, { get: (_target, key) => (...args: unknown[]) => (demo()[key as keyof MailBackend] as (...values: unknown[]) => unknown)(...args) });
  }, [isDemo, user]);
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [providers, setProviders] = useState({ imap: false, google: false, microsoft: false });
  const [loaded, setLoaded] = useState(false);
  const listeners = useRef(new Set<(event: { type: 'changed' | 'account'; accountId?: string }) => void>());

  const refresh = useCallback(async () => {
    try {
      const [list, available] = await Promise.all([backend.accounts(), backend.providers()]);
      setAccounts(list); setProviders(available);
    } catch { /* offline: keep what we have */ } finally { setLoaded(true); }
  }, [backend]);

  useEffect(() => { void refresh(); }, [refresh]);
  const notify = useCallback((event: { type: 'changed' | 'account'; accountId?: string }) => listeners.current.forEach((listener) => listener(event)), []);

  useEffect(() => {
    if (isDemo) return;
    let timer: number | null = null;
    const handle = (raw: Event) => {
      const { event, payload } = (raw as CustomEvent<{ event: string; payload: { accountId?: string } }>).detail;
      if (!event.startsWith('mail:') && event !== 'connect') return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 200);
      notify({ type: event === 'mail:account' ? 'account' : 'changed', accountId: payload?.accountId });
    };
    window.addEventListener('atlas:socket', handle);
    return () => { window.removeEventListener('atlas:socket', handle); if (timer) window.clearTimeout(timer); };
  }, [isDemo, refresh, notify]);

  const value = useMemo<MailValue>(() => ({
    backend, accounts, providers, loaded, refresh, notify,
    unread: accounts.reduce((sum, account) => sum + account.unread, 0),
    subscribe: (listener) => { listeners.current.add(listener); return () => { listeners.current.delete(listener); }; },
  }), [backend, accounts, providers, loaded, refresh, notify]);
  return <MailContext.Provider value={value}>{children}</MailContext.Provider>;
}

export const useMail = () => {
  const value = useContext(MailContext);
  if (!value) throw new Error('useMail must be used inside MailProvider');
  return value;
};
