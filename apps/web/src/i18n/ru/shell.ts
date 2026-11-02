import type { shell as source } from '../uk/shell';
import type { Dictionary } from '../types';

export const shell = {
  nav: {
    dashboard: 'Дашборд', crm: 'CRM', sales: 'Воронка', tasks: 'Мои задачи', boards: 'Доски', documents: 'Документы',
    team: 'Сотрудники', reports: 'Отчёты', achievements: 'Достижения',
    messages: 'Сообщения', mail: 'Почта', telegram: 'Telegram', feedback: 'Обращения', audit: 'Аудит', profile: 'Профиль',
    groupTeam: 'КОМАНДА', groupCommunication: 'СВЯЗЬ И КОНТРОЛЬ',
  },
  pages: {
    dashboard: 'Дашборд', crm: 'CRM', client: 'Карточка клиента', sales: 'Воронка продаж', salesSettings: 'Настройка воронок',
    tasks: 'Мои задачи', boards: 'Доски задач', boardSettings: 'Настройка досок', documents: 'Документы', team: 'Команда',
    reports: 'Отчёты', achievements: 'Достижения', messages: 'Сообщения', mail: 'Почта', mailSettings: 'Настройки почты',
    telegram: 'Telegram', telegramSettings: 'Настройки Telegram', audit: 'Журнал аудита', feedback: 'Обращения', profile: 'Профиль',
  },
  frame: {
    mainNav: 'Основная навигация', openMenu: 'Открыть меню', closeMenu: 'Закрыть меню', expandMenu: 'Развернуть меню', collapseMenu: 'Свернуть меню',
    logout: 'Выйти', workspace: 'Рабочее пространство', search: 'Поиск', offlineData: 'Офлайн-данные', online: 'В сети · {{time}}',
    unreadIn: '{{label}}: непрочитанных {{count}}', quickNav: 'Быстрая навигация', unread: 'непрочитанных: {{count}}', tasks: 'Задачи', more: 'Ещё',
  },
  login: {
    visual: 'Рабочее пространство Atlas', photo: 'Современный офис команды Atlas', day: 'Рабочий день', tagline1: 'Команда, клиенты и решения', tagline2: 'в одном рабочем пространстве.',
    demoReady: 'Демо-команда готова', demoData: 'Данные для обзора загружены', welcome: 'Добро пожаловать', title: 'Вход в рабочее пространство',
    subtitle: 'Используйте корпоративную учётную запись', username: 'Логин', usernamePlaceholder: 'Ваш логин', password: 'Пароль', passwordPlaceholder: 'Ваш пароль',
    showPassword: 'Показать пароль', hidePassword: 'Скрыть пароль', capsLock: 'Включён Caps Lock', submit: 'Войти', submitting: 'Входим…',
    demoProfiles: 'Демо-профили', footer: 'Atlas Virtual Office · защищённое соединение', language: 'Язык',
    contactHint: 'Входите по логину (например, ivanenko), а не по телефону или email. Логин выдаёт руководитель.',
    cyrillicHint: 'Логин вводится латиницей — переключите раскладку.',
    errors: {
      network: 'Не удалось войти. Проверьте подключение к интернету и повторите попытку.',
      rateLimited: 'Слишком много попыток входа. Повторите через {{minutes}} мин.',
      invalid: 'Неверный логин или пароль. После 5 неудачных попыток вход блокируется на 15 минут.',
      noDepartment: 'Учётная запись руководителя не привязана к отделу. Обратитесь к директору.',
      badInput: 'Проверьте логин и пароль: пароль не короче 8 символов.',
      unavailable: 'Сервер сейчас недоступен. Повторите попытку через минуту.',
    },
  },
  bell: {
    title: 'Уведомления', unreadLabel_one: 'Уведомления: {{count}} непрочитанное', unreadLabel_few: 'Уведомления: {{count}} непрочитанных', unreadLabel_many: 'Уведомления: {{count}} непрочитанных', unreadLabel_other: 'Уведомления: {{count}} непрочитанных',
    fresh_one: '{{count}} новое', fresh_few: '{{count}} новых', fresh_many: '{{count}} новых', fresh_other: '{{count}} новых',
    readAll: 'Прочитать все', unreadMark: 'Не прочитано', emptyTitle: 'Уведомлений нет', emptyText: 'Здесь появятся задачи, сообщения и напоминания', settings: 'Настройки уведомлений',
  },
  feedback: {
    button: 'Сообщить о проблеме', buttonTitle: 'Сообщить о проблеме (Ctrl+Shift+F)',
    kinds: { PROBLEM: 'Проблема', COMPLAINT: 'Жалоба', IDEA: 'Идея' },
    title: 'Сообщить о проблеме', description: 'Пишите своими словами — на украинском или русском', kind: 'Тип обращения',
    what: 'Что случилось?', counter: '{{length}} / {{max}} · Страница: {{page}}', placeholder: 'Что вы делали, что ожидали и что произошло',
    shotAlt: 'Предпросмотр снимка экрана', shotAttached: 'Снимок экрана приложен', shotNote: 'Страница до открытия этого окна. Поля паролей скрыты.',
    shotRemove: 'Не прикладывать снимок', shotNotAttached: 'Снимок экрана не приложен', shotAdd: 'Приложить снимок', shotFailed: 'Снимок экрана не удалось сделать',
    shotFailedNote: 'Опишите, что было на экране, — обращение всё равно можно отправить.',
    log: 'Приложить технический журнал', logNote: 'Ошибки и запросы к серверу за последние 15 минут — без введённого текста и данных записей.', logContents: 'Что входит в журнал',
    privacy: 'Обращение видят только директора компании. В GitHub попадёт обезличенный перевод.',
    cancel: 'Отмена', send: 'Отправить', sending: 'Отправляем…',
    sentTitle: 'Обращение отправлено', sentText: 'Спасибо! Команда разработки получит обращение в переведённом и обезличенном виде. Статус виден в разделе «Мои обращения».',
    close: 'Закрыть', mine: 'Мои обращения', tooMany: 'Слишком много обращений, попробуйте позже', failed: 'Обращение не отправлено. Попробуйте ещё раз.',
    tooShort: 'Опишите проблему подробнее', tooLong: 'Не длиннее {{max}} символов', notFound: 'Обращение не найдено',
    logSummary: {
      errors: 'Ошибок приложения: {{errors}}; запросов к серверу: {{requests}}', failed: ' (с ошибкой: {{failed}})',
      routes: 'Переходов по страницам: {{routes}}; состояние подключения к серверу', version: 'Версия Atlas {{version}}, {{viewport}}, {{language}}, {{timeZone}}',
    },
  },
} satisfies Dictionary<typeof source>;
