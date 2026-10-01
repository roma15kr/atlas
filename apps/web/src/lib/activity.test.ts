import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDLE_AFTER_MS, trackActivity } from './activity';

afterEach(() => localStorage.clear());

describe('activity tracker', () => {
  it('turns idle after 5 minutes without input and reports the first activity at once', () => {
    let now = 1_000_000;
    const onActive = vi.fn();
    const tracker = trackActivity(onActive, () => now);
    expect(tracker.isActive()).toBe(true);
    now += IDLE_AFTER_MS;
    expect(tracker.isActive()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown'));
    expect(onActive).toHaveBeenCalledTimes(1);
    expect(tracker.isActive()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown'));
    expect(onActive).toHaveBeenCalledTimes(1);
    tracker.stop();
  });

  it('counts activity in another Atlas tab', () => {
    let now = 1_000_000;
    const tracker = trackActivity(vi.fn(), () => now);
    now += IDLE_AFTER_MS + 1000;
    localStorage.setItem('atlas.lastActivity', String(now - 30_000));
    expect(tracker.isActive()).toBe(true);
    tracker.stop();
  });

  it('stops listening when stopped', () => {
    let now = 1_000_000;
    const onActive = vi.fn();
    const tracker = trackActivity(onActive, () => now);
    tracker.stop();
    now += IDLE_AFTER_MS + 1;
    window.dispatchEvent(new KeyboardEvent('keydown'));
    expect(onActive).not.toHaveBeenCalled();
  });
});
