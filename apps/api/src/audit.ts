import type { Request } from "express";
import { query } from "./db";
import type { AuthContext } from "./types";

export interface AuditInput {
  auth?: AuthContext | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  departmentId?: string | null;
}

export async function writeAudit(req: Request, input: AuditInput): Promise<void> {
  const ip = req.ip || req.socket.remoteAddress || null;
  await query(
    `INSERT INTO audit_logs
      (company_id, department_id, actor_id, action, entity_type, entity_id, ip, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8, $9::jsonb)`,
    [
      input.auth?.companyId ?? null,
      input.departmentId ?? input.auth?.departmentId ?? null,
      input.auth?.userId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      normalizeIp(ip),
      req.get("user-agent")?.slice(0, 500) ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

function normalizeIp(ip: string | null): string | null {
  if (!ip) return null;
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}
