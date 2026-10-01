import { describe, expect, it } from 'vitest';
import { applyIncoming, chatTotals } from '../context/ChatContext';
import { conversationTitle, mentionQuery, messageParts, type ChatConversation, type ChatMention, type ChatMessage } from './chat';

const conversation = (patch: Partial<ChatConversation>): ChatConversation => ({
  id: 'c1', kind: 'CHANNEL', name: 'Продажи', description: null, visibility: 'PUBLIC', isDefault: false, archivedAt: null,
  myRole: 'MEMBER', muted: false, unread: 0, mentions: 0, memberCount: 3, participants: null, ...patch,
});
const message = (patch: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1', conversationId: 'c1', parentId: null, body: 'Привет', replyCount: 0, lastReplyAt: null, editedAt: null, deletedAt: null,
  createdAt: '2026-10-01T10:00:00Z', author: { id: 'u2', fullName: 'Михаил Волков', username: 'manager', active: true }, mentionedUserIds: [], ...patch,
});

describe('applyIncoming', () => {
  it('moves the conversation up and counts unread and mentions', () => {
    const list = [conversation({ id: 'c0' }), conversation({})];
    const next = applyIncoming(list, message({ mentionedUserIds: ['me'] }), 'me', null)!;
    expect(next[0]).toMatchObject({ id: 'c1', unread: 1, mentions: 1, lastMessage: { body: 'Привет', authorName: 'Михаил Волков' } });
  });
  it('does not count my own messages or the open conversation', () => {
    expect(applyIncoming([conversation({})], message({ author: { id: 'me', fullName: 'Я', username: 'me', active: true } }), 'me', null)![0]!.unread).toBe(0);
    expect(applyIncoming([conversation({})], message({}), 'me', 'c1')![0]!.unread).toBe(0);
  });
  it('asks for a refresh when the conversation is unknown', () => {
    expect(applyIncoming([], message({}), 'me', null)).toBeNull();
  });
});

describe('chatTotals', () => {
  it('keeps muted unread out of the badge but counts their mentions and outside mentions', () => {
    const outside = { unread: true, conversation: { id: 'public', kind: 'CHANNEL', name: 'Идеи' } } as ChatMention;
    const totals = chatTotals([conversation({ unread: 2 }), conversation({ id: 'c2', muted: true, unread: 5, mentions: 1 })], [outside]);
    expect(totals).toEqual({ unread: 2, mentions: 2, badge: 4 });
  });
});

describe('message text', () => {
  it('splits mentions and links without treating emails as mentions', () => {
    expect(messageParts('@petrova см. https://example.com/a. Пиши на a@b.com')).toEqual([
      { type: 'mention', username: 'petrova' }, { type: 'text', value: ' см. ' }, { type: 'link', href: 'https://example.com/a' }, { type: 'text', value: '. Пиши на a@b.com' },
    ]);
  });
  it('finds the mention being typed, by username or name', () => {
    expect(mentionQuery('Привет @мих', 11)).toEqual({ query: 'мих', start: 7 });
    expect(mentionQuery('a@b', 3)).toBeNull();
  });
  it('titles DMs and groups by the other people', () => {
    const people = [{ id: 'me', fullName: 'Анна Петрова', username: 'employee', active: true }, { id: 'u2', fullName: 'Михаил Волков', username: 'manager', active: true }];
    expect(conversationTitle({ kind: 'DM', name: null, participants: people }, 'me')).toBe('Михаил Волков');
    expect(conversationTitle({ kind: 'GROUP', name: null, participants: [...people, { id: 'u4', fullName: 'Алексей Ким', username: 'alex', active: true }] }, 'me')).toBe('Михаил, Алексей');
  });
});
