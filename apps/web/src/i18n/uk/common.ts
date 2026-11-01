/** Words used across the app. Ukrainian is the source language: Russian and English follow its keys. */
export const common = {
  languages: { uk: 'Українська', ru: 'Русский', en: 'English' },
  roles: { DIRECTOR: 'Директор', MANAGER: 'Керівник', EMPLOYEE: 'Співробітник' },
  time: {
    noData: 'немає даних',
    minutesAgo_one: '{{count}} хв тому', minutesAgo_few: '{{count}} хв тому', minutesAgo_many: '{{count}} хв тому', minutesAgo_other: '{{count}} хв тому',
    hoursAgo_one: '{{count}} год тому', hoursAgo_few: '{{count}} год тому', hoursAgo_many: '{{count}} год тому', hoursAgo_other: '{{count}} год тому',
  },
  size: { bytes: '{{value}} Б', kilobytes: '{{value}} КБ', megabytes: '{{value}} МБ' },
  empty: '—',
  actions: {
    cancel: 'Скасувати', save: 'Зберегти', saving: 'Зберігаємо…', close: 'Закрити', delete: 'Видалити', edit: 'Редагувати', add: 'Додати', adding: 'Додаємо…', create: 'Створити', retry: 'Повторити', done: 'Готово', back: 'Назад',
  },
  attachments: {
    uploading: 'Завантажується…', attach: 'Прикріпити файл', pending: 'Прикріплені файли', input: 'Файли: {{label}}', remove: 'Прибрати {{name}}', download: 'Завантажити {{name}}, {{size}}',
    rules: 'PDF, Word, Excel, CSV, PowerPoint, текст, ZIP або зображення до 20 МБ', notAllowed: '«{{name}}»: такий файл не прикріпити. Можна: {{rules}}.', tooBig: '«{{name}}» більший за 20 МБ.', empty: '«{{name}}» порожній.',
  },
  reactions: {
    unknown: 'Такої реакції немає', limit: 'Не більше {{max}} різних реакцій', label: 'Реакції', you: 'Ви', andMore: ' і ще {{count}}', add: 'Додати реакцію', picker: 'Вибір реакції', all: 'Усі емодзі', search: 'Знайти емодзі', searchPlaceholder: 'Знайти: вогонь, дякую, готово…', nothing: 'Нічого не знайшлося',
  },
  optional: 'Необов’язково',
  loading: 'Завантажуємо…',
};
