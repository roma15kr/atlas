import {
  BarChart3, Bell, BookOpenCheck, BriefcaseBusiness, ChevronLeft, ChevronRight,
  ClipboardList, FileText, Mail, Gauge, SquareKanban, LayoutDashboard, LogOut, Menu, MessageSquare,
  PanelLeftClose, Search, Send, Settings, ShieldCheck, Trophy, Users, X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useWorkspace } from '../context/AppContext';
import { useChat } from '../context/ChatContext';
import { useMail } from '../context/MailContext';
import { useTelegram } from '../context/TelegramContext';
import { relativeTime, roleLabel } from '../lib/format';
import type { Role } from '../types';
import { Avatar, Badge, IconButton } from './ui';

interface NavItem { label: string; to: string; icon: typeof Gauge; roles?: Role[]; }
const nav: Array<{ title?: string; items: NavItem[] }> = [
  { items: [
    { label: 'Дашборд', to: '/', icon: LayoutDashboard },
    { label: 'CRM', to: '/crm', icon: BriefcaseBusiness },
    { label: 'Воронка', to: '/sales', icon: BarChart3 },
    { label: 'Мои задачи', to: '/tasks', icon: ClipboardList },
    { label: 'Доски', to: '/boards', icon: SquareKanban },
    { label: 'Документы', to: '/documents', icon: FileText },
  ] },
  { title: 'КОМАНДА', items: [
    { label: 'Сотрудники', to: '/team', icon: Users },
    { label: 'Отчёты', to: '/reports', icon: BookOpenCheck, roles: ['DIRECTOR', 'MANAGER'] },
    { label: 'Достижения', to: '/achievements', icon: Trophy },
  ] },
  { title: 'СВЯЗЬ И КОНТРОЛЬ', items: [
    { label: 'Сообщения', to: '/messages', icon: MessageSquare },
    { label: 'Почта', to: '/mail', icon: Mail },
    { label: 'Telegram', to: '/telegram', icon: Send },
    { label: 'Аудит', to: '/audit', icon: ShieldCheck, roles: ['DIRECTOR'] },
    { label: 'Профиль', to: '/profile', icon: Settings },
  ] },
];

const routeNames: Record<string, string> = {
  '/': 'Дашборд', '/crm': 'CRM', '/sales': 'Воронка продаж', '/sales/settings': 'Настройка воронок', '/tasks': 'Мои задачи', '/boards': 'Доски задач', '/boards/settings': 'Настройка досок',
  '/documents': 'Документы', '/team': 'Команда', '/reports': 'Отчёты',
  '/achievements': 'Достижения', '/messages': 'Сообщения', '/mail': 'Почта', '/mail/settings': 'Настройки почты', '/telegram': 'Telegram', '/telegram/settings': 'Настройки Telegram', '/audit': 'Журнал аудита', '/profile': 'Профиль',
};

export function AppShell({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth();
  const { alerts, dataStatus } = useWorkspace();
  const { totals } = useChat();
  const { unread: mailUnread } = useMail();
  const { unread: telegramUnread } = useTelegram();
  const badges: Record<string, number> = { '/messages': totals.badge, '/mail': mailUnread, '/telegram': telegramUnread };
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('atlas.sidebar.collapsed') === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const user = session!.user;
  const openAlerts = alerts.filter((alert) => !alert.acknowledged).length;
  const pageName = useMemo(() => location.pathname.startsWith('/crm/') ? 'Карточка клиента' : /^\/boards\/[^/]+\/settings$/.test(location.pathname) ? 'Настройка досок' : location.pathname.startsWith('/mail/oauth') ? 'Почта' : routeNames[location.pathname] ?? 'Atlas', [location.pathname]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => { localStorage.setItem('atlas.sidebar.collapsed', String(collapsed)); }, [collapsed]);

  return <div className={`app-layout ${collapsed ? 'app-layout--collapsed' : ''}`}>
    {mobileOpen && <button className="sidebar-scrim" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar__brand"><span className="brand-mark">A</span><strong>ATLAS</strong><IconButton label="Закрыть меню" icon={X} className="sidebar__mobile-close" onClick={() => setMobileOpen(false)} /></div>
      <nav className="sidebar__nav" aria-label="Основная навигация">
        {nav.map((group, index) => <div className="nav-group" key={group.title ?? index}>{group.title && <span className="nav-group__title">{group.title}</span>}{group.items.filter((item) => !item.roles || item.roles.includes(user.role)).map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`} title={collapsed ? item.label : undefined}><item.icon size={18} aria-hidden="true" /><span>{item.label}</span>{(badges[item.to] ?? 0) > 0 && <i className="nav-count" aria-label={`${item.label}: непрочитанных ${badges[item.to]}`}>{badges[item.to]! > 99 ? '99+' : badges[item.to]}</i>}</NavLink>)}</div>)}
      </nav>
      <button className="sidebar__collapse" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}><PanelLeftClose size={17} /><span>Свернуть меню</span>{collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button>
      <div className="sidebar__user"><Avatar name={user.fullName} online size="sm" /><div><strong>{user.fullName}</strong><span>{roleLabel[user.role]}</span></div><IconButton label="Выйти" icon={LogOut} onClick={() => void logout()} /></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><div className="topbar__left"><IconButton label="Открыть меню" icon={Menu} className="topbar__menu" onClick={() => setMobileOpen(true)} /><div><span>Рабочее пространство</span><strong>{pageName}</strong></div></div><div className="topbar__right"><label className="global-search"><Search size={16} /><input aria-label="Поиск" placeholder="Поиск" /></label>{dataStatus === 'offline' && <Badge tone="warning">Офлайн-данные</Badge>}<button className="topbar__alerts" aria-label={`Уведомления: ${openAlerts}`} onClick={() => navigate('/')}><Bell size={18} />{openAlerts > 0 && <i>{openAlerts}</i>}</button><div className="topbar__presence"><span className="presence presence--online" />В сети · {relativeTime(new Date().toISOString())}</div></div></header>
      <main className="page-content">{children}</main>
    </div>
  </div>;
}
