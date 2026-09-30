import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api, ApiError, listAll, sessionStore } from '../lib/api';
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
  demoFunnels,
  demoTaskBoards,
  demoTasks,
  demoUsers,
  canManageBoard,
  canOpenBoard,
  canOpenFunnel,
  demoBoardUsers,
  fallbackSession,
} from '../data/demo';
import type { Achievement, Alert, AuditEvent, BoardUser, ChannelMessage, Client, CompanyDocument, Deal, DealStage, DealStageSummary, Funnel, FunnelAccessMode, Integration, Kpi, Report, Role, Session, TaskAssignee, TaskBoard, TaskCategory, TaskPriority, TaskStage, TaskStageSummary, User, WorkTask } from '../types';

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
  departmentId: (source.departmentId ?? source.department_id ?? undefined) as string | undefined,
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
  const stage = (source.stage ?? {}) as Partial<DealStageSummary>;
  return {
    id: String(source.id), clientId: String(source.clientId ?? ''), title: String(source.title ?? ''),
    companyName: String(source.companyName ?? client?.companyName ?? ''), ownerId: String(source.ownerId ?? owner?.id ?? ''),
    ownerName: String(source.ownerName ?? owner?.fullName ?? ''), funnelId: String(source.funnelId ?? ''),
    stage: { id: String(stage.id ?? ''), name: String(stage.name ?? ''), color: String(stage.color ?? '#6B7280'), outcome: stage.outcome ?? 'OPEN' },
    value: Number(source.value ?? 0), currency: 'UAH', probability: Number(source.probability ?? 0), expectedCloseAt: String(source.expectedCloseAt ?? ''),
  };
};

const normalizeTask = (source: Record<string, unknown>): WorkTask => {
  const deal = source.deal as { id?: string; title?: string } | null | undefined;
  const stage = (source.stage ?? {}) as Partial<TaskStageSummary>;
  const assignees = Array.isArray(source.assignees) ? source.assignees as Array<Record<string, unknown>> : [];
  return {
    id: String(source.id), title: String(source.title ?? ''), description: String(source.description ?? ''),
    boardId: String(source.boardId ?? ''), boardName: String(source.boardName ?? ''),
    stage: { id: String(stage.id ?? ''), name: String(stage.name ?? ''), color: String(stage.color ?? '#6B7280'), category: stage.category ?? 'TODO' },
    assignees: assignees.map((item) => ({ id: String(item.id), fullName: String(item.fullName ?? ''), avatarUrl: (item.avatarUrl ?? undefined) as string | undefined })),
    createdBy: (source.createdBy ?? undefined) as string | undefined, canDelete: source.canDelete === undefined ? undefined : Boolean(source.canDelete),
    dealId: (source.dealId ?? deal?.id ?? undefined) as string | undefined, dealTitle: (source.dealTitle ?? deal?.title ?? undefined) as string | undefined,
    dueAt: String(source.dueAt ?? ''), completedAt: (source.completedAt ?? null) as string | null, priority: (source.priority as TaskPriority) ?? 'NORMAL',
  };
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

export type StageInput = Pick<DealStage, 'name' | 'color' | 'outcome'>;
export interface FunnelAccessInput { accessMode: FunnelAccessMode; departmentIds: string[]; userIds: string[] }

/** Director-only funnel configuration; the API rejects and audits attempts by other roles. */
export interface FunnelConfig {
  createFunnel: (input: { name: string; stages: StageInput[] } & Partial<FunnelAccessInput>) => Promise<string>;
  updateFunnel: (id: string, patch: { name?: string; sortOrder?: number }) => Promise<void>;
  deleteFunnel: (id: string) => Promise<void>;
  setFunnelAccess: (id: string, access: FunnelAccessInput) => Promise<void>;
  addStage: (funnelId: string, stage: StageInput) => Promise<void>;
  updateStage: (funnelId: string, stageId: string, patch: Partial<StageInput>) => Promise<void>;
  reorderStages: (funnelId: string, stageIds: string[]) => Promise<void>;
  deleteStage: (funnelId: string, stageId: string, moveToStageId?: string) => Promise<void>;
}

export interface TaskInput {
  boardId: string;
  stageId?: string;
  assigneeIds: string[];
  title: string;
  description?: string;
  dueAt?: string | null;
  priority: TaskPriority;
  dealId?: string | null;
}

export interface BoardStageInput { name: string; color: string; category: TaskCategory }

/** Board configuration for directors and department heads; the API rejects and audits anyone else. */
export interface TaskBoardConfig {
  createBoard: (input: { name: string; departmentId: string | null; stages: BoardStageInput[]; memberIds?: string[] }) => Promise<string>;
  updateBoard: (id: string, patch: { name?: string; sortOrder?: number }) => Promise<void>;
  deleteBoard: (id: string) => Promise<void>;
  setMembers: (id: string, userIds: string[]) => Promise<void>;
  addStage: (boardId: string, stage: BoardStageInput) => Promise<void>;
  updateStage: (boardId: string, stageId: string, patch: Partial<BoardStageInput>) => Promise<void>;
  reorderStages: (boardId: string, stageIds: string[]) => Promise<void>;
  deleteStage: (boardId: string, stageId: string, moveToStageId?: string) => Promise<void>;
  /** Everyone who can open the board, i.e. who can be assigned to its tasks. */
  boardUsers: (boardId: string) => Promise<BoardUser[]>;
  /** Active non-director users of any department, for choosing extra members. */
  memberCandidates: (boardId: string) => Promise<BoardUser[]>;
}

interface WorkspaceValue {
  users: User[];
  clients: Client[];
  deals: Deal[];
  /** Funnels the current user may open, each with ordered stages. */
  funnels: Funnel[];
  /** Task boards the current user may open, each with ordered stages. */
  taskBoards: TaskBoard[];
  /** Every task on those boards. */
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
  moveDeal: (id: string, stageId: string, funnelId?: string) => Promise<void>;
  funnelConfig: FunnelConfig;
  addTask: (input: TaskInput) => Promise<WorkTask>;
  updateTask: (id: string, patch: Partial<TaskInput>) => Promise<void>;
  /** Moves a task to a stage, optionally on another board. */
  moveTask: (id: string, stageId: string, boardId?: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  taskBoardConfig: TaskBoardConfig;
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
  const [funnels, setFunnels] = useState<Funnel[]>(initialDemo ? demoFunnels : []);
  const [tasks, setTasks] = useState<WorkTask[]>(initialDemo ? demoTasks : []);
  const [taskBoards, setTaskBoards] = useState<TaskBoard[]>(initialDemo ? demoTaskBoards : []);
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
      api.list<Record<string, unknown>>('team'), api.list<Record<string, unknown>>('clients'), listAll<Record<string, unknown>>('deals'),
      listAll<Record<string, unknown>>('tasks'), api.list<CompanyDocument>('documents'),
      api.list<Report>('reports'), api.list<Alert>('alerts'), api.list<Funnel>('funnels'),
      api.list<Achievement>('achievements'), api.list<Integration>('integrations'), api.list<ChannelMessage>('messages'), api.list<AuditEvent>('audit'),
      api.list<TaskBoard>('task-boards'),
    ]).then((results) => {
      if (!active) return;
      const setters: Array<(value: unknown[]) => void> = [
        (items) => { const normalized = items.map((item) => normalizeUser(item as Record<string, unknown>)); setUsers(normalized); const current = normalized.find((user) => user.id === session.user.id); if (current) mergeCurrentUser(current); },
        (items) => setClients(items.map((item) => normalizeClient(item as Record<string, unknown>))),
        (items) => setDeals(items.map((item) => normalizeDeal(item as Record<string, unknown>))),
        (items) => setTasks(items.map((item) => normalizeTask(item as Record<string, unknown>))),
        (items) => setDocuments(items.map((item) => normalizeDocument(item as Record<string, unknown>))), (items) => setReports(items.map((item) => normalizeReport(item as Record<string, unknown>))),
        (items) => setAlerts(items.map((item) => normalizeAlert(item as Record<string, unknown>))), (items) => setFunnels(items as Funnel[]),
        (items) => setAchievements(items as Achievement[]), (items) => setIntegrations(items as Integration[]),
        (items) => setMessages(items.map((item) => normalizeMessage(item as Record<string, unknown>))), (items) => setAudit(items.map((item) => normalizeAudit(item as Record<string, unknown>))),
        (items) => setTaskBoards(items as TaskBoard[]),
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
      setUsers(demoUsers); setClients(demoClients); setDeals(demoDeals); setFunnels(demoFunnels); setTasks(demoTasks); setTaskBoards(demoTaskBoards);
      setDocuments(demoDocuments); setReports(demoReports); setAlerts(demoAlerts); setAchievements(demoAchievements);
      setIntegrations(demoIntegrations); setMessages(demoMessages); setAudit(demoAudit); setDataStatus('ready');
    } else {
      setUsers([]); setClients([]); setDeals([]); setFunnels([]); setTasks([]); setTaskBoards([]); setDocuments([]); setReports([]);
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
    const payload = { clientId: input.clientId, ownerId: input.ownerId, title: input.title, funnelId: input.funnelId, stageId: input.stage.id || undefined, value: input.value, currency: input.currency, probability: input.probability, expectedCloseAt: input.expectedCloseAt };
    const raw = await remote(() => api.create<Record<string, unknown>>('deals', payload));
    setDeals((current) => [raw ? normalizeDeal(raw) : { ...input, id: crypto.randomUUID() }, ...current]);
  }, [remote]);

  const moveDeal = useCallback(async (id: string, stageId: string, funnelId?: string) => {
    const raw = await remote(() => api.update<Record<string, unknown>>('deals', id, funnelId ? { funnelId, stageId } : { stageId }));
    setDeals((current) => current.map((deal) => {
      if (deal.id !== id) return deal;
      if (raw) return normalizeDeal(raw);
      const stage = funnels.flatMap((funnel) => funnel.stages).find((item) => item.id === stageId);
      return stage ? { ...deal, funnelId: stage.funnelId, stage: { id: stage.id, name: stage.name, color: stage.color, outcome: stage.outcome } } : deal;
    }));
  }, [remote, funnels]);

  const reloadFunnels = useCallback(async (reloadDeals = false) => {
    const [nextFunnels, nextDeals] = await Promise.all([
      api.list<Funnel>('funnels'),
      reloadDeals ? listAll<Record<string, unknown>>('deals') : Promise.resolve(null),
    ]);
    setFunnels(nextFunnels);
    if (nextDeals) setDeals(nextDeals.map(normalizeDeal));
  }, []);

  // Demo sessions apply the same rules locally; real sessions persist through the API and reload.
  const configure = useCallback(async (action: () => Promise<unknown>, local: (current: Funnel[]) => Funnel[], reloadDeals = false) => {
    if (isDemo) { setFunnels((current) => local(current)); return; }
    await remote(action);
    await reloadFunnels(reloadDeals);
  }, [isDemo, remote, reloadFunnels]);

  const funnelConfig = useMemo<FunnelConfig>(() => {
    const withStages = (current: Funnel[], funnelId: string, update: (stages: DealStage[]) => DealStage[]) =>
      current.map((funnel) => funnel.id === funnelId ? { ...funnel, stages: update(funnel.stages) } : funnel);
    return {
      createFunnel: async (input) => {
        let id: string = crypto.randomUUID();
        await configure(async () => { id = (await api.create<{ id: string }>('funnels', input)).id; }, (current) => [...current, {
          id, name: input.name, sortOrder: Math.max(0, ...current.map((funnel) => funnel.sortOrder)) + 10,
          accessMode: input.accessMode ?? 'COMPANY', departmentIds: input.departmentIds ?? [], userIds: input.userIds ?? [],
          stages: input.stages.map((stage, index) => ({ ...stage, id: crypto.randomUUID(), funnelId: id, sortOrder: (index + 1) * 10, dealCount: 0 })),
        }]);
        return id;
      },
      updateFunnel: (id, patch) => configure(() => api.update('funnels', id, patch),
        (current) => current.map((funnel) => funnel.id === id ? { ...funnel, ...patch } : funnel).sort((a, b) => a.sortOrder - b.sortOrder)),
      deleteFunnel: (id) => configure(() => api.remove('funnels', id), (current) => current.filter((funnel) => funnel.id !== id)),
      setFunnelAccess: (id, access) => configure(() => api.put(`/funnels/${id}/access`, access),
        (current) => current.map((funnel) => funnel.id === id ? { ...funnel, ...access } : funnel)),
      addStage: (funnelId, stage) => configure(() => api.create(`funnels/${funnelId}/stages`, stage),
        (current) => withStages(current, funnelId, (stages) => [...stages, { ...stage, id: crypto.randomUUID(), funnelId, sortOrder: Math.max(0, ...stages.map((item) => item.sortOrder)) + 10, dealCount: 0 }])),
      updateStage: (funnelId, stageId, patch) => configure(() => api.update(`funnels/${funnelId}/stages`, stageId, patch),
        (current) => withStages(current, funnelId, (stages) => stages.map((stage) => stage.id === stageId ? { ...stage, ...patch } : stage)), true),
      reorderStages: (funnelId, stageIds) => configure(() => api.put(`/funnels/${funnelId}/stages/order`, { stageIds }),
        (current) => withStages(current, funnelId, (stages) => stageIds.map((id, index) => ({ ...stages.find((stage) => stage.id === id)!, sortOrder: (index + 1) * 10 })))),
      deleteStage: async (funnelId, stageId, moveToStageId) => {
        const query = moveToStageId ? `?moveToStageId=${encodeURIComponent(moveToStageId)}` : '';
        await configure(() => api.remove(`funnels/${funnelId}/stages`, `${stageId}${query}`),
          (current) => withStages(current, funnelId, (stages) => stages.filter((stage) => stage.id !== stageId)), true);
        if (isDemo && moveToStageId) {
          const target = funnels.flatMap((funnel) => funnel.stages).find((stage) => stage.id === moveToStageId);
          if (target) setDeals((current) => current.map((deal) => deal.stage.id === stageId ? { ...deal, stage: { id: target.id, name: target.name, color: target.color, outcome: target.outcome } } : deal));
        }
      },
    };
  }, [configure, funnels, isDemo]);

  const stageSummary = (stage: TaskStage): TaskStageSummary => ({ id: stage.id, name: stage.name, color: stage.color, category: stage.category });
  const demoPeople = (ids: string[]): TaskAssignee[] => ids.map((id) => ({ id, fullName: demoUsers.find((user) => user.id === id)?.fullName ?? '' }));

  /** Demo sessions apply the server's task rules locally: default stage, default assignee and completion time. */
  const applyLocally = useCallback((task: WorkTask, patch: Partial<TaskInput>): WorkTask => {
    const board = taskBoards.find((item) => item.id === (patch.boardId ?? task.boardId));
    const stage = board?.stages.find((item) => item.id === patch.stageId);
    const next: WorkTask = {
      ...task,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt ?? '' } : {}),
      ...(patch.assigneeIds ? { assignees: demoPeople(patch.assigneeIds) } : {}),
    };
    if (!board || !stage) return next;
    const wasDone = task.stage.category === 'DONE';
    const isDone = stage.category === 'DONE';
    return { ...next, boardId: board.id, boardName: board.name, stage: stageSummary(stage), completedAt: wasDone === isDone ? task.completedAt : isDone ? new Date().toISOString() : null };
  }, [taskBoards]);

  const addTask = useCallback(async (input: TaskInput) => {
    const raw = await remote(() => api.create<Record<string, unknown>>('tasks', input));
    let created: WorkTask;
    if (raw) created = normalizeTask(raw);
    else {
      const board = taskBoards.find((item) => item.id === input.boardId);
      const stage = board?.stages.find((item) => item.id === input.stageId) ?? board?.stages.find((item) => item.category === 'TODO');
      if (!board || !stage) throw new Error('Доска недоступна');
      created = {
        id: crypto.randomUUID(), title: input.title, description: input.description ?? '', boardId: board.id, boardName: board.name,
        stage: stageSummary(stage), assignees: demoPeople(input.assigneeIds.length ? input.assigneeIds : [session!.user.id]), createdBy: session?.user.id,
        dueAt: input.dueAt ?? '', completedAt: stage.category === 'DONE' ? new Date().toISOString() : null, priority: input.priority,
      };
    }
    setTasks((current) => [created, ...current]);
    return created;
  }, [remote, session, taskBoards]);

  const updateTask = useCallback(async (id: string, patch: Partial<TaskInput>) => {
    const raw = await remote(() => api.update<Record<string, unknown>>('tasks', id, patch));
    setTasks((current) => current.map((task) => task.id !== id ? task : raw ? normalizeTask(raw) : applyLocally(task, patch)));
  }, [remote, applyLocally]);

  const moveTask = useCallback((id: string, stageId: string, boardId?: string) => updateTask(id, boardId ? { boardId, stageId } : { stageId }), [updateTask]);

  const deleteTask = useCallback(async (id: string) => {
    await remote(() => api.remove('tasks', id));
    setTasks((current) => current.filter((task) => task.id !== id));
  }, [remote]);

  const reloadTaskBoards = useCallback(async (reloadTasks = false) => {
    const [nextBoards, nextTasks] = await Promise.all([
      api.list<TaskBoard>('task-boards'),
      reloadTasks ? listAll<Record<string, unknown>>('tasks') : Promise.resolve(null),
    ]);
    setTaskBoards(nextBoards);
    if (nextTasks) setTasks(nextTasks.map(normalizeTask));
  }, []);

  const configureBoards = useCallback(async (action: () => Promise<unknown>, local: (current: TaskBoard[]) => TaskBoard[], reloadTasks = false) => {
    // Computing the demo result first lets a rule violation reject the promise instead of breaking a render.
    if (isDemo) { setTaskBoards(local(taskBoards)); return; }
    await remote(action);
    await reloadTaskBoards(reloadTasks);
  }, [isDemo, remote, reloadTaskBoards, taskBoards]);

  const taskBoardConfig = useMemo<TaskBoardConfig>(() => {
    const withStages = (current: TaskBoard[], boardId: string, update: (stages: TaskStage[]) => TaskStage[]) =>
      current.map((board) => board.id === boardId ? { ...board, stages: update(board.stages) } : board);
    const requireCategories = (stages: TaskStage[]) => {
      if (!stages.some((stage) => stage.category === 'TODO') || !stages.some((stage) => stage.category === 'DONE')) {
        throw new ApiError('A board needs at least one TODO stage and one DONE stage', 400, undefined, 'STAGE_CATEGORY_REQUIRED');
      }
      return stages;
    };
    // Demo stage edits also move the affected tasks, as the server does.
    const retagTasks = (stageId: string, stage: TaskStage | undefined, target?: TaskStage) => setTasks((current) => current.map((task) => {
      if (task.stage.id !== stageId) return task;
      const next = target ?? stage;
      if (!next) return task;
      const wasDone = task.stage.category === 'DONE'; const isDone = next.category === 'DONE';
      return { ...task, stage: stageSummary(next), completedAt: wasDone === isDone ? task.completedAt : isDone ? new Date().toISOString() : null };
    }));
    return {
      createBoard: async (input) => {
        let id: string = crypto.randomUUID();
        const department = input.departmentId ? demoUsers.find((user) => user.departmentId === input.departmentId)?.department ?? null : null;
        await configureBoards(async () => { id = (await api.create<{ id: string }>('task-boards', input)).id; }, (current) => [...current, {
          id, name: input.name, departmentId: input.departmentId, departmentName: department, canManage: true, memberIds: input.memberIds ?? [],
          sortOrder: Math.max(0, ...current.filter((board) => board.departmentId === input.departmentId).map((board) => board.sortOrder)) + 10,
          stages: input.stages.map((stage, index) => ({ ...stage, id: crypto.randomUUID(), boardId: id, sortOrder: (index + 1) * 10 })),
        }]);
        return id;
      },
      updateBoard: async (id, patch) => {
        await configureBoards(() => api.update('task-boards', id, patch), (current) => current.map((board) => board.id === id ? { ...board, ...patch } : board), true);
        if (isDemo && patch.name) setTasks((current) => current.map((task) => task.boardId === id ? { ...task, boardName: patch.name! } : task));
      },
      deleteBoard: (id) => configureBoards(() => api.remove('task-boards', id), (current) => current.filter((board) => board.id !== id)),
      setMembers: (id, userIds) => configureBoards(() => api.put(`/task-boards/${id}/members`, { userIds }),
        (current) => current.map((board) => board.id === id ? { ...board, memberIds: [...new Set(userIds)] } : board)),
      addStage: (boardId, stage) => configureBoards(() => api.create(`task-boards/${boardId}/stages`, stage),
        (current) => withStages(current, boardId, (stages) => [...stages, { ...stage, id: crypto.randomUUID(), boardId, sortOrder: Math.max(0, ...stages.map((item) => item.sortOrder)) + 10 }])),
      updateStage: async (boardId, stageId, patch) => {
        let updated: TaskStage | undefined;
        await configureBoards(() => api.update(`task-boards/${boardId}/stages`, stageId, patch),
          (current) => withStages(current, boardId, (stages) => requireCategories(stages.map((stage) => stage.id === stageId ? (updated = { ...stage, ...patch }) : stage))), true);
        if (isDemo) retagTasks(stageId, updated);
      },
      reorderStages: (boardId, stageIds) => configureBoards(() => api.put(`/task-boards/${boardId}/stages/order`, { stageIds }),
        (current) => withStages(current, boardId, (stages) => stageIds.map((id, index) => ({ ...stages.find((stage) => stage.id === id)!, sortOrder: (index + 1) * 10 })))),
      deleteStage: async (boardId, stageId, moveToStageId) => {
        const query = moveToStageId ? `?moveToStageId=${encodeURIComponent(moveToStageId)}` : '';
        const target = taskBoards.find((board) => board.id === boardId)?.stages.find((stage) => stage.id === moveToStageId);
        await configureBoards(() => api.remove(`task-boards/${boardId}/stages`, `${stageId}${query}`),
          (current) => withStages(current, boardId, (stages) => requireCategories(stages.filter((stage) => stage.id !== stageId))), true);
        if (isDemo && target) retagTasks(stageId, undefined, target);
      },
      boardUsers: async (boardId) => {
        if (isDemo) { const board = taskBoards.find((item) => item.id === boardId); return board ? demoBoardUsers(board) : []; }
        return api.list<BoardUser>(`task-boards/${boardId}/users`);
      },
      memberCandidates: async (boardId) => {
        if (isDemo) return demoUsers.filter((user) => user.role !== 'DIRECTOR').map((user) => ({ id: user.id, fullName: user.fullName, jobTitle: user.jobTitle, departmentId: user.departmentId ?? null, departmentName: user.department }));
        return api.list<BoardUser>(`task-boards/${boardId}/candidates`);
      },
    };
  }, [configureBoards, isDemo, taskBoards]);

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
  const scoped = <T extends { ownerId?: string }>(items: T[]) => {
    if (!session || roleRank[session.user.role] >= roleRank.MANAGER) return items;
    return items.filter((item) => item.ownerId === session.user.id);
  };
  const visibleFunnels = !session ? funnels : funnels.filter((funnel) => canOpenFunnel(funnel, session.user));
  const openFunnelIds = new Set(visibleFunnels.map((funnel) => funnel.id));
  const scopedClients = scoped(clients);
  const scopedDeals = scoped(deals).filter((deal) => openFunnelIds.has(deal.funnelId));
  // Boards are shared: members see every task on a board they can open. The API already filters real sessions.
  const visibleBoards = useMemo(() => !session || !isDemo ? taskBoards : taskBoards.filter((board) => canOpenBoard(board, session.user)).map((board) => {
    const canManage = canManageBoard(board, session.user);
    return { ...board, canManage, memberIds: canManage ? board.memberIds ?? [] : undefined };
  }), [session, isDemo, taskBoards]);
  const visibleTasks = useMemo(() => {
    const boards = new Map(visibleBoards.map((board) => [board.id, board]));
    return tasks.filter((task) => boards.has(task.boardId)).map((task) => !isDemo || !session ? task
      : { ...task, canDelete: task.createdBy === session.user.id || boards.get(task.boardId)!.canManage });
  }, [tasks, visibleBoards, isDemo, session]);
  const accessibleClientIds = new Set(scopedClients.map((client) => client.id));
  const visibleAlerts = !session || session.user.role !== 'EMPLOYEE'
    ? alerts
    : alerts.filter((alert) => alert.userName === session.user.fullName);
  const visibleMessages = !session || session.user.role !== 'EMPLOYEE'
    ? messages
    : messages.filter((message) => !message.clientId || accessibleClientIds.has(message.clientId));

  const value = useMemo<WorkspaceValue>(() => ({
    users: visibleUsers,
    clients: scopedClients, deals: scopedDeals, funnels: visibleFunnels, taskBoards: visibleBoards, tasks: visibleTasks, documents, reports, alerts: visibleAlerts,
    achievements, integrations, messages: visibleMessages, audit,
    dataStatus, createTeamMember, addClient, updateClient, addDeal, moveDeal, funnelConfig, addTask, updateTask, moveTask, deleteTask, taskBoardConfig, addDocument, addReport, acknowledgeAlert,
  // scoped is intentionally derived from current session and collections.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [visibleUsers, clients, deals, funnels, visibleBoards, visibleTasks, documents, reports, alerts, achievements, integrations, messages, audit, dataStatus, createTeamMember, addClient, updateClient, addDeal, moveDeal, funnelConfig, addTask, updateTask, moveTask, deleteTask, taskBoardConfig, addDocument, addReport, acknowledgeAlert, session]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = () => {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return value;
};
