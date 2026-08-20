export const formatMoney = (value: number, currency: string = 'RUB') =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);

export const formatDate = (value?: string, options?: Intl.DateTimeFormatOptions) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', options ?? { day: '2-digit', month: 'short' }).format(new Date(value));
};

export const formatDateTime = (value?: string) =>
  formatDate(value, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const roleLabel = {
  DIRECTOR: 'Директор',
  MANAGER: 'Руководитель',
  EMPLOYEE: 'Сотрудник',
} as const;

export const relativeTime = (value?: string) => {
  if (!value) return 'нет данных';
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return formatDate(value);
};

export const fileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
};
