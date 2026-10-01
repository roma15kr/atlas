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
      input.departmentId !== undefined ? input.departmentId : input.auth?.departmentId ?? null,
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

/** Audit for work done in the background (mail sync, bots) on behalf of a user, without a request. */
export async function writeSystemAudit(input: AuditInput): Promise<void> {
  await query(
    `INSERT INTO audit_logs (company_id, department_id, actor_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [input.auth?.companyId ?? null, input.departmentId !== undefined ? input.departmentId : input.auth?.departmentId ?? null,
      input.auth?.userId ?? null, input.action, input.entityType, input.entityId ?? null, JSON.stringify(input.metadata ?? {})]
  );
}

/** Audit for Atlas's own automation (achievements, scheduled reports): no actor, no request. */
export async function writeAutomationAudit(companyId: string, input: Omit<AuditInput, "auth">): Promise<void> {
  await query(
    `INSERT INTO audit_logs (company_id, department_id, actor_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, NULL, $3, $4, $5, $6::jsonb)`,
    [companyId, input.departmentId ?? null, input.action, input.entityType, input.entityId ?? null, JSON.stringify(input.metadata ?? {})]
  );
}
