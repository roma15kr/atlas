/** Audit log: sensitive actions with their result. */
export const audit = {
  action: {
    CRM_EXPORT: "Експорт CRM",
    CLIENT_VIEW: "Перегляд клієнта",
    DOCUMENT_DOWNLOAD: "Завантаження документа",
  },
  title: "Журнал аудиту",
  description: "Дії з чутливими даними",
  export: "Вивантажити журнал",
  search: "Пошук подій",
  searchPlaceholder: "Співробітник, дія або IP",
  result: "Результат",
  allResults: "Усі результати",
  success: "Успішно",
  denied: "Відхилено",
  count: "Подій: {{count}}",
  col: {
    time: "Час",
    employee: "Співробітник",
    action: "Дія",
    object: "Об’єкт",
    ip: "IP-адреса",
  },
  empty: "Подій немає",
  emptyText: "Журнал порожній для вибраних фільтрів",
};
