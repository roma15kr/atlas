import { Archive, Award, BadgeCheck, Banknote, Bell, BookOpen, Boxes, Briefcase, Building2, Cake, CalendarDays, Camera, Car, ChartColumn, ChartLine, ChartPie, ClipboardList, Clock, Code, Coffee, Cog, Contact, CreditCard, Factory, FileText, Flag, Flame, FolderOpen, Forklift, Gift, Globe, GraduationCap, Hammer, Handshake, Hash, Headphones, Heart, Home, Landmark, Laptop, Leaf, Lightbulb, ListTodo, Lock, Mail, Map, MapPin, Megaphone, MessageCircle, MessagesSquare, Monitor, Music, Package, PackageCheck, Paintbrush, Palette, PartyPopper, Percent, Phone, Plane, Radio, Receipt, Rocket, Route, Send, Settings, Shield, ShoppingBag, ShoppingCart, Smartphone, Smile, Sparkles, Star, Store, Sun, Tag, Target, TrendingUp, Trophy, Truck, UserRound, Users, UsersRound, Wallet, Warehouse, Wrench, Zap, type LucideIcon } from 'lucide-react';

/** The library a channel's icon is chosen from (as in ClickUp), with Russian names and search words. Keys are stored; keep them stable. */
export interface ChannelIconEntry { key: string; Icon: LucideIcon; name: string; words: string; group: string }
export const CHANNEL_ICONS: ChannelIconEntry[] = [
  { key: 'megaphone', Icon: Megaphone, name: 'Мегафон', words: 'объявления новости рупор', group: 'Работа' },
  { key: 'briefcase', Icon: Briefcase, name: 'Портфель', words: 'работа офис дела', group: 'Работа' },
  { key: 'building', Icon: Building2, name: 'Здание', words: 'офис компания', group: 'Работа' },
  { key: 'landmark', Icon: Landmark, name: 'Учреждение', words: 'банк администрация', group: 'Работа' },
  { key: 'clipboard', Icon: ClipboardList, name: 'Планшет', words: 'список задачи', group: 'Работа' },
  { key: 'list-todo', Icon: ListTodo, name: 'Задачи', words: 'список дела чеклист', group: 'Работа' },
  { key: 'calendar', Icon: CalendarDays, name: 'Календарь', words: 'дата встреча график', group: 'Работа' },
  { key: 'clock', Icon: Clock, name: 'Часы', words: 'время смена', group: 'Работа' },
  { key: 'target', Icon: Target, name: 'Цель', words: 'план kpi', group: 'Работа' },
  { key: 'flag', Icon: Flag, name: 'Флаг', words: 'важно этап', group: 'Работа' },
  { key: 'rocket', Icon: Rocket, name: 'Ракета', words: 'запуск старт проект', group: 'Работа' },
  { key: 'lightbulb', Icon: Lightbulb, name: 'Лампочка', words: 'идеи предложения', group: 'Работа' },
  { key: 'file', Icon: FileText, name: 'Документ', words: 'файл бумаги', group: 'Работа' },
  { key: 'folder', Icon: FolderOpen, name: 'Папка', words: 'файлы архив', group: 'Работа' },
  { key: 'archive', Icon: Archive, name: 'Архив', words: 'хранение', group: 'Работа' },
  { key: 'book', Icon: BookOpen, name: 'Книга', words: 'обучение база знаний', group: 'Работа' },
  { key: 'graduation', Icon: GraduationCap, name: 'Обучение', words: 'курсы школа', group: 'Работа' },
  { key: 'award', Icon: Award, name: 'Награда', words: 'достижения', group: 'Работа' },
  { key: 'trophy', Icon: Trophy, name: 'Кубок', words: 'победа рейтинг', group: 'Работа' },
  { key: 'star', Icon: Star, name: 'Звезда', words: 'избранное важное', group: 'Работа' },
  { key: 'cart', Icon: ShoppingCart, name: 'Корзина', words: 'покупки заказы', group: 'Продажи' },
  { key: 'bag', Icon: ShoppingBag, name: 'Пакет', words: 'покупки магазин', group: 'Продажи' },
  { key: 'store', Icon: Store, name: 'Магазин', words: 'точка розница', group: 'Продажи' },
  { key: 'tag', Icon: Tag, name: 'Ценник', words: 'цена товар', group: 'Продажи' },
  { key: 'percent', Icon: Percent, name: 'Скидка', words: 'процент акция', group: 'Продажи' },
  { key: 'receipt', Icon: Receipt, name: 'Чек', words: 'счёт оплата', group: 'Продажи' },
  { key: 'wallet', Icon: Wallet, name: 'Кошелёк', words: 'деньги финансы', group: 'Продажи' },
  { key: 'card', Icon: CreditCard, name: 'Карта', words: 'оплата банк', group: 'Продажи' },
  { key: 'banknote', Icon: Banknote, name: 'Купюра', words: 'деньги наличные', group: 'Продажи' },
  { key: 'chart-bar', Icon: ChartColumn, name: 'Диаграмма', words: 'отчёт статистика', group: 'Продажи' },
  { key: 'chart-line', Icon: ChartLine, name: 'График', words: 'динамика рост', group: 'Продажи' },
  { key: 'chart-pie', Icon: ChartPie, name: 'Круговая диаграмма', words: 'доля отчёт', group: 'Продажи' },
  { key: 'trending', Icon: TrendingUp, name: 'Рост', words: 'продажи план', group: 'Продажи' },
  { key: 'handshake', Icon: Handshake, name: 'Рукопожатие', words: 'сделка партнёры клиенты', group: 'Продажи' },
  { key: 'badge', Icon: BadgeCheck, name: 'Отметка', words: 'подтверждено качество', group: 'Продажи' },
  { key: 'truck', Icon: Truck, name: 'Грузовик', words: 'доставка логистика', group: 'Склад и доставка' },
  { key: 'package', Icon: Package, name: 'Коробка', words: 'посылка товар', group: 'Склад и доставка' },
  { key: 'package-check', Icon: PackageCheck, name: 'Отгружено', words: 'посылка доставлено', group: 'Склад и доставка' },
  { key: 'warehouse', Icon: Warehouse, name: 'Склад', words: 'хранение запасы', group: 'Склад и доставка' },
  { key: 'boxes', Icon: Boxes, name: 'Ящики', words: 'запасы склад', group: 'Склад и доставка' },
  { key: 'forklift', Icon: Forklift, name: 'Погрузчик', words: 'склад погрузка', group: 'Склад и доставка' },
  { key: 'pin', Icon: MapPin, name: 'Метка', words: 'адрес место', group: 'Склад и доставка' },
  { key: 'map', Icon: Map, name: 'Карта', words: 'маршрут регион', group: 'Склад и доставка' },
  { key: 'route', Icon: Route, name: 'Маршрут', words: 'путь доставка', group: 'Склад и доставка' },
  { key: 'factory', Icon: Factory, name: 'Завод', words: 'производство', group: 'Склад и доставка' },
  { key: 'wrench', Icon: Wrench, name: 'Ключ', words: 'сервис ремонт', group: 'Склад и доставка' },
  { key: 'hammer', Icon: Hammer, name: 'Молоток', words: 'ремонт стройка', group: 'Склад и доставка' },
  { key: 'settings', Icon: Settings, name: 'Шестерёнка', words: 'настройки', group: 'Склад и доставка' },
  { key: 'cog', Icon: Cog, name: 'Механизм', words: 'техника процесс', group: 'Склад и доставка' },
  { key: 'car', Icon: Car, name: 'Автомобиль', words: 'машина выезд', group: 'Склад и доставка' },
  { key: 'plane', Icon: Plane, name: 'Самолёт', words: 'командировка импорт', group: 'Склад и доставка' },
  { key: 'chat', Icon: MessageCircle, name: 'Сообщение', words: 'чат общение', group: 'Общение' },
  { key: 'chats', Icon: MessagesSquare, name: 'Обсуждение', words: 'чат беседа', group: 'Общение' },
  { key: 'mail', Icon: Mail, name: 'Почта', words: 'письма email', group: 'Общение' },
  { key: 'phone', Icon: Phone, name: 'Телефон', words: 'звонки call-центр', group: 'Общение' },
  { key: 'headphones', Icon: Headphones, name: 'Гарнитура', words: 'поддержка call-центр', group: 'Общение' },
  { key: 'send', Icon: Send, name: 'Отправка', words: 'telegram рассылка', group: 'Общение' },
  { key: 'bell', Icon: Bell, name: 'Колокольчик', words: 'уведомления', group: 'Общение' },
  { key: 'radio', Icon: Radio, name: 'Эфир', words: 'трансляция', group: 'Общение' },
  { key: 'hash', Icon: Hash, name: 'Решётка', words: 'канал тема', group: 'Общение' },
  { key: 'users', Icon: Users, name: 'Команда', words: 'люди отдел', group: 'Люди' },
  { key: 'users-round', Icon: UsersRound, name: 'Группа', words: 'люди коллектив', group: 'Люди' },
  { key: 'user', Icon: UserRound, name: 'Человек', words: 'сотрудник', group: 'Люди' },
  { key: 'contact', Icon: Contact, name: 'Контакт', words: 'визитка клиент', group: 'Люди' },
  { key: 'heart', Icon: Heart, name: 'Сердце', words: 'забота hr', group: 'Люди' },
  { key: 'smile', Icon: Smile, name: 'Улыбка', words: 'настроение', group: 'Люди' },
  { key: 'coffee', Icon: Coffee, name: 'Кофе', words: 'отдых неформальное', group: 'Люди' },
  { key: 'party', Icon: PartyPopper, name: 'Праздник', words: 'поздравления события', group: 'Люди' },
  { key: 'gift', Icon: Gift, name: 'Подарок', words: 'бонусы', group: 'Люди' },
  { key: 'cake', Icon: Cake, name: 'Торт', words: 'дни рождения', group: 'Люди' },
  { key: 'sun', Icon: Sun, name: 'Солнце', words: 'утро лето', group: 'Разное' },
  { key: 'leaf', Icon: Leaf, name: 'Лист', words: 'природа эко', group: 'Разное' },
  { key: 'globe', Icon: Globe, name: 'Глобус', words: 'мир экспорт', group: 'Разное' },
  { key: 'shield', Icon: Shield, name: 'Щит', words: 'безопасность', group: 'Разное' },
  { key: 'lock', Icon: Lock, name: 'Замок', words: 'закрытое доступ', group: 'Разное' },
  { key: 'zap', Icon: Zap, name: 'Молния', words: 'срочно энергия', group: 'Разное' },
  { key: 'flame', Icon: Flame, name: 'Огонь', words: 'горячее срочно', group: 'Разное' },
  { key: 'camera', Icon: Camera, name: 'Камера', words: 'фото', group: 'Разное' },
  { key: 'palette', Icon: Palette, name: 'Палитра', words: 'дизайн', group: 'Разное' },
  { key: 'brush', Icon: Paintbrush, name: 'Кисть', words: 'дизайн творчество', group: 'Разное' },
  { key: 'music', Icon: Music, name: 'Музыка', words: 'звук', group: 'Разное' },
  { key: 'code', Icon: Code, name: 'Код', words: 'разработка it', group: 'Разное' },
  { key: 'laptop', Icon: Laptop, name: 'Ноутбук', words: 'компьютер it', group: 'Разное' },
  { key: 'monitor', Icon: Monitor, name: 'Монитор', words: 'экран it', group: 'Разное' },
  { key: 'smartphone', Icon: Smartphone, name: 'Смартфон', words: 'мобильный', group: 'Разное' },
  { key: 'sparkles', Icon: Sparkles, name: 'Искры', words: 'новое ai', group: 'Разное' },
  { key: 'home', Icon: Home, name: 'Дом', words: 'главное', group: 'Разное' },
];
export const CHANNEL_ICON_GROUPS = ['Работа', 'Продажи', 'Склад и доставка', 'Общение', 'Люди', 'Разное'];

/** Tile colours: user-chosen data colours, white icon on top. */
export const CHANNEL_ICON_COLORS: Array<{ key: string; hex: string; name: string }> = [
  { key: 'slate', hex: '#5f6b6a', name: 'Серый' },
  { key: 'teal', hex: '#176f68', name: 'Бирюзовый' },
  { key: 'green', hex: '#39815a', name: 'Зелёный' },
  { key: 'lime', hex: '#6d8a1f', name: 'Оливковый' },
  { key: 'amber', hex: '#b7791f', name: 'Жёлтый' },
  { key: 'orange', hex: '#c4622d', name: 'Оранжевый' },
  { key: 'red', hex: '#b54a4a', name: 'Красный' },
  { key: 'pink', hex: '#b4487f', name: 'Розовый' },
  { key: 'violet', hex: '#6f55b5', name: 'Фиолетовый' },
  { key: 'blue', hex: '#366e9e', name: 'Синий' },
];

/** The icon and colour stored as `<icon>:<colour>`, or null for none or a value this version doesn't know. */
export function parseChannelIcon(value: string | null | undefined): { entry: ChannelIconEntry; color: { key: string; hex: string; name: string } } | null {
  const [key, colorKey] = (value ?? '').split(':');
  const entry = CHANNEL_ICONS.find((item) => item.key === key);
  const color = CHANNEL_ICON_COLORS.find((item) => item.key === colorKey);
  return entry && color ? { entry, color } : null;
}

/** Icons whose name or search words contain the query (case-insensitive). */
export function searchChannelIcons(query: string): ChannelIconEntry[] {
  const text = query.trim().toLowerCase();
  return text ? CHANNEL_ICONS.filter((item) => `${item.name} ${item.words}`.toLowerCase().includes(text)) : CHANNEL_ICONS;
}
