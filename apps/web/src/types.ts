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
}

export interface Kpi {
  id: string;
  name: string;
  target: number;
  actual: number;
  unit: string;
  weight: number;
  dueAt?: string;
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

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export interface WorkTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeId: string;
  assigneeName: string;
  dealId?: string;
  dealTitle?: string;
  dueAt: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
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
}

export interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  points: number;
  awardedAt: string;
}

export interface Integration {
  id: string;
  provider: 'GMAIL' | 'OUTLOOK' | 'TELEGRAM' | 'WHATSAPP' | 'VIBER';
  status: 'CONNECTED' | 'DISCONNECTED' | 'NEEDS_ATTENTION';
  displayName?: string;
  lastSyncedAt?: string;
}

export interface ChannelMessage {
  id: string;
  channel: Integration['provider'] | 'INTERNAL';
  contact: string;
  subject: string;
  preview: string;
  receivedAt: string;
  unread: boolean;
  clientId?: string;
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
