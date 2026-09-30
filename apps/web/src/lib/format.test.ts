import { describe, expect, it } from 'vitest';
import { fileSize, formatKpiValue, formatMoney, initials, roleLabel } from './format';

describe('format helpers', () => {
  it('formats monetary values as Ukrainian hryvnia', () => {
    expect(formatMoney(125000).replaceAll('\u00a0', ' ')).toBe('125 000 ₴');
    expect(formatKpiValue(485000, 'UAH').replaceAll('\u00a0', ' ')).toBe('485 000 ₴');
    expect(formatKpiValue(14, 'встреч')).toBe('14 встреч');
    expect(fileSize(1_572_864)).toBe('1.5 МБ');
  });

  it('derives compact identity labels', () => {
    expect(initials('Анна Петрова')).toBe('АП');
    expect(roleLabel.DIRECTOR).toBe('Директор');
  });
});

describe('plural', () => {
  it('picks the Russian plural form', async () => {
    const { plural } = await import('./format');
    const forms: [string, string, string] = ['этап', 'этапа', 'этапов'];
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map((count) => plural(count, forms))).toEqual([
      '1 этап', '2 этапа', '5 этапов', '11 этапов', '12 этапов', '21 этап', '22 этапа', '25 этапов', '111 этапов',
    ]);
  });
});
