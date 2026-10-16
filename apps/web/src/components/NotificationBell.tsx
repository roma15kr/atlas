import { Bell, BellRing, CheckCheck, ClipboardList, MessageSquare, Send, Settings2, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AppContext';
import { plural, relativeTime } from '../lib/format';
import { demoNotifications, remoteNotifications, type AppNotification, type NotificationKind } from '../lib/notifications';
import { EmptyState } from './ui';

const icons: Record<NotificationKind, typeof Bell> = {
  TASK_ASSIGNED: ClipboardList, TASK_COMMENTED: MessageSquare, TASK_DUE: BellRing, TASK_OVERDUE: BellRing,
  CHAT_DIRECT: MessageSquare, CHAT_MENTION: MessageSquare, TELEGRAM_MESSAGE: Send,
  ALERT_CREATED: TriangleAlert, DEAL_ASSIGNED: ClipboardList, CLIENT_ASSIGNED: ClipboardList,
};

/** The bell in the top bar: unread count, and a panel listing the user's notifications, updated live. */
export function NotificationBell() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const backend = useMemo(() => session?.accessToken.startsWith('demo-') ? demoNotifications : remoteNotifications, [session]);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(() => backend.list().then((page) => { setItems(page.items); setUnread(page.unreadCount); }).catch(() => undefined), [backend]);
  useEffect(() => { void load(); }, [load]);
  // New notifications arrive over the shared socket.
  useEffect(() => {
    const handle = (event: Event) => {
      const { event: name, payload } = (event as CustomEvent<{ event: string; payload: AppNotification }>).detail;
      if (name === 'connect') { void load(); return; }
      // A deleted chat message takes its notifications with it.
      if (name === 'notification:removed') {
        const ids = new Set((payload as unknown as { ids?: string[] })?.ids ?? []);
        setItems((current) => {
          const gone = current.filter((item) => ids.has(item.id));
          setUnread((count) => Math.max(0, count - gone.filter((item) => !item.readAt).length));
          return gone.length ? current.filter((item) => !ids.has(item.id)) : current;
        });
        return;
      }
      if (name !== 'notification:new' || !payload?.id) return;
      setItems((current) => {
        const replaced = current.some((item) => item.id === payload.id);
        if (!replaced) setUnread((count) => count + 1);
        return [payload, ...current.filter((item) => item.id !== payload.id)];
      });
    };
    window.addEventListener('atlas:socket', handle);
    return () => window.removeEventListener('atlas:socket', handle);
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  const openItem = (item: AppNotification) => {
    setOpen(false);
    if (!item.readAt) {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry));
      setUnread((count) => Math.max(0, count - 1));
      void backend.read(item.id).catch(() => undefined);
    }
    navigate(item.link);
  };
  const readAll = () => {
    setItems((current) => current.map((entry) => entry.readAt ? entry : { ...entry, readAt: new Date().toISOString() }));
    setUnread(0);
    void backend.readAll().catch(() => void load());
  };

  return <div className="notification-bell" ref={root}>
    <button type="button" className="topbar__alerts" aria-label={unread ? `Уведомления: ${plural(unread, ['непрочитанное', 'непрочитанных', 'непрочитанных'])}` : 'Уведомления'} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <Bell size={18} />{unread > 0 && <i>{unread > 99 ? '99+' : unread}</i>}
    </button>
    {open && <div className="notification-panel" role="dialog" aria-label="Уведомления">
      <header><strong>Уведомления</strong>{unread > 0 && <button type="button" className="text-button" onClick={readAll}><CheckCheck size={14} /> Прочитать все</button>}</header>
      {items.length ? <ul>{items.map((item) => {
        const Icon = icons[item.kind] ?? Bell;
        return <li key={item.id}><button type="button" className={item.readAt ? '' : 'is-unread'} onClick={() => openItem(item)}>
          <Icon size={16} aria-hidden /><span><strong>{item.title}</strong>{item.body && <small>{item.body}</small>}<time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time></span>
        </button></li>;
      })}</ul> : <EmptyState title="Уведомлений нет" description="Здесь появятся задачи, сообщения и напоминания" icon={Bell} />}
      <footer><button type="button" className="text-button" onClick={() => { setOpen(false); navigate('/profile#notifications'); }}><Settings2 size={14} /> Настройки уведомлений</button></footer>
    </div>}
  </div>;
}
