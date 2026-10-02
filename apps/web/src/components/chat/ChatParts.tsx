import { Hash, Lock, MessageSquareReply, Pencil, Send, Trash2, Users } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { conversationTitle, mentionQuery, messageParts, type ChatConversation, type ChatMessage, type ChatPerson } from '../../lib/chat';
import { formatDateTime, plural } from '../../lib/format';
import { Avatar, IconButton } from '../ui';

const REPLIES: [string, string, string] = ['ответ', 'ответа', 'ответов'];
const time = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export function ConversationIcon({ conversation, myId }: { conversation: ChatConversation; myId: string }) {
  if (conversation.kind === 'DM') return <Avatar name={conversationTitle(conversation, myId)} size="sm" />;
  const Icon = conversation.kind === 'GROUP' ? Users : conversation.visibility === 'PRIVATE' ? Lock : Hash;
  return <span className="chat-icon"><Icon size={15} aria-hidden="true" /></span>;
}

/** Message text as plain text, links and named mentions; nothing from the message is rendered as HTML. */
export function MessageText({ body, people, myUsername }: { body: string; people: Map<string, ChatPerson>; myUsername: string }) {
  return <>{messageParts(body).map((part, index) => {
    if (part.type === 'link') return <a key={index} href={part.href} target="_blank" rel="noreferrer noopener">{part.href}</a>;
    if (part.type === 'mention') {
      const person = people.get(part.username);
      if (part.username === 'channel') return <span key={index} className="mention mention--all">@канал</span>;
      return <span key={index} className={`mention ${part.username === myUsername ? 'mention--me' : ''}`}>@{person?.fullName ?? part.username}</span>;
    }
    return <span key={index}>{part.value}</span>;
  })}</>;
}

export function MessageItem({ message, people, me, canModerate, onReply, onEdit, onDelete, onOpenThread }: {
  message: ChatMessage; people: Map<string, ChatPerson>; me: { id: string; username: string }; canModerate: boolean;
  onReply?: () => void; onEdit: () => void; onDelete: () => void; onOpenThread?: () => void;
}) {
  const own = message.author.id === me.id;
  const deleted = Boolean(message.deletedAt);
  return <article className={`chat-message ${message.mentionedUserIds.includes(me.id) ? 'chat-message--mentioned' : ''}`} aria-label={`Сообщение ${message.author.fullName}`}>
    <Avatar name={message.author.fullName} src={message.author.avatarUrl ?? undefined} size="sm" />
    <div className="chat-message__main">
      <header><strong>{message.author.fullName}{!message.author.active && <small> · деактивирован</small>}</strong><time dateTime={message.createdAt} title={formatDateTime(message.createdAt)}>{time(message.createdAt)}</time>{message.editedAt && !deleted && <small>изменено</small>}</header>
      <p className={deleted ? 'chat-message__deleted' : ''}>{deleted ? 'Сообщение удалено' : <MessageText body={message.body ?? ''} people={people} myUsername={me.username} />}</p>
      {onOpenThread && message.replyCount > 0 && <button type="button" className="text-button chat-message__thread" onClick={onOpenThread}><MessageSquareReply size={13} />{plural(message.replyCount, REPLIES)}{message.lastReplyAt && <span> · {time(message.lastReplyAt)}</span>}</button>}
    </div>
    {!deleted && (onReply || own || canModerate) && <div className="chat-message__actions">
      {onReply && <IconButton label="Ответить в обсуждении" icon={MessageSquareReply} onClick={onReply} />}
      {own && <IconButton label="Изменить сообщение" icon={Pencil} onClick={onEdit} />}
      {(own || canModerate) && <IconButton label="Удалить сообщение" icon={Trash2} onClick={onDelete} />}
    </div>}
  </article>;
}

/** Text input with Enter to send, Shift+Enter for a new line, and `@` autocomplete from `people`. */
export function Composer({ people, placeholder, onSend, disabled, label = 'Сообщение', autoFocus }: {
  people: ChatPerson[]; placeholder: string; onSend: (body: string) => Promise<void>; disabled?: boolean; label?: string; autoFocus?: boolean;
}) {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const query = mentionQuery(text, caret);
  const suggestions = useMemo(() => {
    if (!query || dismissed) return [];
    const needle = query.query;
    const matches = people.filter((person) => person.username.toLowerCase().startsWith(needle) || person.fullName.toLowerCase().split(' ').some((word) => word.startsWith(needle)));
    return matches.slice(0, 6);
  }, [people, query, dismissed]);

  const insert = (person: ChatPerson) => {
    if (!query) return;
    const next = `${text.slice(0, query.start)}@${person.username} ${text.slice(caret)}`;
    const position = query.start + person.username.length + 2;
    setText(next); setCaret(position); setHighlight(0);
    requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(position, position); });
  };
  const send = async () => {
    const body = text.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    try { await onSend(body); setText(''); setCaret(0); } finally { setSending(false); }
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight((highlight + 1) % suggestions.length); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight((highlight - 1 + suggestions.length) % suggestions.length); return; }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); insert(suggestions[highlight] ?? suggestions[0]!); return; }
      if (event.key === 'Escape') { event.preventDefault(); setDismissed(true); return; }
    }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
  };

  return <div className="chat-composer">
    {suggestions.length > 0 && <ul className="mention-suggestions" role="listbox" aria-label="Упомянуть">{suggestions.map((person, index) => <li key={person.id} role="option" aria-selected={index === highlight}>
      <button type="button" onMouseDown={(event) => { event.preventDefault(); insert(person); }}><Avatar name={person.fullName} size="sm" /><span><strong>{person.fullName}</strong><small>@{person.username}{person.departmentName ? ` · ${person.departmentName}` : ''}</small></span></button>
    </li>)}</ul>}
    <textarea ref={area} aria-label={label} placeholder={placeholder} rows={2} value={text} disabled={disabled} autoFocus={autoFocus} maxLength={4000}
      onChange={(event) => { setText(event.target.value); setCaret(event.target.selectionStart); setDismissed(false); setHighlight(0); }}
      onSelect={(event) => setCaret(event.currentTarget.selectionStart)} onKeyDown={keyDown} />
    <IconButton label="Отправить" icon={Send} className="chat-composer__send" disabled={disabled || sending || !text.trim()} onClick={() => void send()} />
  </div>;
}
