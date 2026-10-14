/**
 * Tracks whether the person is actually working in Atlas, across all of their tabs: keyboard,
 * mouse, scroll and touch activity in any tab counts, shared through localStorage.
 */
/** How long a pause still counts as active until the server sends its own period (`presence:config`). */
export const DEFAULT_IDLE_AFTER_MS = 15 * 60_000;
const STORAGE_KEY = 'atlas.lastActivity';
const STORE_EVERY_MS = 15_000;
const MOUSEMOVE_EVERY_MS = 10_000;

export interface ActivityTracker {
  isActive: (now?: number) => boolean;
  /** Changes the idle period, e.g. to the one the server configured. */
  setIdleAfter: (ms: number) => void;
  stop: () => void;
}

function readShared(): number {
  try { return Number(localStorage.getItem(STORAGE_KEY) ?? 0) || 0; } catch { return 0; }
}

function writeShared(value: number): void {
  try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* storage may be blocked; this tab still counts */ }
}

/**
 * Starts listening. `onActive` fires immediately on the first activity after being idle, so the
 * server hears about it without waiting for the next heartbeat.
 */
export function trackActivity(onActive: () => void, clock: () => number = Date.now): ActivityTracker {
  let last = clock();
  let lastStored = 0;
  let lastMouse = 0;
  let idleAfter = DEFAULT_IDLE_AFTER_MS;
  writeShared(last);
  const isActive = (now = clock()) => now - Math.max(last, readShared()) < idleAfter;

  const mark = () => {
    const now = clock();
    const wasIdle = !isActive(now);
    last = now;
    if (now - lastStored >= STORE_EVERY_MS || wasIdle) { lastStored = now; writeShared(now); }
    if (wasIdle) onActive();
  };
  const onMouse = () => {
    const now = clock();
    if (now - lastMouse < MOUSEMOVE_EVERY_MS) return;
    lastMouse = now;
    mark();
  };
  const onVisible = () => { if (document.visibilityState === 'visible') mark(); };

  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  events.forEach((name) => window.addEventListener(name, mark, { passive: true }));
  window.addEventListener('mousemove', onMouse, { passive: true });
  document.addEventListener('visibilitychange', onVisible);
  return {
    isActive,
    setIdleAfter: (ms) => { idleAfter = ms; },
    stop: () => {
      events.forEach((name) => window.removeEventListener(name, mark));
      window.removeEventListener('mousemove', onMouse);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
