import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createDemoChat, remoteChat, type ChatBackend, type ChatConversation, type ChatMention, type ChatMessage, type ChatPerson } from '../lib/chat';
import { demoUsers } from '../data/demo';
import { useAuth } from './AppContext';

export type ChatEvent =
  | { type: 'message'; conversationId: string; message: ChatMessage }
  | { type: 'message-updated'; conversationId: string; message: ChatMessage }
  | { type: 'changed'; conversationId?: string }
  | { type: 'reconnect' };

export interface ChatTotals { unread: number; mentions: number; badge: number }

interface ChatValue {
  backend: ChatBackend;
  people: ChatPerson[];
  conversations: ChatConversation[];
  mentions: ChatMention[];
  totals: ChatTotals;
  loaded: boolean;
  refresh: () => Promise<void>;
  /** The conversation on screen: its new messages don't count as unread. */
  setActive: (id: string | null) => void;
  subscribe: (listener: (event: ChatEvent) => void) => () => void;
  /** Tells open views that something changed locally (edits and deletions made in dialogs). */
  notify: (event: ChatEvent) => void;
}

const ChatContext = createContext<ChatValue | null>(null);

/** Unread totals: muted conversations add only their mentions to the navigation badge. */
export function chatTotals(conversations: ChatConversation[], mentions: ChatMention[]): ChatTotals {
  const memberIds = new Set(conversations.map((item) => item.id));
  const outside = mentions.filter((item) => item.unread && !memberIds.has(item.conversation.id)).length;
  const unread = conversations.filter((item) => !item.muted).reduce((sum, item) => sum + item.unread, 0);
  const mentionCount = conversations.reduce((sum, item) => sum + item.mentions, 0) + outside;
  const mutedMentions = conversations.filter((item) => item.muted).reduce((sum, item) => sum + item.mentions, 0) + outside;
  return { unread, mentions: mentionCount, badge: unread + mutedMentions };
}

/** Applies a live message to the conversation list without a round trip. */
export function applyIncoming(conversations: ChatConversation[], message: ChatMessage, myId: string, activeId: string | null): ChatConversation[] | null {
  const index = conversations.findIndex((item) => item.id === message.conversationId);
  if (index < 0) return null;
  const counts = message.author.id !== myId && activeId !== message.conversationId;
  const current = conversations[index]!;
  const next: ChatConversation = {
    ...current,
    lastActivityAt: message.createdAt,
    lastMessage: { id: message.id, body: message.body?.slice(0, 140) ?? null, authorId: message.author.id, authorName: message.author.fullName, createdAt: message.createdAt },
    unread: current.unread + (counts ? 1 : 0),
    mentions: current.mentions + (counts && message.mentionedUserIds.includes(myId) ? 1 : 0),
  };
  return [next, ...conversations.filter((_, position) => position !== index)];
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const user = session!.user;
  const isDemo = session!.accessToken.startsWith('demo-');
  const backend = useMemo(() => isDemo ? createDemoChat(demoUsers, user) : remoteChat, [isDemo, user]);
  const [people, setPeople] = useState<ChatPerson[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [mentions, setMentions] = useState<ChatMention[]>([]);
  const [loaded, setLoaded] = useState(false);
  const activeRef = useRef<string | null>(null);
  const listeners = useRef(new Set<(event: ChatEvent) => void>());
  const refreshTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, mentionList] = await Promise.all([backend.conversations(), backend.mentions()]);
      setConversations(list); setMentions(mentionList); setLoaded(true);
    } catch { setLoaded(true); }
  }, [backend]);

  useEffect(() => {
    void refresh();
    backend.people().then(setPeople).catch(() => setPeople([]));
  }, [backend, refresh]);

  const emit = useCallback((event: ChatEvent) => listeners.current.forEach((listener) => listener(event)), []);

  useEffect(() => {
    if (isDemo) return;
    const scheduleRefresh = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => void refresh(), 150);
    };
    const handle = (raw: Event) => {
      const { event, payload } = (raw as CustomEvent<{ event: string; payload: { conversationId?: string; message?: ChatMessage } }>).detail;
      if (event === 'chat:message' && payload.message) {
        const message = payload.message;
        setConversations((current) => {
          const next = applyIncoming(current, message, user.id, activeRef.current);
          if (!next) scheduleRefresh();
          return next ?? current;
        });
        if (message.mentionedUserIds.includes(user.id) && activeRef.current !== message.conversationId) scheduleRefresh();
        emit({ type: 'message', conversationId: message.conversationId, message });
      } else if (event === 'chat:message-updated' && payload.message) {
        emit({ type: 'message-updated', conversationId: payload.message.conversationId, message: payload.message });
        scheduleRefresh();
      } else if (event.startsWith('chat:')) {
        emit({ type: 'changed', conversationId: payload?.conversationId });
        scheduleRefresh();
      } else if (event === 'connect') {
        emit({ type: 'reconnect' });
        scheduleRefresh();
      }
    };
    window.addEventListener('atlas:socket', handle);
    return () => { window.removeEventListener('atlas:socket', handle); if (refreshTimer.current) window.clearTimeout(refreshTimer.current); };
  }, [isDemo, refresh, emit, user.id]);

  const subscribe = useCallback((listener: (event: ChatEvent) => void) => { listeners.current.add(listener); return () => { listeners.current.delete(listener); }; }, []);

  const value = useMemo<ChatValue>(() => ({
    backend, people, conversations, mentions, loaded, refresh, totals: chatTotals(conversations, mentions),
    setActive: (id) => { activeRef.current = id; },
    subscribe,
    notify: emit,
  }), [backend, people, conversations, mentions, loaded, refresh, emit]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export const useChat = () => {
  const value = useContext(ChatContext);
  if (!value) throw new Error('useChat must be used inside ChatProvider');
  return value;
};
