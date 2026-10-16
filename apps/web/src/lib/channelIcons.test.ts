import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANNEL_ICON_COLORS, CHANNEL_ICONS, parseChannelIcon, searchChannelIcons } from './channelIcons';

/** The API validates stored icons against its own copy of the keys: both lists must stay equal. */
const apiSource = readFileSync(resolve(__dirname, '../../../api/src/chat/channelIcons.ts'), 'utf8');
const apiList = (name: string) => {
  const body = apiSource.match(new RegExp(`${name} = \\[([^\\]]*)\\]`))?.[1] ?? '';
  return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
};

describe('channel icon library', () => {
  it('has the same icon and colour keys as the API', () => {
    expect(CHANNEL_ICONS.map((item) => item.key)).toEqual(apiList('CHANNEL_ICON_KEYS'));
    expect(CHANNEL_ICON_COLORS.map((item) => item.key)).toEqual(apiList('CHANNEL_ICON_COLORS'));
    expect(new Set(CHANNEL_ICONS.map((item) => item.key)).size).toBe(CHANNEL_ICONS.length);
  });

  it('finds icons by Russian names and words', () => {
    expect(searchChannelIcons('мег').map((item) => item.key)).toContain('megaphone');
    expect(searchChannelIcons('ДОСТАВКА').map((item) => item.key)).toEqual(expect.arrayContaining(['truck', 'route']));
    expect(searchChannelIcons('')).toHaveLength(CHANNEL_ICONS.length);
  });

  it('reads a stored icon, and ignores one this version does not know', () => {
    expect(parseChannelIcon('megaphone:red')).toMatchObject({ entry: { name: 'Мегафон' }, color: { key: 'red' } });
    expect(parseChannelIcon('unicorn:red')).toBeNull();
    expect(parseChannelIcon('megaphone:gold')).toBeNull();
    expect(parseChannelIcon(null)).toBeNull();
  });
});
