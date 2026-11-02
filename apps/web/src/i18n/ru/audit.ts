import type { audit as source } from '../uk/audit';
import type { Dictionary } from '../types';

export const audit = {
  action: {
    CRM_EXPORT: "Экспорт CRM",
    CLIENT_VIEW: "Просмотр клиента",
    DOCUMENT_DOWNLOAD: "Скачивание документа",
  },
  title: "Журнал аудита",
  description: "Действия с чувствительными данными",
  export: "Выгрузить журнал",
  search: "Поиск событий",
  searchPlaceholder: "Сотрудник, действие или IP",
  result: "Результат",
  allResults: "Все результаты",
  success: "Успешно",
  denied: "Отклонено",
  count: "Событий: {{count}}",
  col: {
    time: "Время",
    employee: "Сотрудник",
    action: "Действие",
    object: "Объект",
    ip: "IP-адрес",
  },
  empty: "Событий нет",
  emptyText: "Журнал пуст для выбранных фильтров",
} satisfies Dictionary<typeof source>;
