import { AtSign, Bell, BellOff, Hash, MessageSquare, Plus, Search, Settings2, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowseChannelsDialog, ChannelFormDialog, ConfirmDialog, ConversationSettingsDialog, EditMessageDialog, NewMessageDialog, usePeopleByUsername } from '../components/chat/ChatDialogs';
import { Composer, ConversationIcon, MessageItem, MessageText } from '../components/chat/ChatParts';
import { Badge, Button, EmptyState, IconButton, LoadingState, PageHeader, SectionHeader, Surface } from '../components/ui';
import { useAuth } from '../context/AppContext';
import { useChat } from '../context/ChatContext';
import { conversationTitle, type ChatConversation, type ChatMessage } from '../lib/chat';
import { chatErrorMessage } from '../lib/chatErrors';
import { plural, relativeTime } from '../lib/format';

type Selection = { kind: 'conversation'; id: string } | { kind: 'mentions' };
type Dialogs = { type: 'new' } | { type: 'browse' } | { type: 'channel' } | { type: 'settings' } | { type: 'edit'; message: ChatMessage } | { type: 'delete'; message: ChatMessage } | null;

const UNREAD: [string, string, string] = ['непрочитанное', 'непрочитанных', 'непрочитанных'];
const MENTIONS: [string, string, string] = ['упоминание', 'упоминания', 'упоминаний'];
const MEMBERS: [string, string, string] = ['участник', 'участника', 'участников'];
const SELECTED_KEY = 'atlas.chat.selected';

/** Team chat: channels, groups and direct messages with threads and mentions. */
export function MessagesPage() {
  const { session } = useAuth();
  const me = session!.user;
  const chat = useChat();
  const { conversations, totals, mentions, loaded } = chat;
  const [selection, setSelection] = useState<Selection | null>(() => {
    try { const saved = localStorage.getItem(SELECTED_KEY); return saved ? { kind: 'conversation', id: saved } : null; } catch { return null; }
  });
  const [preview, setPreview] = useState<ChatConversation | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const selectedId = selection?.kind === 'conversation' ? selection.id : null;
  const listed = conversations.find((item) => item.id === selectedId);
  const current = listed ?? (preview?.id === selectedId ? preview : null);

  // Fall back to the first conversation, and load a conversation that isn't in my list (a public channel preview).
  useEffect(() => {
    if (!loaded) return;
    if (!selection && conversations[0]) { setSelection({ kind: 'conversation', id: conversations[0].id }); return; }
    if (selectedId && !listed && preview?.id !== selectedId) {
      chat.backend.conversation(selectedId).then(setPreview).catch(() => setSelection(conversations[0] ? { kind: 'conversation', id: conversations[0].id } : null));
    }
  }, [loaded, selection, selectedId, listed, preview, conversations, chat.backend]);

  useEffect(() => {
    try { if (selectedId) localStorage.setItem(SELECTED_KEY, selectedId); } catch { /* storage unavailable */ }
    setThreadId(null);
  }, [selectedId]);

  const open = (id: string) => { setSelection({ kind: 'conversation', id }); setDialog(null); };
  const filtered = conversations.filter((item) => conversationTitle(item, me.id).toLowerCase().includes(query.toLowerCase()));
  const channels = filtered.filter((item) => item.kind === 'CHANNEL');
  const direct = filtered.filter((item) => item.kind !== 'CHANNEL');
  const unreadMentions = mentions.filter((item) => item.unread).length;

  const row = (item: ChatConversation) => <button key={item.id} type="button" className={`${selectedId === item.id ? 'is-active' : ''} ${item.unread ? 'is-unread' : ''}`} onClick={() => open(item.id)} aria-current={selectedId === item.id ? 'true' : undefined}>
    <ConversationIcon conversation={item} myId={me.id} />
    <span><strong>{conversationTitle(item, me.id)}</strong><small>{item.lastMessage ? `${item.lastMessage.authorId === me.id ? 'Вы' : item.lastMessage.authorName.split(' ')[0]}: ${item.lastMessage.body ?? 'сообщение удалено'}` : item.kind === 'CHANNEL' ? item.description ?? 'Нет сообщений' : 'Нет сообщений'}</small></span>
    {item.mentions > 0 ? <Badge tone="danger">@{item.mentions}</Badge> : item.unread > 0 ? <Badge tone={item.muted ? 'neutral' : 'info'}>{item.unread}</Badge> : item.muted ? <BellOff size={13} className="chat-row__muted" aria-label="Без уведомлений" /> : null}
  </button>;

  return <>
    <PageHeader title="Сообщения" description={`${plural(totals.unread, UNREAD)} · ${plural(totals.mentions, MENTIONS)}`} action={<Button icon={Plus} onClick={() => setDialog({ type: 'new' })}>Новое сообщение</Button>} />
    {error && <div className="notice notice--danger" role="alert">{error}<button onClick={() => setError('')}>Закрыть</button></div>}
    <div className={`chat-layout ${threadId ? 'chat-layout--thread' : ''}`}>
      <Surface className="chat-list" aria-label="Разговоры">
        <label className="table-search"><Search size={16} /><input aria-label="Поиск разговоров" placeholder="Поиск" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="chat-list__rows">
          <button type="button" className={selection?.kind === 'mentions' ? 'is-active' : ''} onClick={() => setSelection({ kind: 'mentions' })}>
            <span className="chat-icon"><AtSign size={15} /></span><span><strong>Упоминания</strong><small>Сообщения, где упомянули вас</small></span>{unreadMentions > 0 && <Badge tone="danger">{unreadMentions}</Badge>}
          </button>
          <div className="chat-list__section"><span>Каналы</span><button type="button" className="text-button" onClick={() => setDialog({ type: 'browse' })}>Все каналы</button></div>
          {channels.map(row)}
          <div className="chat-list__section"><span>Личные сообщения</span></div>
          {direct.map(row)}
          {loaded && !direct.length && <p className="chat-list__empty">Напишите коллеге — нажмите «Новое сообщение»</p>}
        </div>
      </Surface>
      {selection?.kind === 'mentions' ? <MentionsView onOpen={open} /> : current ? <ConversationView key={current.id} conversation={current} threadId={threadId} onThread={setThreadId} onSettings={() => setDialog({ type: 'settings' })} onEdit={(message) => setDialog({ type: 'edit', message })} onDelete={(message) => setDialog({ type: 'delete', message })} onError={setError} />
        : <Surface className="chat-main">{loaded ? <EmptyState title="Выберите разговор" description="Каналы, группы и личные сообщения появятся слева" icon={MessageSquare} /> : <LoadingState label="Загружаем разговоры" />}</Surface>}
      {threadId && current && <ThreadPanel key={threadId} conversation={current} rootId={threadId} onClose={() => setThreadId(null)} onEdit={(message) => setDialog({ type: 'edit', message })} onDelete={(message) => setDialog({ type: 'delete', message })} />}
    </div>
    {dialog?.type === 'new' && <NewMessageDialog onClose={() => setDialog(null)} onOpened={(conversation) => open(conversation.id)} />}
    {dialog?.type === 'browse' && <BrowseChannelsDialog onClose={() => setDialog(null)} onCreate={() => setDialog({ type: 'channel' })} onOpen={(channel) => { setPreview(null); open(channel.id); }} />}
    {dialog?.type === 'channel' && <ChannelFormDialog onClose={() => setDialog(null)} onSaved={open} />}
    {dialog?.type === 'settings' && current && <ConversationSettingsDialog conversation={current} onClose={() => { setDialog(null); setPreview(null); }} onLeft={() => { setDialog(null); setPreview(null); setSelection(null); }} />}
    {dialog?.type === 'edit' && <EditMessageDialog message={dialog.message} onClose={() => setDialog(null)} />}
    {dialog?.type === 'delete' && <ConfirmDialog title="Удалить сообщение?" description={dialog.message.author.id === me.id ? 'Вместо текста участники увидят «Сообщение удалено». Ответы в обсуждении останутся.' : `Сообщение ${dialog.message.author.fullName} будет удалено для всех участников канала.`} confirm="Удалить" onClose={() => setDialog(null)} onConfirm={async () => { await chat.backend.remove(dialog.message.id); chat.notify({ type: 'changed' }); setDialog(null); }} />}
  </>;
}

/** Loads a conversation's (or thread's) messages and keeps them live. */
function useLiveMessages(conversationId: string, rootId: string | null) {
  const chat = useChat();
  const [items, setItems] = useState<ChatMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [root, setRoot] = useState<ChatMessage | null>(null);
  const reload = useCallback(async () => {
    if (rootId) { const thread = await chat.backend.replies(rootId); setRoot(thread.root); setItems(thread.replies); return; }
    const page = await chat.backend.messages(conversationId);
    setItems(page.items.slice().reverse()); setHasMore(page.hasMore);
  }, [chat.backend, conversationId, rootId]);
  useEffect(() => { setItems(null); void reload().catch(() => setItems([])); }, [reload]);
  useEffect(() => chat.subscribe((event) => {
    if (event.type === 'reconnect') { void reload(); return; }
    if (event.type === 'changed') { if (!event.conversationId || event.conversationId === conversationId) void reload().catch(() => undefined); return; }
    if (event.conversationId !== conversationId) return;
    const message = event.message;
    if (event.type === 'message') {
      if (rootId ? message.parentId === rootId : !message.parentId) setItems((current) => current && !current.some((item) => item.id === message.id) ? [...current, message] : current);
      if (!rootId && message.parentId) setItems((current) => current?.map((item) => item.id === message.parentId ? { ...item, replyCount: item.replyCount + 1, lastReplyAt: message.createdAt } : item) ?? current);
      if (rootId && message.id === rootId) setRoot(message);
    } else {
      setItems((current) => current?.map((item) => item.id === message.id ? message : item) ?? current);
      if (message.id === rootId) setRoot(message);
    }
  }), [chat, conversationId, rootId, reload]);
  const loadOlder = async () => {
    if (!items?.length) return;
    const page = await chat.backend.messages(conversationId, items[0]!.id);
    setItems([...page.items.slice().reverse(), ...items]); setHasMore(page.hasMore);
  };
  const append = (message: ChatMessage) => setItems((current) => current && !current.some((item) => item.id === message.id) ? [...current, message] : current);
  return { items, hasMore, root, loadOlder, append, reload };
}

function ConversationView({ conversation, threadId, onThread, onSettings, onEdit, onDelete, onError }: {
  conversation: ChatConversation; threadId: string | null; onThread: (id: string | null) => void; onSettings: () => void;
  onEdit: (message: ChatMessage) => void; onDelete: (message: ChatMessage) => void; onError: (message: string) => void;
}) {
  const { session } = useAuth();
  const me = session!.user;
  const chat = useChat();
  const people = usePeopleByUsername(chat.people);
  const { items, hasMore, loadOlder, append } = useLiveMessages(conversation.id, null);
  const end = useRef<HTMLDivElement>(null);
  const isMember = conversation.myRole !== null || conversation.isMember === true;
  const participants = conversation.participants ?? [];
  const inactiveDm = conversation.kind === 'DM' && participants.some((person) => !person.active);
  const title = conversationTitle(conversation, me.id);
  const { backend, refresh, setActive } = chat;

  useEffect(() => { setActive(conversation.id); return () => setActive(null); }, [conversation.id, setActive]);
  // Opening the conversation, and every new message while it is open, marks it read.
  const lastId = items?.at(-1)?.id;
  useEffect(() => {
    if (!items || (!conversation.unread && !conversation.mentions && !lastId)) return;
    void backend.read(conversation.id).then(refresh).catch(() => undefined);
  }, [conversation.id, lastId, Boolean(items)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [lastId]);

  const send = async (body: string) => {
    try { append(await backend.post(conversation.id, body)); await refresh(); } catch (reason) { onError(chatErrorMessage(reason, 'Сообщение не отправлено')); throw reason; }
  };
  const join = async () => { try { await backend.join(conversation.id); await refresh(); } catch (reason) { onError(chatErrorMessage(reason, 'Не удалось вступить в канал')); } };
  const toggleMute = async () => { try { await backend.mute(conversation.id, !conversation.muted); await refresh(); } catch (reason) { onError(chatErrorMessage(reason, 'Настройка не сохранена')); } };
  const canModerate = conversation.kind === 'CHANNEL' && isMember && (conversation.myRole === 'ADMIN' || me.role === 'DIRECTOR');
  const mentionable = conversation.kind === 'CHANNEL' && conversation.visibility === 'PUBLIC' ? chat.people : chat.people.filter((person) => conversation.kind === 'CHANNEL' || participants.some((item) => item.id === person.id));
  const meta = conversation.kind === 'CHANNEL'
    ? `${conversation.visibility === 'PRIVATE' ? 'Закрытый канал' : 'Публичный канал'} · ${plural(conversation.memberCount, MEMBERS)}`
    : conversation.kind === 'GROUP' ? plural(conversation.memberCount, MEMBERS) : participants.find((person) => person.id !== me.id)?.username ? `@${participants.find((person) => person.id !== me.id)!.username}` : '';

  return <Surface className="chat-main" aria-label={`Разговор ${title}`}>
    <header className="chat-main__header">
      <ConversationIcon conversation={conversation} myId={me.id} />
      <div><h2>{title}</h2><span>{meta}{conversation.kind === 'CHANNEL' && conversation.description ? ` · ${conversation.description}` : ''}</span></div>
      {isMember && <IconButton label={conversation.muted ? 'Включить уведомления' : 'Без уведомлений'} icon={conversation.muted ? BellOff : Bell} onClick={() => void toggleMute()} />}
      {conversation.kind !== 'DM' && <IconButton label={conversation.kind === 'CHANNEL' ? 'Настройки канала' : 'Участники группы'} icon={conversation.kind === 'CHANNEL' ? Settings2 : Users} onClick={onSettings} />}
    </header>
    <div className="chat-main__messages" aria-live="polite">
      {hasMore && <button type="button" className="text-button chat-main__older" onClick={() => void loadOlder()}>Показать более ранние</button>}
      {!items ? <LoadingState label="Загружаем сообщения" /> : items.length ? items.map((message) => <MessageItem key={message.id} message={message} people={people} me={me} canModerate={canModerate}
        onReply={isMember && !conversation.archivedAt ? () => onThread(message.id) : undefined} onOpenThread={() => onThread(message.id)}
        onEdit={() => onEdit(message)} onDelete={() => onDelete(message)} />)
        : <EmptyState title="Сообщений пока нет" description={conversation.kind === 'DM' ? `Начните разговор с ${title}` : 'Напишите первое сообщение'} icon={conversation.kind === 'CHANNEL' ? Hash : MessageSquare} />}
      <div ref={end} />
    </div>
    {conversation.archivedAt ? <div className="chat-main__notice">Канал в архиве — только чтение</div>
      : inactiveDm ? <div className="chat-main__notice">Сотрудник деактивирован — переписка доступна только для чтения</div>
      : !isMember ? <div className="chat-main__notice"><span>Вы не участник канала</span><Button variant="secondary" onClick={() => void join()}>Вступить</Button></div>
      : <Composer key={conversation.id} people={mentionable} placeholder={conversation.kind === 'CHANNEL' ? `Написать в #${title}` : `Написать ${title}`} onSend={send} autoFocus={!threadId} />}
  </Surface>;
}

function ThreadPanel({ conversation, rootId, onClose, onEdit, onDelete }: { conversation: ChatConversation; rootId: string; onClose: () => void; onEdit: (message: ChatMessage) => void; onDelete: (message: ChatMessage) => void }) {
  const { session } = useAuth();
  const me = session!.user;
  const chat = useChat();
  const people = usePeopleByUsername(chat.people);
  const { items, root, append } = useLiveMessages(conversation.id, rootId);
  const [error, setError] = useState('');
  const isMember = conversation.myRole !== null;
  const canModerate = conversation.kind === 'CHANNEL' && isMember && (conversation.myRole === 'ADMIN' || me.role === 'DIRECTOR');
  const send = async (body: string) => {
    setError('');
    try { append(await chat.backend.post(conversation.id, body, rootId)); chat.notify({ type: 'changed', conversationId: conversation.id }); await chat.refresh(); } catch (reason) { setError(chatErrorMessage(reason, 'Ответ не отправлен')); throw reason; }
  };
  return <Surface className="chat-thread" aria-label="Обсуждение">
    <SectionHeader title="Обсуждение" meta={items ? <Badge>{items.length}</Badge> : undefined} action={<IconButton label="Закрыть обсуждение" icon={X} onClick={onClose} />} />
    <div className="chat-thread__messages">
      {root && <MessageItem message={root} people={people} me={me} canModerate={canModerate} onEdit={() => onEdit(root)} onDelete={() => onDelete(root)} />}
      {items && items.length > 0 && <div className="chat-thread__divider">{plural(items.length, ['ответ', 'ответа', 'ответов'])}</div>}
      {items?.map((message) => <MessageItem key={message.id} message={message} people={people} me={me} canModerate={canModerate} onEdit={() => onEdit(message)} onDelete={() => onDelete(message)} />)}
    </div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {isMember && !conversation.archivedAt && <Composer people={chat.people} placeholder="Ответить в обсуждении" label="Ответ в обсуждении" onSend={send} autoFocus />}
  </Surface>;
}

function MentionsView({ onOpen }: { onOpen: (conversationId: string) => void }) {
  const { session } = useAuth();
  const me = session!.user;
  const chat = useChat();
  const people = usePeopleByUsername(chat.people);
  useEffect(() => { void chat.refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <Surface className="chat-main" aria-label="Упоминания">
    <header className="chat-main__header"><span className="chat-icon"><AtSign size={15} /></span><div><h2>Упоминания</h2><span>Последние 50 сообщений, где упомянули вас</span></div></header>
    <div className="chat-main__messages">
      {chat.mentions.length ? chat.mentions.map((mention) => <button key={mention.id} type="button" className={`chat-mention ${mention.unread ? 'is-unread' : ''}`} onClick={() => onOpen(mention.conversation.id)}>
        <span className="chat-mention__where">{mention.conversation.kind === 'CHANNEL' ? `# ${mention.conversation.name}` : mention.conversation.name ?? 'Личные сообщения'} · {relativeTime(mention.createdAt)}</span>
        <strong>{mention.author.fullName}</strong>
        <p><MessageText body={mention.body ?? ''} people={people} myUsername={me.username} /></p>
      </button>) : <EmptyState title="Упоминаний нет" description="Когда коллеги отметят вас через @, сообщение появится здесь" icon={AtSign} />}
    </div>
  </Surface>;
}
