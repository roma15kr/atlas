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
  actions: {
    cancel: 'Отмена', save: 'Сохранить', saving: 'Сохраняем…', close: 'Закрыть', delete: 'Удалить', edit: 'Редактировать', add: 'Добавить', adding: 'Добавляем…', create: 'Создать', retry: 'Повторить', done: 'Готово', back: 'Назад',
  },
  attachments: {
    uploading: 'Загружается…', attach: 'Прикрепить файл', pending: 'Прикреплённые файлы', input: 'Файлы: {{label}}', remove: 'Убрать {{name}}', download: 'Скачать {{name}}, {{size}}',
    rules: 'PDF, Word, Excel, CSV, PowerPoint, текст, ZIP или изображения до 20 МБ', notAllowed: '«{{name}}»: такой файл не прикрепить. Можно: {{rules}}.', tooBig: '«{{name}}» больше 20 МБ.', empty: '«{{name}}» пустой.',
  },
  reactions: {
    unknown: 'Такой реакции нет', limit: 'Не больше {{max}} разных реакций', label: 'Реакции', you: 'Вы', andMore: ' и ещё {{count}}', add: 'Добавить реакцию', picker: 'Выбор реакции', all: 'Все эмодзи', search: 'Найти эмодзи', searchPlaceholder: 'Найти: огонь, спасибо, готово…', nothing: 'Ничего не нашлось',
  },
  optional: 'Необязательно',
  noDepartment: 'Без отдела',
  loading: 'Загружаем…',
} satisfies Dictionary<typeof source>;
