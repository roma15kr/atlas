import i18n, { currentLanguage, type Language } from '../i18n';
import { EMOJI_CATEGORIES, EMOJI_TRANSLATIONS } from './emojiNames';
import emojiList from './emoji.json';

export interface Reaction { emoji: string; count: number; users: Array<{ id: string; fullName: string }> }
export interface EmojiEntry { emoji: string; name: string; keywords: string; category: string }

/** The emoji Atlas offers (the API accepts exactly these), with Russian names; see `localizedEmoji` for the others. */
export const EMOJI: EmojiEntry[] = emojiList;
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅'];
export const MAX_DISTINCT_REACTIONS = 20;

const localized = new Map<string, EmojiEntry[]>();
/** The emoji with names, search words and category in the interface language. */
export function localizedEmoji(language: Language = currentLanguage()): EmojiEntry[] {
  const cached = localized.get(language);
  if (cached) return cached;
  const entries = language === 'ru' ? EMOJI : EMOJI.map((item) => {
    const [name, keywords] = EMOJI_TRANSLATIONS[language][item.emoji] ?? [item.name, item.keywords];
    return { ...item, name, keywords, category: EMOJI_CATEGORIES[item.category]?.[language] ?? item.category };
  });
  localized.set(language, entries);
  return entries;
}

export const emojiName = (emoji: string) => localizedEmoji().find((item) => item.emoji === emoji)?.name ?? emoji;

/** Search by name or keyword in the interface language; an empty query returns everything. */
export function searchEmoji(query: string, language: Language = currentLanguage()): EmojiEntry[] {
  const needle = query.trim().toLowerCase();
  const entries = localizedEmoji(language);
  if (!needle) return entries;
  return entries.filter((item) => item.name.toLowerCase().includes(needle) || item.keywords.toLowerCase().includes(needle) || item.emoji === needle);
}

export const hasReacted = (reaction: Reaction, userId: string) => reaction.users.some((user) => user.id === userId);

/** Demo mode keeps reaction rows in memory and aggregates them like the API does. */
export interface ReactionRow { targetId: string; userId: string; fullName: string; emoji: string; at: number }
export function aggregateReactions(rows: ReactionRow[], targetId: string): Reaction[] {
  const byEmoji = new Map<string, ReactionRow[]>();
  for (const row of rows.filter((item) => item.targetId === targetId).sort((a, b) => a.at - b.at)) byEmoji.set(row.emoji, [...(byEmoji.get(row.emoji) ?? []), row]);
  return [...byEmoji.entries()].map(([emoji, items]) => ({ emoji, count: items.length, users: items.slice(0, 10).map((item) => ({ id: item.userId, fullName: item.fullName })) }));
}

/** Applies a demo add or remove with the API's rules: known emoji, at most 20 distinct, idempotent. */
export function toggleDemoReaction(rows: ReactionRow[], row: Omit<ReactionRow, 'at'>, add: boolean): ReactionRow[] {
  if (!EMOJI.some((item) => item.emoji === row.emoji)) throw new Error(i18n.t('reactions.unknown'));
  const others = rows.filter((item) => !(item.targetId === row.targetId && item.userId === row.userId && item.emoji === row.emoji));
  if (!add) return others;
  const present = rows.some((item) => item.targetId === row.targetId && item.emoji === row.emoji);
  const distinct = new Set(rows.filter((item) => item.targetId === row.targetId).map((item) => item.emoji)).size;
  if (!present && distinct >= MAX_DISTINCT_REACTIONS) throw new Error(i18n.t('reactions.limit', { max: MAX_DISTINCT_REACTIONS }));
  return rows.length === others.length ? [...rows, { ...row, at: Date.now() + rows.length }] : rows;
}
