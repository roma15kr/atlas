import { apiRequest } from './api';
import type { Role, User } from '../types';

export type ChatKind = 'DM' | 'GROUP' | 'CHANNEL';
export type ChatVisibility = 'PUBLIC' | 'PRIVATE';
export type ChatRole = 'ADMIN' | 'MEMBER';

export interface ChatPerson { id: string; fullName: string; username: string; jobTitle?: string | null; departmentName?: string | null }
export interface ChatAuthor { id: string; fullName: string; username: string; active: boolean }
export interface ChatMessage {
  id: string;
  conversationId: string;
  parentId: string | null;
  body: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  author: ChatAuthor;
  mentionedUserIds: string[];
}
export interface ChatConversation {
  id: string;
  kind: ChatKind;
  name: string | null;
  description: string | null;
  visibility: ChatVisibility | null;
  isDefault: boolean;
  archivedAt: string | null;
  lastActivityAt?: string;
  myRole: ChatRole | null;
  muted: boolean;
  unread: number;
  mentions: number;
  memberCount: number;
  participants: ChatAuthor[] | null;
  lastMessage?: { id: string; body: string | null; authorId: string; authorName: string; createdAt: string } | null;
  canRead?: boolean;
  canManage?: boolean;
  isMember?: boolean;
}
export interface ChatChannel {
  id: string; name: string; description: string | null; visibility: ChatVisibility; isDefault: boolean; archivedAt: string | null;
  memberCount: number; myRole: ChatRole | null; canRead: boolean; canManage: boolean; isMember: boolean;
}
export interface ChatMember extends ChatPerson { role: ChatRole; active: boolean }
export interface ChatMention extends ChatMessage { unread: boolean; conversation: { id: string; kind: ChatKind; name: string | null } }
export interface ChannelInput { name: string; description?: string | null; visibility: ChatVisibility; memberIds?: string[] }

export interface ChatBackend {
  people(): Promise<ChatPerson[]>;
  conversations(): Promise<ChatConversation[]>;
  conversation(id: string): Promise<ChatConversation>;
  messages(id: string, before?: string): Promise<{ items: ChatMessage[]; hasMore: boolean }>;
  replies(messageId: string): Promise<{ root: ChatMessage; replies: ChatMessage[] }>;
  post(conversationId: string, body: string, parentId?: string | null): Promise<ChatMessage>;
  edit(messageId: string, body: string): Promise<ChatMessage>;
  remove(messageId: string): Promise<void>;
  direct(userId: string): Promise<ChatConversation>;
  group(userIds: string[], name?: string | null): Promise<ChatConversation>;
  renameGroup(id: string, name: string | null): Promise<void>;
  channels(archived?: boolean): Promise<ChatChannel[]>;
  createChannel(input: ChannelInput): Promise<ChatConversation>;
  updateChannel(id: string, patch: Partial<ChannelInput>): Promise<void>;
  archive(id: string, archived: boolean): Promise<void>;
  join(id: string): Promise<ChatConversation>;
  members(id: string): Promise<ChatMember[]>;
  addMembers(id: string, userIds: string[]): Promise<void>;
  removeMember(id: string, userId: string): Promise<void>;
  setRole(id: string, userId: string, role: ChatRole): Promise<void>;
  read(id: string): Promise<void>;
  mute(id: string, muted: boolean): Promise<void>;
  mentions(): Promise<ChatMention[]>;
}

export const remoteChat: ChatBackend = {
  people: () => apiRequest('/chat/people'),
  conversations: () => apiRequest('/chat/conversations'),
  conversation: (id) => apiRequest(`/chat/conversations/${id}`),
  messages: async (id, before) => {
    const page = await apiRequest<{ data: ChatMessage[]; meta: { hasMore: boolean } }>(`/chat/conversations/${id}/messages${before ? `?before=${before}` : ''}`, { envelope: true });
    return { items: page.data, hasMore: page.meta.hasMore };
  },
  replies: (messageId) => apiRequest(`/chat/messages/${messageId}/replies`),
  post: (conversationId, body, parentId) => apiRequest(`/chat/conversations/${conversationId}/messages`, { method: 'POST', body: { body, parentId: parentId ?? null } }),
  edit: (messageId, body) => apiRequest(`/chat/messages/${messageId}`, { method: 'PATCH', body: { body } }),
  remove: (messageId) => apiRequest(`/chat/messages/${messageId}`, { method: 'DELETE' }),
  direct: (userId) => apiRequest('/chat/direct', { method: 'POST', body: { userId } }),
  group: (userIds, name) => apiRequest('/chat/groups', { method: 'POST', body: { userIds, name: name || null } }),
  renameGroup: (id, name) => apiRequest(`/chat/groups/${id}`, { method: 'PATCH', body: { name } }),
  channels: (archived) => apiRequest(`/chat/channels${archived ? '?archived=true' : ''}`),
  createChannel: (input) => apiRequest('/chat/channels', { method: 'POST', body: input }),
  updateChannel: (id, patch) => apiRequest(`/chat/channels/${id}`, { method: 'PATCH', body: patch }),
  archive: (id, archived) => apiRequest(`/chat/channels/${id}/${archived ? 'archive' : 'unarchive'}`, { method: 'POST' }),
  join: (id) => apiRequest(`/chat/conversations/${id}/join`, { method: 'POST' }),
  members: (id) => apiRequest(`/chat/conversations/${id}/members`),
  addMembers: (id, userIds) => apiRequest(`/chat/conversations/${id}/members`, { method: 'POST', body: { userIds } }),
  removeMember: (id, userId) => apiRequest(`/chat/conversations/${id}/members/${userId}`, { method: 'DELETE' }),
  setRole: (id, userId, role) => apiRequest(`/chat/conversations/${id}/members/${userId}`, { method: 'PATCH', body: { role } }),
  read: (id) => apiRequest(`/chat/conversations/${id}/read`, { method: 'POST' }),
  mute: (id, muted) => apiRequest(`/chat/conversations/${id}/mute`, { method: 'PATCH', body: { muted } }),
  mentions: () => apiRequest('/chat/mentions'),
};

/** Title shown for a conversation: the channel or group name, otherwise the other participants. */
export function conversationTitle(conversation: Pick<ChatConversation, 'kind' | 'name' | 'participants'>, myId: string): string {
  if (conversation.kind === 'CHANNEL') return conversation.name ?? 'Канал';
  if (conversation.name) return conversation.name;
  const others = (conversation.participants ?? []).filter((person) => person.id !== myId);
  if (!others.length) return 'Только вы';
  return others.map((person) => conversation.kind === 'GROUP' ? person.fullName.split(' ')[0] : person.fullName).join(', ');
}

export type MessagePart = { type: 'text'; value: string } | { type: 'mention'; username: string } | { type: 'link'; href: string };

/** Splits message text into plain text, `@username` mentions and http(s) links; never produces HTML. */
export function messageParts(body: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const pattern = /(https?:\/\/[^\s<>"]+)|(^|[^\p{L}\p{N}._@-])@([a-z0-9._-]{2,50})/giu;
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (match[1]) {
      const href = match[1].replace(/[.,;:!?)]+$/, '');
      if (start > last) parts.push({ type: 'text', value: body.slice(last, start) });
      parts.push({ type: 'link', href });
      last = start + href.length;
    } else {
      const lead = match[2] ?? '';
      const username = match[3]!.replace(/[.-]+$/, '');
      const mentionStart = start + lead.length;
      if (mentionStart > last) parts.push({ type: 'text', value: body.slice(last, mentionStart) });
      parts.push({ type: 'mention', username: username.toLowerCase() });
      last = mentionStart + 1 + username.length;
    }
  }
  if (last < body.length) parts.push({ type: 'text', value: body.slice(last) });
  return parts;
}

/** The `@query` being typed just before the caret, if any. */
export function mentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const match = /(^|[^\p{L}\p{N}._@-])@([\p{L}\p{N}._-]{0,50})$/iu.exec(text.slice(0, caret));
  if (!match) return null;
  return { query: match[2]!.toLowerCase(), start: caret - match[2]!.length - 1 };
}

export const canCreateChannels = (role: Role): boolean => role === 'DIRECTOR' || role === 'MANAGER';

// ---------------------------------------------------------------------------
// Demo backend: an in-memory copy of the server rules, so demo mode and tests work offline.

interface DemoConversation { id: string; kind: ChatKind; name: string | null; description: string | null; visibility: ChatVisibility | null; isDefault: boolean; archivedAt: string | null; createdAt: string }
interface DemoMember { conversationId: string; userId: string; role: ChatRole; lastReadAt: string; muted: boolean }
interface DemoMessage { id: string; conversationId: string; authorId: string; parentId: string | null; body: string; createdAt: string; editedAt: string | null; deletedAt: string | null }
interface DemoMentionRow { messageId: string; userId: string; readAt: string | null }

export class ChatError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export function createDemoChat(users: User[], me: User): ChatBackend {
  const store = demoStore(users);
  const person = (id: string): ChatAuthor => {
    const user = users.find((item) => item.id === id);
    return { id, fullName: user?.fullName ?? 'Сотрудник', username: user?.username ?? 'user', active: Boolean(user) };
  };
  const memberRow = (conversationId: string, userId = me.id) => store.members.find((item) => item.conversationId === conversationId && item.userId === userId);
  const permissions = (conversation: DemoConversation) => {
    const mine = memberRow(conversation.id);
    const isMember = Boolean(mine);
    const isChannel = conversation.kind === 'CHANNEL';
    const canRead = isMember || (isChannel && conversation.visibility === 'PUBLIC');
    const canManage = isChannel && (mine?.role === 'ADMIN' || me.role === 'DIRECTOR');
    return { isMember, canRead, canManage, canSee: canRead || canManage, myRole: mine?.role ?? null };
  };
  const find = (id: string, need: 'see' | 'read' = 'read') => {
    const conversation = store.conversations.find((item) => item.id === id);
    if (!conversation) throw new ChatError('CONVERSATION_NOT_FOUND', 'Разговор недоступен');
    const access = permissions(conversation);
    if (!(need === 'see' ? access.canSee : access.canRead)) throw new ChatError('CONVERSATION_NOT_FOUND', 'Разговор недоступен');
    return { conversation, ...access };
  };
  const toMessage = (message: DemoMessage): ChatMessage => {
    const replies = store.messages.filter((item) => item.parentId === message.id);
    return {
      id: message.id, conversationId: message.conversationId, parentId: message.parentId, body: message.deletedAt ? null : message.body,
      replyCount: replies.length, lastReplyAt: replies.at(-1)?.createdAt ?? null, editedAt: message.editedAt, deletedAt: message.deletedAt,
      createdAt: message.createdAt, author: person(message.authorId),
      mentionedUserIds: store.mentions.filter((item) => item.messageId === message.id).map((item) => item.userId),
    };
  };
  const summary = (conversation: DemoConversation): ChatConversation => {
    const mine = memberRow(conversation.id);
    const messages = store.messages.filter((item) => item.conversationId === conversation.id);
    const last = messages.at(-1);
    const members = store.members.filter((item) => item.conversationId === conversation.id);
    const access = permissions(conversation);
    return {
      id: conversation.id, kind: conversation.kind, name: conversation.name, description: conversation.description, visibility: conversation.visibility,
      isDefault: conversation.isDefault, archivedAt: conversation.archivedAt, lastActivityAt: last?.createdAt ?? conversation.createdAt,
      myRole: mine?.role ?? null, muted: mine?.muted ?? false,
      unread: mine ? messages.filter((item) => item.createdAt > mine.lastReadAt && item.authorId !== me.id && !item.deletedAt).length : 0,
      mentions: store.mentions.filter((item) => item.userId === me.id && !item.readAt && messages.some((message) => message.id === item.messageId && !message.deletedAt)).length,
      memberCount: members.length,
      participants: conversation.kind === 'CHANNEL' ? null : members.map((item) => person(item.userId)).sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru')),
      lastMessage: last ? { id: last.id, body: last.deletedAt ? null : last.body.slice(0, 140), authorId: last.authorId, authorName: person(last.authorId).fullName, createdAt: last.createdAt } : null,
      canRead: access.canRead, canManage: access.canManage, isMember: access.isMember,
    };
  };
  const mentionIds = (conversation: DemoConversation, body: string, myRole: ChatRole | null) => {
    const { usernames, channel } = parseDemoMentions(body);
    const everyone = channel && conversation.kind === 'CHANNEL' && (myRole === 'ADMIN' || me.role !== 'EMPLOYEE');
    const isPublic = conversation.kind === 'CHANNEL' && conversation.visibility === 'PUBLIC';
    return users.filter((user) => user.id !== me.id && (
      (everyone && memberRow(conversation.id, user.id)) || (usernames.includes(user.username) && (isPublic || memberRow(conversation.id, user.id)))
    )).map((user) => user.id);
  };
  const assertNotDefault = (conversation: DemoConversation) => { if (conversation.isDefault) throw new ChatError('CHAT_DEFAULT_CHANNEL', 'Общий канал всегда включает всех'); };
  const assertActive = (conversation: DemoConversation) => { if (conversation.archivedAt) throw new ChatError('CONVERSATION_ARCHIVED', 'Разговор в архиве'); };
  const nameTaken = (name: string, exceptId?: string) => store.conversations.some((item) => item.kind === 'CHANNEL' && !item.archivedAt && item.id !== exceptId && item.name?.toLowerCase() === name.toLowerCase());
  const admins = (id: string) => store.members.filter((item) => item.conversationId === id && item.role === 'ADMIN').length;
  const now = () => new Date().toISOString();
  const resolve = <T,>(value: T) => Promise.resolve(structuredClone(value));

  return {
    people: () => resolve(users.map((user) => ({ id: user.id, fullName: user.fullName, username: user.username, jobTitle: user.jobTitle, departmentName: user.department }))),
    conversations: () => resolve(store.conversations.filter((item) => memberRow(item.id) && !item.archivedAt).map(summary)
      .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''))),
    conversation: async (id) => summary(find(id, 'see').conversation),
    messages: async (id, before) => {
      find(id);
      const all = store.messages.filter((item) => item.conversationId === id && !item.parentId).reverse();
      const start = before ? all.findIndex((item) => item.id === before) + 1 : 0;
      const items = all.slice(start, start + 50).map(toMessage);
      return { items, hasMore: all.length > start + 50 };
    },
    replies: async (messageId) => {
      const root = store.messages.find((item) => item.id === messageId);
      if (!root) throw new ChatError('MESSAGE_NOT_FOUND', 'Сообщение не найдено');
      find(root.conversationId);
      return { root: toMessage(root), replies: store.messages.filter((item) => item.parentId === root.id).map(toMessage) };
    },
    post: async (conversationId, body, parentId) => {
      const { conversation, isMember, myRole } = find(conversationId);
      assertActive(conversation);
      if (!isMember) throw new ChatError('CHAT_JOIN_REQUIRED', 'Вступите в канал, чтобы писать');
      if (parentId) {
        const parent = store.messages.find((item) => item.id === parentId && item.conversationId === conversationId);
        if (!parent || parent.parentId) throw new ChatError('CHAT_INVALID_PARENT', 'Ответить можно только на сообщение этого разговора');
      }
      const message: DemoMessage = { id: crypto.randomUUID(), conversationId, authorId: me.id, parentId: parentId ?? null, body: body.trim(), createdAt: now(), editedAt: null, deletedAt: null };
      store.messages.push(message);
      memberRow(conversationId)!.lastReadAt = message.createdAt;
      mentionIds(conversation, message.body, myRole).forEach((userId) => store.mentions.push({ messageId: message.id, userId, readAt: null }));
      return toMessage(message);
    },
    edit: async (messageId, body) => {
      const message = store.messages.find((item) => item.id === messageId);
      if (!message) throw new ChatError('MESSAGE_NOT_FOUND', 'Сообщение не найдено');
      const { conversation, myRole } = find(message.conversationId);
      if (message.authorId !== me.id) throw new ChatError('CHAT_FORBIDDEN', 'Изменить можно только своё сообщение');
      message.body = body.trim(); message.editedAt = now();
      const ids = mentionIds(conversation, message.body, myRole);
      store.mentions = store.mentions.filter((item) => item.messageId !== messageId || ids.includes(item.userId));
      ids.filter((id) => !store.mentions.some((item) => item.messageId === messageId && item.userId === id)).forEach((userId) => store.mentions.push({ messageId, userId, readAt: null }));
      return toMessage(message);
    },
    remove: async (messageId) => {
      const message = store.messages.find((item) => item.id === messageId);
      if (!message) throw new ChatError('MESSAGE_NOT_FOUND', 'Сообщение не найдено');
      const { conversation, isMember, myRole } = find(message.conversationId);
      const moderator = conversation.kind === 'CHANNEL' && isMember && (myRole === 'ADMIN' || me.role === 'DIRECTOR');
      if (message.authorId !== me.id && !moderator) throw new ChatError('CHAT_FORBIDDEN', 'Удалить можно только своё сообщение');
      message.deletedAt = now(); message.body = '';
      store.mentions = store.mentions.filter((item) => item.messageId !== messageId);
    },
    direct: async (userId) => {
      const existing = store.conversations.find((item) => item.kind === 'DM' && memberRow(item.id) && memberRow(item.id, userId));
      if (existing) return summary(existing);
      const conversation: DemoConversation = { id: crypto.randomUUID(), kind: 'DM', name: null, description: null, visibility: null, isDefault: false, archivedAt: null, createdAt: now() };
      store.conversations.push(conversation);
      for (const id of [me.id, userId]) store.members.push({ conversationId: conversation.id, userId: id, role: 'MEMBER', lastReadAt: now(), muted: false });
      return summary(conversation);
    },
    group: async (userIds, name) => {
      const participants = [...new Set([me.id, ...userIds])];
      if (participants.length < 3) throw new ChatError('CHAT_GROUP_TOO_SMALL', 'В группе должно быть минимум три человека');
      if (participants.length > 20) throw new ChatError('CHAT_MEMBER_LIMIT', 'В группе может быть не больше 20 человек');
      const conversation: DemoConversation = { id: crypto.randomUUID(), kind: 'GROUP', name: name || null, description: null, visibility: null, isDefault: false, archivedAt: null, createdAt: now() };
      store.conversations.push(conversation);
      participants.forEach((userId) => store.members.push({ conversationId: conversation.id, userId, role: 'MEMBER', lastReadAt: now(), muted: false }));
      return summary(conversation);
    },
    renameGroup: async (id, name) => { find(id).conversation.name = name || null; },
    channels: (archived) => resolve(store.conversations.filter((item) => item.kind === 'CHANNEL' && (archived || !item.archivedAt) && (item.visibility === 'PUBLIC' || memberRow(item.id) || me.role === 'DIRECTOR'))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (a.name ?? '').localeCompare(b.name ?? '', 'ru'))
      .map((item) => {
        const access = permissions(item);
        return { id: item.id, name: item.name ?? '', description: item.description, visibility: item.visibility!, isDefault: item.isDefault, archivedAt: item.archivedAt,
          memberCount: store.members.filter((member) => member.conversationId === item.id).length, myRole: access.myRole, canRead: access.canRead, canManage: access.canManage, isMember: access.isMember };
      })),
    createChannel: async (input) => {
      if (!canCreateChannels(me.role)) throw new ChatError('CHAT_FORBIDDEN', 'Каналы создают директор и руководители отделов');
      if (nameTaken(input.name.trim())) throw new ChatError('CHANNEL_NAME_TAKEN', 'Канал с таким названием уже есть');
      const conversation: DemoConversation = { id: crypto.randomUUID(), kind: 'CHANNEL', name: input.name.trim(), description: input.description || null, visibility: input.visibility, isDefault: false, archivedAt: null, createdAt: now() };
      store.conversations.push(conversation);
      store.members.push({ conversationId: conversation.id, userId: me.id, role: 'ADMIN', lastReadAt: now(), muted: false });
      [...new Set(input.memberIds ?? [])].filter((id) => id !== me.id).forEach((userId) => store.members.push({ conversationId: conversation.id, userId, role: 'MEMBER', lastReadAt: now(), muted: false }));
      return summary(conversation);
    },
    updateChannel: async (id, patch) => {
      const { conversation, canManage } = find(id, 'see');
      if (!canManage) throw new ChatError('CHAT_FORBIDDEN', 'Менять канал могут его администраторы и директор');
      if (conversation.isDefault && (patch.name !== undefined || patch.visibility !== undefined)) assertNotDefault(conversation);
      if (patch.name && nameTaken(patch.name.trim(), id)) throw new ChatError('CHANNEL_NAME_TAKEN', 'Канал с таким названием уже есть');
      if (patch.name) conversation.name = patch.name.trim();
      if (patch.description !== undefined) conversation.description = patch.description || null;
      if (patch.visibility) conversation.visibility = patch.visibility;
    },
    archive: async (id, archived) => {
      const { conversation, canManage } = find(id, 'see');
      if (!canManage) throw new ChatError('CHAT_FORBIDDEN', 'Архивировать канал могут его администраторы и директор');
      assertNotDefault(conversation);
      conversation.archivedAt = archived ? now() : null;
    },
    join: async (id) => {
      const { conversation, isMember } = find(id);
      assertActive(conversation);
      if (!isMember) store.members.push({ conversationId: id, userId: me.id, role: 'MEMBER', lastReadAt: now(), muted: false });
      return summary(conversation);
    },
    members: async (id) => {
      find(id, 'see');
      return store.members.filter((item) => item.conversationId === id).map((item) => {
        const user = users.find((candidate) => candidate.id === item.userId);
        return { id: item.userId, fullName: user?.fullName ?? '', username: user?.username ?? '', jobTitle: user?.jobTitle, departmentName: user?.department, role: item.role, active: Boolean(user) };
      }).sort((a, b) => a.role.localeCompare(b.role) || a.fullName.localeCompare(b.fullName, 'ru'));
    },
    addMembers: async (id, userIds) => {
      const { conversation, canManage, isMember } = find(id, 'see');
      if (conversation.kind === 'DM') throw new ChatError('CHAT_CANNOT_ADD_TO_DM', 'Создайте группу, чтобы добавить людей');
      if (conversation.kind === 'CHANNEL') { if (!canManage) throw new ChatError('CHAT_FORBIDDEN', 'Добавлять участников могут администраторы канала'); assertNotDefault(conversation); }
      else if (!isMember) throw new ChatError('CONVERSATION_NOT_FOUND', 'Разговор недоступен');
      const fresh = [...new Set(userIds)].filter((userId) => !memberRow(id, userId));
      if (conversation.kind === 'GROUP' && store.members.filter((item) => item.conversationId === id).length + fresh.length > 20) throw new ChatError('CHAT_MEMBER_LIMIT', 'В группе может быть не больше 20 человек');
      fresh.forEach((userId) => store.members.push({ conversationId: id, userId, role: 'MEMBER', lastReadAt: now(), muted: false }));
    },
    removeMember: async (id, userId) => {
      const { conversation, canManage } = find(id, 'see');
      const leaving = userId === me.id;
      if (conversation.kind === 'DM') throw new ChatError('CHAT_CANNOT_LEAVE_DM', 'Из личного разговора нельзя выйти');
      if (conversation.kind === 'GROUP' && !leaving) throw new ChatError('CHAT_FORBIDDEN', 'Из группы можно выйти только самому');
      if (conversation.kind === 'CHANNEL') { if (!leaving && !canManage) throw new ChatError('CHAT_FORBIDDEN', 'Удалять участников могут администраторы канала'); assertNotDefault(conversation); }
      const target = memberRow(id, userId);
      if (!target) throw new ChatError('CHAT_MEMBER_NOT_FOUND', 'Сотрудник уже не участник');
      if (conversation.kind === 'CHANNEL' && target.role === 'ADMIN' && admins(id) <= 1) throw new ChatError('CHAT_LAST_ADMIN', 'Сначала назначьте другого администратора');
      store.members = store.members.filter((item) => item !== target);
    },
    setRole: async (id, userId, role) => {
      const { conversation, canManage } = find(id, 'see');
      if (!canManage) throw new ChatError('CHAT_FORBIDDEN', 'Назначать администраторов могут администраторы канала');
      assertNotDefault(conversation);
      const target = memberRow(id, userId);
      if (!target) throw new ChatError('CHAT_MEMBER_NOT_FOUND', 'Сотрудник уже не участник');
      if (target.role === 'ADMIN' && role === 'MEMBER' && admins(id) <= 1) throw new ChatError('CHAT_LAST_ADMIN', 'Сначала назначьте другого администратора');
      target.role = role;
    },
    read: async (id) => {
      find(id);
      const mine = memberRow(id);
      if (mine) mine.lastReadAt = now();
      const ids = new Set(store.messages.filter((item) => item.conversationId === id).map((item) => item.id));
      store.mentions.forEach((item) => { if (item.userId === me.id && ids.has(item.messageId)) item.readAt ??= now(); });
    },
    mute: async (id, muted) => { const mine = memberRow(id); if (mine) mine.muted = muted; },
    mentions: () => resolve(store.mentions.filter((item) => item.userId === me.id).flatMap((item) => {
      const message = store.messages.find((candidate) => candidate.id === item.messageId);
      const conversation = message && store.conversations.find((candidate) => candidate.id === message.conversationId);
      if (!message || !conversation || message.deletedAt || !permissions(conversation).canRead) return [];
      return [{ ...toMessage(message), unread: !item.readAt, conversation: { id: conversation.id, kind: conversation.kind, name: conversation.name } }];
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
  };
}

function parseDemoMentions(body: string): { usernames: string[]; channel: boolean } {
  const usernames = messageParts(body).filter((part): part is { type: 'mention'; username: string } => part.type === 'mention').map((part) => part.username);
  return { usernames: usernames.filter((name) => name !== 'channel'), channel: usernames.includes('channel') };
}

/** One shared store per page load, keyed by the user list, so switching demo users keeps the conversation history. */
let sharedStore: { conversations: DemoConversation[]; members: DemoMember[]; messages: DemoMessage[]; mentions: DemoMentionRow[] } | null = null;

export function resetDemoChat(): void { sharedStore = null; }

function demoStore(users: User[]) {
  if (sharedStore) return sharedStore;
  const id = (name: string) => users.find((user) => user.username === name)?.id ?? name;
  const director = id('director'), manager = id('manager'), employee = id('employee'), alex = id('alex'), olga = id('olga');
  const conversations: DemoConversation[] = [
    { id: 'ch-general', kind: 'CHANNEL', name: 'Общий', description: 'Канал для всей команды', visibility: 'PUBLIC', isDefault: true, archivedAt: null, createdAt: minutesAgo(60 * 24 * 30) },
    { id: 'ch-sales', kind: 'CHANNEL', name: 'Продажи', description: 'Сделки, клиенты и планы отдела продаж', visibility: 'PRIVATE', isDefault: false, archivedAt: null, createdAt: minutesAgo(60 * 24 * 20) },
    { id: 'ch-ideas', kind: 'CHANNEL', name: 'Идеи', description: 'Предложения по улучшению работы', visibility: 'PUBLIC', isDefault: false, archivedAt: null, createdAt: minutesAgo(60 * 24 * 10) },
    { id: 'gr-demo', kind: 'GROUP', name: 'Демо для «Северного ветра»', description: null, visibility: null, isDefault: false, archivedAt: null, createdAt: minutesAgo(60 * 24 * 3) },
    { id: 'dm-director-employee', kind: 'DM', name: null, description: null, visibility: null, isDefault: false, archivedAt: null, createdAt: minutesAgo(60 * 24 * 7) },
  ];
  const old = minutesAgo(60 * 24 * 7);
  const members: DemoMember[] = [
    ...users.map((user) => ({ conversationId: 'ch-general', userId: user.id, role: (user.role === 'DIRECTOR' ? 'ADMIN' : 'MEMBER') as ChatRole, lastReadAt: old, muted: false })),
    { conversationId: 'ch-sales', userId: manager, role: 'ADMIN', lastReadAt: old, muted: false },
    { conversationId: 'ch-sales', userId: employee, role: 'MEMBER', lastReadAt: old, muted: false },
    { conversationId: 'ch-sales', userId: alex, role: 'MEMBER', lastReadAt: old, muted: false },
    { conversationId: 'ch-ideas', userId: director, role: 'ADMIN', lastReadAt: old, muted: false },
    { conversationId: 'ch-ideas', userId: olga, role: 'MEMBER', lastReadAt: old, muted: false },
    { conversationId: 'gr-demo', userId: employee, role: 'MEMBER', lastReadAt: old, muted: false },
    { conversationId: 'gr-demo', userId: alex, role: 'MEMBER', lastReadAt: old, muted: false },
    { conversationId: 'gr-demo', userId: manager, role: 'MEMBER', lastReadAt: old, muted: false },
    { conversationId: 'dm-director-employee', userId: director, role: 'MEMBER', lastReadAt: minutesAgo(1), muted: false },
    { conversationId: 'dm-director-employee', userId: employee, role: 'MEMBER', lastReadAt: old, muted: false },
  ];
  const messages: DemoMessage[] = [
    { id: 'm1', conversationId: 'ch-general', authorId: director, parentId: null, body: 'Коллеги, в пятницу в 16:00 общая встреча по итогам квартала.', createdAt: minutesAgo(60 * 48), editedAt: null, deletedAt: null },
    { id: 'm2', conversationId: 'ch-ideas', authorId: olga, parentId: null, body: 'Предлагаю завести шаблон коммерческого предложения: https://docs.example/template', createdAt: minutesAgo(60 * 26), editedAt: null, deletedAt: null },
    { id: 'm3', conversationId: 'ch-sales', authorId: manager, parentId: null, body: '@employee, пришли, пожалуйста, обновлённый прайс для партнёров.', createdAt: minutesAgo(180), editedAt: null, deletedAt: null },
    { id: 'm4', conversationId: 'ch-sales', authorId: employee, parentId: 'm3', body: 'Готовлю, будет к вечеру.', createdAt: minutesAgo(120), editedAt: null, deletedAt: null },
    { id: 'm5', conversationId: 'ch-sales', authorId: alex, parentId: null, body: 'Northstar подтвердили встречу на четверг.', createdAt: minutesAgo(90), editedAt: null, deletedAt: null },
    { id: 'm6', conversationId: 'gr-demo', authorId: alex, parentId: null, body: 'Сценарий демо готов, посмотрите до четверга.', createdAt: minutesAgo(60), editedAt: null, deletedAt: null },
    { id: 'm7', conversationId: 'dm-director-employee', authorId: director, parentId: null, body: 'Анна, как прошла встреча с клиентом?', createdAt: minutesAgo(30), editedAt: null, deletedAt: null },
  ];
  const mentions: DemoMentionRow[] = [{ messageId: 'm3', userId: employee, readAt: null }];
  sharedStore = { conversations, members, messages, mentions };
  return sharedStore;
}
