import type { common as source } from '../uk/common';
import type { Dictionary } from '../types';

export const common = {
  languages: { uk: 'Українська', ru: 'Русский', en: 'English' },
  roles: { DIRECTOR: 'Директор', MANAGER: 'Руководитель', EMPLOYEE: 'Сотрудник' },
  time: {
    noData: 'нет данных',
    minutesAgo_one: '{{count}} мин назад', minutesAgo_few: '{{count}} мин назад', minutesAgo_many: '{{count}} мин назад', minutesAgo_other: '{{count}} мин назад',
    hoursAgo_one: '{{count}} ч назад', hoursAgo_few: '{{count}} ч назад', hoursAgo_many: '{{count}} ч назад', hoursAgo_other: '{{count}} ч назад',
  },
  size: { bytes: '{{value}} Б', kilobytes: '{{value}} КБ', megabytes: '{{value}} МБ' },
  empty: '—',
} satisfies Dictionary<typeof source>;
