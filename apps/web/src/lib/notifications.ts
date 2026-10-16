import { apiRequest } from './api';

export type NotificationKind = 'TASK_ASSIGNED' | 'TASK_COMMENTED' | 'TASK_DUE' | 'TASK_OVERDUE' | 'CHAT_DIRECT' | 'CHAT_MENTION' | 'CHAT_MESSAGE'
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

export interface NotificationPreferences { tasks: boolean; chat: boolean; telegram: boolean; alerts: boolean }
export const pushConfig = () => apiRequest<{ enabled: boolean; publicKey: string | null }>('/notifications/push/config');
export const loadPreferences = () => apiRequest<NotificationPreferences>('/notifications/preferences');
export const savePreferences = (patch: Partial<NotificationPreferences>) => apiRequest<NotificationPreferences>('/notifications/preferences', { method: 'PATCH', body: patch });
export const sendTestPush = () => apiRequest<{ browsers: number; delivered: number }>('/notifications/push/test', { method: 'POST' });

export type PushState = 'unsupported' | 'unavailable' | 'blocked' | 'off' | 'on';

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** The VAPID public key is URL-safe base64; the browser wants raw bytes. */
function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration ? registration.pushManager.getSubscription() : null;
}

/** Where desktop notifications stand in this browser for this server. */
export async function pushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const config = await pushConfig();
  if (!config.enabled) return 'unavailable';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && await currentSubscription() ? 'on' : 'off';
}

/** Asks Chrome for permission, subscribes this browser and registers it with the API. */
export async function enablePush(): Promise<PushState> {
  const config = await pushConfig();
  if (!config.enabled || !config.publicKey) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.publicKey) });
  const json = subscription.toJSON();
  await apiRequest('/notifications/push/subscriptions', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys } });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription();
  if (subscription) {
    await apiRequest('/notifications/push/subscriptions', { method: 'DELETE', body: { endpoint: subscription.endpoint } });
    await subscription.unsubscribe();
  }
  return 'off';
}
