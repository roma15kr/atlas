import { z } from "zod";
import { query } from "../db";
import { ApiError } from "../errors";
import emojiList from "./emoji.json";

/** The emoji Atlas offers in its picker; nothing else is accepted as a reaction. */
export const REACTION_EMOJI = new Set((emojiList as Array<{ emoji: string }>).map((item) => item.emoji));
export const MAX_DISTINCT_REACTIONS = 20;
const NAMES_SHOWN = 10;

export const reactionInput = z.object({ emoji: z.string().refine((value) => REACTION_EMOJI.has(value), "Unknown reaction") }).strict();
export const reactionEmoji = z.string().refine((value) => REACTION_EMOJI.has(value), "Unknown reaction");

export interface Reaction { emoji: string; count: number; users: Array<{ id: string; fullName: string }> }

type Target = { table: "chat_message_reactions"; key: "message_id" } | { table: "task_comment_reactions"; key: "comment_id" };
export const CHAT_REACTIONS: Target = { table: "chat_message_reactions", key: "message_id" };
export const COMMENT_REACTIONS: Target = { table: "task_comment_reactions", key: "comment_id" };

/** A `reactions` column for rows aliased `alias`: each emoji with its count and the first people, by first use. */
export function reactionsSql(target: Target, idExpression: string): string {
  return `COALESCE((
    SELECT json_agg(json_build_object('emoji', r.emoji, 'count', r.count, 'users', to_json(r.users[1:${NAMES_SHOWN}])) ORDER BY r.first_at)
    FROM (SELECT rx.emoji, count(*)::int AS count, min(rx.created_at) AS first_at,
                 array_agg(json_build_object('id', ru.id, 'fullName', ru.full_name) ORDER BY rx.created_at) AS users
          FROM ${target.table} rx JOIN users ru ON ru.id = rx.user_id WHERE rx.${target.key} = ${idExpression} GROUP BY rx.emoji) r
  ), '[]'::json)`;
}

export async function reactionsOf(target: Target, id: string): Promise<Reaction[]> {
  return (await query<{ reactions: Reaction[] }>(`SELECT ${reactionsSql(target, "$1")} AS reactions`, [id])).rows[0]!.reactions;
}

/** Adds the caller's reaction (nothing changes if it exists); a 21st distinct emoji is refused. */
export async function addReaction(target: Target, id: string, userId: string, emoji: string): Promise<Reaction[]> {
  const distinct = await query<{ count: number; present: boolean }>(
    `SELECT count(DISTINCT emoji)::int AS count, bool_or(emoji = $2) AS present FROM ${target.table} WHERE ${target.key} = $1`, [id, emoji]);
  const row = distinct.rows[0]!;
  if (!row.present && row.count >= MAX_DISTINCT_REACTIONS) throw new ApiError(409, "REACTION_LIMIT", `At most ${MAX_DISTINCT_REACTIONS} different reactions`);
  await query(`INSERT INTO ${target.table} (${target.key}, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [id, userId, emoji]);
  return reactionsOf(target, id);
}

export async function removeReaction(target: Target, id: string, userId: string, emoji: string): Promise<Reaction[]> {
  await query(`DELETE FROM ${target.table} WHERE ${target.key} = $1 AND user_id = $2 AND emoji = $3`, [id, userId, emoji]);
  return reactionsOf(target, id);
}
