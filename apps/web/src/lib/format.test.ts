import { describe, expect, it } from 'vitest';
import { fileSize, formatMoney, initials, roleLabel } from './format';

describe('format helpers', () => {
  it('formats operational values for the Russian locale', () => {
    expect(formatMoney(125000, 'RUB')).toContain('125');
    expect(fileSize(1_572_864)).toBe('1.5 МБ');
  });

  it('derives compact identity labels', () => {
    expect(initials('Анна Петрова')).toBe('АП');
    expect(roleLabel.DIRECTOR).toBe('Директор');
  });
});
