import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { config } from "../config";
import { pool, query } from "../db";
import { bot, telegramConfigured, type TelegramUpdate } from "./botApi";
import { processUpdate, storeUpdate } from "./handleUpdate";

const SWEEP_MS = 60_000;
let companyId: string | null = null;
let sweeper: NodeJS.Timeout | null = null;
let polling = false;

/** The bot serves the deployment's company: the first one created. */
export async function botCompanyId(): Promise<string | null> {
  if (companyId) return companyId;
  companyId = (await query<{ id: string }>("SELECT id FROM companies ORDER BY created_at LIMIT 1")).rows[0]?.id ?? null;
  return companyId;
}

export const webhookUrl = (): string => `${config.PUBLIC_URL.replace(/\/$/, "")}/api/telegram/webhook`;

async function receive(update: TelegramUpdate): Promise<void> {
  const company = await botCompanyId();
  if (!company || typeof update?.update_id !== "number") return;
  if (await storeUpdate(company, update)) await processUpdate(update.update_id).catch(() => undefined);
}

/**
 * Public webhook: accepted only with the configured secret token header (constant-time check).
 * The update is stored first and answered at once; processing failures are retried by the sweeper.
 */
export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const expected = config.TELEGRAM_WEBHOOK_SECRET;
  const given = req.get("x-telegram-bot-api-secret-token") ?? "";
  if (!telegramConfigured() || !expected || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid secret token" } });
    return;
  }
  const update = req.body as TelegramUpdate;
  const company = await botCompanyId();
  const fresh = company && typeof update?.update_id === "number" ? await storeUpdate(company, update) : false;
  res.status(200).json({ ok: true });
  if (fresh) setImmediate(() => void processUpdate(update.update_id).catch(() => undefined));
}

/** Registers the webhook (or clears it for polling) and records the bot's username and any delivery error. */
export async function checkConnection(): Promise<{ botUsername: string; mode: string; url: string | null; pendingUpdates: number; lastError: string | null }> {
  const company = await botCompanyId();
  const me = await bot.getMe();
  if (config.TELEGRAM_MODE === "webhook") await bot.setWebhook(webhookUrl(), config.TELEGRAM_WEBHOOK_SECRET!);
  else await bot.deleteWebhook();
  const info = await bot.getWebhookInfo();
  const lastError = info.last_error_message ? `${new Date((info.last_error_date ?? 0) * 1000).toISOString()}: ${info.last_error_message}` : null;
  if (company) {
    await query(
      `INSERT INTO telegram_settings (company_id, bot_username, last_error) VALUES ($1, $2, $3)
       ON CONFLICT (company_id) DO UPDATE SET bot_username = EXCLUDED.bot_username, last_error = EXCLUDED.last_error`,
      [company, me.username, lastError]
    );
  }
  return { botUsername: me.username, mode: config.TELEGRAM_MODE, url: info.url || null, pendingUpdates: info.pending_update_count, lastError };
}

/** Retries updates that failed and prunes processed ones after 7 days. */
export async function sweep(): Promise<void> {
  const pending = await query<{ update_id: string }>(
    "SELECT update_id FROM telegram_updates WHERE processed_at IS NULL AND attempts < 5 AND received_at < now() - interval '30 seconds' ORDER BY update_id LIMIT 50"
  );
  for (const row of pending.rows) await processUpdate(Number(row.update_id)).catch(() => undefined);
  await query("DELETE FROM telegram_updates WHERE received_at < now() - interval '7 days'");
}

/** Long polling for servers without HTTPS; an advisory lock keeps it to one API instance. */
async function pollLoop(): Promise<void> {
  const client = await pool.connect();
  try {
    const locked = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext('telegram:poll')) AS locked");
    if (!locked.rows[0]?.locked) return;
    let offset = Number((await query<{ next: string | null }>("SELECT max(update_id) + 1 AS next FROM telegram_updates")).rows[0]?.next ?? 0);
    while (polling) {
      try {
        const updates = await bot.getUpdates(offset);
        for (const update of updates) { await receive(update); offset = update.update_id + 1; }
      } catch (error) {
        console.error("Telegram polling failed", error instanceof Error ? error.message : error);
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('telegram:poll'))").catch(() => undefined);
    client.release();
  }
}

export async function startTelegram(): Promise<void> {
  if (!telegramConfigured()) return;
  try { await checkConnection(); } catch (error) { console.error("Telegram connection check failed", error instanceof Error ? error.message : error); }
  if (config.TELEGRAM_MODE === "polling" && !polling) { polling = true; void pollLoop(); }
  if (!sweeper) { sweeper = setInterval(() => void sweep().catch(() => undefined), SWEEP_MS); sweeper.unref(); }
}

export function stopTelegram(): void {
  polling = false;
  if (sweeper) clearInterval(sweeper);
  sweeper = null;
}
