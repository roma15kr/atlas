import { query } from "./db";
import { ApiError } from "./errors";
import { boardAccessSql, boardUserAccessSql, canManageUser, funnelAccessSql } from "./scope";
import type { AuthContext, Role } from "./types";

export interface TargetUser {
  id: string;
  company_id: string;
  department_id: string | null;
  role: Role;
}

export async function manageableUser(auth: AuthContext, requestedId?: string): Promise<TargetUser> {
  const id = auth.role === "EMPLOYEE" ? auth.userId : requestedId ?? auth.userId;
  const result = await query<TargetUser>(
    "SELECT id, company_id, department_id, role FROM users WHERE id = $1 AND status = 'ACTIVE'",
    [id]
  );
  const target = result.rows[0];
  if (!target || !canManageUser(auth, target)) {
    throw new ApiError(403, "INVALID_OWNER", "Selected user is outside your access scope");
  }
  return target;
}

export function authForUser(user: TargetUser): AuthContext {
  return { userId: user.id, companyId: user.company_id, departmentId: user.department_id, username: "", role: user.role };
}

export async function canAccessFunnel(auth: AuthContext, funnelId: string): Promise<boolean> {
  const access = funnelAccessSql(auth, "f.id", 2);
  const result = await query(`SELECT 1 FROM deal_funnels f WHERE f.id = $1 AND ${access.sql}`, [funnelId, ...access.values]);
  return Boolean(result.rowCount);
}

/** A deal owner must be able to open the deal's funnel, otherwise they would own deals they cannot see. */
export async function assertOwnerFunnelAccess(owner: TargetUser, funnelId: string): Promise<void> {
  if (!await canAccessFunnel(authForUser(owner), funnelId)) {
    throw new ApiError(403, "OWNER_FUNNEL_ACCESS_REQUIRED", "The deal owner has no access to this funnel");
  }
}

export async function canAccessBoard(auth: AuthContext, boardId: string): Promise<boolean> {
  const access = boardAccessSql(auth, "b.id", 2);
  const result = await query(`SELECT 1 FROM task_boards b WHERE b.id = $1 AND ${access.sql}`, [boardId, ...access.values]);
  return Boolean(result.rowCount);
}

/** Every assignee must be an active user who can open the board, otherwise they would own tasks they cannot see. */
export async function assertAssigneesBoardAccess(boardId: string, userIds: string[]): Promise<void> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  const result = await query<{ id: string }>(
    `SELECT u.id FROM users u JOIN task_boards b ON b.id = $1 WHERE u.id = ANY($2::uuid[]) AND ${boardUserAccessSql("u", "b")}`,
    [boardId, unique]
  );
  if (result.rows.length !== unique.length) {
    throw new ApiError(403, "ASSIGNEE_BOARD_ACCESS_REQUIRED", "Every assignee must be able to open the board");
  }
}

export type ChatKind = "DM" | "GROUP" | "CHANNEL";

export interface ChatConversationRow {
  id: string;
  company_id: string;
  kind: ChatKind;
  name: string | null;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE" | null;
  is_default: boolean;
  archived_at: Date | null;
  my_role: "ADMIN" | "MEMBER" | null;
}

export interface ChatPermissions {
  /** Listed and inspectable: readable, or any channel for a director who manages it. */
  canSee: boolean;
  canRead: boolean;
  isMember: boolean;
  canManage: boolean;
}

/**
 * Chat access: members read their conversations, everyone reads public channels, and channel
 * admins and directors manage channels. Directors can manage a private channel without reading it.
 */
export function chatPermissions(auth: AuthContext, row: ChatConversationRow): ChatPermissions {
  const sameCompany = row.company_id === auth.companyId;
  const isMember = sameCompany && row.my_role !== null;
  const isChannel = row.kind === "CHANNEL";
  const canRead = isMember || (sameCompany && isChannel && row.visibility === "PUBLIC");
  const canManage = sameCompany && isChannel && (row.my_role === "ADMIN" || auth.role === "DIRECTOR");
  return { canSee: canRead || canManage, canRead, isMember, canManage };
}

/** Loads a conversation with the caller's membership; unknown and invisible ones are 404. */
export async function loadConversation(auth: AuthContext, id: string, need: "see" | "read" = "read"): Promise<ChatConversationRow & ChatPermissions> {
  const result = await query<ChatConversationRow>(
    `SELECT c.id, c.company_id, c.kind, c.name, c.description, c.visibility, c.is_default, c.archived_at, m.role AS my_role
     FROM chat_conversations c LEFT JOIN chat_members m ON m.conversation_id = c.id AND m.user_id = $2
     WHERE c.id = $1 AND c.company_id = $3`,
    [id, auth.userId, auth.companyId]
  );
  const row = result.rows[0];
  const permissions = row ? chatPermissions(auth, row) : null;
  if (!row || !permissions || !(need === "see" ? permissions.canSee : permissions.canRead)) {
    throw new ApiError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  }
  return { ...row, ...permissions };
}
