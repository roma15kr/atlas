import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api, ApiError, sessionStore } from '../lib/api';
import {
  demoAchievements,
  demoAlerts,
  demoAudit,
  demoClients,
  demoDeals,
  demoDocuments,
  demoIntegrations,
  demoMessages,
  demoReports,
  demoStages,
  demoTasks,
  demoUsers,
  fallbackSession,
} from '../data/demo';
import type { Achievement, Alert, AuditEvent, ChannelMessage, Client, CompanyDocument, Deal, DealStage, Integration, Kpi, Report, Role, Session, User, WorkTask } from '../types';

const roleRank: Record<Role, number> = { EMPLOYEE: 1, MANAGER: 2, DIRECTOR: 3 };
export const DEMO_MODE = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true';

export interface CreateTeamMemberInput {
  username: string;
  password: string;
  fullName: string;
  role: Role;
  departmentName?: string;
  specialty?: string;
  jobTitle?: string;
  jobDescription?: string;
}

export function constrainTeamMemberInput(actor: User, input: CreateTeamMemberInput): CreateTeamMemberInput {
  if (actor.role === 'EMPLOYEE') throw new Error('Недостаточно прав для добавления сотрудников');
  if (actor.role === 'MANAGER') return { ...input, role: 'EMPLOYEE', departmentName: undefined };
  return { ...input, departmentName: input.departmentName?.trim() || undefined };
}

interface AuthValue {
  session: Session | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  consent: () => Promise<void>;
  mergeCurrentUser: (user: User) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

const normalizeUser = (source: Record<string, unknown>): User => ({
  id: String(source.id ?? ''),
  username: String(source.username ?? ''),
  fullName: String(source.fullName ?? source.full_name ?? source.username ?? ''),
  role: (source.role as Role) ?? 'EMPLOYEE',
  department: String(source.department ?? source.departmentName ?? source.department_name ?? 'Без отдела'),
  jobTitle: String(source.jobTitle ?? source.job_title ?? ''),
  jobDescription: (source.jobDescription ?? source.job_description) as string | undefined,
  specialty: source.specialty ? String(source.specialty) : undefined,
  avatarUrl: (source.avatarUrl ?? source.avatar_url) as string | undefined,
  online: Boolean(source.online ?? (source.presence as { status?: string } | undefined)?.status === 'ONLINE'),
  lastSeen: (source.lastSeen ?? source.last_seen ?? (source.presence as { lastSeenAt?: string } | undefined)?.lastSeenAt) as string | undefined,
  monitoringConsentAt: (source.monitoringConsentAt ?? source.monitoring_consent_at) as string | undefined,
  rating: Number(source.rating ?? 0),
  kpis: Array.isArray(source.kpis) ? source.kpis as Kpi[] : [],
});

const normalizeClient = (source: Record<string, unknown>): Client => {
  const owner = source.owner as { id?: string; fullName?: string } | undefined;
  return { id: String(source.id), name: String(source.name ?? ''), companyName: String(source.companyName ?? ''), email: String(source.email ?? ''), phone: String(source.phone ?? ''), source: String(source.source ?? ''), status: (source.status as Client['status']) ?? 'NEW', ownerId: String(source.ownerId ?? owner?.id ?? ''), ownerName: String(source.ownerName ?? owner?.fullName ?? ''), notes: String(source.notes ?? ''), updatedAt: String(source.updatedAt ?? new Date().toISOString()) };
};

const normalizeDeal = (source: Record<string, unknown>): Deal => {
  const owner = source.owner as { id?: string; fullName?: string } | undefined;
  const client = source.client as { companyName?: string } | undefined;
  return { id: String(source.id), clientId: String(source.clientId ?? ''), title: String(source.title ?? ''), companyName: String(source.companyName ?? client?.companyName ?? ''), ownerId: String(source.ownerId ?? owner?.id ?? ''), ownerName: String(source.ownerName ?? owner?.fullName ?? ''), stage: String(source.stage ?? 'APPLICATION'), value: Number(source.value ?? 0), currency: 'UAH', probability: Number(source.probability ?? 0), expectedCloseAt: String(source.expectedCloseAt ?? '') };
};

const normalizeTask = (source: Record<string, unknown>): WorkTask => {
  const assignee = source.assignee as { id?: string; fullName?: string } | undefined;
  const deal = source.deal as { id?: string; title?: string } | undefined;
  return { id: String(source.id), title: String(source.title ?? ''), description: String(source.description ?? ''), status: (source.status as WorkTask['status']) ?? 'TODO', assigneeId: String(source.assigneeId ?? assignee?.id ?? ''), assigneeName: String(source.assigneeName ?? assignee?.fullName ?? ''), dealId: (source.dealId ?? deal?.id) as string | undefined, dealTitle: (source.dealTitle ?? deal?.title) as string | undefined, dueAt: String(source.dueAt ?? ''), priority: (source.priority as WorkTask['priority']) ?? 'NORMAL' };
};

const normalizeDocument = (source: Record<string, unknown>): CompanyDocument => ({
  id: String(source.id), title: String(source.title ?? ''), fileName: String(source.fileName ?? ''), folder: String(source.folder ?? 'Общие'), mimeType: String(source.mimeType ?? 'application/octet-stream'), sizeBytes: Number(source.sizeBytes ?? 0), version: Number(source.version ?? 1), visibility: (source.visibility as CompanyDocument['visibility']) ?? 'PRIVATE', uploadedBy: String(source.uploadedBy ?? (source.uploader as { fullName?: string } | undefined)?.fullName ?? ''), updatedAt: String(source.updatedAt ?? source.createdAt ?? ''),
});

const normalizeReport = (source: Record<string, unknown>): Report => ({
  id: String(source.id), name: String(source.name ?? ''), targetUserId: source.targetUserId as string | undefined, targetUserName: String(source.targetUserName ?? (source.targetUser as { fullName?: string } | undefined)?.fullName ?? 'Команда'), metrics: (Array.isArray(source.metrics) ? source.metrics : []) as Report['metrics'], periodStart: String(source.periodStart ?? ''), periodEnd: String(source.periodEnd ?? ''), schedule: (source.schedule as Report['schedule']) ?? 'ONCE', status: (source.status as Report['status']) ?? 'PENDING', createdAt: String(source.createdAt ?? ''),
});

const normalizeAlert = (source: Record<string, unknown>): Alert => ({
  id: String(source.id), severity: (source.severity as Alert['severity']) ?? 'INFO', category: String(source.category ?? ''), title: String(source.title ?? ''), summary: String(source.summary ?? ''), userName: source.userName as string | undefined, createdAt: String(source.createdAt ?? ''), acknowledged: Boolean(source.acknowledged ?? source.acknowledgedAt),
});

const normalizeMessage = (source: Record<string, unknown>): ChannelMessage => ({
  id: String(source.id), channel: (source.channel as ChannelMessage['channel']) ?? 'INTERNAL', contact: String(source.contact ?? (source.direction === 'INBOUND' ? source.sender : source.recipient) ?? ''), subject: String(source.subject ?? 'Без темы'), preview: String(source.preview ?? source.body ?? ''), receivedAt: String(source.receivedAt ?? source.occurredAt ?? ''), unread: Boolean(source.unread ?? source.direction === 'INBOUND'), clientId: source.clientId as string | undefined,
});

const normalizeAudit = (source: Record<string, unknown>): AuditEvent => ({
  id: String(source.id), actorName: String(source.actorName ?? (source.actor as { fullName?: string } | undefined)?.fullName ?? 'Система'), action: String(source.action ?? ''), entityType: String(source.entityType ?? ''), entityId: source.entityId as string | undefined, ip: String(source.ip ?? ''), createdAt: String(source.createdAt ?? ''), result: (source.result as AuditEvent['result']) ?? (String(source.action).includes('DENIED') ? 'DENIED' : 'SUCCESS'),
});

const normalizeSession = (source: unknown): Session => {
  const value = source as Record<string, unknown>;
  const rawUser = (value.user ?? value.profile) as Record<string, unknown>;
  return {
    user: normalizeUser(rawUser),
    accessToken: String(value.accessToken ?? value.access_token ?? ''),
    refreshToken: (value.refreshToken ?? value.refresh_token) as string | undefined,
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => sessionStore.get());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unauthorized = () => setSession(null);
    window.addEventListener('atlas:unauthorized', unauthorized);
    return () => window.removeEventListener('atlas:unauthorized', unauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    try {
      let next: Session;
      try {
        next = normalizeSession(await api.login(username.trim(), password));
        if (!next.accessToken || !next.user.id) throw new Error('Некорректный ответ сервера');
      } catch (error) {
        const demo = DEMO_MODE ? fallbackSession(username.trim(), password) : null;
        if (!demo || (error instanceof ApiError && error.status > 0 && error.status < 500)) throw error;
        next = demo;
      }
      sessionStore.set(next);
      setSession(next);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    const current = sessionStore.get();
    try {
      if (current && !current.accessToken.startsWith('demo-')) await api.logout(current.refreshToken);
    } catch {
      // Local sign-out still completes when the server is unavailable.
    }
    sessionStore.set(null);
    setSession(null);
  }, []);

  const hasRole = useCallback((...roles: Role[]) => Boolean(session && roles.includes(session.user.role)), [session]);

  const consent = useCallback(async () => {
    if (!session) return;
    const date = new Date().toISOString();
    if (!session.accessToken.startsWith('demo-')) await api.update('team', 'me/consent', { accepted: true, policyVersion: '2026-01' });
    const next = { ...session, user: { ...session.user, monitoringConsentAt: date } };
    sessionStore.set(next);
    setSession(next);
  }, [session]);

  const mergeCurrentUser = useCallback((user: User) => {
    setSession((current) => {
      if (!current || current.user.id !== user.id) return current;
      const next = { ...current, user: { ...current.user, ...user } };
      sessionStore.set(next);
      return next;
    });
  }, []);

  return <AuthContext.Provider value={{ session, loading, login, logout, hasRole, consent, mergeCurrentUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
};

interface WorkspaceValue {
  users: User[];
  clients: Client[];
  deals: Deal[];
  stages: DealStage[];
  tasks: WorkTask[];
  documents: CompanyDocument[];
  reports: Report[];
  alerts: Alert[];
  achievements: Achievement[];
  integrations: Integration[];
  messages: ChannelMessage[];
  audit: AuditEvent[];
  dataStatus: 'loading' | 'ready' | 'offline';
  createTeamMember: (input: CreateTeamMemberInput) => Promise<User>;
  addClient: (client: Omit<Client, 'id' | 'updatedAt'>) => Promise<Client>;
  updateClient: (id: string, patch: Partial<Client>) => Promise<void>;
  addDeal: (deal: Omit<Deal, 'id'>) => Promise<void>;
  addStage: (stage: Omit<DealStage, 'id'>) => Promise<void>;
  moveDeal: (id: string, stage: string) => Promise<void>;
  moveTask: (id: string, status: WorkTask['status']) => Promise<void>;
  addTask: (task: Omit<WorkTask, 'id'>) => Promise<void>;
  addDocument: (file: File, folder: string, visibility: CompanyDocument['visibility']) => Promise<void>;
  addReport: (report: Omit<Report, 'id' | 'createdAt' | 'status'>) => Promise<void>;
  acknowledgeAlert: (id: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session, mergeCurrentUser } = useAuth();
  const initialDemo = Boolean(session?.accessToken.startsWith('demo-'));
  const [users, setUsers] = useState<User[]>(initialDemo ? demoUsers : []);
  const [clients, setClients] = useState<Client[]>(initialDemo ? demoClients : []);
  const [deals, setDeals] = useState<Deal[]>(initialDemo ? demoDeals : []);
  const [stages, setStages] = useState<DealStage[]>(initialDemo ? demoStages : []);
  const [tasks, setTasks] = useState<WorkTask[]>(initialDemo ? demoTasks : []);
  const [documents, setDocuments] = useState<CompanyDocument[]>(initialDemo ? demoDocuments : []);
  const [reports, setReports] = useState<Report[]>(initialDemo ? demoReports : []);
  const [alerts, setAlerts] = useState<Alert[]>(initialDemo ? demoAlerts : []);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [dataStatus, setDataStatus] = useState<'loading' | 'ready' | 'offline'>('ready');

  const isDemo = Boolean(session?.accessToken.startsWith('demo-'));

  useEffect(() => {
    if (!session || isDemo) return;
    let active = true;
    setDataStatus('loading');
    Promise.allSettled([
      api.list<Record<string, unknown>>('team'), api.list<Record<string, unknown>>('clients'), api.list<Record<string, unknown>>('deals'),
      api.list<Record<string, unknown>>('tasks'), api.list<CompanyDocument>('documents'),
      api.list<Report>('reports'), api.list<Alert>('alerts'), api.list<DealStage>('deals/stages'),
      api.list<Achievement>('achievements'), api.list<Integration>('integrations'), api.list<ChannelMessage>('messages'), api.list<AuditEvent>('audit'),
    ]).then((results) => {
      if (!active) return;
      const setters: Array<(value: unknown[]) => void> = [
        (items) => { const normalized = items.map((item) => normalizeUser(item as Record<string, unknown>)); setUsers(normalized); const current = normalized.find((user) => user.id === session.user.id); if (current) mergeCurrentUser(current); },
        (items) => setClients(items.map((item) => normalizeClient(item as Record<string, unknown>))),
        (items) => setDeals(items.map((item) => normalizeDeal(item as Record<string, unknown>))),
        (items) => setTasks(items.map((item) => normalizeTask(item as Record<string, unknown>))),
        (items) => setDocuments(items.map((item) => normalizeDocument(item as Record<string, unknown>))), (items) => setReports(items.map((item) => normalizeReport(item as Record<string, unknown>))),
        (items) => setAlerts(items.map((item) => normalizeAlert(item as Record<string, unknown>))), (items) => setStages(items as DealStage[]),
        (items) => setAchievements(items as Achievement[]), (items) => setIntegrations(items as Integration[]),
        (items) => setMessages(items.map((item) => normalizeMessage(item as Record<string, unknown>))), (items) => setAudit(items.map((item) => normalizeAudit(item as Record<string, unknown>))),
      ];
      let fulfilled = 0;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          setters[index](result.value);
          fulfilled += 1;
        }
      });
      setDataStatus(fulfilled ? 'ready' : 'offline');
    });
    return () => { active = false; };
  }, [session?.accessToken, session?.user.id, isDemo, mergeCurrentUser]);

  useEffect(() => {
    if (!session) return;
    if (isDemo) {
      setUsers(demoUsers); setClients(demoClients); setDeals(demoDeals); setStages(demoStages); setTasks(demoTasks);
      setDocuments(demoDocuments); setReports(demoReports); setAlerts(demoAlerts); setAchievements(demoAchievements);
      setIntegrations(demoIntegrations); setMessages(demoMessages); setAudit(demoAudit); setDataStatus('ready');
    } else {
      setUsers([]); setClients([]); setDeals([]); setStages([]); setTasks([]); setDocuments([]); setReports([]);
      setAlerts([]); setAchievements([]); setIntegrations([]); setMessages([]); setAudit([]);
    }
  }, [session?.accessToken, isDemo]);

  useEffect(() => {
    if (!session || isDemo) return;
    let socket: Socket | null = io({ path: '/socket.io', auth: { token: session.accessToken }, transports: ['websocket', 'polling'] });
    const updatePresence = (payload: { userId: string; online?: boolean; lastSeen?: string; status?: string; lastSeenAt?: string }) => {
      const online = payload.online ?? payload.status === 'ONLINE';
      setUsers((current) => current.map((user) => user.id === payload.userId ? { ...user, online, lastSeen: payload.lastSeen ?? payload.lastSeenAt } : user));
    };
    socket.on('presence:update', updatePresence);
    socket.on('presence:changed', updatePresence);
    socket.on('presence:snapshot', (items: Array<{ userId: string; online?: boolean; lastSeen?: string; status?: string; lastSeenAt?: string }>) => items.forEach(updatePresence));
    const heartbeat = window.setInterval(() => socket?.emit('presence:heartbeat', { at: Date.now() }), 45000);
    const active = () => socket?.emit('presence:heartbeat', { at: Date.now() });
    window.addEventListener('focus', active);
    document.addEventListener('visibilitychange', active);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener('focus', active);
      document.removeEventListener('visibilitychange', active);
      socket?.disconnect();
      socket = null;
    };
  }, [session?.accessToken, isDemo]);

  const remote = useCallback(async <T,>(action: () => Promise<T>) => {
    if (isDemo) return undefined;
    try { return await action(); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) setDataStatus('offline');
      throw error;
    }
  }, [isDemo]);

  const createTeamMember = useCallback(async (input: CreateTeamMemberInput) => {
    if (!session) throw new Error('Сессия завершена');
    const payload = constrainTeamMemberInput(session.user, input);
    const raw = await remote(() => api.create<Record<string, unknown>>('team', payload));
    const created = raw ? normalizeUser(raw) : {
      id: crypto.randomUUID(), username: payload.username, fullName: payload.fullName, role: payload.role,
      department: payload.departmentName ?? (session.user.role === 'MANAGER' ? session.user.department : 'Без отдела'), jobTitle: payload.jobTitle ?? '',
      jobDescription: payload.jobDescription, specialty: payload.specialty, online: false, rating: 0, kpis: [],
    };
    setUsers((current) => [...current, created].sort((left, right) => left.fullName.localeCompare(right.fullName, 'ru')));
    return created;
  }, [remote, session]);

  const addClient = useCallback(async (input: Omit<Client, 'id' | 'updatedAt'>) => {
    const created = await remote(() => api.create<Client>('clients', input));
    const client: Client = created ?? { ...input, id: crypto.randomUUID(), updatedAt: new Date().toISOString() };
    setClients((current) => [client, ...current]);
    return client;
  }, [remote]);

  const updateClient = useCallback(async (id: string, patch: Partial<Client>) => {
    await remote(() => api.update<Client>('clients', id, patch));
    setClients((current) => current.map((client) => client.id === id ? { ...client, ...patch, updatedAt: new Date().toISOString() } : client));
  }, [remote]);

  const addDeal = useCallback(async (input: Omit<Deal, 'id'>) => {
    const payload = { clientId: input.clientId, ownerId: input.ownerId, title: input.title, stage: input.stage, value: input.value, currency: input.currency, probability: input.probability, expectedCloseAt: input.expectedCloseAt };
    const raw = await remote(() => api.create<Record<string, unknown>>('deals', payload));
    setDeals((current) => [raw ? normalizeDeal(raw) : { ...input, id: crypto.randomUUID() }, ...current]);
  }, [remote]);

  const addStage = useCallback(async (input: Omit<DealStage, 'id'>) => {
    const created = await remote(() => api.create<DealStage>('deals/stages', input));
    setStages((current) => [...current, created ?? { ...input, id: crypto.randomUUID() }].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [remote]);

  const moveDeal = useCallback(async (id: string, stage: string) => {
    await remote(() => api.update<Deal>('deals', id, { stage }));
    setDeals((current) => current.map((deal) => deal.id === id ? { ...deal, stage } : deal));
  }, [remote]);

  const moveTask = useCallback(async (id: string, status: WorkTask['status']) => {
    await remote(() => api.update<WorkTask>('tasks', id, { status }));
    setTasks((current) => current.map((task) => task.id === id ? { ...task, status } : task));
  }, [remote]);

  const addTask = useCallback(async (input: Omit<WorkTask, 'id'>) => {
    const created = await remote(() => api.create<WorkTask>('tasks', input));
    setTasks((current) => [{ ...input, id: created?.id ?? crypto.randomUUID() }, ...current]);
  }, [remote]);

  const addDocument = useCallback(async (file: File, folder: string, visibility: CompanyDocument['visibility']) => {
    const created = await remote(() => api.uploadDocument(file, { folder, visibility }) as Promise<CompanyDocument>);
    setDocuments((current) => [{ id: created?.id ?? crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), fileName: file.name, folder, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, version: 1, visibility, uploadedBy: session?.user.fullName ?? '', updatedAt: new Date().toISOString() }, ...current]);
  }, [remote, session]);

  const addReport = useCallback(async (input: Omit<Report, 'id' | 'createdAt' | 'status'>) => {
    const created = await remote(() => api.create<Record<string, unknown>>('reports', input));
    setReports((current) => [created ? normalizeReport(created) : { ...input, id: crypto.randomUUID(), status: 'PENDING', createdAt: new Date().toISOString() }, ...current]);
  }, [remote]);

  const acknowledgeAlert = useCallback(async (id: string) => {
    await remote(() => api.update<Alert>('alerts', `${id}/acknowledge`, {}));
    setAlerts((current) => current.map((alert) => alert.id === id ? { ...alert, acknowledged: true } : alert));
  }, [remote]);

  const visibleUsers = useMemo(() => {
    if (!session || session.user.role === 'DIRECTOR') return users;
    if (session.user.role === 'MANAGER') return users.filter((user) => user.department === session.user.department);
    return users.filter((user) => user.id === session.user.id);
  }, [session, users]);
  const scoped = <T extends { ownerId?: string; assigneeId?: string }>(items: T[]) => {
    if (!session || roleRank[session.user.role] >= roleRank.MANAGER) return items;
    return items.filter((item) => item.ownerId === session.user.id || item.assigneeId === session.user.id);
  };
  const scopedClients = scoped(clients);
  const scopedDeals = scoped(deals);
  const scopedTasks = scoped(tasks);
  const accessibleClientIds = new Set(scopedClients.map((client) => client.id));
  const visibleAlerts = !session || session.user.role !== 'EMPLOYEE'
    ? alerts
    : alerts.filter((alert) => alert.userName === session.user.fullName);
  const visibleMessages = !session || session.user.role !== 'EMPLOYEE'
    ? messages
    : messages.filter((message) => !message.clientId || accessibleClientIds.has(message.clientId));

  const value = useMemo<WorkspaceValue>(() => ({
    users: visibleUsers,
    clients: scopedClients, deals: scopedDeals, stages, tasks: scopedTasks, documents, reports, alerts: visibleAlerts,
    achievements, integrations, messages: visibleMessages, audit,
    dataStatus, createTeamMember, addClient, updateClient, addDeal, addStage, moveDeal, moveTask, addTask, addDocument, addReport, acknowledgeAlert,
  // scoped is intentionally derived from current session and collections.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [visibleUsers, clients, deals, stages, tasks, documents, reports, alerts, achievements, integrations, messages, audit, dataStatus, createTeamMember, addClient, updateClient, addDeal, addStage, moveDeal, moveTask, addTask, addDocument, addReport, acknowledgeAlert, session]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = () => {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return value;
};
