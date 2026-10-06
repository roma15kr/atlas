import { apiRequest, sessionStore } from './api';
import type { FeedbackKind, FeedbackReport } from '../types';

export interface FeedbackDraft {
  kind: FeedbackKind;
  message: string;
  page: string;
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
  const report = {
    kind: draft.kind,
    message: draft.message.trim(),
    page: draft.page,
    userAgent: navigator.userAgent.slice(0, 500),
    viewport: `${window.innerWidth}×${window.innerHeight}`,
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

/** Test helper: forget demo reports between tests. */
export function resetDemoFeedback(): void {
  demoReports = [];
}
