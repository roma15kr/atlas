import type { Achievement, Alert, AuditEvent, ChannelMessage, Client, CompanyDocument, Deal, DealStage, Integration, Report, Role, Session, User, WorkTask } from '../types';

const ago = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

export const demoUsers: User[] = [
  { id: 'u1', username: 'director', fullName: 'Елена Морозова', role: 'DIRECTOR', department: 'Управление', jobTitle: 'Генеральный директор', specialty: 'Операционное управление', online: true, rating: 94, monitoringConsentAt: ago(500), kpis: [{ id: 'k1', name: 'Выручка компании', target: 12000000, actual: 9100000, unit: 'RUB', weight: 1, dueAt: ahead(11) }] },
  { id: 'u2', username: 'manager', fullName: 'Михаил Волков', role: 'MANAGER', department: 'Продажи', jobTitle: 'Руководитель отдела', specialty: 'B2B-продажи', online: true, rating: 88, monitoringConsentAt: ago(400), kpis: [{ id: 'k2', name: 'План отдела', target: 6000000, actual: 4280000, unit: 'RUB', weight: .7, dueAt: ahead(11) }, { id: 'k3', name: 'Конверсия', target: 38, actual: 34, unit: '%', weight: .3, dueAt: ahead(11) }] },
  { id: 'u3', username: 'employee', fullName: 'Анна Петрова', role: 'EMPLOYEE', department: 'Продажи', jobTitle: 'Аккаунт-менеджер', specialty: 'Развитие клиентов', online: true, rating: 91, monitoringConsentAt: ago(300), kpis: [{ id: 'k4', name: 'Закрытая выручка', target: 750000, actual: 485000, unit: 'RUB', weight: .6, dueAt: ahead(11) }, { id: 'k5', name: 'Встречи', target: 20, actual: 14, unit: 'встреч', weight: .4, dueAt: ahead(11) }] },
  { id: 'u4', username: 'alex', fullName: 'Алексей Ким', role: 'EMPLOYEE', department: 'Продажи', jobTitle: 'Менеджер по развитию', specialty: 'Партнёрские продажи', online: false, lastSeen: ago(3), rating: 73, kpis: [{ id: 'k6', name: 'Закрытая выручка', target: 650000, actual: 220000, unit: 'RUB', weight: .7, dueAt: ahead(11) }] },
  { id: 'u5', username: 'olga', fullName: 'Ольга Соколова', role: 'EMPLOYEE', department: 'Операции', jobTitle: 'Операционный менеджер', online: false, lastSeen: ago(19), rating: 86, monitoringConsentAt: ago(260), kpis: [{ id: 'k7', name: 'SLA заявок', target: 95, actual: 92, unit: '%', weight: 1, dueAt: ahead(11) }] },
  { id: 'u6', username: 'ivan', fullName: 'Иван Смирнов', role: 'EMPLOYEE', department: 'Финансы', jobTitle: 'Финансовый аналитик', online: true, rating: 82, monitoringConsentAt: ago(200), kpis: [{ id: 'k8', name: 'Точность прогноза', target: 95, actual: 89, unit: '%', weight: 1, dueAt: ahead(11) }] },
];

export const demoSessions: Record<string, Session> = Object.fromEntries(demoUsers.slice(0, 4).map((user) => [user.username, { user, accessToken: `demo-${user.role.toLowerCase()}` }])) as Record<string, Session>;

export const demoClients: Client[] = [
  { id: 'c1', name: 'София Тёрнер', companyName: 'Northstar Labs', email: 'sofia@northstar.example', phone: '+1 555 010 220', source: 'Рекомендация', status: 'ACTIVE', ownerId: 'u3', ownerName: 'Анна Петрова', notes: 'Расширение лицензий в четвёртом квартале.', updatedAt: ago(2) },
  { id: 'c2', name: 'Ной Уильямс', companyName: 'Vertex Studio', email: 'noah@vertex.example', phone: '+1 555 010 882', source: 'Сайт', status: 'NEW', ownerId: 'u4', ownerName: 'Алексей Ким', notes: 'Запросил демонстрацию продукта.', updatedAt: ago(6) },
  { id: 'c3', name: 'Изабелла Росси', companyName: 'Arbor Group', email: 'isabella@arbor.example', phone: '+39 02 555 018', source: 'Конференция', status: 'ACTIVE', ownerId: 'u3', ownerName: 'Анна Петрова', notes: 'Согласование с закупками.', updatedAt: ago(29) },
  { id: 'c4', name: 'Павел Орлов', companyName: 'Север Строй', email: 'p.orlov@severstroy.example', phone: '+7 495 555-18-12', source: 'Вебинар', status: 'PAUSED', ownerId: 'u2', ownerName: 'Михаил Волков', notes: 'Вернуться после утверждения бюджета.', updatedAt: ago(52) },
  { id: 'c5', name: 'Мария Белова', companyName: 'Forma', email: 'maria@forma.example', phone: '+7 812 555-72-10', source: 'Партнёр', status: 'ACTIVE', ownerId: 'u4', ownerName: 'Алексей Ким', notes: 'Готовы к пилоту на 15 мест.', updatedAt: ago(75) },
];

export const demoDeals: Deal[] = [
  { id: 'd1', clientId: 'c2', title: 'Стартовый пакет', companyName: 'Vertex Studio', ownerId: 'u4', ownerName: 'Алексей Ким', stage: 'APPLICATION', value: 1150000, currency: 'RUB', probability: 25, expectedCloseAt: ahead(32) },
  { id: 'd2', clientId: 'c5', title: 'Пилот на 15 мест', companyName: 'Forma', ownerId: 'u4', ownerName: 'Алексей Ким', stage: 'NEGOTIATION', value: 780000, currency: 'RUB', probability: 60, expectedCloseAt: ahead(14) },
  { id: 'd3', clientId: 'c1', title: 'Годовой план', companyName: 'Northstar Labs', ownerId: 'u3', ownerName: 'Анна Петрова', stage: 'NEGOTIATION', value: 3850000, currency: 'RUB', probability: 70, expectedCloseAt: ahead(18) },
  { id: 'd4', clientId: 'c3', title: 'Продление договора', companyName: 'Arbor Group', ownerId: 'u3', ownerName: 'Анна Петрова', stage: 'INVOICE', value: 2620000, currency: 'RUB', probability: 85, expectedCloseAt: ahead(9) },
  { id: 'd5', clientId: 'c4', title: 'Корпоративный контур', companyName: 'Север Строй', ownerId: 'u2', ownerName: 'Михаил Волков', stage: 'PAYMENT', value: 4400000, currency: 'RUB', probability: 95, expectedCloseAt: ahead(4) },
  { id: 'd6', clientId: 'c1', title: 'Дополнительные места', companyName: 'Northstar Labs', ownerId: 'u3', ownerName: 'Анна Петрова', stage: 'SHIPPED', value: 640000, currency: 'RUB', probability: 100, expectedCloseAt: ago(36) },
];

export const demoStages: DealStage[] = [
  { id: 's1', key: 'APPLICATION', name: 'Заявка', color: '#398078', sortOrder: 10, isClosed: false },
  { id: 's2', key: 'NEGOTIATION', name: 'Переговоры', color: '#3974a8', sortOrder: 20, isClosed: false },
  { id: 's3', key: 'INVOICE', name: 'Счёт выставлен', color: '#b07627', sortOrder: 30, isClosed: false },
  { id: 's4', key: 'PAYMENT', name: 'Оплата', color: '#765ca8', sortOrder: 40, isClosed: false },
  { id: 's5', key: 'SHIPPED', name: 'Отгрузка', color: '#3f7d52', sortOrder: 50, isClosed: true },
];

export const demoTasks: WorkTask[] = [
  { id: 't1', title: 'Подготовить коммерческое предложение', description: 'Сверить объём и условия поставки.', status: 'IN_PROGRESS', assigneeId: 'u3', assigneeName: 'Анна Петрова', dealId: 'd3', dealTitle: 'Northstar Labs · Годовой план', dueAt: ahead(2), priority: 'HIGH' },
  { id: 't2', title: 'Обновить недельный прогноз', description: 'Проверить следующие шаги по каждой сделке.', status: 'TODO', assigneeId: 'u3', assigneeName: 'Анна Петрова', dueAt: ahead(4), priority: 'NORMAL' },
  { id: 't3', title: 'Согласовать дату демонстрации', description: 'Отправить три доступных окна.', status: 'TODO', assigneeId: 'u4', assigneeName: 'Алексей Ким', dealId: 'd1', dealTitle: 'Vertex Studio · Стартовый пакет', dueAt: ahead(1), priority: 'HIGH' },
  { id: 't4', title: 'Загрузить протокол встречи', description: 'Добавить файл в карточку клиента.', status: 'DONE', assigneeId: 'u3', assigneeName: 'Анна Петрова', dealId: 'd4', dealTitle: 'Arbor Group · Продление', dueAt: ago(5), priority: 'NORMAL' },
  { id: 't5', title: 'Проверить договор пилота', description: 'Сверить реквизиты и приложение.', status: 'IN_PROGRESS', assigneeId: 'u4', assigneeName: 'Алексей Ким', dealId: 'd2', dealTitle: 'Forma · Пилот', dueAt: ahead(6), priority: 'NORMAL' },
];

export const demoDocuments: CompanyDocument[] = [
  { id: 'doc1', title: 'Регламент работы с CRM', fileName: 'crm-reglament.pdf', folder: 'Регламенты', mimeType: 'application/pdf', sizeBytes: 1840000, version: 3, visibility: 'COMPANY', uploadedBy: 'Елена Морозова', updatedAt: ago(30) },
  { id: 'doc2', title: 'Шаблон коммерческого предложения', fileName: 'offer-template.docx', folder: 'Шаблоны', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 620000, version: 7, visibility: 'DEPARTMENT', uploadedBy: 'Михаил Волков', updatedAt: ago(54) },
  { id: 'doc3', title: 'Политика мониторинга', fileName: 'monitoring-policy-2026.pdf', folder: 'Политики', mimeType: 'application/pdf', sizeBytes: 940000, version: 1, visibility: 'COMPANY', uploadedBy: 'Елена Морозова', updatedAt: ago(110) },
  { id: 'doc4', title: 'План отдела продаж', fileName: 'sales-plan-august.xlsx', folder: 'Продажи', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sizeBytes: 410000, version: 4, visibility: 'DEPARTMENT', uploadedBy: 'Михаил Волков', updatedAt: ago(9) },
];

export const demoAlerts: Alert[] = [
  { id: 'a1', severity: 'WARNING', category: 'DEADLINE_RISK', title: 'Риск по следующим шагам', summary: 'У двух активных сделок задачи подходят к сроку.', userName: 'Анна Петрова', createdAt: ago(2), acknowledged: false },
  { id: 'a2', severity: 'INFO', category: 'CONSENT', title: 'Нет согласия на мониторинг', summary: 'Сотрудник ещё не принял актуальную политику.', userName: 'Алексей Ким', createdAt: ago(24), acknowledged: false },
  { id: 'a3', severity: 'CRITICAL', category: 'EXPORT', title: 'Отклонена массовая выгрузка', summary: 'Роль сотрудника не позволяет экспортировать всю клиентскую базу.', userName: 'Алексей Ким', createdAt: ago(43), acknowledged: true },
];

export const demoReports: Report[] = [
  { id: 'r1', name: 'Недельный пульс продаж', targetUserId: 'u3', targetUserName: 'Анна Петрова', metrics: ['deals', 'conversion', 'kpi'], periodStart: ago(24 * 7), periodEnd: ago(0), schedule: 'WEEKLY', status: 'READY', createdAt: ago(6) },
  { id: 'r2', name: 'Результаты отдела за месяц', targetUserId: 'u2', targetUserName: 'Михаил Волков', metrics: ['deals', 'tasks', 'conversion'], periodStart: ago(24 * 30), periodEnd: ago(0), schedule: 'MONTHLY', status: 'PENDING', createdAt: ago(1) },
];

export const demoAchievements: Achievement[] = [
  { id: 'ach1', code: 'ON_TIME_10', name: 'Точно в срок', description: '10 задач подряд завершены без просрочки', points: 100, awardedAt: ago(96) },
  { id: 'ach2', code: 'ZERO_OVERDUE', name: 'Чистый горизонт', description: 'Месяц без просроченных задач', points: 150, awardedAt: ago(220) },
  { id: 'ach3', code: 'TOP_MONTH', name: 'Лучший результат', description: 'Первое место по взвешенному KPI', points: 250, awardedAt: ago(720) },
];

export const demoIntegrations: Integration[] = [
  { id: 'i1', provider: 'GMAIL', status: 'CONNECTED', displayName: 'employee@atlas-demo.example', lastSyncedAt: ago(.15) },
  { id: 'i2', provider: 'OUTLOOK', status: 'DISCONNECTED' },
  { id: 'i3', provider: 'TELEGRAM', status: 'DISCONNECTED' },
  { id: 'i4', provider: 'WHATSAPP', status: 'NEEDS_ATTENTION', displayName: 'Atlas Support', lastSyncedAt: ago(48) },
  { id: 'i5', provider: 'VIBER', status: 'DISCONNECTED' },
];

export const demoMessages: ChannelMessage[] = [
  { id: 'm1', channel: 'GMAIL', contact: 'София Тёрнер', subject: 'Re: Годовой план', preview: 'Спасибо, получили обновлённое предложение. Вернёмся с комментариями…', receivedAt: ago(.5), unread: true, clientId: 'c1' },
  { id: 'm2', channel: 'WHATSAPP', contact: 'Павел Орлов', subject: 'Корпоративный контур', preview: 'Коллеги подтвердили бюджет, можно запускать согласование договора.', receivedAt: ago(3), unread: true, clientId: 'c4' },
  { id: 'm3', channel: 'GMAIL', contact: 'Мария Белова', subject: 'Материалы пилота', preview: 'Пришлите, пожалуйста, требования к настройке рабочих мест.', receivedAt: ago(25), unread: false, clientId: 'c5' },
];

export const demoAudit: AuditEvent[] = [
  { id: 'au1', actorName: 'Елена Морозова', action: 'CRM_EXPORT', entityType: 'clients', ip: '10.2.4.18', createdAt: ago(1), result: 'SUCCESS' },
  { id: 'au2', actorName: 'Анна Петрова', action: 'CLIENT_VIEW', entityType: 'client', entityId: 'c1', ip: '10.2.4.36', createdAt: ago(2), result: 'SUCCESS' },
  { id: 'au3', actorName: 'Алексей Ким', action: 'CRM_EXPORT', entityType: 'clients', ip: '10.2.4.41', createdAt: ago(43), result: 'DENIED' },
  { id: 'au4', actorName: 'Михаил Волков', action: 'DOCUMENT_DOWNLOAD', entityType: 'document', entityId: 'doc2', ip: '10.2.4.22', createdAt: ago(50), result: 'SUCCESS' },
  { id: 'au5', actorName: 'Алексей Ким', action: 'CLIENT_VIEW', entityType: 'client', entityId: 'c5', ip: '10.2.4.41', createdAt: ago(75), result: 'SUCCESS' },
];

export const fallbackSession = (username: string, password: string): Session | null => {
  if (password !== 'AtlasDemo2026!') return null;
  return demoSessions[username] ?? null;
};

export const canManageTeam = (role: Role) => role === 'DIRECTOR' || role === 'MANAGER';
