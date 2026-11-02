import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n, { applyLanguage, detectLanguage } from '.';
import { formatDate, relativeTime, roleLabel } from '../lib/format';

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

describe('interface language', () => {
  it('formats dates, times and role names in each language', async () => {
    const date = '2026-10-23T10:00:00.000Z';
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    await i18n.changeLanguage('uk');
    expect(formatDate(date)).toMatch(/23 жовт/);
    expect(relativeTime(fiveMinutesAgo)).toBe('5 хв тому');
    expect(roleLabel.MANAGER).toBe('Керівник');
    await i18n.changeLanguage('en');
    expect(formatDate(date)).toMatch(/23 Oct/);
    expect(relativeTime(fiveMinutesAgo)).toBe('5 min ago');
    expect(roleLabel.MANAGER).toBe('Head');
    await i18n.changeLanguage('ru');
    expect(formatDate(date)).toMatch(/23 окт/);
    expect(roleLabel.MANAGER).toBe('Руководитель');
    expect(document.documentElement.lang).toBe('ru');
  });

  it('picks the language for the login screen: remembered, else the browser\'s, else Ukrainian', async () => {
    vi.stubGlobal('navigator', { ...navigator, languages: ['en-US', 'de'], language: 'en-US' });
    expect(detectLanguage()).toBe('en');
    vi.stubGlobal('navigator', { ...navigator, languages: ['de-DE'], language: 'de-DE' });
    expect(detectLanguage()).toBe('uk');
    await applyLanguage('ru');
    expect(detectLanguage()).toBe('ru');
  });

  it("uses each language's plural forms", async () => {
    await i18n.changeLanguage('uk');
    expect(i18n.t('time.minutesAgo', { count: 3 })).toBe('3 хв тому');
    await i18n.changeLanguage('en');
    expect(i18n.t('time.hoursAgo', { count: 1 })).toBe('1 h ago');
  });
});
