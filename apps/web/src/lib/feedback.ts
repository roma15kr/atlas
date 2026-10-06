import { api, apiRequest, sessionStore } from './api';
import { diagnosticsSnapshot } from './diagnostics';
import { APP_VERSION } from './version';
import type { FeedbackDetail, FeedbackKind, FeedbackReport, FeedbackStatus } from '../types';

export interface FeedbackDraft {
  kind: FeedbackKind;
  message: string;
  page: string;
  /** Attach the diagnostic log (and with it the browser and screen size). */
  includeLog?: boolean;
}

export const FEEDBACK_MIN_LENGTH = 10;
export const FEEDBACK_MAX_LENGTH = 5000;

const isDemo = () => Boolean(sessionStore.get()?.accessToken.startsWith('demo-'));
// Demo sessions have no API; their reports live in memory for the session.
let demoReports: FeedbackReport[] = [];

export function feedbackError(message: string): string | null {
  const length = message.trim().length;
  if (length < FEEDBACK_MIN_LENGTH) return 'Опишите проблему подробнее';
  if (length > FEEDBACK_MAX_LENGTH) return `Не длиннее ${FEEDBACK_MAX_LENGTH.toLocaleString('ru-RU')} символов`;
  return null;
}

/** Sends a report; the page, browser, screen size and (if kept) the screenshot go with it. */
export async function submitFeedback(draft: FeedbackDraft, screenshot: Blob | null = null): Promise<{ id: string }> {
  const snapshot = draft.includeLog === false ? null : diagnosticsSnapshot();
  // Without the log only the app version and the page are sent.
  const report = {
    kind: draft.kind,
    message: draft.message.trim(),
    page: draft.page,
    appVersion: APP_VERSION,
    ...(snapshot ? { userAgent: snapshot.userAgent, viewport: snapshot.viewport, diagnostics: snapshot } : {}),
  };
  if (isDemo()) {
    const stored: FeedbackReport = { id: crypto.randomUUID(), kind: report.kind, message: report.message, page: report.page, status: 'PENDING', issueNumber: null, issueUrl: null, hasScreenshot: Boolean(screenshot), createdAt: new Date().toISOString() };
    demoReports = [stored, ...demoReports];
    return { id: stored.id };
  }
  const form = new FormData();
  form.append('report', JSON.stringify(report));
  if (screenshot) form.append('screenshot', screenshot, 'screen.jpg');
  return apiRequest<{ id: string }>('/feedback', { method: 'POST', body: form });
}

export async function loadMyFeedback(): Promise<FeedbackReport[]> {
  if (isDemo()) return demoReports;
  return apiRequest<FeedbackReport[]>('/feedback/mine?limit=100');
}

const demoDetail = (report: FeedbackReport): FeedbackDetail => ({
  ...report, userId: sessionStore.get()?.user.id ?? '', reporterName: sessionStore.get()?.user.fullName ?? '', departmentName: null,
  appVersion: 'dev', userAgent: null, viewport: null, attempts: 0, lastError: null, language: null, titleEn: null, summaryEn: null,
  translationEn: null, stepsEn: null, category: null, severity: null, area: null, triagedAt: null,
});

/** Every report of the company; directors only. */
export async function loadAllFeedback(status?: FeedbackStatus): Promise<FeedbackDetail[]> {
  if (isDemo()) return demoReports.filter((report) => !status || report.status === status).map(demoDetail);
  return apiRequest<FeedbackDetail[]>(`/feedback?limit=100${status ? `&status=${status}` : ''}`);
}

/** One report with its log (directors) or without it (the reporter). */
export async function loadFeedback(id: string): Promise<FeedbackDetail> {
  if (isDemo()) {
    const found = demoReports.find((report) => report.id === id);
    if (!found) throw new Error('Обращение не найдено');
    return { ...demoDetail(found), diagnostics: { events: [] } };
  }
  return apiRequest<FeedbackDetail>(`/feedback/${id}`);
}

/** The screenshot as an object URL; the caller revokes it. */
export async function loadFeedbackScreenshot(id: string): Promise<string | null> {
  if (isDemo()) return null;
  return URL.createObjectURL(await api.download(`/feedback/${id}/screenshot`));
}

export async function retryFeedback(id: string): Promise<void> {
  if (isDemo()) return;
  await apiRequest(`/feedback/${id}/retry`, { method: 'POST' });
}

/** Test helper: forget demo reports between tests. */
export function resetDemoFeedback(): void {
  demoReports = [];
}
