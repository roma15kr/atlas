import { APP_VERSION } from './version';

/**
 * A short technical history for problem reports: errors, API requests (method, path without query,
 * status, duration, request id), page changes and realtime connection changes. It never holds
 * request or response bodies, typed text, form values, tokens, cookies or query strings.
 */
export type DiagnosticEvent =
  | { at: string; type: 'error'; message: string; source?: string }
  | { at: string; type: 'request'; method: string; path: string; status: number; ms: number; requestId?: string }
  | { at: string; type: 'route'; path: string }
  | { at: string; type: 'socket'; state: 'connect' | 'disconnect' | 'error' };

type NewEvent = DiagnosticEvent extends infer E ? E extends DiagnosticEvent ? Omit<E, 'at'> : never : never;

export interface DiagnosticsSnapshot {
  version: string;
  page: string;
  userAgent: string;
  viewport: string;
  language: string;
  timeZone: string;
  online: boolean;
  events: DiagnosticEvent[];
}

export const MAX_EVENTS = 100;
export const WINDOW_MS = 15 * 60 * 1000;
const MAX_TEXT = 300;

let events: DiagnosticEvent[] = [];

/** Strips the query string and fragment: they can carry search terms or tokens. */
export function cleanPath(url: string): string {
  const withoutOrigin = url.replace(/^https?:\/\/[^/]+/i, '');
  return withoutOrigin.split(/[?#]/)[0]!.slice(0, MAX_TEXT);
}

export function recordDiagnostic(event: NewEvent): void {
  const entry = { ...event, at: new Date().toISOString() } as DiagnosticEvent;
  if (entry.type === 'error') entry.message = entry.message.slice(0, MAX_TEXT);
  events.push(entry);
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
}

/** Records a finished API request from its response. */
export function recordRequest(method: string, url: string, response: Response | null, startedAt: number): void {
  recordDiagnostic({
    type: 'request', method: method.toUpperCase(), path: cleanPath(url), status: response?.status ?? 0,
    ms: Math.round(performance.now() - startedAt), requestId: response?.headers.get('x-request-id') ?? undefined,
  });
}

/** Listens for uncaught errors and rejected promises; returns a function that stops listening. */
export function installDiagnostics(): () => void {
  const onError = (event: ErrorEvent) => recordDiagnostic({ type: 'error', message: event.message || 'Ошибка скрипта', source: event.filename ? cleanPath(event.filename) : undefined });
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason as { message?: unknown } | undefined;
    recordDiagnostic({ type: 'error', message: typeof reason?.message === 'string' ? reason.message : 'Необработанная ошибка' });
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
}

/** The events of the last 15 minutes (at most 100), plus the browser context. */
export function diagnosticsSnapshot(now = Date.now()): DiagnosticsSnapshot {
  return {
    version: APP_VERSION,
    page: cleanPath(window.location.pathname),
    userAgent: navigator.userAgent.slice(0, MAX_TEXT),
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    language: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: navigator.onLine,
    events: events.filter((event) => now - Date.parse(event.at) <= WINDOW_MS).slice(-MAX_EVENTS),
  };
}

/** Plain-language summary for the report form. */
export function summarizeDiagnostics(snapshot: DiagnosticsSnapshot): string[] {
  const errors = snapshot.events.filter((event) => event.type === 'error').length;
  const requests = snapshot.events.filter((event) => event.type === 'request') as Array<Extract<DiagnosticEvent, { type: 'request' }>>;
  const failed = requests.filter((event) => event.status === 0 || event.status >= 400).length;
  const routes = snapshot.events.filter((event) => event.type === 'route').length;
  return [
    `Ошибок приложения: ${errors}; запросов к серверу: ${requests.length}${failed ? ` (с ошибкой: ${failed})` : ''}`,
    `Переходов по страницам: ${routes}; состояние подключения к серверу`,
    `Версия Atlas ${snapshot.version}, ${snapshot.viewport}, ${snapshot.language}, ${snapshot.timeZone}`,
  ];
}

/** Test helper. */
export function resetDiagnostics(): void {
  events = [];
}
