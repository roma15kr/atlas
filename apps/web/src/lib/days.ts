import i18n, { localeOf } from '../i18n';

/** A row of a conversation feed: a day separator or one of the items. */
export type DayRow<T> = { kind: 'day'; key: string; label: string } | { kind: 'item'; item: T };

const pad = (value: number) => String(value).padStart(2, '0');
const keyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The calendar day of a moment in the reader's own time zone, as `YYYY-MM-DD`. */
export const dayKey = (iso: string) => keyOf(new Date(iso));

/** «Сегодня», «Вчера», «12 ноября», or «28 декабря 2025» for an earlier year, in the interface language. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const key = keyOf(date);
  if (key === keyOf(now)) return i18n.t('common:time.today');
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === keyOf(yesterday)) return i18n.t('common:time.yesterday');
  const options: Intl.DateTimeFormatOptions = date.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' };
  // Russian and Ukrainian add «г.»/«р.» after a year; a separator reads better without it.
  return new Intl.DateTimeFormat(localeOf(), options).format(date).replace(/\s*(г|р)\.$/u, '');
}

/** Oldest-first items with one day separator before the first item of each calendar day. */
export function withDays<T extends { createdAt: string }>(items: readonly T[], now: Date = new Date()): DayRow<T>[] {
  const rows: DayRow<T>[] = [];
  let previous = '';
  for (const item of items) {
    const key = dayKey(item.createdAt);
    if (key !== previous) { rows.push({ kind: 'day', key, label: dayLabel(item.createdAt, now) }); previous = key; }
    rows.push({ kind: 'item', item });
  }
  return rows;
}
