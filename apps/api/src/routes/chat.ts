import { Router, type Request } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { chatPermissions, loadConversation, type ChatConversationRow, type ChatPermissions } from "../access";
import { writeAudit } from "../audit";
import { requireAuth } from "../auth";
import { query, transaction } from "../db";
import { ApiError, asyncHandler } from "../errors";
import { chatPostLimiter } from "../middleware";
import { emitToUsers } from "../realtime";
import { chatAccessSql } from "../scope";
import type { AuthContext } from "../types";

export const GROUP_MAX_PARTICIPANTS = 20;
export const GROUP_MIN_PARTICIPANTS = 3;
const PAGE_MAX = 50;

const idSchema = z.string().uuid();
const channelNameSchema = z.string().trim().min(1).max(80);
const descriptionSchema = z.string().trim().max(500);
const bodySchema = z.string().trim().min(1).max(4000);
const userIdsSchema = z.array(z.string().uuid()).min(1).max(GROUP_MAX_PARTICIPANTS);

export const channelCreateSchema = z.object({
  name: channelNameSchema,
  description: descriptionSchema.nullable().optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  memberIds: z.array(z.string().uuid()).max(500).default([])
});
const channelPatchSchema = z.object({
  name: channelNameSchema.optional(),
  description: descriptionSchema.nullable().optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional()
});
export const groupCreateSchema = z.object({
  userIds: userIdsSchema,
  name: z.string().trim().max(80).nullable().optional()
});
const messageSchema = z.object({ body: bodySchema, parentId: z.string().uuid().nullable().optional() });

type Conversation = ChatConversationRow & ChatPermissions;

export const chatRouter = Router();

/** The distinct participants of a new group, the creator included, validated against the size limits. */
export function groupParticipants(creatorId: string, userIds: string[]): string[] {
  const participants = [...new Set([creatorId, ...userIds])];
  if (participants.length < GROUP_MIN_PARTICIPANTS) {
    throw new ApiError(400, "CHAT_GROUP_TOO_SMALL", "A group needs at least three participants; message one person directly instead");
  }
  if (participants.length > GROUP_MAX_PARTICIPANTS) {
    throw new ApiError(400, "CHAT_MEMBER_LIMIT", `A group can have at most ${GROUP_MAX_PARTICIPANTS} participants`);
  }
  return participants;
}

export const dmKey = (a: string, b: string): string => [a, b].sort().join(":");

/**
 * Usernames mentioned as `@username` (lowercased, unique), and whether `@channel` was used.
 * An `@` inside a word or an email address is not a mention.
 */
export function parseMentions(body: string): { usernames: string[]; channel: boolean } {
  const found = new Set<string>();
  let channel = false;
  for (const match of body.matchAll(/(^|[^\p{L}\p{N}._@-])@([a-z0-9._-]{2,50})/giu)) {
    const name = match[2]!.toLowerCase().replace(/[.-]+$/, "");
    if (name === "channel") channel = true;
    else if (name.length >= 2) found.add(name);
  }
  return { usernames: [...found], channel };
}

/** `@channel` notifies everyone, so it is kept for channel admins, directors and department heads. */
export function canUseChannelMention(auth: AuthContext, conversation: Pick<ChatConversationRow, "kind" | "my_role">): boolean {
  return conversation.kind === "CHANNEL" && (conversation.my_role === "ADMIN" || auth.role === "DIRECTOR" || auth.role === "MANAGER");
}

async function deny(req: Request, auth: AuthContext, action: string, conversationId: string | null, metadata: Record<string, unknown> = {}): Promise<never> {
  await writeAudit(req, { auth, action: `${action}_DENIED`, entityType: "chat_conversation", entityId: conversationId, metadata });
  throw new ApiError(403, "CHAT_FORBIDDEN", "You can't change this conversation");
}

function audit(req: Request, auth: AuthContext, action: string, conversationId: string, metadata: Record<string, unknown> = {}): Promise<void> {
  return writeAudit(req, { auth, action, entityType: "chat_conversation", entityId: conversationId, metadata });
}

function assertNotDefault(conversation: Conversation): void {
  if (conversation.is_default) throw new ApiError(400, "CHAT_DEFAULT_CHANNEL", "The company channel always includes everyone");
}

function assertActive(conversation: Conversation): void {
  if (conversation.archived_at) throw new ApiError(409, "CONVERSATION_ARCHIVED", "The conversation is archived");
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

async function withChannelName<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "CHANNEL_NAME_TAKEN", "A channel with this name already exists");
    throw error;
  }
}

async function memberIds(conversationId: string, db: Pick<PoolClient, "query"> | null = null): Promise<string[]> {
  const sql = "SELECT user_id FROM chat_members WHERE conversation_id = $1";
  const result = db ? await db.query<{ user_id: string }>(sql, [conversationId]) : await query<{ user_id: string }>(sql, [conversationId]);
  return result.rows.map((row) => row.user_id);
}

/** Active users of the caller's company among `ids`; anything else is a client error. */
async function assertCompanyUsers(auth: AuthContext, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const result = await query("SELECT id FROM users WHERE id = ANY($1::uuid[]) AND company_id = $2 AND status = 'ACTIVE'", [unique, auth.companyId]);
  if (result.rowCount !== unique.length) throw new ApiError(400, "CHAT_INVALID_MEMBERS", "Every participant must be an active colleague");
}

const authorJson = `json_build_object('id', u.id, 'fullName', u.full_name, 'username', u.username, 'active', u.status = 'ACTIVE', 'avatarUrl', u.avatar_url)`;
const messageColumns = `x.id, x.conversation_id AS "conversationId", x.parent_id AS "parentId",
  CASE WHEN x.deleted_at IS NULL THEN x.body END AS body,
  x.reply_count AS "replyCount", x.last_reply_at AS "lastReplyAt", x.edited_at AS "editedAt",
  x.deleted_at AS "deletedAt", x.created_at AS "createdAt", ${authorJson} AS author,
  ARRAY(SELECT mm.user_id FROM chat_mentions mm WHERE mm.message_id = x.id) AS "mentionedUserIds"`;

async function messageById(id: string): Promise<Record<string, unknown>> {
  const result = await query(`SELECT ${messageColumns} FROM chat_messages x JOIN users u ON u.id = x.author_id WHERE x.id = $1`, [id]);
  return result.rows[0]!;
}

/** The caller's member conversations with unread and mention counts, newest activity first. */
async function conversationSummaries(auth: AuthContext, options: { ids?: string[]; archived?: boolean } = {}): Promise<Record<string, unknown>[]> {
  const values: unknown[] = [auth.companyId, auth.userId, options.archived ?? false];
  let filter = "";
  if (options.ids) { values.push(options.ids); filter = `AND c.id = ANY($${values.length}::uuid[])`; }
  const result = await query(
    `SELECT c.id, c.kind, c.name, c.description, c.visibility, c.is_default AS "isDefault", c.archived_at AS "archivedAt",
            coalesce(c.last_message_at, c.created_at) AS "lastActivityAt", m.role AS "myRole", m.muted, m.last_read_at AS "lastReadAt",
            (SELECT count(*)::int FROM (SELECT 1 FROM chat_messages x WHERE x.conversation_id = c.id AND x.created_at > m.last_read_at
               AND x.author_id <> $2 AND x.deleted_at IS NULL LIMIT 100) unread) AS unread,
            (SELECT count(*)::int FROM chat_mentions mm JOIN chat_messages x ON x.id = mm.message_id
             WHERE mm.user_id = $2 AND mm.read_at IS NULL AND x.conversation_id = c.id AND x.deleted_at IS NULL) AS mentions,
            (SELECT count(*)::int FROM chat_members cm WHERE cm.conversation_id = c.id) AS "memberCount",
            CASE WHEN c.kind <> 'CHANNEL' THEN (
              SELECT json_agg(json_build_object('id', pu.id, 'fullName', pu.full_name, 'username', pu.username, 'active', pu.status = 'ACTIVE') ORDER BY pu.full_name)
              FROM chat_members pm JOIN users pu ON pu.id = pm.user_id WHERE pm.conversation_id = c.id) END AS participants,
            last.message AS "lastMessage"
     FROM chat_members m JOIN chat_conversations c ON c.id = m.conversation_id
     LEFT JOIN LATERAL (
       SELECT json_build_object('id', x.id, 'body', CASE WHEN x.deleted_at IS NULL THEN left(x.body, 140) END,
                                'authorId', x.author_id, 'authorName', u.full_name, 'createdAt', x.created_at) AS message
       FROM chat_messages x JOIN users u ON u.id = x.author_id WHERE x.conversation_id = c.id ORDER BY x.created_at DESC LIMIT 1
     ) last ON true
     WHERE m.user_id = $2 AND c.company_id = $1 AND (c.archived_at IS NULL OR $3) ${filter}
     ORDER BY "lastActivityAt" DESC`,
    values
  );
  return result.rows;
}

async function summaryFor(auth: AuthContext, id: string): Promise<Record<string, unknown>> {
  const [row] = await conversationSummaries(auth, { ids: [id], archived: true });
  if (!row) throw new ApiError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  return row;
}

async function notifyConversationChanged(conversationId: string, extraUserIds: string[] = []): Promise<void> {
  emitToUsers([...await memberIds(conversationId), ...extraUserIds], "chat:conversation-updated", { conversationId });
}

chatRouter.get("/people", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const people = await query(
    `SELECT u.id, u.full_name AS "fullName", u.username, u.job_title AS "jobTitle", d.name AS "departmentName"
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.company_id = $1 AND u.status = 'ACTIVE' ORDER BY u.full_name`,
    [auth.companyId]
  );
  res.json({ data: people.rows });
}));

chatRouter.get("/conversations", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const { archived } = z.object({ archived: z.enum(["true", "false"]).optional() }).parse(req.query);
  res.json({ data: await conversationSummaries(auth, { archived: archived === "true" }) });
}));

chatRouter.get("/unread", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const summaries = await conversationSummaries(auth) as Array<{ unread: number; mentions: number; muted: boolean }>;
  const outside = await query<{ count: number }>(
    `SELECT count(*)::int AS count FROM chat_mentions mm JOIN chat_messages x ON x.id = mm.message_id
     WHERE mm.user_id = $1 AND mm.read_at IS NULL AND x.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM chat_members m WHERE m.conversation_id = x.conversation_id AND m.user_id = $1)`,
    [auth.userId]
  );
  const unread = summaries.filter((item) => !item.muted).reduce((sum, item) => sum + item.unread, 0);
  const mentions = summaries.reduce((sum, item) => sum + item.mentions, 0) + (outside.rows[0]?.count ?? 0);
  const mutedMentions = summaries.filter((item) => item.muted).reduce((sum, item) => sum + item.mentions, 0) + (outside.rows[0]?.count ?? 0);
  res.json({ data: { unread, mentions, badge: unread + mutedMentions } });
}));

chatRouter.get("/conversations/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const conversation = await loadConversation(auth, idSchema.parse(req.params.id), "see");
  if (conversation.isMember) { res.json({ data: { ...await summaryFor(auth, conversation.id), ...permissionsOf(conversation) } }); return; }
  const count = await query<{ count: number }>("SELECT count(*)::int AS count FROM chat_members WHERE conversation_id = $1", [conversation.id]);
  res.json({ data: {
    id: conversation.id, kind: conversation.kind, name: conversation.name, description: conversation.description,
    visibility: conversation.visibility, isDefault: conversation.is_default, archivedAt: conversation.archived_at,
    myRole: null, muted: false, unread: 0, mentions: 0, memberCount: count.rows[0]?.count ?? 0, participants: null, ...permissionsOf(conversation)
  } });
}));

function permissionsOf(conversation: Conversation): Record<string, boolean> {
  return { canRead: conversation.canRead, canManage: conversation.canManage, isMember: conversation.isMember };
}

chatRouter.post("/direct", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const { userId } = z.object({ userId: z.string().uuid() }).parse(req.body);
  if (userId === auth.userId) throw new ApiError(400, "CHAT_SELF_DM", "Choose a colleague to message");
  const key = dmKey(auth.userId, userId);
  const existing = await query<{ id: string }>("SELECT id FROM chat_conversations WHERE company_id = $1 AND dm_key = $2", [auth.companyId, key]);
  let id = existing.rows[0]?.id;
  if (!id) {
    const target = await query("SELECT 1 FROM users WHERE id = $1 AND company_id = $2 AND status = 'ACTIVE'", [userId, auth.companyId]);
    if (!target.rowCount) throw new ApiError(404, "USER_NOT_FOUND", "Colleague not found");
    id = await transaction(async (client) => {
      const created = await client.query<{ id: string }>(
        `INSERT INTO chat_conversations (company_id, kind, dm_key, created_by) VALUES ($1, 'DM', $2, $3)
         ON CONFLICT (company_id, dm_key) WHERE dm_key IS NOT NULL DO UPDATE SET dm_key = EXCLUDED.dm_key RETURNING id`,
        [auth.companyId, key, auth.userId]
      );
      const conversationId = created.rows[0]!.id;
      await client.query(
        "INSERT INTO chat_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING",
        [conversationId, auth.userId, userId]
      );
      return conversationId;
    });
  }
  res.status(existing.rowCount ? 200 : 201).json({ data: await summaryFor(auth, id) });
}));

chatRouter.post("/groups", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const input = groupCreateSchema.parse(req.body);
  const participants = groupParticipants(auth.userId, input.userIds);
  await assertCompanyUsers(auth, participants);
  const id = await transaction(async (client) => {
    const created = await client.query<{ id: string }>(
      "INSERT INTO chat_conversations (company_id, kind, name, created_by) VALUES ($1, 'GROUP', $2, $3) RETURNING id",
      [auth.companyId, input.name || null, auth.userId]
    );
    const conversationId = created.rows[0]!.id;
    await client.query("INSERT INTO chat_members (conversation_id, user_id) SELECT $1, unnest($2::uuid[])", [conversationId, participants]);
    return conversationId;
  });
  emitToUsers(participants.filter((user) => user !== auth.userId), "chat:membership", { conversationId: id, added: true });
  res.status(201).json({ data: await summaryFor(auth, id) });
}));

chatRouter.patch("/groups/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const conversation = await loadConversation(auth, idSchema.parse(req.params.id));
  if (conversation.kind !== "GROUP") throw new ApiError(400, "CHAT_NOT_A_GROUP", "Only group conversations can be renamed here");
  const { name } = z.object({ name: z.string().trim().max(80).nullable() }).parse(req.body);
  await query("UPDATE chat_conversations SET name = $2 WHERE id = $1", [conversation.id, name || null]);
  await notifyConversationChanged(conversation.id);
  res.json({ data: await summaryFor(auth, conversation.id) });
}));

chatRouter.get("/channels", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const { archived } = z.object({ archived: z.enum(["true", "false"]).optional() }).parse(req.query);
  const result = await query<ChatConversationRow & { memberCount: number }>(
    `SELECT c.id, c.company_id, c.kind, c.name, c.description, c.visibility, c.is_default, c.archived_at, m.role AS my_role,
            (SELECT count(*)::int FROM chat_members cm WHERE cm.conversation_id = c.id) AS "memberCount"
     FROM chat_conversations c LEFT JOIN chat_members m ON m.conversation_id = c.id AND m.user_id = $2
     WHERE c.company_id = $1 AND c.kind = 'CHANNEL' AND (c.archived_at IS NULL OR $3)
       AND (c.visibility = 'PUBLIC' OR m.user_id IS NOT NULL OR $4)
     ORDER BY c.is_default DESC, lower(c.name)`,
    [auth.companyId, auth.userId, archived === "true", auth.role === "DIRECTOR"]
  );
  res.json({ data: result.rows.map((row) => {
    const conversation = { ...row, ...chatPermissions(auth, row) };
    return {
      id: row.id, name: row.name, description: row.description, visibility: row.visibility, isDefault: row.is_default,
      archivedAt: row.archived_at, memberCount: row.memberCount, myRole: row.my_role, ...permissionsOf(conversation)
    };
  }) });
}));

chatRouter.post("/channels", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  if (auth.role === "EMPLOYEE") {
    await writeAudit(req, { auth, action: "CHAT_CHANNEL_CREATE_DENIED", entityType: "chat_conversation", metadata: {} });
    throw new ApiError(403, "CHAT_FORBIDDEN", "Only directors and department heads create channels");
  }
  const input = channelCreateSchema.parse(req.body);
  const extra = input.memberIds.filter((id) => id !== auth.userId);
  await assertCompanyUsers(auth, extra);
  const id = await withChannelName(() => transaction(async (client) => {
    const created = await client.query<{ id: string }>(
      `INSERT INTO chat_conversations (company_id, kind, name, description, visibility, created_by)
       VALUES ($1, 'CHANNEL', $2, $3, $4, $5) RETURNING id`,
      [auth.companyId, input.name, input.description || null, input.visibility, auth.userId]
    );
    const conversationId = created.rows[0]!.id;
    await client.query("INSERT INTO chat_members (conversation_id, user_id, role) VALUES ($1, $2, 'ADMIN')", [conversationId, auth.userId]);
    if (extra.length) await client.query("INSERT INTO chat_members (conversation_id, user_id) SELECT $1, unnest($2::uuid[])", [conversationId, [...new Set(extra)]]);
    return conversationId;
  }));
  await audit(req, auth, "CHAT_CHANNEL_CREATED", id, { visibility: input.visibility, memberCount: new Set(extra).size + 1 });
  emitToUsers(extra, "chat:membership", { conversationId: id, added: true });
  res.status(201).json({ data: await summaryFor(auth, id) });
}));

async function managedChannel(req: Request, auth: AuthContext, action: string): Promise<Conversation> {
  const conversation = await loadConversation(auth, idSchema.parse(req.params.id), "see");
  if (conversation.kind !== "CHANNEL") throw new ApiError(400, "CHAT_NOT_A_CHANNEL", "This action applies to channels only");
  if (!conversation.canManage) await deny(req, auth, action, conversation.id);
  return conversation;
}

chatRouter.patch("/channels/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const conversation = await managedChannel(req, auth, "CHAT_CHANNEL_UPDATED");
  const input = channelPatchSchema.parse(req.body);
  assertActive(conversation);
  if (conversation.is_default && (input.name !== undefined || input.visibility !== undefined)) assertNotDefault(conversation);
  await withChannelName(() => query(
    `UPDATE chat_conversations SET name = coalesce($2, name),
       description = CASE WHEN $5 THEN $3 ELSE description END, visibility = coalesce($4, visibility)
     WHERE id = $1`,
    [conversation.id, input.name ?? null, input.description || null, input.visibility ?? null, input.description !== undefined]
  ));
  await audit(req, auth, "CHAT_CHANNEL_UPDATED", conversation.id, { fields: Object.keys(input) });
  await notifyConversationChanged(conversation.id);
  res.json({ data: { id: conversation.id } });
}));

for (const [path, archive] of [["archive", true], ["unarchive", false]] as const) {
  chatRouter.post(`/channels/:id/${path}`, asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const conversation = await managedChannel(req, auth, "CHAT_CHANNEL_ARCHIVED");
    assertNotDefault(conversation);
    await withChannelName(() => query(`UPDATE chat_conversations SET archived_at = ${archive ? "now()" : "NULL"} WHERE id = $1`, [conversation.id]));
    await audit(req, auth, archive ? "CHAT_CHANNEL_ARCHIVED" : "CHAT_CHANNEL_UNARCHIVED", conversation.id);
    await notifyConversationChanged(conversation.id);
    res.json({ data: { id: conversation.id, archived: archive } });
  }));
}

chatRouter.post("/conversations/:id/join", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const conversation = await loadConversation(auth, idSchema.parse(req.params.id));
  if (conversation.kind !== "CHANNEL" || conversation.visibility !== "PUBLIC") throw new ApiError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  assertActive(conversation);
  if (!conversation.isMember) {
    await query("INSERT INTO chat_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [conversation.id, auth.userId]);
    await audit(req, auth, "CHAT_MEMBER_ADDED", conversation.id, { userIds: [auth.userId], joined: true });
    await notifyConversationChanged(conversation.id);
  }
  res.json({ data: await summaryFor(auth, conversation.id) });
}));

chatRouter.get("/conversations/:id/members", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const conversation = await loadConversation(auth, idSchema.parse(req.params.id), "see");
  const members = await query(
    `SELECT u.id, u.full_name AS "fullName", u.username, u.job_title AS "jobTitle", d.name AS "departmentName",
            m.role, m.joined_at AS "joinedAt", u.status = 'ACTIVE' AS active
     FROM chat_members m JOIN users u ON u.id = m.user_id LEFT JOIN departments d ON d.id = u.department_id
     WHERE m.conversation_id = $1 ORDER BY m.role, u.full_name`,
    [conversation.id]
  );
  res.json({ data: members.rows });
}));

chatRouter.post("/conversations/:id/members", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const conversation = await loadConversation(auth, idSchema.parse(req.params.id), "see");
  const { userIds } = z.object({ userIds: z.array(z.string().uuid()).min(1).max(500) }).parse(req.body);
  if (conversation.kind === "DM") throw new ApiError(400, "CHAT_CANNOT_ADD_TO_DM", "Start a group to talk with more people");
  if (conversation.kind === "CHANNEL") {
    if (!conversation.canManage) await deny(req, auth, "CHAT_MEMBER_ADDED", conversation.id);
    assertNotDefault(conversation);
  } else if (!conversation.isMember) {
    throw new ApiError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  }
  assertActive(conversation);
  await assertCompanyUsers(auth, userIds);
  const added = await transaction(async (client) => {
    await client.query("SELECT id FROM chat_conversations WHERE id = $1 FOR UPDATE", [conversation.id]);
    const current = new Set(await memberIds(conversation.id, client));
    const fresh = [...new Set(userIds)].filter((id) => !current.has(id));
    if (conversation.kind === "GROUP" && current.size + fresh.length > GROUP_MAX_PARTICIPANTS) {
      throw new ApiError(400, "CHAT_MEMBER_LIMIT", `A group can have at most ${GROUP_MAX_PARTICIPANTS} participants`);
    }
    if (fresh.length) await client.query("INSERT INTO chat_members (conversation_id, user_id) SELECT $1, unnest($2::uuid[])", [conversation.id, fresh]);
    return fresh;
  });
  if (added.length && conversation.kind === "CHANNEL") await audit(req, auth, "CHAT_MEMBER_ADDED", conversation.id, { userIds: added });
  emitToUsers(added, "chat:membership", { conversationId: conversation.id, added: true });
  await notifyConversationChanged(conversation.id);
  res.json({ data: { added } });
}));

chatRouter.delete("/conversations/:id/members/:userId", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const conversation = await loadConversation(auth, idSchema.parse(req.params.id), "see");
  const userId = idSchema.parse(req.params.userId);
  const leaving = userId === auth.userId;
  if (conversation.kind === "DM") throw new ApiError(400, "CHAT_CANNOT_LEAVE_DM", "A direct conversation can't be left");
  if (conversation.kind === "GROUP" && !leaving) throw new ApiError(403, "CHAT_FORBIDDEN", "Participants can only leave a group themselves");
  if (conversation.kind === "CHANNEL") {
    if (!leaving && !conversation.canManage) await deny(req, auth, "CHAT_MEMBER_REMOVED", conversation.id);
    assertNotDefault(conversation);
  }
  await transaction(async (client) => {
    await client.query("SELECT id FROM chat_conversations WHERE id = $1 FOR UPDATE", [conversation.id]);
    const target = await client.query<{ role: string }>("SELECT role FROM chat_members WHERE conversation_id = $1 AND user_id = $2", [conversation.id, userId]);
    if (!target.rows[0]) throw new ApiError(404, "CHAT_MEMBER_NOT_FOUND", "Not a member of this conversation");
    if (conversation.kind === "CHANNEL" && target.rows[0].role === "ADMIN") await assertAnotherAdmin(client, conversation.id);
    await client.query("DELETE FROM chat_members WHERE conversation_id = $1 AND user_id = $2", [conversation.id, userId]);
    await client.query(
      "UPDATE chat_mentions SET read_at = now() WHERE user_id = $2 AND read_at IS NULL AND message_id IN (SELECT id FROM chat_messages WHERE conversation_id = $1)",
      [conversation.id, userId]
    );
  });
  if (conversation.kind === "CHANNEL") await audit(req, auth, "CHAT_MEMBER_REMOVED", conversation.id, { userIds: [userId], left: leaving });
  emitToUsers([userId], "chat:membership", { conversationId: conversation.id, removed: true });
  await notifyConversationChanged(conversation.id);
  res.status(204).end();
}));

async function assertAnotherAdmin(client: PoolClient, conversationId: string): Promise<void> {
  const admins = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM chat_members WHERE conversation_id = $1 AND role = 'ADMIN'", [conversationId]);
  if ((admins.rows[0]?.count ?? 0) <= 1) throw new ApiError(400, "CHAT_LAST_ADMIN", "Appoint another admin first");
}

chatRouter.patch("/conversations/:id/members/:userId", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const conversation = await managedChannel(req, auth, "CHAT_ADMIN_CHANGED");
  assertNotDefault(conversation);
  const userId = idSchema.parse(req.params.userId);
  const { role } = z.object({ role: z.enum(["ADMIN", "MEMBER"]) }).parse(req.body);
  await transaction(async (client) => {
    await client.query("SELECT id FROM chat_conversations WHERE id = $1 FOR UPDATE", [conversation.id]);
    const target = await client.query<{ role: string }>("SELECT role FROM chat_members WHERE conversation_id = $1 AND user_id = $2", [conversation.id, userId]);
    if (!target.rows[0]) throw new ApiError(404, "CHAT_MEMBER_NOT_FOUND", "Not a member of this conversation");
    if (target.rows[0].role === "ADMIN" && role === "MEMBER") await assertAnotherAdmin(client, conversation.id);
    await client.query("UPDATE chat_members SET role = $3 WHERE conversation_id = $1 AND user_id = $2", [conversation.id, userId, role]);
  });
  await audit(req, auth, "CHAT_ADMIN_CHANGED", conversation.id, { userId, role });
  await notifyConversationChanged(conversation.id);
  res.json({ data: { userId, role } });
}));

chatRouter.patch("/conversations/:id/mute", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const conversation = await loadConversation(auth, idSchema.parse(req.params.id));
  const { muted } = z.object({ muted: z.boolean() }).parse(req.body);
  if (!conversation.isMember) throw new ApiError(409, "CHAT_JOIN_REQUIRED", "Join the channel first");
  await query("UPDATE chat_members SET muted = $3 WHERE conversation_id = $1 AND user_id = $2", [conversation.id, auth.userId, muted]);
  emitToUsers([auth.userId], "chat:read", { conversationId: conversation.id });
  res.json({ data: { muted } });
}));

chatRouter.post("/conversations/:id/read", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const conversation = await loadConversation(auth, idSchema.parse(req.params.id));
  if (conversation.isMember) {
    await query("UPDATE chat_members SET last_read_at = greatest(last_read_at, now()) WHERE conversation_id = $1 AND user_id = $2", [conversation.id, auth.userId]);
  }
  await query(
    "UPDATE chat_mentions SET read_at = now() WHERE user_id = $2 AND read_at IS NULL AND message_id IN (SELECT id FROM chat_messages WHERE conversation_id = $1)",
    [conversation.id, auth.userId]
  );
  emitToUsers([auth.userId], "chat:read", { conversationId: conversation.id });
  res.status(204).end();
}));

chatRouter.get("/conversations/:id/messages", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const conversation = await loadConversation(auth, idSchema.parse(req.params.id));
  const page = z.object({ before: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX) }).parse(req.query);
  const values: unknown[] = [conversation.id, page.limit + 1];
  let cursor = "";
  if (page.before) {
    values.push(page.before);
    cursor = `AND (x.created_at, x.id) < (SELECT b.created_at, b.id FROM chat_messages b WHERE b.id = $3 AND b.conversation_id = $1)`;
  }
  const result = await query(
    `SELECT ${messageColumns} FROM chat_messages x JOIN users u ON u.id = x.author_id
     WHERE x.conversation_id = $1 AND x.parent_id IS NULL ${cursor}
     ORDER BY x.created_at DESC, x.id DESC LIMIT $2`,
    values
  );
  const rows = result.rows.slice(0, page.limit);
  res.json({ data: rows, meta: { hasMore: result.rows.length > page.limit } });
}));

async function messageContext(auth: AuthContext, id: string): Promise<{ message: { id: string; conversation_id: string; author_id: string; parent_id: string | null; deleted_at: Date | null }; conversation: Conversation }> {
  const result = await query<{ id: string; conversation_id: string; author_id: string; parent_id: string | null; deleted_at: Date | null }>(
    "SELECT id, conversation_id, author_id, parent_id, deleted_at FROM chat_messages WHERE id = $1",
    [id]
  );
  const message = result.rows[0];
  if (!message) throw new ApiError(404, "MESSAGE_NOT_FOUND", "Message not found");
  const conversation = await loadConversation(auth, message.conversation_id).catch(() => {
    throw new ApiError(404, "MESSAGE_NOT_FOUND", "Message not found");
  });
  return { message, conversation };
}

chatRouter.get("/messages/:id/replies", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const { message } = await messageContext(auth, idSchema.parse(req.params.id));
  const rootId = message.parent_id ?? message.id;
  const replies = await query(
    `SELECT ${messageColumns} FROM chat_messages x JOIN users u ON u.id = x.author_id
     WHERE x.parent_id = $1 ORDER BY x.created_at, x.id LIMIT 500`,
    [rootId]
  );
  res.json({ data: { root: await messageById(rootId), replies: replies.rows } });
}));

/** Users to notify for a message: named members (or any company user in a public channel), or everyone for `@channel`. */
async function resolveMentions(auth: AuthContext, conversation: Conversation, body: string, db: Pick<PoolClient, "query">): Promise<string[]> {
  const { usernames, channel } = parseMentions(body);
  const everyone = channel && canUseChannelMention(auth, conversation);
  if (!usernames.length && !everyone) return [];
  const publicChannel = conversation.kind === "CHANNEL" && conversation.visibility === "PUBLIC";
  const result = await db.query<{ id: string }>(
    `SELECT u.id FROM users u
     WHERE u.company_id = $1 AND u.status = 'ACTIVE' AND u.id <> $2
       AND (($5 AND EXISTS (SELECT 1 FROM chat_members m WHERE m.conversation_id = $3 AND m.user_id = u.id))
            OR (lower(u.username) = ANY($4::text[]) AND ($6 OR EXISTS (SELECT 1 FROM chat_members m WHERE m.conversation_id = $3 AND m.user_id = u.id))))`,
    [auth.companyId, auth.userId, conversation.id, usernames, everyone, publicChannel]
  );
  return result.rows.map((row) => row.id);
}

chatRouter.post("/conversations/:id/messages", chatPostLimiter, asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const conversation = await loadConversation(auth, idSchema.parse(req.params.id));
  const input = messageSchema.parse(req.body);
  assertActive(conversation);
  if (!conversation.isMember) throw new ApiError(409, "CHAT_JOIN_REQUIRED", "Join the channel to post");
  if (conversation.kind === "DM") {
    const inactive = await query(
      "SELECT 1 FROM chat_members m JOIN users u ON u.id = m.user_id WHERE m.conversation_id = $1 AND u.status <> 'ACTIVE'",
      [conversation.id]
    );
    if (inactive.rowCount) throw new ApiError(409, "CONVERSATION_ARCHIVED", "This colleague is no longer active");
  }
  const { id, mentioned } = await transaction(async (client) => {
    if (input.parentId) {
      const parent = await client.query<{ parent_id: string | null }>(
        "SELECT parent_id FROM chat_messages WHERE id = $1 AND conversation_id = $2 FOR UPDATE",
        [input.parentId, conversation.id]
      );
      if (!parent.rows[0] || parent.rows[0].parent_id) throw new ApiError(400, "CHAT_INVALID_PARENT", "Reply to a top-level message of this conversation");
    }
    const inserted = await client.query<{ id: string; created_at: Date }>(
      "INSERT INTO chat_messages (conversation_id, author_id, parent_id, body) VALUES ($1, $2, $3, $4) RETURNING id, created_at",
      [conversation.id, auth.userId, input.parentId ?? null, input.body]
    );
    const message = inserted.rows[0]!;
    if (input.parentId) {
      await client.query("UPDATE chat_messages SET reply_count = reply_count + 1, last_reply_at = $2 WHERE id = $1", [input.parentId, message.created_at]);
    }
    await client.query("UPDATE chat_conversations SET last_message_at = $2 WHERE id = $1", [conversation.id, message.created_at]);
    await client.query("UPDATE chat_members SET last_read_at = greatest(last_read_at, $3) WHERE conversation_id = $1 AND user_id = $2", [conversation.id, auth.userId, message.created_at]);
    const mentionedIds = await resolveMentions(auth, conversation, input.body, client);
    if (mentionedIds.length) await client.query("INSERT INTO chat_mentions (message_id, user_id) SELECT $1, unnest($2::uuid[])", [message.id, mentionedIds]);
    return { id: message.id, mentioned: mentionedIds };
  });
  const message = await messageById(id);
  const members = await memberIds(conversation.id);
  emitToUsers(members, "chat:message", { conversationId: conversation.id, message });
  const outsiders = mentioned.filter((user) => !members.includes(user));
  emitToUsers(outsiders, "chat:mention", { conversationId: conversation.id, messageId: id });
  res.status(201).json({ data: message });
}));

chatRouter.patch("/messages/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const { message, conversation } = await messageContext(auth, idSchema.parse(req.params.id));
  const { body } = z.object({ body: bodySchema }).parse(req.body);
  if (message.author_id !== auth.userId) throw new ApiError(403, "CHAT_FORBIDDEN", "Only the author can edit a message");
  if (message.deleted_at) throw new ApiError(409, "CHAT_MESSAGE_DELETED", "The message was deleted");
  assertActive(conversation);
  await transaction(async (client) => {
    await client.query("UPDATE chat_messages SET body = $2, edited_at = now() WHERE id = $1", [message.id, body]);
    const mentioned = await resolveMentions(auth, conversation, body, client);
    await client.query("DELETE FROM chat_mentions WHERE message_id = $1 AND NOT (user_id = ANY($2::uuid[]))", [message.id, mentioned]);
    if (mentioned.length) {
      await client.query("INSERT INTO chat_mentions (message_id, user_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING", [message.id, mentioned]);
    }
  });
  const updated = await messageById(message.id);
  emitToUsers(await memberIds(conversation.id), "chat:message-updated", { conversationId: conversation.id, message: updated });
  res.json({ data: updated });
}));

chatRouter.delete("/messages/:id", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const { message, conversation } = await messageContext(auth, idSchema.parse(req.params.id));
  const own = message.author_id === auth.userId;
  const moderator = conversation.kind === "CHANNEL" && conversation.isMember && (conversation.my_role === "ADMIN" || auth.role === "DIRECTOR");
  if (!own && !moderator) throw new ApiError(403, "CHAT_FORBIDDEN", "You can delete only your own messages");
  if (!message.deleted_at) {
    await transaction(async (client) => {
      await client.query("UPDATE chat_messages SET body = '', deleted_at = now() WHERE id = $1", [message.id]);
      await client.query("DELETE FROM chat_mentions WHERE message_id = $1", [message.id]);
    });
    if (!own) await audit(req, auth, "CHAT_MESSAGE_MODERATED", conversation.id, { messageId: message.id, authorId: message.author_id });
    emitToUsers(await memberIds(conversation.id), "chat:message-updated", { conversationId: conversation.id, message: await messageById(message.id) });
  }
  res.status(204).end();
}));

chatRouter.get("/mentions", asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const access = chatAccessSql(auth, "x.conversation_id", 2);
  const result = await query(
    `SELECT ${messageColumns}, mm.read_at IS NULL AS unread,
            json_build_object('id', c.id, 'kind', c.kind, 'name', c.name) AS conversation
     FROM chat_mentions mm JOIN chat_messages x ON x.id = mm.message_id JOIN users u ON u.id = x.author_id
     JOIN chat_conversations c ON c.id = x.conversation_id
     WHERE mm.user_id = $1 AND x.deleted_at IS NULL AND ${access.sql}
     ORDER BY x.created_at DESC LIMIT 50`,
    [auth.userId, ...access.values]
  );
  res.json({ data: result.rows });
}));
