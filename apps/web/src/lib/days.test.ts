import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { dayKey, dayLabel, withDays } from './days';

// Local times, so the tests hold in any time zone.
const at = (year: number, month: number, day: number, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute).toISOString();
const now = new Date(2026, 10, 16, 12, 0);

afterEach(async () => { await i18n.changeLanguage('ru'); });

describe('dayLabel', () => {
  it('names today and yesterday by the local calendar day', () => {
    expect(dayLabel(at(2026, 11, 16, 0, 5), now)).toBe('Сегодня');
    expect(dayLabel(at(2026, 11, 15, 23, 59), now)).toBe('Вчера');
    expect(dayLabel(at(2026, 11, 14, 23, 59), now)).toBe('14 ноября');
  });

  it('names yesterday across a month and a year boundary', () => {
    expect(dayLabel(at(2026, 10, 31, 22), new Date(2026, 10, 1, 9))).toBe('Вчера');
    expect(dayLabel(at(2025, 12, 31, 22), new Date(2026, 0, 1, 9))).toBe('Вчера');
  });

  it('adds the year only for an earlier year, without «г.»', () => {
    expect(dayLabel(at(2026, 11, 12), now)).toBe('12 ноября');
    expect(dayLabel(at(2025, 12, 28), now)).toBe('28 декабря 2025');
  });

  it('follows the interface language', async () => {
    await i18n.changeLanguage('uk');
    expect([dayLabel(at(2026, 11, 16), now), dayLabel(at(2026, 11, 15), now), dayLabel(at(2026, 11, 12), now), dayLabel(at(2025, 12, 28), now)])
      .toEqual(['Сьогодні', 'Учора', '12 листопада', '28 грудня 2025']);
    await i18n.changeLanguage('en');
    expect([dayLabel(at(2026, 11, 16), now), dayLabel(at(2026, 11, 15), now), dayLabel(at(2026, 11, 12), now), dayLabel(at(2025, 12, 28), now)])
      .toEqual(['Today', 'Yesterday', '12 November', '28 December 2025']);
  });
});

describe('withDays', () => {
  const kinds = (rows: ReturnType<typeof withDays<{ id: string; createdAt: string }>>) => rows.map((row) => row.kind === 'day' ? `[${row.label}]` : row.item.id);

  it('puts one separator before the first item of each day', () => {
    const items = [
      { id: 'a', createdAt: at(2026, 11, 12, 9, 6) }, { id: 'b', createdAt: at(2026, 11, 12, 13, 29) },
      { id: 'c', createdAt: at(2026, 11, 13, 8, 45) }, { id: 'd', createdAt: at(2026, 11, 15, 19, 49) },
      { id: 'e', createdAt: at(2026, 11, 16, 9, 12) }, { id: 'f', createdAt: at(2026, 11, 16, 9, 13) },
    ];
    expect(kinds(withDays(items, now))).toEqual(['[12 ноября]', 'a', 'b', '[13 ноября]', 'c', '[Вчера]', 'd', '[Сегодня]', 'e', 'f']);
  });

  it('keeps one separator for a day split across loaded pages', () => {
    const newer = [{ id: 'c', createdAt: at(2026, 11, 12, 15) }, { id: 'd', createdAt: at(2026, 11, 13, 9) }];
    const older = [{ id: 'a', createdAt: at(2026, 11, 12, 9) }, { id: 'b', createdAt: at(2026, 11, 12, 10) }];
    expect(kinds(withDays([...older, ...newer], now))).toEqual(['[12 ноября]', 'a', 'b', 'c', '[13 ноября]', 'd']);
  });

  it('gives nothing for no items, and keys days in local time', () => {
    expect(withDays([], now)).toEqual([]);
    expect(dayKey(at(2026, 1, 5, 0, 30))).toBe('2026-01-05');
  });
});
