import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api, ApiError, apiRequest, listAll, listPage, sessionStore } from '../lib/api';
import {
  demoAchievements,
  demoAlerts,
  demoAudit,
  demoClients,
  demoDeals,
  demoDocuments,
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
import type { Achievement, AiAnalysis, AiMode, Alert, AuditEvent, ReportRun, BoardUser, Client, CompanyDocument, DashboardMetrics, Deal, KpiInput, DealStage, DealStageSummary, Funnel, FunnelAccessMode, Kpi, Report, Role, Session, TaskAssignee, TaskBoard, TaskCategory, TaskPriority, TaskStage, TaskStageSummary, User, WorkTask } from '../types';

const roleRank: Record<Role, number> = { EMPLOYEE: 1, MANAGER: 2, DIRECTOR: 3 };
export const REFRESH_INTERVAL_MS = 180_000;
export const STALE_AFTER_MS = 60_000;
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

export interface MemberUpdate {
  fullName?: string;
  jobTitle?: string;
  specialty?: string;
  jobDescription?: string;
  role?: Role;
  /** An existing department's name or a new one; directors only. */
  departmentName?: string;
}

export const autoUnit = (source: KpiInput['source']): string =>
  ({ MANUAL: '', DEALS_WON_VALUE: 'UAH', DEALS_WON_COUNT: 'сделок', TASKS_DONE: 'задач', TASKS_ON_TIME_RATE: '%' })[source];

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
  /** Saves the signed-in user's own name and specialty. */
  updateProfile: (patch: { fullName?: string; specialty?: string }) => Promise<void>;
  /** Changes the signed-in user's password; other sessions end and this one is renewed. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
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
  status: source.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
  mustChangePassword: Boolean(source.mustChangePassword),
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
  result: (source.result ?? undefined) as Report['result'], active: source.active === undefined ? true : Boolean(source.active),
  nextRunAt: (source.nextRunAt ?? null) as string | null, lastRunAt: (source.lastRunAt ?? null) as string | null,
  id: String(source.id), name: String(source.name ?? ''), targetUserId: source.targetUserId as string | undefined, targetUserName: String(source.targetUserName ?? (source.targetUser as { fullName?: string } | undefined)?.fullName ?? 'Команда'), metrics: (Array.isArray(source.metrics) ? source.metrics : []) as Report['metrics'], periodStart: String(source.periodStart ?? ''), periodEnd: String(source.periodEnd ?? ''), schedule: (source.schedule as Report['schedule']) ?? 'ONCE', status: (source.status as Report['status']) ?? 'PENDING', createdAt: String(source.createdAt ?? ''),
});

const normalizeAlert = (source: Record<string, unknown>): Alert => ({
  rule: (source.rule ?? undefined) as string | undefined, dealId: (source.dealId ?? undefined) as string | undefined,
  clientId: (source.clientId ?? undefined) as string | undefined, resolvedAt: (source.resolvedAt ?? null) as string | null,
  id: String(source.id), severity: (source.severity as Alert['severity']) ?? 'INFO', category: String(source.category ?? ''), title: String(source.title ?? ''), summary: String(source.summary ?? ''), userName: source.userName as string | undefined, createdAt: String(source.createdAt ?? ''), acknowledged: Boolean(source.acknowledged ?? source.acknowledgedAt),
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

  const updateProfile = useCallback(async (patch: { fullName?: string; specialty?: string }) => {
    if (!session) return;
    const saved = session.accessToken.startsWith('demo-') ? null
      : await api.update<{ fullName: string; specialty: string | null }>('team', 'me', patch);
    setSession((current) => {
      if (!current) return current;
      const fullName = saved?.fullName ?? patch.fullName ?? current.user.fullName;
      const specialty = saved ? saved.specialty ?? undefined : patch.specialty === undefined ? current.user.specialty : patch.specialty || undefined;
      const next = { ...current, user: { ...current.user, fullName, specialty } };
      sessionStore.set(next);
      return next;
    });
  }, [session]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!session) return;
    if (session.accessToken.startsWith('demo-')) {
      const next = { ...session, user: { ...session.user, mustChangePassword: false } };
      sessionStore.set(next);
      setSession(next);
      return;
    }
    const next = normalizeSession(await apiRequest<unknown>('/auth/password', { method: 'POST', body: { currentPassword, newPassword }, retry: false }));
    sessionStore.set(next);
    setSession(next);
  }, [session]);

  return <AuthContext.Provider value={{ session, loading, login, logout, hasRole, consent, mergeCurrentUser, updateProfile, changePassword }}>{children}</AuthContext.Provider>;
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
  audit: AuditEvent[];
  /** Server-computed dashboard totals; null until the first load. */
  dashboardMetrics: DashboardMetrics | null;
  dataStatus: 'loading' | 'ready' | 'offline';
  /** Re-loads all collections in the background. */
  refresh: () => Promise<void>;
  createTeamMember: (input: CreateTeamMemberInput) => Promise<User>;
  /** Disabled people in scope, for directors and heads. */
  disabledUsers: User[];
  updateMember: (id: string, patch: MemberUpdate) => Promise<void>;
  setMemberActive: (id: string, active: boolean) => Promise<void>;
  resetMemberPassword: (id: string, password: string) => Promise<void>;
  addKpi: (userId: string, input: KpiInput) => Promise<void>;
  updateKpi: (userId: string, kpiId: string, input: Partial<KpiInput>) => Promise<void>;
  deleteKpi: (userId: string, kpiId: string) => Promise<void>;
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
  setReportActive: (id: string, active: boolean) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
  loadReportRuns: (id: string) => Promise<ReportRun[]>;
  /** AI advice, evaluation or forecast for the caller or someone they manage. */
  analyze: (targetUserId: string, mode: AiMode) => Promise<AiAnalysis>;
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
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [dataStatus, setDataStatus] = useState<'loading' | 'ready' | 'offline'>('ready');

  const isDemo = Boolean(session?.accessToken.startsWith('demo-'));

  const loadGeneration = useRef(0);
  const lastLoadedAt = useRef(0);
  const sessionUserId = session?.user.id;
  const sessionRole = session?.user.role;
  // After a reset the API refuses everything but /auth until the password changes.
  const passwordLocked = Boolean(session?.user.mustChangePassword);

  /**
   * Loads every collection the user may see. A quiet load (background refresh) never shows the
   * loading state and keeps what is on screen when requests fail.
   */
  const loadWorkspace = useCallback(async (quiet: boolean) => {
    if (!sessionUserId || isDemo || passwordLocked) return;
    const generation = ++loadGeneration.current;
    if (!quiet) setDataStatus('loading');
    const canReadAudit = sessionRole === 'DIRECTOR' || sessionRole === 'MANAGER';
    const results = await Promise.allSettled([
      api.list<Record<string, unknown>>(canReadAudit ? 'team?status=all' : 'team'), listAll<Record<string, unknown>>('clients'), listAll<Record<string, unknown>>('deals'),
      listAll<Record<string, unknown>>('tasks'), listAll<CompanyDocument>('documents'),
      listAll<Report>('reports'), listAll<Alert>('alerts'), api.list<Funnel>('funnels'),
      api.list<Achievement>('achievements'), canReadAudit ? listPage<AuditEvent>('audit', 100) : Promise.resolve(null),
      api.list<TaskBoard>('task-boards'), api.get<{ metrics: DashboardMetrics }>('/dashboard'),
    ]);
    if (generation !== loadGeneration.current) return;
    const setters: Array<(value: unknown) => void> = [
      (items) => { const normalized = (items as Array<Record<string, unknown>>).map(normalizeUser); setUsers(normalized); const current = normalized.find((user) => user.id === sessionUserId); if (current) mergeCurrentUser(current); },
      (items) => setClients((items as Array<Record<string, unknown>>).map(normalizeClient)),
      (items) => setDeals((items as Array<Record<string, unknown>>).map(normalizeDeal)),
      (items) => setTasks((items as Array<Record<string, unknown>>).map(normalizeTask)),
      (items) => setDocuments((items as Array<Record<string, unknown>>).map(normalizeDocument)), (items) => setReports((items as Array<Record<string, unknown>>).map(normalizeReport)),
      (items) => setAlerts((items as Array<Record<string, unknown>>).map(normalizeAlert)), (items) => setFunnels(items as Funnel[]),
      (items) => setAchievements(items as Achievement[]), (items) => setAudit((items as Array<Record<string, unknown>>).map(normalizeAudit)),
      (items) => setTaskBoards(items as TaskBoard[]), (value) => setDashboardMetrics((value as { metrics: DashboardMetrics }).metrics),
    ];
    let fulfilled = 0;
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled' || result.value === null) return;
      const expectsArray = index < setters.length - 1;
      if (expectsArray && !Array.isArray(result.value)) return;
      setters[index](result.value);
      fulfilled += 1;
    });
    if (fulfilled) lastLoadedAt.current = Date.now();
    if (!quiet) setDataStatus(fulfilled ? 'ready' : 'offline');
    else if (fulfilled) setDataStatus('ready');
  }, [sessionUserId, sessionRole, isDemo, passwordLocked, mergeCurrentUser]);

  useEffect(() => {
    if (!session || isDemo) return;
    void loadWorkspace(false);
    return () => { loadGeneration.current += 1; };
    // A new access token (refresh) must not reload everything; only a new user or session does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId, isDemo, loadWorkspace]);

  // Background refresh keeps colleagues' changes visible without signing in again.
  useEffect(() => {
    if (!sessionUserId || isDemo) return;
    const visible = () => document.visibilityState === 'visible';
    const interval = window.setInterval(() => { if (visible()) void loadWorkspace(true); }, REFRESH_INTERVAL_MS);
    const onFocus = () => { if (visible() && Date.now() - lastLoadedAt.current > STALE_AFTER_MS) void loadWorkspace(true); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [sessionUserId, isDemo, loadWorkspace]);

  useEffect(() => {
    if (!session) return;
    if (isDemo) {
      setUsers(demoUsers); setClients(demoClients); setDeals(demoDeals); setFunnels(demoFunnels); setTasks(demoTasks); setTaskBoards(demoTaskBoards);
      setDocuments(demoDocuments); setReports(demoReports); setAlerts(demoAlerts); setAchievements(demoAchievements);
      setAudit(demoAudit); setDataStatus('ready');
    } else {
      setUsers([]); setClients([]); setDeals([]); setFunnels([]); setTasks([]); setTaskBoards([]); setDocuments([]); setReports([]);
      setAlerts([]); setAchievements([]); setAudit([]); setDashboardMetrics(null);
    }
  // Only a different user or session type resets the data; a refreshed access token keeps it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId, isDemo]);

  useEffect(() => {
    if (!session || isDemo || passwordLocked) return;
    let socket: Socket | null = io({ path: '/socket.io', auth: { token: session.accessToken }, transports: ['websocket', 'polling'] });
    const updatePresence = (payload: { userId: string; online?: boolean; lastSeen?: string; status?: string; lastSeenAt?: string }) => {
      const online = payload.online ?? payload.status === 'ONLINE';
      setUsers((current) => current.map((user) => user.id === payload.userId ? { ...user, online, lastSeen: payload.lastSeen ?? payload.lastSeenAt } : user));
    };
    // Other providers (chat, mail) listen to the one authenticated socket through window events.
    socket.onAny((event: string, payload: unknown) => window.dispatchEvent(new CustomEvent('atlas:socket', { detail: { event, payload } })));
    socket.on('connect', () => window.dispatchEvent(new CustomEvent('atlas:socket', { detail: { event: 'connect', payload: null } })));
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
  }, [session?.accessToken, isDemo, passwordLocked]);

  const remote = useCallback(async <T,>(action: () => Promise<T>) => {
    if (isDemo) return undefined;
    try { return await action(); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) setDataStatus('offline');
      throw error;
    }
  }, [isDemo]);

  const replaceUser = useCallback((raw: Record<string, unknown> | undefined, id: string, local: (user: User) => User) => {
    setUsers((current) => current.map((user) => {
      if (user.id !== id) return user;
      if (!raw) return local(user);
      const fresh = normalizeUser(raw);
      return { ...user, ...fresh, online: user.online, lastSeen: user.lastSeen, rating: user.rating, kpis: user.kpis, monitoringConsentAt: user.monitoringConsentAt };
    }));
  }, []);

  const updateMember = useCallback(async (id: string, patch: MemberUpdate) => {
    const raw = await remote(() => api.update<Record<string, unknown>>('team', id, patch));
    replaceUser(raw, id, (user) => ({
      ...user, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
      department: patch.departmentName ?? user.department,
    }));
  }, [remote, replaceUser]);

  const setMemberActive = useCallback(async (id: string, active: boolean) => {
    const raw = await remote(() => api.create<Record<string, unknown>>(`team/${id}/${active ? 'enable' : 'disable'}`, {}));
    replaceUser(raw, id, (user) => ({ ...user, status: active ? 'ACTIVE' : 'DISABLED', online: active && user.online }));
  }, [remote, replaceUser]);

  const resetMemberPassword = useCallback(async (id: string, password: string) => {
    const raw = await remote(() => api.create<Record<string, unknown>>(`team/${id}/reset-password`, { password }));
    replaceUser(raw, id, (user) => ({ ...user, mustChangePassword: true }));
  }, [remote, replaceUser]);

  // KPI changes re-load the team so ratings come from the server; demo sessions recompute locally.
  const changeKpis = useCallback(async (userId: string, action: () => Promise<unknown>, local: (kpis: Kpi[]) => Kpi[]) => {
    if (isDemo) {
      setUsers((current) => current.map((user) => {
        if (user.id !== userId) return user;
        const kpis = local(user.kpis);
        const weight = kpis.reduce((sum, kpi) => sum + kpi.weight, 0);
        const rating = weight ? Math.round(kpis.reduce((sum, kpi) => sum + Math.min(kpi.actual / kpi.target, 1.2) * kpi.weight, 0) / weight * 100) : 0;
        return { ...user, kpis, rating };
      }));
      return;
    }
    await remote(action);
    const team = await api.list<Record<string, unknown>>(session?.user.role === 'EMPLOYEE' ? 'team' : 'team?status=all');
    const normalized = team.map(normalizeUser);
    setUsers((current) => current.map((user) => {
      const fresh = normalized.find((item) => item.id === user.id);
      return fresh ? { ...user, kpis: fresh.kpis, rating: fresh.rating } : user;
    }));
    const me = normalized.find((user) => user.id === session?.user.id);
    if (me) mergeCurrentUser(me);
  }, [isDemo, remote, session, mergeCurrentUser]);

  const addKpi = useCallback((userId: string, input: KpiInput) => changeKpis(userId,
    () => api.create('kpis', { userId, ...input }),
    (kpis) => [...kpis, { id: crypto.randomUUID(), name: input.name, target: input.target, actual: input.actual ?? 0, unit: input.unit ?? autoUnit(input.source), weight: input.weight, dueAt: input.dueAt ?? undefined, source: input.source, periodStart: input.periodStart, periodEnd: input.periodEnd }],
  ), [changeKpis]);
  const updateKpi = useCallback((userId: string, kpiId: string, input: Partial<KpiInput>) => changeKpis(userId,
    () => api.update('kpis', kpiId, input),
    (kpis) => kpis.map((kpi) => kpi.id === kpiId ? { ...kpi, ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)), dueAt: input.dueAt === undefined ? kpi.dueAt : input.dueAt ?? undefined } : kpi),
  ), [changeKpis]);
  const deleteKpi = useCallback((userId: string, kpiId: string) => changeKpis(userId,
    () => api.remove('kpis', kpiId),
    (kpis) => kpis.filter((kpi) => kpi.id !== kpiId),
  ), [changeKpis]);

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
    const created = await remote(() => api.create<Record<string, unknown>>('reports', { ...input, targetUserId: input.targetUserId || undefined, targetUserName: input.targetUserId ? input.targetUserName : 'Team' }));
    setReports((current) => [created ? normalizeReport(created) : { ...input, id: crypto.randomUUID(), status: 'PENDING', createdAt: new Date().toISOString() }, ...current]);
  }, [remote]);

  const setReportActive = useCallback(async (id: string, active: boolean) => {
    const saved = await remote(() => api.update<{ active: boolean; nextRunAt: string | null }>('reports', id, { active }));
    setReports((current) => current.map((report) => report.id === id ? { ...report, active, nextRunAt: saved?.nextRunAt ?? report.nextRunAt } : report));
  }, [remote]);

  const deleteReport = useCallback(async (id: string) => {
    await remote(() => api.remove('reports', id));
    setReports((current) => current.filter((report) => report.id !== id));
  }, [remote]);

  const loadReportRuns = useCallback(async (id: string): Promise<ReportRun[]> => {
    if (isDemo) {
      const report = reports.find((item) => item.id === id);
      return report?.result ? [{ id: `${id}-run`, periodStart: report.periodStart, periodEnd: report.periodEnd, result: report.result, createdAt: report.createdAt }] : [];
    }
    return api.list<ReportRun>(`reports/${id}/runs`);
  }, [isDemo, reports]);

  const analyze = useCallback(async (targetUserId: string, mode: AiMode): Promise<AiAnalysis> => {
    if (!isDemo) return apiRequest<AiAnalysis>('/ai/analyze', { method: 'POST', body: { targetUserId, mode } });
    const target = users.find((user) => user.id === targetUserId);
    const rating = target?.rating ?? 0;
    const summary = mode === 'FORECAST'
      ? `Прогноз: при текущем темпе рейтинг ${target?.fullName ?? 'сотрудника'} останется около ${rating} из 100.`
      : mode === 'EVALUATION' ? `Оценка: рейтинг ${rating} из 100 по взвешенным KPI.` : `Совет: сфокусируйтесь на KPI с наименьшим выполнением.`;
    return { summary, recommendations: ['Проверьте задачи с ближайшим сроком', 'Обновите следующий шаг по открытым сделкам'], source: 'RULES' };
  }, [isDemo, users]);

  const acknowledgeAlert = useCallback(async (id: string) => {
    await remote(() => api.update<Alert>('alerts', `${id}/acknowledge`, {}));
    setAlerts((current) => current.map((alert) => alert.id === id ? { ...alert, acknowledged: true } : alert));
  }, [remote]);

  const scopedUsers = useMemo(() => {
    if (!session || session.user.role === 'DIRECTOR') return users;
    if (session.user.role === 'MANAGER') return users.filter((user) => user.department === session.user.department);
    return users.filter((user) => user.id === session.user.id);
  }, [session, users]);
  const visibleUsers = useMemo(() => scopedUsers.filter((user) => user.status !== 'DISABLED'), [scopedUsers]);
  const disabledUsers = useMemo(() => session?.user.role === 'EMPLOYEE' ? [] : scopedUsers.filter((user) => user.status === 'DISABLED'), [session, scopedUsers]);
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
  const visibleAlerts = !session || session.user.role !== 'EMPLOYEE'
    ? alerts
    : alerts.filter((alert) => alert.userName === session.user.fullName);

  // Demo sessions have no server, so the same totals are derived from the scoped demo data.
  const metrics = useMemo<DashboardMetrics | null>(() => {
    if (!isDemo) return dashboardMetrics;
    const open = scopedDeals.filter((deal) => deal.stage.outcome === 'OPEN');
    const now = Date.now();
    return {
      clients: scopedClients.length, currency: 'UAH', openDeals: open.length,
      pipelineValue: open.reduce((sum, deal) => sum + deal.value, 0),
      weightedPipeline: open.reduce((sum, deal) => sum + deal.value * deal.probability / 100, 0),
      tasks: {
        total: visibleTasks.length,
        done: visibleTasks.filter((task) => task.stage.category === 'DONE').length,
        overdue: visibleTasks.filter((task) => task.stage.category !== 'DONE' && task.dueAt && new Date(task.dueAt).getTime() < now).length,
      },
      online: visibleUsers.filter((user) => user.online).length, teamSize: visibleUsers.length,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, dashboardMetrics, clients, deals, visibleTasks, visibleUsers]);
  const refresh = useCallback(() => loadWorkspace(true), [loadWorkspace]);

  const value = useMemo<WorkspaceValue>(() => ({
    users: visibleUsers,
    clients: scopedClients, deals: scopedDeals, funnels: visibleFunnels, taskBoards: visibleBoards, tasks: visibleTasks, documents, reports, alerts: visibleAlerts,
    achievements, audit, dashboardMetrics: metrics, refresh,
    dataStatus, createTeamMember, disabledUsers, updateMember, setMemberActive, resetMemberPassword, addKpi, updateKpi, deleteKpi, addClient, updateClient, addDeal, moveDeal, funnelConfig, addTask, updateTask, moveTask, deleteTask, taskBoardConfig, addDocument, addReport, acknowledgeAlert, setReportActive, deleteReport, loadReportRuns, analyze,
  // scoped is intentionally derived from current session and collections.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [visibleUsers, clients, deals, funnels, visibleBoards, visibleTasks, documents, reports, alerts, achievements, audit, metrics, refresh, dataStatus, createTeamMember, disabledUsers, updateMember, setMemberActive, resetMemberPassword, addKpi, updateKpi, deleteKpi, addClient, updateClient, addDeal, moveDeal, funnelConfig, addTask, updateTask, moveTask, deleteTask, taskBoardConfig, addDocument, addReport, acknowledgeAlert, setReportActive, deleteReport, loadReportRuns, analyze, session]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = () => {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return value;
};
