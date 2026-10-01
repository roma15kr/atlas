import { config } from "../config";
import { pool, query } from "../db";
import { recordFailure, syncAccount } from "./sync";

const TICK_MS = 30_000;
const CONCURRENCY = 5;
const PRUNE_EVERY_MS = 24 * 3_600_000;

let timer: NodeJS.Timeout | null = null;
let running = 0;
let lastPrune = 0;

/**
 * Runs due mailbox syncs in the API process. Each sync holds a Postgres advisory lock on its
 * mailbox, so a second API instance or an overlapping deploy never syncs the same mailbox twice.
 */
export async function runDueSyncs(limit = CONCURRENCY - running): Promise<number> {
  if (limit <= 0) return 0;
  const due = await query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM mail_accounts WHERE status = 'CONNECTED' AND next_sync_at <= now() AND NOT (secret ? 'demo')
     ORDER BY next_sync_at LIMIT $1`,
    [limit]
  );
  await Promise.all(due.rows.map((account) => syncWithLock(account.id, account.user_id)));
  return due.rows.length;
}

export async function syncWithLock(accountId: string, userId: string, options: { full?: boolean } = {}): Promise<boolean> {
  const client = await pool.connect();
  running += 1;
  try {
    const locked = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext('mail:' || $1)) AS locked", [accountId]);
    if (!locked.rows[0]?.locked) return false;
    try {
      await syncAccount(accountId, options);
    } catch (error) {
      // syncAccount records the failure; a failure before it loaded the account is recorded here.
      if (!(error as { recorded?: boolean }).recorded) await recordFailure({ id: accountId, user_id: userId }, error).catch(() => undefined);
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('mail:' || $1))", [accountId]);
    }
    return true;
  } finally {
    running -= 1;
    client.release();
  }
}

/** Drops bodies of unlinked mail that fell out of the sync window, keeping the database bounded. */
export async function pruneOldMail(): Promise<number> {
  const result = await query(
    `DELETE FROM mail_messages m USING mail_threads t
     WHERE t.id = m.thread_id AND t.client_id IS NULL AND t.deal_id IS NULL AND m.send_status IS NULL
       AND m.sent_at < now() - make_interval(days => $1 + 7)`,
    [config.MAIL_SYNC_DAYS]
  );
  await query("DELETE FROM mail_threads t WHERE client_id IS NULL AND deal_id IS NULL AND NOT EXISTS (SELECT 1 FROM mail_messages m WHERE m.thread_id = t.id)");
  await query("DELETE FROM mail_oauth_states WHERE expires_at < now() - interval '1 day'");
  return result.rowCount ?? 0;
}

export function startMailScheduler(): void {
  if (timer || config.MAIL_SCHEDULER === "off") return;
  timer = setInterval(() => {
    void runDueSyncs().catch((error) => console.error("Mail sync tick failed", error));
    if (Date.now() - lastPrune > PRUNE_EVERY_MS) {
      lastPrune = Date.now();
      void pruneOldMail().catch((error) => console.error("Mail prune failed", error));
    }
  }, TICK_MS);
  timer.unref();
}

export function stopMailScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
