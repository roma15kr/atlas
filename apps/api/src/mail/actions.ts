import { query } from "../db";
import { ApiError } from "../errors";
import { emitToUsers } from "../realtime";
import { refreshThreads, type SpecialUse } from "./sync";
import { isDemoSecret, openImap, type MailAccountRow } from "./transport";

export const MAIL_ACTIONS = ["read", "unread", "star", "unstar", "move", "archive", "spam", "trash", "delete"] as const;
export type MailAction = (typeof MAIL_ACTIONS)[number];

interface TargetRow { id: string; thread_id: string; uid: string | null; folder_id: string | null; path: string | null; special_use: SpecialUse | null }

const TARGET: Partial<Record<MailAction, SpecialUse[]>> = { archive: ["ARCHIVE", "ALL"], spam: ["JUNK"], trash: ["TRASH"] };

/**
 * Applies an action to messages of one mailbox: first on the mail server, then locally, so a
 * server rejection leaves Atlas unchanged. Trash on a message already in Корзина deletes it.
 */
export async function applyAction(account: MailAccountRow, messageIds: string[], action: MailAction, folderId?: string): Promise<{ threadIds: string[] }> {
  const targets = await query<TargetRow>(
    `SELECT m.id, m.thread_id, m.uid::text, m.folder_id, f.path, f.special_use
     FROM mail_messages m LEFT JOIN mail_folders f ON f.id = m.folder_id WHERE m.id = ANY($1::uuid[]) AND m.account_id = $2`,
    [messageIds, account.id]
  );
  if (!targets.rows.length) throw new ApiError(404, "MAIL_NOT_FOUND", "Messages not found");
  let destination: { id: string; path: string; special_use: SpecialUse | null } | undefined;
  if (action === "move") {
    destination = (await query<{ id: string; path: string; special_use: SpecialUse | null }>("SELECT id, path, special_use FROM mail_folders WHERE id = $1 AND account_id = $2", [folderId, account.id])).rows[0];
    if (!destination) throw new ApiError(404, "MAIL_FOLDER_NOT_FOUND", "Folder not found");
  } else if (TARGET[action]) {
    const folders = await query<{ id: string; path: string; special_use: SpecialUse }>("SELECT id, path, special_use FROM mail_folders WHERE account_id = $1 AND special_use = ANY($2::text[])", [account.id, TARGET[action]]);
    destination = TARGET[action]!.map((use) => folders.rows.find((folder) => folder.special_use === use)).find(Boolean);
    if (!destination) throw new ApiError(400, "MAIL_FOLDER_MISSING", `This mailbox has no ${action === "archive" ? "archive" : action === "spam" ? "spam" : "trash"} folder`);
  }

  const onServer = targets.rows.filter((row) => row.path && row.uid);
  const byFolder = new Map<string, TargetRow[]>();
  onServer.forEach((row) => byFolder.set(row.path!, [...(byFolder.get(row.path!) ?? []), row]));
  const moved = new Map<string, { folderId: string; uid: number | null }>();
  const removed: string[] = [];

  if (byFolder.size && !isDemoSecret(account.secret)) {
    const client = await openImap(account);
    try {
      for (const [path, rows] of byFolder) {
        const lock = await client.getMailboxLock(path);
        try {
          const uids = rows.map((row) => row.uid).join(",");
          if (action === "read") await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
          else if (action === "unread") await client.messageFlagsRemove(uids, ["\\Seen"], { uid: true });
          else if (action === "star") await client.messageFlagsAdd(uids, ["\\Flagged"], { uid: true });
          else if (action === "unstar") await client.messageFlagsRemove(uids, ["\\Flagged"], { uid: true });
          else if (action === "delete" || (action === "trash" && rows[0]!.special_use === "TRASH")) {
            await client.messageDelete(uids, { uid: true });
            removed.push(...rows.map((row) => row.id));
          } else if (destination && destination.path !== path) {
            const result = await client.messageMove(uids, destination.path, { uid: true });
            for (const row of rows) moved.set(row.id, { folderId: destination.id, uid: result && result.uidMap ? result.uidMap.get(Number(row.uid)) ?? null : null });
          }
        } finally {
          lock.release();
        }
      }
    } finally {
      await client.logout().catch(() => client.close());
    }
  } else if (isDemoSecret(account.secret)) {
    // Demo mailboxes have no server: apply the same result locally.
    for (const row of targets.rows) {
      if (action === "delete" || (action === "trash" && row.special_use === "TRASH")) removed.push(row.id);
      else if (destination && destination.id !== row.folder_id) moved.set(row.id, { folderId: destination.id, uid: row.uid ? Number(row.uid) : null });
    }
  }

  const ids = targets.rows.map((row) => row.id);
  if (action === "read" || action === "unread") await query("UPDATE mail_messages SET seen = $2 WHERE id = ANY($1::uuid[])", [ids, action === "read"]);
  if (action === "star" || action === "unstar") await query("UPDATE mail_messages SET flagged = $2 WHERE id = ANY($1::uuid[])", [ids, action === "star"]);
  for (const [id, target] of moved) await query("UPDATE mail_messages SET folder_id = $2, uid = $3 WHERE id = $1", [id, target.folderId, target.uid]);
  if (removed.length) await query("DELETE FROM mail_messages WHERE id = ANY($1::uuid[])", [removed]);
  const threadIds = [...new Set(targets.rows.map((row) => row.thread_id))];
  await refreshThreads(threadIds);
  emitToUsers([account.user_id], "mail:changed", { accountId: account.id });
  return { threadIds };
}
