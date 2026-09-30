export const formatMoney = (value: number, currency: 'UAH' = 'UAH') =>
  new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(value);

export const formatKpiValue = (value: number, unit: string) =>
  unit.toUpperCase() === 'UAH'
    ? formatMoney(value)
    : `${new Intl.NumberFormat('ru-RU').format(value)} ${unit}`;

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

/** Russian plural: plural(3, ['этап', 'этапа', 'этапов']) → '3 этапа'. */
export const plural = (count: number, [one, few, many]: [string, string, string]) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
  return `${count} ${word}`;
};
