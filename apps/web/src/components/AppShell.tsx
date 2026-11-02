import {
  BarChart3, BookOpenCheck, BriefcaseBusiness, ChevronLeft, ChevronRight,
  ClipboardList, FileText, Mail, MessageSquareWarning, Gauge, SquareKanban, LayoutDashboard, LogOut, Menu, MessageSquare,
  PanelLeftClose, Search, Send, Settings, ShieldCheck, Trophy, Users, X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth, useWorkspace } from '../context/AppContext';
import { useChat } from '../context/ChatContext';
import { useMail } from '../context/MailContext';
import { useTelegram } from '../context/TelegramContext';
import { recordDiagnostic } from '../lib/diagnostics';
import { relativeTime, roleLabel } from '../lib/format';
import type { Role } from '../types';
import { useIsPhone } from '../lib/useIsPhone';
import { NotificationBell } from './NotificationBell';
import { FeedbackButton } from './FeedbackDialog';
import { Avatar, Badge, IconButton } from './ui';
import { useTranslation } from 'react-i18next';
import type { shell } from '../i18n/uk/shell';

type NavKey = Exclude<keyof typeof shell.nav, 'groupTeam' | 'groupCommunication'>;
interface NavItem { label: NavKey; to: string; icon: typeof Gauge; roles?: Role[]; }
const nav: Array<{ title?: 'groupTeam' | 'groupCommunication'; items: NavItem[] }> = [
  { items: [
    { label: 'dashboard', to: '/', icon: LayoutDashboard },
    { label: 'crm', to: '/crm', icon: BriefcaseBusiness },
    { label: 'sales', to: '/sales', icon: BarChart3 },
    { label: 'tasks', to: '/tasks', icon: ClipboardList },
    { label: 'boards', to: '/boards', icon: SquareKanban },
    { label: 'documents', to: '/documents', icon: FileText },
  ] },
  { title: 'groupTeam', items: [
    { label: 'team', to: '/team', icon: Users },
    { label: 'reports', to: '/reports', icon: BookOpenCheck, roles: ['DIRECTOR', 'MANAGER'] },
    { label: 'achievements', to: '/achievements', icon: Trophy },
  ] },
  { title: 'groupCommunication', items: [
    { label: 'messages', to: '/messages', icon: MessageSquare },
    { label: 'mail', to: '/mail', icon: Mail },
    { label: 'telegram', to: '/telegram', icon: Send },
    { label: 'feedback', to: '/feedback', icon: MessageSquareWarning },
    { label: 'audit', to: '/audit', icon: ShieldCheck, roles: ['DIRECTOR'] },
    { label: 'profile', to: '/profile', icon: Settings },
  ] },
];

const routeNames: Record<string, keyof typeof shell.pages> = {
  '/': 'dashboard', '/crm': 'crm', '/sales': 'sales', '/sales/settings': 'salesSettings', '/tasks': 'tasks', '/boards': 'boards', '/boards/settings': 'boardSettings',
  '/documents': 'documents', '/team': 'team', '/reports': 'reports',
  '/achievements': 'achievements', '/messages': 'messages', '/mail': 'mail', '/mail/settings': 'mailSettings', '/telegram': 'telegram', '/telegram/settings': 'telegramSettings', '/audit': 'audit', '/feedback': 'feedback', '/profile': 'profile',
};

export function AppShell({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth();
  const { dataStatus } = useWorkspace();
  const { totals } = useChat();
  const { unread: mailUnread } = useMail();
  const { unread: telegramUnread } = useTelegram();
  const badges: Record<string, number> = { '/messages': totals.badge, '/mail': mailUnread, '/telegram': telegramUnread };
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('atlas.sidebar.collapsed') === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);
  const phone = useIsPhone();
  const location = useLocation();
  const user = session!.user;
  const { t } = useTranslation('shell');
  useEffect(() => { recordDiagnostic({ type: 'route', path: location.pathname }); }, [location.pathname]);
  const pageKey = location.pathname.startsWith('/crm/') ? 'client' : /^\/boards\/[^/]+\/settings$/.test(location.pathname) ? 'boardSettings' : location.pathname.startsWith('/mail/oauth') ? 'mail' : routeNames[location.pathname];
  const pageName = pageKey ? t(`pages.${pageKey}`) : 'Atlas';

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useBarHeights(phone);
  useEffect(() => { localStorage.setItem('atlas.sidebar.collapsed', String(collapsed)); }, [collapsed]);

  return <div className={`app-layout ${collapsed ? 'app-layout--collapsed' : ''}`}>
    {mobileOpen && <button className="sidebar-scrim" aria-label={t('frame.closeMenu')} onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar__brand"><span className="brand-mark">A</span><strong>ATLAS</strong><IconButton label={t('frame.closeMenu')} icon={X} className="sidebar__mobile-close" onClick={() => setMobileOpen(false)} /></div>
      <nav className="sidebar__nav" aria-label={t('frame.mainNav')}>
        {nav.map((group, index) => <div className="nav-group" key={group.title ?? index}>{group.title && <span className="nav-group__title">{t(`nav.${group.title}`)}</span>}{group.items.filter((item) => !item.roles || item.roles.includes(user.role)).map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`} title={collapsed ? t(`nav.${item.label}`) : undefined}><item.icon size={18} aria-hidden="true" /><span>{t(`nav.${item.label}`)}</span>{(badges[item.to] ?? 0) > 0 && <i className="nav-count" aria-label={t('frame.unreadIn', { label: t(`nav.${item.label}`), count: badges[item.to] })}>{badges[item.to]! > 99 ? '99+' : badges[item.to]}</i>}</NavLink>)}</div>)}
      </nav>
      <button className="sidebar__collapse" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? t('frame.expandMenu') : t('frame.collapseMenu')}><PanelLeftClose size={17} /><span>{t('frame.collapseMenu')}</span>{collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button>
      <div className="sidebar__user"><Avatar name={user.fullName} src={user.avatarUrl} online size="sm" /><div><strong>{user.fullName}</strong><span>{roleLabel[user.role]}</span></div><IconButton label={t('frame.logout')} icon={LogOut} onClick={() => void logout()} /></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><div className="topbar__left"><IconButton label={t('frame.openMenu')} icon={Menu} className="topbar__menu" onClick={() => setMobileOpen(true)} /><div><span>{t('frame.workspace')}</span><strong>{pageName}</strong></div></div><div className="topbar__right"><label className="global-search"><Search size={16} /><input aria-label={t('frame.search')} placeholder={t('frame.search')} /></label>{dataStatus === 'offline' && <Badge tone="warning">{t('frame.offlineData')}</Badge>}<FeedbackButton /><NotificationBell /><div className="topbar__presence"><span className="presence presence--online" />{t('frame.online', { time: relativeTime(new Date().toISOString()) })}</div></div></header>
      <main className="page-content">{children}</main>
    </div>
    {phone && <BottomNav badges={badges} onMore={() => setMobileOpen(true)} />}
  </div>;
}

/** The phone's bottom bar: the screens used on the go, and «Ещё» for the full menu. */
function BottomNav({ badges, onMore }: { badges: Record<string, number>; onMore: () => void }) {
  const { t } = useTranslation('shell');
  const items = [
    { label: t('frame.tasks'), to: '/tasks', icon: ClipboardList },
    { label: t('nav.messages'), to: '/messages', icon: MessageSquare },
    { label: t('nav.telegram'), to: '/telegram', icon: Send },
    { label: t('nav.crm'), to: '/crm', icon: BriefcaseBusiness },
  ];
  return <nav className="bottom-nav" aria-label={t('frame.quickNav')}>
    {items.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'is-active' : ''}>
      <span className="bottom-nav__icon"><Icon size={20} aria-hidden />{badges[to] > 0 && <i aria-label={t('frame.unread', { count: badges[to] })}>{badges[to] > 99 ? '99+' : badges[to]}</i>}</span>{label}
    </NavLink>)}
    <button type="button" onClick={onMore}><span className="bottom-nav__icon"><Menu size={20} aria-hidden /></span>{t('frame.more')}</button>
  </nav>;
}

/**
 * Publishes the real heights of the top bar and the phone's bottom bar as `--topbar-height` and `--bottom-nav-height`,
 * so screens that fill the space between them (a phone conversation) fit exactly, notch and home bar included; and the
 * on-screen keyboard as `--keyboard-height` / `--viewport-offset`, so the message box stays above it.
 */
function useBarHeights(phone: boolean) {
  useEffect(() => {
    const root = document.documentElement.style;
    const bars: Array<[string, string]> = [['.topbar', '--topbar-height'], ['.bottom-nav', '--bottom-nav-height']];
    const measure = () => bars.forEach(([selector, name]) => {
      const bar = document.querySelector(selector);
      if (bar) root.setProperty(name, `${Math.round(bar.getBoundingClientRect().height)}px`); else root.removeProperty(name);
    });
    // An open on-screen keyboard (iOS keeps fixed elements behind it): how much of the layout it covers, and how far iOS panned.
    const viewport = window.visualViewport;
    const keyboard = () => {
      if (!viewport) return;
      root.setProperty('--keyboard-height', `${Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))}px`);
      root.setProperty('--viewport-offset', `${Math.round(viewport.offsetTop)}px`);
    };
    measure(); keyboard();
    viewport?.addEventListener('resize', keyboard);
    viewport?.addEventListener('scroll', keyboard);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    bars.forEach(([selector]) => { const bar = document.querySelector(selector); if (bar) observer?.observe(bar); });
    return () => { observer?.disconnect(); viewport?.removeEventListener('resize', keyboard); viewport?.removeEventListener('scroll', keyboard); };
  }, [phone]);
}

