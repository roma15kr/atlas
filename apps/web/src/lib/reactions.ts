import emojiList from './emoji.json';

export interface Reaction { emoji: string; count: number; users: Array<{ id: string; fullName: string }> }
export interface EmojiEntry { emoji: string; name: string; keywords: string; category: string }

/** The emoji Atlas offers (the API accepts exactly these), with Russian names for search. */
export const EMOJI: EmojiEntry[] = emojiList;
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅'];
export const MAX_DISTINCT_REACTIONS = 20;

export const emojiName = (emoji: string) => EMOJI.find((item) => item.emoji === emoji)?.name ?? emoji;

/** Search by Russian name or keyword; an empty query returns everything. */
export function searchEmoji(query: string): EmojiEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return EMOJI;
  return EMOJI.filter((item) => item.name.includes(needle) || item.keywords.includes(needle) || item.emoji === needle);
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
  if (!EMOJI.some((item) => item.emoji === row.emoji)) throw new Error('Такой реакции нет');
  const others = rows.filter((item) => !(item.targetId === row.targetId && item.userId === row.userId && item.emoji === row.emoji));
  if (!add) return others;
  const present = rows.some((item) => item.targetId === row.targetId && item.emoji === row.emoji);
  const distinct = new Set(rows.filter((item) => item.targetId === row.targetId).map((item) => item.emoji)).size;
  if (!present && distinct >= MAX_DISTINCT_REACTIONS) throw new Error(`Не больше ${MAX_DISTINCT_REACTIONS} разных реакций`);
  return rows.length === others.length ? [...rows, { ...row, at: Date.now() + rows.length }] : rows;
}
