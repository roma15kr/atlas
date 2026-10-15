import { apiRequest } from './api';

export type NotificationKind = 'TASK_ASSIGNED' | 'TASK_COMMENTED' | 'TASK_DUE' | 'TASK_OVERDUE' | 'CHAT_DIRECT' | 'CHAT_MENTION'
  | 'TELEGRAM_MESSAGE' | 'ALERT_CREATED' | 'DEAL_ASSIGNED' | 'CLIENT_ASSIGNED';

export interface AppNotification {
  id: string; kind: NotificationKind; title: string; body: string | null; link: string; createdAt: string; readAt: string | null;
}
export interface NotificationPage { items: AppNotification[]; unreadCount: number }

export interface NotificationsBackend {
  list(): Promise<NotificationPage>;
  read(id: string): Promise<void>;
  readAll(): Promise<void>;
}

export const remoteNotifications: NotificationsBackend = {
  list: async () => {
    const page = await apiRequest<{ data: AppNotification[]; meta: { unreadCount: number } }>('/notifications?limit=30', { envelope: true });
    return { items: page.data, unreadCount: page.meta.unreadCount };
  },
  read: async (id) => { await apiRequest(`/notifications/${id}/read`, { method: 'POST' }); },
  readAll: async () => { await apiRequest('/notifications/read-all', { method: 'POST' }); },
};

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const demoSeed = (): AppNotification[] => [
  { id: 'n1', kind: 'TASK_ASSIGNED', title: 'Новая задача: Подготовить коммерческое предложение', body: 'Михаил Волков · Задачи отдела', link: '/tasks?task=t1', createdAt: ago(12), readAt: null },
  { id: 'n2', kind: 'TELEGRAM_MESSAGE', title: 'Telegram: Покупатель', body: 'Здравствуйте, сколько стоит доставка?', link: '/telegram', createdAt: ago(40), readAt: null },
  { id: 'n3', kind: 'ALERT_CREATED', title: 'Сделка не закрыта в срок', body: 'Northstar Labs · Годовой план', link: '/', createdAt: ago(60 * 26), readAt: ago(60 * 20) },
];
/** Demo mode keeps notifications in memory for the page's lifetime. */
let demoStore: AppNotification[] | null = null;
export const resetDemoNotifications = () => { demoStore = null; };
export const demoNotifications: NotificationsBackend = {
  list: async () => {
    demoStore ??= demoSeed();
    return { items: [...demoStore], unreadCount: demoStore.filter((item) => !item.readAt).length };
  },
  read: async (id) => { demoStore = (demoStore ?? demoSeed()).map((item) => item.id === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item); },
  readAll: async () => { demoStore = (demoStore ?? demoSeed()).map((item) => item.readAt ? item : { ...item, readAt: new Date().toISOString() }); },
};
