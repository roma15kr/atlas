import { Router } from "express";
import { requireAuth } from "../auth";
import { config } from "../config";
import { query } from "../db";
import { asyncHandler } from "../errors";
import { mailProviders } from "./mail";

type Status = "CONNECTED" | "DISCONNECTED" | "NEEDS_ATTENTION";

/** Company-level channels: configured by a server credential, status stored per company. */
const companyChannels: Record<string, () => boolean> = {
  TELEGRAM: () => Boolean(config.TELEGRAM_BOT_TOKEN),
  WHATSAPP: () => Boolean(config.WHATSAPP_ACCESS_TOKEN),
  VIBER: () => Boolean(config.VIBER_AUTH_TOKEN)
};
const mailKinds = { MAIL_IMAP: "IMAP", MAIL_GOOGLE: "GOOGLE", MAIL_MICROSOFT: "MICROSOFT" } as const;

export const integrationsRouter = Router();

/**
 * Every customer-communication provider with `serverConfigured` from server settings. Mail providers
 * also list the caller's own mailboxes (never anyone else's); an unconfigured provider is DISCONNECTED.
 */
integrationsRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const [stored, mailboxes] = await Promise.all([
    query<{ id: string; provider: string; status: Status; displayName: string | null; lastSyncedAt: Date | null; metadata: Record<string, unknown> }>(
      `SELECT id, provider, status, display_name AS "displayName", last_synced_at AS "lastSyncedAt", metadata
       FROM integrations WHERE company_id = $1 AND user_id IS NULL`,
      [auth.companyId]
    ),
    query<{ id: string; provider: string; email: string; status: Status; lastSyncedAt: Date | null }>(
      `SELECT id, provider, email, status, last_synced_at AS "lastSyncedAt" FROM mail_accounts WHERE user_id = $1 ORDER BY created_at`,
      [auth.userId]
    )
  ]);
  const available = mailProviders();
  const mailConfigured: Record<keyof typeof mailKinds, boolean> = { MAIL_IMAP: available.imap, MAIL_GOOGLE: available.google, MAIL_MICROSOFT: available.microsoft };
  const mail = (Object.keys(mailKinds) as Array<keyof typeof mailKinds>).map((provider) => {
    const mine = mailboxes.rows.filter((row) => row.provider === mailKinds[provider]);
    const status: Status = !mailConfigured[provider] || !mine.length ? "DISCONNECTED" : mine.some((row) => row.status === "NEEDS_ATTENTION") ? "NEEDS_ATTENTION" : "CONNECTED";
    return {
      id: null, provider, status, displayName: mine.map((row) => row.email).join(", ") || null,
      lastSyncedAt: mine.map((row) => row.lastSyncedAt).filter(Boolean).sort().at(-1) ?? null, metadata: {},
      serverConfigured: mailConfigured[provider], mailboxes: mine
    };
  });
  const byProvider = new Map(stored.rows.map((row) => [row.provider, row]));
  const company = Object.entries(companyChannels).map(([provider, configured]) => {
    const row = byProvider.get(provider);
    return {
      id: row?.id ?? null, provider, status: configured() ? row?.status ?? "DISCONNECTED" : "DISCONNECTED", displayName: row?.displayName ?? null,
      lastSyncedAt: row?.lastSyncedAt ?? null, metadata: row?.metadata ?? {}, serverConfigured: configured()
    };
  });
  res.json({ data: [...mail, ...company] });
}));
