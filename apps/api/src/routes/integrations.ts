import { Router } from "express";
import { requireAuth } from "../auth";
import { config } from "../config";
import { query } from "../db";
import { asyncHandler } from "../errors";

const configured: Record<string, () => boolean> = {
  GMAIL: () => Boolean(config.GOOGLE_CLIENT_ID),
  OUTLOOK: () => Boolean(config.MICROSOFT_CLIENT_ID),
  TELEGRAM: () => Boolean(config.TELEGRAM_BOT_TOKEN),
  WHATSAPP: () => Boolean(config.WHATSAPP_ACCESS_TOKEN),
  VIBER: () => Boolean(config.VIBER_AUTH_TOKEN)
};

export const integrationsRouter = Router();

integrationsRouter.get("/", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const stored = await query<{
    id: string; provider: string; status: string; displayName: string | null;
    lastSyncedAt: Date | null; metadata: Record<string, unknown>;
  }>(
    `SELECT id, provider, status, display_name AS "displayName", last_synced_at AS "lastSyncedAt", metadata
     FROM integrations WHERE company_id = $1 AND (user_id IS NULL OR user_id = $2)`,
    [auth.companyId, auth.userId]
  );
  const byProvider = new Map(stored.rows.map((row) => [row.provider, row]));
  const data = Object.entries(configured).map(([provider, available]) => {
    const row = byProvider.get(provider);
    return {
      id: row?.id ?? null,
      provider,
      status: available() ? row?.status ?? "DISCONNECTED" : "DISCONNECTED",
      displayName: row?.displayName ?? null,
      lastSyncedAt: row?.lastSyncedAt ?? null,
      metadata: row?.metadata ?? {},
      serverConfigured: available()
    };
  });
  res.json({ data });
}));
