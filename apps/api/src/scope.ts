import type { AuthContext, ScopeSql } from "./types";

/** The departments the caller acts within: own department plus, for a head, its sub-departments. */
export function scopeDepartments(auth: AuthContext): string[] {
  return auth.departmentIds ?? (auth.departmentId ? [auth.departmentId] : []);
}

/** Whether a department is the caller's own or (for a head) one of its sub-departments. */
export function coversDepartment(auth: AuthContext, departmentId: string | null | undefined): boolean {
  return Boolean(departmentId) && scopeDepartments(auth).includes(departmentId!);
}

export interface ScopeColumns {
  company?: string;
  department?: string;
  owner?: string;
}

export function recordScope(
  auth: AuthContext,
  columns: ScopeColumns = {},
  startIndex = 1
): ScopeSql {
  const company = columns.company ?? "company_id";
  const department = columns.department ?? "department_id";
  const owner = columns.owner ?? "owner_id";
  const values: unknown[] = [auth.companyId];
  const clauses = [`${company} = $${startIndex}`];

  if (auth.role === "MANAGER") {
    values.push(scopeDepartments(auth));
    clauses.push(`${department} = ANY($${startIndex + 1}::uuid[])`);
  } else if (auth.role === "EMPLOYEE") {
    values.push(auth.userId);
    clauses.push(`${owner} = $${startIndex + 1}`);
  }

  return { sql: clauses.join(" AND "), values };
}

/**
 * Restricts a funnel id column to funnels the user may open: every company funnel for a
 * director, otherwise company-wide funnels plus funnels granted to the user or their department.
 * Combine with recordScope() for deals; funnel access is a gate, not a replacement for role scope.
 */
export function funnelAccessSql(auth: AuthContext, funnelColumn: string, startIndex = 1): ScopeSql {
  const funnels = `SELECT af.id FROM deal_funnels af WHERE af.company_id = $${startIndex}`;
  if (auth.role === "DIRECTOR") {
    return { sql: `${funnelColumn} IN (${funnels})`, values: [auth.companyId] };
  }
  return {
    sql: `${funnelColumn} IN (${funnels} AND (af.access_mode = 'COMPANY' OR EXISTS (
      SELECT 1 FROM deal_funnel_access ga
      WHERE ga.funnel_id = af.id AND (ga.user_id = $${startIndex + 1} OR ga.department_id = $${startIndex + 2})
    )))`,
    values: [auth.companyId, auth.userId, auth.departmentId]
  };
}

/**
 * Restricts a task board id column to boards the user may open: every company board for a
 * director, otherwise boards of the user's department plus boards they were added to.
 * Boards are shared, so task reads use this instead of recordScope().
 */
export function boardAccessSql(auth: AuthContext, boardColumn: string, startIndex = 1): ScopeSql {
  const boards = `SELECT ab.id FROM task_boards ab WHERE ab.company_id = $${startIndex}`;
  if (auth.role === "DIRECTOR") {
    return { sql: `${boardColumn} IN (${boards})`, values: [auth.companyId] };
  }
  return {
    sql: `${boardColumn} IN (${boards} AND (ab.department_id = ANY($${startIndex + 1}::uuid[]) OR EXISTS (
      SELECT 1 FROM task_board_members am WHERE am.board_id = ab.id AND am.user_id = $${startIndex + 2}
    )))`,
    values: [auth.companyId, scopeDepartments(auth), auth.userId]
  };
}

/**
 * Tasks the user may open: everything on boards they can open, plus tasks assigned to them on other boards
 * (an assignee from another department sees their own task only, not the board).
 */
export function taskAccessSql(auth: AuthContext, taskAlias: string, startIndex = 1): ScopeSql {
  const board = boardAccessSql(auth, `${taskAlias}.board_id`, startIndex);
  if (auth.role === "DIRECTOR") return board;
  const me = startIndex + board.values.length;
  const own = `EXISTS (SELECT 1 FROM task_assignees ota WHERE ota.task_id = ${taskAlias}.id AND ota.user_id = $${me}) OR ${taskAlias}.created_by = $${me}`;
  if (auth.role !== "MANAGER") {
    return { sql: `((${taskAlias}.on_board AND ${board.sql}) OR ${own})`, values: [...board.values, auth.userId] };
  }
  // A head also oversees personal tasks whose author or an assignee works in a department they cover.
  const departments = me + 1;
  const team = `EXISTS (SELECT 1 FROM users tu WHERE tu.department_id = ANY($${departments}::uuid[]) AND (tu.id = ${taskAlias}.created_by
    OR EXISTS (SELECT 1 FROM task_assignees tta WHERE tta.task_id = ${taskAlias}.id AND tta.user_id = tu.id)))`;
  return { sql: `((${taskAlias}.on_board AND ${board.sql}) OR ${own} OR ${team})`, values: [...board.values, auth.userId, scopeDepartments(auth)] };
}

/** Boards whose settings the user may change: any for a director, own department's for a manager. */
export function boardManageSql(auth: AuthContext, boardColumn: string, startIndex = 1): ScopeSql {
  const boards = `SELECT mb.id FROM task_boards mb WHERE mb.company_id = $${startIndex}`;
  if (auth.role === "DIRECTOR") return { sql: `${boardColumn} IN (${boards})`, values: [auth.companyId] };
  if (auth.role === "MANAGER" && auth.departmentId) {
    return { sql: `${boardColumn} IN (${boards} AND mb.department_id = ANY($${startIndex + 1}::uuid[]))`, values: [auth.companyId, scopeDepartments(auth)] };
  }
  return { sql: "FALSE", values: [] };
}

/** The same rule as boardAccessSql(), for any active user row against any board row (assignee checks). */
export function boardUserAccessSql(userAlias: string, boardAlias: string): string {
  return `(${userAlias}.company_id = ${boardAlias}.company_id AND ${userAlias}.status = 'ACTIVE' AND (
    ${userAlias}.role = 'DIRECTOR' OR ${userAlias}.department_id = ${boardAlias}.department_id OR (${userAlias}.role = 'MANAGER' AND EXISTS (
      SELECT 1 FROM departments usd WHERE usd.id = ${boardAlias}.department_id AND usd.parent_id = ${userAlias}.department_id
    )) OR EXISTS (
      SELECT 1 FROM task_board_members um WHERE um.board_id = ${boardAlias}.id AND um.user_id = ${userAlias}.id
    )))`;
}

export function canManageUser(auth: AuthContext, target: { id: string; company_id: string; department_id: string | null }): boolean {
  if (target.company_id !== auth.companyId) return false;
  if (auth.role === "DIRECTOR") return true;
  if (auth.role === "MANAGER") return coversDepartment(auth, target.department_id);
  return target.id === auth.userId;
}

/**
 * Restricts a chat conversation id column to conversations the user may read: those they belong
 * to, plus public channels of their company. Roles don't widen this; directors don't read DMs,
 * groups or private channels they aren't in.
 */
export function chatAccessSql(auth: AuthContext, conversationColumn: string, startIndex = 1): ScopeSql {
  return {
    sql: `${conversationColumn} IN (SELECT ac.id FROM chat_conversations ac WHERE ac.company_id = $${startIndex} AND (
      (ac.kind = 'CHANNEL' AND ac.visibility = 'PUBLIC') OR EXISTS (
        SELECT 1 FROM chat_members am WHERE am.conversation_id = ac.id AND am.user_id = $${startIndex + 1}
      )))`,
    values: [auth.companyId, auth.userId]
  };
}

/**
 * Telegram contacts follow record scope through their responsible user: directors see the company,
 * heads their department plus unassigned contacts (the triage queue), employees only their own.
 */
export function telegramAccessSql(auth: AuthContext, contactAlias: string, startIndex = 1): ScopeSql {
  const company = `${contactAlias}.company_id = $${startIndex}`;
  if (auth.role === "DIRECTOR") return { sql: company, values: [auth.companyId] };
  if (auth.role === "MANAGER") {
    return { sql: `${company} AND (${contactAlias}.responsible_id IS NULL OR ${contactAlias}.department_id = ANY($${startIndex + 1}::uuid[]))`, values: [auth.companyId, scopeDepartments(auth)] };
  }
  return { sql: `${company} AND ${contactAlias}.responsible_id = $${startIndex + 1}`, values: [auth.companyId, auth.userId] };
}
