import { query } from "../db";
import { objectStorage } from "../storage";

/** Files uploaded for a chat message or a task comment that was never sent are removed after a day, rows and objects. */
export async function cleanupStaleUploads(olderThanHours = 24): Promise<number> {
  let removed = 0;
  for (const [table, link] of [["chat_attachments", "message_id"], ["task_comment_attachments", "comment_id"]] as const) {
    const stale = await query<{ storage_key: string }>(
      `DELETE FROM ${table} WHERE ${link} IS NULL AND created_at < now() - make_interval(hours => $1) RETURNING storage_key`,
      [olderThanHours]
    );
    for (const row of stale.rows) await objectStorage.delete(row.storage_key).catch((error) => console.error("Upload removal failed", error));
    removed += stale.rowCount ?? 0;
  }
  return removed;
}
