import { Archive, Award, BadgeCheck, Banknote, Bell, BookOpen, Boxes, Briefcase, Building2, Cake, CalendarDays, Camera, Car, ChartColumn, ChartLine, ChartPie, ClipboardList, Clock, Code, Coffee, Cog, Contact, CreditCard, Factory, FileText, Flag, Flame, FolderOpen, Forklift, Gift, Globe, GraduationCap, Hammer, Handshake, Hash, Headphones, Heart, Home, Landmark, Laptop, Leaf, Lightbulb, ListTodo, Lock, Mail, Map, MapPin, Megaphone, MessageCircle, MessagesSquare, Monitor, Music, Package, PackageCheck, Paintbrush, Palette, PartyPopper, Percent, Phone, Plane, Radio, Receipt, Rocket, Route, Send, Settings, Shield, ShoppingBag, ShoppingCart, Smartphone, Smile, Sparkles, Star, Store, Sun, Tag, Target, TrendingUp, Trophy, Truck, UserRound, Users, UsersRound, Wallet, Warehouse, Wrench, Zap, type LucideIcon } from 'lucide-react';
import { currentLanguage, type Language } from '../i18n';

type Named = [name: string, words: string];
export type ChannelIconGroup = 'work' | 'sales' | 'logistics' | 'communication' | 'people' | 'other';

/** The library a channel's icon is chosen from (as in ClickUp); `name` and `words` follow the interface language. Keys are stored; keep them stable. */
export interface ChannelIconEntry { key: string; Icon: LucideIcon; group: ChannelIconGroup; names: Record<Language, Named>; readonly name: string; readonly words: string }

const icon = (key: string, Icon: LucideIcon, group: ChannelIconGroup, uk: Named, ru: Named, en: Named): ChannelIconEntry => {
  const names: Record<Language, Named> = { uk, ru, en };
  return { key, Icon, group, names, get name() { return names[currentLanguage()][0]; }, get words() { return names[currentLanguage()][1]; } };
};

export const CHANNEL_ICONS: ChannelIconEntry[] = [
  icon('megaphone', Megaphone, 'work', ['Мегафон', 'оголошення новини рупор'], ['Мегафон', 'объявления новости рупор'], ['Megaphone', 'announcements news']),
  icon('briefcase', Briefcase, 'work', ['Портфель', 'робота офіс справи'], ['Портфель', 'работа офис дела'], ['Briefcase', 'work office business']),
  icon('building', Building2, 'work', ['Будівля', 'офіс компанія'], ['Здание', 'офис компания'], ['Building', 'office company']),
  icon('landmark', Landmark, 'work', ['Установа', 'банк адміністрація'], ['Учреждение', 'банк администрация'], ['Institution', 'bank administration']),
  icon('clipboard', ClipboardList, 'work', ['Планшет', 'список задачі'], ['Планшет', 'список задачи'], ['Clipboard', 'list tasks']),
  icon('list-todo', ListTodo, 'work', ['Задачі', 'список справи чекліст'], ['Задачи', 'список дела чеклист'], ['Tasks', 'to-do list checklist']),
  icon('calendar', CalendarDays, 'work', ['Календар', 'дата зустріч графік'], ['Календарь', 'дата встреча график'], ['Calendar', 'date meeting schedule']),
  icon('clock', Clock, 'work', ['Годинник', 'час зміна'], ['Часы', 'время смена'], ['Clock', 'time shift']),
  icon('target', Target, 'work', ['Ціль', 'план kpi'], ['Цель', 'план kpi'], ['Target', 'goal plan kpi']),
  icon('flag', Flag, 'work', ['Прапор', 'важливо етап'], ['Флаг', 'важно этап'], ['Flag', 'important milestone']),
  icon('rocket', Rocket, 'work', ['Ракета', 'запуск старт проєкт'], ['Ракета', 'запуск старт проект'], ['Rocket', 'launch start project']),
  icon('lightbulb', Lightbulb, 'work', ['Лампочка', 'ідеї пропозиції'], ['Лампочка', 'идеи предложения'], ['Light bulb', 'ideas suggestions']),
  icon('file', FileText, 'work', ['Документ', 'файл папери'], ['Документ', 'файл бумаги'], ['Document', 'file papers']),
  icon('folder', FolderOpen, 'work', ['Папка', 'файли архів'], ['Папка', 'файлы архив'], ['Folder', 'files archive']),
  icon('archive', Archive, 'work', ['Архів', 'зберігання'], ['Архив', 'хранение'], ['Archive', 'storage']),
  icon('book', BookOpen, 'work', ['Книга', 'навчання база знань'], ['Книга', 'обучение база знаний'], ['Book', 'learning knowledge base']),
  icon('graduation', GraduationCap, 'work', ['Навчання', 'курси школа'], ['Обучение', 'курсы школа'], ['Learning', 'courses school training']),
  icon('award', Award, 'work', ['Нагорода', 'досягнення'], ['Награда', 'достижения'], ['Award', 'achievements']),
  icon('trophy', Trophy, 'work', ['Кубок', 'перемога рейтинг'], ['Кубок', 'победа рейтинг'], ['Trophy', 'win ranking']),
  icon('star', Star, 'work', ['Зірка', 'вибране важливе'], ['Звезда', 'избранное важное'], ['Star', 'favourite important']),
  icon('cart', ShoppingCart, 'sales', ['Кошик', 'покупки замовлення'], ['Корзина', 'покупки заказы'], ['Cart', 'purchases orders']),
  icon('bag', ShoppingBag, 'sales', ['Пакет', 'покупки магазин'], ['Пакет', 'покупки магазин'], ['Bag', 'shopping store']),
  icon('store', Store, 'sales', ['Магазин', 'точка роздріб'], ['Магазин', 'точка розница'], ['Store', 'shop retail']),
  icon('tag', Tag, 'sales', ['Цінник', 'ціна товар'], ['Ценник', 'цена товар'], ['Price tag', 'price product']),
  icon('percent', Percent, 'sales', ['Знижка', 'відсоток акція'], ['Скидка', 'процент акция'], ['Discount', 'percent promotion sale']),
  icon('receipt', Receipt, 'sales', ['Чек', 'рахунок оплата'], ['Чек', 'счёт оплата'], ['Receipt', 'invoice payment']),
  icon('wallet', Wallet, 'sales', ['Гаманець', 'гроші фінанси'], ['Кошелёк', 'деньги финансы'], ['Wallet', 'money finance']),
  icon('card', CreditCard, 'sales', ['Картка', 'оплата банк'], ['Карта', 'оплата банк'], ['Card', 'payment bank']),
  icon('banknote', Banknote, 'sales', ['Купюра', 'гроші готівка'], ['Купюра', 'деньги наличные'], ['Banknote', 'money cash']),
  icon('chart-bar', ChartColumn, 'sales', ['Діаграма', 'звіт статистика'], ['Диаграмма', 'отчёт статистика'], ['Bar chart', 'report statistics']),
  icon('chart-line', ChartLine, 'sales', ['Графік', 'динаміка зростання'], ['График', 'динамика рост'], ['Line chart', 'trend growth']),
  icon('chart-pie', ChartPie, 'sales', ['Кругова діаграма', 'частка звіт'], ['Круговая диаграмма', 'доля отчёт'], ['Pie chart', 'share report']),
  icon('trending', TrendingUp, 'sales', ['Зростання', 'продажі план'], ['Рост', 'продажи план'], ['Growth', 'sales plan trending']),
  icon('handshake', Handshake, 'sales', ['Рукостискання', 'угода партнери клієнти'], ['Рукопожатие', 'сделка партнёры клиенты'], ['Handshake', 'deal partners clients']),
  icon('badge', BadgeCheck, 'sales', ['Позначка', 'підтверджено якість'], ['Отметка', 'подтверждено качество'], ['Badge', 'verified quality']),
  icon('truck', Truck, 'logistics', ['Вантажівка', 'доставка логістика'], ['Грузовик', 'доставка логистика'], ['Truck', 'delivery logistics']),
  icon('package', Package, 'logistics', ['Коробка', 'посилка товар'], ['Коробка', 'посылка товар'], ['Package', 'parcel goods']),
  icon('package-check', PackageCheck, 'logistics', ['Відвантажено', 'посилка доставлено'], ['Отгружено', 'посылка доставлено'], ['Shipped', 'parcel delivered']),
  icon('warehouse', Warehouse, 'logistics', ['Склад', 'зберігання запаси'], ['Склад', 'хранение запасы'], ['Warehouse', 'storage stock']),
  icon('boxes', Boxes, 'logistics', ['Ящики', 'запаси склад'], ['Ящики', 'запасы склад'], ['Boxes', 'stock warehouse']),
  icon('forklift', Forklift, 'logistics', ['Навантажувач', 'склад навантаження'], ['Погрузчик', 'склад погрузка'], ['Forklift', 'warehouse loading']),
  icon('pin', MapPin, 'logistics', ['Мітка', 'адреса місце'], ['Метка', 'адрес место'], ['Map pin', 'address place']),
  icon('map', Map, 'logistics', ['Мапа', 'маршрут регіон'], ['Карта', 'маршрут регион'], ['Map', 'route region']),
  icon('route', Route, 'logistics', ['Маршрут', 'шлях доставка'], ['Маршрут', 'путь доставка'], ['Route', 'path delivery']),
  icon('factory', Factory, 'logistics', ['Завод', 'виробництво'], ['Завод', 'производство'], ['Factory', 'production manufacturing']),
  icon('wrench', Wrench, 'logistics', ['Ключ', 'сервіс ремонт'], ['Ключ', 'сервис ремонт'], ['Wrench', 'service repair']),
  icon('hammer', Hammer, 'logistics', ['Молоток', 'ремонт будівництво'], ['Молоток', 'ремонт стройка'], ['Hammer', 'repair construction']),
  icon('settings', Settings, 'logistics', ['Шестерня', 'налаштування'], ['Шестерёнка', 'настройки'], ['Gear', 'settings']),
  icon('cog', Cog, 'logistics', ['Механізм', 'техніка процес'], ['Механизм', 'техника процесс'], ['Cog', 'machinery process']),
  icon('car', Car, 'logistics', ['Автомобіль', 'машина виїзд'], ['Автомобиль', 'машина выезд'], ['Car', 'vehicle field trip']),
  icon('plane', Plane, 'logistics', ['Літак', 'відрядження імпорт'], ['Самолёт', 'командировка импорт'], ['Plane', 'business trip import']),
  icon('chat', MessageCircle, 'communication', ['Повідомлення', 'чат спілкування'], ['Сообщение', 'чат общение'], ['Message', 'chat talk']),
  icon('chats', MessagesSquare, 'communication', ['Обговорення', 'чат бесіда'], ['Обсуждение', 'чат беседа'], ['Discussion', 'chat conversation']),
  icon('mail', Mail, 'communication', ['Пошта', 'листи email'], ['Почта', 'письма email'], ['Mail', 'letters email']),
  icon('phone', Phone, 'communication', ['Телефон', 'дзвінки call-центр'], ['Телефон', 'звонки call-центр'], ['Phone', 'calls call centre']),
  icon('headphones', Headphones, 'communication', ['Гарнітура', 'підтримка call-центр'], ['Гарнитура', 'поддержка call-центр'], ['Headset', 'support call centre']),
  icon('send', Send, 'communication', ['Надсилання', 'telegram розсилка'], ['Отправка', 'telegram рассылка'], ['Send', 'telegram mailing']),
  icon('bell', Bell, 'communication', ['Дзвіночок', 'сповіщення'], ['Колокольчик', 'уведомления'], ['Bell', 'notifications']),
  icon('radio', Radio, 'communication', ['Ефір', 'трансляція'], ['Эфир', 'трансляция'], ['Broadcast', 'radio stream']),
  icon('hash', Hash, 'communication', ['Решітка', 'канал тема'], ['Решётка', 'канал тема'], ['Hash', 'channel topic']),
  icon('users', Users, 'people', ['Команда', 'люди відділ'], ['Команда', 'люди отдел'], ['Team', 'people department']),
  icon('users-round', UsersRound, 'people', ['Група', 'люди колектив'], ['Группа', 'люди коллектив'], ['Group', 'people collective']),
  icon('user', UserRound, 'people', ['Людина', 'співробітник'], ['Человек', 'сотрудник'], ['Person', 'employee']),
  icon('contact', Contact, 'people', ['Контакт', 'візитка клієнт'], ['Контакт', 'визитка клиент'], ['Contact', 'business card client']),
  icon('heart', Heart, 'people', ['Серце', 'турбота hr'], ['Сердце', 'забота hr'], ['Heart', 'care hr']),
  icon('smile', Smile, 'people', ['Усмішка', 'настрій'], ['Улыбка', 'настроение'], ['Smile', 'mood']),
  icon('coffee', Coffee, 'people', ['Кава', 'відпочинок неформальне'], ['Кофе', 'отдых неформальное'], ['Coffee', 'break informal']),
  icon('party', PartyPopper, 'people', ['Свято', 'привітання події'], ['Праздник', 'поздравления события'], ['Party', 'congratulations events']),
  icon('gift', Gift, 'people', ['Подарунок', 'бонуси'], ['Подарок', 'бонусы'], ['Gift', 'bonuses']),
  icon('cake', Cake, 'people', ['Торт', 'дні народження'], ['Торт', 'дни рождения'], ['Cake', 'birthdays']),
  icon('sun', Sun, 'other', ['Сонце', 'ранок літо'], ['Солнце', 'утро лето'], ['Sun', 'morning summer']),
  icon('leaf', Leaf, 'other', ['Листок', 'природа еко'], ['Лист', 'природа эко'], ['Leaf', 'nature eco']),
  icon('globe', Globe, 'other', ['Глобус', 'світ експорт'], ['Глобус', 'мир экспорт'], ['Globe', 'world export']),
  icon('shield', Shield, 'other', ['Щит', 'безпека'], ['Щит', 'безопасность'], ['Shield', 'security']),
  icon('lock', Lock, 'other', ['Замок', 'закрите доступ'], ['Замок', 'закрытое доступ'], ['Lock', 'private access']),
  icon('zap', Zap, 'other', ['Блискавка', 'терміново енергія'], ['Молния', 'срочно энергия'], ['Lightning', 'urgent energy']),
  icon('flame', Flame, 'other', ['Вогонь', 'гаряче терміново'], ['Огонь', 'горячее срочно'], ['Flame', 'hot urgent']),
  icon('camera', Camera, 'other', ['Камера', 'фото'], ['Камера', 'фото'], ['Camera', 'photo']),
  icon('palette', Palette, 'other', ['Палітра', 'дизайн'], ['Палитра', 'дизайн'], ['Palette', 'design']),
  icon('brush', Paintbrush, 'other', ['Пензель', 'дизайн творчість'], ['Кисть', 'дизайн творчество'], ['Brush', 'design creative']),
  icon('music', Music, 'other', ['Музика', 'звук'], ['Музыка', 'звук'], ['Music', 'sound']),
  icon('code', Code, 'other', ['Код', 'розробка it'], ['Код', 'разработка it'], ['Code', 'development it']),
  icon('laptop', Laptop, 'other', ['Ноутбук', 'комп’ютер it'], ['Ноутбук', 'компьютер it'], ['Laptop', 'computer it']),
  icon('monitor', Monitor, 'other', ['Монітор', 'екран it'], ['Монитор', 'экран it'], ['Monitor', 'screen it']),
  icon('smartphone', Smartphone, 'other', ['Смартфон', 'мобільний'], ['Смартфон', 'мобильный'], ['Smartphone', 'mobile']),
  icon('sparkles', Sparkles, 'other', ['Іскри', 'нове ai'], ['Искры', 'новое ai'], ['Sparkles', 'new ai']),
  icon('home', Home, 'other', ['Дім', 'головне'], ['Дом', 'главное'], ['Home', 'main']),
];

const GROUP_NAMES: Record<ChannelIconGroup, Record<Language, string>> = {
  work: { uk: 'Робота', ru: 'Работа', en: 'Work' },
  sales: { uk: 'Продажі', ru: 'Продажи', en: 'Sales' },
  logistics: { uk: 'Склад і доставка', ru: 'Склад и доставка', en: 'Warehouse & delivery' },
  communication: { uk: 'Спілкування', ru: 'Общение', en: 'Communication' },
  people: { uk: 'Люди', ru: 'Люди', en: 'People' },
  other: { uk: 'Різне', ru: 'Разное', en: 'Other' },
};
export const CHANNEL_ICON_GROUPS: ChannelIconGroup[] = ['work', 'sales', 'logistics', 'communication', 'people', 'other'];
/** A group's heading in the interface language. */
export const channelIconGroupName = (group: ChannelIconGroup) => GROUP_NAMES[group][currentLanguage()];

export interface ChannelIconColor { key: string; hex: string; readonly name: string }
const color = (key: string, hex: string, names: Record<Language, string>): ChannelIconColor => ({ key, hex, get name() { return names[currentLanguage()]; } });
/** Tile colours: user-chosen data colours, white icon on top. */
export const CHANNEL_ICON_COLORS: ChannelIconColor[] = [
  color('slate', '#5f6b6a', { uk: 'Сірий', ru: 'Серый', en: 'Grey' }),
  color('teal', '#176f68', { uk: 'Бірюзовий', ru: 'Бирюзовый', en: 'Teal' }),
  color('green', '#39815a', { uk: 'Зелений', ru: 'Зелёный', en: 'Green' }),
  color('lime', '#6d8a1f', { uk: 'Оливковий', ru: 'Оливковый', en: 'Olive' }),
  color('amber', '#b7791f', { uk: 'Жовтий', ru: 'Жёлтый', en: 'Yellow' }),
  color('orange', '#c4622d', { uk: 'Помаранчевий', ru: 'Оранжевый', en: 'Orange' }),
  color('red', '#b54a4a', { uk: 'Червоний', ru: 'Красный', en: 'Red' }),
  color('pink', '#b4487f', { uk: 'Рожевий', ru: 'Розовый', en: 'Pink' }),
  color('violet', '#6f55b5', { uk: 'Фіолетовий', ru: 'Фиолетовый', en: 'Violet' }),
  color('blue', '#366e9e', { uk: 'Синій', ru: 'Синий', en: 'Blue' }),
];

/** The icon and colour stored as `<icon>:<colour>`, or null for none or a value this version doesn't know. */
export function parseChannelIcon(value: string | null | undefined): { entry: ChannelIconEntry; color: ChannelIconColor } | null {
  const [key, colorKey] = (value ?? '').split(':');
  const entry = CHANNEL_ICONS.find((item) => item.key === key);
  const color = CHANNEL_ICON_COLORS.find((item) => item.key === colorKey);
  return entry && color ? { entry, color } : null;
}

/** Icons whose name or search words, in the given language, contain the query (case-insensitive). */
export function searchChannelIcons(query: string, language: Language = currentLanguage()): ChannelIconEntry[] {
  const text = query.trim().toLowerCase();
  return text ? CHANNEL_ICONS.filter((item) => item.names[language].join(' ').toLowerCase().includes(text)) : CHANNEL_ICONS;
}
