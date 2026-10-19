import { query } from "../db";
import { objectStorage } from "../storage";

/** Files uploaded for a chat message that was never sent are removed after a day, rows and stored objects. */
export async function cleanupStaleChatUploads(olderThanHours = 24): Promise<number> {
  const stale = await query<{ storage_key: string }>(
    `DELETE FROM chat_attachments WHERE message_id IS NULL AND created_at < now() - make_interval(hours => $1) RETURNING storage_key`,
    [olderThanHours]
  );
  for (const row of stale.rows) await objectStorage.delete(row.storage_key).catch((error) => console.error("Chat upload removal failed", error));
  return stale.rowCount ?? 0;
}
