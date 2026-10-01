export type Role = 'DIRECTOR' | 'MANAGER' | 'EMPLOYEE';
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  department: string;
  departmentId?: string;
  jobTitle: string;
  jobDescription?: string;
  specialty?: string;
  avatarUrl?: string;
  online: boolean;
  lastSeen?: string;
  monitoringConsentAt?: string;
  rating: number;
  kpis: Kpi[];
  /** Present on directory rows; DISABLED people appear only in the directors' and heads' "Отключённые" view. */
  status?: 'ACTIVE' | 'DISABLED';
  /** Set after an administrative password reset until the person picks a new password. */
  mustChangePassword?: boolean;
}

export type KpiSource = 'MANUAL' | 'DEALS_WON_VALUE' | 'DEALS_WON_COUNT' | 'TASKS_DONE' | 'TASKS_ON_TIME_RATE';

export interface Kpi {
  id: string;
  name: string;
  target: number;
  actual: number;
  unit: string;
  /** Share of the rating, 0–1. */
  weight: number;
  dueAt?: string;
  /** MANUAL KPIs are entered by the manager; the others Atlas measures over the period. */
  source?: KpiSource;
  periodStart?: string | null;
  periodEnd?: string | null;
  computedAt?: string | null;
}

export interface KpiInput {
  name: string;
  target: number;
  weight: number;
  source: KpiSource;
  unit?: string;
  actual?: number;
  dueAt?: string | null;
  periodStart?: string;
  periodEnd?: string;
}

export interface Client {
  id: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  source: string;
  status: 'NEW' | 'ACTIVE' | 'PAUSED';
  ownerId: string;
  ownerName: string;
  notes: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  clientId: string;
  title: string;
  companyName: string;
  ownerId: string;
  ownerName: string;
  funnelId: string;
  stage: DealStageSummary;
  value: number;
  currency: 'UAH';
  probability: number;
  expectedCloseAt: string;
}

export type StageOutcome = 'OPEN' | 'WON' | 'LOST';

export interface DealStageSummary {
  id: string;
  name: string;
  color: string;
  outcome: StageOutcome;
}

export interface DealStage extends DealStageSummary {
  funnelId: string;
  sortOrder: number;
  /** Director-only: deals currently in this stage. */
  dealCount?: number;
}

export type FunnelAccessMode = 'COMPANY' | 'RESTRICTED';

export interface Funnel {
  id: string;
  name: string;
  sortOrder: number;
  stages: DealStage[];
  /** Access details are returned to directors only. */
  accessMode?: FunnelAccessMode;
  departmentIds?: string[];
  userIds?: string[];
}

export type TaskCategory = 'TODO' | 'ACTIVE' | 'DONE';

export interface TaskStageSummary {
  id: string;
  name: string;
  color: string;
  category: TaskCategory;
}

export interface TaskStage extends TaskStageSummary {
  boardId: string;
  sortOrder: number;
}

export interface TaskBoard {
  id: string;
  name: string;
  /** Null for a director board. */
  departmentId: string | null;
  departmentName: string | null;
  sortOrder: number;
  canManage: boolean;
  stages: TaskStage[];
  /** Extra members from other departments; returned to board managers only. */
  memberIds?: string[];
}

export interface TaskAssignee {
  id: string;
  fullName: string;
  avatarUrl?: string;
}

/** A user who can open a board, i.e. who can be assigned to its tasks. */
export interface BoardUser extends TaskAssignee {
  role?: Role;
  jobTitle?: string;
  departmentId?: string | null;
  departmentName?: string | null;
  isMember?: boolean;
}

export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH';

export interface WorkTask {
  id: string;
  title: string;
  description: string;
  boardId: string;
  boardName: string;
  stage: TaskStageSummary;
  assignees: TaskAssignee[];
  createdBy?: string;
  canDelete?: boolean;
  dealId?: string;
  dealTitle?: string;
  dueAt: string;
  completedAt?: string | null;
  priority: TaskPriority;
}

export interface CompanyDocument {
  id: string;
  title: string;
  fileName: string;
  folder: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  visibility: 'COMPANY' | 'DEPARTMENT' | 'PRIVATE';
  uploadedBy: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  category: string;
  title: string;
  summary: string;
  userName?: string;
  createdAt: string;
  acknowledged: boolean;
  /** The automatic rule that raised it, e.g. TASKS_OVERDUE. */
  rule?: string;
  dealId?: string;
  clientId?: string;
  resolvedAt?: string | null;
}

export interface Report {
  id: string;
  name: string;
  targetUserName: string;
  targetUserId?: string;
  metrics: Array<'kpi' | 'deals' | 'conversion' | 'tasks' | 'attendance'>;
  periodStart: string;
  periodEnd: string;
  schedule: 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  status: 'PENDING' | 'READY' | 'FAILED';
  createdAt: string;
  result?: ReportResult;
  /** Recurring reports can be paused. */
  active?: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
}

export interface ReportResult {
  kpiProgress: number;
  deals: { total: number; won: number; value: number; currency: 'UAH' };
  conversion: number;
  tasks: { total: number; done: number; overdue: number };
  attendance: { activeDays?: number; firstSeenAt?: string | null; lastSeenAt?: string | null; consent?: boolean; consentingUsers?: number; teamSize?: number };
}

export interface ReportRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  result: ReportResult;
  createdAt: string;
}

export type AiMode = 'ADVICE' | 'EVALUATION' | 'FORECAST';

export interface AiAnalysis {
  summary: string;
  recommendations: string[];
  source: 'CLAUDE' | 'RULES';
  model?: string;
  fallbackReason?: string;
}

export interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  points: number;
  awardedAt: string;
}

export interface AuditEvent {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string;
  ip: string;
  createdAt: string;
  result: 'SUCCESS' | 'DENIED';
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken?: string;
}

/** Scoped totals computed by `GET /api/v1/dashboard`. */
export interface DashboardMetrics {
  clients: number;
  pipelineValue: number;
  weightedPipeline: number;
  currency: 'UAH';
  openDeals: number;
  tasks: { total: number; overdue: number; done: number };
  online: number;
  teamSize: number;
}
